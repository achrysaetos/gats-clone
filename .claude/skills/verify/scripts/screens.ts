/// <reference types="node" />
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Snapshot } from '../../../../src/shared/protocol.ts';
import { fillSnapshot } from '../../../../src/shared/wire.ts';
import { hold, key, openPage, serversListed, sleep, type Dir } from './lib/browser.ts';

const [RUN, OUT, ...asked] = process.argv.slice(2);
if (!RUN || !OUT) { console.error('usage: node screens.ts <run-dir> <out-dir> [view ...]'); process.exit(2); }
const VIEWS = asked.length ? asked : ['menu', 'ffa', 'tdm', 'dom'];
const VIEW = { w: Number(process.env.W ?? 1600), h: Number(process.env.H ?? 900) };
const BASE = existsSync(join(RUN, 'url'))
  ? readFileSync(join(RUN, 'url'), 'utf8').trim().replace(/\/$/, '')
  : `http://localhost:${readFileSync(join(RUN, 'port'), 'utf8').trim()}`;
mkdirSync(OUT, { recursive: true });

let myId: number | null = null;
let full = null as Snapshot | null;
const page = await openPage({
  profile: 'skirmish-screens-',
  viewport: { width: VIEW.w, height: VIEW.h },
  onEvent: (method, params) => {
    if (method !== 'Network.webSocketFrameReceived') return;
    const msg = JSON.parse(params.response.payloadData);
    if (msg.t === 'welcome') { myId = msg.id; full = null; }
    if (msg.t === 'snap') full = fillSnapshot(msg, full) ?? full;
  },
});
const { cdp, js } = page;
const mouse = (type: string, x: number, y: number) => cdp('Input.dispatchMouseEvent', { type, x, y, button: type === 'mouseMoved' ? 'none' : 'left', clickCount: 1 });
const me = () => full?.players.find((p) => p.id === myId);
const shot = async (name: string) => {
  const { data } = await cdp('Page.captureScreenshot', { format: 'png' });
  const file = join(OUT, `${name}.png`);
  writeFileSync(file, Buffer.from(data, 'base64'));
  console.log(`saved ${file}`);
};

async function openMenu() {
  await cdp('Page.navigate', { url: `${BASE}/?dev` });
  await serversListed(page, 8000);
  await js(`document.querySelectorAll('#loadout-menu .weapon')[1].click(); document.getElementById('name').value = 'You'`);
}

async function enter(start: string) {
  await openMenu();
  full = null;
  await js(start);
  for (let i = 0; i < 80 && !me(); i++) await sleep(100);
  if (!me()) throw new Error('never joined');
}

async function play(ms: number, goal: (() => { x: number; y: number } | null) | null, foes: () => { x: number; y: number }[], fire = true) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    const self = me();
    if (!self?.alive) {
      if (!self?.downed) await js(`document.getElementById('respawn')?.disabled || document.getElementById('respawn')?.click()`);
      await sleep(200);
      continue;
    }
    const near = foes().sort((a, b) => Math.hypot(a.x - self.x, a.y - self.y) - Math.hypot(b.x - self.x, b.y - self.y))[0];
    const [mx, my] = near ? [VIEW.w / 2 + (near.x - self.x) * 0.55, VIEW.h / 2 + (near.y - self.y) * 0.55] : [VIEW.w / 2 + 200, VIEW.h / 2];
    await mouse('mouseMoved', mx, my);
    if (fire && near && Math.hypot(near.x - self.x, near.y - self.y) < 800) await mouse('mousePressed', mx, my);
    const to = goal?.() ?? near;
    const dirs: Dir[] = [];
    if (to && Math.hypot(to.x - self.x, to.y - self.y) > 260) {
      if (Math.abs(to.x - self.x) > 80) dirs.push(to.x > self.x ? 'right' : 'left');
      if (Math.abs(to.y - self.y) > 80) dirs.push(to.y > self.y ? 'down' : 'up');
    }
    await hold(page, dirs, 160);
    if (fire) await mouse('mouseReleased', mx, my);
  }
}

const enemies = () => full?.players.filter((p) => p.id !== myId && p.alive && (p.team === null || p.team !== me()?.team)) ?? [];
const zombies = () => (full?.zombies ?? []).map(([, , x, y]) => ({ x, y }));
const serverOf = (mode: string) => `document.querySelector('#servers .server .mode-${mode}').closest('.server').click(); document.getElementById('play').click()`;
const nearCore = () => { const c = full?.run?.core; return c ? { x: c.x + 220, y: c.y + 160 } : null; };
const pickFirst = async () => { await key(page, 'keyDown', 'Digit1', '1'); await key(page, 'keyUp', 'Digit1', '1'); };

async function fightShot(name: string, ms: number, goal: (() => { x: number; y: number } | null) | null) {
  const end = Date.now() + ms;
  await play(4000, goal, enemies);
  while (Date.now() < end && !((full?.bullets.length ?? 0) >= 4 && enemies().length >= 2 && me()?.alive)) await play(400, goal, enemies);
  await shot(name);
}

for (const view of VIEWS) {
  switch (view) {
    case 'menu': await openMenu(); await sleep(1500); await shot('menu'); break;
    case 'ffa': await enter(serverOf('ffa')); await fightShot('ffa', 30_000, null); break;
    case 'tdm': await enter(serverOf('tdm')); await fightShot('tdm', 30_000, null); break;
    case 'board': {
      await enter(serverOf('tdm'));
      await play(3000, null, enemies, false);
      await key(page, 'keyDown', 'Tab', 'Tab', 9);
      await sleep(300);
      await shot('board');
      await key(page, 'keyUp', 'Tab', 'Tab', 9);
      break;
    }
    case 'dom': {
      await enter(serverOf('dom'));
      const zone = () => { const self = me(), zones = full?.zones ?? []; return self && zones.length ? [...zones].sort((a, b) => Math.hypot(a.x - self.x, a.y - self.y) - Math.hypot(b.x - self.x, b.y - self.y))[0]! : null; };
      await fightShot('dom', 30_000, zone);
      break;
    }
    case 'death': {
      await enter(serverOf('ffa'));
      for (let i = 0; i < 600 && !(await js(`!document.getElementById('death').hidden`)); i++) await play(300, () => enemies()[0] ?? null, enemies, false);
      await sleep(900);
      await shot('death');
      await js(`document.getElementById('respawn').click()`);
      break;
    }
    case 'levelup':
    case 'evolve': {
      if (!me()?.alive) await enter(serverOf('ffa'));
      const dock = () => js(`document.getElementById('perk-panel').hidden ? '' : document.querySelector('#perk-panel h2')?.textContent ?? ''`);
      const want = view === 'levelup' ? 'perk' : 'evolve';
      for (let i = 0; i < 400; i++) {
        const title: string = await dock();
        if (title.includes(want)) break;
        if (title) { await pickFirst(); await sleep(300); continue; }
        await play(400, null, enemies);
      }
      await play(600, null, enemies, false);
      await shot(view);
      if (view === 'evolve') {
        await pickFirst();
        await sleep(700);
        await shot('evolved');
      }
      break;
    }
    case 'zom-day': {
      await enter(`document.getElementById('squad-start').click()`);
      for (let i = 0; i < 60 && full?.run?.phase !== 'day'; i++) await sleep(100);
      await play(2500, nearCore, () => [], false);
      await shot('zom-day');
      break;
    }
    case 'zom-night': {
      if (!full?.run) await enter(`document.getElementById('squad-start').click()`);
      for (let i = 0; i < 1200 && !(full?.run?.phase === 'night' && zombies().length >= 40); i++) await play(300, nearCore, zombies, full?.run?.phase === 'night');
      await play(1500, nearCore, zombies);
      await shot('zom-night');
      break;
    }
    default: console.error(`unknown view ${view}`);
  }
}
page.close();
for (const e of page.exceptions) console.log(`exception: ${e}`);
process.exit(page.exceptions.length ? 1 : 0);
