/// <reference types="node" />
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { zoneCues, SOUNDS } from '../src/client/sfx.ts';
import { __test, drawZoneFloor, drawZoneOverlay, flagOf, forceZones, motionOf, zonesOf } from '../src/client/zoneart.ts';
import { TICK_MS } from '../src/client/interp.ts';
import type { PlayerView, Snapshot, ZoneView } from '../src/shared/protocol.ts';

const zone = (over: Partial<ZoneView> = {}): ZoneView => ({ id: 0, x: 1000, y: 1000, r: 180, owner: null, capturing: null, progress: 0, ...over });
const me = (over: Partial<PlayerView> = {}): PlayerView => ({
  id: 1, name: 'Me', x: 1000, y: 1000, angle: 0, hp: 100, maxHp: 100, color: 'red', gun: 'pistol',
  team: 'red', alive: true, hidden: false, shield: false, dashing: false, score: 0, level: 1, armorTier: 'none', kind: 'human', hunted: false, ...over,
});
const snap = (zones: ZoneView[], tick = 1, mine: Partial<PlayerView> = {}): Snapshot => ({
  t: 'snap', tick, ackSeq: 0,
  self: { id: 1, ammo: 12, mag: 12, speed: 300, reloading: false, reloadFrac: 0, perks: {}, pending: null, ability: null, abilityReadyIn: 0, alive: true, dash: null, respawnIn: 0, kills: 0, deaths: 0, viewRadius: 900, suppression: 0, streak: 0, nemesis: null },
  players: [me(mine)], bullets: [], crates: [], thrown: [], zones, minimap: [], leaderboard: [],
  match: { mode: 'DOM', map: 'market', nextMap: 'quarry', mapChangeIn: 0, teamScore: { red: 0, blue: 0 }, winner: null, restartIn: 0, roundEndsAt: null }, events: [],
} as unknown as Snapshot);
const ids = (a: ZoneView[], b: ZoneView[], o: { tick?: [number, number]; me?: Partial<PlayerView> } = {}) =>
  zoneCues(snap(a, o.tick?.[0]), snap(b, o.tick?.[1] ?? 2, o.me), 900).map((c) => c.id);

test('the flag climbs with a capture, comes down as a held point is neutralised, and flies at the top of a held one', () => {
  assert.deepEqual(flagOf(zone()), { team: null, height: 0 });
  assert.deepEqual(flagOf(zone({ capturing: 'red', progress: 0.3 })), { team: 'red', height: 0.3 });
  assert.deepEqual(flagOf(zone({ owner: 'blue' })), { team: 'blue', height: 1 });
  const lowering = flagOf(zone({ owner: 'blue', capturing: 'red', progress: 0.7 }));
  assert.equal(lowering.team, 'blue');
  assert.ok(Math.abs(lowering.height - 0.3) < 1e-9, 'the holder\'s flag is 70% of the way down');
});

test('motion: filling or draining from the progress, still when contested, at the crew rate', () => {
  assert.deepEqual(motionOf(zone({ capturing: 'red', progress: 0.4, crew: 3 }), 0.3), { dir: 1, rate: 2 });
  assert.deepEqual(motionOf(zone({ capturing: 'red', progress: 0.3 }), 0.4), { dir: -1, rate: 1 });
  assert.deepEqual(motionOf(zone({ capturing: 'red', progress: 0.3, contested: true }), 0.3), { dir: 0, rate: 0 });
  assert.equal(motionOf(zone({ capturing: 'red', progress: 0.3, crew: 9 }), 0.2).rate, 2.5);
});

test('forced zone states lay over the snapshot\'s real zones by id, for the dev captures', () => {
  const real = [zone({ id: 0 }), zone({ id: 1, x: 3000 })];
  forceZones([{ id: 1, owner: 'blue', capturing: 'red', progress: 0.5, crew: 2 }]);
  const shown = zonesOf(real);
  forceZones(null);
  assert.deepEqual(shown[0], real[0]);
  assert.deepEqual(shown[1], { ...real[1], owner: 'blue', capturing: 'red', progress: 0.5, crew: 2 });
  assert.equal(zonesOf(real), real, 'nothing forced, nothing copied');
});

test('zone sounds: a rising tick through your capture, a stinger for a point taken or lost, a buzz when it is contested', () => {
  const ticks = zoneCues(snap([zone({ capturing: 'red', progress: 0.28 })]), snap([zone({ capturing: 'red', progress: 0.31, crew: 1 })], 2), 900);
  assert.deepEqual(ticks.map((c) => c.id), ['zone:tick']);
  const higher = zoneCues(snap([zone({ capturing: 'red', progress: 0.78 })]), snap([zone({ capturing: 'red', progress: 0.81, crew: 1 })], 2), 900);
  assert.ok(higher[0]!.pitch! > ticks[0]!.pitch!, 'the tick climbs with the capture');
  assert.deepEqual(ids([zone({ capturing: 'red', progress: 0.31 })], [zone({ capturing: 'red', progress: 0.32 })]), [], 'one tick a tenth');
  assert.deepEqual(ids([zone({ capturing: 'red', progress: 0.28 })], [zone({ capturing: 'red', progress: 0.31 })], { me: { x: 3000 } }), [], 'no tick off the point');
  assert.deepEqual(ids([zone({ capturing: 'red', progress: 0.98 })], [zone({ owner: 'red' })]), ['zone:taken']);
  assert.deepEqual(ids([zone({ owner: 'red' })], [zone({ capturing: 'blue', progress: 0 })]), ['zone:lost'], 'yours turned neutral');
  assert.deepEqual(ids([zone({ capturing: 'blue', progress: 0.98 })], [zone({ owner: 'blue' })]), ['zone:lost'], 'the enemy takes a point');
  assert.deepEqual(ids([zone({ owner: 'blue', capturing: 'red', progress: 0.98 })], [zone({ capturing: 'red', progress: 0 })]), ['zone:taken'], 'you turn theirs neutral');
  assert.deepEqual(ids([zone({ capturing: 'red', progress: 0.4 })], [zone({ capturing: 'red', progress: 0.4, contested: true })]), ['zone:contest']);
  const buzzAt = 1200 / TICK_MS;
  assert.deepEqual(ids([zone({ capturing: 'red', progress: 0.4, contested: true })], [zone({ capturing: 'red', progress: 0.4, contested: true })], { tick: [buzzAt - 1, buzzAt] }), ['zone:contest'], 'the buzz repeats while you stand in it');
  assert.deepEqual(ids([zone({ capturing: 'red', progress: 0.4, contested: true })], [zone({ capturing: 'red', progress: 0.4, contested: true })], { tick: [buzzAt + 1, buzzAt + 2] }), []);
  assert.notDeepEqual(SOUNDS['zone:taken'], SOUNDS['zone:lost']);
});

/** A canvas that only counts the calls made on it. */
function countingCtx() {
  const calls: Record<string, number> = {};
  const ctx = new Proxy({}, {
    get: (_, k: string) => (k === 'canvas' ? { id: 'test' } : (...a: unknown[]) => { calls[k] = (calls[k] ?? 0) + 1; return k === 'measureText' ? { width: 20 } : undefined; }),
    set: () => true,
  }) as unknown as CanvasRenderingContext2D;
  return { ctx, calls };
}

test('a change of hands throws a burst (ring pulse and confetti) that is gone a little over a second later', () => {
  __test.reset();
  const draw = (z: ZoneView, now: number) => { const c = countingCtx(); drawZoneFloor(c.ctx, z, now, 1, false); drawZoneOverlay(c.ctx, z, 0, now, 1, false); return c.calls; };
  draw(zone({ capturing: 'red', progress: 0.97, crew: 2 }), 1000);
  const still = draw(zone({ capturing: 'red', progress: 0.98, crew: 2 }), 1016);
  draw(zone({ owner: 'red' }), 1032);
  const burst = draw(zone({ owner: 'red' }), 1300);
  assert.ok((burst.fillRect ?? 0) >= (still.fillRect ?? 0) + 60, `confetti drawn (${burst.fillRect} rects vs ${still.fillRect})`);
  assert.ok(__test.fx(0)!.burst?.taken, 'a capture, not a neutralise');
  const after = draw(zone({ owner: 'red' }), 2600);
  assert.equal(__test.fx(0)!.burst, null);
  assert.ok((after.fillRect ?? 0) < (burst.fillRect ?? 0));
  const first = (__test.reset(), draw(zone({ owner: 'blue' }), 5000));
  assert.equal(__test.fx(0)!.burst, null, 'no burst for a point already held when first seen');
  void first;
});
