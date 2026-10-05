/// <reference types="node" />
// Usage: LAG=<one-way ms> JITTER=<ms> node firefeel.ts <run-dir>
// One muted browser taps the pistol in FFA, then spams it through an empty magazine and a reload, then a second holds
// the SMG down. Each measures how long after the real mousedown the page draws your round, flash and gun kick and
// schedules your shot sound, and checks the page plays exactly one sound and one flash per shot the server fired.
import { spawn, type ChildProcess } from 'node:child_process';
import { appendFileSync, mkdirSync, mkdtempSync, readFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import WebSocket from 'ws';
import { GUNS, type GunId } from '../../../../src/shared/defs.ts';
import { killOnExit } from '../../../../scripts/kill-on-exit.ts';

const RUN = process.argv[2];
if (!RUN) { console.error('usage: LAG=<ms> JITTER=<ms> node firefeel.ts <run-dir>'); process.exit(2); }
const LAG = Number(process.env.LAG ?? 0);
const JITTER = Number(process.env.JITTER ?? 0);
const BASE = `http://localhost:${readFileSync(join(RUN, 'port'), 'utf8').trim()}`;
const EV = join(RUN, 'evidence');
mkdirSync(EV, { recursive: true });
const LOG = join(EV, 'firefeel.log');
const CHROME = process.env.CHROME ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const VIEW = { w: 1280, h: 800 };
const CUES = ['round', 'flash', 'kick', 'sound'] as const;
type Cue = (typeof CUES)[number];
const MAX_MEDIAN_MS = 20;
const MAX_P90_MS = 34;
const TAPS = 10;
const HOLD_MS = 1200;
const HOLDS = Number(process.env.HOLDS ?? 3);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const log = (line: string) => { console.log(line); appendFileSync(LOG, line + '\n'); };
const freePort = () => new Promise<number>((r) => { const s = createServer().listen(0, () => { const p = (s.address() as { port: number }).port; s.close(() => r(p)); }); });

type Felt = { cue: Cue | 'reject' | 'late'; at: number };
type Browser = { chrome: ChildProcess; cdp: (m: string, p?: object) => Promise<any>; js: (e: string) => Promise<any>; id: number; serverShots: () => number; exceptions: string[] };

async function open(name: string, weapon: GunId): Promise<Browser> {
  const port = await freePort();
  const chrome = killOnExit(spawn(CHROME, ['--headless=new', '--mute-audio', `--remote-debugging-port=${port}`, `--user-data-dir=${mkdtempSync(join(tmpdir(), 'skirmish-firefeel-'))}`,
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
  let shots = 0;
  const exceptions: string[] = [];
  const pending = new Map<number, (v: any) => void>();
  page.on('message', (raw) => {
    const m = JSON.parse(String(raw));
    if (m.id && pending.has(m.id)) { pending.get(m.id)!(m.result); pending.delete(m.id); return; }
    if (m.method === 'Network.webSocketFrameReceived') {
      const msg = JSON.parse(m.params.response.payloadData);
      if (msg.t === 'welcome') id = msg.id;
      if (msg.t === 'snap') shots += (msg.events ?? []).filter((e: { e: string; owner?: number }) => e.e === 'shot' && e.owner === id).length;
    } else if (m.method === 'Runtime.exceptionThrown') exceptions.push(m.params.exceptionDetails.exception?.description ?? m.params.exceptionDetails.text);
  });
  const cdp = (method: string, params: object = {}): Promise<any> => new Promise((r) => { const i = nextId++; pending.set(i, r); page.send(JSON.stringify({ id: i, method, params })); });
  const js = async (expr: string) => (await cdp('Runtime.evaluate', { expression: expr, returnByValue: true })).result?.value;
  await cdp('Runtime.enable'); await cdp('Page.enable'); await cdp('Network.enable');
  await cdp('Emulation.setDeviceMetricsOverride', { width: VIEW.w, height: VIEW.h, deviceScaleFactor: 1, mobile: false });
  await cdp('Page.navigate', { url: `${BASE}/?dev&lag=${LAG}&jitter=${JITTER}` });
  for (let i = 0; i < 50 && (await js(`document.querySelectorAll('#servers .server').length`)) !== 3; i++) await sleep(100);
  await js(`localStorage.setItem('skirmish.loadout', JSON.stringify({ weapon: '${weapon}', armor: 'none', color: 'red' })); location.reload()`);
  await sleep(500);
  for (let i = 0; i < 50 && (await js(`document.querySelectorAll('#servers .server').length`)) !== 3; i++) await sleep(100);
  await js(`document.querySelector('#servers .server').click(); document.getElementById('name').value = '${name}'; document.getElementById('play').click()`);
  for (let i = 0; i < 50 && id === null; i++) await sleep(100);
  if (id === null) throw new Error(`${name} did not join`);
  await js(`window.downs = []; window.addEventListener('mousedown', () => window.downs.push(performance.now()), { capture: true })`);
  await sleep(1500);
  return { chrome, cdp, js, id, serverShots: () => shots, exceptions };
}

const AIM = { x: VIEW.w / 2 + 200, y: VIEW.h / 2 - 60 };
const mouse = (b: Browser, type: 'mousePressed' | 'mouseReleased') => b.cdp('Input.dispatchMouseEvent', { type, ...AIM, button: 'left', clickCount: 1 });
const reload = async (b: Browser) => {
  await b.cdp('Input.dispatchKeyEvent', { type: 'keyDown', code: 'KeyR', key: 'r', windowsVirtualKeyCode: 82 });
  await sleep(80);
  await b.cdp('Input.dispatchKeyEvent', { type: 'keyUp', code: 'KeyR', key: 'r', windowsVirtualKeyCode: 82 });
};
let deaths = 0;
const respawnIfDead = async (b: Browser) => {
  if (!(await b.js(`!document.getElementById('death').hidden`))) return false;
  deaths++;
  for (let i = 0; i < 60 && (await b.js(`document.getElementById('respawn').disabled`)); i++) await sleep(100);
  await b.js(`document.getElementById('respawn').click()`);
  await sleep(1500);
  return true;
};
const felt = async (b: Browser): Promise<Felt[]> => b.js(`skirmishDev.fireFeel()`);
const downs = async (b: Browser): Promise<number[]> => b.js(`window.downs.splice(0)`);

/** For each mousedown, how long until the first of each cue, if it came before the next mousedown. */
function latencies(ds: number[], fs: Felt[]): Record<Cue, number[]> {
  const out = { round: [], flash: [], kick: [], sound: [] } as Record<Cue, number[]>;
  ds.forEach((d, i) => {
    const end = ds[i + 1] ?? Infinity;
    for (const cue of CUES) {
      const first = fs.find((f) => f.cue === cue && f.at >= d && f.at < end);
      if (first) out[cue].push(first.at - d);
    }
  });
  return out;
}

const q = (xs: number[], k: number) => { const s = [...xs].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.floor(s.length * k))] ?? NaN; };
const fmt = (xs: number[]) => xs.length ? `n ${xs.length}  median ${q(xs, 0.5).toFixed(1)}ms  p90 ${q(xs, 0.9).toFixed(1)}ms  max ${Math.max(...xs).toFixed(1)}ms` : 'none';
const results: boolean[] = [];
const check = (ok: boolean, line: string) => { results.push(ok); log(`${ok ? 'ok  ' : 'FAIL'} ${line}`); };

function checkLatency(label: string, lat: Record<Cue, number[]>, expected: number) {
  for (const cue of CUES) {
    const xs = lat[cue];
    log(`${label} ${cue}: ${fmt(xs)}`);
    check(xs.length >= expected && q(xs, 0.5) <= MAX_MEDIAN_MS && q(xs, 0.9) <= MAX_P90_MS, `${label}: own ${cue} within ${MAX_MEDIAN_MS}ms median and ${MAX_P90_MS}ms p90 of mousedown on ${expected} presses (${xs.length} seen)`);
  }
}

/** One sound and one flash per shot the server fired, and none it did not. */
function checkCounts(label: string, { felt: fs, fired }: { felt: Felt[]; fired: number }) {
  const count = (c: Felt['cue']) => fs.filter((f) => f.cue === c).length;
  log(`${label} counts: server shots ${fired}  sounds ${count('sound')}  flashes ${count('flash')}  kicks ${count('kick')}  rejected predictions ${count('reject')}  drawn late ${count('late')}`);
  check(fired > 0 && count('sound') === fired && count('flash') === fired && count('reject') === 0 && count('late') === 0, `${label}: one sound and one flash per server shot, each drawn on time, none taken back`);
}

/** Runs a phase until one passes with no death in it, so a bot's kill never reads as a lost or phantom shot. */
async function phase(label: string, b: Browser, settleMs: number, body: () => Promise<void>): Promise<{ felt: Felt[]; downs: number[]; fired: number }> {
  for (let attempt = 1; ; attempt++) {
    await respawnIfDead(b);
    await felt(b); await downs(b);
    const deathsBefore = deaths, before = b.serverShots();
    await body();
    await sleep(settleMs);
    await respawnIfDead(b);
    const out = { felt: await felt(b), downs: await downs(b), fired: b.serverShots() - before };
    if (deaths === deathsBefore || attempt === 6) return out;
    log(`note ${label}: died mid-phase, running it again`);
  }
}

const tap = async (b: Browser, holdMs: number) => {
  await respawnIfDead(b);
  await mouse(b, 'mousePressed');
  await sleep(holdMs);
  await mouse(b, 'mouseReleased');
};

log(`LAG=${LAG} JITTER=${JITTER}`);
const roundTrip = 2 * LAG + JITTER;

const pistol = await open('Tapper', 'pistol');
await mouse(pistol, 'mouseReleased');
let p = await phase('tap', pistol, roundTrip + 400, async () => {
  for (let i = 0; i < TAPS; i++) {
    await tap(pistol, 40);
    await sleep(GUNS.pistol.fireMs + 60 + Math.random() * 40);
  }
});
checkLatency('tap', latencies(p.downs, p.felt), TAPS);
checkCounts('tap', p);

await reload(pistol);
await sleep(GUNS.pistol.reloadMs + 400);
p = await phase('spam', pistol, GUNS.pistol.reloadMs + roundTrip + 600, async () => {
  for (let i = 0; i < 3 * GUNS.pistol.mag; i++) {
    await tap(pistol, 20);
    await sleep(60);
  }
});
checkCounts('spam through empty mag and reload', p);

await reload(pistol);
await sleep(GUNS.pistol.reloadMs + 400);
await pistol.cdp('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
await pistol.js(`window.addEventListener('pointerdown', (e) => { if (e.pointerType === 'touch') window.aimStart = true; }, { capture: true });
  window.addEventListener('pointermove', (e) => { if (e.pointerType === 'touch' && window.aimStart) { window.aimStart = false; window.downs.push(performance.now()); } }, { capture: true })`);
const touch = (type: string, points: { x: number; y: number; id: number }[]) => pistol.cdp('Input.dispatchTouchEvent', { type, touchPoints: points });
p = await phase('touch', pistol, roundTrip + 400, async () => {
  for (let i = 0; i < TAPS; i++) {
    await respawnIfDead(pistol);
    await touch('touchStart', [{ x: VIEW.w - 300, y: VIEW.h / 2, id: 7 }]);
    await sleep(30);
    await touch('touchMove', [{ x: VIEW.w - 260, y: VIEW.h / 2 - 10, id: 7 }]);
    await sleep(60);
    await touch('touchEnd', []);
    await sleep(GUNS.pistol.fireMs + 60 + Math.random() * 40);
  }
});
checkLatency('touch', latencies(p.downs, p.felt), TAPS);
checkCounts('touch', p);
pistol.chrome.kill();

const smg = await open('Holder', 'smg');
const gaps: number[] = [];
const firstSounds: number[] = [];
for (let i = 0; i < HOLDS; i++) {
  p = await phase(`hold ${i + 1}`, smg, roundTrip + 300, () => tap(smg, HOLD_MS));
  const sounds = p.felt.filter((x) => x.cue === 'sound').map((x) => x.at);
  gaps.push(...sounds.slice(1).map((t, k) => t - sounds[k]!));
  firstSounds.push(...latencies(p.downs, p.felt).sound);
  checkCounts(`hold ${i + 1}`, p);
  await reload(smg);
  await sleep(GUNS.smg.reloadMs + 300);
}
const mean = gaps.reduce((a, b) => a + b, 0) / gaps.length;
log(`hold first sound: ${fmt(firstSounds)}`);
log(`hold cadence between own shot sounds: ${fmt(gaps)}  mean ${mean.toFixed(1)}ms (fireMs ${GUNS.smg.fireMs})`);
check(firstSounds.length === HOLDS && q(firstSounds, 0.5) <= MAX_MEDIAN_MS, `hold: first own shot sound within ${MAX_MEDIAN_MS}ms of mousedown`);
check(Math.abs(mean - GUNS.smg.fireMs) <= GUNS.smg.fireMs * 0.1, `hold: mean gap between own shots within 10% of fireMs (${mean.toFixed(1)}ms)`);
smg.chrome.kill();

if (deaths) log(`note respawned ${deaths} times mid-run`);
const exceptions = [...pistol.exceptions, ...smg.exceptions];
for (const e of exceptions) log(`page exception: ${e}`);
const pass = results.every(Boolean) && exceptions.length === 0;
log(pass ? 'RESULT PASS' : 'RESULT FAIL');
process.exit(pass ? 0 : 1);
