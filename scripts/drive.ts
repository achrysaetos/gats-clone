/// <reference types="node" />
/**
 *   node scripts/mock-server.ts 8787 &
 *   DESKTOP=1920x1080 node scripts/drive.ts http://localhost:8787 <out-dir>   (DESKTOP defaults to 1280x800)
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { joinFromMenu, key, openPage, sleep } from '../.claude/skills/verify/scripts/lib/browser.ts';

const URL_ = process.argv[2] ?? 'http://localhost:8787';
const OUT = process.argv[3] ?? join(tmpdir(), 'skirmish-shots');
const [DESKTOP_W, DESKTOP_H] = (process.env.DESKTOP ?? '1280x800').split('x').map(Number) as [number, number];
mkdirSync(OUT, { recursive: true });

const problems: string[] = [];
const page = await openPage({
  profile: 'skirmish-chrome-',
  debugPort: 9333,
  onEvent: (method, params) => {
    if (method === 'Runtime.exceptionThrown') problems.push(`exception: ${params.exceptionDetails.exception?.description ?? params.exceptionDetails.text}`);
    else if (method === 'Runtime.consoleAPICalled' && params.type === 'error') {
      problems.push(`console.error: ${params.args.map((a: { value?: unknown; description?: string }) => a.value ?? a.description).join(' ')}`);
    }
  },
});
const { cdp, js: evaluate } = page;
const shot = async (name: string) => {
  const { data } = await cdp('Page.captureScreenshot', { format: 'png' });
  writeFileSync(join(OUT, `${name}.png`), Buffer.from(data, 'base64'));
};
const viewport = (width: number, height: number, mobile = false) =>
  cdp('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: mobile ? 2 : 1, mobile });
const press = async (code: string, k: string, holdMs = 30) => {
  const vk = k === 'Enter' ? 13 : k === ' ' ? 32 : k.toUpperCase().charCodeAt(0);
  await key(page, 'keyDown', code, k, vk);
  await sleep(holdMs);
  await key(page, 'keyUp', code, k, vk);
};
const mouse = (type: string, x: number, y: number) =>
  cdp('Input.dispatchMouseEvent', { type, x, y, button: type === 'mouseMoved' ? 'none' : 'left', clickCount: 1 });
const chat = async (text: string) => {
  await press('Enter', 'Enter');
  await cdp('Input.insertText', { text });
  await press('Enter', 'Enter');
  await sleep(250);
};
const expect = async (label: string, expression: string) => {
  const ok = await evaluate(expression);
  if (ok !== true) problems.push(`expectation failed: ${label}`);
  console.log(`${ok === true ? 'ok  ' : 'FAIL'} ${label}`);
};
const play = async (room: number) => {
  await joinFromMenu(page, { room, name: 'Driver' });
  await sleep(1200);
};

await viewport(375, 812, true);
await cdp('Page.navigate', { url: URL_ });
await sleep(1200);
await expect('menu fits phone width without horizontal scroll', `document.documentElement.scrollWidth <= innerWidth && document.getElementById('menu').scrollWidth <= innerWidth`);
await shot('menu-phone');

await viewport(DESKTOP_W, DESKTOP_H);
await cdp('Page.navigate', { url: URL_ });
await sleep(1200);
await expect('server list loaded', `document.querySelectorAll('#servers .server').length === 3`);
await expect('six weapon tiles with drawn silhouettes', `[...document.querySelectorAll('.gun-art')].length === 12`);
const login = (password: string) => evaluate(`(() => {
  const [name, pass] = document.querySelectorAll('#account input');
  name.value = 'Driver'; pass.value = '${password}';
  document.querySelector('#account form button[type=submit]').click();
})()`);
await login('wrong');
await sleep(400);
await expect('bad login shows the server error', `document.querySelector('#account .status').textContent.includes('Invalid')`);
await login('hunter2');
await sleep(600);
await expect('login shows stats panel', `document.querySelector('#account .stats').textContent.includes('42')`);
await expect('token persisted', `localStorage.getItem('skirmish.token') === 'mock-Driver'`);
await shot('menu-desktop');

await play(0);
await expect('joined: menu hidden, hud shown', `document.getElementById('menu').hidden && !document.getElementById('hud').hidden`);
await expect('tier 1 perk panel offers ten perks', `!document.getElementById('perk-panel').hidden && document.querySelectorAll('.perk').length === 10`);
await shot('game-perk');

await press('Digit2', '2');
await sleep(300);
await expect('perk panel closes after picking with a digit key', `document.getElementById('perk-panel').hidden`);
await mouse('mouseMoved', 1000, 300);
await press('KeyD', 'd', 500);
await mouse('mousePressed', 1000, 300);
await sleep(700);
await mouse('mouseReleased', 1000, 300);
await shot('game-fire');

await chat('/evolve');
await sleep(200);
await expect('evolve panel offers the two pistol branches by name', `[...document.querySelectorAll('.perk.evolve b')].map((b) => b.textContent).join() === 'Hand Cannon,Machine Pistol'`);
await shot('game-evolve');
await press('Digit1', '1');
await sleep(300);
await expect('evolve panel closes after picking', `document.getElementById('perk-panel').hidden`);
await shot('game-evolved');

await chat('/level');
await press('Digit1', '1');
await chat('/level');
await sleep(200);
await expect('tier 3 perk panel offers seven abilities', `document.querySelectorAll('.perk').length === 7`);
await press('Digit1', '1');
await sleep(200);
await mouse('mouseMoved', 900, 250);
await press('Space', ' ', 80);
await sleep(120);
await shot('game-boom');
await sleep(900);
await shot('game-explosion');
await chat('/walls');
await chat('hello from the driver');
await shot('game-ability');
await expect('chat line rendered', `document.getElementById('chat-log').textContent.includes('hello from the driver')`);

await chat('/win');
await sleep(300);
await expect('winner banner shown', `!document.getElementById('banner').hidden`);
await shot('game-banner');

await chat('/die');
await sleep(400);
await expect('death screen names the killer', `document.getElementById('death-title').textContent.includes('Ember')`);
await expect('respawn disabled during countdown', `document.getElementById('respawn').disabled`);
await shot('game-dead');
await sleep(3000);
await evaluate(`document.querySelectorAll('#loadout-death .weapon')[4].click()`);
await evaluate(`document.getElementById('respawn').click()`);
await sleep(500);
await expect('respawned: death screen hidden', `document.getElementById('death').hidden`);

await cdp('Page.navigate', { url: URL_ });
await sleep(1000);
await play(2);
await mouse('mouseMoved', 900, 500);
await sleep(800);
await shot('game-dom');

await viewport(375, 700, true);
await sleep(500);
await shot('game-phone');

console.log(`screenshots in ${OUT}`);
for (const p of problems) console.log(p);
page.close();
process.exit(problems.length ? 1 : 0);
