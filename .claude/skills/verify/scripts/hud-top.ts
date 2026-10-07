/// <reference types="node" />
// Usage: node hud-top.ts <run-dir> <out-dir> <width> <height> <ffa|tdm|dom> [touch]
// Joins a versus room and shoots the top-right HUD: plain, with Tab held (full board), and with a forced multi-kill in the feed.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { key, openPage, serversListed, sleep } from './lib/browser.ts';

const [RUN, OUT, W, H, mode = 'ffa', kind] = process.argv.slice(2);
if (!RUN || !OUT || !W || !H) { console.error('usage: node hud-top.ts <run-dir> <out-dir> <w> <h> <ffa|tdm|dom> [touch]'); process.exit(2); }
const touch = kind === 'touch';
const BASE = `http://localhost:${readFileSync(join(RUN, 'port'), 'utf8').trim()}`;
mkdirSync(OUT, { recursive: true });
const page = await openPage({ profile: 'skirmish-hudtop-', viewport: { width: Number(W), height: Number(H) } });
const { cdp, js } = page;
if (touch) {
  await cdp('Emulation.setDeviceMetricsOverride', { width: Number(W), height: Number(H), deviceScaleFactor: 2, mobile: true });
  await cdp('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
  await cdp('Emulation.setEmulatedMedia', { features: [{ name: 'pointer', value: 'coarse' }] });
}
await cdp('Page.navigate', { url: `${BASE}/?dev` });
await serversListed(page, 8000);
await js(`document.getElementById('name').value = 'You'; document.querySelector('#servers .server .mode-${mode}').closest('.server').click(); document.getElementById('play').click()`);
for (let i = 0; i < 80 && !(await js(`!document.getElementById('hud').hidden`)); i++) await sleep(100);
await sleep(Number(process.env.SETTLE ?? 9000));
const shot = async (name: string) => {
  const { data } = await cdp('Page.captureScreenshot', { format: 'png' });
  writeFileSync(join(OUT, `${mode}-${name}.png`), Buffer.from(data, 'base64'));
};
await shot('plain');
if (!touch) { await key(page, 'keyDown', 'Tab', 'Tab', 9); await sleep(400); await shot('board'); await key(page, 'keyUp', 'Tab', 'Tab', 9); }
const feed = [
  { killer: 'RandyBull', victim: 'MackenzieM', weapon: 'Assault', ageMs: 2600 },
  { killer: 'You', victim: 'birdwatcher84', weapon: 'Shotgun', mine: 'killer', ageMs: 1700 },
  { killer: 'You', victim: 'DeejayRico', weapon: 'Shotgun', mine: 'killer', bounty: true, ageMs: 1000 },
  { killer: 'thatsmydog', victim: 'You', weapon: 'Bolt-action', mine: 'victim', ageMs: 600 },
  { killer: 'zainplays', victim: 'KayOnXbox', weapon: 'Light MG', knock: true, ageMs: 450 },
];
await js(`skirmishDev.forceVitals(${JSON.stringify({ feed })})`);
await sleep(700);
await shot('feed');
await js(`skirmishDev.forceVitals(null)`);
console.log('exceptions', page.exceptions.length, page.exceptions.slice(0, 3));
page.close();
process.exit(0);
