/// <reference types="node" />
// Usage: node frametime.ts <run-dir> [seconds] [width] [height]   Measures client frame cost in a busy FFA room while the driven player fires.
// SQUAD=1 starts a zombies squad through the menu instead and fires at the nearest zombie; point it at a scratch copy whose night holds a full horde.
// DPR=2 emulates a 2x display; BLOOM=0 joins with bloom off (`?bloom=0`); QUALITY=<auto|low|medium|high|ultra> joins with `?quality=`; KNOBS=<name:value,...> overrides single quality knobs (`?knobs=`).
// It logs the quality tier when sampling starts and ends, and every step the auto governor took meanwhile.
// `frame cost` times each real frame's draw calls. With SOFTWARE=1 (no GPU canvas) it also logs `rastered frame cost`, which waits for the pixels,
// dropping each batch's first redraw, which waits on the compositor. On the GPU canvas the pixel reads would move it to the CPU mid-run and skew every later frame.
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Snapshot } from '../../../../src/shared/protocol.ts';
import { fillSnapshot } from '../../../../src/shared/wire.ts';
import { dirKey, openPage, serversListed, sleep, type Dir } from './lib/browser.ts';

const RUN = process.argv[2];
if (!RUN) { console.error('usage: node frametime.ts <run-dir> [seconds] [width] [height]'); process.exit(2); }
const SECONDS = Number(process.argv[3] ?? 20);
const VIEW = { w: Number(process.argv[4] ?? 1920), h: Number(process.argv[5] ?? 1080) };
const WARMUP_MS = 5000;
const BENCH_EVERY_STEPS = 2;
const BENCH_FRAMES = 8;
const SOFTWARE = process.env.SOFTWARE === '1';
const SQUAD = process.env.SQUAD === '1';
const DPR = Number(process.env.DPR ?? 1);
const BLOOM = process.env.BLOOM !== '0';
const QUALITY = process.env.QUALITY ?? '';
const KNOBS = process.env.KNOBS ?? '';
const BASE = existsSync(join(RUN, 'url'))
  ? readFileSync(join(RUN, 'url'), 'utf8').trim().replace(/\/$/, '')
  : `http://localhost:${readFileSync(join(RUN, 'port'), 'utf8').trim()}`;
const EV = join(RUN, 'evidence');
mkdirSync(EV, { recursive: true });
const LOG = join(EV, 'frametime.log');
const log = (line: string) => { console.log(line); appendFileSync(LOG, line + '\n'); };

let myId: number | null = null;
let full: Snapshot | null = null;
const busy = { snaps: 0, players: 0, bullets: 0, zombies: 0 };
const rastered: number[] = [];
let sampling = false;
const page = await openPage({
  profile: 'skirmish-frametime-',
  args: SOFTWARE ? ['--disable-gpu', '--disable-accelerated-2d-canvas'] : [],
  viewport: { width: VIEW.w, height: VIEW.h, dpr: DPR },
  onEvent: (method, params) => {
    if (method !== 'Network.webSocketFrameReceived') return;
    const msg = JSON.parse(params.response.payloadData);
    if (msg.t === 'welcome') myId = msg.id;
    if (msg.t === 'snap') {
      full = fillSnapshot(msg, full) ?? full;
      if (sampling && full) { busy.snaps++; busy.players += full.players.length; busy.bullets += full.bullets.length; busy.zombies += full.zombies?.length ?? 0; }
    }
  },
});
const { cdp, js, exceptions, close } = page;
await cdp('Page.navigate', { url: `${BASE}/?dev${BLOOM ? '' : '&bloom=0'}${QUALITY ? `&quality=${QUALITY}` : ''}${KNOBS ? `&knobs=${encodeURIComponent(KNOBS)}` : ''}` });
await serversListed(page);
await js(`document.querySelectorAll('#loadout-menu .weapon')[1].click(); document.getElementById('name').value = 'Bench'`);
await js(SQUAD ? `document.getElementById('squad-start').click()` : `document.querySelector('#servers .server').click(); document.getElementById('play').click()`);
for (let i = 0; i < 50 && !full; i++) await sleep(100);

const me = () => full?.players.find((p) => p.id === myId);
const KEYS: Dir[] = ['right', 'down', 'left', 'up'];
const aimAt = (x: number, y: number) => cdp('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y, button: 'none' });
const mouseDown = (x: number, y: number) => cdp('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 1 });

async function fightFor(ms: number) {
  const end = Date.now() + ms;
  let step = 0;
  while (Date.now() < end) {
    if (me()?.alive === false) {
      await js(`document.getElementById('respawn').disabled || document.getElementById('respawn').click()`);
      await sleep(250);
      continue;
    }
    const self = me();
    const targets = SQUAD ? (full?.zombies ?? []).map(([, , x, y]) => ({ x, y })) : (full?.players.filter((p) => p.id !== myId && p.alive) ?? []);
    const foe = self && targets.sort((a, b) => Math.hypot(a.x - self.x, a.y - self.y) - Math.hypot(b.x - self.x, b.y - self.y))[0];
    const [mx, my] = self && foe ? [VIEW.w / 2 + (foe.x - self.x) * 0.5, VIEW.h / 2 + (foe.y - self.y) * 0.5] : [VIEW.w / 2 + 300, VIEW.h / 2];
    await aimAt(mx, my);
    await mouseDown(mx, my);
    const k = KEYS[step++ % KEYS.length]!;
    await dirKey(page, 'keyDown', k);
    await sleep(400);
    await dirKey(page, 'keyUp', k);
    if (SOFTWARE && sampling && step % BENCH_EVERY_STEPS === 0 && me()?.alive) rastered.push(...(await js(`skirmishDev.benchFrames(${BENCH_FRAMES})`)).slice(1));
  }
}

await fightFor(WARMUP_MS);
await js(`skirmishDev.takeFrameCosts()`);
await js(`window.__raf = []; (function tick(t) { window.__raf.push(t); requestAnimationFrame(tick); })(performance.now())`);
type QualityProbe = { mode: string; tier: string; software: boolean; knobs: object; changes: { at: number; from: string; to: string; p90: number | null; why: string }[] } | null;
const quality = (): Promise<QualityProbe> => js(`skirmishDev.quality?.() ?? null`);
const qualityBefore = await quality();
const sampledFrom: number = await js(`performance.now()`);
sampling = true;
await fightFor(SECONDS * 1000);
sampling = false;
const qualityAfter = await quality();
const costs: number[] = await js(`skirmishDev.takeFrameCosts()`);
const world: { tiles: number; atlas: boolean } | null = await js(`skirmishDev.world?.() ?? null`);
const stamps: number[] = await js(`window.__raf`);
const { data } = await cdp('Page.captureScreenshot', { format: 'png' });
writeFileSync(join(EV, 'frametime-view.png'), Buffer.from(data, 'base64'));
close();

const stats = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  const at = (q: number) => s[Math.min(s.length - 1, Math.floor(q * s.length))] ?? NaN;
  return { n: s.length, avg: s.reduce((a, b) => a + b, 0) / s.length, p50: at(0.5), p95: at(0.95), p99: at(0.99), max: s.at(-1) ?? NaN };
};
const fmt = (o: ReturnType<typeof stats>) => `n=${o.n} avg=${o.avg.toFixed(2)} p50=${o.p50.toFixed(2)} p95=${o.p95.toFixed(2)} p99=${o.p99.toFixed(2)} max=${o.max.toFixed(2)}ms`;
const intervals = stamps.slice(1).map((t, i) => t - stamps[i]!);
log(`frametime ${VIEW.w}x${VIEW.h} dpr ${DPR} bloom ${BLOOM ? 'on' : 'off'} quality ${QUALITY || 'saved'}${KNOBS ? ` knobs ${KNOBS}` : ''} ${SECONDS}s${SOFTWARE ? ' software-canvas' : ''} at ${new Date().toISOString()}`);
if (qualityBefore && qualityAfter) {
  log(`quality ${qualityAfter.mode}${qualityAfter.software ? ' (no GPU)' : ''}: tier ${qualityBefore.tier} at sampling start, ${qualityAfter.tier} at end; knobs ${JSON.stringify(qualityAfter.knobs)}`);
  for (const c of qualityAfter.changes) log(`  tier ${c.from} -> ${c.to} (${c.why}${c.p90 === null ? '' : `, window p90 ${c.p90.toFixed(1)}ms`}) ${c.at < sampledFrom ? 'before' : 'during'} sampling, at ${(c.at / 1000).toFixed(1)}s`);
} else log('quality: this build has no quality probe');
log(`busy: avg ${(busy.players / busy.snaps).toFixed(1)} players, ${(busy.bullets / busy.snaps).toFixed(1)} bullets${SQUAD ? ` and ${(busy.zombies / busy.snaps).toFixed(1)} zombies` : ''} in view per snapshot`);
log(`frame cost  ${fmt(stats(costs))}`);
if (SOFTWARE) log(`rastered frame cost  ${fmt(stats(rastered))}`);
log(`raf interval ${fmt(stats(intervals))}`);
log(`ground tiles on the GPU: ${world?.tiles ?? 'none'}, sprite atlas ${world?.atlas ? 'loaded' : 'missing'}`);
for (const e of exceptions) log(`exception: ${e}`);
log(exceptions.length || !costs.length ? 'RESULT FAIL' : 'RESULT PASS');
process.exit(exceptions.length || !costs.length ? 1 : 0);
