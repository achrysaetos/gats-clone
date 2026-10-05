/// <reference types="node" />
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { gridMap } from '../src/shared/mapgrid.ts';

test('wall cells merge into rects along a row, then down while the row below runs exactly as wide, and the east half is the west turned', () => {
  const m = gridMap('L', `
##.
##.
#..
...
A..
...
`);
  assert.equal(m.size, 300);
  assert.deepEqual(m.walls, [
    { x: 0, y: 0, w: 100, h: 100, material: 'concrete' },
    { x: 0, y: 100, w: 50, h: 50, material: 'concrete' },
    { x: 250, y: 150, w: 50, h: 50, material: 'concrete' },
    { x: 200, y: 200, w: 100, h: 100, material: 'concrete' },
  ]);
});

test('red spawns turn into blue ones, FFA spawns and crates turn into more of themselves, and zone A turns into C about B at the centre', () => {
  const m = gridMap('Turn', `
X.
.S
cA
R.
`);
  assert.deepEqual(m, {
    name: 'Turn',
    size: 200,
    walls: [{ x: 50, y: 50, w: 50, h: 50, material: 'sandstone' }, { x: 100, y: 100, w: 50, h: 50, material: 'sandstone' }],
    zones: [{ x: 75, y: 125 }, { x: 100, y: 100 }, { x: 125, y: 75 }],
    spawns: {
      red: [{ x: 0, y: 0, w: 50, h: 50 }, { x: 0, y: 150, w: 50, h: 50 }],
      blue: [{ x: 150, y: 0, w: 50, h: 50 }, { x: 150, y: 150, w: 50, h: 50 }],
      ffa: [{ x: 0, y: 0, w: 50, h: 50 }, { x: 150, y: 150, w: 50, h: 50 }],
    },
    crates: [{ x: 25, y: 125 }, { x: 175, y: 75 }],
  });
});

test('spawn cells merge into rects the way walls do, and concrete, sandstone and planter never merge with each other', () => {
  const m = gridMap('Strip', `
RR
RR
#S
AP
`);
  assert.deepEqual(m.spawns.red, [{ x: 0, y: 0, w: 100, h: 100 }]);
  assert.deepEqual(m.spawns.blue, [{ x: 100, y: 100, w: 100, h: 100 }]);
  assert.deepEqual(m.walls.map((w) => [w.x, w.material]), [[150, 'concrete'], [0, 'concrete'], [100, 'sandstone'], [50, 'sandstone'], [100, 'planter'], [50, 'planter']]);
});

test('blank lines around the grid and the indentation every row shares are ignored', () => {
  const flat = gridMap('M', 'X.\n.S\ncA\nR.');
  const indented = gridMap('M', `

      X.
      .S
      cA
      R.

  `);
  assert.deepEqual(indented, flat);
});

test('a malformed grid throws, naming what is wrong', () => {
  assert.throws(() => gridMap('Ragged', '..\n.\nA.\n..'), /Ragged: rows are not all 2 wide/);
  assert.throws(() => gridMap('Odd', '..\n?.\nA.\n..'), /Odd: unknown cell '\?' at column 0, row 1/);
  assert.throws(() => gridMap('Indent', '  ..\n .A\n  ..\n  ..'), /Indent: rows are not all/);
  assert.throws(() => gridMap('NoA', '..\n..\n..\n..'), /NoA: needs exactly one A, found 0/);
  assert.throws(() => gridMap('TwoA', 'A.\n..\n.A\n..'), /TwoA: needs exactly one A, found 2/);
  assert.throws(() => gridMap('Square', 'A.\n..'), /Square: the west half is 2x2; it must be twice as tall as it is wide/);
});
