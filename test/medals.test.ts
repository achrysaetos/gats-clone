import assert from 'node:assert/strict';
import { test } from 'node:test';
import { MEDAL_RULES, MEDALS, WORLD, type MedalId } from '../src/shared/defs.ts';
import { step } from '../src/shared/sim.ts';
import { damagePlayer } from '../src/shared/sim/combat.ts';
import { effectiveStats } from '../src/shared/sim/stats.ts';
import type { Player, World } from '../src/shared/sim/world.ts';
import { emptyWorld, spawnAt, TICK_MS } from './helpers.ts';

const hit = (w: World, by: Player, victim: Player, amount: number) =>
  damagePlayer(w, victim, amount, { attacker: by, team: by.team, label: 'Pistol', piercing: true, via: 'bullet', fromX: by.x, fromY: by.y });

/** `by` kills `victim` in one blow; the medals it earned, and the score they and the kill paid. */
function slay(w: World, by: Player, victim: Player): { medals: MedalId[]; gained: number } {
  w.events = [];
  const before = by.score;
  hit(w, by, victim, 10_000);
  return { medals: w.events.flatMap((e) => (e.e === 'medal' && e.id === by.id ? [e.medal] : [])), gained: by.score - before };
}

test('the round\'s first kill is First Blood, once', () => {
  const w = emptyWorld();
  const a = spawnAt(w, 500, 500);
  const first = slay(w, a, spawnAt(w, 800, 500));
  assert.deepEqual(first.medals, ['firstBlood']);
  assert.equal(first.gained, WORLD.killScore + MEDALS.firstBlood.score, 'a medal pays its score');
  w.now += MEDAL_RULES.multiMs + 1;
  assert.deepEqual(slay(w, a, spawnAt(w, 800, 600)).medals, []);
});

test('kills in quick succession earn the multi-kill medals, and a pause resets the chain', () => {
  const w = emptyWorld();
  w.firstBlood = true;
  const a = spawnAt(w, 500, 500);
  const got = [0, 1, 2, 3, 4].map((i) => { w.now += 1000; return slay(w, a, spawnAt(w, 800, 300 + i * 60)).medals.filter((m) => m !== 'onFire' && m !== 'rampage'); });
  assert.deepEqual(got, [[], ['doubleKill'], ['tripleKill'], ['quadKill'], ['massacre']]);
  w.now += MEDAL_RULES.multiMs + 1;
  assert.deepEqual(slay(w, a, spawnAt(w, 800, 700)).medals, []);
});

test('range medals: a Long Shot from far, Point Blank from close, nothing between', () => {
  const w = emptyWorld();
  w.firstBlood = true;
  const a = spawnAt(w, 500, 500);
  const at = (dx: number) => { w.now += MEDAL_RULES.multiMs + 1; return slay(w, a, spawnAt(w, 500 + dx, 500)).medals.filter((m) => m !== 'onFire'); };
  assert.deepEqual(at(MEDAL_RULES.longShotPx), ['longShot']);
  assert.deepEqual(at(MEDAL_RULES.pointBlankPx), ['pointBlank']);
  assert.deepEqual(at(300), []);
});

test('Clutch: killing whoever is hurting you on your last legs', () => {
  const w = emptyWorld();
  w.firstBlood = true;
  const a = spawnAt(w, 500, 500), b = spawnAt(w, 800, 500);
  const max = effectiveStats(a).maxHp;
  hit(w, b, a, max * (1 - MEDAL_RULES.clutchHp) + 1);
  assert.deepEqual(slay(w, a, b).medals, ['clutch']);
  const c = spawnAt(w, 800, 700);
  w.now += MEDAL_RULES.multiMs + 1;
  assert.deepEqual(slay(w, a, c).medals, [], 'not against someone who never touched you');
});

test('Close Call: drop under a tenth of your health and live six more seconds, once until you heal', () => {
  const w = emptyWorld();
  const a = spawnAt(w, 500, 500), b = spawnAt(w, 1500, 1500);
  hit(w, b, a, effectiveStats(a).maxHp * (1 - MEDAL_RULES.closeCallHp) + 1);
  const medals: MedalId[] = [];
  for (let t = 0; t < MEDAL_RULES.closeCallMs * 2; t += TICK_MS) {
    step(w, TICK_MS);
    for (const e of w.events) if (e.e === 'medal' && e.id === a.id) medals.push(e.medal);
  }
  assert.deepEqual(medals, ['closeCall']);
});

test('streak medals mark 3, 5, 8, 12 and 20 kills in one life', () => {
  const w = emptyWorld();
  w.firstBlood = true;
  const a = spawnAt(w, 500, 500);
  const streak: MedalId[] = [];
  for (let i = 0; i < 20; i++) {
    w.now += MEDAL_RULES.multiMs + 1;
    streak.push(...slay(w, a, spawnAt(w, 800, 100 + i * 50)).medals);
  }
  assert.deepEqual(streak, ['onFire', 'rampage', 'unstoppable', 'untouchable', 'legendary']);
});

test('a medal is news only to the player who earned it', async () => {
  const { snapshotFor } = await import('../src/shared/sim/snapshot.ts');
  const w = emptyWorld();
  const a = spawnAt(w, 500, 500), b = spawnAt(w, 800, 500), c = spawnAt(w, 600, 600);
  slay(w, a, b);
  assert.ok(snapshotFor(w, a.id).events.some((e) => e.e === 'medal'));
  assert.ok(!snapshotFor(w, c.id).events.some((e) => e.e === 'medal'));
});
