import type { WebSocket } from 'ws';
import { COLOR_IDS, ROYALE, WORLD, ZOM, type ModeId, type PlayerKind } from '../shared/defs.ts';
import { MAPS, ROTATION } from '../shared/maps.ts';
import { parseClientMsg, type ClientMsg, type GameEvent, type Loadout, type ServerMsg, type Snapshot, type Team } from '../shared/protocol.ts';
import { addPlayer, removePlayer, respawn, setInput, step } from '../shared/sim.ts';
import { rewindCapFor } from '../shared/sim/combat.ts';
import { benchUntilNextMatch, redeploysOpen, seatFor, takeSeat } from '../shared/sim/royale.ts';
import { build, demolish, toggleReady } from '../shared/sim/run.ts';
import { snapshotFor, wallViews } from '../shared/sim/snapshot.ts';
import { choosePick } from '../shared/sim/stats.ts';
import { MODES } from '../shared/sim/modes.ts';
import { createWorld, rand, type World } from '../shared/sim/world.ts';
import { makeSnapshotEncoder } from '../shared/wire.ts';
import type { Accounts } from './accounts.ts';
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

export function createRoom(id: string, mode: ModeId, seed: number, accounts: Accounts, stepsPerTick = 1, limits: Limits = LIMITS, moderator: Moderator = makeModerator()): Room {
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

  /** A Last Squad seat is filled mid-match only while redeploys are open and its squad is still in. */
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

  /** A joiner takes a bot's seat in the squad with fewest humans while redeploys are open, and otherwise watches until the next match. */
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

  function creditLives(departed?: Extract<Client, { k: 'joined' }>) {
    const accountOf = new Map<number, string>();
    for (const c of departed ? [...joined(), departed] : joined()) if (c.account) accountOf.set(c.playerId, c.account);
    for (const r of world.lifeRecords.splice(0)) {
      const account = accountOf.get(r.id);
      if (account) accounts.credit(account, { kills: r.kills, deaths: r.died ? 1 : 0, score: r.score, games: 0 });
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
      const takenByAnotherAccount = (n: string) => registered(n) && n.toLowerCase() !== account?.toLowerCase();
      const name = uniqueName(account ?? (moderator.isClean(msg.name) ? msg.name : 'Player'), names(), takenByAnotherAccount);
      const p = mode === 'BR' ? seatHuman(name, msg.loadout) : addPlayer(world, name, msg.loadout, { kind: 'human', team: teamForHuman() });
      // Sitting out the rest of the night means leaving and rejoining cannot get a downed or bled-out player up early.
      if (world.run?.phase.k === 'night') p.life = { k: 'dead', respawnAt: Infinity };
      if (account) accounts.credit(account, { kills: 0, deaths: 0, score: 0, games: 1 });
      clients.set(client.ws, { k: 'joined', ws: client.ws, playerId: p.id, account, lastChatAt: -Infinity, aspect: msg.aspect, encode: makeSnapshotEncoder(), inputs: newInputQueue() });
      balanceBots();
      send(client.ws, { t: 'welcome', id: p.id, mode, worldSize: MAPS[world.map].size, walls: wallViews(world), account });
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
      creditLives();
    }
    return events;
  }

  balanceBots();
  let royale = world.royale;

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
      // A new Last Squad match seats last match's onlookers, so the squads' bots are trimmed and topped up again.
      if (world.royale !== royale) {
        royale = world.royale;
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
