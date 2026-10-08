import assert from 'node:assert/strict';
import { test } from 'node:test';
import { MAPS } from '../src/shared/maps.ts';
import { CAPS, REGIONS, WALL_FACE, planDecor, regionAt, regionsFor, type DecorPlan } from '../src/client/decor.ts';
import { BEACON_HZ, DECOR_LIGHT_CAP, DECOR_SHADOW_CAP, fixtureLight, lampColor, pickDecorLights, tubeOn, type FxState } from '../src/client/fixturelight.ts';
import { FACE } from '../src/client/tilt.ts';
import { EASTER_EGGS, FLOOR_VIGNETTES, LORE } from '../src/client/vignettes.ts';

// Causeway is a themed harbour now (themes/harbor*.ts) and skips the generic yard decor.
const YARDS = ['plaza', 'oldtown', 'quarry'] as const;
const plans = new Map<string, DecorPlan>();
const planOf = (id: keyof typeof MAPS) => { let p = plans.get(id); if (!p) plans.set(id, (p = planDecor(MAPS[id]))); return p; };
const night: FxState = { dark: 1, now: 5000, reduced: false, alarm: true };
const inside = (x: number, y: number, r: { x: number; y: number; w: number; h: number }, pad = 0) => x >= r.x - pad && x <= r.x + r.w + pad && y >= r.y - pad && y <= r.y + r.h + pad;

test('the same map always gets the same decor', () => {
  for (const id of [...YARDS, 'range', 'outpost'] as const) {
    assert.equal(JSON.stringify({ ...planDecor(MAPS[id]), keep: 0 }), JSON.stringify({ ...planDecor(MAPS[id]), keep: 0 }), id);
  }
});

test('the wall faces decor assumes match the art', () => {
  for (const m of ['concrete', 'sandstone', 'planter'] as const) assert.equal(WALL_FACE[m], FACE[m]);
});

test('floor marks never sit on a wall, a pad, a zone, a prop or a lane', () => {
  for (const id of YARDS) {
    const plan = planOf(id), map = MAPS[id];
    for (const m of plan.marks) {
      if (m.k === 'cable') { for (const [x, y] of m.pts) assert.ok(!plan.keep.blocked(x, y, 0), `${id} cable at ${x},${y}`); continue; }
      if (m.k === 'arrows') continue; // arrows belong on lanes; their own test holds them to the aisle
      if (m.k === 'stripe') { assert.ok(!plan.keep.inWall(m.x + m.w / 2, m.y + m.h / 2, 0), `${id} stripe`); continue; }
      assert.ok(!plan.keep.blocked(m.x, m.y, 0), `${id} ${m.k} at ${m.x},${m.y}`);
      for (const w of map.walls) assert.ok(!inside(m.x, m.y, { ...w, h: w.h + 16 }), `${id} ${m.k} inside a wall`);
      for (const p of plan.keep.pads) assert.ok(!inside(m.x, m.y, p), `${id} ${m.k} on a pad`);
      for (const z of map.zones) assert.ok(Math.hypot(m.x - z.x, m.y - z.y) > 180, `${id} ${m.k} in a zone`);
    }
  }
});

test('fixtures sit where their kind belongs: lamps on walls, floor lights off them, uplights off the pads', () => {
  for (const id of YARDS) {
    const plan = planOf(id), map = MAPS[id];
    for (const f of plan.fixtures) {
      const onWall = map.walls.some((w) => inside(f.x, f.y, { ...w, h: w.h + 16 }));
      if (['lamp', 'beacon', 'tube', 'window', 'exit', 'fan', 'flood'].includes(f.kind)) assert.ok(onWall, `${id} ${f.kind} should be on a wall at ${f.x},${f.y}`);
      if (['work', 'steam', 'uplight', 'lantern'].includes(f.kind)) assert.ok(!map.walls.some((w) => inside(f.x, f.y, w)), `${id} ${f.kind} is inside a wall`);
      if (f.kind === 'uplight') for (const p of plan.keep.pads) assert.ok(!inside(f.x, f.y, p), `${id} uplight on a pad`);
      assert.ok(f.x > 0 && f.y > 0 && f.x < map.size && f.y < map.size);
    }
  }
});

test('a map carries no more fixtures of a kind than its cap, and its ids are unique', () => {
  for (const id of [...YARDS, 'range', 'outpost'] as const) {
    const plan = planOf(id);
    const counts = new Map<string, number>();
    for (const f of plan.fixtures) counts.set(f.kind, (counts.get(f.kind) ?? 0) + 1);
    for (const [kind, n] of counts) assert.ok(n <= CAPS[kind as keyof typeof CAPS], `${id} has ${n} ${kind}`);
    assert.equal(new Set(plan.fixtures.map((f) => f.id)).size, plan.fixtures.length);
  }
});

test('the lights a view asks for are capped, and only the nearest few cast shadows', () => {
  for (const id of YARDS) {
    const plan = planOf(id), size = plan.size;
    const all = pickDecorLights(plan, { x0: 0, y0: 0, x1: size, y1: size }, night);
    assert.ok(all.length <= DECOR_LIGHT_CAP, `${id}: ${all.length} lights`);
    assert.ok(all.filter((l) => l.spec.shadows !== false).length <= DECOR_SHADOW_CAP);
    assert.ok(all.length > 0);
  }
  const wide = pickDecorLights(planOf('plaza'), { x0: 0, y0: 0, x1: 6000, y1: 6000 }, night, 3, 1);
  assert.equal(wide.length, 3);
});

test('a fixture whose pool reaches the view from just outside it still lights the view, whatever its kind', () => {
  const view = { x0: 0, y0: 0, x1: 1000, y1: 600 };
  for (const kind of ['flood', 'lamp', 'work', 'alarm', 'beacon'] as const) {
    const base = { id: 1, kind, x: 0, y: 0, lx: 0, ly: 300, angle: Math.PI, phase: 0, region: -1, lamp: '' };
    const r = fixtureLight(base, { ...night, alarm: true })!.spec.radius;
    const f = { ...base, lx: view.x1 + r - 20 };
    const plan = { fixtures: [f] } as unknown as DecorPlan;
    assert.equal(pickDecorLights(plan, view, { ...night, alarm: true }).length, 1, `a ${kind} ${r - 20} px past the edge reaches ${20} px in`);
    assert.equal(pickDecorLights(plan, { ...view, x1: view.x1 - 40 }, { ...night, alarm: true }).length, 0, `but not one that falls short`);
  }
});

test('reduced motion stills the beacons and the flickering tube, and nothing turns faster than 4 Hz', () => {
  assert.ok(BEACON_HZ < 4);
  const plan = planOf('oldtown');
  const beacon = plan.fixtures.find((f) => f.kind === 'beacon')!;
  const a = fixtureLight(beacon, { ...night, reduced: true, now: 0 })!.spec.cone!.angle;
  const b = fixtureLight(beacon, { ...night, reduced: true, now: 777 })!.spec.cone!.angle;
  assert.equal(a, b);
  const moving = [0, 250].map((now) => fixtureLight(beacon, { ...night, now })!.spec.cone!.angle);
  assert.notEqual(moving[0], moving[1]);
  assert.ok(Math.abs(moving[1]! - moving[0]!) / 0.25 / (Math.PI * 2) < 4);
  for (let now = 0; now < 30_000; now += 50) assert.ok(tubeOn({ phase: 0.3 }, now, true));
  let dark = 0;
  for (let now = 0; now < 60_000; now += 20) if (!tubeOn({ phase: 0.3 }, now, false)) dark++;
  assert.ok(dark > 0 && dark < 300, 'a stutter now and then, never a strobe');
});

test('each district is its own place, and every map has its own set', () => {
  const names = ['Plaza', 'Old Town', 'Quarry'];
  for (const n of names) {
    const set = regionsFor(n);
    assert.equal(set.length, 9, n);
    assert.equal(new Set(set.map((r) => r.lamp)).size, 9, `${n}: every district lights in its own colour`);
    assert.equal(new Set(set.map((r) => r.name)).size, 9);
    assert.notEqual(set[2]!.lamp, set[6]!.lamp, 'north-east and south-west differ');
  }
  const first = names.map((n) => regionsFor(n).map((r) => r.name).join('|'));
  assert.equal(new Set(first).size, names.length, 'no two maps share a district set');
  assert.ok(regionsFor('Plaza').some((r) => r.name === 'BUS DEPOT') && regionsFor('Old Town').some((r) => r.name === 'BAKERY') && regionsFor('Quarry').some((r) => r.name === 'ROCK CRUSHER'));
  for (const id of YARDS) {
    const plan = planOf(id);
    assert.equal(plan.regions, regionsFor(MAPS[id].name));
    assert.equal(new Set(plan.landmarks.map((l) => l.region)).size, plan.landmarks.length);
    assert.ok(plan.landmarks.length >= 7, `${id} has ${plan.landmarks.length} landmarks`);
    for (const l of plan.landmarks) {
      const w = MAPS[id].walls[l.wall]!;
      assert.deepEqual([l.x, l.y, l.w, l.h], [w.x, w.y, w.w, w.h], 'a landmark rides on exactly one wall block');
      assert.equal(regionAt(l.x + l.w / 2, l.y + l.h / 2, plan.size), l.region);
    }
    const lamps = plan.fixtures.filter((f) => f.kind === 'lamp');
    assert.ok(new Set(lamps.map((f) => lampColor(f))).size >= 6, 'lamps take their district colours');
    assert.ok(plan.marks.filter((m) => m.k === 'zone').length >= 8, 'district names are painted on the floor');
    assert.ok(plan.marks.filter((m) => m.k === 'district').length >= 5, 'district ground plans are painted');
  }
});

test('floor marks, stencils and district plans never overlap each other', () => {
  for (const id of YARDS) {
    const list = planOf(id).avoid;
    for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) {
      const a = list[i]!, b = list[j]!;
      assert.ok(Math.hypot(a.x - b.x, a.y - b.y) >= a.r + b.r, `${id}: marks ${i} and ${j} overlap`);
    }
  }
});

test('every yard has its vignettes, its lore and its easter eggs, all in the margins', () => {
  for (const id of YARDS) {
    const plan = planOf(id), map = MAPS[id];
    assert.ok(plan.vignettes.length >= 25, `${id}: ${plan.vignettes.length} vignettes`);
    for (let r = 0; r < 9; r++) assert.ok(plan.vignettes.filter((v) => v.region === r && !EASTER_EGGS.has(v.k)).length >= 2, `${id} district ${r} has two or three stories`);
    for (const egg of EASTER_EGGS) assert.ok(plan.vignettes.some((v) => v.k === egg), `${id} hides a ${egg}`);
    const lore = LORE[map.name]!;
    const posters = plan.vignettes.filter((v) => v.k === 'poster');
    assert.ok(posters.length >= 6);
    for (const p of posters) assert.ok(lore.some((l) => l === p.text), `${id} poster is on-message`);
    for (const v of plan.vignettes) {
      if (FLOOR_VIGNETTES.has(v.k)) assert.ok(!plan.keep.blocked(v.x, v.y, 0), `${id} ${v.k} off the lanes at ${v.x},${v.y}`);
      else assert.ok(map.walls[v.wall] !== undefined);
    }
  }
});

test('every arrow is in a run of two or three on a real aisle, pointing along it at open ground', () => {
  for (const id of YARDS) {
    const plan = planOf(id), map = MAPS[id];
    for (const m of plan.marks) {
      if (m.k !== 'arrows') continue;
      assert.ok(m.n >= 2 && m.n <= 3, `${id}: a run of ${m.n}`);
      const axisAligned = Math.abs(Math.cos(m.rot)) < 1e-9 || Math.abs(Math.sin(m.rot)) < 1e-9;
      assert.ok(axisAligned, `${id}: arrows follow the lane's axis`);
      const lead = { x: m.x + Math.cos(m.rot) * (m.n - 1) * m.step, y: m.y + Math.sin(m.rot) * (m.n - 1) * m.step };
      for (let i = 0; i < m.n; i++) assert.ok(!plan.keep.inWall(m.x + Math.cos(m.rot) * i * m.step, m.y + Math.sin(m.rot) * i * m.step, 0), `${id}: an arrow on a wall`);
      for (let d = 40; d <= 190; d += 10) assert.ok(!plan.keep.inWall(lead.x + Math.cos(m.rot) * d, lead.y + Math.sin(m.rot) * d, 0), `${id}: arrows pointing at a wall within 150 px`);
      assert.ok(lead.x > 200 && lead.y > 200 && lead.x < map.size - 200 && lead.y < map.size - 200, 'never at the map edge');
    }
    assert.ok(plan.marks.filter((m) => m.k === 'grate' || m.k === 'manhole').length <= 20, `${id}: drains are few`);
  }
});
