/// <reference types="node" />
// Usage: LAG=<one-way ms> JITTER=<ms> node guns.ts <run-dir>
import { appendFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { GUNS, rulesOf, type WeaponId } from '../../../../src/shared/defs.ts';
import { dirKey, joinFromMenu, key, openPage, respawnIfDead, sleep, type Page } from './lib/browser.ts';

const RUN = process.argv[2];
if (!RUN) { console.error('usage: LAG=<ms> JITTER=<ms> node guns.ts <run-dir>'); process.exit(2); }
const LAG = Number(process.env.LAG ?? 0);
const JITTER = Number(process.env.JITTER ?? 0);
const BASE = `http://localhost:${readFileSync(join(RUN, 'port'), 'utf8').trim()}`;
const EV = join(RUN, 'evidence');
mkdirSync(EV, { recursive: true });
const LOG = join(EV, 'guns.log');
const VIEW = { w: 1280, h: 800 };
const AIM = { x: VIEW.w / 2 + 260, y: VIEW.h / 2 - 40 };
const log = (line: string) => { console.log(line); appendFileSync(LOG, line + '\n'); };
const results: boolean[] = [];
const check = (ok: boolean, line: string) => { results.push(ok); log(`${ok ? 'ok  ' : 'FAIL'} ${line}`); };

type Trigger = { gun: string; spray: number; spin: number; reticleGap: number };
type Felt = { cue: string; at: number };
type Browser = Page & { serverShots: () => number };

async function open(name: string, weapon: WeaponId): Promise<Browser> {
  let id: number | null = null;
  let shots = 0;
  const page = await openPage({
    profile: 'skirmish-guns-',
    viewport: { width: VIEW.w, height: VIEW.h },
    onEvent: (method, params) => {
      if (method !== 'Network.webSocketFrameReceived') return;
      const msg = JSON.parse(params.response.payloadData);
      if (msg.t === 'welcome') id = msg.id;
      if (msg.t === 'snap') shots += (msg.events ?? []).filter((e: { e: string; owner?: number }) => e.e === 'shot' && e.owner === id).length;
    },
  });
  await page.cdp('Page.navigate', { url: `${BASE}/?dev&lag=${LAG}&jitter=${JITTER}` });
  await joinFromMenu(page, { name, loadout: { weapon, armor: 'none', color: 'red' } });
  for (let i = 0; i < 50 && id === null; i++) await sleep(100);
  if (id === null) throw new Error(`${name} did not join`);
  await sleep(1500);
  await page.cdp('Input.dispatchMouseEvent', { type: 'mouseMoved', ...AIM });
  await sleep(200);
  return { ...page, serverShots: () => shots };
}

const mouse = (b: Browser, type: 'mousePressed' | 'mouseReleased') => b.cdp('Input.dispatchMouseEvent', { type, ...AIM, button: 'left', clickCount: 1 });
const trigger = (b: Browser): Promise<Trigger> => b.js(`skirmishDev.trigger()`);
const felt = (b: Browser): Promise<Felt[]> => b.js(`skirmishDev.fireFeel()`);
const shot = async (b: Browser, name: string) => {
  const { data } = await b.cdp('Page.captureScreenshot', { format: 'png' });
  writeFileSync(join(EV, name), Buffer.from(data, 'base64'));
  log(`screenshot ${name}`);
};
const crop = async (b: Browser, name: string) => {
  const { data } = await b.cdp('Page.captureScreenshot', { format: 'png', clip: { x: AIM.x - 60, y: AIM.y - 60, width: 120, height: 120, scale: 3 } });
  writeFileSync(join(EV, name), Buffer.from(data, 'base64'));
  log(`screenshot ${name}`);
};
async function ready(b: Browser) {
  await respawnIfDead(b, 6000);
  await key(b, 'keyDown', 'KeyR', 'r'); await sleep(80); await key(b, 'keyUp', 'KeyR', 'r');
  await sleep(4800);
  await felt(b);
}
function checkCounts(label: string, fs: Felt[], fired: number) {
  const count = (c: string) => fs.filter((f) => f.cue === c).length;
  log(`${label} counts: server shots ${fired}  sounds ${count('sound')}  rejected predictions ${count('reject')}  drawn late ${count('late')}`);
  check(fired > 0 && count('sound') === fired && count('reject') === 0 && count('late') === 0, `${label}: every server shot predicted on time, none taken back`);
}

log(`LAG=${LAG} JITTER=${JITTER}`);
const roundTrip = 2 * LAG + JITTER;

const rifle = await open('Sprayer', 'assault');
await ready(rifle);
let before = rifle.serverShots();
const idle = await trigger(rifle);
await crop(rifle, 'guns-assault-idle.png');
await mouse(rifle, 'mousePressed');
const samples: Trigger[] = [];
for (let t = 0; t < 1600; t += 100) { samples.push(await trigger(rifle)); await sleep(100); }
const held = await trigger(rifle);
await crop(rifle, 'guns-assault-held.png');
await shot(rifle, 'guns-assault-held-full.png');
await mouse(rifle, 'mouseReleased');
await sleep(400);
const cooled = await trigger(rifle);
await crop(rifle, 'guns-assault-released.png');
await sleep(roundTrip + 300);
log(`assault reticle gap: idle ${idle.reticleGap.toFixed(1)}px  held ${samples.map((s) => s.reticleGap.toFixed(0)).join(' ')} -> ${held.reticleGap.toFixed(1)}px  400ms after release ${cooled.reticleGap.toFixed(1)}px`);
check(idle.gun === 'assault' && held.reticleGap >= 1.8 * idle.reticleGap, `a held assault rifle's reticle opens to about double (${(held.reticleGap / idle.reticleGap).toFixed(2)}x, spray ${held.spray.toFixed(1)})`);
check(Math.abs(cooled.reticleGap - idle.reticleGap) < 0.5 && cooled.spray === 0, 'it closes again within 400ms of letting go');
checkCounts('assault hold', await felt(rifle), rifle.serverShots() - before);
rifle.close();

const mini = await open('Spinner', 'lmg');
await ready(mini);
const gun = (await trigger(mini)).gun;
check(gun === 'minigun', `the LMG player holds a Minigun (${gun}); point this at a scratch copy that hands one out`);
async function hold(ms: number, shots: [number, string][] = []): Promise<{ gaps: number[]; fs: Felt[] }> {
  await felt(mini);
  await mouse(mini, 'mousePressed');
  const start = Date.now();
  for (const [at, name] of shots) { await sleep(at - (Date.now() - start)); await shot(mini, name); }
  await sleep(ms - (Date.now() - start));
  await mouse(mini, 'mouseReleased');
  await sleep(roundTrip + 300);
  const fs = await felt(mini);
  const sounds = fs.filter((f) => f.cue === 'sound').map((f) => f.at);
  return { gaps: sounds.slice(1).map((t, i) => t - sounds[i]!), fs };
}
before = mini.serverShots();
const { gaps: spin, fs: spun } = await hold(2200, [[200, 'guns-minigun-spinning-up.png'], [1900, 'guns-minigun-spun.png']]);
const fireMs = GUNS.minigun.fireMs;
const late = spin.slice(-15);
const lateMean = late.reduce((a, b) => a + b, 0) / late.length;
log(`minigun gaps between own shots (ms): ${spin.map((g) => g.toFixed(0)).join(' ')}`);
check(spin[0]! >= 2.2 * fireMs, `the first gap is long (${spin[0]!.toFixed(0)}ms, fireMs ${fireMs})`);
check(Math.abs(lateMean - fireMs) <= 0.2 * fireMs, `held 2s it fires at its fireMs (${lateMean.toFixed(1)}ms mean over the last 15)`);
checkCounts('minigun hold', spun, mini.serverShots() - before);
const { downMs } = rulesOf(GUNS.minigun).spinUp!;
await sleep(downMs + 400);
before = mini.serverShots();
const again = await hold(400);
check(again.gaps[0]! >= 2.2 * fireMs, `after ${downMs}ms off the trigger it starts slow again (${again.gaps[0]?.toFixed(0)}ms)`);
checkCounts('minigun hold again', again.fs, mini.serverShots() - before);
mini.close();

const pxPerUnitOf = (page: Browser): Promise<number> => page.js(`(() => { const a = skirmishDev.toScreen(0, 0), b = skirmishDev.toScreen(1000, 0); return (b.x - a.x) / 1000; })()`);
const pistol = await open('Looker pistol', 'pistol');
await respawnIfDead(pistol, 6000);
const pistolPx = await pxPerUnitOf(pistol);
pistol.close();
const sniper = await open('Looker sniper', 'sniper');
await respawnIfDead(sniper, 6000);
await sleep(600);
const plantedZoom = pistolPx / (await pxPerUnitOf(sniper));
await shot(sniper, 'guns-sniper-view.png');
await dirKey(sniper, 'keyDown', 'up');
await sleep(roundTrip + 500);
const walkingZoom = pistolPx / (await pxPerUnitOf(sniper));
await shot(sniper, 'guns-sniper-walking.png');
await dirKey(sniper, 'keyUp', 'up');
sniper.close();
const scope = rulesOf(GUNS.sniper).viewMul;
check(Math.abs(plantedZoom - scope) < 0.01, `a planted sniper's camera takes in ${scope}x the pistol's view (${plantedZoom.toFixed(3)}x)`);
check(Math.abs(walkingZoom - 1) < 0.01, `walking, it sees what the pistol sees (${walkingZoom.toFixed(3)}x)`);

const exceptions = [...rifle.exceptions, ...mini.exceptions, ...pistol.exceptions, ...sniper.exceptions];
for (const e of exceptions) log(`page exception: ${e}`);
const pass = results.every(Boolean) && exceptions.length === 0;
log(pass ? 'RESULT PASS' : 'RESULT FAIL');
process.exit(pass ? 0 : 1);
