/// <reference types="node" />
// Usage: node hud-styles.ts <run-dir> <out-dir> <width> <height> [states=full,stress]
// Joins FFA, parks the cursor mid-screen and shoots each vitals style (`skirmishDev.forceVitals({style})`) in each state.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { openPage, serversListed, sleep } from './lib/browser.ts';

const [RUN, OUT, W, H, only] = process.argv.slice(2);
if (!RUN || !OUT || !W || !H) { console.error('usage: node hud-styles.ts <run-dir> <out-dir> <w> <h> [state,..]'); process.exit(2); }
const BASE = `http://localhost:${readFileSync(join(RUN, 'port'), 'utf8').trim()}`;
mkdirSync(OUT, { recursive: true });
const page = await openPage({ profile: 'skirmish-hudstyle-', viewport: { width: Number(W), height: Number(H) } });
const { cdp, js } = page;
await cdp('Page.navigate', { url: `${BASE}/?dev` });
await serversListed(page, 8000);
await js(`document.getElementById('name').value = 'You'; document.querySelector('#servers .server .mode-ffa').closest('.server').click(); document.getElementById('play').click()`);
for (let i = 0; i < 80 && !(await js(`!document.getElementById('hud').hidden`)); i++) await sleep(100);
await sleep(1500);
await cdp('Input.dispatchMouseEvent', { type: 'mouseMoved', x: Number(W) * 0.62, y: Number(H) * 0.42, button: 'none' });
const base = { me: { hp: 400, maxHp: 400, armorTier: 'medium', gun: 'assault' }, self: { ammo: 30, mag: 30, reloading: false, reloadFrac: 0, ability: 'dash', abilityReadyIn: 0, perks: { 1: 'extended', 2: 'secondWind' }, sprint: false, streak: 0 } };
const merge = (a: any, b: any) => ({ me: { ...a.me, ...b.me }, self: { ...a.self, ...b.self } });
const states: Record<string, any> = {
  full: {},
  stress: { me: { hp: 90, armorTier: 'light', shield: true, rush: true }, self: { ammo: 6, abilityReadyIn: 3300, sprint: true, streak: 4 } },
  reload: { self: { ammo: 0, reloading: true, reloadFrac: 0.6, ability: null, perks: {} } },
};
for (const style of ['plate', 'ring', 'corner', 'hybrid']) {
  for (const [name, patch] of Object.entries(states)) {
    if (only && !only.split(',').includes(name)) continue;
    await js(`skirmishDev.forceVitals(${JSON.stringify({ ...merge(base, patch), style })})`);
    await sleep(1300);
    const { data } = await cdp('Page.captureScreenshot', { format: 'png' });
    writeFileSync(join(OUT, `${style}-${name}.png`), Buffer.from(data, 'base64'));
  }
}
await js(`skirmishDev.forceVitals(null)`);
console.log('exceptions', page.exceptions.length, page.exceptions.slice(0, 3));
page.close();
process.exit(0);
