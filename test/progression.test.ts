import assert from 'node:assert/strict';
import { test } from 'node:test';
import { GUNS, LEVELS, MEDAL_RULES, MEDALS, pickOptions, WORLD } from '../src/shared/defs.ts';
import { step } from '../src/shared/sim.ts';
import { snapshotFor } from '../src/shared/sim/snapshot.ts';
import { damagePlayer } from '../src/shared/sim/combat.ts';
import { choosePick } from '../src/shared/sim/stats.ts';
import type { Player, World } from '../src/shared/sim/world.ts';
import { emptyWorld, equip, grantPerks, hpOf, offerPerks, press, run, shootOnce, spawnAt, TICK_MS } from './helpers.ts';

const pendingOf = (w: World, p: Player) => snapshotFor(w, p.id).self.pending;
const gunOf = (w: World, p: Player) => snapshotFor(w, p.id).players.find((v) => v.id === p.id)?.gun;

test('four quick kills and ten crates in one life open the attachment and the first evolve, the evolve offered first', () => {
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
  // The second kill from the pistol's first magazine is a Double Tap as well.
  const medals = ['firstBlood', 'doubleKill', 'doubleTap', 'tripleKill', 'onFire', 'quadKill'] as const;
  assert.equal(a.score, 4 * WORLD.killScore + medals.reduce((s, m) => s + MEDALS[m].score, 0) + 10 * WORLD.crateScore, 'four quick kills earn their medals too');
  assert.equal(a.level, 2, 'past the first evolve, short of the tier-2 perk');
  assert.deepEqual(pendingOf(w, a), { level: 2, k: 'evolve' }, 'the evolve comes before the unchosen attachment');
  assert.ok(choosePick(w, a.id, 2, 'handCannon'));
  assert.deepEqual(pendingOf(w, a), { level: 1, k: 'perk', tier: 1 }, 'then the attachment');
  assert.ok(choosePick(w, a.id, 1, 'lightweight'));
  assert.equal(pendingOf(w, a), null);
});

test('a life of bare kills, with only the streak medals, opens its picks at kills 3, 5, 8, 10 and 12; medals bring them sooner', () => {
  const w = emptyWorld();
  w.firstBlood = true;
  const a = spawnAt(w, 500, 500);
  const reachedAt: number[] = [];
  for (let kill = 1; kill <= 12; kill++) {
    w.now += MEDAL_RULES.multiMs + 1;
    const v = spawnAt(w, 700, 500);
    // No gun on the blow, so no weapon feat; spaced past the multi-kill window, from mid range, at full health.
    damagePlayer(w, v, 10_000, { attacker: a, team: null, label: 'test', piercing: true, via: 'bullet', fromX: a.x, fromY: a.y });
    w.players.delete(v.id);
    while (reachedAt.length < a.level) reachedAt.push(kill);
  }
  assert.deepEqual(reachedAt, [3, 5, 8, 10, 12]);
  assert.ok(LEVELS[2]!.score > 3 * WORLD.killScore, 'the first evolve takes more than three bare kills');
});

test('picks open in ladder order: attachment, evolve, perk, ability, evolve', () => {
  const w = emptyWorld();
  const a = spawnAt(w, 500, 500);
  const seen = [];
  for (let level = 1; level < LEVELS.length; level++) {
    a.level = level;
    const pending = pendingOf(w, a);
    assert.ok(pending, `level ${level} opens a pick`);
    seen.push(pending);
    assert.ok(choosePick(w, a.id, pending.level, pickOptions(pending, a.gun)[1]!));
    assert.equal(pendingOf(w, a), null, 'one pick per level');
  }
  assert.deepEqual(seen, [
    { level: 1, k: 'perk', tier: 1 }, { level: 2, k: 'evolve' }, { level: 3, k: 'perk', tier: 2, offer: a.tier2Offer }, { level: 4, k: 'perk', tier: 3 }, { level: 5, k: 'evolve' },
  ]);
  assert.equal(gunOf(w, a), 'hailstorm', 'pistol, then machine pistol, then its second branch');
});

test('no pick is offered or taken during the round-end ceasefire, since the restart wipes it', () => {
  const w = emptyWorld();
  const a = spawnAt(w, 500, 500);
  a.level = 2;
  assert.deepEqual(pendingOf(w, a), { level: 2, k: 'evolve' }, 'open while the round plays');
  w.match = { k: 'over', winner: { name: a.name, id: a.id, note: null }, restartAt: w.now + WORLD.roundRestartMs };
  assert.equal(pendingOf(w, a), null, 'the dock has nothing to show');
  assert.equal(choosePick(w, a.id, 2, 'handCannon'), false, 'a pick sent from an older snapshot is refused');
  assert.equal(a.gun, 'pistol');
  assert.deepEqual(a.perks, {});
});

test('a stale, duplicate or foreign pick changes nothing', () => {
  const w = emptyWorld();
  const a = spawnAt(w, 500, 500);
  a.level = 2;
  assert.equal(choosePick(w, a.id, 1, 'lightweight'), false, 'the attachment pick waits behind the open evolve pick');
  assert.equal(choosePick(w, a.id, 2, 'shield'), false, 'a perk does not fill a gun pick');
  assert.equal(choosePick(w, a.id, 2, 'lightweight'), false, 'an attachment does not fill a gun pick');
  assert.equal(choosePick(w, a.id, 2, 'executioner'), false, 'no skipping to stage 2');
  assert.equal(choosePick(w, a.id, 2, 'slugGun'), false, 'another class\'s branch');
  assert.ok(choosePick(w, a.id, 2, 'machinePistol'));
  assert.equal(choosePick(w, a.id, 2, 'handCannon'), false, 'a second evolve for the same level');
  assert.equal(gunOf(w, a), 'machinePistol');
  offerPerks(a, 'shield');
  assert.equal(choosePick(w, a.id, 1, 'shield'), false, 'a tier 2 perk does not fill tier 1');
  assert.equal(choosePick(w, a.id, 1, 'handCannon'), false, 'a gun does not fill a perk pick');
  assert.ok(choosePick(w, a.id, 1, 'lightweight'));
  assert.equal(choosePick(w, a.id, 1, 'optics'), false, 'a repeated pick for the same level');
  assert.deepEqual(snapshotFor(w, a.id).self.perks, { 1: 'lightweight' });
  assert.equal(pendingOf(w, a), null);
  a.level = 5;
  assert.deepEqual(pendingOf(w, a), { level: 5, k: 'evolve' }, 'an evolve reached while perks are still unchosen is offered first');
  assert.equal(choosePick(w, a.id, 3, 'shield'), false, 'the perk waits behind it');
  assert.ok(choosePick(w, a.id, 5, 'hailstorm'));
  assert.deepEqual(pendingOf(w, a), { level: 3, k: 'perk', tier: 2, offer: a.tier2Offer }, 'then the perks, in ladder order');
});

test('evolving swaps in the new gun with its own stats and keeps the loaded share of the magazine', () => {
  const w = emptyWorld();
  const a = spawnAt(w, 500, 500);
  const target = spawnAt(w, 750, 500);
  a.level = 2;
  for (let i = 0; i < 6; i++) shootOnce(w, a, Math.PI, GUNS.pistol.fireMs);
  assert.ok(choosePick(w, a.id, 2, 'handCannon'));
  assert.ok(choosePick(w, a.id, 1, 'lightweight'));
  const self = snapshotFor(w, a.id).self;
  assert.deepEqual([self.ammo, self.mag], [GUNS.handCannon.mag / 2, GUNS.handCannon.mag], 'half a pistol magazine becomes half a hand cannon magazine');
  shootOnce(w, a, 0);
  assert.equal(WORLD.baseHp - hpOf(target), GUNS.handCannon.damage);
});

test('evolving during a reload neither finishes nor cancels it', () => {
  const w = emptyWorld();
  const a = spawnAt(w, 500, 500);
  a.level = 2;
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
  offerPerks(a, 'thickSkin');
  assert.ok(choosePick(w, a.id, 2, 'handCannon'));
  assert.ok(choosePick(w, a.id, 1, 'lightweight'));
  if (a.life.k === 'alive') a.life.hp = WORLD.baseHp / 2;
  assert.ok(choosePick(w, a.id, 3, 'thickSkin'));
  assert.equal(hpOf(a), (WORLD.baseHp + 40) / 2);
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
    w.firstBlood = true;
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
  assert.deepEqual([hpOf(a), snapshotFor(w, a.id).self.ammo], [WORLD.baseHp + 40, 18], 'thick skin health and an extended magazine before the restart');
  run(w, 300);
  const snap = snapshotFor(w, a.id);
  const view = snap.players.find((p) => p.id === a.id)!;
  assert.deepEqual([view.score, view.level, snap.self.perks, snap.self.pending, snap.self.ability, view.gun], [0, 0, {}, null, null, 'pistol']);
  assert.equal(view.maxHp, WORLD.baseHp);
  assert.deepEqual([view.hp, snap.self.ammo, snap.self.reloading], [WORLD.baseHp, GUNS.pistol.mag, false], 'a fresh life');
});

test('a round restart records each survivor\'s life so far, and their next life counts only its own kills', () => {
  const w = emptyWorld('TDM');
  const a = spawnAt(w, 500, 500, { team: 'red', name: 'Survivor' });
  const victim = spawnAt(w, 700, 500, { team: 'blue', name: 'Victim' });
  a.lifeKills = 3;
  a.score = 450;
  w.teamScore.red = WORLD.tdmWinScore;
  run(w, WORLD.roundRestartMs + 100);
  assert.equal(w.match.k, 'playing');
  const records = w.lifeRecords.splice(0);
  assert.deepEqual(records.find((r) => r.id === a.id), { id: a.id, name: 'Survivor', kills: 3, score: 450, died: false });
  assert.deepEqual(records.find((r) => r.id === victim.id), { id: victim.id, name: 'Victim', kills: 0, score: 0, died: false });
  Object.assign(w, { walls: [], crates: [] });
  Object.assign(a, { x: 500, y: 500 });
  Object.assign(victim, { x: 700, y: 500 });
  if (victim.life.k === 'alive') Object.assign(victim.life, { hp: 1, shieldUntil: -Infinity });
  shootOnce(w, a, 0);
  assert.equal(victim.life.k, 'dead');
  damagePlayer(w, a, 1000, { attacker: null, team: null, label: 'test', piercing: true, via: 'gas', fromX: 0, fromY: 0 });
  assert.equal(w.lifeRecords.find((r) => r.id === a.id)?.kills, 1, 'the life after the restart holds one kill, not four');
});

for (const mode of ['TDM', 'DOM'] as const) {
  test(`${mode}: the leaderboard ranks by round kills, so a death does not drop a player down it`, () => {
    const w = emptyWorld(mode);
    const players = Array.from({ length: 12 }, (_, i) => spawnAt(w, 100 + i * 200, 500, { team: i % 2 ? 'blue' : 'red' }));
    players.forEach((p, i) => { p.score = 500; p.kills = i % 3; });
    const ace = players[11]!;
    ace.kills = 7;
    ace.score = 0;
    const board = snapshotFor(w, ace.id).leaderboard;
    assert.equal(board.length, players.length, 'every player has a row');
    assert.deepEqual(board[0], { id: ace.id, name: ace.name, score: 0, kills: 7, deaths: 0, team: ace.team });
    assert.deepEqual(board.map((r) => r.kills), [...board.map((r) => r.kills)].sort((a, b) => b - a));
  });
}

test('a hurt, half-empty survivor starts the next round at full health and ammo', () => {
  const w = emptyWorld('TDM');
  const a = spawnAt(w, 500, 500, { team: 'red', loadout: { armor: 'medium' } });
  if (a.life.k === 'alive') Object.assign(a.life, { hp: 10, ammo: 2 });
  w.teamScore.red = WORLD.tdmWinScore;
  run(w, TICK_MS);
  assert.equal(w.match.k, 'over');
  if (a.life.k === 'alive') a.life.lastDamageAt = Infinity;
  run(w, WORLD.roundRestartMs + 100);
  assert.equal(w.match.k, 'playing');
  const self = snapshotFor(w, a.id);
  const view = self.players.find((p) => p.id === a.id)!;
  assert.deepEqual([view.hp, self.self.ammo], [WORLD.baseHp, GUNS.pistol.mag]);
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
  w.firstBlood = true;
  const hit = (p: Player, amount: number) => damagePlayer(w, victim, amount, { attacker: p, team: null, label: 'test', piercing: true, via: 'bullet', fromX: p.x, fromY: p.y });
  hit(helper, 30);
  hit(chipper, 29);
  hit(killer, 100);
  const k = w.events.find((e) => e.e === 'kill');
  assert.deepEqual(k?.e === 'kill' && k.assisters, [helper.id]);
  assert.deepEqual([helper.score, chipper.score, killer.score], [WORLD.assistScore, 0, WORLD.killScore]);
});

test('a pick is taken only for the open level: a stale or skipped-ahead pick is refused and changes nothing', () => {
  const w = emptyWorld();
  const p = spawnAt(w, 500, 500);
  p.score = LEVELS[2]!.score;
  p.level = 2;
  const option = pickOptions({ k: 'perk', tier: 1 }, p.gun)[0]!;
  assert.equal(choosePick(w, p.id, 1, option), false, 'the level-1 attachment waits behind the open level-2 evolve');
  assert.deepEqual(p.perks, {});
  assert.equal(choosePick(w, p.id, 1, 'handCannon'), false, 'the right gun named against the wrong level');
  assert.equal(p.gun, 'pistol');
  assert.equal(choosePick(w, p.id, 2, 'handCannon'), true);
  assert.equal(choosePick(w, p.id, 2, 'handCannon'), false, 'a repeated pick is stale');
  assert.equal(p.gun, 'handCannon');
});

test('a player who is dead scores nothing, even for a kill their round lands after they fell', () => {
  const w = emptyWorld();
  w.firstBlood = true;
  const shooter = spawnAt(w, 500, 500);
  const victim = spawnAt(w, 800, 500);
  shooter.life = { k: 'dead', respawnAt: w.now + WORLD.respawnMs };
  damagePlayer(w, victim, 10_000, { attacker: shooter, team: null, label: 'Pistol', piercing: true, via: 'bullet', fromX: shooter.x, fromY: shooter.y });
  assert.equal(victim.life.k, 'dead');
  assert.equal(shooter.score, 0);
});

test('an attacker who died before the kill gets no assist', () => {
  const w = emptyWorld();
  const helper = spawnAt(w, 500, 500);
  const killer = spawnAt(w, 900, 500);
  const victim = spawnAt(w, 700, 700);
  w.firstBlood = true;
  damagePlayer(w, victim, 40, { attacker: helper, team: null, label: 'test', piercing: true, via: 'bullet', fromX: helper.x, fromY: helper.y });
  helper.life = { k: 'dead', respawnAt: w.now + WORLD.respawnMs };
  damagePlayer(w, victim, 100, { attacker: killer, team: null, label: 'test', piercing: true, via: 'bullet', fromX: killer.x, fromY: killer.y });
  const k = w.events.find((e) => e.e === 'kill');
  assert.deepEqual(k?.e === 'kill' && k.assisters, []);
});
