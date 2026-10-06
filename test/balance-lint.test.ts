import assert from 'node:assert/strict';
import { test } from 'node:test';
import { EVOLUTIONS, GUN_IDS, GUNS, type GunId } from '../src/shared/defs.ts';
import { doctrineBreaches, dominatedPairs, edgesOver, rangeBeyondView, type Pair } from '../scripts/lib/gunscore.ts';

const KNOWN_DOMINATED: readonly Pair[] = [];
const KNOWN_BEYOND_VIEW: readonly GunId[] = [];
const KNOWN_BREACHES: Partial<Record<GunId, readonly string[]>> = {
  lmg: ['aim@100', 'aim@300', 'aim@600', 'close'],
  bulldog: ['aim@300'],
  streetSweeper: ['aim@100'],
  heavyLmg: ['aim@100', 'aim@300', 'aim@600', 'aim@900', 'close'],
  minigun: ['aim@100', 'aim@300', 'aim@600', 'aim@900', 'close'],
  juggernaut: ['aim@100', 'aim@300', 'aim@600', 'aim@900', 'close'],
  twinMg: ['aim@100', 'aim@300', 'aim@600', 'close'],
};

const key = ([a, b]: Pair) => `${a} > ${b}`;

test('no gun beats another of its stage on every axis, beyond the known pairs, and every known pair still holds', () => {
  const found = ([0, 1, 2] as const).flatMap(dominatedPairs).map(key);
  const known = KNOWN_DOMINATED.map(key);
  assert.deepEqual(found.filter((k) => !known.includes(k)), [], 'newly dominated');
  assert.deepEqual(known.filter((k) => !found.includes(k)), [], 'fixed: remove from KNOWN_DOMINATED');
});

test('no gun outranges its owner\'s horizontal view, beyond the known guns, and every known gun still does', () => {
  const found = rangeBeyondView().map((o) => o.id);
  assert.deepEqual(found.filter((id) => !KNOWN_BEYOND_VIEW.includes(id)), [], 'newly beyond view');
  assert.deepEqual(KNOWN_BEYOND_VIEW.filter((id) => !found.includes(id)), [], 'fixed: remove from KNOWN_BEYOND_VIEW');
});

test('each of the two choices at an evolution leads the other by at least a fifth somewhere, so the pick is felt in play', () => {
  const bland = GUN_IDS.flatMap((parent) => {
    const [a, b] = EVOLUTIONS[parent];
    return a && b ? [[a, b], [b, a]].filter(([x, y]) => edgesOver(x!, y!).length === 0).map(([x, y]) => `${GUNS[x!].name} over ${GUNS[y!].name}`) : [];
  });
  assert.deepEqual(bland, []);
});

test('every gun keeps to its class doctrine against a person, beyond the known breaches, and every known breach still holds', () => {
  const found = doctrineBreaches();
  const known = Object.entries(KNOWN_BREACHES).flatMap(([id, rules]) => rules!.map((rule) => `${id} ${rule}`));
  const keys = found.map((b) => `${b.id} ${b.rule}`);
  assert.deepEqual(found.filter((b) => !known.includes(`${b.id} ${b.rule}`)).map((b) => `${GUNS[b.id].name} ${b.rule}: ${b.detail}`), [], 'new breaches');
  assert.deepEqual(known.filter((k) => !keys.includes(k)), [], 'fixed: remove from KNOWN_BREACHES');
});
