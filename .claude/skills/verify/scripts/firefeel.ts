/// <reference types="node" />
// Usage: LAG=<one-way ms> JITTER=<ms> node firefeel.ts <run-dir>
// One muted browser taps the pistol in FFA, then spams it through an empty magazine and a reload, then a second holds
// the SMG down. Each measures how long after the real mousedown the page draws your round, flash and gun kick and
// schedules your shot sound, and checks the page plays exactly one sound and one flash per shot the server fired.
import { appendFileSync, mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { GUNS, type GunId, type WeaponId } from '../../../../src/shared/defs.ts';
import { joinFromMenu, key, openPage, respawnIfDead as respawnWhenReady, sleep, type Page } from './lib/browser.ts';

const RUN = process.argv[2];
if (!RUN) { console.error('usage: LAG=<ms> JITTER=<ms> node firefeel.ts <run-dir>'); process.exit(2); }
const LAG = Number(process.env.LAG ?? 0);
const JITTER = Number(process.env.JITTER ?? 0);
const BASE = `http://localhost:${readFileSync(join(RUN, 'port'), 'utf8').trim()}`;
const EV = join(RUN, 'evidence');
mkdirSync(EV, { recursive: true });
const LOG = join(EV, 'firefeel.log');
const VIEW = { w: 1280, h: 800 };
const CUES = ['round', 'flash', 'kick', 'sound'] as const;
type Cue = (typeof CUES)[number];
const MAX_MEDIAN_MS = 20;
const MAX_P90_MS = 34;
const TAPS = 10;
const HOLD_MS = 1200;
const HOLDS = Number(process.env.HOLDS ?? 3);
const log = (line: string) => { console.log(line); appendFileSync(LOG, line + '\n'); };

type Felt = { cue: Cue | 'reject' | 'late'; at: number };
type Browser = Page & { gun: GunId; id: number; serverShots: () => number; roundOverSnaps: () => number };

async function open(name: string, weapon: WeaponId): Promise<Browser> {
  let id: number | null = null;
  let shots = 0, roundOver = 0;
  const page = await openPage({
    profile: 'skirmish-firefeel-',
    viewport: { width: VIEW.w, height: VIEW.h },
    onEvent: (method, params) => {
      if (method !== 'Network.webSocketFrameReceived') return;
      const msg = JSON.parse(params.response.payloadData);
      if (msg.t === 'welcome') id = msg.id;
      if (msg.t === 'snap' && msg.match?.winner) roundOver++;
      if (msg.t === 'snap') shots += (msg.events ?? []).filter((e: { e: string; owner?: number }) => e.e === 'shot' && e.owner === id).length;
    },
  });
  await page.cdp('Page.navigate', { url: `${BASE}/?dev&lag=${LAG}&jitter=${JITTER}` });
  await joinFromMenu(page, { name, loadout: { weapon, armor: 'none', color: 'red' } });
  for (let i = 0; i < 50 && id === null; i++) await sleep(100);
  if (id === null) throw new Error(`${name} did not join`);
  await page.js(`window.downs = []; window.addEventListener('mousedown', () => window.downs.push(performance.now()), { capture: true })`);
  await sleep(1500);
  return { ...page, gun: weapon, id, serverShots: () => shots, roundOverSnaps: () => roundOver };
}

const AIM = { x: VIEW.w / 2 + 200, y: VIEW.h / 2 - 60 };
const mouse = (b: Browser, type: 'mousePressed' | 'mouseReleased') => b.cdp('Input.dispatchMouseEvent', { type, ...AIM, button: 'left', clickCount: 1 });
const reload = async (b: Browser) => {
  await key(b, 'keyDown', 'KeyR', 'r');
  await sleep(80);
  await key(b, 'keyUp', 'KeyR', 'r');
};
const refillMagazine = async (b: Browser) => {
  await reload(b);
  await sleep(GUNS[b.gun].reloadMs + 300);
};
let deaths = 0;
const respawnIfDead = async (b: Browser) => {
  if (!(await b.js(`!document.getElementById('death').hidden`))) return false;
  deaths++;
  await respawnWhenReady(b, 6000);
  await sleep(1500);
  return true;
};
const felt = async (b: Browser): Promise<Felt[]> => b.js(`skirmishDev.fireFeel()`);
const downs = async (b: Browser): Promise<number[]> => b.js(`window.downs.splice(0)`);

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

function checkCounts(label: string, { felt: fs, fired }: { felt: Felt[]; fired: number }) {
  const count = (c: Felt['cue']) => fs.filter((f) => f.cue === c).length;
  log(`${label} counts: server shots ${fired}  sounds ${count('sound')}  flashes ${count('flash')}  kicks ${count('kick')}  rejected predictions ${count('reject')}  drawn late ${count('late')}`);
  check(fired > 0 && count('sound') === fired && count('flash') === fired && count('reject') === 0 && count('late') === 0, `${label}: one sound and one flash per server shot, each drawn on time, none taken back`);
}

async function runUndisturbed(label: string, b: Browser, settleMs: number, body: () => Promise<void>): Promise<{ felt: Felt[]; downs: number[]; fired: number }> {
  for (let attempt = 1; ; attempt++) {
    await respawnIfDead(b);
    await refillMagazine(b);
    await felt(b); await downs(b);
    const deathsBefore = deaths, roundOverBefore = b.roundOverSnaps(), before = b.serverShots();
    await body();
    await sleep(settleMs);
    await respawnIfDead(b);
    const out = { felt: await felt(b), downs: await downs(b), fired: b.serverShots() - before };
    if ((deaths === deathsBefore && b.roundOverSnaps() === roundOverBefore) || attempt === 6) return out;
    log(`note ${label}: died or the round ended mid-phase, running it again`);
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
let p = await runUndisturbed('tap', pistol, roundTrip + 400, async () => {
  for (let i = 0; i < TAPS; i++) {
    await tap(pistol, 40);
    await sleep(GUNS.pistol.fireMs + 60 + Math.random() * 40);
  }
});
checkLatency('tap', latencies(p.downs, p.felt), TAPS);
checkCounts('tap', p);

p = await runUndisturbed('spam', pistol, GUNS.pistol.reloadMs + roundTrip + 600, async () => {
  for (let i = 0; i < 3 * GUNS.pistol.mag; i++) {
    await tap(pistol, 20);
    await sleep(60);
  }
});
checkCounts('spam through empty mag and reload', p);

await pistol.cdp('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
await pistol.js(`window.addEventListener('pointerdown', (e) => { if (e.pointerType === 'touch') window.aimStart = true; }, { capture: true });
  window.addEventListener('pointermove', (e) => { if (e.pointerType === 'touch' && window.aimStart) { window.aimStart = false; window.downs.push(performance.now()); } }, { capture: true })`);
const touch = (type: string, points: { x: number; y: number; id: number }[]) => pistol.cdp('Input.dispatchTouchEvent', { type, touchPoints: points });
p = await runUndisturbed('touch', pistol, roundTrip + 400, async () => {
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
pistol.close();

const smg = await open('Holder', 'smg');
const gaps: number[] = [];
const firstSounds: number[] = [];
for (let i = 0; i < HOLDS; i++) {
  p = await runUndisturbed(`hold ${i + 1}`, smg, roundTrip + 300, () => tap(smg, HOLD_MS));
  const sounds = p.felt.filter((x) => x.cue === 'sound').map((x) => x.at);
  gaps.push(...sounds.slice(1).map((t, k) => t - sounds[k]!));
  firstSounds.push(...latencies(p.downs, p.felt).sound);
  checkCounts(`hold ${i + 1}`, p);
}
const mean = gaps.reduce((a, b) => a + b, 0) / gaps.length;
log(`hold first sound: ${fmt(firstSounds)}`);
log(`hold cadence between own shot sounds: ${fmt(gaps)}  mean ${mean.toFixed(1)}ms (fireMs ${GUNS.smg.fireMs})`);
check(firstSounds.length === HOLDS && q(firstSounds, 0.5) <= MAX_MEDIAN_MS, `hold: first own shot sound within ${MAX_MEDIAN_MS}ms of mousedown`);
check(Math.abs(mean - GUNS.smg.fireMs) <= GUNS.smg.fireMs * 0.1, `hold: mean gap between own shots within 10% of fireMs (${mean.toFixed(1)}ms)`);
smg.close();

if (deaths) log(`note respawned ${deaths} times mid-run`);
const exceptions = [...pistol.exceptions, ...smg.exceptions];
for (const e of exceptions) log(`page exception: ${e}`);
const pass = results.every(Boolean) && exceptions.length === 0;
log(pass ? 'RESULT PASS' : 'RESULT FAIL');
process.exit(pass ? 0 : 1);
