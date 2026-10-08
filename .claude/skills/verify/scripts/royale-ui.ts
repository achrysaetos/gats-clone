/// <reference types="node" />
// Usage: node royale-ui.ts <run-dir> [regroup]
// Joins the br room in muted headless Chrome through the menu, runs for the caches at the centre, then walks out of the ring and stays there: the loot,
// the storm, the knock, the ring's finish, spectating and the result card each get a screenshot. With `regroup` the player's squad is wiped while lives
// are many, and it checks the regroup countdown and the squad coming back together on the edge instead of the result card.
// Run it on a scratch copy with a fast, hard ring (see features/last-squad.md).
import { appendFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROYALE, WORLD } from '../../../../src/shared/defs.ts';
import { ringAt, type Snapshot, type WallView } from '../../../../src/shared/protocol.ts';
import { fillSnapshot } from '../../../../src/shared/wire.ts';
import { withSolids } from '../../../../src/server/bot/nav.ts';
import { dirKey, joinFromMenu, navGridFor, openPage, pathStep, sleep, type Dir } from './lib/browser.ts';

const RUN = process.argv[2];
if (!RUN) { console.error('usage: node royale-ui.ts <run-dir> [regroup]'); process.exit(2); }
const REGROUP = process.argv[3] === 'regroup';
const BASE = `http://localhost:${readFileSync(join(RUN, 'port'), 'utf8').trim()}`;
const EV = join(RUN, 'evidence');
const LOG = join(EV, 'royale-ui.log');
mkdirSync(EV, { recursive: true });
const log = (line: string) => { console.log(line); appendFileSync(LOG, line + '\n'); };
const problems: string[] = [];
const expect = (label: string, ok: boolean, detail = '') => { log(`${ok ? 'ok  ' : 'FAIL'} ${label}${detail ? `  (${detail})` : ''}`); if (!ok) problems.push(label); return ok; };

const frames = { welcome: null as null | { id: number; mode: string }, snap: null as Snapshot | null, ringHits: 0, feed: [] as string[], regrouped: [] as string[], map: null as null | { worldSize: number; walls: WallView[] } };
const page = await openPage({
  profile: 'skirmish-royale-',
  viewport: { width: 1280, height: 800 },
  onEvent: (method, params) => {
    if (method !== 'Network.webSocketFrameReceived') return;
    const msg = JSON.parse(params.response.payloadData);
    if (msg.t === 'welcome') { frames.welcome = msg; frames.snap = null; }
    if (msg.t === 'welcome' || msg.t === 'walls') frames.map = { worldSize: msg.worldSize, walls: msg.walls };
    if (msg.t !== 'snap') return;
    frames.snap = fillSnapshot(msg, frames.snap) ?? frames.snap;
    for (const e of frames.snap?.events ?? []) {
      if (e.e === 'dmg' && e.kind === 'player' && e.victim === frames.welcome?.id && e.attacker === null) frames.ringHits++;
      if (e.e === 'kill' && e.knock) frames.feed.push('knock');
      if (e.e === 'wiped') frames.feed.push('wiped');
      if (e.e === 'wiped' && e.place === null) frames.regrouped.push(e.team);
    }
  },
  onProblem: (kind, detail) => problems.push(`${kind}: ${detail}`),
});
const { cdp, js } = page;
const shot = async (name: string) => {
  const { data } = await cdp('Page.captureScreenshot', { format: 'png' });
  writeFileSync(join(EV, `${name}.png`), Buffer.from(data, 'base64'));
  log(`shot ${name}.png`);
};
const until = async (fn: () => unknown, ms: number) => { const end = Date.now() + ms; while (Date.now() < end) { if (await fn()) return true; await sleep(100); } return false; };
const me = () => frames.snap?.players.find((p) => p.id === frames.welcome?.id);
const now = () => (frames.snap?.tick ?? 0) * (1000 / 30);

let held: Dir[] = [];
const steer = async (dirs: Dir[]) => {
  for (const d of held) if (!dirs.includes(d)) await dirKey(page, 'keyUp', d);
  for (const d of dirs) if (!held.includes(d)) await dirKey(page, 'keyDown', d);
  held = dirs;
};
const fleeRing = async () => {
  const p = me(), royale = frames.snap?.royale;
  if (!p?.alive || !royale) { await steer([]); return; }
  const c = royale.ring.to;
  const dx = p.x - c.x, dy = p.y - c.y;
  await steer([...(Math.abs(dx) > 40 ? [dx > 0 ? 'right' as const : 'left' as const] : []), ...(Math.abs(dy) > 40 ? [dy > 0 ? 'down' as const : 'up' as const] : [])]);
};

await cdp('Page.navigate', { url: `${BASE}/?dev` });
await sleep(800);
await joinFromMenu(page, { room: 3, name: 'Ringer', press: true });
expect('the menu joins the Last Squad room', await until(() => frames.welcome?.mode === 'BR' && me(), 8000), `mode ${frames.welcome?.mode}`);
const team = me()?.team;
const squad = frames.snap?.royale?.squads.find((s) => s.team === team);
expect(`the player is seated in a squad of ${ROYALE.squadSize}`, !!team && squad?.pips.length === ROYALE.squadSize, `team ${team}, pips ${squad?.pips.join(',')}`);
expect('six squads are tracked', frames.snap?.royale?.squads.length === 6);
const centre = frames.snap?.royale?.ring.to;
const out = me() && centre ? Math.hypot(me()!.x - centre.x, me()!.y - centre.y) : NaN;
expect('the squad starts out on the edge, about 2200 px from the centre', Math.abs(out - ROYALE.edgeR) < 300, `${Math.round(out)} px`);
await sleep(1500);
await shot('br-start');

const toward = async (to: { x: number; y: number }) => {
  const p = me(), m = frames.map;
  if (!p?.alive || !m) { await steer([]); return; }
  const crates = (frames.snap?.crates ?? []).map((c) => ({ x: c.x, y: c.y, w: c.w, h: c.h }));
  await steer(pathStep(withSolids(navGridFor(m.worldSize, m.walls), crates, WORLD.playerRadius), p, to));
};
const tiers = () => new Set((frames.snap?.crates ?? []).map((c) => c.tier));
const onScreen = (c: { x: number; y: number; w: number; h: number }) => { const p = me(); return !!p && Math.abs(c.x + c.w / 2 - p.x) < 500 && Math.abs(c.y + c.h / 2 - p.y) < 300; };
const sawCache = await until(async () => { if (centre) await toward(centre); return (frames.snap?.crates ?? []).some((c) => c.tier === 'cache' && onScreen(c)); }, 40_000);
expect('running in, the caches at the centre come into view among rich crates', sawCache && tiers().has('rich'), [...tiers()].join(','));
await steer([]);
await shot('br-loot');

const outside = () => {
  const p = me(), royale = frames.snap?.royale;
  if (!p || !royale) return false;
  const c = ringAt(royale.ring, now());
  return Math.hypot(p.x - c.x, p.y - c.y) > c.r;
};
const edgeInView = () => {
  const p = me(), royale = frames.snap?.royale;
  if (!p || !royale) return false;
  const c = ringAt(royale.ring, now());
  return Math.abs(Math.hypot(p.x - c.x, p.y - c.y) - c.r) < 350;
};
expect('the ring catches the player outside it', await until(async () => { await fleeRing(); return outside() && edgeInView(); }, 90_000));
await shot('br-ring');
expect('the ring hurts the player outside it', await until(async () => { await fleeRing(); return frames.ringHits >= 2; }, 10_000), `${frames.ringHits} ring hits`);

const knocked = await until(async () => { await fleeRing(); return !!me()?.downed || (me() && !me()!.alive); }, 90_000);
expect('the ring takes the player down', knocked);
if (me()?.downed) {
  await sleep(400);
  await shot('br-knocked');
  expect('a knocked player stays in play, not on the death screen', await js(`document.getElementById('death').hidden`));
}
await steer([]);
expect('the player dies', await until(() => me() && !me()!.alive && !me()!.downed, 60_000));
if (REGROUP) {
  expect('the feed says the squad was wiped and regroups', await until(() => frames.regrouped.includes(team!), 5000), frames.regrouped.join(','));
  const dev = async () => await js('skirmishDev.royale()') as { spectate: { title: string; sub: string }; tracker: { team: string; label: string | null }[] } | null;
  await sleep(1500);
  const view = await dev();
  expect('the spectate line counts down the regroup', /^Squad wiped · regrouping in \d+:\d\d$/.test(view?.spectate.sub ?? ''), view?.spectate.sub);
  expect('the tracker column counts it down too', /^\d+s$/.test(view?.tracker.find((t) => t.team === team)?.label ?? ''), view?.tracker.find((t) => t.team === team)?.label ?? 'none');
  await shot('br-regroup');
  expect('the squad comes back', await until(() => !!me()?.alive, ROYALE.redeployMs + 5000));
  const to = frames.snap!.royale!.ring.to, p = me()!;
  const reach = Math.min(ROYALE.edgeR, to.r - ROYALE.cacheR);
  const d = Math.hypot(p.x - to.x, p.y - to.y);
  expect('together on the edge of the next circle', Math.abs(d - reach) < 300, `${Math.round(d)} px out, edge ${Math.round(reach)}`);
  expect('the tracker shows the squad up again', (await dev())?.tracker.find((t) => t.team === team)?.label === null);
  await sleep(1000);
  await shot('br-regrouped');
  for (const p of problems.filter((p) => p.startsWith('page') || p.startsWith('console'))) log(p);
  log(problems.length ? `RESULT FAIL (${problems.length})` : 'RESULT PASS');
  page.close();
  process.exit(problems.length ? 1 : 0);
}
expect('a dead player watches someone', await until(() => frames.snap?.royale?.watch !== null, 5000), `watch ${frames.snap?.royale?.watch}`);
await sleep(600);
const watched = frames.snap?.players.find((p) => p.id === frames.snap?.royale?.watch);
const at = watched && await js(`skirmishDev.toScreen(${watched.x}, ${watched.y})`) as { x: number; y: number } | null;
expect('the camera follows the watched player', !!at && Math.abs(at.x - 640) < 120 && Math.abs(at.y - 400) < 120, at ? `${Math.round(at.x)},${Math.round(at.y)}` : 'none');
expect('the death screen stays closed while spectating', await js(`document.getElementById('death').hidden`));
await sleep(500);
await shot('br-spectate');

expect('the result card shows the place', await until(async () => !(await js(`document.getElementById('report').hidden`)), 240_000));
const result = await js(`document.getElementById('report').textContent`) as string;
expect('it reads as a place with kills, knocks and revives', /#\d/.test(result) && result.includes('Knocks') && result.includes('Revives'), result);
await sleep(400);
await shot('br-result');
expect('the feed carried knocks and squad wipes', frames.feed.includes('knock') && frames.feed.includes('wiped'), frames.feed.slice(0, 8).join(','));

for (const p of problems.filter((p) => p.startsWith('page') || p.startsWith('console'))) log(p);
log(problems.length ? `RESULT FAIL (${problems.length})` : 'RESULT PASS');
page.close();
process.exit(problems.length ? 1 : 0);
