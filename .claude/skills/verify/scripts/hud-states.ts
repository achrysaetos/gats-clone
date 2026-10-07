/// <reference types="node" />
// Usage: node hud-states.ts <run-dir> <out-dir> <width> <height> [touch]
// Joins FFA, then overlays each vitals state with `skirmishDev.forceVitals` and shoots the top-left plate (crop) and the whole screen.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { openPage, serversListed, sleep } from './lib/browser.ts';

const [RUN, OUT, W, H, mode] = process.argv.slice(2);
if (!RUN || !OUT || !W || !H) { console.error('usage: node hud-states.ts <run-dir> <out-dir> <w> <h> [touch]'); process.exit(2); }
const touch = mode === 'touch';
const BASE = `http://localhost:${readFileSync(join(RUN, 'port'), 'utf8').trim()}`;
mkdirSync(OUT, { recursive: true });
const page = await openPage({ profile: 'skirmish-hud-', viewport: { width: Number(W), height: Number(H) } });
const { cdp, js } = page;
if (touch) {
  await cdp('Emulation.setDeviceMetricsOverride', { width: Number(W), height: Number(H), deviceScaleFactor: 2, mobile: true });
  await cdp('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
  await cdp('Emulation.setEmulatedMedia', { features: [{ name: 'pointer', value: 'coarse' }] });
}
await cdp('Page.navigate', { url: `${BASE}/?dev` });
await serversListed(page, 8000);
await js(`document.getElementById('name').value = 'You'; document.querySelector('#servers .server .mode-ffa').closest('.server').click(); document.getElementById('play').click()`);
for (let i = 0; i < 80 && !(await js(`!document.getElementById('hud').hidden`)); i++) await sleep(100);
await sleep(1500);
if (!touch) await cdp('Input.dispatchMouseEvent', { type: 'mouseMoved', x: Number(W) * 0.6, y: Number(H) * 0.42, button: 'none' });

const shot = async (name: string, crop: boolean) => {
  const clip = crop ? { x: 0, y: 0, width: Math.min(Number(W), touch ? 330 : 380 * Math.max(1, Math.min(Number(H), Number(W)) / 900)), height: touch ? 300 : 260 * Math.max(1, Math.min(Number(H), Number(W)) / 900), scale: touch ? 1.5 : 2 } : undefined;
  const { data } = await cdp('Page.captureScreenshot', { format: 'png', ...(clip ? { clip } : {}) });
  writeFileSync(join(OUT, `${name}.png`), Buffer.from(data, 'base64'));
};

const base = { me: { hp: 400, maxHp: 400, armorTier: 'medium', gun: 'smg' }, self: { ammo: 30, mag: 30, reloading: false, reloadFrac: 0, ability: 'dash', abilityReadyIn: 0, perks: { 1: 'extended', 2: 'secondWind' }, sprint: false, streak: 0 } };
const merge = (a: any, b: any) => ({ me: { ...a.me, ...b.me }, self: { ...a.self, ...b.self } });
const states: Record<string, any> = {
  '01-full': {},
  '02-lowhp': { me: { hp: 70, armorTier: 'light' } },
  '03-critical': { me: { hp: 28, armorTier: 'none' } },
  '04-reloading': { self: { ammo: 0, reloading: true, reloadFrac: 0.55 } },
  '05-lowammo': { self: { ammo: 6 } },
  '06-empty': { self: { ammo: 0 } },
  '07-ability-cooling': { self: { abilityReadyIn: 4200 } },
  '08-ability-locked': { self: { ability: null, perks: {}, pending: null } },
  '09-ability-pick': { self: { ability: null, perks: { 1: 'extended' }, pending: { k: 'perk', tier: 3, choices: ['dash', 'knife'] } } },
  '10-sprint': { self: { sprint: true } },
  '11-pistol': { me: { gun: 'pistol', armorTier: 'heavy', hp: 250 }, self: { ammo: 7, mag: 12 } },
  '12-lmg': { me: { gun: 'lmg' }, self: { ammo: 22, mag: 100 } },
  '13-statuses': { me: { shield: true, rush: true, hunted: true, gun: 'handCannon' }, self: { streak: 5, ammo: 4, mag: 6, perks: { 1: 'extended', 2: 'secondWind' } } },
  '14-spawnshield': { me: { spawnShield: true, hp: 400, armorTier: 'none' }, self: { perks: {} } },
};
for (const [name, patch] of Object.entries(states)) {
  const f = merge(base, patch);
  await js(`skirmishDev.forceVitals(${JSON.stringify(f)})`);
  await sleep(1300);
  await shot(name, true);
  await shot(`full-${name}`, false);
}
await js(`skirmishDev.forceVitals(null)`);
console.log('exceptions', page.exceptions.length, page.exceptions.slice(0, 3));
page.close();
process.exit(0);
