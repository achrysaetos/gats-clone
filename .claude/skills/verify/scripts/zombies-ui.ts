/// <reference types="node" />
// Usage: node zombies-ui.ts <run-dir> [step ...]   Steps: menu badlink squad build turrets night (default, in order), plus downed and report on request.
// Drives the zombies client in headless Chrome through real input. downed and report need a scratch copy with fragile humans and a weak core, and turrets builds a cannon
// only on a scratch copy with more starting scrap (see features/zombies.md).
import { appendFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import WebSocket from 'ws';
import type { BuildingView, RunView, Snapshot, ZombieView } from '../../../../src/shared/protocol.ts';
import type { BuildingKind, TurretKind } from '../../../../src/shared/defs.ts';
import { fillSnapshot } from '../../../../src/shared/wire.ts';
import { BUILDINGS, byTurret, ZOM, ZOMBIES } from '../../../../src/shared/defs.ts';
import { hold, key, openPage, serversListed, sleep, type Dir } from './lib/browser.ts';

const RUN = process.argv[2];
if (!RUN) { console.error('usage: node zombies-ui.ts <run-dir> [step ...]'); process.exit(2); }
const steps = process.argv.length > 3 ? process.argv.slice(3) : ['menu', 'badlink', 'squad', 'build', 'turrets', 'night'];
const BASE = `http://localhost:${readFileSync(join(RUN, 'port'), 'utf8').trim()}`;
const EV = join(RUN, 'evidence');
const LOG = join(EV, 'zombies-ui.log');
mkdirSync(EV, { recursive: true });
const VIEW = { w: 1280, h: 800 };
const NAME = `Zed${Math.floor(Math.random() * 1e4)}`;
const log = (line: string) => { console.log(line); appendFileSync(LOG, line + '\n'); };
const problems: string[] = [];
const expect = (label: string, ok: boolean, detail = '') => { log(`${ok ? 'ok  ' : 'FAIL'} ${label}${detail ? `  (${detail})` : ''}`); if (!ok) problems.push(label); return ok; };

const frames = {
  welcome: null as null | { id: number; mode: string }, snap: null as Snapshot | null,
  turretShots: byTurret(() => 0), turretKills: 0, lowestAmmo: byTurret(() => 10), scrapEarned: 0,
};
const page = await openPage({
  profile: 'skirmish-zombies-',
  viewport: { width: VIEW.w, height: VIEW.h },
  onEvent: (method, params) => {
    if (method !== 'Network.webSocketFrameReceived') return;
    const msg = JSON.parse(params.response.payloadData);
    if (msg.t === 'welcome') { frames.welcome = msg; frames.snap = null; }
    if (msg.t === 'snap') {
      frames.snap = fillSnapshot(msg, frames.snap) ?? frames.snap;
      for (const e of frames.snap?.events ?? []) {
        if (e.e === 'turret') frames.turretShots[e.kind]++;
        if (e.e === 'zkill' && e.by === null) frames.turretKills++;
        if (e.e === 'zkill') frames.scrapEarned += ZOMBIES[e.kind].scrap;
      }
      for (const b of frames.snap?.buildings ?? []) if (b.kind !== 'wall') frames.lowestAmmo[b.kind] = Math.min(frames.lowestAmmo[b.kind], b.ammo);
    }
  },
  onProblem: (kind, detail) => problems.push(`${kind}: ${detail}`),
});
const { cdp, js } = page;
const shot = async (name: string, clip?: { x: number; y: number; width: number; height: number; scale: number }) => {
  const { data } = await cdp('Page.captureScreenshot', { format: 'png', ...(clip && { clip }) });
  writeFileSync(join(EV, `${name}.png`), Buffer.from(data, 'base64'));
  log(`shot ${name}.png`);
};
const until = async (fn: () => unknown, ms = 4000) => { const end = Date.now() + ms; while (Date.now() < end) { if (await fn()) return true; await sleep(100); } return false; };
const mouse = (type: string, x: number, y: number, button: 'left' | 'right' | 'none' = 'none') => cdp('Input.dispatchMouseEvent', { type, x, y, button, clickCount: type === 'mouseMoved' ? 0 : 1 });
const click = async (x: number, y: number, button: 'left' | 'right' = 'left') => { await mouse('mouseMoved', x, y); await mouse('mousePressed', x, y, button); await mouse('mouseReleased', x, y, button); };
const clickEl = async (selector: string) => {
  const at = await js(`(() => { const b = document.querySelector('${selector}'); if (!b) return null; b.scrollIntoView({ block: 'center' }); const r = b.getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2]; })()`);
  if (!at) return false;
  await click(at[0], at[1]);
  return true;
};
const tap = async (code: string, k: string) => { await key(page, 'keyDown', code, k); await sleep(60); await key(page, 'keyUp', code, k); };
const status = () => js(`document.getElementById('menu-status').textContent`) as Promise<string>;
const me = () => frames.snap?.players.find((p) => p.id === frames.welcome?.id);
const run = (): RunView | undefined => frames.snap?.run;
type ZombiesDev = {
  building: boolean; buildKind: BuildingKind; chips: { kind: BuildingKind; x: number; y: number; w: number; h: number }[]; use: string | null;
  ghost: { kind: BuildingKind; cx: number; cy: number; refusal: string | null; label: string } | null; coreAlert: boolean; callouts: string[];
};
const zdev = () => js(`skirmishDev.zombies()`) as Promise<ZombiesDev | null>;
const toScreen = (x: number, y: number) => js(`skirmishDev.toScreen(${x}, ${y})`) as Promise<{ x: number; y: number } | null>;
const aimAtWorld = async (x: number, y: number) => { const at = await toScreen(x, y); if (at) await mouse('mouseMoved', at.x, at.y); return at; };
const cellCenter = (cx: number, cy: number) => ({ x: (cx + 0.5) * ZOM.cell, y: (cy + 0.5) * ZOM.cell });
const hasWall = (b: readonly BuildingView[] | undefined, cx: number, cy: number) => !!b?.some((w) => w.cx === cx && w.cy === cy);
const turretAt = (cell: { cx: number; cy: number }) =>
  frames.snap?.buildings?.find((b): b is Extract<BuildingView, { ammo: number }> => b.cx === cell.cx && b.cy === cell.cy && b.kind !== 'wall');
let squad = '';
/** A magnified shot of the screen round a world point, for detail the full view draws too small to judge. */
async function closeUp(name: string, x: number, y: number) {
  const at = await toScreen(x, y);
  if (at) await shot(name, { x: Math.max(0, at.x - 120), y: Math.max(0, at.y - 80), width: 240, height: 160, scale: 3 });
}

/** The turrets the turrets step put up, for the night to watch. */
const turrets: { kind: TurretKind; cx: number; cy: number }[] = [];

/** Points the ghost at cells around the player until it shows one the picked kind may go up on. */
async function buildableCell(): Promise<{ cx: number; cy: number } | null> {
  const self = me()!;
  for (const [dx, dy] of [[-2, 0], [-2, 1], [-2, -1], [0, 2], [0, -2], [2, 2], [-3, 0], [0, 3], [2, -2], [-2, 2], [-2, -2], [3, 0], [0, -3]]) {
    const cx = Math.floor(self.x / ZOM.cell) + dx, cy = Math.floor(self.y / ZOM.cell) + dy;
    await aimAtWorld(cellCenter(cx, cy).x, cellCenter(cx, cy).y);
    await sleep(80);
    const g = (await zdev())?.ghost;
    if (g?.cx === cx && g.cy === cy && g.refusal === null) return { cx, cy };
  }
  return null;
}

/** Holds the keys toward a world point until the player stands within `near` px of it. */
async function walkTo(x: number, y: number, near: number, ms = 8000) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    const self = me();
    if (!self?.alive) { await sleep(150); continue; }
    if (Math.hypot(x - self.x, y - self.y) <= near) return true;
    const dirs = ([x > self.x + 15 ? 'right' : x < self.x - 15 ? 'left' : null, y > self.y + 15 ? 'down' : y < self.y - 15 ? 'up' : null] as const).filter((d): d is Dir => d !== null);
    await hold(page, dirs, 120);
  }
  return false;
}

log(`zombies-ui ${new Date().toISOString()} base=${BASE} name=${NAME} steps=${steps.join(',')}`);

const openMenu = async (query = '') => {
  await cdp('Page.navigate', { url: `${BASE}/?dev${query}` });
  await serversListed(page);
  await js(`document.getElementById('name').value = '${NAME}'`);
};
const showSquadMenu = () => js(`document.getElementById('squad').scrollIntoView({ block: 'center' })`);

/** Clear of the HUD panels and DOM overlays round the edges, so a press always reaches the canvas. */
const AIM_BOX = { x0: 200, y0: 150, x1: VIEW.w - 240, y1: VIEW.h - 150 };

/** A point toward `to` from the player's spot on screen, pulled in along that line until it sits in AIM_BOX over the canvas, so the shot keeps its heading. */
async function aimPoint(from: { x: number; y: number }, to: { x: number; y: number }): Promise<{ x: number; y: number } | null> {
  for (const k of [1, 0.7, 0.5, 0.35, 0.25]) {
    const at = { x: from.x + (to.x - from.x) * k, y: from.y + (to.y - from.y) * k };
    if (at.x < AIM_BOX.x0 || at.x > AIM_BOX.x1 || at.y < AIM_BOX.y0 || at.y > AIM_BOX.y1) continue;
    if (Math.hypot(at.x - from.x, at.y - from.y) < 40) return null;
    if (await js(`document.elementFromPoint(${at.x}, ${at.y})?.id === 'game'`)) return at;
  }
  return null;
}

/** Holds fire on the nearest zombie and strafes beside the core until `done`, respawning nothing: a run brings its players back itself. A press whose gun never fires is let go and pressed again. */
async function fight(done: () => Promise<boolean> | boolean, ms: number, onTick: () => Promise<void> = async () => {}) {
  const end = Date.now() + ms;
  let pressed = false;
  let step = 0;
  let ammo = { left: -1, since: Date.now() };
  while (Date.now() < end && !(await done())) {
    const self = me();
    const horde: ZombieView[] = frames.snap?.zombies ?? [];
    const near = self && horde.length ? horde.reduce((a, b) => (Math.hypot(a[2] - self.x, a[3] - self.y) <= Math.hypot(b[2] - self.x, b[3] - self.y) ? a : b)) : null;
    const from = self && await toScreen(self.x, self.y);
    const to = near && await toScreen(near[2], near[3]);
    const at = self?.alive && from && to ? await aimPoint(from, to) : null;
    const left = frames.snap?.self.ammo ?? -1;
    if (left !== ammo.left || frames.snap?.self.reloading) ammo = { left, since: Date.now() };
    if (pressed && (!at || Date.now() - ammo.since > 1000)) {
      await mouse('mouseReleased', VIEW.w / 2, VIEW.h / 2, 'left');
      pressed = false;
      ammo.since = Date.now();
    }
    if (at) await mouse('mouseMoved', at.x, at.y);
    if (at && !pressed) { await mouse('mousePressed', at.x, at.y, 'left'); pressed = true; }
    if (++step % 10 === 0 && self?.alive && run()) {
      const core = run()!.core;
      if (Math.hypot(core.x - self.x, core.y - self.y) > 220) await hold(page, [core.x > self.x ? 'right' : 'left'], 200);
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
    await serversListed(page);
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
    await tap('KeyB', 'b');
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
  async turrets() {
    if ((await zdev())?.building !== true) await tap('KeyB', 'b');
    await tap('Digit2', '2');
    expect('2 picks the sentry in build mode', await until(async () => (await zdev())?.buildKind === 'sentry'));
    for (const kind of ['sentry', 'cannon'] as const) {
      if (kind === 'cannon') {
        const chip = (await zdev())?.chips.find((c) => c.kind === 'cannon');
        if (chip) await click(chip.x + chip.w / 2, chip.y + chip.h / 2);
        expect('a click on the hint bar\'s cannon chip picks the cannon', await until(async () => (await zdev())?.buildKind === 'cannon'));
      }
      const cost = BUILDINGS[kind].cost;
      if (run()!.scrap < cost) {
        await aimAtWorld(me()!.x - 2 * ZOM.cell, me()!.y + 3 * ZOM.cell);
        const ghost = await until(async () => (await zdev())?.ghost?.label === `${BUILDINGS[kind].name} needs ${cost} scrap`);
        expect(`the ghost says a ${kind} needs ${cost} scrap when the bank is short`, ghost, `${run()!.scrap} scrap, ${(await zdev())?.ghost?.label}`);
        await shot(`zom-ghost-${kind}-short`);
        continue;
      }
      const cell = await buildableCell();
      if (!expect(`the ghost shows a ${kind} over a buildable cell`, cell !== null && (await zdev())?.ghost?.label === `${BUILDINGS[kind].name} · ${cost} scrap`, (await zdev())?.ghost?.label)) continue;
      await sleep(150);
      await shot(`zom-ghost-${kind}`);
      const scrap = run()!.scrap;
      const at = await toScreen(cellCenter(cell!.cx, cell!.cy).x, cellCenter(cell!.cx, cell!.cy).y);
      await click(at!.x, at!.y);
      expect(`a left click puts the ${kind} up on the server, fully loaded`, await until(() => { const t = turretAt(cell!); return t?.kind === kind && t.ammo === 10; }), `cell ${cell!.cx},${cell!.cy}`);
      expect(`the ${kind} cost its scrap`, await until(() => run()!.scrap === scrap - cost), `${scrap} -> ${run()!.scrap}`);
      turrets.push({ kind, ...cell! });
    }
    await sleep(300);
    await mouse('mouseMoved', VIEW.w / 2 + 200, VIEW.h / 2);
    await shot('zom-turrets-built');
    if (turrets[0]) await closeUp('zom-turrets-built-closeup', cellCenter(turrets[0].cx, turrets[0].cy).x, cellCenter(turrets[0].cx, turrets[0].cy).y);
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
    let crowd = false, alerted = false, firing = false, reload: 'waiting' | 'done' = 'waiting', beaten = 0;
    const shotsAtNight = { ...frames.turretShots };
    await fight(() => run()?.phase === 'day' && run()!.night === 2, 150_000, async () => {
      if (!crowd && (frames.snap?.zombies?.length ?? 0) >= 4 && me()?.alive) { crowd = true; await shot('zom-night'); }
      if (!alerted && (await zdev())?.coreAlert) { alerted = true; await shot('zom-core-alert'); }
      if (!firing && turrets.length && frames.turretKills > 0 && (frames.snap?.zombies?.length ?? 0) >= 2) {
        firing = true;
        await shot('zom-turrets-firing');
        await closeUp('zom-turrets-firing-closeup', cellCenter(turrets[0]!.cx, turrets[0]!.cy).x, cellCenter(turrets[0]!.cx, turrets[0]!.cy).y);
      }
      const low = turrets.find((t) => (turretAt(t)?.ammo ?? 10) < 10);
      if (reload === 'waiting' && low && me()?.alive && run()!.scrap > 0) {
        const name = BUILDINGS[low.kind].name.toLowerCase();
        await mouse('mouseReleased', VIEW.w / 2, VIEW.h / 2, 'left');
        await walkTo(cellCenter(low.cx, low.cy).x, cellCenter(low.cx, low.cy).y + ZOM.cell, 50);
        // A squad bot reloads a turret far faster than it fires, so it often gets there first; wait for the next drop.
        const offered = await until(async () => (turretAt(low)?.ammo ?? 10) === 10 || (await zdev())?.use === `Hold E to reload the ${name}`, 2000);
        const from = turretAt(low)?.ammo ?? 10;
        if (from === 10) { beaten++; return; }
        reload = 'done';
        expect(`by the low ${name} the hint offers to reload it`, offered, String((await zdev())?.use));
        await shot('zom-reload-hint');
        const scrap = run()!.scrap, earned = frames.scrapEarned;
        await key(page, 'keyDown', 'KeyE', 'e');
        const full = await until(() => { const t = turretAt(low); return t?.kind === low.kind && t.ammo === 10; }, ZOM.refillMs + 3000);
        await key(page, 'keyUp', 'KeyE', 'e');
        // Kills meanwhile pay into the bank, so the spend is what the bank lacks beyond them; a few rounds cost under the whole scrap the snapshot shows.
        const spent = scrap + frames.scrapEarned - earned - run()!.scrap;
        expect(`holding E reloads the ${name}`, full, `ammo ${from} -> 10/10, about ${spent} scrap spent`);
      }
    });
    for (const t of turrets) {
      const fired = frames.turretShots[t.kind] - shotsAtNight[t.kind];
      expect(`the ${t.kind} fired at the horde`, fired > 0, `${fired} rounds`);
      // Squad bots reload a turret faster than it fires while the horde is far from them, so its bar may never move.
      log(`note the ${t.kind}'s ammo bar went as low as ${frames.lowestAmmo[t.kind]}/10`);
    }
    if (turrets.length && reload === 'waiting') log(`note no turret stayed low long enough to reload by hand (bots got there first ${beaten} times)`);
    // The squad often shoots the small first wave down before it comes in turret range, so stock night 1 may leave a turret without a kill.
    if (turrets.length) log(`note turrets killed ${frames.turretKills} zombies for the squad`);
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
        const dirs = ([z[2] > self.x + 20 ? 'right' : z[2] < self.x - 20 ? 'left' : null, z[3] > self.y + 20 ? 'down' : z[3] < self.y - 20 ? 'up' : null] as const).filter((d): d is Dir => d !== null);
        await hold(page, dirs, 150);
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
page.close();
process.exit(problems.length ? 1 : 0);
