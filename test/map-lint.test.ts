/// <reference types="node" />
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { CRATE_SIZE, MAP_IDS, MAPS, ZONE_RADIUS, type MapDef, type MapId } from '../src/shared/maps.ts';
import { WORLD } from '../src/shared/defs.ts';
import { gridMap } from '../src/shared/mapgrid.ts';
import { lintMap } from '../scripts/map-lint.ts';

for (const id of MAP_IDS) {
  test(`${MAPS[id].name} passes the map lint`, () => {
    assert.deepEqual(lintMap(MAPS[id]), []);
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

test('a spawn against the map edge lets a player stand past it', () => {
  const m = gridMap('Edge', rows({ 1: 'RR..........', 2: 'RR..........' }));
  assert.deepEqual(lintMap(m), ['red spawn 0 lets a player stand past the edge', 'blue spawn 0 lets a player stand past the edge']);
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

const turn = <T extends { x: number; y: number; w: number; h: number }>(r: T): T => ({ ...r, x: clean.size - r.x - r.w, y: clean.size - r.y - r.h });
const withWalls = (...walls: MapDef['walls']) => lintMap({ ...clean, walls: [...clean.walls, ...walls, ...walls.map(turn)] });
const withCrates = (...crates: MapDef['crates']) => lintMap({ ...clean, crates: [...clean.crates, ...crates, ...crates.map((c) => ({ x: clean.size - c.x, y: clean.size - c.y }))] });

test('a wall or crate a pixel past the edge leaves the world', () => {
  assert.deepEqual(withWalls({ x: -1, y: 600, w: 50, h: 50, material: 'concrete' }), ['wall 2 leaves the world', 'wall 3 leaves the world']);
  assert.deepEqual(withCrates({ x: CRATE_SIZE / 2 - 1, y: 600 }), ['crate 2 leaves the world', 'crate 3 leaves the world']);
});

test('a crate a pixel into a wall overlaps it', () => {
  assert.deepEqual(withCrates({ x: 250, y: 200 - CRATE_SIZE / 2 + 1 }), ['crate 2 overlaps a wall', 'crate 3 overlaps a wall']);
});

test('a zone a pixel into a crate overlaps it', () => {
  assert.deepEqual(withCrates({ x: 225 + ZONE_RADIUS + CRATE_SIZE / 2 - 1, y: 725 }), ['zone 0 at (225, 725) overlaps a crate', 'zone 2 at (975, 475) overlaps a crate']);
});

test('a versus map without three zones cannot host DOM', () => {
  assert.deepEqual(lintMap({ ...clean, zones: clean.zones.slice(1, 2) }), ['1 zones, DOM needs 3']);
});

test('a wall a pixel inside a player\'s reach of a spawn lets a player stand in it, even between grid spots', () => {
  const red = clean.spawns.red[0]!;
  assert.deepEqual(withWalls({ x: red.x + red.w + WORLD.playerRadius - 1, y: red.y, w: 50, h: red.h, material: 'concrete' }), ['red spawn 0 lets a player stand in a wall or crate', 'blue spawn 0 lets a player stand in a wall or crate']);
});

test('a side with no spawn region is reported', () => {
  assert.deepEqual(lintMap({ ...clean, spawns: { ...clean.spawns, ffa: [] } }), ['no ffa spawn region']);
});
