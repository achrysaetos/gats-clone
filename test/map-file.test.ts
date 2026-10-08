/// <reference types="node" />
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { expandMap, halfTurnPiece, MAP_IDS, parseMapFile, serializeMapFile, type MapFile } from '../src/shared/maps.ts';

const stored = (id: string) => readFileSync(new URL(`../src/shared/maps/${id}.json`, import.meta.url), 'utf8');

for (const id of MAP_IDS) {
  test(`${id}.json comes back byte for byte through parse and serialize`, () => {
    assert.equal(serializeMapFile(parseMapFile(JSON.parse(stored(id)))), stored(id));
  });
}

test('a file built with its keys in any order saves in the stored order and loads back the same', () => {
  const file: MapFile = {
    zones: [{ y: 400, x: 300 }],
    spawns: { ffa: [{ h: 50, w: 50, y: 100, x: 100 }], blue: [], red: [{ w: 60, x: 40, h: 60, y: 40 }] },
    marks: [{ r: 1, h: 25, w: 100, y: 10, x: 20, k: 'chevron' }],
    pieces: [{ r: 3, y: 200, x: 150, p: 'forklift' }],
    light: 'dusk',
    symmetry: 'none',
    size: 1000,
    name: 'Shuffled',
    extract: { defend: [{ x: 0, y: 0, w: 10, h: 10 }], attack: [{ x: 5, y: 5, w: 10, h: 10 }], terminal: { y: 9, x: 8 } },
  };
  const text = serializeMapFile(file);
  assert.deepEqual(Object.keys(JSON.parse(text)), ['name', 'size', 'symmetry', 'light', 'pieces', 'marks', 'spawns', 'zones', 'extract']);
  assert.match(text, /\{\n {3}"k": "chevron",\n {3}"x": 20,/);
  assert.equal(serializeMapFile(parseMapFile(JSON.parse(text))), text);
  assert.ok(text.endsWith('}\n'));
});

test('a half-turn piece twin turns about the centre, and one that lands on itself is dropped', () => {
  assert.deepEqual(halfTurnPiece(1000, { p: 'forklift', x: 100, y: 200, r: 0 }), { p: 'forklift', x: 825, y: 675, r: 2 });
  assert.equal(halfTurnPiece(1000, { p: 'crate', x: 475, y: 475, r: 0 }), null);
  assert.deepEqual(halfTurnPiece(1000, { p: 'forklift', x: 462.5, y: 437.5, r: 0 }), { p: 'forklift', x: 462.5, y: 437.5, r: 2 });
  const file: MapFile = {
    name: 'T', size: 1000, symmetry: 'halfTurn', light: 'day',
    pieces: [{ p: 'forklift', x: 100, y: 200, r: 0 }, { p: 'crate', x: 475, y: 475, r: 0 }],
    marks: [], spawns: { red: [], blue: [], ffa: [] }, zones: [],
  };
  assert.deepEqual(expandMap(file).pieces, [...file.pieces, { p: 'forklift', x: 825, y: 675, r: 2 }]);
});
