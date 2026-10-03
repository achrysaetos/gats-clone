/// <reference types="node" />
import assert from 'node:assert/strict';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import WebSocket from 'ws';
import { startServer } from '../src/server/main.ts';

const open = (port: number) => new Promise<WebSocket>((resolve) => {
  const ws = new WebSocket(`ws://localhost:${port}/ws?room=ffa`);
  ws.on('error', () => {});
  ws.once('open', () => resolve(ws));
});
const closed = (ws: WebSocket) => new Promise<number>((resolve) => ws.once('close', (code) => resolve(code)));

test('an oversized frame closes that socket and the server keeps serving', async () => {
  const server = await startServer({ port: 0, dataDir: await mkdtemp(join(tmpdir(), 'skirmish-abuse-')) });
  try {
    const ws = await open(server.port);
    const done = closed(ws);
    ws.send('x'.repeat(64 * 1024));
    await done;
    const res = await fetch(`http://localhost:${server.port}/api/servers`);
    assert.equal(res.status, 200, 'server still answers after the bad frame');
  } finally {
    await server.close();
  }
});
