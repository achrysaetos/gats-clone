/// <reference types="node" />
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { placed } from '../src/shared/kit.ts';
import { expandMap, parseMapFile, serializeMapFile, type MapFile } from '../src/shared/maps.ts';
import { addPiece, addRegion, commit, dragTo, handlesOf, historyOf, pick, placementAt, redo, remove, resizeTo, rotatePiece, undo, type Handle } from '../src/client/editor/model.ts';

const load = (id: string) => parseMapFile(JSON.parse(readFileSync(new URL(`../src/shared/maps/${id}.json`, import.meta.url), 'utf8')));
const WAREHOUSE = load('warehouse');
const VAULT = load('vault');

const SMALL: MapFile = {
  name: 'Small', size: 1000, symmetry: 'halfTurn', light: 'day',
  pieces: [{ p: 'forklift', x: 100, y: 100, r: 0 }, { p: 'crate', x: 600, y: 200, r: 0 }],
  marks: [],
  spawns: { red: [{ x: 50, y: 500, w: 200, h: 200 }], blue: [], ffa: [{ x: 550, y: 150, w: 200, h: 200 }] },
  zones: [{ x: 300, y: 300 }, { x: 500, y: 500 }],
};
const pieceHandles = (f: MapFile) => handlesOf(f).filter((h) => h.target.k === 'piece');
const twinOfPiece = (f: MapFile, i: number) => handlesOf(f).find((h) => h.twin && h.target.k === 'piece' && h.target.i === i)!;
const rect = (h: Handle) => (h.geom.kind === 'rect' ? h.geom.rect : assert.fail('not a rect'));

test('the pieces the editor draws, twins included, are the pieces the game loads', () => {
  for (const file of [WAREHOUSE, VAULT]) {
    assert.deepEqual(pieceHandles(file).map(rect), expandMap(file).pieces.map((at) => placed(at).foot));
  }
});

test('a red spawn twin is drawn where the game puts the blue spawn, and only zone A has a twin', () => {
  const handles = handlesOf(SMALL);
  const blue = handles.filter((h) => h.label === 'blue spawn').map(rect);
  assert.deepEqual(blue, expandMap(SMALL).spawns.blue);
  assert.deepEqual(handles.filter((h) => h.target.k === 'zone' && h.twin).map((h) => h.label), ['zone C']);
});

test('moving a piece moves its twin with it, and the file keeps only the half', () => {
  const moved = dragTo(SMALL, pieceHandles(SMALL)[0]!, { x: 150, y: 125 });
  assert.equal(moved.pieces.length, 2);
  assert.deepEqual(moved.pieces[0], { p: 'forklift', x: 150, y: 125, r: 0 });
  assert.deepEqual(rect(twinOfPiece(moved, 0)), { x: 775, y: 750, w: 75, h: 125 });
  assert.deepEqual(expandMap(moved).pieces.at(-2), { p: 'forklift', x: 775, y: 750, r: 2 });
});

test('dragging a twin lands the twin where it was dropped and moves its original to the half turn', () => {
  const moved = dragTo(SMALL, twinOfPiece(SMALL, 0), { x: 700, y: 600 });
  assert.deepEqual(rect(twinOfPiece(moved, 0)), { x: 700, y: 600, w: 75, h: 125 });
  assert.deepEqual(moved.pieces[0], { p: 'forklift', x: 225, y: 275, r: 0 });
});

test('rotation keeps a piece centred and takes only the turns the kit bakes', () => {
  const turned = rotatePiece(SMALL, 0, 25, false);
  assert.deepEqual(turned.pieces[0], { p: 'forklift', x: 75, y: 125, r: 1 });
  let f = SMALL;
  for (let i = 0; i < 4; i++) f = rotatePiece(f, 0, 25, false);
  assert.deepEqual(f.pieces[0], SMALL.pieces[0]);
  assert.equal(rotatePiece(SMALL, 1, 25, false), SMALL, 'a crate looks the same every way round');
  const wall = addPiece(SMALL, { p: 'wall', x: 300, y: 600, r: 0 }).file;
  const once = rotatePiece(wall, 2, 1, true), twice = rotatePiece(once, 2, 1, true);
  assert.deepEqual([once.pieces[2]!.r, twice.pieces[2]!.r], [1, 0], 'a wall flips between its two baked looks');
});

test('a new piece is centred on the cursor and snapped, unless placed free', () => {
  assert.deepEqual(placementAt('forklift', { x: 412, y: 391 }, 25, false), { p: 'forklift', x: 375, y: 325, r: 0 });
  assert.deepEqual(placementAt('forklift', { x: 412, y: 391 }, 25, true), { p: 'forklift', x: 375, y: 329, r: 0 });
});

test('resizing a spawn grows it from its corner and never below a cell', () => {
  const spawn = handlesOf(SMALL).find((h) => h.label === 'red spawn' && !h.twin)!;
  assert.deepEqual(resizeTo(SMALL, spawn, { x: 400, y: 900 }, 25).spawns.red, [{ x: 50, y: 500, w: 350, h: 400 }]);
  assert.deepEqual(resizeTo(SMALL, spawn, { x: 0, y: 0 }, 25).spawns.red, [{ x: 50, y: 500, w: 25, h: 25 }]);
  assert.equal(resizeTo(SMALL, pieceHandles(SMALL)[0]!, { x: 900, y: 900 }, 25), SMALL, 'a piece keeps its kit size');
});

test('a crate standing in a spawn is picked before the spawn, and a zone centre before both', () => {
  const handles = handlesOf(SMALL);
  assert.equal(pick(handles, { x: 620, y: 220 }, 30)?.label, 'Crate');
  assert.equal(pick(handles, { x: 700, y: 300 }, 30)?.label, 'ffa spawn');
  assert.equal(pick(handles, { x: 310, y: 290 }, 30)?.label, 'zone A');
  assert.equal(pick(handles, { x: 990, y: 10 }, 30), null);
});

test('removing keeps what a mode cannot run without', () => {
  assert.equal(remove(VAULT, { k: 'terminal' }), VAULT);
  assert.equal(remove(VAULT, { k: 'extract', side: 'attack', i: 0 }), VAULT);
  assert.equal(remove(SMALL, { k: 'piece', i: 0 }).pieces.length, 1);
  const added = addRegion(VAULT, { k: 'extract', side: 'attack' }, { x: 1610, y: 1590 }, 25);
  assert.deepEqual(added.file.extract!.attack.at(-1), { x: 1500, y: 1500, w: 200, h: 200 });
  assert.equal(remove(added.file, added.target).extract!.attack.length, 1);
});

test('undo and redo walk the edits, and a new edit drops the redo', () => {
  const a = SMALL, b = remove(a, { k: 'piece', i: 0 }), c = remove(b, { k: 'piece', i: 0 });
  let h = commit(commit(historyOf(a), b), c);
  assert.equal(commit(h, h.now), h, 'committing the same file is no edit');
  h = undo(undo(h));
  assert.equal(h.now, a);
  assert.equal(undo(h), h);
  h = redo(h);
  assert.equal(h.now, b);
  h = commit(h, a);
  assert.equal(redo(h), h);
});

test('an edited map saves in the stored format and loads back as edited', () => {
  const edited = rotatePiece(addPiece(WAREHOUSE, placementAt('forklift', { x: 1000, y: 1000 }, 25, false)).file, WAREHOUSE.pieces.length, 25, false);
  const text = serializeMapFile(edited);
  assert.deepEqual(parseMapFile(JSON.parse(text)), edited);
  assert.equal(serializeMapFile(parseMapFile(JSON.parse(text))), text);
});
