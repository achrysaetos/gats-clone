/// <reference types="node" />
// Usage: LAG=<one-way ms> JITTER=<ms> node muzzle.ts <run-dir> [seconds=15]
// Two lagged browsers walk the map's paths to each other in FFA (failing when they never meet), then strafe, turn and tap the pistol beside each other. For every round the
// first page draws, shrapnel aside, it measures how far its first drawn position sits from the drawn muzzle of whoever fired it.
import { appendFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { GUNS } from '../../../../src/shared/defs.ts';
import type { WallView } from '../../../../src/shared/protocol.ts';
import { dirKey, hold, joinFromMenu, navGridFor, openPage, pathStep, respawnIfDead, sleep, type Dir, type Page } from './lib/browser.ts';

const RUN = process.argv[2];
if (!RUN) { console.error('usage: LAG=<ms> JITTER=<ms> node muzzle.ts <run-dir> [seconds]'); process.exit(2); }
const SECONDS = Number(process.argv[3] ?? 15);
const LAG = Number(process.env.LAG ?? 0);
const JITTER = Number(process.env.JITTER ?? 0);
const BASE = `http://localhost:${readFileSync(join(RUN, 'port'), 'utf8').trim()}`;
const EV = join(RUN, 'evidence');
mkdirSync(EV, { recursive: true });
const LOG = join(EV, 'muzzle.log');
const VIEW = { w: 1280, h: 800 };
const TAP_MS = GUNS.pistol.fireMs + 40;
const STRAFE_MS = 500;
const TURN_RAD_PER_S = 3;
const MAX_GAP = 25;
const NEAR = 380;
const MIN_ROUNDS = 5;
const log = (line: string) => { console.log(line); appendFileSync(LOG, line + '\n'); };

type Round = { id: number; own: boolean; owner: number; gun: string | null; x: number; y: number; muzzle: { x: number; y: number } | null };
type Arena = { worldSize: number; walls: WallView[] };
type Browser = Page & { id: number; map: () => Arena | null };

async function open(name: string): Promise<Browser> {
  let id: number | null = null;
  let map: Arena | null = null;
  const page = await openPage({
    profile: 'skirmish-muzzle-',
    viewport: { width: VIEW.w, height: VIEW.h },
    onEvent: (method, params) => {
      if (method !== 'Network.webSocketFrameReceived') return;
      const msg = JSON.parse(params.response.payloadData);
      if (msg.t === 'welcome') id = msg.id;
      if (msg.t === 'welcome' || msg.t === 'walls') map = { worldSize: msg.worldSize, walls: msg.walls };
    },
  });
  await page.cdp('Page.navigate', { url: `${BASE}/?dev&lag=${LAG}&jitter=${JITTER}` });
  await joinFromMenu(page, { name, loadout: { weapon: 'pistol', armor: 'none', color: 'red' } });
  for (let i = 0; i < 50 && id === null; i++) await sleep(100);
  if (id === null) throw new Error(`${name} did not join`);
  return { ...page, id, map: () => map };
}

const where = async (b: Browser): Promise<{ x: number; y: number }> => b.js(`skirmishDev.drawnSelf()`);

async function towards(b: Browser, partner: Browser): Promise<Dir[]> {
  const [a, p] = await Promise.all([where(b), where(partner)]);
  if (Math.hypot(p.x - a.x, p.y - a.y) < NEAR) return [];
  const m = b.map();
  return pathStep(navGridFor(m?.worldSize ?? 0, m?.walls ?? []), a, p);
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

async function play(b: Browser, partner: Browser, untilAt: number, onTap: (n: number) => Promise<void>) {
  const start = performance.now();
  let held: Dir[] = ['right'];
  let strafe: Dir = 'right';
  await dirKey(b, 'keyDown', 'right');
  let nextSwitch = start + STRAFE_MS, nextTap = start, taps = 0;
  while (performance.now() < untilAt) {
    const now = performance.now();
    await respawnIfDead(b);
    if (now >= nextSwitch) {
      for (const k of held) await dirKey(b, 'keyUp', k);
      const back = await towards(b, partner);
      strafe = strafe === 'right' ? 'left' : 'right';
      held = back.length ? back : [strafe];
      for (const k of held) await dirKey(b, 'keyDown', k);
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
  for (const k of held) await dirKey(b, 'keyUp', k);
}

const shooter = await open('Shooter');
const other = await open('Other');
const met = await gather(shooter, other, performance.now() + 45_000);
log(`${met ? 'ok  ' : 'FAIL'} the two browsers met within ${NEAR}px before shooting`);
if (!met) { log('RESULT FAIL'); shooter.close(); other.close(); process.exit(1); }
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
log(`${serverCopies === 0 ? 'ok  ' : 'FAIL'} the server's copies of the two humans' rounds are not drawn while the page draws them (${serverCopies} drawn${serverCopies ? `, first: ${JSON.stringify(copies.slice(0, 3))}` : ''})`);
const botCopies = rounds.filter((r) => !r.own && r.owner !== other.id && r.id > 0);
log(`note ${botCopies.length} server copies of bot rounds drawn, ${botCopies.filter((r) => r.muzzle).length} with their shooter in view`);
const pass = checks.every(Boolean) && serverCopies === 0 && exceptions.length === 0;
log(pass ? 'RESULT PASS' : 'RESULT FAIL');
shooter.close(); other.close();
process.exit(pass ? 0 : 1);
