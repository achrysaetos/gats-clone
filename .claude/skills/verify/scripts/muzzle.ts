/// <reference types="node" />
// Usage: LAG=<one-way ms> JITTER=<ms> node muzzle.ts <run-dir> [seconds=15]
// Two lagged browsers walk together in FFA, then strafe, turn and tap the pistol beside each other. For every round the
// first page draws, shrapnel aside, it measures how far its first drawn position sits from the drawn muzzle of whoever fired it.
import { spawn, type ChildProcess } from 'node:child_process';
import { appendFileSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import WebSocket from 'ws';
import { GUNS } from '../../../../src/shared/defs.ts';
import { killOnExit } from '../../../../scripts/kill-on-exit.ts';

const RUN = process.argv[2];
if (!RUN) { console.error('usage: LAG=<ms> JITTER=<ms> node muzzle.ts <run-dir> [seconds]'); process.exit(2); }
const SECONDS = Number(process.argv[3] ?? 15);
const LAG = Number(process.env.LAG ?? 0);
const JITTER = Number(process.env.JITTER ?? 0);
const BASE = `http://localhost:${readFileSync(join(RUN, 'port'), 'utf8').trim()}`;
const EV = join(RUN, 'evidence');
mkdirSync(EV, { recursive: true });
const LOG = join(EV, 'muzzle.log');
const CHROME = process.env.CHROME ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const VIEW = { w: 1280, h: 800 };
const TAP_MS = GUNS.pistol.fireMs + 40;
const STRAFE_MS = 500;
const TURN_RAD_PER_S = 3;
const MAX_GAP = 25;
const NEAR = 380;
const MIN_ROUNDS = 5;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const log = (line: string) => { console.log(line); appendFileSync(LOG, line + '\n'); };
const freePort = () => new Promise<number>((r) => { const s = createServer().listen(0, () => { const p = (s.address() as { port: number }).port; s.close(() => r(p)); }); });

type Round = { id: number; own: boolean; owner: number; gun: string | null; x: number; y: number; muzzle: { x: number; y: number } | null };
type Browser = { chrome: ChildProcess; cdp: (m: string, p?: object) => Promise<any>; js: (e: string) => Promise<any>; id: number; exceptions: string[] };

async function open(name: string): Promise<Browser> {
  const port = await freePort();
  const chrome = killOnExit(spawn(CHROME, ['--headless=new', '--mute-audio', `--remote-debugging-port=${port}`, `--user-data-dir=${mkdtempSync(join(tmpdir(), 'skirmish-muzzle-'))}`,
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
  let id: number | null = null;
  const exceptions: string[] = [];
  const pending = new Map<number, (v: any) => void>();
  page.on('message', (raw) => {
    const m = JSON.parse(String(raw));
    if (m.id && pending.has(m.id)) { pending.get(m.id)!(m.result); pending.delete(m.id); return; }
    if (m.method === 'Network.webSocketFrameReceived') {
      const msg = JSON.parse(m.params.response.payloadData);
      if (msg.t === 'welcome') id = msg.id;
    } else if (m.method === 'Runtime.exceptionThrown') exceptions.push(m.params.exceptionDetails.exception?.description ?? m.params.exceptionDetails.text);
  });
  const cdp = (method: string, params: object = {}): Promise<any> => new Promise((r) => { const i = nextId++; pending.set(i, r); page.send(JSON.stringify({ id: i, method, params })); });
  const js = async (expr: string) => (await cdp('Runtime.evaluate', { expression: expr, returnByValue: true })).result?.value;
  await cdp('Runtime.enable'); await cdp('Page.enable'); await cdp('Network.enable');
  await cdp('Emulation.setDeviceMetricsOverride', { width: VIEW.w, height: VIEW.h, deviceScaleFactor: 1, mobile: false });
  await cdp('Page.navigate', { url: `${BASE}/?dev&lag=${LAG}&jitter=${JITTER}` });
  for (let i = 0; i < 50 && (await js(`document.querySelectorAll('#servers .server').length`)) !== 3; i++) await sleep(100);
  await js(`localStorage.setItem('skirmish.loadout', JSON.stringify({ weapon: 'pistol', armor: 'none', color: 'red' })); location.reload()`);
  await sleep(500);
  for (let i = 0; i < 50 && (await js(`document.querySelectorAll('#servers .server').length`)) !== 3; i++) await sleep(100);
  await js(`document.querySelector('#servers .server').click(); document.getElementById('name').value = '${name}'; document.getElementById('play').click()`);
  for (let i = 0; i < 50 && id === null; i++) await sleep(100);
  if (id === null) throw new Error(`${name} did not join`);
  return { chrome, cdp, js, id, exceptions };
}

const KEYS = { left: ['KeyA', 'a', 65], right: ['KeyD', 'd', 68], up: ['KeyW', 'w', 87], down: ['KeyS', 's', 83] } as const;
type Key = keyof typeof KEYS;
const key = (b: Browser, type: 'keyDown' | 'keyUp', k: keyof typeof KEYS) => b.cdp('Input.dispatchKeyEvent', { type, code: KEYS[k][0], key: KEYS[k][1], windowsVirtualKeyCode: KEYS[k][2] });

const where = async (b: Browser): Promise<{ x: number; y: number }> => b.js(`skirmishDev.drawnSelf()`);
const respawnIfDead = async (b: Browser) => {
  if (await b.js(`!document.getElementById('death').hidden && !document.getElementById('respawn').disabled`)) await b.js(`document.getElementById('respawn').click()`);
};

/** The keys that walk `b` toward `partner`, or none when they are already close. */
async function towards(b: Browser, partner: Browser): Promise<Key[]> {
  const [a, p] = await Promise.all([where(b), where(partner)]);
  const dx = p.x - a.x, dy = p.y - a.y;
  if (Math.hypot(dx, dy) < NEAR) return [];
  const keys: Key[] = [];
  if (Math.abs(dx) > 60) keys.push(dx > 0 ? 'right' : 'left');
  if (Math.abs(dy) > 60) keys.push(dy > 0 ? 'down' : 'up');
  return keys;
}

async function gather(a: Browser, b: Browser, untilAt: number) {
  while (performance.now() < untilAt) {
    await respawnIfDead(a); await respawnIfDead(b);
    const [ka, kb] = await Promise.all([towards(a, b), towards(b, a)]);
    if (!ka.length && !kb.length) return true;
    await Promise.all([hold(a, ka, 300), hold(b, kb, 300)]);
  }
  return false;
}

async function hold(b: Browser, keys: Key[], ms: number) {
  for (const k of keys) await key(b, 'keyDown', k);
  await sleep(ms);
  for (const k of keys) await key(b, 'keyUp', k);
}

async function play(b: Browser, partner: Browser, untilAt: number, onTap: (n: number) => Promise<void>) {
  const start = performance.now();
  let held: Key[] = ['right'];
  let strafe: Key = 'right';
  await key(b, 'keyDown', 'right');
  let nextSwitch = start + STRAFE_MS, nextTap = start, taps = 0;
  while (performance.now() < untilAt) {
    const now = performance.now();
    await respawnIfDead(b);
    if (now >= nextSwitch) {
      for (const k of held) await key(b, 'keyUp', k);
      const back = await towards(b, partner);
      strafe = strafe === 'right' ? 'left' : 'right';
      held = back.length ? back : [strafe];
      for (const k of held) await key(b, 'keyDown', k);
      nextSwitch = now + STRAFE_MS;
    }
    const a = ((now - start) / 1000) * TURN_RAD_PER_S;
    const mx = VIEW.w / 2 + Math.cos(a) * 220, my = VIEW.h / 2 + Math.sin(a) * 220;
    await b.cdp('Input.dispatchMouseEvent', { type: 'mouseMoved', x: mx, y: my, button: 'none' });
    if (now >= nextTap) {
      await b.cdp('Input.dispatchMouseEvent', { type: 'mousePressed', x: mx, y: my, button: 'left', clickCount: 1 });
      await b.cdp('Input.dispatchMouseEvent', { type: 'mouseReleased', x: mx, y: my, button: 'left', clickCount: 1 });
      nextTap = now + TAP_MS;
      await onTap(++taps);
    }
    await sleep(16);
  }
  for (const k of held) await key(b, 'keyUp', k);
}

const shooter = await open('Shooter');
const other = await open('Other');
const met = await gather(shooter, other, performance.now() + 30_000);
log(`note the two browsers ${met ? 'met' : 'did not meet'} within ${NEAR}px before shooting`);
await shooter.js(`skirmishDev.firstRounds()`);
const rounds: Round[] = [];
/** The shooter's view `after` ms past a shot's round trip. */
async function screenshots(whose: string, afters: number[]) {
  const start = performance.now();
  for (const after of afters) {
    await sleep(start + 2 * LAG + after - performance.now());
    const { data } = await shooter.cdp('Page.captureScreenshot', { format: 'png' });
    writeFileSync(join(EV, `muzzle-${whose}-lag${LAG}-${after}ms.png`), Buffer.from(data, 'base64'));
  }
}
const collect = async () => {
  rounds.push(...((await shooter.js(`skirmishDev.firstRounds()`)) as Round[]).filter((r) => r.gun !== null));
};
const until = performance.now() + SECONDS * 1000;
await Promise.all([
  play(shooter, other, until, (n) => (n === 5 ? screenshots('own', [30, 80, 150]) : Promise.resolve())),
  play(other, shooter, until, (n) => (n === 8 ? screenshots('other', [130, 180]) : Promise.resolve())),
  (async () => { while (performance.now() < until) { await collect(); await sleep(100); } })(),
]);
await sleep(500);
await collect();

const gap = (r: Round) => (r.muzzle ? Math.hypot(r.x - r.muzzle.x, r.y - r.muzzle.y) : null);
const stats = (label: string, rs: Round[]) => {
  const g = rs.map(gap).filter((v): v is number => v !== null).sort((a, b) => a - b);
  if (!g.length) { log(`${label}: no rounds with a visible shooter`); return undefined; }
  const q = (k: number) => Math.round(g[Math.min(g.length - 1, Math.floor(g.length * k))]!);
  log(`${label}: n ${g.length}  median ${q(0.5)}px  p90 ${q(0.9)}px  max ${Math.round(g[g.length - 1]!)}px`);
  return { median: q(0.5), n: g.length };
};
function check(label: string, r: { median: number; n: number } | undefined) {
  const ok = !!r && r.n >= MIN_ROUNDS && r.median <= MAX_GAP;
  log(`${ok ? 'ok  ' : 'FAIL'} ${label} (median ${r ? `${r.median}px over ${r.n}` : 'none'})`);
  return ok;
}
log(`LAG=${LAG} JITTER=${JITTER} ${SECONDS}s`);
const ownMedian = stats('own rounds', rounds.filter((r) => r.own));
const otherMedian = stats('lagged human Other', rounds.filter((r) => !r.own && r.owner === other.id));
stats('bots', rounds.filter((r) => !r.own && r.owner !== other.id));
const exceptions = [...shooter.exceptions, ...other.exceptions];
for (const e of exceptions) log(`page exception: ${e}`);
const checks = [
  check(`own rounds start within ${MAX_GAP}px of the drawn muzzle`, ownMedian),
  check(`the other human's rounds start within ${MAX_GAP}px of their drawn muzzle`, otherMedian),
];
// A shooter out of view sends no shot event, so their rounds can only come from the server.
const copies = rounds.filter((r) => (r.own || r.owner === other.id) && r.id > 0 && r.muzzle);
const serverCopies = copies.length;
log(`${serverCopies === 0 ? 'ok  ' : 'FAIL'} the server's copies of the two humans' rounds are not drawn while the page draws them (${serverCopies} drawn${serverCopies ? `: ${JSON.stringify(copies)}` : ''})`);
const botCopies = rounds.filter((r) => !r.own && r.owner !== other.id && r.id > 0);
log(`note ${botCopies.length} server copies of bot rounds drawn, ${botCopies.filter((r) => r.muzzle).length} with their shooter in view`);
const pass = checks.every(Boolean) && serverCopies === 0 && exceptions.length === 0;
log(pass ? 'RESULT PASS' : 'RESULT FAIL');
shooter.chrome.kill(); other.chrome.kill();
process.exit(pass ? 0 : 1);
