/// <reference types="node" />
import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  BUILD_HINTS, buildKindForKey, buildSiteOf, downedLine, ghostAt, inviteLink, outTillDawnText, phaseLine, reportRows, reportTitle, runCallouts, squadFromSearch, turretLine, useHint, withSquad,
} from '../src/client/zombies.ts';
import { addMoments, NO_MOMENTS } from '../src/client/moments.ts';
import { aimTurrets, nextCoreHitAt, type TurretAim } from '../src/client/siege.ts';
import type { RunView } from '../src/shared/protocol.ts';
import { BUILDING_KINDS, BUILDINGS, ZOM, type TurretKind } from '../src/shared/defs.ts';
import { MAPS } from '../src/shared/maps.ts';
import { buildRefusal } from '../src/shared/sim/build.ts';
import { build } from '../src/shared/sim/run.ts';
import { snapshotFor, wallViews } from '../src/shared/sim/snapshot.ts';
import { createWorld, newId, type World } from '../src/shared/sim/world.ts';
import { spawnAt } from './helpers.ts';

const AT = { x: 1380, y: 1525 };

function squadWorld() {
  const w = createWorld('ZOM', 1, 'outpost');
  const p = spawnAt(w, AT.x, AT.y);
  return { w, p };
}

const previewOf = (w: World, id: number, cx: number, cy: number) => {
  const p = w.players.get(id)!;
  const site = buildSiteOf(snapshotFor(w, id), wallViews(w), p);
  return site && buildRefusal(site, 'wall', cx, cy);
};

test('the build preview judges every cell around the builder as the server does', () => {
  const { w, p } = squadWorld();
  w.zombies.push({ id: newId(w), kind: 'brute', x: AT.x + 120, y: AT.y - 60, hp: 1, attackAt: Infinity });
  spawnAt(w, AT.x - 100, AT.y + 100);
  w.buildings.push({ id: newId(w), kind: 'wall', cx: 28, cy: 27, hp: 1 });
  w.walls.push({ x: 1200, y: 1400, w: 24, h: 140, built: false, material: 'concrete', expiresAt: Infinity });
  const seen = new Set<string | null>();
  for (let cy = 24; cy <= 37; cy++) {
    for (let cx = 20; cx <= 33; cx++) {
      const server = build(structuredClone(w), p.id, 'wall', cx, cy);
      seen.add(server);
      assert.equal(previewOf(w, p.id, cx, cy), server, `cell ${cx},${cy}`);
    }
  }
  assert.deepEqual([...seen].sort(), [null, 'body', 'core', 'cover', 'farFromCore', 'outOfReach', 'taken'].sort(), 'the sweep covered every refusal a cell can earn');
});

test('the ghost judges each kind as the server would build it, and names what it costs or why not', () => {
  const { w, p } = squadWorld();
  w.buildings.push({ id: newId(w), kind: 'cannon', cx: 26, cy: 31, hp: 1, owner: p.id, ammo: 0, nextFireAt: 0 });
  const at = (cx: number, cy: number) => ({ x: (cx + 0.5) * ZOM.cell, y: (cy + 0.5) * ZOM.cell });
  for (const scrap of [BUILDINGS.sentry.cost - 1, 1000]) {
    w.run!.scrap = scrap;
    for (const kind of BUILDING_KINDS) {
      for (const cell of [{ cx: 26, cy: 30 }, { cx: 26, cy: 31 }, { cx: 20, cy: 30 }]) {
        const ghost = ghostAt(buildSiteOf(snapshotFor(w, p.id), wallViews(w), p)!, kind, at(cell.cx, cell.cy), MAPS[w.map].size);
        assert.equal(ghost.refusal, build(structuredClone(w), p.id, kind, cell.cx, cell.cy), `${kind} at ${cell.cx},${cell.cy} with ${scrap} scrap`);
        assert.equal(ghost.kind, kind);
      }
    }
  }
  const site = buildSiteOf(snapshotFor(w, p.id), wallViews(w), p)!;
  assert.equal(ghostAt(site, 'sentry', at(26, 30), MAPS[w.map].size).label, `Sentry · ${BUILDINGS.sentry.cost} scrap`);
  assert.equal(ghostAt(site, 'wall', at(26, 31), MAPS[w.map].size).label, `Right click to take down the cannon · +${BUILDINGS.cannon.cost / 2}`, 'the refund is the standing building\'s');
  w.run!.scrap = 0;
  assert.equal(ghostAt(buildSiteOf(snapshotFor(w, p.id), wallViews(w), p)!, 'cannon', at(26, 30), MAPS[w.map].size).label, `Cannon needs ${BUILDINGS.cannon.cost} scrap`);
});

test('in build mode 1, 2 and 3 pick wall, sentry and cannon, and the hint bar lists each with its cost', () => {
  assert.deepEqual(['Digit1', 'Digit2', 'Digit3', 'Digit4', 'KeyB'].map(buildKindForKey), ['wall', 'sentry', 'cannon', null, null]);
  assert.deepEqual(BUILD_HINTS.filter((h) => h.pick).map((h) => [h.key, h.what, h.pick]), [
    ['1', `Wall ${BUILDINGS.wall.cost}`, 'wall'], ['2', `Sentry ${BUILDINGS.sentry.cost}`, 'sentry'], ['3', `Cannon ${BUILDINGS.cannon.cost}`, 'cannon'],
  ]);
});

test('holding E is offered to reload a turret short of ammo, to repair it first when worn, nearest first', () => {
  const { w, p } = squadWorld();
  const turret = { id: newId(w), kind: 'sentry' as const, cx: 26, cy: 30, hp: BUILDINGS.sentry.hp, owner: p.id, ammo: BUILDINGS.sentry.turret.ammo, nextFireAt: 0 };
  w.buildings.push(turret);
  assert.equal(useHint(snapshotFor(w, p.id), p), null, 'a full turret needs nothing');
  turret.ammo = 10;
  assert.equal(useHint(snapshotFor(w, p.id), p), 'Hold E to reload the sentry');
  turret.hp = 100;
  assert.equal(useHint(snapshotFor(w, p.id), p), 'Hold E to repair the sentry');
  w.buildings.push({ id: newId(w), kind: 'cannon', cx: 27, cy: 30, hp: BUILDINGS.cannon.hp, owner: p.id, ammo: 0, nextFireAt: 0 });
  assert.equal(useHint(snapshotFor(w, p.id), p), 'Hold E to reload the cannon', 'the cannon is the nearer');
});

test('a turret\'s barrel takes the angle of its last shot, and its aim is forgotten once it is gone', () => {
  const { w, p } = squadWorld();
  const aims = new Map<string, TurretAim>();
  const shot = (kind: TurretKind, angle: number) => ({ e: 'turret' as const, kind, x: 26.5 * ZOM.cell, y: 30.5 * ZOM.cell, angle });
  w.buildings.push({ id: newId(w), kind: 'sentry', cx: 26, cy: 30, hp: 1, owner: p.id, ammo: 100, nextFireAt: 0 });
  aimTurrets(aims, { ...snapshotFor(w, p.id), events: [shot('sentry', 1)] }, 100);
  aimTurrets(aims, { ...snapshotFor(w, p.id), events: [shot('sentry', 2)] }, 200);
  assert.deepEqual(aims.get('26,30'), { to: 2, drawn: 1, at: 100, firedAt: 200 });
  w.buildings = [];
  aimTurrets(aims, snapshotFor(w, p.id), 300);
  assert.equal(aims.size, 0);
});

test('the report sums the squad\'s turret kills by kind, and leaves the line off when they killed none', () => {
  const report = { night: 4, durationMs: 1, players: [], turretKills: { sentry: 0, cannon: 0 } };
  assert.equal(turretLine(report), null);
  assert.equal(turretLine({ ...report, turretKills: { sentry: 41, cannon: 7 } }), 'Turret kills · Sentry 41 · Cannon 7');
});

test('the build preview refuses at night, while down, and when the bank is short, as the server does', () => {
  const cases: [string, (w: World, id: number) => void][] = [
    ['notDay', (w) => { w.run!.phase = { k: 'night', toSpawn: [], nextSpawnAt: Infinity }; }],
    ['notDay', (w, id) => { w.players.get(id)!.life = { k: 'downed', bleedOutAt: Infinity, reviveProgress: 0 }; }],
    ['scrap', (w) => { w.run!.scrap = BUILDINGS.wall.cost - 1; }],
  ];
  for (const [reason, arrange] of cases) {
    const { w, p } = squadWorld();
    arrange(w, p.id);
    assert.equal(previewOf(w, p.id, 26, 30), reason);
    assert.equal(build(w, p.id, 'wall', 26, 30), reason);
  }
});

test('an invite link names a squad, and a broken one says so instead of joining nowhere', () => {
  assert.equal(squadFromSearch('?squad=z-ab2c7d'), 'z-ab2c7d');
  assert.equal(squadFromSearch('?dev&squad=z-ab2c7d'), 'z-ab2c7d');
  assert.equal(squadFromSearch('?dev'), null);
  for (const bad of ['?squad=', '?squad=z-ABCDEF', '?squad=ffa', '?squad=z-abc18x', '?squad=z-abcdefg']) assert.equal(squadFromSearch(bad), 'bad', bad);
});

test('the invite link carries only the squad, while the page keeps its own parameters', () => {
  assert.equal(inviteLink('http://localhost:8080/?dev&lag=50', 'z-ab2c7d'), 'http://localhost:8080/?squad=z-ab2c7d');
  assert.equal(withSquad('http://localhost:8080/?dev', 'z-ab2c7d'), 'http://localhost:8080/?dev=&squad=z-ab2c7d');
  assert.equal(withSquad('http://localhost:8080/?dev=&squad=z-ab2c7d', null), 'http://localhost:8080/?dev=');
});

test('the build preview reads the builder from where the client draws them', () => {
  const { w, p } = squadWorld();
  const snap = snapshotFor(w, p.id);
  const far = buildSiteOf(snap, wallViews(w), { x: AT.x - 7 * ZOM.cell, y: AT.y })!;
  assert.equal(buildRefusal(far, 'wall', 26, 30), 'outOfReach', 'the drawn position decides reach, not the snapshot\'s');
  const near = buildSiteOf(snap, wallViews(w), { x: AT.x, y: AT.y - 3 * ZOM.cell })!;
  assert.equal(buildRefusal(near, 'wall', 26, 30), null, 'the builder\'s own body moves with them');
});

const runView = (over: Partial<RunView> = {}): RunView => ({
  phase: 'day', night: 2, phaseEndsAt: 50_000, scrap: 120, core: { x: 1500, y: 1500, hp: 3000, maxHp: 4000 }, aliveZombies: 0, waveLeft: 0, report: null, ...over,
});

test('the phase line counts the day down to night, the night\'s wave down to dawn, and the report down to the next run', () => {
  assert.equal(phaseLine(runView(), 19_000), 'Day 2 · night in 0:31');
  assert.equal(phaseLine(runView(), null), 'Day 2', 'no countdown before the server clock is known');
  assert.equal(phaseLine(runView({ phase: 'night', night: 3, phaseEndsAt: null, waveLeft: 12 }), 19_000), 'Night 3 · 12 left');
  assert.equal(phaseLine(runView({ phase: 'over', phaseEndsAt: 30_000 }), 16_000), 'Core fell · next run in 0:14');
});

test('a downed player is told how long they have, or that help is on the way', () => {
  assert.equal(downedLine({ revive: 0, bleedOutAt: 40_000 }, 22_000), 'Crawl to a squadmate · 0:18');
  assert.equal(downedLine({ revive: 0.45, bleedOutAt: 40_000 }, 22_000), 'Being revived · 45%');
  assert.equal(outTillDawnText(runView({ phase: 'night', waveLeft: 9 }), true).sub, 'Back at dawn · 9 zombies left tonight');
  assert.equal(outTillDawnText(runView({ phase: 'night' }), true).title, 'You bled out');
  assert.equal(outTillDawnText(runView({ phase: 'night' }), false).title, 'The night is under way', 'a night joiner never bled out');
});

test('holding E is offered for a downed squadmate in reach before a worn wall, and never with an empty bank for repairs', () => {
  const { w, p } = squadWorld();
  w.buildings.push({ id: newId(w), kind: 'wall', cx: 26, cy: 30, hp: 100 });
  assert.equal(useHint(snapshotFor(w, p.id), p), 'Hold E to repair the wall');
  const mate = spawnAt(w, AT.x + 50, AT.y, { name: 'Ann' });
  mate.life = { k: 'downed', bleedOutAt: Infinity, reviveProgress: 0 };
  assert.equal(useHint(snapshotFor(w, p.id), p), 'Hold E to revive Ann');
  mate.x += ZOM.reviveRange;
  w.run!.scrap = 0;
  assert.equal(useHint(snapshotFor(w, p.id), p), null, 'out of revive range and no scrap to repair with');
});

test('holding E is offered for the worn core in reach, after a nearer worn wall, as the server picks', () => {
  const { w, p } = squadWorld();
  w.run!.core.hp = ZOM.coreHp - 100;
  assert.equal(useHint(snapshotFor(w, p.id), p), 'Hold E to repair the core');
  w.buildings.push({ id: newId(w), kind: 'wall', cx: 26, cy: 30, hp: 100 });
  assert.equal(useHint(snapshotFor(w, p.id), p), 'Hold E to repair the wall');
  w.buildings = [];
  p.x = 1500 - ZOM.reachPx - 10;
  assert.equal(useHint(snapshotFor(w, p.id), p), null, 'out of reach of the core');
});

test('the run announces the night ten seconds ahead, nightfall with its wave and dawn with the core', () => {
  const titles = (prev: RunView, next: RunView, prevAt: number, nextAt: number) => runCallouts(prev, next, prevAt, nextAt).map((c) => c.title);
  assert.deepEqual(titles(runView(), runView(), 39_000, 40_000), ['Night falls in 10']);
  assert.deepEqual(titles(runView(), runView(), 40_000, 41_000), [], 'once, as the countdown crosses ten seconds');
  const night = runView({ phase: 'night', phaseEndsAt: null, waveLeft: 31 });
  const call = runCallouts(runView(), night, 49_000, 50_000);
  assert.deepEqual(call.map((c) => [c.title, c.line]), [['Night 2', '31 zombies are coming · hold the core']]);
  const dawn = runCallouts(night, runView({ night: 3, scrap: 96 }), 90_000, 91_000);
  assert.deepEqual(dawn.map((c) => [c.title, c.line]), [['Dawn', 'Night 2 held · core 75% · 96 scrap to build with']]);
  assert.deepEqual(titles(night, runView({ phase: 'over', phaseEndsAt: 110_000 }), 90_000, 91_000), [], 'the report announces the fall');
  assert.deepEqual(runCallouts(undefined, night, 0, 1), [], 'nothing on the first snapshot of a session');
});

test('the fall clears every callout, so none shows through behind the report', () => {
  const { w, p } = squadWorld();
  const day = snapshotFor(w, p.id);
  w.run!.phase = { k: 'night', toSpawn: ['walker'], nextSpawnAt: Infinity };
  const night = snapshotFor(w, p.id);
  const announced = addMoments(NO_MOMENTS, day, night, 1000);
  assert.deepEqual(announced.callouts.map((c) => c.title), ['Night 1']);
  w.run!.phase = { k: 'over', night: 1, restartAt: Infinity };
  assert.deepEqual(addMoments(announced, night, snapshotFor(w, p.id), 1100).callouts, []);
});

test('the run report ranks the squad by kills, then revives, and marks you', () => {
  const report = { night: 4, durationMs: 372_000, players: [
    { name: 'Bo', kills: 12, revives: 0, built: 9 }, { name: 'Ann', kills: 30, revives: 1, built: 0 }, { name: 'Cy', kills: 12, revives: 4, built: 7 },
  ], turretKills: { sentry: 0, cannon: 0 } };
  assert.deepEqual(reportRows(report, 'Cy').map((r) => [r.name, r.you]), [['Ann', false], ['Cy', true], ['Bo', false]]);
  assert.equal(reportTitle(report), 'The core fell on night 4');
});

test('the core alert starts on a bite by night and clears the moment dawn or the report arrives', () => {
  const night = (hp: number) => runView({ phase: 'night', core: { x: 1500, y: 1500, hp, maxHp: ZOM.coreHp } });
  assert.equal(nextCoreHitAt(night(4000), night(3990), 500, -Infinity), 500, 'a bite starts the alert');
  assert.equal(nextCoreHitAt(night(3990), night(3990), 600, 500), 500, 'no bite keeps the last one');
  assert.equal(nextCoreHitAt(night(3990), runView({ phase: 'day', core: { x: 1500, y: 1500, hp: 3990, maxHp: ZOM.coreHp } }), 700, 500), -Infinity, 'dawn clears it');
  assert.equal(nextCoreHitAt(night(10), runView({ phase: 'over', core: { x: 1500, y: 1500, hp: 0, maxHp: ZOM.coreHp } }), 700, 600), -Infinity, 'the report clears it');
});
