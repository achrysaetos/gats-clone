import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, test } from 'node:test';
import { startServer, type RunningServer } from '../src/server/main.ts';

let server: RunningServer;
let dataDir: string;
let base: string;

async function restart() {
  await server.close();
  server = await startServer({ port: 0, dataDir, limits: { authPerMin: 1000 } });
  base = `http://localhost:${server.port}`;
}

before(async () => {
  dataDir = await mkdtemp(join(tmpdir(), 'skirmish-accounts-'));
  server = await startServer({ port: 0, dataDir, limits: { authPerMin: 1000 } });
  base = `http://localhost:${server.port}`;
});

after(async () => {
  await server.close();
  await rm(dataDir, { recursive: true, force: true });
});

const post = (path: string, body: unknown) =>
  fetch(base + path, { method: 'POST', body: JSON.stringify(body), headers: { 'content-type': 'application/json' } });

test('stats for an inherited object key is not a player', async () => {
  for (const name of ['constructor', '__proto__', 'toString', 'hasOwnProperty']) {
    assert.equal((await fetch(`${base}/api/stats/${name}`)).status, 404, `/api/stats/${name}`);
  }
});

test('a malformed percent-escape in a stats name is a client error, not a crash', async () => {
  const res = await fetch(`${base}/api/stats/%E0`);
  assert.ok(res.status >= 400 && res.status < 500, `status ${res.status}`);
});

test('logging in as an inherited object key is refused, not a crash', async () => {
  for (const name of ['__proto__', 'constructor']) {
    assert.equal((await post('/api/login', { name, password: 'whatever1' })).status, 401, `login as ${name}`);
  }
});

test('names that collide with object keys register and persist as ordinary accounts', async () => {
  assert.equal((await post('/api/register', { name: '__proto__', password: 'proto-pass' })).status, 200);
  assert.equal((await post('/api/register', { name: 'Constructor', password: 'ctor-pass' })).status, 200);
  assert.equal((await post('/api/login', { name: '__proto__', password: 'proto-pass' })).status, 200);
  const stats = (await (await fetch(`${base}/api/stats/__proto__`)).json()) as { name: string; games: number };
  assert.deepEqual([stats.name, stats.games], ['__proto__', 0]);
  await restart();
  const saved = JSON.parse(await readFile(join(dataDir, 'accounts.json'), 'utf8')) as Record<string, { name: string }>;
  assert.equal(Object.getOwnPropertyDescriptor(saved, 'constructor')?.value.name, 'Constructor', 'file keeps the lowercase-name-keyed object format');
  assert.equal((await post('/api/login', { name: '__proto__', password: 'proto-pass' })).status, 200, '__proto__ survives a restart');
  assert.equal((await post('/api/login', { name: 'constructor', password: 'ctor-pass' })).status, 200, 'constructor survives a restart');
});
