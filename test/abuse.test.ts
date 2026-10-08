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

test('an oversized frame closes that socket and the server keeps serving', { timeout: 10_000 }, async () => {
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

const upgradeStatus = (port: number, forwardedFor: string) => new Promise<number>((resolve) => {
  const ws = new WebSocket(`ws://localhost:${port}/ws?room=ffa`, { headers: { 'x-forwarded-for': forwardedFor } });
  ws.on('error', () => {});
  ws.once('open', () => resolve(101));
  ws.once('unexpected-response', (_req, res) => resolve(res.statusCode ?? 0));
});

test('X-Forwarded-For keys the per-IP socket cap only when the proxy is trusted', { timeout: 10_000 }, async () => {
  const limits = { socketsPerIp: 2, joinTimeoutMs: 5000 };
  const untrusted = await startServer({ port: 0, dataDir: await mkdtemp(join(tmpdir(), 'skirmish-proxy-off-')), limits });
  try {
    const codes = [];
    for (const ip of ['203.0.113.1', '203.0.113.2', '203.0.113.3']) codes.push(await upgradeStatus(untrusted.port, ip));
    assert.deepEqual(codes, [101, 101, 429], 'without trustProxy a spoofed header does not dodge the cap');
  } finally {
    await untrusted.close();
  }
  const trusted = await startServer({ port: 0, dataDir: await mkdtemp(join(tmpdir(), 'skirmish-proxy-on-')), limits, trustProxy: true });
  try {
    const distinct = [];
    for (const ip of ['198.51.100.1', '198.51.100.2', '198.51.100.3']) distinct.push(await upgradeStatus(trusted.port, ip));
    assert.deepEqual(distinct, [101, 101, 101], 'players behind one proxy each get their own cap');
    const spoofed = [];
    for (let i = 0; i < 3; i++) spoofed.push(await upgradeStatus(trusted.port, `6.6.6.${i}, 198.51.100.9`));
    assert.deepEqual(spoofed, [101, 101, 429], 'the address the proxy appended is the key, so a client-supplied value cannot dodge the cap');
  } finally {
    await trusted.close();
  }
});

const JOIN = (name: string) => JSON.stringify({ t: 'join', name, loadout: { weapon: 'pistol', armor: 'none', color: 'red' } });
const nextMsg = (ws: WebSocket, t: string) => new Promise<any>((resolve) => ws.on('message', (m) => { const msg = JSON.parse(String(m)); if (msg.t === t) resolve(msg); }));

test('limits: flood, sockets per IP, full room, idle lobby, auth attempts', { timeout: 10_000 }, async () => {
  const server = await startServer({
    port: 0, dataDir: await mkdtemp(join(tmpdir(), 'skirmish-limits-')),
    limits: { humansPerRoom: 2, socketsPerIp: 4, joinTimeoutMs: 300, messagesPerSec: 5, messageBurst: 10, authPerMin: 3 },
  });
  const base = `http://localhost:${server.port}`;
  try {
    const flooder = await open(server.port);
    const floodClosed = closed(flooder);
    for (let i = 0; i < 50; i++) flooder.send(JOIN('Flood'));
    assert.equal(await floodClosed, 1008, 'flooding closes the socket with policy violation');

    const a = await open(server.port);
    const b = await open(server.port);
    a.send(JOIN('Ann')); b.send(JOIN('Bob'));
    await Promise.all([nextMsg(a, 'welcome'), nextMsg(b, 'welcome')]);
    const c = await open(server.port);
    const full = nextMsg(c, 'error');
    c.send(JOIN('Cat'));
    assert.equal((await full).message, 'Room full');

    const idle = await open(server.port);
    assert.equal(await closed(idle), 1008, 'a socket that never joins is closed');

    const extra = await Promise.all([open(server.port), open(server.port)]);
    const refused = new WebSocket(`ws://localhost:${server.port}/ws?room=ffa`);
    const status = await new Promise<number>((resolve) => refused.on('unexpected-response', (_req, res) => resolve(res.statusCode ?? 0)));
    assert.equal(status, 429, 'the fifth socket from one IP is refused');
    for (const ws of [a, b, ...extra]) ws.close();

    const login = () => fetch(`${base}/api/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: 'Nobody', password: 'guess1' }) });
    const codes = [];
    for (let i = 0; i < 4; i++) codes.push((await login()).status);
    assert.deepEqual(codes, [401, 401, 401, 429], 'the fourth login attempt in a minute is rate limited');
  } finally {
    await server.close();
  }
});

/** Rejects after `ms` instead of waiting forever, so a stuck step fails the test and its `finally` still closes the server (a test
 * that times out mid-await never runs its `finally`, and the open server then keeps the whole test process from exiting). */
const within = <T>(ms: number, label: string, p: Promise<T>) => Promise.race([p, new Promise<never>((_, fail) => setTimeout(() => fail(new Error(`timed out: ${label}`)), ms).unref())]);

test('a client that stops answering pings is dropped, a healthy one stays', { timeout: 15_000 }, async () => {
  const HEARTBEAT_MS = 250;
  const server = await startServer({ port: 0, dataDir: await mkdtemp(join(tmpdir(), 'skirmish-heartbeat-')), limits: { heartbeatMs: HEARTBEAT_MS } });
  const humans = async () => ((await (await fetch(`http://localhost:${server.port}/api/servers`)).json()) as { id: string; humans: number }[]).find((r) => r.id === 'ffa')!.humans;
  try {
    // The silent client answers pings by hand until both have joined, so a slow welcome under load cannot get it dropped before
    // the test has seen it seated; then it falls silent.
    const silent = new WebSocket(`ws://localhost:${server.port}/ws?room=ffa`, { autoPong: false });
    let answering = true;
    silent.on('ping', (data) => { if (answering) silent.pong(data); });
    silent.on('error', () => {});
    const silentOpen = new Promise((r) => silent.once('open', r));
    const healthy = await within(5000, 'healthy open', open(server.port));
    await within(5000, 'silent open', silentOpen);
    silent.send(JOIN('Ghost')); healthy.send(JOIN('Alive'));
    await within(5000, 'welcomes', Promise.all([nextMsg(silent, 'welcome'), nextMsg(healthy, 'welcome')]));
    assert.equal(await humans(), 2);
    const dropped = closed(silent);
    answering = false;
    await within(10 * HEARTBEAT_MS, 'the silent client dropped', dropped);
    await new Promise((r) => setTimeout(r, 4 * HEARTBEAT_MS));
    assert.equal(healthy.readyState, WebSocket.OPEN, 'a client answering pings survives several heartbeats');
    assert.equal(await humans(), 1, 'the silent client no longer holds a human slot');
    healthy.close();
  } finally {
    await server.close();
  }
});
