/// <reference types="node" />
import { appendFileSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { expandMap, parseMapFile, serializeMapFile, type MapFile } from '../../../../src/shared/maps.ts';
import { openPage, sleep } from './lib/browser.ts';

const RUN = process.argv[2];
const ID = process.argv[3] ?? 'warehouse';
if (!RUN) { console.error('usage: node editor.ts <run-dir> [map] (SAVE_REPO=<repo the server runs from> to prove Save to repo; SHOT=<file.webp>)'); process.exit(2); }
const BASE = `http://localhost:${readFileSync(join(RUN, 'port'), 'utf8').trim()}`;
const EVIDENCE = join(RUN, 'evidence');
mkdirSync(EVIDENCE, { recursive: true });
const LOG = join(EVIDENCE, 'editor.log');
const SAVE_REPO = process.env.SAVE_REPO;
const SHOT = process.env.SHOT ?? join(EVIDENCE, 'editor.webp');
let failed = false;
const log = (line: string) => { console.log(line); appendFileSync(LOG, line + '\n'); };
const expect = (what: string, ok: boolean, detail = '') => { log(`${ok ? 'ok' : 'FAIL'} ${what}${detail ? ` (${detail})` : ''}`); if (!ok) failed = true; };
writeFileSync(LOG, `editor ${BASE} map=${ID}\n`);

const requested: string[] = [];
const page = await openPage({
  profile: 'skirmish-editor-',
  viewport: { width: 1600, height: 900 },
  onEvent: (method, p) => {
    if (method === 'Network.requestWillBeSent') requested.push(new URL(p.request.url).pathname);
    if (method === 'Page.javascriptDialogOpening') { log(`dialog ${p.type}: leaving with unsaved changes was questioned`); void page.cdp('Page.handleJavaScriptDialog', { accept: true }); }
  },
  onProblem: (kind, detail) => log(`problem ${kind}: ${detail}`),
});
const { cdp, js } = page;
const mouse = async (type: 'mouseMoved' | 'mousePressed' | 'mouseReleased', x: number, y: number, mods = 0, button = 'left') =>
  cdp('Input.dispatchMouseEvent', { type, x, y, button: type === 'mouseMoved' ? 'none' : button, buttons: type === 'mouseReleased' ? 0 : type === 'mousePressed' ? 1 : 0, clickCount: 1, modifiers: mods });
const click = async (x: number, y: number) => { await mouse('mouseMoved', x, y); await mouse('mousePressed', x, y); await mouse('mouseReleased', x, y); await sleep(60); };
const press = async (key: string, code: string, vk: number, mods = 0) => {
  await cdp('Input.dispatchKeyEvent', { type: 'rawKeyDown', key, code, windowsVirtualKeyCode: vk, modifiers: mods });
  await cdp('Input.dispatchKeyEvent', { type: 'keyUp', key, code, windowsVirtualKeyCode: vk, modifiers: mods });
  await sleep(60);
};
const CTRL = 2, SHIFT = 8;
const file = async (): Promise<MapFile> => js('skirmishEditor.file()');
const screenOf = async (p: { x: number; y: number }): Promise<{ x: number; y: number }> => js(`skirmishEditor.toScreen(${JSON.stringify(p)})`);
const centerOfButton = async (selector: string): Promise<{ x: number; y: number }> => js(`(() => { const b = document.querySelector(${JSON.stringify(selector)}); b.scrollIntoView({ block: 'center' }); const r = b.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; })()`);
const lintDone = async () => { for (let i = 0; i < 100 && !(await js('skirmishEditor.lintedAt()')); i++) await sleep(50); };

// The player's page never fetches the editor, whatever it is passed without ?dev.
await cdp('Page.navigate', { url: `${BASE}/?editor=${ID}` });
await sleep(2500);
expect('without ?dev the game menu shows and the editor is not fetched', await js(`!document.getElementById('menu').hidden && !window.skirmishEditor`) && !requested.includes('/editor.js'));

requested.length = 0;
await cdp('Page.navigate', { url: `${BASE}/?dev&editor=${ID}` });
for (let i = 0; i < 200 && !(await js('!!window.skirmishEditor && !!skirmishEditor.world()?.atlas')); i++) await sleep(150);
expect('?dev&editor fetches the editor bundle and hides the menu', requested.includes('/editor.js') && await js(`document.getElementById('menu').hidden`));
expect('the world stage drew with the baked atlas', !!(await js('skirmishEditor.world()?.atlas')), JSON.stringify(await js('skirmishEditor.world()')));
expect('no socket was opened: the game did not start', !requested.some((p) => p === '/ws'));
await lintDone();
const start = await file();
const shipped = parseMapFile(JSON.parse(readFileSync(new URL(`../../../../src/shared/maps/${ID}.json`, import.meta.url), 'utf8')));
expect('it opened the map file as stored', serializeMapFile(start) === serializeMapFile(shipped));
expect('the stored map lints clean, as scripts/map-lint.ts says', (await js('skirmishEditor.problems().length')) === 0);
for (let i = 0; i < 30 && !(await js('skirmishEditor.world()?.tiles === 1')); i++) await sleep(200);
expect('the baked light layer is on screen', (await js('skirmishEditor.world()?.tiles')) === 1);

// Zoom in with the wheel on the container nearest the middle of the west half, keeping it under the cursor.
const containers = start.pieces.filter((at) => at.p.startsWith('container.') && at.r % 2 === 0);
const spot = { x: start.size * 0.38, y: start.size * 0.5 };
const target = containers.sort((a, b) => Math.hypot(a.x - spot.x, a.y - spot.y) - Math.hypot(b.x - spot.x, b.y - spot.y))[0]!;
const targetCenter = { x: target.x + 50, y: target.y + 125 };
const exact = await screenOf(targetCenter);
// Input events carry whole pixels, so aim at one.
let at = { x: Math.round(exact.x), y: Math.round(exact.y) };
const before = (await js('skirmishEditor.camera().scale')) as number;
for (let i = 0; i < 4; i++) { await cdp('Input.dispatchMouseEvent', { type: 'mouseWheel', x: at.x, y: at.y, deltaX: 0, deltaY: -240 }); await sleep(40); }
const after = (await js('skirmishEditor.camera().scale')) as number;
const stillExact = await screenOf(targetCenter);
const zoomed = (await js(`skirmishEditor.camera().scale`)) / before;
const still = { x: stillExact.x - (exact.x - at.x) * zoomed, y: stillExact.y - (exact.y - at.y) * zoomed };
expect('the wheel zooms in about the cursor', after > before * 3.5 && Math.hypot(still.x - at.x, still.y - at.y) < 2, `${before.toFixed(3)} to ${after.toFixed(3)}, the point moved ${Math.hypot(still.x - at.x, still.y - at.y).toFixed(1)}px`);
at = still;

// Place a forklift on top of the container: the lint flags the overlap where it is.
const fork = await centerOfButton('#ed-palette button[data-piece="forklift"]');
await click(fork.x, fork.y);
expect('picking a palette piece starts placing it', (await js('skirmishEditor.mode()')) === 'place');
await click(at.x, at.y);
let f = await file();
const placedAt = f.pieces.at(-1)!;
expect('a click places the piece centred on the cursor, snapped to the grid', placedAt.p === 'forklift' && placedAt.x % 25 === 0 && placedAt.y % 25 === 0 && Math.abs(placedAt.x + 37.5 - targetCenter.x) <= 25, JSON.stringify(placedAt));
if (start.symmetry === 'halfTurn') expect('a half-turn map keeps only the half in the file, and the twin is added on load', f.pieces.length === start.pieces.length + 1 && expandMap(f).pieces.length === expandMap(start).pieces.length + 2);
await lintDone();
const problems = (await js('skirmishEditor.problems()')) as { text: string; at: { x: number; y: number } | null }[];
const overlap = problems.find((p) => p.text.startsWith('forklift at') || p.text.includes('overlaps forklift'));
expect('the live lint reports the overlap at the piece', !!overlap && !!overlap.at && Math.abs(overlap.at.x - targetCenter.x) < 150, overlap?.text ?? JSON.stringify(problems));

// Hover a second forklift beside the marker, with its twin following, for the screenshot.
await mouse('mouseMoved', at.x + 230, at.y + 90);
await sleep(400);
await cdp('Page.captureScreenshot', { format: 'webp', quality: 90 }).then((r: { data: string }) => writeFileSync(SHOT, Buffer.from(r.data, 'base64')));
log(`screenshot ${SHOT}`);
await press('Escape', 'Escape', 27);
expect('Esc stops placing', (await js('skirmishEditor.mode()')) === 'idle');

// Drag the placed forklift two cells right, then free-place it with Shift.
const forkCenter = await screenOf({ x: placedAt.x + 37.5, y: placedAt.y + 62.5 });
const scale = (await js('skirmishEditor.camera().scale')) as number;
await mouse('mouseMoved', forkCenter.x, forkCenter.y);
await mouse('mousePressed', forkCenter.x, forkCenter.y);
for (let i = 1; i <= 5; i++) { await mouse('mouseMoved', forkCenter.x + (52 * scale * i) / 5, forkCenter.y); await sleep(20); }
await mouse('mouseReleased', forkCenter.x + 52 * scale, forkCenter.y);
await sleep(80);
f = await file();
expect('dragging moves the piece by whole grid cells', f.pieces.at(-1)!.x === placedAt.x + 50 && f.pieces.at(-1)!.y === placedAt.y, JSON.stringify(f.pieces.at(-1)));
const dragged = f.pieces.at(-1)!;
const from2 = await screenOf({ x: dragged.x + 37.5, y: dragged.y + 62.5 });
await mouse('mouseMoved', from2.x, from2.y, SHIFT);
await mouse('mousePressed', from2.x, from2.y, SHIFT);
await mouse('mouseMoved', from2.x + 7 * scale, from2.y + 3 * scale, SHIFT);
await mouse('mouseReleased', from2.x + 7 * scale, from2.y + 3 * scale, SHIFT);
await sleep(80);
f = await file();
expect('Shift drags free of the grid', f.pieces.at(-1)!.x === dragged.x + 7 && f.pieces.at(-1)!.y === dragged.y + 3, JSON.stringify(f.pieces.at(-1)));

await press('r', 'KeyR', 82);
f = await file();
expect('R turns the selected piece a quarter', f.pieces.at(-1)!.r === 1, JSON.stringify(f.pieces.at(-1)));
await press('z', 'KeyZ', 90, CTRL);
expect('Ctrl+Z undoes the turn', (await file()).pieces.at(-1)!.r === 0);
await press('z', 'KeyZ', 90, CTRL | SHIFT);
expect('Ctrl+Shift+Z redoes it', (await file()).pieces.at(-1)!.r === 1);

// A spawn: select it and drag its corner to grow it.
const spawn = start.spawns.ffa[0] ?? start.spawns.red[0]!;
const side = start.spawns.ffa[0] ? 'ffa' : 'red';
await press('f', 'KeyF', 70);
const spawnScale = (await js('skirmishEditor.camera().scale')) as number;
const sIn = await screenOf({ x: spawn.x + 6 / spawnScale, y: spawn.y + 6 / spawnScale });
await click(sIn.x, sIn.y);
const sel = (await js('skirmishEditor.selected()')) as { k: string; side?: string } | null;
expect('clicking a spawn region selects it', sel?.k === 'spawn' && sel.side === side, JSON.stringify(sel));
const corner = await screenOf({ x: spawn.x + spawn.w, y: spawn.y + spawn.h });
await mouse('mouseMoved', corner.x, corner.y);
await mouse('mousePressed', corner.x, corner.y);
await mouse('mouseMoved', corner.x + 50 * spawnScale, corner.y + 50 * spawnScale);
await mouse('mouseReleased', corner.x + 50 * spawnScale, corner.y + 50 * spawnScale);
await sleep(80);
const grown = (await file()).spawns[side][0]!;
expect('dragging a spawn corner resizes it', grown.w === spawn.w + 50 && grown.h === spawn.h + 50 && grown.x === spawn.x, JSON.stringify(grown));
await press('z', 'KeyZ', 90, CTRL);

// The light layer is baked from the map as loaded; turning it off shows the floor drawn from the edited walls.
await press('l', 'KeyL', 76);
await sleep(300);
expect('L hides the baked light layer', (await js('skirmishEditor.world()?.tiles')) === 0 && (await js(`document.getElementById('ed-light').checked`)) === false);
await press('l', 'KeyL', 76);

// Delete the forklift (select it first) and check the file is back to the map as stored.
f = await file();
const last = f.pieces.at(-1)!;
const lastScreen = await screenOf({ x: last.x + 10, y: last.y + 10 });
await click(lastScreen.x, lastScreen.y);
await press('Delete', 'Delete', 46);
f = await file();
expect('Delete removes the selected piece', f.pieces.length === start.pieces.length && serializeMapFile(f) === serializeMapFile(start));
await lintDone();
expect('the lint is clean again', (await js('skirmishEditor.problems().length')) === 0);

// Downloading writes the file in the stored format.
const downloads = join(RUN, 'downloads');
mkdirSync(downloads, { recursive: true });
await cdp('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath: downloads });
const dl = await centerOfButton('#ed-download');
await click(dl.x, dl.y);
for (let i = 0; i < 50 && !existsSync(join(downloads, `${ID}.json`)); i++) await sleep(100);
const got = existsSync(join(downloads, `${ID}.json`)) ? readFileSync(join(downloads, `${ID}.json`), 'utf8') : '';
expect('Download saves the file exactly as the repo stores it', got === serializeMapFile(await file()) && got === serializeMapFile(shipped), `${got.length} bytes, ${readdirSync(downloads).join(' ')}`);

if (SAVE_REPO) {
  const forkAgain = await centerOfButton('#ed-palette button[data-piece="forklift"]');
  await click(forkAgain.x, forkAgain.y);
  const free = await screenOf({ x: start.size / 2 - 300, y: start.size / 2 + 200 });
  await click(free.x, free.y);
  await press('Escape', 'Escape', 27);
  const edited = await file();
  await press('s', 'KeyS', 83, CTRL);
  for (let i = 0; i < 50 && !(await js(`document.getElementById('ed-status').textContent.startsWith('Wrote')`)); i++) await sleep(100);
  const disk = readFileSync(join(SAVE_REPO, 'src/shared/maps', `${ID}.json`), 'utf8');
  expect('Ctrl+S writes the edited map into the repo the server runs from', disk === serializeMapFile(edited) && disk !== serializeMapFile(shipped), await js(`document.getElementById('ed-status').textContent`));
  await cdp('Page.reload');
  for (let i = 0; i < 100 && !(await js('!!window.skirmishEditor')); i++) await sleep(100);
  expect('a reload opens the saved file from the dev server', serializeMapFile(await file()) === disk);
}

page.close();
log(failed ? 'RESULT FAIL' : 'RESULT ok');
process.exit(failed ? 1 : 0);
