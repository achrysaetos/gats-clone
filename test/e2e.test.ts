import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, test } from 'node:test';
import { WebSocket } from 'ws';
import { WORLD } from '../src/shared/defs.ts';
import { MAPS, ROTATION } from '../src/shared/maps.ts';
import type { ServerMsg, Snapshot } from '../src/shared/protocol.ts';
import { startServer, type RunningServer } from '../src/server/main.ts';

const STEPS_PER_TICK = 8;
const LOADOUT = { weapon: 'assault', armor: 'light', color: 'green' };

let server: RunningServer;
let dataDir: string;
let siteDir: string;
let publicDir: string;
let base: string;

before(async () => {
  dataDir = await mkdtemp(join(tmpdir(), 'skirmish-data-'));
  siteDir = await mkdtemp(join(tmpdir(), 'skirmish-site-'));
  publicDir = join(siteDir, 'public');
  await mkdir(publicDir);
  await writeFile(join(publicDir, 'index.html'), '<!doctype html><title>skirmish-e2e</title>');
  await mkdir(join(publicDir, 'assets'));
  await writeFile(join(publicDir, 'assets', 'tile.0123abcd.webp'), 'RIFF');
  await writeFile(join(publicDir, 'assets', 'manifest.json'), '{}');
  await writeFile(join(siteDir, 'secret.txt'), 'outside public');
  server = await startServer({ port: 0, dataDir, publicDir, stepsPerTick: STEPS_PER_TICK });
  base = `http://localhost:${server.port}`;
});

after(async () => {
  await server.close();
  await rm(dataDir, { recursive: true, force: true });
  await rm(siteDir, { recursive: true, force: true });
});

type Conn = { ws: WebSocket; msgs: ServerMsg[]; waitFor<T extends ServerMsg>(pred: (m: ServerMsg) => m is T, ms?: number, label?: string): Promise<T> };

async function connect(room: string): Promise<Conn> {
  const ws = new WebSocket(`ws://localhost:${server.port}/ws?room=${room}`);
  const msgs: ServerMsg[] = [];
  const waiters = new Set<(closed: boolean) => void>();
  ws.on('message', (data) => {
    msgs.push(JSON.parse(data.toString()) as ServerMsg);
    for (const w of waiters) w(false);
  });
  ws.on('close', () => { for (const w of waiters) w(true); });
  await new Promise((ok, fail) => { ws.once('open', ok); ws.once('error', fail); });
  return {
    ws, msgs,
    waitFor(pred, ms = 5000, label = 'message') {
      return new Promise((ok, fail) => {
        let from = 0;
        const settle = (err: Error | null, m?: ServerMsg) => {
          waiters.delete(check);
          clearTimeout(timer);
          if (err) fail(err); else ok(m as never);
        };
        const check = (closed = false) => {
          for (; from < msgs.length; from++) if (pred(msgs[from])) { settle(null, msgs[from]); return; }
          if (closed) settle(new Error('socket closed while waiting'));
        };
        const timer = setTimeout(() => settle(new Error(`timed out waiting for ${label}`)), ms);
        waiters.add(check);
        check();
      });
    },
  };
}

const isSnap = (m: ServerMsg): m is Snapshot => m.t === 'snap';
const send = (c: Conn, msg: unknown) => c.ws.send(JSON.stringify(msg));
const post = (path: string, body: unknown) =>
  fetch(base + path, { method: 'POST', body: JSON.stringify(body), headers: { 'content-type': 'application/json' } });

test('serves public/ statically without escaping it', async () => {
  const index = await fetch(base + '/');
  assert.equal(index.status, 200);
  assert.match(await index.text(), /skirmish-e2e/);
  assert.equal((await fetch(base + '/..%2fsecret.txt')).status, 404, 'encoded traversal stays inside public/');
  assert.equal((await fetch(base + '/nope.js')).status, 404);
  const hashed = await fetch(base + '/assets/tile.0123abcd.webp');
  assert.equal(hashed.headers.get('content-type'), 'image/webp');
  assert.match(hashed.headers.get('cache-control') ?? '', /immutable/, 'hash-named art is cached for good');
  assert.equal((await fetch(base + '/assets/manifest.json')).headers.get('cache-control'), 'no-cache', 'the manifest naming them is revalidated');
});

test('unknown room rejects the websocket upgrade', async () => {
  const ws = new WebSocket(`ws://localhost:${server.port}/ws?room=zzz`);
  await new Promise<void>((ok) => ws.once('error', () => ok()));
});

test('end to end: accounts, three modes, movement, bot kills, chat, persisted stats', async () => {
  const reg = await post('/api/register', { name: 'Tester', password: 'hunter22' });
  assert.equal(reg.status, 200);
  const { token, name } = (await reg.json()) as { token: string; name: string };
  assert.equal(name, 'Tester');
  assert.equal((await post('/api/register', { name: 'tester', password: 'other123' })).status, 409, 'names are unique');
  assert.equal((await post('/api/login', { name: 'Tester', password: 'wrong-pass' })).status, 401);
  assert.equal((await post('/api/login', { name: 'Tester', password: 'hunter22' })).status, 200);

  const conns: Record<string, Conn> = {};
  for (const [room, mode] of [['ffa', 'FFA'], ['tdm', 'TDM'], ['dom', 'DOM']] as const) {
    const c = await connect(room);
    send(c, { t: 'join', name: 'ignored', loadout: LOADOUT, token });
    const welcome = await c.waitFor((m): m is Extract<ServerMsg, { t: 'welcome' }> => m.t === 'welcome', 5000, 'welcome');
    assert.equal(welcome.mode, mode);
    assert.equal(welcome.worldSize, MAPS[ROTATION[mode][0]].size);
    assert.ok(welcome.walls.length > 0);
    const snap = await c.waitFor(isSnap, 5000, 'first snapshot');
    assert.equal(snap.self.id, welcome.id);
    assert.equal(snap.match.mode, mode);
    assert.ok(snap.players.some((p) => p.id === welcome.id && p.name === 'Tester'), 'token names the player');
    conns[room] = c;
  }

  const servers = (await (await fetch(base + '/api/servers')).json()) as { id: string; mode: string; players: number; humans: number }[];
  assert.deepEqual(servers.map((s) => [s.id, s.mode, s.humans]), [['ffa', 'FFA', 1], ['tdm', 'TDM', 1], ['dom', 'DOM', 1], ['br', 'BR', 0], ['ext', 'EXT', 0]]);
  for (const s of servers) assert.equal(s.players, WORLD.minPlayers, 'bots fill the room to minPlayers');

  const ffa = conns.ffa;
  // At 8x speed the bots, which hunt humans first, can kill the tester before it moves; it respawns the way the death screen would.
  const start = await ffa.waitFor((m): m is Snapshot => {
    if (!isSnap(m)) return false;
    if (!m.self.alive && m.self.respawnIn === 0) send(ffa, { t: 'respawn', loadout: LOADOUT });
    return m.players.some((p) => p.id === m.self.id && p.alive);
  }, 5000, 'tester alive in FFA');
  const me0 = start.players.find((p) => p.id === start.self.id)!;
  const towardCenter = me0.x < MAPS[ROTATION.FFA[0]].size / 2 ? { right: true } : { left: true };
  send(ffa, { t: 'input', seq: 1, input: { up: false, down: false, left: false, right: false, ...towardCenter, angle: 0, fire: false, reload: false, ability: false, aimDist: 0 } });
  const moved = await ffa.waitFor((m): m is Snapshot => {
    if (!isSnap(m) || m.ackSeq < 1) return false;
    if (!m.self.alive && m.self.respawnIn === 0) send(ffa, { t: 'respawn', loadout: LOADOUT });
    const me = m.players.find((p) => p.id === m.self.id);
    return !!me && me.alive && Math.abs(me.x - me0.x) > 5;
  }, 5000, 'tester moved');
  assert.equal(moved.ackSeq, 1);

  await Promise.any(Object.values(conns).map((c) =>
    c.waitFor((m): m is Snapshot => isSnap(m) && m.events.some((e) => e.e === 'kill'), (60_000 / STEPS_PER_TICK) + 2000, 'a bot kill')));

  const tdm = conns.tdm;
  send(tdm, { t: 'chat', text: '  hello team  ' });
  send(tdm, { t: 'chat', text: 'spam' });
  const chat = await tdm.waitFor((m): m is Extract<ServerMsg, { t: 'chat' }> => m.t === 'chat', 5000, 'chat echo');
  assert.equal(chat.from, 'Tester');
  assert.equal(chat.text, 'hello team');
  assert.ok(chat.team === 'red' || chat.team === 'blue', 'team echoed in TDM');
  await tdm.waitFor((m): m is Extract<ServerMsg, { t: 'error' }> => m.t === 'error' && m.message === 'Slow down', 5000, 'Slow down');
  assert.ok(!tdm.msgs.some((m) => m.t === 'chat' && m.text === 'spam'), 'rate-limited chat not broadcast');

  send(ffa, { t: 'input', seq: 'nope' });
  ffa.ws.send('{not json');
  await ffa.waitFor((m): m is Extract<ServerMsg, { t: 'error' }> => m.t === 'error' && m.message === 'Bad message', 5000, 'Bad message');

  for (const c of Object.values(conns)) c.ws.close();
  await waitUntil(async () => {
    const s = (await (await fetch(base + '/api/servers')).json()) as { humans: number }[];
    return s.every((r) => r.humans === 0);
  });

  const stats = (await (await fetch(base + '/api/stats/Tester')).json()) as { name: string; games: number; kills: number; deaths: number; score: number; best: number };
  assert.equal(stats.name, 'Tester');
  assert.equal(stats.games, 3);
  assert.ok(stats.best <= stats.score);
  const board = (await (await fetch(base + '/api/leaderboard')).json()) as { name: string }[];
  assert.deepEqual(board.map((r) => r.name), ['Tester']);
  assert.equal((await fetch(base + '/api/stats/nobody')).status, 404);

  await server.close();
  const onDisk = JSON.parse(await readFile(join(dataDir, 'accounts.json'), 'utf8')) as Record<string, { stats: unknown; hash: string }>;
  assert.deepEqual(onDisk.tester.stats, { kills: stats.kills, deaths: stats.deaths, score: stats.score, games: 3, best: stats.best });
  assert.ok(!JSON.stringify(onDisk).includes('hunter22'), 'password not stored in plain text');

  server = await startServer({ port: 0, dataDir, publicDir, stepsPerTick: STEPS_PER_TICK });
  base = `http://localhost:${server.port}`;
  assert.equal((await post('/api/login', { name: 'Tester', password: 'hunter22' })).status, 200, 'account survives restart');
  assert.equal(((await (await fetch(base + '/api/stats/Tester')).json()) as { games: number }).games, 3);
});

test('display names are unique per room and registered names belong to their signed-in owners', async () => {
  const reg = await post('/api/register', { name: 'Owner', password: 'owner-pass' });
  const { token } = (await reg.json()) as { token: string };
  const joinAs = async (name: string, tok?: string) => {
    const c = await connect('ffa');
    send(c, { t: 'join', name, loadout: LOADOUT, token: tok });
    const snap = await c.waitFor((m): m is Snapshot => isSnap(m) && m.players.some((p) => p.id === m.self.id));
    return { c, snap, name: snap.players.find((p) => p.id === snap.self.id)!.name };
  };
  const impostor = await joinAs('owner');
  assert.equal(impostor.name, 'owner2', 'a guest cannot take a registered name, in any letter case');
  const owner = await joinAs('ignored', token);
  assert.equal(owner.name, 'Owner', 'the signed-in owner keeps the name');
  const bot = owner.snap.leaderboard.find((r) => r.name !== impostor.name && r.name !== owner.name)!;
  const copycat = await joinAs(bot.name.toUpperCase());
  assert.equal(copycat.name, `${bot.name.toUpperCase()}2`, 'a guest cannot impersonate a bot');
  const alex1 = await joinAs('Alex');
  const alex2 = await joinAs('Alex');
  assert.deepEqual([alex1.name, alex2.name], ['Alex', 'Alex2'], 'two guests named Alex get distinct names');
  const board = alex2.snap.leaderboard;
  assert.equal(new Set(board.map((r) => r.name.toLowerCase())).size, board.length, 'no two leaderboard rows share a name');
  for (const j of [impostor, owner, alex1, alex2, copycat]) j.c.ws.close();
});

async function waitUntil(cond: () => Promise<boolean>, ms = 3000) {
  const end = Date.now() + ms;
  while (!(await cond())) {
    if (Date.now() > end) throw new Error('condition not met');
    await new Promise((r) => setTimeout(r, 50));
  }
}
