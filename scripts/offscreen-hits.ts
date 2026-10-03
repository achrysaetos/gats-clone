/// <reference types="node" />
// Usage: node scripts/offscreen-hits.ts <run dir from .claude/skills/verify/scripts/launch.sh> [seconds per viewport=120] [WxH ...=1280x800 1920x1080]
import { spawn } from 'node:child_process';
import { mkdtempSync, readFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import WebSocket from 'ws';
import { WORLD } from '../src/shared/defs.ts';
import type { GameEvent, Snapshot } from '../src/shared/protocol.ts';
import { fillSnapshot } from '../src/shared/wire.ts';
import { makeCamera, screenToWorld } from '../src/client/camera.ts';

const RUN = process.argv[2];
if (!RUN) throw new Error('usage: node scripts/offscreen-hits.ts <run dir> [seconds] [WxH ...]');
const SECONDS = Number(process.argv[3] ?? 120);
const VIEWPORTS = (process.argv.length > 4 ? process.argv.slice(4) : ['1280x800', '1920x1080']).map((s) => s.split('x').map(Number) as [number, number]);
const BASE = `http://localhost:${readFileSync(join(RUN, 'port'), 'utf8').trim()}`;
const CHROME = process.env.CHROME ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const freePort = () => new Promise<number>((r) => { const s = createServer().listen(0, () => { const p = (s.address() as { port: number }).port; s.close(() => r(p)); }); });
const debugPort = await freePort();
const chrome = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${debugPort}`, `--user-data-dir=${mkdtempSync(join(tmpdir(), 'skirmish-offscreen-'))}`,
  '--no-first-run', '--no-default-browser-check', '--hide-scrollbars', 'about:blank'], { stdio: 'ignore' });
let target = '';
for (let i = 0; i < 50 && !target; i++) {
  try {
    const list = (await (await fetch(`http://127.0.0.1:${debugPort}/json/list`)).json()) as { type: string; webSocketDebuggerUrl: string }[];
    target = list.find((t) => t.type === 'page')?.webSocketDebuggerUrl ?? '';
  } catch {}
  if (!target) await sleep(200);
}
const page = new WebSocket(target);
await new Promise((r) => page.once('open', r));

type Where = 'inside' | 'outside' | 'absent';
type Hit = { where: Where; dx: number; dy: number };
let viewport: [number, number] = VIEWPORTS[0];
let myId: number | null = null;
let socketId = '';
let full: Snapshot | null = null;
let hits: Hit[] = [];

function classify(snap: Snapshot, e: Extract<GameEvent, { e: 'dmg' }>): Hit | null {
  if (e.kind !== 'player' || e.victim !== myId || e.attacker === null || e.attacker === myId) return null;
  const me = snap.players.find((p) => p.id === myId);
  const attacker = snap.players.find((p) => p.id === e.attacker);
  if (!me) return null;
  if (!attacker) return { where: 'absent', dx: NaN, dy: NaN };
  const [w, h] = viewport;
  const cam = makeCamera(me, w, h, snap.self.viewRadius || WORLD.viewRadius);
  const topLeft = screenToWorld(cam, { x: 0, y: 0 });
  const halfW = me.x - topLeft.x, halfH = me.y - topLeft.y;
  const dx = attacker.x - me.x, dy = attacker.y - me.y;
  return { where: Math.abs(dx) <= halfW && Math.abs(dy) <= halfH ? 'inside' : 'outside', dx, dy };
}

let nextId = 1;
const pending = new Map<number, (v: any) => void>();
page.on('message', (raw) => {
  const m = JSON.parse(String(raw));
  if (m.id && pending.has(m.id)) { pending.get(m.id)!(m.result); pending.delete(m.id); return; }
  // A page left by navigation can linger in the back/forward cache with its socket open; only the newest socket counts.
  if (m.method === 'Network.webSocketCreated') { socketId = m.params.requestId; full = null; myId = null; }
  else if (m.method === 'Network.webSocketFrameReceived' && m.params.requestId === socketId) {
    const msg = JSON.parse(m.params.response.payloadData);
    if (msg.t === 'welcome') myId = msg.id;
    if (msg.t !== 'snap') return;
    full = fillSnapshot(msg, full) ?? full;
    if (!full) return;
    for (const e of full.events) if (e.e === 'dmg') { const hit = classify(full, e); if (hit) hits.push(hit); }
  }
});
const cdp = (method: string, params: object = {}): Promise<any> => new Promise((r) => { const id = nextId++; pending.set(id, r); page.send(JSON.stringify({ id, method, params })); });
const js = async (expr: string) => (await cdp('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true })).result?.value;
const until = async (fn: () => boolean | Promise<boolean>, ms = 6000) => { const end = Date.now() + ms; while (Date.now() < end) { if (await fn()) return true; await sleep(100); } return false; };

await cdp('Runtime.enable'); await cdp('Page.enable'); await cdp('Network.enable');
for (const vp of VIEWPORTS) {
  viewport = vp;
  hits = [];
  await cdp('Emulation.setDeviceMetricsOverride', { width: vp[0], height: vp[1], deviceScaleFactor: 1, mobile: false });
  await cdp('Page.navigate', { url: BASE });
  await until(async () => (await js(`document.querySelectorAll('#servers .server').length`)) === 3);
  await js(`document.querySelectorAll('#servers .server')[0].click(); document.getElementById('name').value = 'Offscreen'; document.getElementById('play').click()`);
  if (!(await until(() => myId !== null))) throw new Error(`${vp.join('x')}: never joined`);
  const end = Date.now() + SECONDS * 1000;
  while (Date.now() < end) {
    await js(`(() => { const b = document.getElementById('respawn'); if (b && !b.disabled && !document.getElementById('death').hidden) b.click(); })()`);
    await sleep(250);
  }
  const count = (w: Where) => hits.filter((h) => h.where === w).length;
  const pct = (n: number) => `${((100 * n) / Math.max(1, hits.length)).toFixed(1)}%`;
  const outside = hits.filter((h) => h.where === 'outside');
  const worst = outside.length ? `; outside offsets up to |dx| ${Math.max(...outside.map((h) => Math.abs(h.dx))).toFixed(0)}, |dy| ${Math.max(...outside.map((h) => Math.abs(h.dy))).toFixed(0)}` : '';
  console.log(`${vp.join('x')}: ${hits.length} hits from players in ${SECONDS}s; attacker on screen ${count('inside')} (${pct(count('inside'))}), in snapshot but off screen ${count('outside')} (${pct(count('outside'))}), not in snapshot ${count('absent')} (${pct(count('absent'))})${worst}`);
  await cdp('Page.reload');
}
page.close();
chrome.kill();
process.exit(0);
