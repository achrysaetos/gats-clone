/// <reference types="node" />
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { bledOutText, buildSiteOf, downedLine, inviteLink, phaseLine, reportRows, reportTitle, runCallouts, squadFromSearch, useHint, withSquad } from '../src/client/zombies.ts';
import type { RunView } from '../src/shared/protocol.ts';
import { BUILDINGS, ZOM } from '../src/shared/defs.ts';
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
  return site && buildRefusal(site, cx, cy);
};

test('the build preview judges every cell around the builder as the server does', () => {
  const { w, p } = squadWorld();
  w.zombies.push({ id: newId(w), kind: 'brute', x: AT.x + 120, y: AT.y - 60, hp: 1, attackAt: Infinity });
  spawnAt(w, AT.x - 100, AT.y + 100);
  w.buildings.push({ id: newId(w), kind: 'wall', cx: 28, cy: 27, hp: 1 });
  w.walls.push({ x: 1200, y: 1400, w: 24, h: 140, built: false, expiresAt: Infinity });
  const seen = new Set<string | null>();
  for (let cy = 24; cy <= 37; cy++) {
    for (let cx = 20; cx <= 33; cx++) {
      const server = build(structuredClone(w), p.id, cx, cy);
      seen.add(server);
      assert.equal(previewOf(w, p.id, cx, cy), server, `cell ${cx},${cy}`);
    }
  }
  assert.deepEqual([...seen].sort(), [null, 'body', 'core', 'cover', 'farFromCore', 'outOfReach', 'taken'].sort(), 'the sweep covered every refusal a cell can earn');
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
    assert.equal(build(w, p.id, 26, 30), reason);
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
  assert.equal(buildRefusal(far, 26, 30), 'outOfReach', 'the drawn position decides reach, not the snapshot\'s');
  const near = buildSiteOf(snap, wallViews(w), { x: AT.x, y: AT.y - 3 * ZOM.cell })!;
  assert.equal(buildRefusal(near, 26, 30), null, 'the builder\'s own body moves with them');
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
  assert.equal(bledOutText(runView({ phase: 'night', waveLeft: 9 })).sub, 'Back at dawn · 9 zombies left tonight');
  assert.equal(bledOutText(runView({ phase: 'night' })).title, 'You bled out');
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

test('the run announces the night ten seconds ahead, nightfall with its wave, dawn with the core, and the fall', () => {
  const titles = (prev: RunView, next: RunView, prevAt: number, nextAt: number) => runCallouts(prev, next, prevAt, nextAt).map((c) => c.title);
  assert.deepEqual(titles(runView(), runView(), 39_000, 40_000), ['Night falls in 10']);
  assert.deepEqual(titles(runView(), runView(), 40_000, 41_000), [], 'once, as the countdown crosses ten seconds');
  const night = runView({ phase: 'night', phaseEndsAt: null, waveLeft: 31 });
  const call = runCallouts(runView(), night, 49_000, 50_000);
  assert.deepEqual(call.map((c) => [c.title, c.line]), [['Night 2', '31 zombies are coming · hold the core']]);
  const dawn = runCallouts(night, runView({ night: 3, scrap: 96 }), 90_000, 91_000);
  assert.deepEqual(dawn.map((c) => [c.title, c.line]), [['Dawn', 'Night 2 held · core 75% · 96 scrap to build with']]);
  assert.deepEqual(titles(night, runView({ phase: 'over', phaseEndsAt: 110_000 }), 90_000, 91_000), ['The core fell']);
  assert.deepEqual(runCallouts(undefined, night, 0, 1), [], 'nothing on the first snapshot of a session');
});

test('the run report ranks the squad by kills, then revives, and marks you', () => {
  const report = { night: 4, durationMs: 372_000, players: [
    { name: 'Bo', kills: 12, revives: 0, built: 9 }, { name: 'Ann', kills: 30, revives: 1, built: 0 }, { name: 'Cy', kills: 12, revives: 4, built: 7 },
  ] };
  assert.deepEqual(reportRows(report, 'Cy').map((r) => [r.name, r.you]), [['Ann', false], ['Cy', true], ['Bo', false]]);
  assert.equal(reportTitle(report), 'The core fell on night 4');
});
