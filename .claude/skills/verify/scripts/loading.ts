/// <reference types="node" />
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { joinFromMenu, openPage, sleep } from './lib/browser.ts';

const RUN = process.argv[2];
if (!RUN) { console.error('usage: node loading.ts <run-dir>'); process.exit(2); }
const BASE = existsSync(join(RUN, 'url')) ? readFileSync(join(RUN, 'url'), 'utf8').trim().replace(/\/$/, '') : `http://localhost:${readFileSync(join(RUN, 'port'), 'utf8').trim()}`;
const EVIDENCE = join(RUN, 'evidence');
mkdirSync(EVIDENCE, { recursive: true });
const LOG = join(EVIDENCE, 'loading.log');
const THROTTLE_KBPS = Number(process.env.THROTTLE_KBPS ?? 0);
const FAIL_TILES = process.env.FAIL_TILES === '1';
const PLAY_EARLY = process.env.PLAY_EARLY === '1';
const NO_WEBGL = process.env.NO_WEBGL === '1';
let failed = false;
const log = (line: string) => { console.log(line); appendFileSync(LOG, line + '\n'); };
const expect = (what: string, ok: boolean, detail = '') => { log(`${ok ? 'ok' : 'FAIL'} ${what}${detail ? ` (${detail})` : ''}`); if (!ok) failed = true; };
writeFileSync(LOG, `loading ${BASE} throttle=${THROTTLE_KBPS || 'none'}kbps failTiles=${FAIL_TILES} playEarly=${PLAY_EARLY} noWebgl=${NO_WEBGL}\n`);

type Req = { url: string; bytes: number; done: number | null };
const reqs = new Map<string, Req>();
const tileAsks = new Map<string, number>();
let t0 = 0;
const page = await openPage({
  profile: 'skirmish-loading-',
  viewport: { width: 1600, height: 900 },
  args: NO_WEBGL ? ['--disable-gpu', '--disable-webgl', '--disable-3d-apis'] : [],
  onEvent: (method, p) => {
    if (method === 'Target.attachedToTarget') void page.cdp('Network.enable', {}, p.sessionId).then(() => page.cdp('Runtime.runIfWaitingForDebugger', {}, p.sessionId));
    if (method === 'Network.requestWillBeSent') reqs.set(p.requestId, { url: p.request.url, bytes: 0, done: null });
    if (method === 'Network.loadingFinished') { const r = reqs.get(p.requestId); if (r) { r.bytes = p.encodedDataLength; r.done = performance.now() - t0; } }
    if (method === 'Fetch.requestPaused') {
      tileAsks.set(p.request.url, (tileAsks.get(p.request.url) ?? 0) + 1);
      void page.cdp('Fetch.failRequest', { requestId: p.requestId, errorReason: 'Failed' });
    }
  },
  onProblem: (kind, detail) => { if (!(NO_WEBGL && kind === 'console.error')) log(`problem ${kind}: ${detail}`); },
});
const { cdp, js } = page;
await cdp('Network.setCacheDisabled', { cacheDisabled: true });
// Pixi fetches images from a worker, whose requests the page's own Network domain never sees.
await cdp('Target.setAutoAttach', { autoAttach: true, waitForDebuggerOnStart: true, flatten: true });
if (THROTTLE_KBPS) await cdp('Network.emulateNetworkConditions', { offline: false, latency: 40, downloadThroughput: (THROTTLE_KBPS * 1024) / 8, uploadThroughput: (THROTTLE_KBPS * 1024) / 8 });
if (FAIL_TILES) await cdp('Fetch.enable', { patterns: [{ urlPattern: '*/assets/maps/*' }] });

const finished = (pred: (r: Req) => boolean = () => true) => [...reqs.values()].filter((r) => r.done !== null && pred(r));
const sum = (rs: Req[]) => rs.reduce((n, r) => n + r.bytes, 0);
const kb = (n: number) => `${(n / 1024).toFixed(0)} KB`;
const path = (u: string) => new URL(u).pathname;
const isSfx = (r: Req) => path(r.url).startsWith('/assets/sfx/') && r.url.endsWith('.mp3');

t0 = performance.now();
await cdp('Page.navigate', { url: `${BASE}/?dev` });
const progress: string[] = [];
const labels: string[] = [];
let midShot = false;
let interactiveAt = -1;
for (let i = 0; i < 1200; i++) {
  const s = await js(`(() => { const p = document.getElementById('play'); const a = document.getElementById('art-load'); return { servers: document.querySelectorAll('#servers .server').length, play: p ? !p.disabled : false, label: p?.textContent ?? '', art: a && !a.hidden ? a.textContent.trim() : null, status: document.getElementById('menu-status')?.textContent ?? '' }; })()`);
  if (s?.art && progress.at(-1) !== s.art) progress.push(s.art);
  if (s && labels.at(-1) !== s.label) labels.push(s.label);
  if (!midShot && /[1-9]\d?%/.test(s?.art ?? '')) {
    midShot = true;
    const { data } = await cdp('Page.captureScreenshot', { format: 'png' });
    writeFileSync(join(EVIDENCE, 'loading-menu-progress.png'), Buffer.from(data, 'base64'));
  }
  if (interactiveAt < 0 && s?.servers === 4) {
    interactiveAt = performance.now() - t0;
    const before = finished((r) => r.done! <= interactiveAt);
    log(`menu interactive after ${interactiveAt.toFixed(0)}ms: ${sum(before)} bytes (${kb(sum(before))}) over ${before.length} requests`);
    for (const r of before.sort((a, b) => b.bytes - a.bytes).slice(0, 6)) log(`  ${kb(r.bytes).padStart(7)} ${path(r.url)}`);
    if (NO_WEBGL) {
      expect('without WebGL2 the menu says so', /WebGL/.test(s.status + (s.art ?? '')), s.status || s.art);
      await js(`document.querySelector('#servers .server').click()`);
      await sleep(300);
      expect('without WebGL2 Play stays off with a room picked', await js(`document.getElementById('play').disabled`));
      const { data } = await cdp('Page.captureScreenshot', { format: 'png' });
      writeFileSync(join(EVIDENCE, 'loading-no-webgl2.png'), Buffer.from(data, 'base64'));
      break;
    }
    if (PLAY_EARLY) await joinFromMenu(page, { press: true });
  }
  if (interactiveAt >= 0 && !NO_WEBGL && (await js(`!!window.skirmishDev?.world()?.atlas`))) break;
  await sleep(50);
}
if (progress.length) log(`art progress shown: ${progress.join(' | ')}`);
log(`Play button read: ${labels.join(' | ')}`);
const atlases = finished((r) => /\/assets\/sprites\/.*\.webp$/.test(r.url));
log(`atlases done after ${Math.max(...atlases.map((r) => r.done!), 0).toFixed(0)}ms: ${kb(sum(atlases))} over ${atlases.length} files`);
if (NO_WEBGL) { page.close(); log(`RESULT ${failed ? 'FAIL' : 'PASS'}`); process.exit(failed ? 1 : 0); }
expect('the menu is interactive before the atlases finish', interactiveAt < Math.min(...atlases.map((r) => r.done!)), `${interactiveAt.toFixed(0)}ms vs ${Math.min(...atlases.map((r) => r.done!)).toFixed(0)}ms`);
log(`sound files fetched before any gesture: ${finished(isSfx).length}`);

if (!PLAY_EARLY) await joinFromMenu(page, { press: true });
const pressedAt = performance.now() - t0;
let joinedAt = -1;
for (let i = 0; i < 400 && joinedAt < 0; i++) {
  if (await js(`!document.getElementById('hud').hidden`)) joinedAt = performance.now() - t0;
  else await sleep(50);
}
expect('Play joins a match', joinedAt > 0, `pressed at ${pressedAt.toFixed(0)}ms, HUD at ${joinedAt.toFixed(0)}ms`);
const firstFrame = finished((r) => r.done! <= joinedAt);
log(`bytes by the first game frame: ${kb(sum(firstFrame))}`);
await sleep(FAIL_TILES ? 20_000 : 6000);
const sfx = finished(isSfx);
log(`sound files fetched 6s after the first gesture: ${sfx.length} (${kb(sum(sfx))}): ${sfx.map((r) => path(r.url).split('/').pop()!.split('.')[0]).join(' ')}`);
const audio = await js(`window.skirmishDev?.audio?.()`);
if (audio) log(`decoded ${audio.decoded.length}: ${audio.decoded.join(' ')}`);
if (FAIL_TILES) {
  const asks = [...tileAsks.values()];
  const probe = await js(`window.skirmishDev.world()`);
  log(`failing tiles: ${asks.length} distinct, asked at most ${Math.max(...asks)} times each in ~26s, probe failedTiles=${probe.failedTiles}`);
  expect('a failing tile is not asked for every frame', Math.max(...asks) <= 6, `max ${Math.max(...asks)}`);
}
const { data } = await cdp('Page.captureScreenshot', { format: 'png' });
writeFileSync(join(EVIDENCE, `loading-in-game${FAIL_TILES ? '-failtiles' : ''}.png`), Buffer.from(data, 'base64'));
for (const e of page.exceptions) expect('no page exception', false, e);
page.close();
log(`RESULT ${failed ? 'FAIL' : 'PASS'}`);
process.exit(failed ? 1 : 0);
