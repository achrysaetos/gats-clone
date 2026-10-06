import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join as joinPath } from 'node:path';
import { after, before, test } from 'node:test';
import { WebSocket } from 'ws';
import { ZOM } from '../src/shared/defs.ts';
import type { ServerMsg, Snapshot } from '../src/shared/protocol.ts';
import { startServer, type RunningServer } from '../src/server/main.ts';

const LOADOUT = { weapon: 'assault', armor: 'light', color: 'green' };
const IDLE_MS = 1500;
const opened: string[] = [];

let server: RunningServer;
let dataDir: string;
let base: string;

before(async () => {
  dataDir = await mkdtemp(joinPath(tmpdir(), 'skirmish-squads-'));
  server = await startServer({ port: 0, dataDir, limits: { squadRooms: 2, squadsPerMin: 3, squadIdleMs: IDLE_MS } });
  base = `http://localhost:${server.port}`;
});

after(async () => {
  await server.close();
  await rm(dataDir, { recursive: true, force: true });
});

type Conn = { ws: WebSocket; msgs: ServerMsg[]; next(pred: (m: ServerMsg) => boolean): Promise<ServerMsg> };

async function join(room: string, name: string): Promise<Conn> {
  const ws = new WebSocket(`ws://localhost:${server.port}/ws?room=${room}`);
  const msgs: ServerMsg[] = [];
  ws.on('message', (data) => msgs.push(JSON.parse(data.toString()) as ServerMsg));
  await new Promise((ok, fail) => { ws.once('open', ok); ws.once('error', fail); });
  ws.send(JSON.stringify({ t: 'join', name, loadout: LOADOUT, aspect: 1.6 }));
  const next = async (pred: (m: ServerMsg) => boolean) => {
    for (let i = 0; i < 200; i++) {
      const m = msgs.find(pred);
      if (m) return m;
      await new Promise((ok) => setTimeout(ok, 10));
    }
    throw new Error('timed out');
  };
  await next((m) => m.t === 'welcome' || m.t === 'error');
  return { ws, msgs, next };
}

const closeAll = async (conns: Conn[]) => {
  await Promise.all(conns.map((c) => new Promise((ok) => {
    if (c.ws.readyState === c.ws.CLOSED) return ok(null);
    c.ws.once('close', ok);
    c.ws.close();
  })));
};
const squad = () => fetch(base + '/api/squads', { method: 'POST' });
const kinds = (code: string) => [...server.rooms.get(code)!.world.players.values()].map((p) => p.kind).sort();

test('squads: a code opens a private zombies room, humans take bots\' seats up to four, and the cap and rate limit hold', async () => {
  const res = await squad();
  assert.equal(res.status, 200);
  const { room } = (await res.json()) as { room: string };
  assert.match(room, /^z-[a-z2-7]{6}$/);
  assert.deepEqual(kinds(room), ['bot', 'bot', 'bot', 'bot'], 'bots fill an empty squad');
  const listed = (await (await fetch(base + '/api/servers')).json()) as { id: string }[];
  assert.deepEqual(listed.map((s) => s.id), ['ffa', 'tdm', 'dom', 'br'], 'squads stay off the server list');

  const first = await join(room, 'Ann');
  opened.push(room);
  const welcome = first.msgs.find((m) => m.t === 'welcome');
  assert.equal(welcome?.t === 'welcome' && welcome.mode, 'ZOM');
  const snap = (await first.next((m) => m.t === 'snap' && !!(m as Snapshot).run)) as Snapshot;
  assert.equal(snap.run?.phase, 'day');
  assert.deepEqual(kinds(room), ['bot', 'bot', 'bot', 'human']);
  const all = [first];
  for (const name of ['Bo', 'Cy', 'Di']) all.push(await join(room, name));
  assert.deepEqual(kinds(room), ['human', 'human', 'human', 'human'], 'four humans and no bots');
  assert.equal(new Set([...server.rooms.get(room)!.world.players.values()].map((p) => p.team)).size, 1, 'one team');
  const fifth = await join(room, 'Ed');
  assert.ok(fifth.msgs.some((m) => m.t === 'error' && m.message === 'Room full'));

  const second = await squad();
  assert.equal(second.status, 200, 'a second squad fits under the cap');
  opened.push(((await second.json()) as { room: string }).room);
  assert.equal((await squad()).status, 503, 'a third does not');
  assert.equal((await squad()).status, 429, 'and one address cannot keep asking');
  await closeAll([...all, fifth]);
});

test('squads: a wall built over the socket shows up in the squad\'s snapshots', async () => {
  const room = opened[0]!;
  const p = await join(room, 'Fay');
  const me = p.msgs.find((m) => m.t === 'welcome');
  const self = me?.t === 'welcome' ? server.rooms.get(room)!.world.players.get(me.id)! : null;
  assert.ok(self);
  const dx = self.x - 1500, dy = self.y - 1500;
  const out = Math.abs(dx) > Math.abs(dy) ? [Math.sign(dx) * 2, 0] : [0, Math.sign(dy) * 2];
  const cx = Math.floor(self.x / ZOM.cell) + out[0]!, cy = Math.floor(self.y / ZOM.cell) + out[1]!;
  p.ws.send(JSON.stringify({ t: 'build', kind: 'wall', cx, cy }));
  const built = (await p.next((m) => m.t === 'snap' && !!(m as Snapshot).buildings?.some((b) => b.kind === 'wall'))) as Snapshot;
  assert.deepEqual(built.buildings?.filter((b) => b.kind === 'wall').map((b) => [b.cx, b.cy]), [[cx, cy]]);
  await closeAll([p]);
});

test('squads: a room nobody is in closes after the idle time', async () => {
  assert.ok(server.rooms.has(opened[0]!), 'the room just left is still open');
  await new Promise((ok) => setTimeout(ok, IDLE_MS + 300));
  assert.deepEqual(opened.filter((id) => server.rooms.has(id)), []);
  const ws = new WebSocket(`ws://localhost:${server.port}/ws?room=${opened[0]}`);
  await new Promise<void>((ok) => ws.once('error', () => ok()));
});
