/// <reference types="node" />
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { openPage, serversListed, sleep } from './lib/browser.ts';

const RUN = process.argv[2];
if (!RUN) { console.error('usage: node quality.ts <run-dir>'); process.exit(2); }
const BASE = existsSync(join(RUN, 'url')) ? readFileSync(join(RUN, 'url'), 'utf8').trim().replace(/\/$/, '') : `http://localhost:${readFileSync(join(RUN, 'port'), 'utf8').trim()}`;
const EVIDENCE = join(RUN, 'evidence');
mkdirSync(EVIDENCE, { recursive: true });
const LOG = join(EVIDENCE, 'quality.log');
let failed = false;
const log = (line: string) => { console.log(line); appendFileSync(LOG, line + '\n'); };
const expect = (what: string, ok: boolean, detail = '') => { log(`${ok ? 'ok' : 'FAIL'} ${what}${detail ? ` (${detail})` : ''}`); if (!ok) failed = true; };
writeFileSync(LOG, `quality ${BASE}\n`);

const page = await openPage({ profile: 'skirmish-quality-', viewport: { width: 1600, height: 900 }, onProblem: (kind, detail) => { failed = true; log(`problem ${kind}: ${detail}`); } });
const { cdp, js } = page;
type Probe = { mode: string; tier: string; knobs: { renderScale: number; bloomDiv: number | null } };
const probe = (): Promise<Probe> => js(`skirmishDev.quality()`);
const open = async (query: string) => {
  await cdp('Page.navigate', { url: `${BASE}/?dev${query}` });
  await serversListed(page, 10_000);
  for (let i = 0; i < 50 && !(await js(`!!document.querySelector('#quality .quality-mode')`)); i++) await sleep(100);
};
const pressed = () => js(`[...document.querySelectorAll('#quality .quality-mode')].filter((b) => b.getAttribute('aria-pressed') === 'true').map((b) => b.dataset.mode)`);
async function press(mode: string) {
  const [x, y] = await js(`(() => { const b = document.querySelector('#quality [data-mode="${mode}"]'); b.scrollIntoView({ block: 'center' }); const r = b.getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2]; })()`);
  await cdp('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 1 });
  await cdp('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: 1 });
  await sleep(200);
}
const backingWidth = () => js(`document.getElementById('world').width`);

await cdp('Page.navigate', { url: `${BASE}/` });
await js(`localStorage.removeItem('skirmish.quality')`);
await open('');
let p = await probe();
expect('a fresh browser runs on Auto', p.mode === 'auto' && JSON.stringify(await pressed()) === '["auto"]', `${p.mode}, tier ${p.tier}`);
await press('medium');
p = await probe();
expect('pressing Medium sets the tier by hand', p.mode === 'medium' && p.tier === 'medium' && JSON.stringify(await pressed()) === '["medium"]');
expect('the choice is saved', (await js(`localStorage.getItem('skirmish.quality')`)) === 'medium');
await sleep(300);
const mediumWidth = await backingWidth();
expect('Medium draws the world at three quarters of the CSS width', mediumWidth === 1200, `canvas ${mediumWidth}px for 1600 CSS px`);
const { data } = await cdp('Page.captureScreenshot', { format: 'png' });
writeFileSync(join(EVIDENCE, 'quality-menu.png'), Buffer.from(data, 'base64'));
await open('');
p = await probe();
expect('the saved choice survives a reload', p.mode === 'medium' && p.tier === 'medium');
await open('&quality=ultra');
p = await probe();
expect('?quality=ultra overrides the saved choice', p.mode === 'ultra' && p.knobs.bloomDiv === 2, JSON.stringify(p.knobs));
expect('?quality= is not saved', (await js(`localStorage.getItem('skirmish.quality')`)) === 'medium');
await sleep(300);
expect('Ultra draws at full width', (await backingWidth()) === 1600);
await open('&quality=ultra&bloom=0');
p = await probe();
expect('?bloom=0 still turns bloom off', p.knobs.bloomDiv === null, JSON.stringify(p.knobs));
await open('&quality=nonsense');
p = await probe();
expect('a bad ?quality= falls back to the saved choice', p.mode === 'medium');
await press('auto');
await js(`localStorage.removeItem('skirmish.quality')`);
page.close();
log(`RESULT ${failed ? 'FAIL' : 'PASS'}`);
process.exit(failed ? 1 : 0);
