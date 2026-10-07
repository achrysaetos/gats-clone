import type { WebSocket } from 'ws';
import { CAREER_PAY, CAREER_TIERS, COLOR_IDS, GUN_IDS, GUNS, ROYALE, WORLD, ZOM, type GunId, type MedalId, type ModeId, type PlayerKind, type WeaponId } from '../shared/defs.ts';
import { MAPS, ROTATION } from '../shared/maps.ts';
import { parseClientMsg, type ClientMsg, type GameEvent, type Loadout, type ServerMsg, type Snapshot, type Team } from '../shared/protocol.ts';
import { addPlayer, removePlayer, respawn, setInput, step } from '../shared/sim.ts';
import { rewindCapFor } from '../shared/sim/combat.ts';
import { benchUntilNextMatch, redeploysOpen, seatFor, takeSeat } from '../shared/sim/royale.ts';
import { build, demolish, toggleReady } from '../shared/sim/run.ts';
import { snapshotFor, wallViews } from '../shared/sim/snapshot.ts';
import { addScore, choosePick } from '../shared/sim/stats.ts';
import { MODES } from '../shared/sim/modes.ts';
import { createWorld, rand, type World } from '../shared/sim/world.ts';
import { makeSnapshotEncoder } from '../shared/wire.ts';
import type { Accounts } from './accounts.ts';
import { NO_PROFILES, type Profiles } from './profiles.ts';
import { botName, botSeats, newBotMemory, randomLoadout, type BotMemory } from './bots.ts';
import { thinkBots } from './bot/tick.ts';
import { enqueueInput, newInputQueue, takeInput, type InputQueue } from './inputs.ts';
import { makeModerator, type Moderator } from './moderation.ts';
import { LIMITS, makeTokenBucket, type Limits } from './limits.ts';
import { uniqueName } from './names.ts';

const TICK_MS = 1000 / WORLD.tickHz;
const CHAT_INTERVAL_MS = 1000;
const RTT_SAMPLES = 5;
/**
 * Humans carry more health than bots, so a side short of humans gets this many bots for each one it lacks.
 * Measured when humans carried triple health, over 24 seeded TDM rounds with bot-driven humans: 1v0, 2v0, 0v2, 3v0 and 2v1 each land between a third and two thirds of wins; at 2.5 one split went 88% to the humans and at 2 another went 92%.
 */
const BOTS_PER_HUMAN = 3;

type Client =
  | { k: 'lobby'; ws: WebSocket }
  | { k: 'joined'; ws: WebSocket; playerId: number; account: string | null; lastChatAt: number; aspect: number; encode: (snap: Snapshot) => string; inputs: InputQueue };

export type RoomInfo = { id: string; mode: ModeId; players: number; humans: number };

export type Room = {
  id: string;
  world: World;
  connect(ws: WebSocket): void;
  tick(): void;
  info(): RoomInfo;
  close(): void;
};

/** A kill event names the gun by its label; its class credits the weapon mastery tracks. */
const GUN_BY_NAME = new Map<string, GunId>(GUN_IDS.map((g) => [GUNS[g].name, g]));

export function createRoom(id: string, mode: ModeId, seed: number, accounts: Accounts, stepsPerTick = 1, limits: Limits = LIMITS, moderator: Moderator = makeModerator(), profiles: Profiles = NO_PROFILES): Room {
  const world = createWorld(mode, seed, ROTATION[mode][0]);
  const botRand = () => rand(world);
  const bots = new Map<number, BotMemory>();
  const clients = new Map<WebSocket, Client>();
  let wallsVersion = world.wallsVersion;

  const send = (ws: WebSocket, msg: ServerMsg) => { if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(msg)); };
  const joined = () => [...clients.values()].filter((c): c is Extract<Client, { k: 'joined' }> => c.k === 'joined');
  const names = () => [...world.players.values()].map((pl) => pl.name);
  const registered = (name: string) => accounts.stats(name) !== null;

  const humanCap = mode === 'ZOM' ? ZOM.squadSize : limits.humansPerRoom;

  function botTargets(): [Team, number][] {
    const humans = (team: Team) => [...world.players.values()].filter((p) => p.kind === 'human' && p.team === team).length;
    if (mode === 'FFA') return [[null, Math.max(0, limits.minPlayers - humans(null))]];
    if (mode === 'ZOM') return [['red', Math.max(0, ZOM.squadSize - humans('red'))]];
    if (mode === 'BR') return COLOR_IDS.map((team) => [team, Math.max(0, ROYALE.squadSize - humans(team))]);
    const seats = botSeats({ red: humans('red'), blue: humans('blue') }, limits.minPlayers, BOTS_PER_HUMAN, limits.minPlayers);
    return [['red', seats.red], ['blue', seats.blue]];
  }

  function addBot(team: Team) {
    const name = uniqueName(botName(new Set(names()), botRand), names(), registered);
    const p = addPlayer(world, name, randomLoadout(botRand), { team });
    bots.set(p.id, newBotMemory(botRand));
    return p;
  }

  const seatOpen = (team: Team) => !world.royale || (redeploysOpen(world.royale) && world.match.k === 'playing' && (team === null || !world.royale.out.includes(team)));

  function balanceBots() {
    for (const [team, want] of botTargets()) {
      const mine = [...bots.keys()].filter((id) => world.players.get(id)?.team === team);
      for (const id of mine.slice(want)) {
        bots.delete(id);
        removePlayer(world, id);
      }
      if (seatOpen(team)) for (let i = mine.length; i < want; i++) addBot(team);
    }
  }

  /**
   * An account plays under its own name: a bot, or a guest seated before the name was registered, holding it is renamed.
   * A second session of the same account keeps the suffix `uniqueName` gives it, and its play still goes to the account.
   */
  function freeName(account: string) {
    const holder = [...world.players.values()].find((pl) => pl.name.toLowerCase() === account.toLowerCase());
    if (!holder) return;
    const signedIn = joined().find((c) => c.playerId === holder.id)?.account;
    if (signedIn?.toLowerCase() === account.toLowerCase()) return;
    holder.name = uniqueName(holder.name, names(), registered);
  }

  function seatHuman(name: string, loadout: Loadout) {
    const seat = seatFor(world);
    const p = addPlayer(world, name, loadout, { kind: 'human', team: seat?.team ?? null, ...(seat && { at: seat }) });
    if (!seat) { benchUntilNextMatch(p); return p; }
    takeSeat(world, p, seat);
    bots.delete(seat.id);
    removePlayer(world, seat.id);
    return p;
  }

  /** Humans split evenly first, so a lone pair lands on opposite sides; balanceBots then evens the sides out with bots. */
  function teamForHuman(): Team {
    if (mode === 'FFA' || mode === 'ZOM') return MODES[mode].assignTeam(world);
    const count = (team: Team, kind?: PlayerKind) => [...world.players.values()].filter((p) => p.team === team && (kind === undefined || p.kind === kind)).length;
    const redHumans = count('red', 'human'), blueHumans = count('blue', 'human');
    if (redHumans !== blueHumans) return redHumans < blueHumans ? 'red' : 'blue';
    return count('red') <= count('blue') ? 'red' : 'blue';
  }

  /** Where each human stood last tick and how far they have walked since their profile last heard, for the Marathon track. */
  const walked = new Map<number, { x: number; y: number; px: number }>();
  const WALK_FLUSH_PX = 2000;
  /**
   * Whose profile a human's play goes to: a signed-in player's account, whatever name they are seated under, or a guest's
   * own name, unless that name has since been registered by someone else, which a guest seated before the registration
   * still holds; such a guest keeps no profile.
   */
  function profileKey(c: Extract<Client, { k: 'joined' }>, name: string): string | null {
    return c.account ?? (registered(name) ? null : name);
  }
  /** Folds a change into a human's profile, and pays, announces and puts on any lifetime medal it earned. */
  function profile(playerId: number, delta: Parameters<Profiles['record']>[1]) {
    const p = world.players.get(playerId);
    const c = joined().find((j) => j.playerId === playerId);
    const name = c && p ? profileKey(c, p.name) : null;
    if (!name) return;
    const earned = profiles.record(name, delta);
    for (const badge of earned) {
      const score = CAREER_PAY[CAREER_TIERS[badge.tier]!];
      if (p) addScore(world, p, score);
      if (c) send(c.ws, { t: 'badge', badge, score });
    }
    if (p && earned.length) p.badge = profiles.featured(name);
  }

  function creditLives(departed?: Extract<Client, { k: 'joined' }>) {
    const accountOf = new Map<number, string>();
    for (const c of departed ? [...joined(), departed] : joined()) if (c.account) accountOf.set(c.playerId, c.account);
    for (const r of world.lifeRecords.splice(0)) {
      const account = accountOf.get(r.id);
      if (account) accounts.credit(account, { kills: r.kills, deaths: r.died ? 1 : 0, score: r.score, games: 0 });
    }
  }

  /**
   * Each human's kills, deaths, medals and ground covered this step go to their profile as they happen, so a lifetime
   * medal lands the moment it is earned rather than when the life ends.
   */
  function creditProfiles(events: readonly GameEvent[]) {
    const deltas = new Map<number, { kills: number; deaths: number; medals: MedalId[]; weaponKills: WeaponId[] }>();
    const delta = (id: number) => {
      let d = deltas.get(id);
      if (!d) deltas.set(id, (d = { kills: 0, deaths: 0, medals: [], weaponKills: [] }));
      return d;
    };
    for (const e of events) {
      if (e.e === 'medal') delta(e.id).medals.push(e.medal);
      if (e.e === 'kill' && e.killerId !== null && e.killerId !== e.victimId) {
        delta(e.killerId).kills++;
        const gun = GUN_BY_NAME.get(e.weapon);
        if (gun) delta(e.killerId).weaponKills.push(GUNS[gun].base);
      }
      if (e.e === 'kill' && !e.knock) delta(e.victimId).deaths++;
    }
    for (const c of joined()) {
      const p = world.players.get(c.playerId);
      if (!p) continue;
      const d = deltas.get(c.playerId);
      if (d) profile(p.id, { ...d, streak: p.lifeKills });
      const w = walked.get(p.id);
      const step = w ? Math.hypot(p.x - w.x, p.y - w.y) : 0;
      // A respawn's jump is not a walk.
      const px = (w?.px ?? 0) + (p.life.k === 'alive' && step < WORLD.baseSpeed ? step : 0);
      if (px >= WALK_FLUSH_PX) { profile(p.id, { distance: px }); walked.set(p.id, { x: p.x, y: p.y, px: 0 }); }
      else walked.set(p.id, { x: p.x, y: p.y, px });
    }
  }

  function handle(client: Client, msg: ClientMsg, rewindCapMs: number) {
    if (client.k === 'lobby') {
      if (msg.t !== 'join') return;
      if (joined().length >= humanCap) {
        send(client.ws, { t: 'error', message: 'Room full' });
        client.ws.close(1013, 'room full');
        return;
      }
      const account = msg.token ? accounts.nameForToken(msg.token) : null;
      if (account) freeName(account);
      const takenByAnotherAccount = (n: string) => registered(n) && n.toLowerCase() !== account?.toLowerCase();
      const name = uniqueName(account ?? (moderator.isClean(msg.name) ? msg.name : 'Player'), names(), takenByAnotherAccount);
      const p = mode === 'BR' ? seatHuman(name, msg.loadout) : addPlayer(world, name, msg.loadout, { kind: 'human', team: teamForHuman() });
      // Sitting out the rest of the night means leaving and rejoining cannot get a downed or bled-out player up early.
      if (world.run?.phase.k === 'night') p.life = { k: 'dead', respawnAt: Infinity };
      if (account) accounts.credit(account, { kills: 0, deaths: 0, score: 0, games: 1 });
      const joinedClient: Extract<Client, { k: 'joined' }> = { k: 'joined', ws: client.ws, playerId: p.id, account, lastChatAt: -Infinity, aspect: msg.aspect, encode: makeSnapshotEncoder(), inputs: newInputQueue() };
      const key = profileKey(joinedClient, name);
      p.badge = key ? profiles.featured(key) : null;
      clients.set(client.ws, joinedClient);
      balanceBots();
      send(client.ws, { t: 'welcome', id: p.id, mode, worldSize: MAPS[world.map].size, walls: wallViews(world), account });
      profile(p.id, { games: 1 });
      return;
    }
    const id = client.playerId;
    switch (msg.t) {
      case 'join': return;
      case 'view': client.aspect = msg.aspect; return;
      case 'input': enqueueInput(client.inputs, { seq: msg.seq, input: msg.input, viewAt: msg.viewAt, rewindCapMs, arrivedTick: world.tick }); return;
      case 'pick': choosePick(world, id, msg.level, msg.option); return;
      case 'respawn': respawn(world, id, msg.loadout); return;
      case 'build': build(world, id, msg.kind, msg.cx, msg.cy); return;
      case 'demolish': demolish(world, id, msg.cx, msg.cy); return;
      case 'ready': toggleReady(world, id); return;
      case 'chat': {
        const now = Date.now();
        if (now - client.lastChatAt < CHAT_INTERVAL_MS) { send(client.ws, { t: 'error', message: 'Slow down' }); return; }
        client.lastChatAt = now;
        const p = world.players.get(id);
        if (!p) return;
        const text = moderator.mask(msg.text);
        for (const c of joined()) send(c.ws, { t: 'chat', from: p.name, text, team: p.team });
        return;
      }
    }
  }

  function disconnect(ws: WebSocket) {
    const c = clients.get(ws);
    clients.delete(ws);
    if (c?.k !== 'joined') return;
    const left = world.players.get(c.playerId);
    if (mode === 'BR' && left?.team && seatOpen(left.team)) takeSeat(world, addBot(left.team), left);
    const walk = walked.get(c.playerId);
    const key = left ? profileKey(c, left.name) : null;
    if (key && walk?.px) profiles.record(key, { distance: walk.px });
    walked.delete(c.playerId);
    removePlayer(world, c.playerId);
    creditLives(c);
    balanceBots();
  }

  function applyInputs() {
    for (const c of joined()) {
      const next = takeInput(c.inputs, world.tick);
      if (next) setInput(world, c.playerId, next.seq, next.input, next.viewAt, next.rewindCapMs);
    }
  }

  function advance(): GameEvent[] {
    const events: GameEvent[] = [];
    for (let i = 0; i < stepsPerTick; i++) {
      applyInputs();
      thinkBots(world, bots, botRand);
      step(world, TICK_MS);
      events.push(...world.events);
      creditProfiles(world.events);
      creditLives();
    }
    return events;
  }

  balanceBots();
  let seatedRoyale = world.royale;

  return {
    id,
    world,
    connect(ws) {
      clients.set(ws, { k: 'lobby', ws });
      const allow = makeTokenBucket(limits.messagesPerSec, limits.messageBurst);
      const joinTimer = setTimeout(() => { if (clients.get(ws)?.k === 'lobby') ws.close(1008, 'join timeout'); }, limits.joinTimeoutMs);
      // A socket can die without a close frame (a dropped network, a proxy that lingers); unanswered pings are the only signal.
      let answeredPing = true;
      // The worst of the last few round trips, so ordinary jitter between pings does not shrink the rewind a shot needs.
      let rtts: number[] = [];
      let pinged: { id: number; at: number } | null = null;
      let pingId = 0;
      const ping = () => {
        pinged = { id: ++pingId, at: Date.now() };
        ws.ping(String(pinged.id));
      };
      ws.on('pong', (data) => {
        answeredPing = true;
        if (pinged === null || String(data) !== String(pinged.id)) return;
        rtts = [...rtts.slice(1 - RTT_SAMPLES), Date.now() - pinged.at];
        pinged = null;
      });
      const heartbeat = setInterval(() => {
        if (!answeredPing) { ws.terminate(); return; }
        answeredPing = false;
        ping();
      }, limits.heartbeatMs);
      const rttTimer = setInterval(ping, limits.rttPingMs);
      ws.on('message', (data, isBinary) => {
        if (!allow(Date.now())) { ws.close(1008, 'too many messages'); return; }
        const msg = isBinary ? null : parseClientMsg(data.toString());
        if (!msg) { send(ws, { t: 'error', message: 'Bad message' }); return; }
        const client = clients.get(ws);
        if (client) handle(client, msg, rewindCapFor(rtts.length > 0 ? Math.max(...rtts) : null));
      });
      ws.on('close', () => { clearTimeout(joinTimer); clearInterval(heartbeat); clearInterval(rttTimer); disconnect(ws); });
      // ws emits 'error' for protocol violations like oversized frames; unhandled, it kills the process.
      ws.on('error', () => ws.terminate());
    },
    tick() {
      // A room nobody is playing in stands still: its bots would otherwise burn the server's whole CPU share around the clock.
      if (joined().length === 0) return;
      const events = advance();
      if (world.royale !== seatedRoyale) {
        seatedRoyale = world.royale;
        balanceBots();
      }
      if (world.wallsVersion !== wallsVersion) {
        wallsVersion = world.wallsVersion;
        const walls = wallViews(world);
        for (const c of joined()) send(c.ws, { t: 'walls', worldSize: MAPS[world.map].size, walls });
      }
      for (const c of joined()) if (c.ws.readyState === c.ws.OPEN) c.ws.send(c.encode(snapshotFor(world, c.playerId, events, c.aspect)));
    },
    info() {
      return { id, mode, players: world.players.size, humans: joined().length };
    },
    close() {
      for (const ws of clients.keys()) ws.close();
    },
  };
}
