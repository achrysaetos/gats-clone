/// <reference types="node" />
import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  BUILD_HINTS, buildKindForKey, buildSiteOf, downedLine, forecast, ghostAt, inviteLink, outTillDawnText, phaseLine, readyHint, reportRows, reportTitle, runCallouts, squadFromSearch, turretLine, useHint, withSquad,
} from '../src/client/zombies.ts';
import { addMoments, NO_MOMENTS } from '../src/client/moments.ts';
import { aimTurrets, nextCoreHitAt, type TurretAim } from '../src/client/siege.ts';
import type { RunView } from '../src/shared/protocol.ts';
import { BUILDING_KINDS, BUILDINGS, NIGHTS, SIDES, ZOM, ZOMBIE_KINDS, ZOMBIES, type TurretKind } from '../src/shared/defs.ts';
import { MAPS } from '../src/shared/maps.ts';
import { buildRefusal } from '../src/shared/sim/build.ts';
import { build } from '../src/shared/sim/run.ts';
import { snapshotFor, wallViews } from '../src/shared/sim/snapshot.ts';
import { createWorld, newId, type World } from '../src/shared/sim/world.ts';
import { press, run, spawnAt } from './helpers.ts';

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
  assert.equal(ghostAt(site, 'wall', at(26, 31), MAPS[w.map].size).label, `Right click to take down the cannon · +${BUILDINGS.cannon.cost / 20}`, 'the refund is the standing building\'s, for the tenth of it left');
  w.buildings[0]!.hp = BUILDINGS.cannon.hp;
  const whole = buildSiteOf(snapshotFor(w, p.id), wallViews(w), p)!;
  assert.equal(ghostAt(whole, 'wall', at(26, 31), MAPS[w.map].size).label, `Right click to take down the cannon · +${BUILDINGS.cannon.cost / 2}`, 'half back for a whole one');
  w.run!.scrap = 0;
  assert.equal(ghostAt(buildSiteOf(snapshotFor(w, p.id), wallViews(w), p)!, 'cannon', at(26, 30), MAPS[w.map].size).label, `Cannon needs ${BUILDINGS.cannon.cost} scrap`);
});

test('in build mode 1 to 5 pick wall, sentry, cannon, scatter and mortar, and the hint bar lists each with its cost', () => {
  assert.deepEqual(['Digit1', 'Digit2', 'Digit3', 'Digit4', 'Digit5', 'Digit6', 'KeyB'].map(buildKindForKey), ['wall', 'sentry', 'cannon', 'scatter', 'mortar', null, null]);
  assert.deepEqual(BUILD_HINTS.filter((h) => h.pick).map((h) => [h.key, h.what, h.pick]), [
    ['1', `Wall ${BUILDINGS.wall.cost}`, 'wall'], ['2', `Sentry ${BUILDINGS.sentry.cost}`, 'sentry'], ['3', `Cannon ${BUILDINGS.cannon.cost}`, 'cannon'],
    ['4', `Scatter ${BUILDINGS.scatter.cost}`, 'scatter'], ['5', `Mortar ${BUILDINGS.mortar.cost}`, 'mortar'],
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

test('the report sums the squad\'s turret kills by kind and the Bastion\'s, and leaves the line off when they killed none', () => {
  const report = { night: 4, won: false, survivors: 0, durationMs: 1, players: [], turretKills: { sentry: 0, cannon: 0, scatter: 0, mortar: 0 }, bastionKills: 0 };
  assert.equal(turretLine(report), null);
  assert.equal(turretLine({ ...report, turretKills: { sentry: 41, cannon: 7, scatter: 0, mortar: 3 }, bastionKills: 12 }), 'Defense kills · Sentry 41 · Cannon 7 · Mortar 3 · Bastion 12');
  assert.equal(turretLine({ ...report, bastionKills: 2 }), 'Defense kills · Bastion 2');
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
  phase: 'day', night: 2, phaseEndsAt: 50_000, scrap: 120, core: { x: 1500, y: 1500, hp: 3000, maxHp: 4000 }, aliveZombies: 0, waveLeft: 0,
  survivors: 38, lost: 0, ready: [], report: null, ...over,
});

test('the phase line counts the day down to night, the night\'s wave down to dawn, and the report down to the next run', () => {
  assert.equal(phaseLine(runView(), 19_000), 'Day 2 · night in 0:31');
  assert.equal(phaseLine(runView(), null), 'Day 2', 'no countdown before the server clock is known');
  assert.equal(phaseLine(runView({ phase: 'night', night: 3, phaseEndsAt: null, waveLeft: 12 }), 19_000), 'Night 3 · 12 left');
  assert.equal(phaseLine(runView({ phase: 'over', phaseEndsAt: 30_000 }), 16_000), 'The Bastion fell · next run in 0:14');
  const held = { night: 10, won: true, survivors: 31, durationMs: 0, players: [], turretKills: { sentry: 0, cannon: 0, scatter: 0, mortar: 0 }, bastionKills: 0 };
  assert.equal(phaseLine(runView({ phase: 'over', phaseEndsAt: 30_000, report: held }), 16_000), 'The Bastion held · next run in 0:14');
});

test('a downed player is told how long they have, or that help is on the way', () => {
  assert.equal(downedLine({ revive: 0, bleedOutAt: 40_000 }, 22_000), 'Crawl to a squadmate · 0:18');
  assert.equal(downedLine({ revive: 0.45, bleedOutAt: 40_000 }, 22_000), 'Being revived · 45%');
  assert.equal(outTillDawnText(runView({ phase: 'night', waveLeft: 9 }), true, 11_200).sub, 'The Bastion sends you back in 12s · 3 survivors lost');
  assert.equal(outTillDawnText(runView({ phase: 'night', waveLeft: 9, survivors: 3 }), true, 0).sub, 'Back at dawn · 9 zombies left tonight', 'too few left to send anyone');
  assert.equal(outTillDawnText(runView({ phase: 'night' }), true, 0).title, 'You bled out');
  assert.equal(outTillDawnText(runView({ phase: 'night', waveLeft: 4 }), false, 0).sub, 'Back at dawn · 4 zombies left tonight', 'a night joiner waits for dawn');
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
  assert.equal(useHint(snapshotFor(w, p.id), p), 'Hold E to repair the Bastion');
  w.buildings.push({ id: newId(w), kind: 'wall', cx: 26, cy: 30, hp: 100 });
  assert.equal(useHint(snapshotFor(w, p.id), p), 'Hold E to repair the wall');
  w.buildings = [];
  p.x = 1500 - ZOM.reachPx - 10;
  assert.equal(useHint(snapshotFor(w, p.id), p), null, 'out of reach of the core');
});

test('the run forecasts tonight ten seconds ahead and at dawn, announces nightfall with its wave and sides, and dawn with the survivors and their scrap', () => {
  const titles = (prev: RunView, next: RunView, prevAt: number, nextAt: number) => runCallouts(prev, next, prevAt, nextAt).map((c) => c.title);
  assert.deepEqual(runCallouts(runView(), runView(), 39_000, 40_000).map((c) => [c.title, c.line]), [['Night falls in 10', forecast(2)]]);
  assert.deepEqual(titles(runView(), runView(), 40_000, 41_000), [], 'once, as the countdown crosses ten seconds');
  const night = runView({ phase: 'night', phaseEndsAt: null, waveLeft: 31 });
  const call = runCallouts(runView(), night, 49_000, 50_000);
  assert.deepEqual(call.map((c) => [c.title, c.line]), [['Night 2', `31 zombies from the ${NIGHTS[1]!.from.join(' and ')} · hold the Bastion`]]);
  const dawn = runCallouts({ ...night, scrap: 60 }, runView({ night: 3, scrap: 96, survivors: 36, lost: 2 }), 90_000, 91_000);
  assert.deepEqual(dawn.map((c) => [c.title, c.line]), [['Dawn', 'Night 2 held · 2 lost · 36 survivors · +36 scrap'], ['Tonight', forecast(3)]]);
  assert.equal(runCallouts(runView({ night: 4 }), runView({ phase: 'night', night: 5, phaseEndsAt: null }), 0, 1)[0]!.title, 'The Colossus', 'a boss night goes by its name');
  assert.deepEqual(titles(night, runView({ phase: 'over', phaseEndsAt: 110_000 }), 90_000, 91_000), [], 'the report announces the fall');
  assert.deepEqual(runCallouts(undefined, night, 0, 1), [], 'nothing on the first snapshot of a session');
});

test('the fall clears every callout, so none shows through behind the report', () => {
  const { w, p } = squadWorld();
  const day = snapshotFor(w, p.id);
  w.run!.phase = { k: 'night', toSpawn: [{ kind: 'walker', side: 'north', n: 1 }], nextSpawnAt: Infinity };
  const night = snapshotFor(w, p.id);
  const announced = addMoments(NO_MOMENTS, day, night, 1000);
  assert.deepEqual(announced.callouts.map((c) => c.title), ['Night 1']);
  w.run!.phase = { k: 'over', night: 1, won: false, restartAt: Infinity };
  assert.deepEqual(addMoments(announced, night, snapshotFor(w, p.id), 1100).callouts, []);
});

test('the run report ranks the squad by kills, then revives, and marks you', () => {
  const report = { night: 4, won: false, survivors: 0, durationMs: 372_000, players: [
    { name: 'Bo', kills: 12, revives: 0, built: 9 }, { name: 'Ann', kills: 30, revives: 1, built: 0 }, { name: 'Cy', kills: 12, revives: 4, built: 7 },
  ], turretKills: { sentry: 0, cannon: 0, scatter: 0, mortar: 0 }, bastionKills: 0 };
  assert.deepEqual(reportRows(report, 'Cy').map((r) => [r.name, r.you]), [['Ann', false], ['Cy', true], ['Bo', false]]);
  assert.equal(reportTitle(report), 'The Bastion fell on night 4');
  assert.equal(reportTitle({ ...report, night: 10, won: true, survivors: 31 }), 'The Bastion held. 31 survivors saw the morning.');
});

test('the core alert starts on a bite by night and clears the moment dawn or the report arrives', () => {
  const night = (hp: number) => runView({ phase: 'night', core: { x: 1500, y: 1500, hp, maxHp: ZOM.coreHp } });
  assert.equal(nextCoreHitAt(night(4000), night(3990), 500, -Infinity), 500, 'a bite starts the alert');
  assert.equal(nextCoreHitAt(night(3990), night(3990), 600, 500), 500, 'no bite keeps the last one');
  assert.equal(nextCoreHitAt(night(3990), runView({ phase: 'day', core: { x: 1500, y: 1500, hp: 3990, maxHp: ZOM.coreHp } }), 700, 500), -Infinity, 'dawn clears it');
  assert.equal(nextCoreHitAt(night(10), runView({ phase: 'over', core: { x: 1500, y: 1500, hp: 0, maxHp: ZOM.coreHp } }), 700, 600), -Infinity, 'the report clears it');
});

test('the forecast names each night\'s kinds and sides from the night table, and nothing else', () => {
  NIGHTS.forEach((row, i) => {
    const line = forecast(i + 1).toLowerCase();
    for (const kind of ZOMBIE_KINDS) assert.equal(line.includes(ZOMBIES[kind].many), kind in row.horde, `night ${i + 1}: ${line} and the ${kind}`);
    for (const side of SIDES) assert.equal(line.includes(side), row.from.length < SIDES.length && row.from.includes(side), `night ${i + 1}: ${line} and the ${side}`);
  });
  assert.equal(forecast(1), 'Walkers from the north');
  assert.equal(forecast(NIGHTS.length).endsWith('from every side'), true);
});

test('the N hint counts the humans ready for night', () => {
  const players = [{ id: 1, kind: 'human' as const, alive: true }, { id: 2, kind: 'human' as const, alive: true }, { id: 3, kind: 'bot' as const, alive: true }];
  assert.equal(readyHint(runView(), players, 1), 'ready for night · 0/2');
  assert.equal(readyHint(runView({ ready: [1] }), players, 1), 'ready · 1/2 · N to wait');
  assert.equal(readyHint(runView(), players.slice(0, 1), 1), 'bring the night now');
});

test('holding E names the job the server does, even for a building a sliver short of whole', () => {
  const { w, p } = squadWorld();
  w.run!.scrap = 100;
  const wall = { id: newId(w), kind: 'wall' as const, cx: 26, cy: 30, hp: BUILDINGS.wall.hp - 1 };
  w.buildings.push(wall);
  assert.equal(useHint(snapshotFor(w, p.id), p), 'Hold E to repair the wall');
  press(w, p, { use: true });
  run(w, 100);
  assert.equal(wall.hp, BUILDINGS.wall.hp, 'and the server mends that wall');
  const sentry = { id: newId(w), kind: 'sentry' as const, cx: 26, cy: 31, hp: BUILDINGS.sentry.hp, owner: p.id, ammo: BUILDINGS.sentry.turret.ammo - 0.5, nextFireAt: 0 };
  w.buildings = [sentry];
  assert.equal(useHint(snapshotFor(w, p.id), p), 'Hold E to reload the sentry');
});
