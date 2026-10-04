/// <reference types="node" />
// Usage: node scripts/measure-lag-aim.ts [seconds per condition=60] [lag:jitter ...=0:0 100:40]
// A real browser taps the pistol at a scripted target strafing in a bot-free FFA room. It aims where the page draws the
// target, leading only by the bullet's flight time over the drawn velocity, the lead a human can see on screen.
import { execSync, spawn } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import WebSocket from 'ws';
import { WEAPONS, WORLD } from '../src/shared/defs.ts';
import type { GameEvent, Loadout } from '../src/shared/protocol.ts';
import { canRespawn, respawn } from '../src/shared/sim.ts';
import type { Rect } from '../src/shared/sim/movement.ts';
import { startServer } from '../src/server/main.ts';

const SECONDS = Number(process.argv[2] ?? 60);
const CONDITIONS = (process.argv.length > 3 ? process.argv.slice(3) : ['0:0', '100:40']).map((c) => c.split(':').map(Number) as [number, number]);
const CHROME = process.env.CHROME ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const VIEW = { w: 1280, h: 800 };
const RANGE = 350;
const STRAFE_MS = 1200;
const STRAFE_HALF = (WORLD.baseSpeed * STRAFE_MS) / 2000;
const TAP_MS = WEAPONS.pistol.fireMs + 30;
const WARMUP_MS = 1500;
const TARGET_LOADOUT: Loadout = { weapon: 'pistol', armor: 'none', color: 'red' };
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const freePort = () => new Promise<number>((r) => { const s = createServer().listen(0, () => { const p = (s.address() as { port: number }).port; s.close(() => r(p)); }); });

execSync('npm run --silent build', { cwd: resolve(import.meta.dirname, '..'), stdio: 'ignore' });
const server = await startServer({ port: 0, dataDir: mkdtempSync(join(tmpdir(), 'skirmish-lagaim-')), limits: { minPlayers: 0 } });
const room = server.rooms.get('ffa')!;
const world = room.world;

function arenaCenter(): { x: number; y: number } {
  const box = (x: number, y: number): Rect => ({ x: x - STRAFE_HALF - 80, y: y - RANGE - 80, w: 2 * (STRAFE_HALF + 80), h: RANGE + 160 });
  const solids: Rect[] = [...world.walls, ...world.crates.map((c) => ({ x: c.x, y: c.y, w: c.size, h: c.size }))];
  for (let y = 600; y < WORLD.size - 300; y += 50) {
    for (let x = 400; x < WORLD.size - 400; x += 50) {
      const b = box(x, y);
      if (!solids.some((s) => s.x < b.x + b.w && b.x < s.x + s.w && s.y < b.y + b.h && b.y < s.y + s.h)) return { x, y };
    }
  }
  throw new Error('no clear arena');
}

async function openShooter(lag: number, jitter: number) {
  const port = await freePort();
  const chrome = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=${mkdtempSync(join(tmpdir(), 'skirmish-lagaim-chrome-'))}`,
    '--no-first-run', '--no-default-browser-check', '--hide-scrollbars', 'about:blank'], { stdio: 'ignore' });
  let target = '';
  for (let i = 0; i < 50 && !target; i++) {
    try {
      const list = (await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()) as { type: string; webSocketDebuggerUrl: string }[];
      target = list.find((t) => t.type === 'page')?.webSocketDebuggerUrl ?? '';
    } catch {}
    if (!target) await sleep(200);
  }
  const page = new WebSocket(target);
  await new Promise((r) => page.once('open', r));
  let nextId = 1;
  const pending = new Map<number, (v: any) => void>();
  const frames = { id: null as number | null, events: [] as GameEvent[] };
  page.on('message', (raw) => {
    const m = JSON.parse(String(raw));
    if (m.id && pending.has(m.id)) { pending.get(m.id)!(m.result); pending.delete(m.id); return; }
    if (m.method !== 'Network.webSocketFrameReceived') return;
    const msg = JSON.parse(m.params.response.payloadData);
    if (msg.t === 'welcome') frames.id = msg.id;
    if (msg.t === 'snap') frames.events.push(...(msg.events as GameEvent[]));
  });
  const cdp = (method: string, params: object = {}): Promise<any> => new Promise((r) => { const id = nextId++; pending.set(id, r); page.send(JSON.stringify({ id, method, params })); });
  const js = async (expr: string) => (await cdp('Runtime.evaluate', { expression: expr, returnByValue: true })).result?.value;
  await cdp('Runtime.enable'); await cdp('Page.enable'); await cdp('Network.enable');
  await cdp('Emulation.setDeviceMetricsOverride', { width: VIEW.w, height: VIEW.h, deviceScaleFactor: 1, mobile: false });
  await cdp('Page.navigate', { url: `http://localhost:${server.port}/?dev&lag=${lag}&jitter=${jitter}` });
  for (let i = 0; i < 50 && (await js(`document.querySelectorAll('#servers .server').length`)) !== 3; i++) await sleep(100);
  await js(`document.querySelector('#servers .server').click(); document.getElementById('name').value = 'Shooter'; document.getElementById('play').click()`);
  for (let i = 0; i < 50 && frames.id === null; i++) await sleep(100);
  if (frames.id === null) throw new Error('shooter did not join');
  return { chrome, cdp, js, frames, id: frames.id };
}

async function openTarget(): Promise<{ ws: WebSocket; id: number }> {
  const ws = new WebSocket(`ws://localhost:${server.port}/ws?room=ffa`);
  await new Promise((r) => ws.once('open', r));
  ws.send(JSON.stringify({ t: 'join', name: 'Target', loadout: TARGET_LOADOUT, aspect: 1.6 }));
  const id = await new Promise<number>((r) => ws.on('message', (raw) => { const m = JSON.parse(String(raw)); if (m.t === 'welcome') r(m.id); }));
  return { ws, id };
}

async function measure(lag: number, jitter: number) {
  const shooter = await openShooter(lag, jitter);
  const target = await openTarget();
  const center = arenaCenter();
  const place = (id: number, x: number, y: number) => { const p = world.players.get(id)!; p.x = x; p.y = y; };
  place(shooter.id, center.x, center.y);
  place(target.id, center.x, center.y - RANGE);
  let strafeStart = performance.now();
  let seq = 0;
  let aliveMs = 0;
  let lastTick = performance.now();
  let measuring = false;
  const viewLagMs: number[] = [];
  const strafe = setInterval(() => {
    const now = performance.now();
    const victim = world.players.get(target.id)!;
    if (measuring && victim.life.k === 'alive') aliveMs += now - lastTick;
    const viewAt = world.players.get(shooter.id)?.viewAt;
    if (measuring && typeof viewAt === 'number') viewLagMs.push(world.now - viewAt);
    lastTick = now;
    if (victim.life.k === 'dead') {
      if (canRespawn(world, target.id)) {
        respawn(world, target.id, TARGET_LOADOUT);
        place(target.id, center.x, center.y - RANGE);
        strafeStart = now;
      }
      return;
    }
    const right = Math.floor((now - strafeStart + STRAFE_MS / 2) / STRAFE_MS) % 2 === 0;
    target.ws.send(JSON.stringify({ t: 'input', seq: ++seq, input: { up: false, down: false, left: !right, right, angle: Math.PI / 2, aimDist: 300, fire: false, shots: 0, reload: false, ability: false } }));
  }, 1000 / WORLD.tickHz);

  await sleep(WARMUP_MS);
  shooter.frames.events.length = 0;
  measuring = true;
  const endAt = performance.now() + SECONDS * 1000;
  let nextTapAt = 0;
  let last: { x: number; y: number; at: number } | null = null;
  let velocity = { x: 0, y: 0 };
  while (performance.now() < endAt) {
    const drawn = await shooter.js(`(() => { const o = skirmishDev.drawnOthers().find((p) => p.id === ${target.id}); const s = skirmishDev.drawnSelf(); return o && { ...o, self: s, now: performance.now() }; })()`);
    if (!drawn) { last = null; await sleep(16); continue; }
    if (last && drawn.now > last.at) {
      const dt = (drawn.now - last.at) / 1000;
      velocity = { x: velocity.x * 0.5 + 0.5 * (drawn.screen.x - last.x) / dt, y: velocity.y * 0.5 + 0.5 * (drawn.screen.y - last.y) / dt };
    }
    last = { x: drawn.screen.x, y: drawn.screen.y, at: drawn.now };
    const flight = Math.hypot(drawn.x - drawn.self.x, drawn.y - drawn.self.y) / WEAPONS.pistol.bulletSpeed;
    const sx = drawn.screen.x + velocity.x * flight, sy = drawn.screen.y + velocity.y * flight;
    await shooter.cdp('Input.dispatchMouseEvent', { type: 'mouseMoved', x: sx, y: sy, button: 'none' });
    if (performance.now() >= nextTapAt) {
      await shooter.cdp('Input.dispatchMouseEvent', { type: 'mousePressed', x: sx, y: sy, button: 'left', clickCount: 1 });
      await shooter.cdp('Input.dispatchMouseEvent', { type: 'mouseReleased', x: sx, y: sy, button: 'left', clickCount: 1 });
      nextTapAt = performance.now() + TAP_MS;
    }
    await sleep(16);
  }
  await sleep(500);
  measuring = false;
  clearInterval(strafe);
  const shots = shooter.frames.events.filter((e) => e.e === 'shot' && e.owner === shooter.id).length;
  const hits = shooter.frames.events.filter((e): e is Extract<GameEvent, { e: 'dmg' }> => e.e === 'dmg' && e.attacker === shooter.id && e.victim === target.id && e.kind === 'player');
  const damage = hits.reduce((sum, e) => sum + e.amount, 0);
  target.ws.close();
  shooter.chrome.kill();
  await sleep(300);
  viewLagMs.sort((a, b) => a - b);
  const viewLag = viewLagMs.length ? `${Math.round(viewLagMs[viewLagMs.length >> 1]!)}ms (p90 ${Math.round(viewLagMs[Math.floor(viewLagMs.length * 0.9)]!)}ms)` : 'unreported';
  return { lag, jitter, shots, hits: hits.length, damage, aliveMs, viewLag };
}

const results = [];
for (const [lag, jitter] of CONDITIONS) {
  const r = await measure(lag, jitter);
  results.push(r);
  console.log(`LAG=${r.lag} JITTER=${r.jitter}  shots ${r.shots}  hits ${r.hits}  hit rate ${(100 * r.hits / Math.max(1, r.shots)).toFixed(1)}%  damage ${Math.round(r.damage)}  damage/min ${Math.round(r.damage / (r.aliveMs / 60000))}  view lag ${r.viewLag}`);
}
await server.close();
process.exit(0);
