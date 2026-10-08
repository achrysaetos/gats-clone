/// <reference types="node" />
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { WORLD } from '../src/shared/defs.ts';
import { MAPS } from '../src/shared/maps.ts';
import { setInput, step } from '../src/shared/sim.ts';
import { circleHitsRect } from '../src/shared/sim/movement.ts';
import { snapshotFor } from '../src/shared/sim/snapshot.ts';
import { arrivalOf, passMs, trainAt, type TrainDef } from '../src/shared/sim/train.ts';
import { newId, type Player, type World } from '../src/shared/sim/world.ts';
import { botThink, newBotMemory, type BotMemory } from '../src/server/bots.ts';
import { arenaFor } from '../src/server/bot/arena.ts';
import type { Point } from '../src/server/bot/nav.ts';
import { emptyWorld, spawnAt, TICK_MS } from './helpers.ts';

const seeded = (seed: number) => { let x = seed; return () => ((x = (x * 16807) % 2147483647) / 2147483647); };

/** Drives `bot` toward `goal` with its own brain for `ticks`, calling `each` after every step. */
function walk(w: World, bot: Player, goal: Point, ticks: number, each: () => void = () => {}) {
  const r = seeded(3);
  let mem: BotMemory = { ...newBotMemory(r), persona: 'cautious' };
  for (let i = 0; i < ticks; i++) {
    mem = { ...mem, intent: { k: 'patrol', goal, since: 0, holdUntil: 0 } };
    const d = botThink(snapshotFor(w, bot.id), arenaFor(w), mem, r);
    mem = d.mem;
    setInput(w, bot.id, i + 1, d.input);
    step(w, TICK_MS);
    each();
  }
}

test('a bot walks round a fire patch in its way instead of through it', () => {
  const w = emptyWorld();
  const bot = spawnAt(w, 1000, 1000);
  w.thrown.push({ id: newId(w), kind: 'fire', owner: -1, team: null, x: 1300, y: 1000, r: 60, dps: 22, expiresAt: Infinity });
  let closest = Infinity;
  walk(w, bot, { x: 1600, y: 1000 }, 240, () => { closest = Math.min(closest, Math.hypot(bot.x - 1300, bot.y - 1000)); });
  // A patrol counts as arrived within 60 and picks its next goal, so the bot hovers about the goal rather than on it.
  assert.ok(Math.hypot(bot.x - 1600, bot.y - 1000) < 90, `reached the far side, at (${bot.x.toFixed(0)}, ${bot.y.toFixed(0)})`);
  assert.equal(bot.life.k === 'alive' && bot.life.hp, 100, 'never burned');
  assert.ok(closest > 60 + WORLD.playerRadius, `kept clear of the flames (closest ${closest.toFixed(0)})`);
});

test('a bot standing in a fire patch steps out of it', () => {
  const w = emptyWorld();
  const bot = spawnAt(w, 1000, 1000);
  w.thrown.push({ id: newId(w), kind: 'fire', owner: -1, team: null, x: 1010, y: 1000, r: 60, dps: 22, expiresAt: Infinity });
  walk(w, bot, { x: 1000, y: 1000 }, 30);
  assert.ok(Math.hypot(bot.x - 1010, bot.y - 1000) > 60 + WORLD.playerRadius, `out of the flames at (${bot.x.toFixed(0)}, ${bot.y.toFixed(0)})`);
});

const TRAIN: TrainDef = { lane: { x: 0, y: 1000, w: 4000, h: 150 }, axis: 'x', dir: 1, everyMs: 60_000, jitterMs: 10_000, warnMs: 5000, speed: 1600, length: 1200 };

/** Runs `body` with `TRAIN` on the world's map, its first run's warning starting `lead` ms from now. */
function withTrain(w: World, lead: number, body: () => void) {
  const def = MAPS[w.map];
  const was = def.train;
  def.train = TRAIN;
  w.now = arrivalOf(TRAIN, 1) - TRAIN.warnMs - lead;
  try { body(); } finally { if (was) def.train = was; else delete def.train; }
}

const inLane = (p: Point) => circleHitsRect(p.x, p.y, WORLD.playerRadius, TRAIN.lane);

test('a bot waits off the lane while the train warns and passes, then crosses', () => {
  const w = emptyWorld();
  const bot = spawnAt(w, 600, 1400);
  withTrain(w, 500, () => {
    const hot: string[] = [];
    let crossedAt = -1;
    const ticks = Math.ceil((500 + TRAIN.warnMs + passMs(TRAIN) + 3000) / TICK_MS);
    walk(w, bot, { x: 600, y: 600 }, ticks, () => {
      const state = trainAt(TRAIN, w.now).k;
      if (state !== 'clear' && inLane(bot)) hot.push(`${state} at (${bot.x.toFixed(0)}, ${bot.y.toFixed(0)})`);
      if (crossedAt < 0 && bot.y < 1000 - WORLD.playerRadius) crossedAt = w.now;
    });
    assert.deepEqual(hot.slice(0, 3), [], 'never in the lane while it was hot');
    assert.equal(bot.life.k, 'alive');
    assert.ok(crossedAt >= arrivalOf(TRAIN, 1) + passMs(TRAIN), 'crossed once the train had gone');
  });
});

test('a bot in the lane when the signals start steps off it before the train comes', () => {
  const w = emptyWorld();
  const bot = spawnAt(w, 600, 1075);
  withTrain(w, 0, () => {
    walk(w, bot, { x: 2600, y: 1075 }, Math.ceil(TRAIN.warnMs / TICK_MS));
    assert.ok(!inLane(bot), `off the lane at (${bot.x.toFixed(0)}, ${bot.y.toFixed(0)}) as the train arrives`);
    walk(w, bot, { x: 2600, y: 1075 }, Math.ceil(passMs(TRAIN) / TICK_MS));
    assert.equal(bot.life.k, 'alive');
  });
});

/** A bot facing an enemy who stands beside a fuel barrel; `barrelAt` is the barrel's centre. Returns whether the barrel broke and the enemy's health. */
function barrelFight(botAt: Point, barrelAt: Point, opts: { mateAt?: Point; enemy?: false } = {}): { broke: boolean; enemyHp: number } {
  const w = emptyWorld('TDM');
  const bot = spawnAt(w, botAt.x, botAt.y, { team: 'red', loadout: { weapon: 'pistol' } });
  if (opts.mateAt) spawnAt(w, opts.mateAt.x, opts.mateAt.y, { team: 'red' });
  const enemy = opts.enemy === false ? null : spawnAt(w, 1450, 1000, { team: 'blue' });
  w.crates = [{ id: newId(w), piece: 'barrel.red', r: 0, x: barrelAt.x - 15, y: barrelAt.y - 15, w: 30, h: 30, hp: 35, respawnAt: null }];
  w.wallsVersion++;
  const r = seeded(9);
  let mem: BotMemory = { ...newBotMemory(r), persona: 'cautious' };
  let broke = false;
  for (let i = 0; i < 90 && !broke; i++) {
    const d = botThink(snapshotFor(w, bot.id), arenaFor(w), mem, r);
    mem = d.mem;
    setInput(w, bot.id, i + 1, { ...d.input, up: false, down: false, left: false, right: false });
    if (enemy?.life.k === 'alive') enemy.life.hp = 100;
    step(w, TICK_MS);
    broke = w.crates[0]!.respawnAt !== null;
  }
  return { broke, enemyHp: enemy?.life.k === 'alive' ? enemy.life.hp : 0 };
}

test('a bot shoots the fuel barrel an enemy stands beside, and the blast hurts the enemy', () => {
  const fight = barrelFight({ x: 1100, y: 1000 }, { x: 1450, y: 1080 });
  assert.ok(fight.broke, 'the barrel went up');
  assert.ok(fight.enemyHp < 60, `the enemy took the blast (${fight.enemyHp} left)`);
});

test('a bot leaves the barrel alone when no enemy is in its blast, or when it or a mate is', () => {
  assert.equal(barrelFight({ x: 1100, y: 1000 }, { x: 1300, y: 1400 }).broke, false, 'no enemy near it');
  assert.equal(barrelFight({ x: 1350, y: 1000 }, { x: 1450, y: 1080 }).broke, false, 'the bot stands in its blast');
  assert.equal(barrelFight({ x: 1100, y: 1000 }, { x: 1450, y: 1080 }, { mateAt: { x: 1500, y: 1200 } }).broke, false, 'a mate stands in its blast');
});

test('a bot with nobody to fight shoots a fuel barrel for score only from outside its blast', () => {
  assert.equal(barrelFight({ x: 1350, y: 1000 }, { x: 1450, y: 1080 }, { enemy: false }).broke, false, 'too close to shoot it');
  assert.equal(barrelFight({ x: 1100, y: 1000 }, { x: 1450, y: 1080 }, { enemy: false }).broke, true, 'far enough to');
});
