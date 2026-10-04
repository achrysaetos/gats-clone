/// <reference types="node" />
// Usage: node zombies-ui.ts <run-dir> [step ...]   Steps: menu badlink squad build night (default, in order), plus downed and report on request.
// Drives the zombies client in headless Chrome through real input. downed and report need a scratch copy with fragile humans and a weak core (see features/zombies.md).
import { spawn } from 'node:child_process';
import { appendFileSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import WebSocket from 'ws';
import type { BuildingView, RunView, Snapshot, ZombieView } from '../../../../src/shared/protocol.ts';
import { fillSnapshot } from '../../../../src/shared/wire.ts';
import { BUILDINGS, ZOM } from '../../../../src/shared/defs.ts';
import { killOnExit } from '../../../../scripts/kill-on-exit.ts';

const RUN = process.argv[2];
if (!RUN) { console.error('usage: node zombies-ui.ts <run-dir> [step ...]'); process.exit(2); }
const steps = process.argv.length > 3 ? process.argv.slice(3) : ['menu', 'badlink', 'squad', 'build', 'night'];
const BASE = `http://localhost:${readFileSync(join(RUN, 'port'), 'utf8').trim()}`;
const EV = join(RUN, 'evidence');
const LOG = join(EV, 'zombies-ui.log');
mkdirSync(EV, { recursive: true });
const VIEW = { w: 1280, h: 800 };
const NAME = `Zed${Math.floor(Math.random() * 1e4)}`;
const CHROME = process.env.CHROME ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const log = (line: string) => { console.log(line); appendFileSync(LOG, line + '\n'); };
const problems: string[] = [];
const expect = (label: string, ok: boolean, detail = '') => { log(`${ok ? 'ok  ' : 'FAIL'} ${label}${detail ? `  (${detail})` : ''}`); if (!ok) problems.push(label); return ok; };

const freePort = () => new Promise<number>((r) => { const s = createServer().listen(0, () => { const p = (s.address() as { port: number }).port; s.close(() => r(p)); }); });
const debugPort = await freePort();
const chrome = killOnExit(spawn(CHROME, ['--headless=new', '--mute-audio', `--remote-debugging-port=${debugPort}`, `--user-data-dir=${mkdtempSync(join(tmpdir(), 'skirmish-zombies-'))}`,
  '--no-first-run', '--no-default-browser-check', '--hide-scrollbars', 'about:blank'], { stdio: 'ignore' }));
let target = '';
for (let i = 0; i < 50 && !target; i++) {
  try {
    const list = (await (await fetch(`http://127.0.0.1:${debugPort}/json/list`)).json()) as { type: string; webSocketDebuggerUrl: string }[];
    target = list.find((t) => t.type === 'page')?.webSocketDebuggerUrl ?? '';
  } catch {}
  if (!target) await sleep(200);
}
const page = new WebSocket(target);
await new Promise((r) => page.once('open', r));

const frames = { welcome: null as null | { id: number; mode: string }, snap: null as Snapshot | null };
let nextId = 1;
const pending = new Map<number, (v: any) => void>();
page.on('message', (raw) => {
  const m = JSON.parse(String(raw));
  if (m.id && pending.has(m.id)) { pending.get(m.id)!(m.result); pending.delete(m.id); return; }
  if (m.method === 'Network.webSocketFrameReceived') {
    const msg = JSON.parse(m.params.response.payloadData);
    if (msg.t === 'welcome') { frames.welcome = msg; frames.snap = null; }
    if (msg.t === 'snap') frames.snap = fillSnapshot(msg, frames.snap) ?? frames.snap;
  } else if (m.method === 'Runtime.exceptionThrown') problems.push(`page exception: ${m.params.exceptionDetails.exception?.description ?? m.params.exceptionDetails.text}`);
  else if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') problems.push(`console.error: ${JSON.stringify(m.params.args.map((a: { value?: unknown }) => a.value))}`);
});
const cdp = (method: string, params: object = {}): Promise<any> => new Promise((r) => { const id = nextId++; pending.set(id, r); page.send(JSON.stringify({ id, method, params })); });
const js = async (expr: string) => (await cdp('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true })).result?.value;
const shot = async (name: string) => { const { data } = await cdp('Page.captureScreenshot', { format: 'png' }); writeFileSync(join(EV, `${name}.png`), Buffer.from(data, 'base64')); log(`shot ${name}.png`); };
const until = async (fn: () => unknown, ms = 4000) => { const end = Date.now() + ms; while (Date.now() < end) { if (await fn()) return true; await sleep(100); } return false; };
const mouse = (type: string, x: number, y: number, button: 'left' | 'right' | 'none' = 'none') => cdp('Input.dispatchMouseEvent', { type, x, y, button, clickCount: type === 'mouseMoved' ? 0 : 1 });
const click = async (x: number, y: number, button: 'left' | 'right' = 'left') => { await mouse('mouseMoved', x, y); await mouse('mousePressed', x, y, button); await mouse('mouseReleased', x, y, button); };
const clickEl = async (selector: string) => {
  const at = await js(`(() => { const b = document.querySelector('${selector}'); if (!b) return null; b.scrollIntoView({ block: 'center' }); const r = b.getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2]; })()`);
  if (!at) return false;
  await click(at[0], at[1]);
  return true;
};
const VK: Record<string, number> = { KeyB: 66, KeyE: 69, KeyW: 87, KeyA: 65, KeyS: 83, KeyD: 68 };
const key = async (code: string, type: 'keyDown' | 'keyUp') => cdp('Input.dispatchKeyEvent', { type, code, key: code.slice(3).toLowerCase(), windowsVirtualKeyCode: VK[code] });
const tap = async (code: string) => { await key(code, 'keyDown'); await sleep(60); await key(code, 'keyUp'); };
const status = () => js(`document.getElementById('menu-status').textContent`) as Promise<string>;
const me = () => frames.snap?.players.find((p) => p.id === frames.welcome?.id);
const run = (): RunView | undefined => frames.snap?.run;
type ZombiesDev = { building: boolean; ghost: { cx: number; cy: number; refusal: string | null; label: string } | null; coreAlert: boolean; callouts: string[] };
const zdev = () => js(`skirmishDev.zombies()`) as Promise<ZombiesDev | null>;
const toScreen = (x: number, y: number) => js(`skirmishDev.toScreen(${x}, ${y})`) as Promise<{ x: number; y: number } | null>;
const aimAtWorld = async (x: number, y: number) => { const at = await toScreen(x, y); if (at) await mouse('mouseMoved', at.x, at.y); return at; };
const cellCenter = (cx: number, cy: number) => ({ x: (cx + 0.5) * ZOM.cell, y: (cy + 0.5) * ZOM.cell });
const hasWall = (b: readonly BuildingView[] | undefined, cx: number, cy: number) => !!b?.some((w) => w.cx === cx && w.cy === cy);
let squad = '';

await cdp('Runtime.enable'); await cdp('Page.enable'); await cdp('Network.enable');
await cdp('Emulation.setDeviceMetricsOverride', { width: VIEW.w, height: VIEW.h, deviceScaleFactor: 1, mobile: false });
log(`zombies-ui ${new Date().toISOString()} base=${BASE} name=${NAME} steps=${steps.join(',')}`);

const openMenu = async (query = '') => {
  await cdp('Page.navigate', { url: `${BASE}/?dev${query}` });
  await until(async () => (await js(`document.querySelectorAll('#servers .server').length`)) === 3, 6000);
  await js(`document.getElementById('name').value = '${NAME}'`);
};
const showSquadMenu = () => js(`document.getElementById('squad').scrollIntoView({ block: 'center' })`);

/** Holds fire on the nearest zombie and strafes beside the core until `done`, respawning nothing: a run brings its players back itself. */
async function fight(done: () => Promise<boolean> | boolean, ms: number, onTick: () => Promise<void> = async () => {}) {
  const end = Date.now() + ms;
  let pressed = false;
  let step = 0;
  while (Date.now() < end && !(await done())) {
    const self = me();
    const horde: ZombieView[] = frames.snap?.zombies ?? [];
    const near = self && horde.length ? horde.reduce((a, b) => (Math.hypot(a[2] - self.x, a[3] - self.y) <= Math.hypot(b[2] - self.x, b[3] - self.y) ? a : b)) : null;
    if (self?.alive && near) {
      const raw = await toScreen(near[2], near[3]);
      const at = raw && { x: Math.min(VIEW.w - 20, Math.max(20, raw.x)), y: Math.min(VIEW.h - 20, Math.max(20, raw.y)) };
      if (at) await mouse('mouseMoved', at.x, at.y);
      if (at && !pressed) { await mouse('mousePressed', at.x, at.y, 'left'); pressed = true; }
    } else if (pressed) {
      await mouse('mouseReleased', VIEW.w / 2, VIEW.h / 2, 'left');
      pressed = false;
    }
    if (++step % 10 === 0 && self?.alive && run()) {
      const core = run()!.core;
      const k = Math.hypot(core.x - self.x, core.y - self.y) > 220 ? (core.x > self.x ? 'KeyD' : 'KeyA') : null;
      if (k) { await key(k, 'keyDown'); await sleep(200); await key(k, 'keyUp'); }
    }
    await onTick();
    await sleep(100);
  }
  if (pressed) await mouse('mouseReleased', VIEW.w / 2, VIEW.h / 2, 'left');
}

const STEPS: Record<string, () => Promise<void>> = {
  async menu() {
    await openMenu();
    expect('menu offers to start a zombies squad', await js(`!!document.getElementById('squad-start')`));
    await clickEl('#loadout-menu .weapon:nth-child(6)');
    expect('the shared loadout picker takes the LMG', await js(`document.querySelector('#loadout-menu .weapon:nth-child(6)').getAttribute('aria-pressed') === 'true'`));
    await showSquadMenu();
    await shot('zom-menu');
  },
  async badlink() {
    await openMenu('&squad=not-a-code');
    expect('a broken invite link says so on the menu', (await status()).includes('broken'), await status());
    await openMenu('&squad=z-aaaaaa');
    expect('an invite link selects its squad', await js(`document.getElementById('squad-room')?.getAttribute('aria-pressed') === 'true'`));
    await clickEl('#play');
    expect('joining a squad that is gone says it has closed', await until(async () => (await status()).includes('has closed'), 6000), await status());
    expect('the dead code leaves the address bar', !(await js(`location.search`)).includes('squad='));
    await showSquadMenu();
    await shot('zom-badlink');
  },
  async squad() {
    await openMenu();
    await clickEl('#loadout-menu .weapon:nth-child(6)');
    await clickEl('#squad-start');
    expect('Start a squad joins a zombies room', await until(() => frames.welcome?.mode === 'ZOM', 8000), `mode ${frames.welcome?.mode}`);
    squad = new URLSearchParams(await js(`location.search`)).get('squad') ?? '';
    expect('the address bar carries the squad code', /^z-[a-z2-7]{6}$/.test(squad), squad);
    const listed = ((await (await fetch(`${BASE}/api/servers`)).json()) as { id: string }[]).some((r) => r.id === squad);
    expect('the squad stays off the public room list', !listed);
    expect('the in-game chip names the squad', await until(async () => (await js(`document.getElementById('squad-chip').hidden ? '' : document.getElementById('squad-chip').textContent`)).includes(squad)));
    const link: string = await js(`document.getElementById('squad-link').value`);
    expect('the invite link is this page with only the squad code', link === `${BASE}/?squad=${squad}`, link);
    const friend = new WebSocket(`${BASE.replace(/^http/, 'ws')}/ws?room=${new URL(link).searchParams.get('squad')}`);
    const friendMode = await new Promise<string>((r) => {
      friend.on('open', () => friend.send(JSON.stringify({ t: 'join', name: 'Friend', loadout: { weapon: 'smg', armor: 'none', color: 'green' }, aspect: 1.6 })));
      friend.on('message', (raw) => { const m = JSON.parse(String(raw)); if (m.t === 'welcome') r(m.mode); });
      setTimeout(() => r('none'), 4000);
    });
    expect('a friend following the invite link lands in the same squad', friendMode === 'ZOM');
    await until(() => (frames.snap?.players.length ?? 0) >= 2 && !!frames.snap?.players.some((p) => p.name === 'Friend'), 4000);
    friend.close();
    expect('the run opens on day 1', run()?.phase === 'day' && run()?.night === 1, `${run()?.phase} ${run()?.night}`);
    await sleep(800);
    await shot('zom-squad-joined');
    await cdp('Page.reload', { ignoreCache: true });
    await until(async () => (await js(`document.querySelectorAll('#servers .server').length`)) === 3, 6000);
    expect('reopening the invite link selects the squad on the menu', await js(`document.getElementById('squad-room')?.getAttribute('aria-pressed') === 'true'`));
    await sleep(300);
    await shot('zom-menu-squad');
    frames.welcome = null;
    await js(`document.getElementById('name').value = '${NAME}'`);
    await clickEl('#play');
    expect('Play rejoins the squad from the invite link', await until(() => frames.welcome?.mode === 'ZOM' && !!me(), 8000));
  },
  async build() {
    await until(() => run()?.phase === 'day' && me()?.alive, 60_000);
    await tap('KeyB');
    expect('B turns build mode on by day', await until(async () => (await zdev())?.building === true));
    const self = me()!;
    let cell: { cx: number; cy: number } | null = null;
    for (const [dx, dy] of [[-2, 0], [-2, 1], [-2, -1], [0, 2], [0, -2], [2, 2], [-3, 0], [0, 3]]) {
      const cx = Math.floor(self.x / ZOM.cell) + dx, cy = Math.floor(self.y / ZOM.cell) + dy;
      await aimAtWorld(cellCenter(cx, cy).x, cellCenter(cx, cy).y);
      await sleep(80);
      const g = (await zdev())?.ghost;
      if (g?.cx === cx && g.cy === cy && g.refusal === null) { cell = { cx, cy }; break; }
    }
    if (!expect('the ghost turns green over a buildable cell', cell !== null)) return;
    await shot('zom-ghost-valid');
    const scrap = run()!.scrap;
    const at = await toScreen(cellCenter(cell!.cx, cell!.cy).x, cellCenter(cell!.cx, cell!.cy).y);
    await click(at!.x, at!.y);
    expect('a left click puts the wall up on the server', await until(() => hasWall(frames.snap?.buildings, cell!.cx, cell!.cy)), `cell ${cell!.cx},${cell!.cy}`);
    expect('the wall cost its scrap', await until(() => run()!.scrap === scrap - BUILDINGS.wall.cost), `${scrap} -> ${run()!.scrap}`);
    await sleep(300);
    await shot('zom-wall-built');
    const core = run()!.core;
    await aimAtWorld(core.x, core.y);
    expect('the ghost turns red with a reason over the core', await until(async () => (await zdev())?.ghost?.refusal === 'core'), (await zdev())?.ghost?.label);
    await sleep(200);
    await shot('zom-ghost-invalid');
    await aimAtWorld(self.x + 9 * ZOM.cell, self.y);
    expect('a cell out of reach is refused', await until(async () => ['outOfReach', 'farFromCore'].includes((await zdev())?.ghost?.refusal ?? '')), (await zdev())?.ghost?.label);
    const before = run()!.scrap;
    await aimAtWorld(cellCenter(cell!.cx, cell!.cy).x, cellCenter(cell!.cx, cell!.cy).y);
    expect('the ghost offers to take your wall down', await until(async () => (await zdev())?.ghost?.refusal === 'taken'));
    await click(at!.x, at!.y, 'right');
    expect('a right click takes the wall down for half its cost', await until(() => !hasWall(frames.snap?.buildings, cell!.cx, cell!.cy) && run()!.scrap === before + BUILDINGS.wall.cost / 2), `${before} -> ${run()!.scrap}`);
    await click(at!.x, at!.y);
    expect('the wall goes back up', await until(() => hasWall(frames.snap?.buildings, cell!.cx, cell!.cy)));
    await mouse('mouseMoved', VIEW.w / 2 + 200, VIEW.h / 2);
  },
  async night() {
    const nightAt = Date.now();
    const callout = (title: string) => async () => (await zdev())?.callouts.some((c) => c.startsWith(title)) ?? false;
    if (run()?.phase === 'day') {
      expect('a warning callout comes ten seconds before night', await until(callout('Night falls in'), 45_000));
      await shot('zom-dusk-warning');
    }
    expect('night falls', await until(() => run()?.phase === 'night', 15_000));
    expect('night turns build mode off', await until(async () => (await zdev())?.building === false));
    expect('a Night callout announces the wave', await until(callout('Night 1'), 3000));
    await sleep(300);
    await shot('zom-night-callout');
    let crowd = false, alerted = false;
    await fight(() => run()?.phase === 'day' && run()!.night === 2, 150_000, async () => {
      if (!crowd && (frames.snap?.zombies?.length ?? 0) >= 6 && me()?.alive) { crowd = true; await shot('zom-night'); }
      if (!alerted && (await zdev())?.coreAlert) { alerted = true; await shot('zom-core-alert'); }
    });
    expect('the squad saw zombies in view', crowd);
    expect('the driven player shot zombies through real input', (frames.snap?.self.kills ?? 0) > 0, `${frames.snap?.self.kills} kills`);
    log(`note core alert ${alerted ? 'seen' : 'not seen'} on night 1`);
    expect('dawn of night 2 arrives', run()?.phase === 'day' && run()?.night === 2, `${Math.round((Date.now() - nightAt) / 1000)}s`);
    expect('a Dawn callout sums up the night', await until(callout('Dawn'), 3000));
    await sleep(300);
    await shot('zom-dawn');
  },
  async downed() {
    const end = Date.now() + 200_000;
    while (Date.now() < end && !me()?.downed && run()?.phase !== 'over') {
      const self = me();
      const z = self && (frames.snap?.zombies ?? []).sort((a, b) => Math.hypot(a[2] - self.x, a[3] - self.y) - Math.hypot(b[2] - self.x, b[3] - self.y))[0];
      if (self?.alive && z) {
        const keys = [z[2] > self.x + 20 ? 'KeyD' : z[2] < self.x - 20 ? 'KeyA' : null, z[3] > self.y + 20 ? 'KeyS' : z[3] < self.y - 20 ? 'KeyW' : null].filter((k) => k !== null);
        for (const k of keys) await key(k, 'keyDown');
        await sleep(150);
        for (const k of keys) await key(k, 'keyUp');
      } else await sleep(150);
    }
    if (!expect('the driven player goes down to a bite', !!me()?.downed)) return;
    await sleep(500);
    await shot('zom-downed');
    expect('a downed player stays in play, not on the death screen', await js(`document.getElementById('death').hidden`));
    const bled = await until(() => me() && !me()!.alive && !me()!.downed, ZOM.bleedOutMs + 5000);
    if (!bled) { log('note revived before bleeding out'); return; }
    expect('bleeding out opens the death screen', await until(async () => !(await js(`document.getElementById('death').hidden`))));
    expect('it says back at dawn instead of offering a respawn', await until(async () => (await js(`document.getElementById('death-sub').textContent`)).startsWith('Back at dawn') && await js(`document.getElementById('respawn').hidden`)));
    await sleep(300);
    await shot('zom-bled-out');
  },
  async report() {
    let alerted = false;
    await fight(() => run()?.phase === 'over', 300_000, async () => {
      if (!alerted && (await zdev())?.coreAlert) { alerted = true; await sleep(200); await shot('zom-core-alert'); }
    });
    expect('the core falls', run()?.phase === 'over');
    expect('the report shows the night reached and a row per player', await until(async () => (await js(`document.getElementById('report').hidden ? 0 : document.querySelectorAll('#report tr').length`)) >= 5, 3000));
    expect('the report counts down to the next run', (await js(`document.getElementById('report').textContent`)).includes('Next run in'));
    await sleep(400);
    await shot('zom-report');
  },
};

for (const s of steps) {
  if (!STEPS[s]) { expect(`known step "${s}"`, false); continue; }
  try { await STEPS[s](); } catch (e) { expect(`step ${s} ran without throwing`, false, String(e)); }
}
for (const p of problems.filter((p) => p.startsWith('page') || p.startsWith('console'))) log(p);
log(problems.length ? `RESULT FAIL (${problems.length})` : 'RESULT PASS');
page.close(); chrome.kill();
process.exit(problems.length ? 1 : 0);
