/// <reference types="node" />
import assert from 'node:assert/strict';
import { mkdtemp } from 'node:fs/promises';
import { connect } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import WebSocket from 'ws';
import { startServer } from '../src/server/main.ts';

/** Writes `request` on a raw TCP connection and resolves with whatever came back once the server hangs up. */
const raw = (port: number, request: string) => new Promise<string>((resolve) => {
  const sock = connect(port, '127.0.0.1', () => sock.write(request));
  let got = '';
  sock.on('data', (d) => { got += d; });
  sock.on('error', () => {});
  sock.on('close', () => resolve(got));
  // A server that never answers is a failure too, but one the assertions can name.
  sock.setTimeout(2000, () => sock.destroy());
});

const upgradeStatus = (port: number) => new Promise<number>((resolve) => {
  const ws = new WebSocket(`ws://127.0.0.1:${port}/ws?room=ffa`);
  ws.on('error', () => {});
  ws.once('open', () => { ws.close(); resolve(101); });
  ws.once('unexpected-response', (_req, res) => resolve(res.statusCode ?? 0));
});

test('an upgrade request whose target is not a parseable URL is refused, not a process crash', { timeout: 10_000 }, async () => {
  const server = await startServer({ port: 0, dataDir: await mkdtemp(join(tmpdir(), 'skirmish-badurl-')) });
  try {
    const reply = await raw(server.port, 'GET //[ HTTP/1.1\r\nHost: x\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Version: 13\r\nSec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==\r\n\r\n');
    assert.match(reply, /^HTTP\/1\.1 4\d\d/, 'the bad upgrade gets a 4xx');
    const res = await fetch(`http://127.0.0.1:${server.port}/api/servers`);
    assert.equal(res.status, 200, 'the server still answers');
  } finally {
    await server.close();
  }
});

test('upgrades that fail the websocket handshake do not use up the address\'s socket allowance', { timeout: 10_000 }, async () => {
  const server = await startServer({ port: 0, dataDir: await mkdtemp(join(tmpdir(), 'skirmish-badhandshake-')), limits: { socketsPerIp: 2 } });
  try {
    // No Sec-WebSocket-Key: ws aborts the handshake with a 400 and never hands back a socket.
    for (let i = 0; i < 3; i++) {
      const reply = await raw(server.port, 'GET /ws?room=ffa HTTP/1.1\r\nHost: x\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Version: 13\r\n\r\n');
      assert.match(reply, /^HTTP\/1\.1 400/);
    }
    assert.equal(await upgradeStatus(server.port), 101, 'a real client from the same address still gets in after failed handshakes');
  } finally {
    await server.close();
  }
});
