import assert from 'node:assert/strict';
import { test } from 'node:test';
import { FEEL, GUNS, WORLD, type GunId } from '../src/shared/defs.ts';
import { step } from '../src/shared/sim.ts';
import { damagePlayer } from '../src/shared/sim/combat.ts';
import { snapshotFor } from '../src/shared/sim/snapshot.ts';
import { CALM, shakenOf, spreadFor } from '../src/shared/sim/stats.ts';
import type { Player, World } from '../src/shared/sim/world.ts';
import { emptyWorld, equip, hpOf, press, run, setWalls, spawnAt, TICK_MS } from './helpers.ts';
import type { GameEvent } from '../src/shared/protocol.ts';

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

test('being hit shakes your aim: the flinch shows on your view, widens your spread, and drains within its time', () => {
  const w = emptyWorld();
  const b = spawnAt(w, 500, 500, { loadout: { weapon: 'assault' } });
  const calm = spreadFor('assault', {}, true);
  heavyHit(w, b, 20);
  const shaken = snapshotFor(w, b.id).self;
  assert.ok(shaken.flinch !== undefined && shaken.flinch > 0.5 && shaken.flinch < 1, `a fifth of your health flinches you most of the way (${shaken.flinch})`);
  assert.ok(Math.abs(spreadFor('assault', {}, true, 0, { ...CALM, flinch: shaken.flinch }) - calm * (1 + FEEL.flinch.spreadAdd * shaken.flinch)) < 1e-12);
  run(w, FEEL.flinch.ms);
  assert.equal(snapshotFor(w, b.id).self.flinch, undefined, 'gone once it drains');
});

test('flinch is bounded: however many hits land, it tops out and drains as fast as one full flinch', () => {
  const w = emptyWorld();
  const b = spawnAt(w, 500, 500, { kind: 'human' });
  for (let i = 0; i < 12; i++) heavyHit(w, b, 30);
  assert.ok(b.life.k === 'alive');
  assert.equal(shakenOf(b.life, w.now).flinch, 1);
  run(w, FEEL.flinch.ms);
  assert.equal(shakenOf(b.life, w.now).flinch, 0, 'a dozen hits drain as fast as one');
  const worst = spreadFor('assault', {}, false, 99, { ...CALM, flinch: 1 });
  assert.ok(worst <= spreadFor('assault', {}, false, 99) * (1 + FEEL.shakenMaxAdd) + 1e-12, 'spread within the cap');
});

test('the server fires a flinched shooter\'s rounds with the wider spread the view reports', () => {
  const deviations = (flinched: boolean) => {
    const w = emptyWorld();
    const a = spawnAt(w, 500, 500, { loadout: { weapon: 'sniper' }, kind: 'human' });
    const out: number[] = [];
    for (let i = 0; i < 40 && a.life.k === 'alive'; i++) {
      a.life.nextFireAt = 0;
      a.life.ammo = 5;
      if (flinched) a.life.flinchUntil = w.now + 2 * FEEL.flinch.ms;
      const before = new Set(w.bullets.map((x) => x.id));
      fire(w, a);
      for (const x of w.bullets) if (!before.has(x.id)) out.push(Math.abs(Math.atan2(x.vy, x.vx)));
    }
    return out;
  };
  const calm = spreadFor('sniper', {}, true);
  const steady = deviations(false), shaken = deviations(true);
  assert.ok(steady.length >= 30 && shaken.length >= 30);
  assert.ok(Math.max(...steady) <= calm + 1e-9, 'calm rounds stay inside the calm cone');
  assert.ok(Math.max(...shaken) > calm, 'flinched rounds leave it');
  assert.ok(Math.max(...shaken) <= calm * (1 + FEEL.flinch.spreadAdd) + 1e-9, 'and stay inside the flinched cone');
});

/** A sniper at (500, 500) firing east past a person standing `offset` px off its line, 300 px out, on `team`s of the caller's choosing. */
function nearMiss(offset: number, teams: { shooter?: 'red' | 'blue'; target?: 'red' | 'blue' } = {}, mode: 'FFA' | 'TDM' = 'FFA') {
  const w = emptyWorld(mode);
  const a = spawnAt(w, 500, 500, { loadout: { weapon: 'sniper' }, team: teams.shooter ?? null });
  const b = spawnAt(w, 800, 500 + offset, { kind: 'human', team: teams.target ?? null });
  const events: GameEvent[] = [];
  fire(w, a);
  const firedAt = w.now;
  events.push(...w.events);
  for (let t = 0; t < 300; t += TICK_MS) { step(w, TICK_MS); events.push(...w.events); }
  return { w, a, b, firedAt, whizzes: events.filter((e): e is Extract<GameEvent, { e: 'whizz' }> => e.e === 'whizz') };
}

test('an enemy round passing close without hitting suppresses you and raises one whizz where it passed nearest', () => {
  const { b, firedAt, whizzes } = nearMiss(55);
  assert.ok(b.life.k === 'alive' && hpOf(b) === 400, 'it missed');
  assert.equal(whizzes.length, 1);
  const [z] = whizzes;
  assert.equal(z!.victim, b.id);
  assert.ok(Math.abs(z!.x - b.x) < 1 && Math.abs(z!.y - 500) < 6, `passed nearest at (${z!.x.toFixed(1)}, ${z!.y.toFixed(1)})`);
  assert.ok(Math.abs(z!.dir) < 0.02, 'flying east');
  const passedAt = b.life.suppressedUntil - FEEL.suppression.perPassMs;
  assert.ok(passedAt >= firedAt && passedAt <= firedAt + 200, `one pass adds its share of suppression as the round goes by (at ${passedAt - firedAt}ms)`);
});

test('no suppression from a round that passes wide, one that hits, or a teammate\'s', () => {
  assert.equal(nearMiss(110).whizzes.length, 0, 'wide of the reach');
  const hit = nearMiss(0);
  assert.ok(hpOf(hit.b) < 400 && hit.whizzes.length === 0 && hit.b.life.k === 'alive' && hit.b.life.suppressedUntil === -Infinity, 'a hit flinches instead');
  const mate = nearMiss(55, { shooter: 'red', target: 'red' }, 'TDM');
  assert.equal(mate.whizzes.length, 0, 'a teammate\'s round');
  assert.ok(mate.b.life.k === 'alive' && mate.b.life.suppressedUntil === -Infinity);
  assert.equal(nearMiss(55, { shooter: 'red', target: 'blue' }, 'TDM').whizzes.length, 1, 'an enemy team\'s round does');
});

test('a stream of near misses builds suppression to full, widens spread, is told only to its victim a few times a second, then drains', () => {
  const w = emptyWorld();
  const a = spawnAt(w, 500, 500, { loadout: { weapon: 'lmg' } });
  equip(a, 'minigun');
  const b = spawnAt(w, 800, 560, { kind: 'human' });
  const bystander = spawnAt(w, 700, 800);
  let mine = 0, theirs = 0;
  press(w, a, { angle: 0, fire: true });
  for (let t = 0; t < 2000; t += TICK_MS) {
    if (a.life.k === 'alive') a.life.spin = 1;
    step(w, TICK_MS);
    mine += snapshotFor(w, b.id, w.events).events.filter((e) => e.e === 'whizz').length;
    theirs += snapshotFor(w, bystander.id, w.events).events.filter((e) => e.e === 'whizz').length;
  }
  assert.ok(b.life.k === 'alive' && hpOf(b) === 400, 'every round missed');
  const level = snapshotFor(w, b.id).self.suppression ?? 0;
  assert.ok(level > 0.99, `fully suppressed (${level})`);
  assert.ok(Math.abs(spreadFor('pistol', {}, true, 0, { ...CALM, suppression: level }) - spreadFor('pistol', {}, true) * (1 + FEEL.suppression.spreadAdd * level)) < 1e-12, 'spread grows by its share');
  assert.ok(mine >= 4 && mine <= Math.ceil(2000 / FEEL.suppression.whizzGapMs) + 1, `${mine} whizzes in 2s`);
  assert.equal(theirs, 0, 'a bystander hears of none');
  press(w, a, { angle: 0 });
  run(w, FEEL.suppression.ms + 500);
  assert.equal(snapshotFor(w, b.id).self.suppression, undefined, 'drained once the fire stopped');
});
