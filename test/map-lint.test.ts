/// <reference types="node" />
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { WORLD } from '../src/shared/defs.ts';
import type { ModeId } from '../src/shared/defs.ts';
import { expandMap, MAP_IDS, MAPS, modesOn, ZONE_RADIUS, type MapDef, type MapFile } from '../src/shared/maps.ts';
import { lintMap as lintProblems } from '../src/shared/maplint.ts';

const lintMap = (def: MapDef, modes?: readonly ModeId[]) => lintProblems(def, modes).map((p) => p.text);

for (const id of MAP_IDS) {
  test(`${MAPS[id].name} passes the map lint`, () => {
    assert.deepEqual(lintMap(MAPS[id], modesOn(id)), []);
  });
}

// A 2000 px half-turn map: red in the top-left corner, a wall band under it and its twin over the blue corner, the middle zone at the center.
const BARRIER: MapFile['pieces'] = [0, 200, 400, 600, 800].map((x) => ({ p: 'wall.long', x, y: 500, r: 0 }));
const CLEAN: MapFile = {
  name: 'Clean',
  size: 2000,
  symmetry: 'halfTurn',
  light: 'day',
  pieces: [...BARRIER, { p: 'crate', x: 1200, y: 600, r: 0 }, { p: 'crate', x: 700, y: 300, r: 0 }],
  marks: [],
  spawns: { red: [{ x: 50, y: 50, w: 100, h: 100 }], blue: [], ffa: [{ x: 700, y: 700, w: 100, h: 100 }] },
  zones: [{ x: 400, y: 1000 }, { x: 1000, y: 1000 }],
};
const build = (over: Partial<MapFile> = {}) => expandMap({ ...CLEAN, ...over });
const withPieces = (...pieces: MapFile['pieces']) => lintMap(build({ pieces: [...CLEAN.pieces, ...pieces] }));
const clean = build();

test('the small map the broken ones start from passes', () => {
  assert.deepEqual(lintMap(clean), []);
});

test('a walled-off pocket is reported with its size, on each side of the turn', () => {
  const room: MapFile['pieces'] = [
    { p: 'wall.long', x: 1300, y: 200, r: 0 },
    { p: 'wall.long', x: 1300, y: 400, r: 0 },
    { p: 'wall.long', x: 1275, y: 225, r: 1 },
    { p: 'wall.long', x: 1500, y: 225, r: 1 },
  ];
  assert.deepEqual(withPieces(...room), [
    '30 spots (18750 px²) around (1338, 263) cannot be walked to from any spawn',
    '30 spots (18750 px²) around (538, 1638) cannot be walked to from any spawn',
  ]);
});

test('each problem carries the place it is about, so the editor can mark it', () => {
  const problems = lintProblems(build({ pieces: [...CLEAN.pieces, { p: 'crate.metal', x: 1960, y: 300, r: 0 }], spawns: { ...CLEAN.spawns, ffa: [] } }));
  assert.deepEqual(problems.filter((p) => p.text.startsWith('crate.metal at')).map((p) => p.at), [{ x: 1985, y: 325 }, { x: 15, y: 1675 }]);
  assert.deepEqual(problems.find((p) => p.text === 'no ffa spawn region')?.at, null);
});

test('a spawn against the map edge lets a player stand past it', () => {
  const edge = ['red spawn 0 lets a player stand past the edge', 'blue spawn 0 lets a player stand past the edge'];
  assert.deepEqual(lintMap(build({ spawns: { ...CLEAN.spawns, red: [{ x: 10, y: 50, w: 100, h: 100 }] } })), edge);
  assert.deepEqual(lintMap(build({ spawns: { ...CLEAN.spawns, red: [{ x: WORLD.playerRadius - 1, y: 50, w: 100, h: 100 }] } })), edge);
});

test('spawns with nothing between them see each other', () => {
  const lines = lintMap(build({ pieces: CLEAN.pieces.filter((at) => at.p !== 'wall.long') }));
  assert.equal(lines.length, 1);
  assert.match(lines[0]!, /^the red spawn at \(\d+, \d+\) can see the blue spawn at \(\d+, \d+\)$/);
});

test('a wall, breakable, spawn or zone without its twin at the half turn breaks the symmetry', () => {
  const broken = (over: Partial<MapDef>) => lintMap({ ...clean, ...over });
  assert.deepEqual(broken({ walls: clean.walls.map((w, i) => (i === 0 ? { ...w, material: 'metal' } : w)) }), ['walls are not the same after a half turn around (100, 513)']);
  const [first, ...rest] = clean.breakables;
  assert.ok(first);
  assert.deepEqual(broken({ breakables: [{ ...first, x: first.x + 30 }, ...rest] }), ['the breakable at (1255, 625) has no twin at the half turn', 'the breakable at (775, 1375) has no twin at the half turn']);
  assert.deepEqual(broken({ spawns: { ...clean.spawns, ffa: clean.spawns.ffa.slice(0, 1) } }), ['spawns are not the same after a half turn (red for blue) around (750, 750)']);
  assert.deepEqual(broken({ zones: [{ x: 500, y: 1000 }, ...clean.zones.slice(1)] }), ['zone at (500, 1000) has no twin at the half turn', 'zone at (1600, 1000) has no twin at the half turn']);
});

test('a zone past the edge, over a wall or out of reach is reported', () => {
  assert.deepEqual(lintMap(build({ zones: [{ x: 100, y: 1000 }, CLEAN.zones[1]!] })), ['zone 0 at (100, 1000) reaches past the map\'s edge', 'zone 2 at (1900, 1000) reaches past the map\'s edge']);
  assert.deepEqual(withPieces({ p: 'wall.long', x: 350, y: 990, r: 0 }), ["zone 0's center (400, 1000) cannot be walked to from any spawn", 'zone 0 at (400, 1000) overlaps the wall at (350, 990)', "zone 2's center (1600, 1000) cannot be walked to from any spawn", 'zone 2 at (1600, 1000) overlaps the wall at (1450, 985)']);
  const boxed = lintMap({ ...clean, zones: [{ x: 1000, y: 1000 }, { x: 1000, y: 1000 }, { x: 1000, y: 1000 }], walls: [...clean.walls, { x: 975, y: 975, w: 50, h: 50, material: 'concrete' }] });
  assert.ok(boxed.includes('zone 0\'s center (1000, 1000) cannot be walked to from any spawn'), boxed.join('\n'));
});

test('a wall or crate a pixel past the edge leaves the world', () => {
  assert.deepEqual(withPieces({ p: 'wall.long', x: -1, y: 1500, r: 0 }), ['wall 5 leaves the world', 'wall 11 leaves the world', 'wall.long at (-1, 1500) leaves the world', 'wall.long at (1801, 475) leaves the world']);
  assert.deepEqual(withPieces({ p: 'crate', x: -1, y: 1500, r: 0 }), ['crate at (-1, 1500) leaves the world', 'crate at (1951, 450) leaves the world', 'crate 2 leaves the world', 'crate 5 leaves the world']);
});

test('a crate a pixel into a wall overlaps it', () => {
  assert.deepEqual(withPieces({ p: 'crate', x: 250, y: 500 - 50 + 1, r: 0 }), ['wall.long at (200, 500) overlaps crate at (250, 451)', 'wall.long at (1600, 1475) overlaps crate at (1700, 1499)', 'crate 2 overlaps a wall', 'crate 5 overlaps a wall']);
});

test('a zone a pixel into a crate overlaps it', () => {
  assert.deepEqual(withPieces({ p: 'crate', x: 400 + ZONE_RADIUS - 1, y: 975, r: 0 }), ['zone 0 at (400, 1000) overlaps a crate', 'zone 2 at (1600, 1000) overlaps a crate']);
});

test('a versus map without three zones cannot host DOM', () => {
  assert.deepEqual(lintMap(build({ zones: [CLEAN.zones[1]!] })), ['1 zones, DOM needs 3']);
});

test('a wall a pixel inside a player\'s reach of a spawn lets a player stand in it, even between grid spots', () => {
  const red = CLEAN.spawns.red[0]!;
  assert.deepEqual(withPieces({ p: 'wall.short', x: red.x + red.w + WORLD.playerRadius - 1, y: red.y, r: 0 }), ['red spawn 0 lets a player stand in the wall or crate at (173, 50)', 'blue spawn 0 lets a player stand in the wall or crate at (1777, 1925)']);
});

test('a side with no spawn region is reported', () => {
  assert.deepEqual(lintMap(build({ spawns: { ...CLEAN.spawns, ffa: [] } })), ['no ffa spawn region']);
});

// A 2000 px extraction map: attackers bottom-left, defenders top-right behind a wall band, the terminal top-left and the pad bottom-right.
const ATTACK = { x: 50, y: 1850, w: 100, h: 100 }, DEFEND = { x: 1850, y: 50, w: 100, h: 100 };
const VAULT: MapFile = {
  name: 'Vault test',
  size: 2000,
  symmetry: 'none',
  light: 'day',
  pieces: [...[0, 200, 400, 600, 800, 1000, 1200].map((x) => ({ p: 'wall.long' as const, x, y: 1000, r: 0 as const })), { p: 'helipad', x: 1500, y: 1500, r: 0 }],
  marks: [],
  spawns: { red: [ATTACK], blue: [DEFEND], ffa: [ATTACK, DEFEND] },
  zones: [],
  extract: { terminal: { x: 500, y: 500 }, attack: [ATTACK], defend: [DEFEND] },
};
const vault = (over: Partial<MapFile> = {}) => lintMap(expandMap({ ...VAULT, ...over }));

test('an extraction map takes its pad from its helipad and passes without zones or a half-turn twin', () => {
  assert.deepEqual(expandMap(VAULT).extract?.pad, { x: 1500, y: 1500, w: 300, h: 300 });
  assert.deepEqual(vault(), []);
});

test('an extraction terminal over a wall, a pad holding a crate, or a pad walled off is reported', () => {
  assert.deepEqual(vault({ pieces: [...VAULT.pieces, { p: 'wall', x: 450, y: 600, r: 0 }] }), ["the terminal's circle at (500, 500) overlaps the solid at (450, 600)"]);
  assert.deepEqual(vault({ pieces: [...VAULT.pieces, { p: 'crate', x: 1720, y: 1720, r: 0 }] }), ['the pad at (1500, 1500) holds the solid at (1720, 1720)']);
  const fence: MapFile['pieces'] = [
    { p: 'wall.long', x: 1400, y: 1400, r: 0 }, { p: 'wall.long', x: 1600, y: 1400, r: 0 }, { p: 'wall.long', x: 1800, y: 1400, r: 0 },
    { p: 'wall.long', x: 1400, y: 1425, r: 1 }, { p: 'wall.long', x: 1400, y: 1625, r: 1 }, { p: 'wall', x: 1400, y: 1825, r: 1 }, { p: 'wall.short', x: 1400, y: 1925, r: 1 }, { p: 'wall.post', x: 1400, y: 1975, r: 0 },
  ];
  const walled = vault({ pieces: [...VAULT.pieces, ...fence] });
  assert.ok(walled.includes('the pad at (1500, 1500) cannot be walked to from any spawn'), walled.join('\n'));
});

test('attack and defend spawns that see each other are reported', () => {
  const lines = vault({ pieces: VAULT.pieces.filter((at) => at.p !== 'wall.long') });
  assert.ok(lines.some((l) => /^the attack spawn at \(\d+, \d+\) can see the defend spawn/.test(l)), lines.join('\n'));
});

test('an extraction map without a pad or a helipad fails to load', () => {
  assert.throws(() => expandMap({ ...VAULT, pieces: VAULT.pieces.filter((at) => at.p !== 'helipad') }), /no pad and 0 helipads/);
});

// A 2000 px half-turn yard split by a train lane at its middle row: fences along both edges with two crossings, each with a signal beside it.
const LANE = { x: 0, y: 925, w: 2000, h: 150 };
const TRACKS: MapFile['pieces'] = Array.from({ length: 10 }, (_, i) => ({ p: 'track', x: i * 100, y: LANE.y, r: 0 }));
const FENCE: MapFile['pieces'] = [0, 200, 600, 800, 1000, 1200, 1600, 1800].map((x) => ({ p: 'wall.long', x, y: 875, r: 0 }));
const YARD: MapFile = {
  name: 'Yard test',
  size: 2000,
  symmetry: 'halfTurn',
  light: 'day',
  pieces: [...TRACKS, ...FENCE, { p: 'signal', x: 362.5, y: 840, r: 0 }],
  marks: [],
  spawns: { red: [{ x: 50, y: 50, w: 100, h: 100 }], blue: [], ffa: [{ x: 700, y: 500, w: 100, h: 100 }] },
  zones: [{ x: 1000, y: 400 }],
  train: { lane: LANE, axis: 'x', dir: 1, everyMs: 60_000, jitterMs: 10_000, warnMs: 5000, speed: 1600, length: 1200 },
};
const yard = (over: Partial<MapFile> = {}) => lintMap(expandMap({ ...YARD, ...over }), ['FFA']);

test('a lane run edge to edge over track, fenced with two signalled crossings and clear of spawns and zones, passes', () => {
  assert.deepEqual(yard(), []);
});

test('a piece standing in the lane is reported, and paint or an overhead beam over it is not', () => {
  assert.deepEqual(yard({ pieces: [...YARD.pieces, { p: 'crate', x: 300, y: 950, r: 0 }] }), ['crate at (300, 950) stands in the train\'s lane', 'crate at (1650, 1000) stands in the train\'s lane']);
  assert.deepEqual(yard({ pieces: [...YARD.pieces, { p: 'pipes', x: 700, y: 975, r: 0 }, { p: 'rubble', x: 300, y: 950, r: 0 }] }), []);
});

test('a spawn, zone, terminal or core near the lane is reported', () => {
  assert.deepEqual(yard({ spawns: { ...YARD.spawns, ffa: [{ x: 700, y: 700, w: 100, h: 110 }] } }), ['ffa spawn 0 is within 124 of the train\'s lane', 'ffa spawn 1 is within 124 of the train\'s lane']);
  assert.deepEqual(yard({ zones: [{ x: 1000, y: 750 }] }), ['zone 0 at (1000, 750) is within 100 of the train\'s lane']);
  const objectives = lintMap({ ...expandMap(YARD), extract: { terminal: { x: 300, y: 1250 }, pad: { x: 1500, y: 1150, w: 300, h: 300 }, attack: YARD.spawns.red, defend: YARD.spawns.ffa } }, ['FFA']);
  assert.deepEqual(objectives, ['the terminal at (300, 1250) is within 100 of the train\'s lane', 'the pad at (1500, 1150) is within 100 of the train\'s lane']);
  const sieged = lintMap({ ...expandMap(YARD), siege: { core: { x: 300, y: 1200 }, horde: { north: LANE, east: LANE, south: LANE, west: LANE } } }, ['FFA']);
  assert.deepEqual(sieged, ['the core at (300, 1200) is within 100 of the train\'s lane']);
});

test('a lane short of an edge, or missing track, is reported', () => {
  assert.ok(yard({ train: { ...YARD.train!, lane: { ...LANE, w: 1900 } } }).includes('the train\'s lane runs 0 to 1900, not edge to edge'));
  assert.deepEqual(yard({ pieces: YARD.pieces.filter((at) => !(at.p === 'track' && at.x === 300)) }), ['the train\'s lane has no track under (325, 1000)']);
});

test('a lane fenced shut has no crossing and too long a stretch', () => {
  assert.deepEqual(yard({ pieces: [...YARD.pieces, { p: 'wall.long', x: 400, y: 875, r: 0 }] }), [
    'the train\'s lane has 0 crossing(s), it needs at least 2',
    'the train\'s lane runs 2000 from 0 without a crossing, more than 1600',
  ]);
});

test('a crossing without a signal or warning light near it is reported', () => {
  assert.deepEqual(yard({ pieces: YARD.pieces.filter((at) => at.p !== 'signal') }), [
    'the crossing at (500, 1000) has no signal or warning light within 300',
    'the crossing at (1500, 1000) has no signal or warning light within 300',
  ]);
  assert.deepEqual(yard({ pieces: [...YARD.pieces.filter((at) => at.p !== 'signal'), { p: 'alarm', x: 487.5, y: 800, r: 0 }] }), []);
});

test('each mode a map is played in asks for its own sections', () => {
  assert.deepEqual(lintMap(clean, ['BR']), ['Last Squad needs a 4000 map for its ring, not 2000']);
  assert.deepEqual(lintMap(clean, ['ZOM']), ['zombies needs a siege section: a core and the horde\'s edges']);
  assert.deepEqual(lintMap(clean, ['EXT']), ['extraction needs an extract section']);
  assert.deepEqual(lintMap(build({ zones: [CLEAN.zones[1]!] }), ['FFA', 'TDM']), []);
});
