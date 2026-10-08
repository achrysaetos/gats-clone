import assert from 'node:assert/strict';
import { test } from 'node:test';
import { FEEL, GUNS, WORLD, type GunId } from '../src/shared/defs.ts';
import { step } from '../src/shared/sim.ts';
import { damagePlayer } from '../src/shared/sim/combat.ts';
import { snapshotFor } from '../src/shared/sim/snapshot.ts';
import type { Player, World } from '../src/shared/sim/world.ts';
import { emptyWorld, equip, press, run, setWalls, spawnAt, TICK_MS } from './helpers.ts';

const R = WORLD.playerRadius;

/** A shooter at (500, 500) with `gun` and a person `gap` px east of it, standing still. */
function duel(gun: GunId, gap: number, w: World = emptyWorld()): { w: World; a: Player; b: Player } {
  const a = spawnAt(w, 500, 500, { loadout: { weapon: GUNS[gun].base } });
  equip(a, gun);
  const b = spawnAt(w, 500 + gap, 500, { kind: 'human' });
  return { w, a, b };
}

function fire(w: World, a: Player, angle = 0) {
  press(w, a, { angle, fire: true, shots: a.input.shots + 1 });
  step(w, TICK_MS);
  press(w, a, { angle });
}

/** How far one shot from `gun` at `gap` px moves its target, once the shove has played out. */
function pushOf(gun: GunId, gap: number): number {
  const { w, a, b } = duel(gun, gap);
  const x0 = b.x;
  fire(w, a);
  run(w, 400);
  assert.ok(b.life.k === 'alive', 'the target lived through it');
  return b.x - x0;
}

test('a point-blank shotgun blast throws its target back along the shot, by up to the cap', () => {
  const push = pushOf('shotgun', 60);
  assert.ok(push > 30, `pushed ${push.toFixed(1)}px`);
  assert.ok(push <= FEEL.knockback.maxPx + 1e-9, `no further than the cap (${push.toFixed(1)}px)`);
});

test('knockback falls off with range and with gun: a far blast and a sniper round push less, an SMG round not at all', () => {
  const close = pushOf('shotgun', 60), far = pushOf('shotgun', 230), sniper = pushOf('sniper', 300), smg = pushOf('smg', 100), rifle = pushOf('assault', 200);
  assert.ok(far < close / 2, `a blast near its range pushes ${far.toFixed(1)}px against ${close.toFixed(1)}px point blank`);
  assert.ok(sniper > 5 && sniper < close, `a sniper round pushes ${sniper.toFixed(1)}px`);
  assert.ok(rifle > 0 && rifle < 3, `a rifle round nudges ${rifle.toFixed(2)}px`);
  assert.equal(smg, 0, 'an SMG round never moves its target');
});

test('a shove never carries its target into or through a wall, however many blasts land', () => {
  const w = emptyWorld();
  const { a, b } = duel('shotgun', 60, w);
  setWalls(w, [{ x: b.x + R, y: 300, w: 6, h: 400 }]);
  let furthest = -Infinity;
  for (let shot = 0; shot < 2; shot++) {
    if (a.life.k === 'alive') a.life.nextFireAt = 0;
    fire(w, a);
    for (let t = 0; t < 300; t += TICK_MS) { step(w, TICK_MS); furthest = Math.max(furthest, b.x); }
  }
  assert.ok(b.life.k === 'alive', 'the target lived');
  assert.ok(furthest <= w.walls[0]!.x - R + 1e-6, `stayed this side of the wall (furthest x ${furthest})`);
});

test('a shove pushes along the round\'s flight, so a blast from the north drives its target south', () => {
  const w = emptyWorld();
  const a = spawnAt(w, 500, 500, { loadout: { weapon: 'shotgun' } });
  const b = spawnAt(w, 500, 560, { kind: 'human' });
  fire(w, a, Math.PI / 2);
  run(w, 400);
  assert.ok(b.y - 560 > 30, `pushed south ${(b.y - 560).toFixed(1)}px`);
  assert.ok(Math.abs(b.x - 500) < 6, `barely sideways (${(b.x - 500).toFixed(1)}px)`);
});

/** A heavy round from the west landing on `b` now, as a sniper's would. */
const heavyHit = (w: World, b: Player, damage = GUNS.sniper.damage) =>
  damagePlayer(w, b, damage, { attacker: null, team: null, label: 'test', piercing: false, via: 'bullet', fromX: b.x - 300, fromY: b.y, hit: { x: b.x - R, y: b.y, dir: 0 }, round: { gun: 'sniper', travelled: 300, range: GUNS.sniper.range } });

test('a sniper round slows its target\'s walk for a moment, and everyone sees the stagger', () => {
  const w = emptyWorld();
  const watcher = spawnAt(w, 300, 300);
  const b = spawnAt(w, 500, 700, { kind: 'human' });
  press(w, b, { down: true });
  step(w, TICK_MS);
  const y0 = b.y;
  step(w, TICK_MS);
  const stride = b.y - y0;
  heavyHit(w, b);
  assert.equal(snapshotFor(w, watcher.id).players.find((p) => p.id === b.id)?.staggered, true, 'others see the stagger');
  const y1 = b.y;
  step(w, TICK_MS);
  assert.ok(Math.abs(b.y - y1 - stride * FEEL.stagger.speedMul) < 1e-6, `walked ${(b.y - y1).toFixed(2)}px against a stride of ${stride.toFixed(2)}`);
  run(w, FEEL.stagger.ms);
  const y2 = b.y;
  step(w, TICK_MS);
  assert.ok(Math.abs(b.y - y2 - stride) < 1e-6, 'back to full pace once it wears off');
  assert.equal(snapshotFor(w, watcher.id).players.find((p) => p.id === b.id)?.staggered, undefined);
});

test('only a heavy hit staggers: a point-blank blast does, a far one and an SMG burst do not', () => {
  const staggers = (gun: GunId, gap: number, shots = 1) => {
    const { w, a, b } = duel(gun, gap);
    let seen = false;
    for (let i = 0; i < shots; i++) {
      if (a.life.k === 'alive') a.life.nextFireAt = 0;
      fire(w, a);
      for (let t = 0; t < 100; t += TICK_MS) { seen ||= b.life.k === 'alive' && b.life.staggerUntil > w.now; step(w, TICK_MS); }
    }
    return seen;
  };
  assert.ok(staggers('shotgun', 60), 'a point-blank blast staggers');
  assert.ok(!staggers('shotgun', 260), 'a blast near its range does not');
  assert.ok(!staggers('smg', 100, 8), 'SMG rounds never do');
  assert.ok(staggers('handCannon', 200), 'a hand cannon round does');
});

test('heavy hits every tick never stun-lock: each stagger is followed by a stretch at full pace', () => {
  const w = emptyWorld();
  const b = spawnAt(w, 500, 500, { kind: 'human' });
  const staggered: boolean[] = [];
  for (let t = 0; t < 4000; t += TICK_MS) {
    if (b.life.k !== 'alive') break;
    b.life.hp = 1e9;
    heavyHit(w, b);
    staggered.push(b.life.staggerUntil > w.now);
    step(w, TICK_MS);
  }
  assert.equal(staggered.length, Math.ceil(4000 / TICK_MS), 'the target stood through it all');
  const share = staggered.filter(Boolean).length / staggered.length;
  assert.ok(share > 0.15 && share <= FEEL.stagger.ms / FEEL.stagger.immuneMs + 0.05, `staggered ${(share * 100).toFixed(0)}% of the time`);
  const gaps: number[] = [];
  staggered.forEach((on, i) => { if (!on && staggered[i - 1]) gaps.push(0); if (!on && gaps.length) gaps[gaps.length - 1]!++; });
  gaps.pop();
  assert.ok(gaps.length >= 3 && gaps.every((n) => n * TICK_MS >= FEEL.stagger.immuneMs - FEEL.stagger.ms - TICK_MS), `full-pace stretches between staggers: ${gaps.map((n) => Math.round(n * TICK_MS))}ms`);
});
