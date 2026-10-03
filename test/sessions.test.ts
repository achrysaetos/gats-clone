import assert from 'node:assert/strict';
import { mkdtemp, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { WebSocket } from 'ws';
import { startServer, type ServerOptions } from '../src/server/main.ts';
import type { ServerMsg, Snapshot } from '../src/shared/protocol.ts';

type Welcome = Extract<ServerMsg, { t: 'welcome' }>;
const LOADOUT = { weapon: 'pistol', armor: 'none', color: 'red' };

async function withServer<T>(opts: Partial<ServerOptions> & { dataDir: string }, fn: (base: string, port: number) => Promise<T>): Promise<T> {
  const server = await startServer({ port: 0, stepsPerTick: 8, ...opts });
  try {
    return await fn(`http://localhost:${server.port}`, server.port);
  } finally {
    await server.close();
  }
}

async function register(base: string, name: string, password: string): Promise<string> {
  const res = await fetch(`${base}/api/register`, { method: 'POST', body: JSON.stringify({ name, password }), headers: { 'content-type': 'application/json' } });
  assert.equal(res.status, 200);
  return ((await res.json()) as { token: string }).token;
}

async function joinRoom(port: number, name: string, token?: string): Promise<{ welcome: Welcome; myName: string; close(): Promise<void> }> {
  const ws = new WebSocket(`ws://localhost:${port}/ws?room=ffa`);
  const msgs: ServerMsg[] = [];
  await new Promise((ok, fail) => { ws.once('open', ok); ws.once('error', fail); });
  const snap = new Promise<Snapshot>((ok) => ws.on('message', (data) => {
    const m = JSON.parse(String(data)) as ServerMsg;
    msgs.push(m);
    if (m.t === 'snap' && m.players.some((p) => p.id === m.self.id)) ok(m as Snapshot);
  }));
  ws.send(JSON.stringify({ t: 'join', name, loadout: LOADOUT, token }));
  const s = await snap;
  const welcome = msgs.find((m): m is Welcome => m.t === 'welcome')!;
  return {
    welcome,
    myName: s.players.find((p) => p.id === s.self.id)!.name,
    close: () => new Promise((ok) => { ws.once('close', () => ok()); ws.close(); }),
  };
}

async function gamesOf(base: string, name: string): Promise<number> {
  return ((await (await fetch(`${base}/api/stats/${name}`)).json()) as { games: number }).games;
}

test('a session token survives a server restart and still credits the account', async () => {
  const dataDir = await mkdtemp(join(tmpdir(), 'skirmish-session-'));
  try {
    const token = await withServer({ dataDir }, (base) => register(base, 'Alice', 'alice-pass'));
    await withServer({ dataDir }, async (base, port) => {
      const p = await joinRoom(port, 'Alice', token);
      assert.equal(p.welcome.account, 'Alice', 'welcome names the signed-in account');
      assert.equal(p.myName, 'Alice', 'joins under the account name, not a numbered guest name');
      await p.close();
      assert.equal(await gamesOf(base, 'Alice'), 1, 'the game is credited to the account');
    });
    const secret = await stat(join(dataDir, 'session-secret'));
    assert.equal(secret.mode & 0o777, 0o600, 'the signing secret is readable only by its owner');
  } finally {
    await rm(dataDir, { recursive: true, force: true });
  }
});

test('a token signed by another server, a tampered token, and an expired token all join as a guest', async () => {
  const [dirA, dirB] = await Promise.all([mkdtemp(join(tmpdir(), 'skirmish-a-')), mkdtemp(join(tmpdir(), 'skirmish-b-'))]);
  try {
    const foreign = await withServer({ dataDir: dirA }, (base) => register(base, 'Mallory', 'mallory-pass'));
    const expired = await withServer({ dataDir: dirB, limits: { sessionMs: 1 } }, (base) => register(base, 'Mallory', 'mallory-pass'));
    await new Promise((r) => setTimeout(r, 20));
    await withServer({ dataDir: dirB }, async (base, port) => {
      const otherToken = await register(base, 'Bob', 'bob-pass1');
      const bob = await joinRoom(port, 'x', otherToken);
      assert.equal(bob.welcome.account, 'Bob', 'an untouched token from this server is accepted');
      await bob.close();
      const [, ...rest] = otherToken.split('.');
      const renamed = [Buffer.from('mallory').toString('base64url'), ...rest].join('.');
      for (const [label, token] of [['foreign', foreign], ['expired', expired], ['renamed', renamed], ['garbage', 'x'.repeat(40)]] as const) {
        const p = await joinRoom(port, 'Mallory', token);
        assert.equal(p.welcome.account, null, `${label} token is not an account`);
        assert.equal(p.myName, 'Mallory2', `${label} token joins under a guest name`);
        await p.close();
      }
      assert.equal(await gamesOf(base, 'Mallory'), 0, 'no game credited to the account');
    });
  } finally {
    await Promise.all([rm(dirA, { recursive: true, force: true }), rm(dirB, { recursive: true, force: true })]);
  }
});

test('a token for the longest multibyte name still fits the join message and signs the player in', async () => {
  const dataDir = await mkdtemp(join(tmpdir(), 'skirmish-longname-'));
  const name = '語'.repeat(16);
  try {
    await withServer({ dataDir }, async (base, port) => {
      const token = await register(base, name, 'long-pass');
      const p = await joinRoom(port, 'x', token);
      assert.equal(p.welcome.account, name, `token of ${token.length} characters accepted`);
      await p.close();
    });
  } finally {
    await rm(dataDir, { recursive: true, force: true });
  }
});

test('a guest join without a token says account null', async () => {
  const dataDir = await mkdtemp(join(tmpdir(), 'skirmish-guest-'));
  try {
    await withServer({ dataDir }, async (_base, port) => {
      const p = await joinRoom(port, 'Guest');
      assert.equal(p.welcome.account, null);
      await p.close();
    });
  } finally {
    await rm(dataDir, { recursive: true, force: true });
  }
});
