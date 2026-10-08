/// <reference types="node" />
import assert from 'node:assert/strict';
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join as pathJoin } from 'node:path';
import { test } from 'node:test';
import WebSocket from 'ws';
import { LIMITS, makeWindowGate } from '../src/server/limits.ts';
import { openProfiles, type Profiles } from '../src/server/profiles.ts';
import { createRoom, UNRECORDED_NOTICE } from '../src/server/room.ts';
import { startServer } from '../src/server/main.ts';
import { fakeSocket, PISTOL } from './helpers.ts';

const DAY = 24 * 60 * 60 * 1000;
type Accounts = Parameters<typeof createRoom>[3];
const guestsOnly = { stats: () => null, credit: () => {}, nameForToken: () => null } as unknown as Accounts;

async function roomWith(gate: ReturnType<typeof makeWindowGate>, accounts: Accounts = guestsOnly) {
  const profiles = await openProfiles(await mkdtemp(pathJoin(tmpdir(), 'profile-limit-')));
  const room = createRoom('ffa', 'FFA', 1, accounts, 1, { ...LIMITS, minPlayers: 2 }, undefined, profiles, gate);
  const sockets: ReturnType<typeof fakeSocket>[] = [];
  const join = (name: string, ip: string, token?: string) => {
    const ws = fakeSocket();
    sockets.push(ws);
    room.connect(ws.socket, ip);
    ws.send({ t: 'join', name, loadout: PISTOL, aspect: 1.5, ...(token && { token }) });
    return ws;
  };
  const done = async () => { for (const ws of sockets) ws.close(); room.close(); await profiles.flush(); };
  return { room, profiles, join, done };
}
const noticed = (ws: ReturnType<typeof fakeSocket>) => ws.sent.filter((m) => m.t === 'chat' && m.from === '' && m.text === UNRECORDED_NOTICE).length;
const kept = (profiles: Profiles, names: string[]) => names.filter((n) => profiles.get(n) !== null);

test('the window gate allows one per gap and so many per rolling window, per key', () => {
  const gate = makeWindowGate(30_000, 5, DAY);
  assert.equal(gate.take('a', 0), true);
  assert.equal(gate.take('a', 10_000), false, 'a second within the gap is refused');
  assert.equal(gate.take('b', 10_000), true, 'another address is its own');
  const day = [30_000, 60_000, 90_000, 120_000, 150_000].map((t) => gate.take('a', t));
  assert.deepEqual(day, [true, true, true, true, false], 'five in a day, then no more');
  assert.equal(gate.take('a', DAY - 1), false, 'still the same rolling day');
  assert.equal(gate.take('a', DAY + 1), true, 'the first one has aged out of the window');
});

test('the window gate forgets addresses whose stamps have all aged out', () => {
  const gate = makeWindowGate(30_000, 5, DAY);
  for (let i = 0; i < 1000; i++) gate.take(`10.0.${i >> 8}.${i & 255}`, i);
  assert.equal(gate.size(), 1000);
  gate.take('fresh', DAY + 1000);
  assert.equal(gate.size(), 1, 'only the address that just made one is left');
  assert.equal(gate.take('fresh', DAY + 2000), false, 'refused within the gap');
  assert.equal(gate.size(), 1, 'and a refusal adds nothing');
});

test('six new guest names from one address in a day make only five profiles; the sixth plays unrecorded and is told once', async (t) => {
  const r = await roomWith(makeWindowGate(0, 5, DAY));
  t.after(r.done);
  const names = ['Ann', 'Bea', 'Cal', 'Dot', 'Eli', 'Fay'];
  const sockets = names.map((n) => r.join(n, '198.51.100.7'));
  assert.deepEqual(kept(r.profiles, names), names.slice(0, 5));
  assert.deepEqual(sockets.map(noticed), [0, 0, 0, 0, 0, 1]);
  const welcome = sockets[5]!.sent.find((m) => m.t === 'welcome');
  assert.ok(welcome?.t === 'welcome' && r.room.world.players.has(welcome.id), 'the unrecorded guest still plays');
  for (let i = 0; i < 3; i++) r.room.tick();
  sockets[5]!.close();
  assert.equal(r.profiles.get('Fay'), null, 'nothing is written for them, leaving included');
});

test('two new names within 30 s from one address: only the first gets a profile; another address is unaffected', async (t) => {
  const r = await roomWith(makeWindowGate(30_000, 5, DAY));
  t.after(r.done);
  r.join('Gus', '203.0.113.1');
  const second = r.join('Hal', '203.0.113.1');
  r.join('Ivy', '203.0.113.2');
  assert.deepEqual(kept(r.profiles, ['Gus', 'Hal', 'Ivy']), ['Gus', 'Ivy']);
  assert.equal(noticed(second), 1);
});

test('a guest rejoining under a name that already has a profile still records, limit or not', async (t) => {
  const r = await roomWith(makeWindowGate(30_000, 1, DAY));
  t.after(r.done);
  r.join('Jo', '192.0.2.5').close();
  assert.equal(r.profiles.get('Jo')?.games, 1);
  const again = r.join('Jo', '192.0.2.5');
  assert.equal(r.profiles.get('Jo')?.games, 2, 'the existing profile counts the game');
  assert.equal(noticed(again), 0);
});

test('a signed-in account records whatever the address has used up', async (t) => {
  const accounts = { stats: (n: string) => (n.toLowerCase() === 'kay' ? {} : null), credit: () => {}, nameForToken: (tok: string) => (tok === 'tk' ? 'Kay' : null) } as unknown as Accounts;
  const gate = makeWindowGate(30_000, 1, DAY);
  gate.take('192.0.2.9', Date.now());
  const r = await roomWith(gate, accounts);
  t.after(r.done);
  const ws = r.join('whatever', '192.0.2.9', 'tk');
  assert.equal(r.profiles.get('Kay')?.games, 1);
  assert.equal(noticed(ws), 0);
});

test('over the server, the limit keys on the same address as the socket cap (trusted proxy) and persists nothing for the refused', { timeout: 10_000 }, async () => {
  const dataDir = await mkdtemp(pathJoin(tmpdir(), 'skirmish-newprofiles-'));
  const server = await startServer({ port: 0, dataDir, trustProxy: true, limits: { newProfileGapMs: 0, newProfilesPerDay: 1 } });
  const sockets: WebSocket[] = [];
  const join = (name: string, ip: string) => new Promise<unknown[]>((resolve) => {
    const ws = new WebSocket(`ws://localhost:${server.port}/ws?room=ffa`, { headers: { 'x-forwarded-for': ip } });
    sockets.push(ws);
    const got: unknown[] = [];
    ws.on('error', () => {});
    ws.on('message', (data) => {
      const msg = JSON.parse(String(data)) as { t: string };
      got.push(msg);
      if (msg.t === 'welcome') setTimeout(() => resolve(got), 100);
    });
    ws.once('open', () => ws.send(JSON.stringify({ t: 'join', name, loadout: PISTOL, aspect: 1.5 })));
  });
  try {
    await join('Lou', '198.51.100.20');
    const refused = await join('Max', '198.51.100.20');
    await join('Ned', '198.51.100.21');
    assert.ok(refused.some((m) => (m as { t: string; text?: string }).t === 'chat' && (m as { text: string }).text === UNRECORDED_NOTICE));
  } finally {
    for (const ws of sockets) ws.close();
    await server.close();
  }
  const saved = JSON.parse(await readFile(pathJoin(dataDir, 'profiles.json'), 'utf8')) as Record<string, unknown>;
  assert.deepEqual(Object.keys(saved).sort(), ['lou', 'ned']);
});
