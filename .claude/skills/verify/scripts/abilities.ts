/// <reference types="node" />
// Usage: node abilities.ts <run-dir> [knife] [dash]   Earns the ability pick in TDM, then uses each ability named (default both).
import { appendFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { GUNS, PERK_TIERS, WORLD, type AbilityId } from '../../../../src/shared/defs.ts';
import { KNIFE_LUNGE, KNIFE_REACH, segmentEntersRectAt, type Rect } from '../../../../src/shared/sim/movement.ts';
import type { GameEvent, Snapshot } from '../../../../src/shared/protocol.ts';
import { fillSnapshot } from '../../../../src/shared/wire.ts';
import type { Point } from '../../../../src/server/bot/nav.ts';
import { hold, joinFromMenu, key, navGridFor, openPage, pathStep, respawnIfDead, sleep, type Dir } from './lib/browser.ts';

const RUN = process.argv[2];
if (!RUN) { console.error('usage: node abilities.ts <run-dir> [knife] [dash]'); process.exit(2); }
const WANTED = (process.argv.length > 3 ? process.argv.slice(3) : ['knife', 'dash']) as AbilityId[];
const PORT = readFileSync(join(RUN, 'port'), 'utf8').trim();
const BASE = `http://localhost:${PORT}`;
const EV = join(RUN, 'evidence');
const LOG = join(EV, 'abilities.log');
mkdirSync(EV, { recursive: true });
const W = 1280, H = 800;
const R = WORLD.playerRadius;
const SHOTGUN_REACH = 380;
const log = (line: string) => { console.log(line); appendFileSync(LOG, line + '\n'); };
const problems: string[] = [];

const abort = (why: string) => { log(`FAIL ${why}`); log('RESULT FAIL'); process.exit(1); };

type Stamped<T> = T & { at: number };
const frames = { welcome: null as null | { id: number; worldSize: number; walls: Rect[] }, last: null as null | Snapshot, events: [] as Stamped<GameEvent>[], selves: [] as Stamped<{ x: number; y: number; dashing: boolean }>[] };
let socketId = '';
const page = await openPage({
  profile: 'skirmish-abilities-',
  viewport: { width: W, height: H },
  onClose: () => abort('the page target closed'),
  onProblem: (kind, detail) => problems.push(`${kind}: ${detail}`),
  onEvent: (method, params) => {
    if (method === 'Network.webSocketCreated') { socketId = params.requestId; frames.last = null; }
    else if (method === 'Network.webSocketFrameReceived' && params.requestId === socketId) {
      const msg = JSON.parse(params.response.payloadData);
      if (msg.t === 'welcome') frames.welcome = msg;
      if (msg.t === 'walls') frames.welcome = frames.welcome && { ...frames.welcome, worldSize: msg.worldSize, walls: msg.walls };
      if (msg.t === 'snap') {
        frames.last = fillSnapshot(msg, frames.last) ?? frames.last;
        const at = Date.now();
        for (const e of msg.events) frames.events.push({ ...e, at });
        const self = frames.last?.players.find((p) => p.id === frames.welcome?.id);
        if (self) frames.selves.push({ x: self.x, y: self.y, dashing: self.dashing, at });
      }
    } else if (method === 'Inspector.targetCrashed') abort('the page crashed');
  },
});
const { cdp, js } = page;
const shot = async (name: string) => { const { data } = await cdp('Page.captureScreenshot', { format: 'png' }); writeFileSync(join(EV, `${name}.png`), Buffer.from(data, 'base64')); return join(EV, `${name}.png`); };
const expect = (label: string, ok: boolean, detail = '') => { log(`${ok ? 'ok  ' : 'FAIL'} ${label}${detail ? `  (${detail})` : ''}`); if (!ok) problems.push(label); };
const until = async (fn: () => boolean | Promise<boolean>, ms = 4000) => { const end = Date.now() + ms; while (Date.now() < end) { if (await fn()) return true; await sleep(30); } return false; };
const mouse = (type: string, x: number, y: number) => cdp('Input.dispatchMouseEvent', { type, x, y, button: type === 'mouseMoved' ? 'none' : 'left', clickCount: 1 });
const tap = async (code: string, k: string, vk: number) => { await key(page, 'keyDown', code, k, vk); await key(page, 'keyUp', code, k, vk); };
const me = () => frames.last?.players.find((p) => p.id === frames.welcome?.id);
const selfView = () => frames.last?.self;
const solids = (): Rect[] => [...(frames.welcome?.walls ?? []), ...(frames.last?.crates ?? []).map((c) => ({ x: c.x, y: c.y, w: c.w, h: c.h }))];
const blocked = (x: number, y: number, dx: number, dy: number) =>
  solids().some((b) => segmentEntersRectAt(x, y, dx, dy, { x: b.x - R, y: b.y - R, w: b.w + 2 * R, h: b.h + 2 * R }) !== null);
const clearLane = (x: number, y: number, angle: number, len: number) => {
  const ex = x + Math.cos(angle) * len, ey = y + Math.sin(angle) * len, size = frames.welcome?.worldSize ?? 0;
  return ex >= R && ex <= size - R && ey >= R && ey <= size - R && !blocked(x, y, ex - x, ey - y);
};
const approach = (from: Point, to: Point): Dir[] => [
  ...(to.x - from.x > 40 ? ['right' as const] : to.x - from.x < -40 ? ['left' as const] : []),
  ...(to.y - from.y > 40 ? ['down' as const] : to.y - from.y < -40 ? ['up' as const] : []),
];
const aimAt = (angle: number) => mouse('mouseMoved', W / 2 + Math.cos(angle) * 200, H / 2 + Math.sin(angle) * 200);

await cdp('Inspector.enable');
log(`abilities ${new Date().toISOString()} base=${BASE} abilities=${WANTED.join(',')}`);

let joins = 0;
async function joinRoom() {
  if (joins++ === 0) {
    await cdp('Page.navigate', { url: `${BASE}/?dev` });
    await js(`localStorage.setItem('skirmish.loadout', JSON.stringify({ weapon: 'shotgun', armor: 'heavy', color: 'blue' }))`);
  }
  await cdp('Page.reload');
  await joinFromMenu(page, { room: 1, name: `Blade${Math.floor(Math.random() * 1e4)}` });
  expect('joined TDM (welcome frame on the page socket)', await until(() => !!me(), 6000));
}

async function ensureAlive() {
  if (me()?.alive) return;
  await respawnIfDead(page, 6000);
  await until(() => !!me()?.alive, 3000);
  log('     note: died; respawned through the death screen (perks reset)');
}

async function shootNearest() {
  const self = me(), snap = frames.last;
  if (!self || !snap) return;
  const targets = [
    ...snap.players.filter((p) => p.id !== self.id && p.alive && (self.team === null || p.team !== self.team)).map((p) => ({ x: p.x, y: p.y })),
    ...snap.crates.map((c) => ({ x: c.x + c.w / 2, y: c.y + c.h / 2 })),
  ].filter((t) => !(frames.welcome?.walls ?? []).some((w) => segmentEntersRectAt(self.x, self.y, t.x - self.x, t.y - self.y, w) !== null));
  const t = targets.sort((a, b) => Math.hypot(a.x - self.x, a.y - self.y) - Math.hypot(b.x - self.x, b.y - self.y))[0];
  const mid = (frames.welcome?.worldSize ?? 0) / 2;
  if (!t) { await walkToward(self, { x: mid, y: mid }); return; }
  if (Math.hypot(t.x - self.x, t.y - self.y) > GUNS[self.gun].range * 0.8) { await walkToward(self, t); return; }
  await aimAt(Math.atan2(t.y - self.y, t.x - self.x));
  if (Math.hypot(t.x - self.x, t.y - self.y) > SHOTGUN_REACH) {
    await hold(page, approach(self, t), 250);
    return;
  }
  await mouse('mousePressed', W / 2, H / 2);
  await sleep(60);
  await mouse('mouseReleased', W / 2, H / 2);
  await sleep(250);
}

let lastWalk = { x: NaN, y: NaN, sidestep: 0 };

async function walkToward(from: Point, to: Point) {
  const held = pathStep(navGridFor(frames.welcome?.worldSize ?? 0, frames.welcome?.walls ?? []), from, to);
  if (Math.hypot(from.x - lastWalk.x, from.y - lastWalk.y) < 30) held.push(lastWalk.sidestep++ % 4 < 2 ? 'up' : 'down');
  lastWalk = { ...lastWalk, x: from.x, y: from.y };
  await hold(page, held, 400);
}

async function earnAbility(ability: AbilityId): Promise<boolean> {
  const start = Date.now();
  while (Date.now() - start < 120_000) {
    await ensureAlive();
    const self = selfView();
    if (self?.ability === ability) return true;
    if (self?.ability) { await sleep(500); continue; }
    const pending = self?.pending;
    const slot = pending?.k === 'perk' && pending.tier === 3 ? PERK_TIERS[3].indexOf(ability) : 0;
    if (pending) await tap(`Digit${slot + 1}`, String(slot + 1), 49 + slot);
    else await shootNearest();
    await sleep(120);
  }
  return false;
}

async function proveDash() {
  if (!(await earnAbility('dash'))) { expect('dash: reached tier 3 and picked Dash', false); return; }
  expect('dash: reached tier 3 and picked Dash on the server', selfView()?.ability === 'dash', `perks ${JSON.stringify(selfView()?.perks)}`);
  const start = Date.now();
  let waiting = 'never alive with Dash ready';
  while (Date.now() - start < 150_000) {
    await ensureAlive();
    const self = me();
    if (!self) { await sleep(200); continue; }
    if (selfView()?.ability !== 'dash') { if (!(await earnAbility('dash'))) break; continue; }
    if ((selfView()?.abilityReadyIn ?? 1) > 0) { await sleep(200); continue; }
    const lanes = [...Array(16).keys()].map((i) => (i / 16) * Math.PI * 2)
      .map((a) => ({ a, len: [300, 240, 180, 120, 60].find((len) => clearLane(self.x, self.y, a, len)) ?? 0 }));
    const best = lanes.reduce((x, y) => (y.len > x.len ? y : x));
    if (best.len < 300) {
      waiting = `no clear 300px lane, last at (${self.x.toFixed(0)},${self.y.toFixed(0)})`;
      await walkToward(self, { x: self.x + Math.cos(best.a) * 200, y: self.y + Math.sin(best.a) * 200 });
      continue;
    }
    const angle = best.a;
    await aimAt(angle);
    await sleep(150);
    await js(`window.maxCorrection = 0; window.watching = true; (function watch() { maxCorrection = Math.max(maxCorrection, skirmishDev.drawnSelf().correction); if (watching) requestAnimationFrame(watch); })(); 0`);
    const from = { x: me()!.x, y: me()!.y }, mark = frames.selves.length;
    const dashEnd = () => {
      const after = frames.selves.slice(mark), started = after.findIndex((s) => s.dashing);
      return started < 0 ? undefined : after.slice(started).find((s) => !s.dashing);
    };
    await key(page, 'keyDown', 'Space', ' ', 32);
    await sleep(90);
    const trail = await shot('dash-trail');
    await key(page, 'keyUp', 'Space', ' ', 32);
    await until(() => !!dashEnd(), 3000);
    await sleep(200);
    const correction = await js(`watching = false; maxCorrection`);
    const to = dashEnd() ?? frames.selves.at(-1)!;
    const dist = Math.hypot(to.x - from.x, to.y - from.y);
    const along = (to.x - from.x) * Math.cos(angle) + (to.y - from.y) * Math.sin(angle);
    if (!me()?.alive) continue;
    expect('dash: with no movement keys held, the server moved the player along the aim', along >= 200 && along >= dist * 0.95,
      `${dist.toFixed(0)}px from (${from.x.toFixed(0)},${from.y.toFixed(0)}) to (${to.x.toFixed(0)},${to.y.toFixed(0)}), ${along.toFixed(0)}px along aim ${angle.toFixed(2)}`);
    expect('dash: cooldown started on the server', (selfView()?.abilityReadyIn ?? 0) > 0, `abilityReadyIn ${selfView()?.abilityReadyIn}`);
    expect('dash: client prediction kept the drawn player on the server path (no rubber band)', correction < 40, `largest smoothed correction ${Number(correction).toFixed(1)}px`);
    log(`     screenshot ${trail} (90ms into the dash; trail behind the player)`);
    return;
  }
  expect('dash: found a clear lane and dashed', false, waiting);
}

async function proveKnife() {
  if (!(await earnAbility('knife'))) { expect('knife: reached tier 3 and picked Knife', false); return; }
  expect('knife: reached tier 3 and picked Knife on the server', selfView()?.ability === 'knife', `perks ${JSON.stringify(selfView()?.perks)}`);
  let hit = false, seen = frames.events.length, gap = Infinity;
  const slashes: string[] = [];
  const start = Date.now();
  while (Date.now() - start < 150_000 && !(hit && slashes.length > 0)) {
    await ensureAlive();
    const self = me(), snap = frames.last;
    if (!self || !snap || selfView()?.ability !== 'knife') {
      await key(page, 'keyUp', 'Space', ' ', 32);
      if (!(await earnAbility('knife'))) break;
      continue;
    }
    const enemies = snap.players.filter((p) => p.id !== self.id && p.alive && (self.team === null || p.team !== self.team))
      .sort((a, b) => Math.hypot(a.x - self.x, a.y - self.y) - Math.hypot(b.x - self.x, b.y - self.y));
    const enemy = enemies.find((p) => !blocked(self.x, self.y, p.x - self.x, p.y - self.y));
    if (!enemy) { const mid = (frames.welcome?.worldSize ?? 0) / 2; await walkToward(self, enemies[0] ?? { x: mid, y: mid }); continue; }
    gap = Math.hypot(enemy.x - self.x, enemy.y - self.y);
    await aimAt(Math.atan2(enemy.y - self.y, enemy.x - self.x));
    await key(page, gap <= KNIFE_LUNGE + KNIFE_REACH ? 'keyDown' : 'keyUp', 'Space', ' ', 32);
    await hold(page, approach(self, enemy), 120);
    const fresh = frames.events.slice(seen);
    seen = frames.events.length;
    for (const slash of fresh.filter((e) => e.e === 'slash' && e.owner === frames.welcome?.id)) {
      const knifeKill = fresh.some((e) => e.e === 'kill' && e.at === slash.at && e.killerId === frames.welcome?.id && e.weapon === 'Knife');
      const dmg = fresh.find((e) => e.e === 'dmg' && e.at === slash.at && e.attacker === frames.welcome?.id && e.kind === 'player' && (e.amount >= 49 || knifeKill));
      const burst: string[] = [];
      if (slashes.length < 2 || (dmg && !hit)) for (const tag of ['a', 'b', 'c', 'd']) { burst.push(await shot(`knife-slash-${slashes.length + 1}${tag}`)); await sleep(50); }
      slashes.push(burst[0] ?? '');
      log(`     slash ${slashes.length}: ${dmg?.e === 'dmg' ? `hit player ${dmg.victim} for ${dmg.amount}${knifeKill ? ', kill feed credits Knife' : ''}` : `whiff (nearest enemy ${gap.toFixed(0)}px before the slash)`}${burst.length ? `; screenshots ${burst.join(' ')}` : ''}`);
      hit ||= !!dmg;
    }
  }
  await key(page, 'keyUp', 'Space', ' ', 32);
  expect('knife: a slash event from the driven player arrives on the page socket', slashes.length > 0, `${slashes.length} slashes`);
  expect('knife: a slash hit a bot (a 50 dmg event, or a Knife kill, in the same snapshot as the slash)', hit);
}

for (const ability of WANTED) {
  try {
    await joinRoom();
    if (ability === 'dash') await proveDash();
    else if (ability === 'knife') await proveKnife();
  } catch (e) { expect(`${ability} ran without throwing`, false, String(e)); }
}
for (const p of problems.filter((p) => p.startsWith('page') || p.startsWith('console'))) log(p);
log(problems.length ? `RESULT FAIL (${problems.length})` : 'RESULT PASS');
page.close();
process.exit(problems.length ? 1 : 0);
