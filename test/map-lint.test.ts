/// <reference types="node" />
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { MAP_IDS, MAPS, type MapDef, type MapId } from '../src/shared/maps.ts';
import { gridMap } from '../src/shared/mapgrid.ts';
import { lintMap } from '../scripts/map-lint.ts';

/** The 3000px rect maps put each team's spawn down a whole edge in sight of the other's; they are being replaced by grid maps. */
const KNOWN: Partial<Record<MapId, RegExp>> = {
  boneyard: /^the red spawn at .* can see the blue spawn at /,
  causeway: /^the red spawn at .* can see the blue spawn at /,
  oldtown: /^the red spawn at .* can see the blue spawn at /,
  citadel: /^the red spawn at .* can see the blue spawn at /,
};

for (const id of MAP_IDS) {
  test(`${MAPS[id].name} passes the map lint`, () => {
    const known = KNOWN[id];
    assert.deepEqual(lintMap(MAPS[id]).filter((p) => !known?.test(p)), []);
  });
}

const rows = (edit: Record<number, string> = {}) => Array.from({ length: 24 }, (_, r) => edit[r] ?? BASE[r] ?? '............').join('\n');
const BASE: Record<number, string> = {
  1: '.RR.........',
  2: '.RR.........',
  4: '##########..',
  14: '....A.......',
  16: '........c...',
  20: '.FF.........',
  21: '.FF.........',
};
const clean = gridMap('Clean', rows());

test('the small map the broken ones start from passes', () => {
  assert.deepEqual(lintMap(clean), []);
});

test('a walled-off pocket is reported with its size, on each side of the turn', () => {
  const m = gridMap('Pocket', rows({ 6: '...#####....', 7: '...#...#....', 8: '...#...#....', 9: '...#####....' }));
  assert.deepEqual(lintMap(m), [
    '8 spots (5000 px²) around (238, 388) cannot be walked to from any spawn',
    '8 spots (5000 px²) around (888, 788) cannot be walked to from any spawn',
  ]);
});

test('a spawn against the map edge has spots a player cannot stand at', () => {
  const m = gridMap('Edge', rows({ 1: 'RR..........', 2: 'RR..........' }));
  assert.deepEqual(lintMap(m), [
    'red spawn 0: a player cannot stand at 4 of its spots, first (13, 63)',
    'blue spawn 0: a player cannot stand at 4 of its spots, first (1188, 1063)',
  ]);
});

test('spawns with nothing between them see each other', () => {
  assert.deepEqual(lintMap(gridMap('Open', rows({ 4: '............' }))), ['the red spawn at (63, 63) can see the blue spawn at (1063, 1063)']);
});

test('a wall, crate, spawn or zone without its twin at the half turn breaks the symmetry', () => {
  const broken = (over: Partial<MapDef>) => lintMap({ ...clean, ...over });
  assert.deepEqual(broken({ walls: clean.walls.map((w, i) => (i === 0 ? { ...w, material: 'sandstone' } : w)) }), ['walls are not the same after a half turn around (100, 225)']);
  assert.deepEqual(broken({ crates: [{ x: 430, y: 825 }, clean.crates[1]!] }), ['the crate at (430, 825) has no twin at the half turn', 'the crate at (775, 375) has no twin at the half turn']);
  assert.deepEqual(broken({ spawns: { ...clean.spawns, ffa: clean.spawns.ffa.slice(0, 1) } }), ['spawns are not the same after a half turn (red for blue) around (1075, 125)']);
  assert.deepEqual(broken({ zones: [{ x: 300, y: 625 }, ...clean.zones.slice(1)] }), ['zone at (300, 625) has no twin at the half turn', 'zone at (975, 475) has no twin at the half turn']);
});

test('a zone past the edge, over a wall or out of reach is reported', () => {
  assert.deepEqual(lintMap(gridMap('ZoneEdge', rows({ 14: 'A...........' }))), ['zone 0 at (25, 725) reaches past the map\'s edge', 'zone 2 at (1175, 475) reaches past the map\'s edge']);
  assert.deepEqual(lintMap(gridMap('ZoneWall', rows({ 14: '............', 5: '.....A......' }))), ['zone 0 at (275, 275) overlaps a wall', 'zone 2 at (925, 925) overlaps a wall']);
  const boxed = lintMap({ ...clean, zones: [{ x: 600, y: 600 }, { x: 600, y: 600 }, { x: 600, y: 600 }], walls: [...clean.walls, { x: 575, y: 575, w: 50, h: 50, material: 'concrete' }] });
  assert.ok(boxed.includes('zone 0\'s center (600, 600) cannot be walked to from any spawn'), boxed.join('\n'));
});
