import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ARMORS, GUNS, LEVELS, pickOptions, WORLD } from '../src/shared/defs.ts';
import { step } from '../src/shared/sim.ts';
import { snapshotFor } from '../src/shared/sim/snapshot.ts';
import { damagePlayer } from '../src/shared/sim/combat.ts';
import { choosePick } from '../src/shared/sim/stats.ts';
import type { Player, World } from '../src/shared/sim/world.ts';
import { emptyWorld, equip, grantPerks, hpOf, press, run, shootOnce, spawnAt, TICK_MS } from './helpers.ts';

const pendingOf = (w: World, p: Player) => snapshotFor(w, p.id).self.pending;
const gunOf = (w: World, p: Player) => snapshotFor(w, p.id).players.find((v) => v.id === p.id)?.gun;

test('four kills and ten crates in one life open the ability pick', () => {
  const w = emptyWorld();
  const a = spawnAt(w, 500, 500);
  for (let i = 0; i < 4; i++) {
    const v = spawnAt(w, 650, 500);
    if (v.life.k === 'alive') v.life.hp = 1;
    shootOnce(w, a, 0);
    assert.equal(v.life.k, 'dead');
    w.players.delete(v.id);
  }
  press(w, a, { reload: true });
  run(w, GUNS.pistol.reloadMs + 100);
  press(w, a, {});
  for (let i = 0; i < 10; i++) {
    w.crates.push({ id: 900 + i, x: 600, y: 478, size: 44, hp: 1, respawnAt: null });
    shootOnce(w, a, 0);
  }
  assert.equal(a.score, 4 * WORLD.killScore + 10 * WORLD.crateScore);
  assert.ok(choosePick(w, a.id, 1, 'grip'));
  assert.ok(choosePick(w, a.id, 2, 'handCannon'));
  assert.ok(choosePick(w, a.id, 3, 'thickSkin'));
  assert.deepEqual(pendingOf(w, a), { level: 4, k: 'perk', tier: 3 }, 'the ability pick is open');
});

test('picks open in ladder order: perk, evolve, perk, ability, evolve', () => {
  const w = emptyWorld();
  const a = spawnAt(w, 500, 500);
  a.level = LEVELS.length - 1;
  const seen = [];
  for (let pending = pendingOf(w, a); pending; pending = pendingOf(w, a)) {
    seen.push(pending);
    assert.ok(choosePick(w, a.id, pending.level, pickOptions(pending, a.gun)[1]!));
    assert.ok(seen.length <= 5, 'the ladder runs out');
  }
  assert.deepEqual(seen, [
    { level: 1, k: 'perk', tier: 1 }, { level: 2, k: 'evolve' }, { level: 3, k: 'perk', tier: 2 }, { level: 4, k: 'perk', tier: 3 }, { level: 5, k: 'evolve' },
  ]);
  assert.equal(gunOf(w, a), 'hailstorm', 'pistol, then machine pistol, then its second branch');
});

test('a stale, duplicate or foreign pick changes nothing', () => {
  const w = emptyWorld();
  const a = spawnAt(w, 500, 500);
  a.level = 2;
  assert.equal(choosePick(w, a.id, 2, 'handCannon'), false, 'the evolve pick waits behind the open perk pick');
  assert.equal(choosePick(w, a.id, 1, 'shield'), false, 'a tier 2 perk does not fill tier 1');
  assert.equal(choosePick(w, a.id, 1, 'handCannon'), false, 'a gun does not fill a perk pick');
  assert.ok(choosePick(w, a.id, 1, 'grip'));
  assert.equal(choosePick(w, a.id, 1, 'optics'), false, 'a repeated pick for the same level');
  assert.deepEqual(snapshotFor(w, a.id).self.perks, { 1: 'grip' });
  assert.equal(choosePick(w, a.id, 2, 'executioner'), false, 'no skipping to stage 2');
  assert.equal(choosePick(w, a.id, 2, 'slugGun'), false, 'another class\'s branch');
  assert.ok(choosePick(w, a.id, 2, 'machinePistol'));
  assert.equal(choosePick(w, a.id, 2, 'handCannon'), false, 'a second evolve for the same level');
  assert.equal(gunOf(w, a), 'machinePistol');
  assert.equal(pendingOf(w, a), null);
});

test('evolving swaps in the new gun with its own stats and keeps the loaded share of the magazine', () => {
  const w = emptyWorld();
  const a = spawnAt(w, 500, 500);
  const target = spawnAt(w, 750, 500);
  a.level = 2;
  for (let i = 0; i < 6; i++) shootOnce(w, a, Math.PI, GUNS.pistol.fireMs);
  assert.ok(choosePick(w, a.id, 1, 'grip'));
  assert.ok(choosePick(w, a.id, 2, 'handCannon'));
  const self = snapshotFor(w, a.id).self;
  assert.deepEqual([self.ammo, self.mag], [GUNS.handCannon.mag / 2, GUNS.handCannon.mag], 'half a pistol magazine becomes half a hand cannon magazine');
  shootOnce(w, a, 0);
  assert.equal(WORLD.baseHp - hpOf(target), GUNS.handCannon.damage);
});

test('evolving during a reload neither finishes nor cancels it', () => {
  const w = emptyWorld();
  const a = spawnAt(w, 500, 500);
  a.level = 2;
  assert.ok(choosePick(w, a.id, 1, 'grip'));
  shootOnce(w, a, 0, GUNS.pistol.fireMs);
  press(w, a, { reload: true });
  step(w, TICK_MS);
  press(w, a, {});
  assert.ok(choosePick(w, a.id, 2, 'handCannon'));
  const mid = snapshotFor(w, a.id).self;
  assert.deepEqual([mid.reloading, mid.ammo], [true, Math.round((GUNS.handCannon.mag * (GUNS.pistol.mag - 1)) / GUNS.pistol.mag)]);
  run(w, GUNS.pistol.reloadMs + 100);
  assert.deepEqual([snapshotFor(w, a.id).self.reloading, snapshotFor(w, a.id).self.ammo], [false, GUNS.handCannon.mag], 'the reload completes into the new magazine');
});

test('a max-health perk keeps the share of health you had, not a free heal', () => {
  const w = emptyWorld();
  const a = spawnAt(w, 500, 500);
  a.level = 3;
  assert.ok(choosePick(w, a.id, 1, 'grip'));
  assert.ok(choosePick(w, a.id, 2, 'handCannon'));
  if (a.life.k === 'alive') a.life.hp = WORLD.baseHp / 2;
  assert.ok(choosePick(w, a.id, 3, 'thickSkin'));
  assert.equal(hpOf(a), (WORLD.baseHp + 30) / 2);
});

test('score is multiplied while your level trails the other living players\' average, and never when alone', () => {
  const scoreForOneKill = (myLevel: number, others: { level: number; alive: boolean }[]) => {
    const w = emptyWorld();
    const a = spawnAt(w, 500, 500);
    a.level = myLevel;
    others.forEach((o, i) => {
      const p = spawnAt(w, 500 + i * 100, 1500);
      p.level = o.level;
      if (!o.alive) p.life = { k: 'dead', respawnAt: Infinity };
    });
    const v = spawnAt(w, 650, 500);
    if (v.life.k === 'alive') v.life.hp = 1;
    shootOnce(w, a, 0);
    return a.score;
  };
  const boosted = Math.round(WORLD.killScore * WORLD.catchUpMul);
  assert.equal(scoreForOneKill(0, []), WORLD.killScore, 'alone');
  assert.equal(scoreForOneKill(0, [{ level: 2, alive: true }, { level: 1, alive: true }]), boosted, 'below an average of 1.5');
  assert.equal(scoreForOneKill(1, [{ level: 2, alive: true }, { level: 1, alive: true }]), boosted, 'still below');
  assert.equal(scoreForOneKill(2, [{ level: 2, alive: true }, { level: 1, alive: true }]), WORLD.killScore, 'above the average');
  assert.equal(scoreForOneKill(1, [{ level: 1, alive: true }]), WORLD.killScore, 'level with the average');
  assert.equal(scoreForOneKill(0, [{ level: 5, alive: false }, { level: 0, alive: true }]), WORLD.killScore, 'the dead do not count');
});

test('a round restart resets level, perks, ability and gun along with score', () => {
  const w = emptyWorld('TDM');
  const a = spawnAt(w, 500, 500, { team: 'red' });
  grantPerks(w, a, ['extended', 'thickSkin', 'dash']);
  press(w, a, { reload: true });
  run(w, GUNS.pistol.reloadMs + 100);
  press(w, a, {});
  a.score = 450;
  a.gun = 'hailstorm';
  w.teamScore.red = WORLD.tdmWinScore;
  run(w, TICK_MS);
  assert.equal(w.match.k, 'over');
  run(w, WORLD.roundRestartMs - 200);
  if (a.life.k === 'alive') a.life.lastDamageAt = w.now;
  assert.deepEqual([hpOf(a), snapshotFor(w, a.id).self.ammo], [WORLD.baseHp + 30, 18], 'thick skin health and an extended magazine before the restart');
  run(w, 300);
  const snap = snapshotFor(w, a.id);
  const view = snap.players.find((p) => p.id === a.id)!;
  assert.deepEqual([view.score, view.level, snap.self.perks, snap.self.pending, snap.self.ability, view.gun], [0, 0, {}, null, null, 'pistol']);
  assert.equal(view.maxHp, WORLD.baseHp);
  assert.deepEqual([view.hp, view.armor, snap.self.ammo, snap.self.reloading], [WORLD.baseHp, view.maxArmor, GUNS.pistol.mag, false], 'a fresh life');
});

test('a hurt, half-empty survivor starts the next round at full health, armor and ammo', () => {
  const w = emptyWorld('TDM');
  const a = spawnAt(w, 500, 500, { team: 'red', loadout: { armor: 'medium' } });
  if (a.life.k === 'alive') Object.assign(a.life, { hp: 10, armor: 5, ammo: 2 });
  w.teamScore.red = WORLD.tdmWinScore;
  run(w, TICK_MS);
  assert.equal(w.match.k, 'over');
  if (a.life.k === 'alive') a.life.lastDamageAt = Infinity;
  run(w, WORLD.roundRestartMs + 100);
  assert.equal(w.match.k, 'playing');
  const self = snapshotFor(w, a.id);
  const view = self.players.find((p) => p.id === a.id)!;
  assert.deepEqual([view.hp, view.armor, self.self.ammo], [WORLD.baseHp, ARMORS.medium.points, GUNS.pistol.mag]);
});

test('nothing in flight hurts a player once the round is over', () => {
  const w = emptyWorld('TDM');
  const a = spawnAt(w, 500, 500, { team: 'red' });
  const b = spawnAt(w, 1100, 500, { team: 'blue' });
  equip(a, 'artillery');
  press(w, a, { angle: 0, shots: a.input.shots + 1 });
  step(w, TICK_MS);
  w.teamScore.red = WORLD.tdmWinScore;
  step(w, TICK_MS);
  assert.equal(w.match.k, 'over');
  assert.ok(w.bullets.length > 0, 'the shell is still flying');
  run(w, 1000);
  assert.equal(hpOf(b), WORLD.baseHp);
});

test('another attacker who took 30% of the victim\'s health gets the assist score, and the kill names them', () => {
  const w = emptyWorld();
  const helper = spawnAt(w, 500, 500);
  const chipper = spawnAt(w, 500, 900);
  const killer = spawnAt(w, 900, 500);
  const victim = spawnAt(w, 700, 700);
  const hit = (p: Player, amount: number) => damagePlayer(w, victim, amount, { attacker: p, team: null, label: 'test', piercing: true, via: 'bullet', fromX: p.x, fromY: p.y });
  hit(helper, 30);
  hit(chipper, 29);
  hit(killer, 100);
  const k = w.events.find((e) => e.e === 'kill');
  assert.deepEqual(k?.e === 'kill' && k.assisters, [helper.id]);
  assert.deepEqual([helper.score, chipper.score, killer.score], [WORLD.assistScore, 0, WORLD.killScore]);
});
