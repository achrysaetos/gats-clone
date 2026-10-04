import type { WebSocket } from 'ws';
import { WORLD, type ModeId } from '../shared/defs.ts';
import { ROTATION } from '../shared/maps.ts';
import { parseClientMsg, type ClientMsg, type GameEvent, type ServerMsg, type Snapshot } from '../shared/protocol.ts';
import { addPlayer, canRespawn, removePlayer, respawn, setInput, step } from '../shared/sim.ts';
import { snapshotFor, wallViews } from '../shared/sim/snapshot.ts';
import { choosePerk } from '../shared/sim/stats.ts';
import { createWorld, rand, type World } from '../shared/sim/world.ts';
import { makeSnapshotEncoder } from '../shared/wire.ts';
import type { Accounts } from './accounts.ts';
import { botName, botThink, newBotMemory, randomLoadout, type BotMemory } from './bots.ts';
import { makeModerator, type Moderator } from './moderation.ts';
import { LIMITS, makeTokenBucket, type Limits } from './limits.ts';
import { uniqueName } from './names.ts';

const TICK_MS = 1000 / WORLD.tickHz;
const CHAT_INTERVAL_MS = 1000;

type Client =
  | { k: 'lobby'; ws: WebSocket }
  | { k: 'joined'; ws: WebSocket; playerId: number; account: string | null; lastChatAt: number; aspect: number; encode: (snap: Snapshot) => string };

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

  function balanceBots() {
    while (world.players.size < limits.minPlayers) {
      const name = uniqueName(botName(new Set(names()), botRand), names(), registered);
      const p = addPlayer(world, name, randomLoadout(botRand));
      bots.set(p.id, newBotMemory(botRand));
    }
    while (world.players.size > limits.minPlayers && bots.size > 0) {
      const red = [...world.players.values()].filter((p) => p.team === 'red').length;
      const larger = red * 2 > world.players.size ? 'red' : 'blue';
      const victim = [...bots.keys()].find((bid) => world.players.get(bid)?.team === larger) ?? [...bots.keys()][0];
      bots.delete(victim);
      removePlayer(world, victim);
    }
  }

  function creditLives(departed?: Extract<Client, { k: 'joined' }>) {
    const accountOf = new Map<number, string>();
    for (const c of departed ? [...joined(), departed] : joined()) if (c.account) accountOf.set(c.playerId, c.account);
    for (const r of world.lifeRecords.splice(0)) {
      const account = accountOf.get(r.id);
      if (account) accounts.credit(account, { kills: r.kills, deaths: r.died ? 1 : 0, score: r.score, games: 0 });
    }
  }

  function handle(client: Client, msg: ClientMsg) {
    if (client.k === 'lobby') {
      if (msg.t !== 'join') return;
      if (joined().length >= limits.humansPerRoom) {
        send(client.ws, { t: 'error', message: 'Room full' });
        client.ws.close(1013, 'room full');
        return;
      }
      const account = msg.token ? accounts.nameForToken(msg.token) : null;
      const takenByAnotherAccount = (n: string) => registered(n) && n.toLowerCase() !== account?.toLowerCase();
      const name = uniqueName(account ?? (moderator.isClean(msg.name) ? msg.name : 'Player'), names(), takenByAnotherAccount);
      const p = addPlayer(world, name, msg.loadout, { kind: 'human' });
      if (account) accounts.credit(account, { kills: 0, deaths: 0, score: 0, games: 1 });
      clients.set(client.ws, { k: 'joined', ws: client.ws, playerId: p.id, account, lastChatAt: -Infinity, aspect: msg.aspect, encode: makeSnapshotEncoder() });
      balanceBots();
      send(client.ws, { t: 'welcome', id: p.id, mode, worldSize: WORLD.size, walls: wallViews(world), account });
      return;
    }
    const id = client.playerId;
    switch (msg.t) {
      case 'join': return;
      case 'view': client.aspect = msg.aspect; return;
      case 'input': setInput(world, id, msg.seq, msg.input, msg.viewAt); return;
      case 'perk': choosePerk(world, id, msg.tier, msg.perk); return;
      case 'respawn': respawn(world, id, msg.loadout); return;
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
    removePlayer(world, c.playerId);
    creditLives(c);
    balanceBots();
  }

  function thinkBots() {
    const walls = wallViews(world);
    for (const [id, mem] of bots) {
      const d = botThink(snapshotFor(world, id), walls, mem, botRand);
      bots.set(id, d.mem);
      setInput(world, id, world.tick, d.input);
      if (d.perk) choosePerk(world, id, d.perk.tier, d.perk.perk);
      if (canRespawn(world, id)) respawn(world, id, randomLoadout(botRand));
    }
  }

  function advance(): GameEvent[] {
    const events: GameEvent[] = [];
    for (let i = 0; i < stepsPerTick; i++) {
      thinkBots();
      step(world, TICK_MS);
      events.push(...world.events);
      creditLives();
    }
    return events;
  }

  balanceBots();

  return {
    id,
    world,
    connect(ws) {
      clients.set(ws, { k: 'lobby', ws });
      const allow = makeTokenBucket(limits.messagesPerSec, limits.messageBurst);
      const joinTimer = setTimeout(() => { if (clients.get(ws)?.k === 'lobby') ws.close(1008, 'join timeout'); }, limits.joinTimeoutMs);
      // A socket can die without a close frame (a dropped network, a proxy that lingers); unanswered pings are the only signal.
      let answeredPing = true;
      ws.on('pong', () => { answeredPing = true; });
      const heartbeat = setInterval(() => {
        if (!answeredPing) { ws.terminate(); return; }
        answeredPing = false;
        ws.ping();
      }, limits.heartbeatMs);
      ws.on('message', (data, isBinary) => {
        if (!allow(Date.now())) { ws.close(1008, 'too many messages'); return; }
        const msg = isBinary ? null : parseClientMsg(data.toString());
        if (!msg) { send(ws, { t: 'error', message: 'Bad message' }); return; }
        const client = clients.get(ws);
        if (client) handle(client, msg);
      });
      ws.on('close', () => { clearTimeout(joinTimer); clearInterval(heartbeat); disconnect(ws); });
      // ws emits 'error' for protocol violations like oversized frames; unhandled, it kills the process.
      ws.on('error', () => ws.terminate());
    },
    tick() {
      const events = advance();
      if (world.wallsVersion !== wallsVersion) {
        wallsVersion = world.wallsVersion;
        const walls = wallViews(world);
        for (const c of joined()) send(c.ws, { t: 'walls', walls });
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
