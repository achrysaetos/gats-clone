/// <reference types="node" />
// Usage: node screens.ts <run-dir> <out-dir> [view ...]   Screenshots each art view through real play, so an art change can be compared before and after.
// Views: menu ffa tdm dom (default), board (TDM while Tab holds the whole leaderboard open), death (FFA until a bot kills you), levelup and evolve
// (the perk and evolve docks, then `evolved` after the pick; need a scratch copy with low LEVELS), and zom-day zom-night, which start a squad and need a scratch copy whose night brings a full horde (see features/zombies.md).
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import WebSocket from 'ws';
import type { Snapshot } from '../../../../src/shared/protocol.ts';
import { fillSnapshot } from '../../../../src/shared/wire.ts';
import { killOnExit } from '../../../../scripts/kill-on-exit.ts';

const [RUN, OUT, ...asked] = process.argv.slice(2);
if (!RUN || !OUT) { console.error('usage: node screens.ts <run-dir> <out-dir> [view ...]'); process.exit(2); }
const VIEWS = asked.length ? asked : ['menu', 'ffa', 'tdm', 'dom'];
const VIEW = { w: Number(process.env.W ?? 1600), h: Number(process.env.H ?? 900) };
const BASE = existsSync(join(RUN, 'url'))
  ? readFileSync(join(RUN, 'url'), 'utf8').trim().replace(/\/$/, '')
  : `http://localhost:${readFileSync(join(RUN, 'port'), 'utf8').trim()}`;
const CHROME = process.env.CHROME ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
mkdirSync(OUT, { recursive: true });
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const freePort = () => new Promise<number>((r) => { const s = createServer().listen(0, () => { const p = (s.address() as { port: number }).port; s.close(() => r(p)); }); });

const port = await freePort();
const chrome = killOnExit(spawn(CHROME, ['--headless=new', '--mute-audio', `--remote-debugging-port=${port}`, `--user-data-dir=${mkdtempSync(join(tmpdir(), 'skirmish-screens-'))}`,
  '--no-first-run', '--no-default-browser-check', '--hide-scrollbars', 'about:blank'], { stdio: 'ignore' }));
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
let myId: number | null = null;
let full = null as Snapshot | null;
const exceptions: string[] = [];
const pending = new Map<number, (v: any) => void>();
page.on('message', (raw) => {
  const m = JSON.parse(String(raw));
  if (m.id && pending.has(m.id)) { pending.get(m.id)!(m.result); pending.delete(m.id); return; }
  if (m.method === 'Network.webSocketFrameReceived') {
    const msg = JSON.parse(m.params.response.payloadData);
    if (msg.t === 'welcome') { myId = msg.id; full = null; }
    if (msg.t === 'snap') full = fillSnapshot(msg, full) ?? full;
  } else if (m.method === 'Runtime.exceptionThrown') exceptions.push(m.params.exceptionDetails.exception?.description ?? m.params.exceptionDetails.text);
});
const cdp = (method: string, params: object = {}): Promise<any> => new Promise((r) => { const id = nextId++; pending.set(id, r); page.send(JSON.stringify({ id, method, params })); });
const js = async (expr: string) => (await cdp('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true })).result?.value;
await cdp('Runtime.enable'); await cdp('Page.enable'); await cdp('Network.enable');
await cdp('Emulation.setDeviceMetricsOverride', { width: VIEW.w, height: VIEW.h, deviceScaleFactor: 1, mobile: false });

const KEYS = { right: ['KeyD', 'd', 68], down: ['KeyS', 's', 83], left: ['KeyA', 'a', 65], up: ['KeyW', 'w', 87] } as const;
type Dir = keyof typeof KEYS;
const key = (type: 'keyDown' | 'keyUp', d: Dir) => cdp('Input.dispatchKeyEvent', { type, code: KEYS[d][0], key: KEYS[d][1], windowsVirtualKeyCode: KEYS[d][2] });
const mouse = (type: string, x: number, y: number) => cdp('Input.dispatchMouseEvent', { type, x, y, button: type === 'mouseMoved' ? 'none' : 'left', clickCount: 1 });
const me = () => full?.players.find((p) => p.id === myId);
const shot = async (name: string) => {
  const { data } = await cdp('Page.captureScreenshot', { format: 'png' });
  const file = join(OUT, `${name}.png`);
  writeFileSync(file, Buffer.from(data, 'base64'));
  console.log(`saved ${file}`);
};

async function openMenu() {
  await cdp('Page.navigate', { url: `${BASE}/?dev` });
  for (let i = 0; i < 80 && (await js(`document.querySelectorAll('#servers .server').length`)) < 3; i++) await sleep(100);
  await js(`document.querySelectorAll('#loadout-menu .weapon')[1].click(); document.getElementById('name').value = 'You'`);
}

async function enter(start: string) {
  await openMenu();
  full = null;
  await js(start);
  for (let i = 0; i < 80 && !me(); i++) await sleep(100);
  if (!me()) throw new Error('never joined');
}

/** Walks toward `goal` (or the nearest enemy) a step at a time while aiming and firing at the nearest enemy. */
async function play(ms: number, goal: (() => { x: number; y: number } | null) | null, foes: () => { x: number; y: number }[], fire = true) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    const self = me();
    if (!self?.alive) {
      if (!self?.downed) await js(`document.getElementById('respawn')?.disabled || document.getElementById('respawn')?.click()`);
      await sleep(200);
      continue;
    }
    const near = foes().sort((a, b) => Math.hypot(a.x - self.x, a.y - self.y) - Math.hypot(b.x - self.x, b.y - self.y))[0];
    const [mx, my] = near ? [VIEW.w / 2 + (near.x - self.x) * 0.55, VIEW.h / 2 + (near.y - self.y) * 0.55] : [VIEW.w / 2 + 200, VIEW.h / 2];
    await mouse('mouseMoved', mx, my);
    if (fire && near && Math.hypot(near.x - self.x, near.y - self.y) < 800) await mouse('mousePressed', mx, my);
    const to = goal?.() ?? near;
    const dirs: Dir[] = [];
    if (to && Math.hypot(to.x - self.x, to.y - self.y) > 260) {
      if (Math.abs(to.x - self.x) > 80) dirs.push(to.x > self.x ? 'right' : 'left');
      if (Math.abs(to.y - self.y) > 80) dirs.push(to.y > self.y ? 'down' : 'up');
    }
    for (const d of dirs) await key('keyDown', d);
    await sleep(160);
    for (const d of dirs) await key('keyUp', d);
    if (fire) await mouse('mouseReleased', mx, my);
  }
}

const enemies = () => full?.players.filter((p) => p.id !== myId && p.alive && (p.team === null || p.team !== me()?.team)) ?? [];
const zombies = () => (full?.zombies ?? []).map(([, , x, y]) => ({ x, y }));
const serverOf = (mode: string) => `document.querySelector('#servers .server .mode-${mode}').closest('.server').click(); document.getElementById('play').click()`;
const nearCore = () => { const c = full?.run?.core; return c ? { x: c.x + 220, y: c.y + 160 } : null; };
const pickFirst = async () => {
  await cdp('Input.dispatchKeyEvent', { type: 'keyDown', code: 'Digit1', key: '1', windowsVirtualKeyCode: 49 });
  await cdp('Input.dispatchKeyEvent', { type: 'keyUp', code: 'Digit1', key: '1', windowsVirtualKeyCode: 49 });
};

/** Plays until a frame has at least `bullets` rounds and an enemy in view, then screenshots it; after `ms` it screenshots anyway. */
async function fightShot(name: string, ms: number, goal: (() => { x: number; y: number } | null) | null) {
  const end = Date.now() + ms;
  await play(4000, goal, enemies);
  while (Date.now() < end && !((full?.bullets.length ?? 0) >= 4 && enemies().length >= 2 && me()?.alive)) await play(400, goal, enemies);
  await shot(name);
}

for (const view of VIEWS) {
  switch (view) {
    case 'menu': await openMenu(); await sleep(1500); await shot('menu'); break;
    case 'ffa': await enter(serverOf('ffa')); await fightShot('ffa', 30_000, null); break;
    case 'tdm': await enter(serverOf('tdm')); await fightShot('tdm', 30_000, null); break;
    case 'board': {
      await enter(serverOf('tdm'));
      await play(3000, null, enemies, false);
      await cdp('Input.dispatchKeyEvent', { type: 'keyDown', code: 'Tab', key: 'Tab', windowsVirtualKeyCode: 9 });
      await sleep(300);
      await shot('board');
      await cdp('Input.dispatchKeyEvent', { type: 'keyUp', code: 'Tab', key: 'Tab', windowsVirtualKeyCode: 9 });
      break;
    }
    case 'dom': {
      await enter(serverOf('dom'));
      const zone = () => { const self = me(), zones = full?.zones ?? []; return self && zones.length ? [...zones].sort((a, b) => Math.hypot(a.x - self.x, a.y - self.y) - Math.hypot(b.x - self.x, b.y - self.y))[0]! : null; };
      await fightShot('dom', 30_000, zone);
      break;
    }
    case 'death': {
      await enter(serverOf('ffa'));
      for (let i = 0; i < 600 && !(await js(`!document.getElementById('death').hidden`)); i++) await play(300, () => enemies()[0] ?? null, enemies, false);
      await sleep(900);
      await shot('death');
      await js(`document.getElementById('respawn').click()`);
      break;
    }
    case 'levelup':
    case 'evolve': {
      if (!me()?.alive) await enter(serverOf('ffa'));
      const dock = () => js(`document.getElementById('perk-panel').hidden ? '' : document.querySelector('#perk-panel h2')?.textContent ?? ''`);
      const want = view === 'levelup' ? 'perk' : 'evolve';
      for (let i = 0; i < 400; i++) {
        const title: string = await dock();
        if (title.includes(want)) break;
        if (title) { await pickFirst(); await sleep(300); continue; }
        await play(400, null, enemies);
      }
      await play(600, null, enemies, false);
      await shot(view);
      if (view === 'evolve') {
        await pickFirst();
        await sleep(700);
        await shot('evolved');
      }
      break;
    }
    case 'zom-day': {
      await enter(`document.getElementById('squad-start').click()`);
      for (let i = 0; i < 60 && full?.run?.phase !== 'day'; i++) await sleep(100);
      await play(2500, nearCore, () => [], false);
      await shot('zom-day');
      break;
    }
    case 'zom-night': {
      if (!full?.run) await enter(`document.getElementById('squad-start').click()`);
      for (let i = 0; i < 1200 && !(full?.run?.phase === 'night' && zombies().length >= 40); i++) await play(300, nearCore, zombies, full?.run?.phase === 'night');
      await play(1500, nearCore, zombies);
      await shot('zom-night');
      break;
    }
    default: console.error(`unknown view ${view}`);
  }
}
chrome.kill();
for (const e of exceptions) console.log(`exception: ${e}`);
process.exit(exceptions.length ? 1 : 0);
