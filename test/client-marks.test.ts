/// <reference types="node" />
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { add, boomMarks, brokeMarks, clear, createRing, FADE, markAt, marksOf, visible, type Mark } from '../src/client/world/marks.ts';

const at = (born: number, rest: Partial<Mark> = {}): Mark =>
  ({ sprite: 'decal.scorch', frame: 0, x0: born, y0: 0, x: born, y: 0, turn0: 0, turn: 0, hop: 0, born, flyMs: 0, scale: 1, alpha: 1, tint: 0xffffff, ...rest });

/** A fixed stream, so two calls with the same seed lay the same marks. */
function seeded(seed: number) {
  let s = seed;
  return () => ((s = (s * 16807) % 2147483647) - 1) / 2147483646;
}

test('a full ring recycles its oldest marks first', () => {
  const ring = createRing(5);
  for (let i = 1; i <= 7; i++) add(ring, at(i));
  assert.deepEqual(visible(ring, 5, 100).map((p) => p.m.born), [7, 6, 5, 4, 3]);
});

test('a smaller budget draws only the newest marks and fades the oldest of them out', () => {
  const ring = createRing(400);
  for (let i = 1; i <= 50; i++) add(ring, at(i));
  const drawn = visible(ring, 20, 100);
  assert.deepEqual(drawn.map((p) => p.m.born), Array.from({ length: 20 }, (_, i) => 50 - i));
  assert.equal(drawn[0]!.alpha, 1);
  assert.ok(drawn.at(-1)!.alpha < drawn[20 - FADE.ranks]!.alpha, 'the oldest drawn mark is the faintest');
});

test('marks under the budget are drawn at full strength', () => {
  const ring = createRing(400);
  for (let i = 1; i <= 10; i++) add(ring, at(i));
  assert.ok(visible(ring, 20, 100).every((p) => p.alpha === 1));
});

test('a ring with a lifetime retires old marks and fades them before they go', () => {
  const ring = createRing(10, 10_000);
  add(ring, at(0));
  add(ring, at(5000));
  assert.deepEqual(visible(ring, 10, 11_000).map((p) => p.m.born), [5000]);
  const [fading] = visible(ring, 10, 14_000);
  assert.ok(fading!.alpha > 0 && fading!.alpha < 1);
});

test('clearing a ring drops every mark', () => {
  const ring = createRing(4);
  add(ring, at(1));
  clear(ring);
  assert.deepEqual(visible(ring, 4, 10), []);
});

test('a thrown mark flies from where it started, hops, and lies still where it lands', () => {
  const m = at(0, { x0: 0, x: 100, hop: 20, flyMs: 400 });
  assert.deepEqual([markAt(m, 0).x, markAt(m, 0).flying], [0, true]);
  assert.ok(markAt(m, 200).lift > 0);
  assert.deepEqual(markAt(m, 400), markAt(m, 9000));
  assert.deepEqual([markAt(m, 400).x, markAt(m, 400).lift, markAt(m, 400).flying], [100, 0, false]);
});

test('a broken crate leaves a plank pile where it stood and flings planks around it', () => {
  const marks = brokeMarks('crate', { x: 100, y: 200, w: 50, h: 50 }, 0, seeded(3));
  const [pile, ...bits] = marks;
  assert.deepEqual([pile!.sprite, pile!.x, pile!.y, pile!.flyMs], ['decal.planks', 125, 225, 0]);
  assert.ok(bits.length >= 5 && bits.every((b) => b.sprite === 'fx.plank' && b.flyMs > 0 && b.x0 === 125));
  assert.ok(bits.every((b) => Math.hypot(b.x - 125, b.y - 225) > 10), 'every plank lands away from the pile');
});

test('a broken supply drop leaves scrap, not planks', () => {
  assert.equal(brokeMarks('crate.drop', { x: 0, y: 0, w: 75, h: 75 }, 0, seeded(3))[0]!.sprite, 'decal.scrap');
});

test('a blast scorches less floor than it reaches and chips only concrete walls in reach', () => {
  const walls = [
    { x: 150, y: -50, w: 25, h: 100, material: 'concrete' },
    { x: -175, y: -50, w: 25, h: 100, material: 'wood' },
    { x: 0, y: 500, w: 100, h: 25, material: 'concrete' },
  ];
  const [scorch, ...rest] = boomMarks(0, 0, 200, walls, 0, seeded(7));
  assert.equal(scorch!.sprite, 'decal.scorch');
  assert.ok(scorch!.scale * 140 <= 200);
  assert.ok(rest.length > 0);
  assert.ok(rest.every((m) => m.x0 >= 140 && m.x0 <= 150), 'everything else comes off the near concrete wall');
});

test('the same launch values give the same marks', () => {
  const fx = { kind: 'broke', piece: 'crate.big', x: 10, y: 10, w: 75, h: 75, born: 50 } as const;
  assert.deepEqual(marksOf(fx, [], seeded(9)), marksOf(fx, [], seeded(9)));
});

test('every shot ejects one casing and lays nothing on the floor', () => {
  const left = marksOf({ kind: 'flash', gun: 'shotgun', owner: 1, x: 0, y: 0, angle: 0, born: 0 }, [], seeded(1));
  assert.deepEqual([left.floor.length, left.casings.length, left.casings[0]!.sprite], [0, 1, 'fx.casing']);
});
