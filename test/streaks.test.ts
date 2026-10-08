import assert from 'node:assert/strict';
import { test } from 'node:test';
import { KILL_REWARD, STREAK, WORLD } from '../src/shared/defs.ts';
import type { GameEvent } from '../src/shared/protocol.ts';
import { damagePlayer } from '../src/shared/sim/combat.ts';
import { snapshotFor } from '../src/shared/sim/snapshot.ts';
import { effectiveStats } from '../src/shared/sim/stats.ts';
import type { Player, World } from '../src/shared/sim/world.ts';
import { emptyWorld, spawnAt } from './helpers.ts';

/** `killer` finishes `victim` with one big blow, and the kill event that follows. */
function slay(w: World, killer: Player, victim: Player): Extract<GameEvent, { e: 'kill' }> {
  w.events = [];
  damagePlayer(w, victim, 10_000, { attacker: killer, team: killer.team, label: 'Pistol', piercing: true, via: 'bullet', fromX: killer.x, fromY: killer.y });
  const ev = w.events.find((e) => e.e === 'kill');
  if (ev?.e !== 'kill') throw new Error('no kill');
  return ev;
}

const revive = (w: World, p: Player) => {
  p.life = { ...(spawnAt(w, 0, 0).life as Extract<Player['life'], { k: 'alive' }>) };
};

test('a kill refuels the killer with health and ammo, but never past full', () => {
  const w = emptyWorld();
  const a = spawnAt(w, 100, 100), b = spawnAt(w, 400, 100);
  const max = effectiveStats(a).maxHp, mag = effectiveStats(a).mag;
  if (a.life.k !== 'alive') throw new Error();
  a.life.hp = 0.2 * max;
  a.life.ammo = 1;
  slay(w, a, b);
  assert.ok(Math.abs(a.life.hp - (0.2 + KILL_REWARD.heal) * max) < 1e-9, 'healed by a share of max health');
  assert.equal(a.life.ammo, 1 + Math.ceil(KILL_REWARD.ammo * mag));
  a.life.hp = max - 1;
  const c = spawnAt(w, 400, 300);
  slay(w, a, c);
  assert.equal(a.life.hp, max, 'capped at max health');
  a.life.ammo = mag - 1;
  slay(w, a, spawnAt(w, 400, 500));
  assert.equal(a.life.ammo, mag, 'capped at a full mag');
  a.life.ammo = 0;
  a.life.reloadUntil = w.now + 1000;
  slay(w, a, spawnAt(w, 400, 700));
  assert.equal(a.life.ammo, 0, 'mid-reload the mag is left to the reload');
});

test('ending a long streak pays a shutdown bonus and tells everyone the streak it ended', () => {
  const w = emptyWorld();
  const hero = spawnAt(w, 100, 100), stopper = spawnAt(w, 100, 400);
  for (let i = 0; i < STREAK.shutdownAt; i++) slay(w, hero, spawnAt(w, 300 + i * 60, 100));
  assert.equal(hero.lifeKills, STREAK.shutdownAt);
  const seen = snapshotFor(w, stopper.id).players.find((p) => p.id === hero.id);
  assert.equal(seen?.streak, STREAK.shutdownAt, 'others see the streak');
  const before = stopper.score;
  const ev = slay(w, stopper, hero);
  assert.equal(ev.ended, STREAK.shutdownAt);
  assert.equal(stopper.score - before, WORLD.killScore + STREAK.shutdownScore, 'the shutdown medal pays the bonus');
});

test('your killer becomes your nemesis, and killing them back pays revenge once', () => {
  const w = emptyWorld();
  const a = spawnAt(w, 100, 100), b = spawnAt(w, 400, 100);
  slay(w, a, b);
  assert.equal(b.nemesis, a.id);
  assert.equal(snapshotFor(w, b.id).self.nemesis, a.id);
  revive(w, b);
  const before = b.score;
  const ev = slay(w, b, a);
  assert.equal(ev.revenge, true);
  assert.equal(b.score - before, WORLD.killScore + STREAK.revengeScore);
  assert.equal(b.nemesis, null, 'revenge settles the score');
  assert.equal(a.nemesis, b.id, 'and the victim now holds the grudge');
});
