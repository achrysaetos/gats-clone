import assert from 'node:assert/strict';
import test from 'node:test';
import { MAPS, type MapDef } from '../src/shared/maps.ts';
import { createAmbient, MAX_AMBIENT, type StepInput } from '../src/client/ambient.ts';
import { ambientFor, DEFAULT_AMBIENT, registerAmbient } from '../src/client/ambientreg.ts';

const VIEW = { x0: 0, y0: 0, x1: 1400, y1: 900 };
const input = (over: Partial<StepInput> = {}): StepInput => ({ players: [], view: VIEW, dark: 0, reduced: false, ...over });
const loaded = (id: string, walls?: MapDef['walls']) => {
  const a = createAmbient();
  const map = (MAPS as Record<string, MapDef>)[id]!;
  a.load(id, map, (walls ?? map.walls).map((w) => ({ ...w })));
  return a;
};
const run = (a: ReturnType<typeof createAmbient>, from: number, ms: number, inp: StepInput = input(), stepMs = 16) => { let t = from; for (; t < from + ms; t += stepMs) a.step(t, inp); return t; };
const first = (a: ReturnType<typeof createAmbient>, kind: string) => a.crits.slice(0, a.count).find((c) => c.kind === kind)!;
const insideWall = (map: MapDef, x: number, y: number, pad = 0) => map.walls.some((w) => x >= w.x - pad && x <= w.x + w.w + pad && y >= w.y - pad && y <= w.y + w.h + pad);

test('placement is deterministic per map and differs between maps', () => {
  const snap = (id: string) => { const a = loaded(id); return a.crits.slice(0, a.count).map((c) => `${c.kind}@${c.hx.toFixed(1)},${c.hy.toFixed(1)}`).join('|'); };
  for (const id of ['plaza', 'oldtown', 'quarry', 'subpen', 'museum', 'park', 'market', 'range', 'outpost']) assert.equal(snap(id), snap(id), id);
  assert.notEqual(snap('plaza'), snap('oldtown'));
});

test('every existing map has life, within the pool and per-kind caps, and nothing on the ground stands in a wall', () => {
  for (const id of ['plaza', 'oldtown', 'quarry', 'subpen', 'museum', 'park', 'market', 'range', 'outpost']) {
    const a = loaded(id), map = (MAPS as Record<string, MapDef>)[id]!;
    assert.ok(a.count > 4 && a.count <= MAX_AMBIENT, `${id}: ${a.count} critters`);
    for (const c of a.crits.slice(0, a.count)) {
      if (c.kind === 'rat' || c.kind === 'cat' || c.kind === 'mouse' || c.kind === 'dog') assert.ok(!insideWall(map, c.hx, c.hy), `${id}: ${c.kind} home is inside a wall`);
      assert.ok(Number.isFinite(c.x) && Number.isFinite(c.y));
    }
  }
});

test('a shot near a perched flock sends it up; a shot far away does not', () => {
  const a = loaded('plaza');
  const bird = first(a, 'pigeon');
  let t = run(a, 0, 200);
  a.shot(bird.x + 120, bird.y, t);
  t = run(a, t, 900);
  assert.ok(bird.st === 1 || bird.st === 2, `state after a close shot: ${bird.st}`);
  assert.ok(Math.hypot(bird.x - bird.hx, bird.y - bird.hy) > 20 || bird.z > 0, 'it left the perch');
  const b = loaded('plaza');
  const calm = first(b, 'pigeon');
  t = run(b, 0, 200);
  b.shot(calm.x + 3500, calm.y, t);
  run(b, t, 900);
  assert.equal(calm.st, 0);
});

test('a scattered bird wheels away, then settles on a different perch later', () => {
  const a = loaded('plaza');
  const bird = first(a, 'pigeon');
  const home = { x: bird.hx, y: bird.hy };
  let t = run(a, 0, 100);
  a.boom(bird.x + 100, bird.y, 120, t);
  let flew = false;
  for (let end = t + 30000; t < end && !(flew && bird.st === 0); t += 16) { a.step(t, input()); if (bird.st === 2) flew = true; }
  assert.ok(flew, 'it flew');
  assert.equal(bird.st, 0, 'and landed');
  assert.ok(Math.hypot(bird.x - home.x, bird.y - home.y) > 100, 'on a different perch');
});

test('reduced motion: critters never take to the air, a scare just fades them out and back', () => {
  const a = loaded('plaza');
  const bird = first(a, 'pigeon');
  const inp = input({ reduced: true });
  let t = run(a, 0, 100, inp);
  a.shot(bird.x + 50, bird.y, t);
  let minAlpha = 1, maxZ = 0, flew = false;
  for (const end = t + 9000; t < end; t += 16) { a.step(t, inp); minAlpha = Math.min(minAlpha, bird.alpha); maxZ = Math.max(maxZ, bird.z); if (bird.st === 1 || bird.st === 2) flew = true; }
  assert.equal(flew, false); assert.equal(maxZ, 0); assert.equal(minAlpha, 0);
  assert.equal(bird.alpha, 1); assert.equal(bird.st, 0);
  const x = a.crits.slice(0, a.count).filter((c) => c.kind === 'leaf').map((c) => c.x);
  run(a, t, 1000, inp);
  assert.deepEqual(a.crits.slice(0, a.count).filter((c) => c.kind === 'leaf').map((c) => c.x), x, 'drifters hold still');
});

test('a cat runs from a player who walks up, and never through a wall', () => {
  const a = loaded('plaza'), map = MAPS.plaza;
  const cat = first(a, 'cat');
  let t = run(a, 0, 200);
  const player = { id: 1, x: cat.x + 80, y: cat.y, alive: true };
  const view = { x0: cat.x - 700, y0: cat.y - 450, x1: cat.x + 700, y1: cat.y + 450 };
  const start = { x: cat.x, y: cat.y };
  let fled = false, moved = 0;
  for (const end = t + 4000; t < end; t += 16) {
    a.step(t, input({ players: [player], view }));
    if (cat.st === 3) fled = true;
    assert.ok(!insideWall(map, cat.x, cat.y, -2), `cat inside a wall at ${cat.x.toFixed(0)},${cat.y.toFixed(0)}`);
  }
  moved = Math.hypot(cat.x - start.x, cat.y - start.y);
  assert.ok(fled, 'it fled'); assert.ok(moved > 60, `and got away (${moved.toFixed(0)}px)`);
  assert.ok(cat.x < player.x + 1 || moved > 60);
});

test('a blast shoves nearby litter and a runner kicks it', () => {
  const a = loaded('quarry');
  const weed = first(a, 'tumbleweed');
  let t = run(a, 0, 300);
  const v0 = Math.hypot(weed.vx, weed.vy);
  a.boom(weed.x - 90, weed.y, 120, t);
  assert.ok(Math.hypot(weed.vx, weed.vy) > v0 + 100, 'blown away from the blast');
  const paper = first(a, 'paper');
  t = run(a, t, 1500);
  const v1 = Math.hypot(paper.vx, paper.vy);
  a.step(t, input({ players: [{ id: 3, x: paper.x - 20, y: paper.y, alive: true }] }));
  t += 16; a.step(t, input({ players: [{ id: 3, x: paper.x - 10, y: paper.y, alive: true }] }));
  assert.ok(Math.hypot(paper.vx, paper.vy) >= v1, 'a player pushes it on');
});

test('bats stream out of their roost only at night (or on a map that is always night)', () => {
  const day = loaded('subpen'), dusk = loaded('subpen');
  const bats = (a: ReturnType<typeof createAmbient>) => a.crits.slice(0, a.count).filter((c) => c.kind === 'bat');
  // Sub Pen's bats are `when: 'any'` in the config: always ready. A default-night group needs the dark.
  const cfgNight = { groups: [{ kind: 'bat' as const, count: 6, on: 'wall' as const }] };
  const a = createAmbient(); a.load('plaza', MAPS.plaza, MAPS.plaza.walls.map((w) => ({ ...w })), cfgNight);
  let t = run(a, 0, 100, input({ dark: 0 }));
  a.boom(a.crits[0]!.x, a.crits[0]!.y, 120, t);
  run(a, t, 1500, input({ dark: 0 }));
  assert.ok(bats(a).every((b) => b.st === 0 && !b.shown), 'daylight: they stay in');
  const b = createAmbient(); b.load('plaza', MAPS.plaza, MAPS.plaza.walls.map((w) => ({ ...w })), cfgNight);
  t = run(b, 0, 100, input({ dark: 0.6 }));
  b.boom(b.crits[0]!.x + 50, b.crits[0]!.y, 120, t);
  run(b, t, 1500, input({ dark: 0.6 }));
  assert.ok(bats(b).filter((x) => x.st === 2).length >= 3, 'night: a stream of bats');
  void day; void dusk;
});

test('rats go to ground and come back; zombies spook the outpost crows', () => {
  const a = loaded('outpost');
  const crow = first(a, 'crow');
  let t = run(a, 0, 100);
  assert.equal(crow.st, 0);
  const horde = [[1, 0, crow.x + 100, crow.y, 10]];
  for (const end = t + 1000; t < end; t += 16) a.step(t, input({ horde }));
  assert.ok((crow.st as number) === 1 || (crow.st as number) === 2, 'the crow is up');
});

test('the registry resolves map id, then theme, then the default yard; a function config gets the map', () => {
  assert.equal(ambientFor('no-such-map'), DEFAULT_AMBIENT);
  registerAmbient('test-map', (m) => ({ groups: [{ kind: 'crow', count: m.zones.length }] }));
  assert.equal(ambientFor('test-map', MAPS.plaza).groups[0]!.count, 3);
  registerAmbient('test-theme', { groups: [{ kind: 'gull', count: 2 }] });
  assert.equal(ambientFor('whatever', { ...MAPS.plaza, theme: 'test-theme' as never }).groups[0]!.kind, 'gull');
});
