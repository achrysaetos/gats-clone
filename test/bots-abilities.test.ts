/// <reference types="node" />
import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { AbilityId, ModeId } from '../src/shared/defs.ts';
import type { InputState, Snapshot, WallView } from '../src/shared/protocol.ts';
import { step } from '../src/shared/sim.ts';
import { snapshotFor } from '../src/shared/sim/snapshot.ts';
import { botThink, newBotMemory } from '../src/server/bots.ts';
import { emptyWorld, grantPerks, spawnAt, TICK_MS } from './helpers.ts';

const seeded = (seed: number) => { let x = seed; return () => ((x = (x * 16807) % 2147483647) / 2147483647); };

type Scene = {
  ability: AbilityId;
  botAt?: { x: number; y: number };
  enemyAt?: { x: number; y: number };
  hp?: number;
  mode?: ModeId;
  walls?: WallView[];
  hitEveryTick?: boolean;
};

/** The bot's inputs over its first second, standing at (1000, 1000) unless told otherwise, facing an idle enemy. */
function inputs(scene: Scene, ticks = 30): InputState[] {
  const w = emptyWorld(scene.mode);
  const bot = spawnAt(w, scene.botAt?.x ?? 1000, scene.botAt?.y ?? 1000, { loadout: { weapon: 'assault' }, team: scene.mode === 'DOM' ? 'red' : undefined });
  grantPerks(w, bot, ['grip', 'thickSkin', scene.ability]);
  if (scene.enemyAt) spawnAt(w, scene.enemyAt.x, scene.enemyAt.y, { team: scene.mode === 'DOM' ? 'blue' : undefined });
  const r = seeded(11);
  let mem = newBotMemory(r);
  const out: InputState[] = [];
  for (let i = 0; i < ticks; i++) {
    if (scene.hp !== undefined && bot.life.k === 'alive') bot.life.hp = scene.hp;
    const snap: Snapshot = snapshotFor(w, bot.id);
    if (scene.hitEveryTick) snap.events = [...snap.events, { e: 'dmg', attacker: null, victim: bot.id, amount: 5, x: bot.x, y: bot.y, kind: 'player' }];
    const d = botThink(snap, scene.walls ?? [], mem, r);
    mem = d.mem;
    out.push(d.input);
    step(w, TICK_MS);
  }
  return out;
}

const uses = (xs: InputState[]) => xs.some((i) => i.ability);

test('a knife bot lunges only at an enemy inside its lunge reach', () => {
  assert.ok(uses(inputs({ ability: 'knife', enemyAt: { x: 1130, y: 1000 } })), 'stabs an enemy 130px away');
  assert.ok(!uses(inputs({ ability: 'knife', enemyAt: { x: 1350, y: 1000 } })), 'holds the knife at 350px');
});

test('a grenade bot throws only at mid range', () => {
  for (const ability of ['grenade', 'fragGrenade', 'gasGrenade'] as const) {
    assert.ok(uses(inputs({ ability, enemyAt: { x: 1300, y: 1000 } })), `${ability}: throws at 300px`);
    assert.ok(!uses(inputs({ ability, enemyAt: { x: 1080, y: 1000 } })), `${ability}: holds at 80px, inside its own blast`);
    assert.ok(!uses(inputs({ ability, enemyAt: { x: 1600, y: 1000 } })), `${ability}: holds at 600px`);
  }
});

test('a grenade bot does not throw before its reaction delay has passed', () => {
  const first = inputs({ ability: 'grenade', enemyAt: { x: 1300, y: 1000 } }).findIndex((i) => i.ability);
  assert.ok(first * TICK_MS >= 250 - TICK_MS, `first throw after ${(first * TICK_MS).toFixed(0)}ms`);
});

test('a hurt dash bot dashes away from the enemy, and a healthy one does not dash', () => {
  const hurt = inputs({ ability: 'dash', enemyAt: { x: 1300, y: 1000 }, hp: 20 });
  const dashTick = hurt.find((i) => i.ability);
  assert.ok(dashTick, 'dashes when at 20 hp');
  assert.ok(dashTick.left && !dashTick.right, 'dashes away from an enemy to its right');
  assert.ok(!uses(inputs({ ability: 'dash', enemyAt: { x: 1300, y: 1000 } })), 'no dash at full health');
});

test('a hurt bot retreats around a wall behind it rather than into it', () => {
  const wall: WallView = { x: 900, y: 900, w: 40, h: 200, built: false };
  const moves = inputs({ ability: 'dash', enemyAt: { x: 1300, y: 1000 }, hp: 20, walls: [wall] }).slice(10);
  assert.ok(moves.every((i) => !i.right), 'never moves toward the enemy');
  assert.ok(moves.every((i) => i.up || i.down), 'slips past the wall diagonally');
});

test('a bot drops a land mine when hurt in a fight or standing on a zone it does not own', () => {
  assert.ok(uses(inputs({ ability: 'landMine', enemyAt: { x: 1300, y: 1000 }, hp: 20 })), 'mines its retreat');
  assert.ok(!uses(inputs({ ability: 'landMine', enemyAt: { x: 1300, y: 1000 } })), 'keeps the mine at full health');
  const center = emptyWorld('DOM').zones[1]!;
  assert.ok(uses(inputs({ ability: 'landMine', mode: 'DOM', botAt: center }, 1)), 'mines a zone it is capturing');
  assert.ok(!uses(inputs({ ability: 'landMine', mode: 'DOM', botAt: { x: center.x - 400, y: center.y } }, 1)), 'no mine off the zone');
});

test('an engineer bot builds cover only while under fire at mid range', () => {
  assert.ok(uses(inputs({ ability: 'engineer', enemyAt: { x: 1350, y: 1000 }, hitEveryTick: true })), 'walls off a shooter 350px away');
  assert.ok(!uses(inputs({ ability: 'engineer', enemyAt: { x: 1350, y: 1000 } })), 'no wall when nobody is shooting');
  assert.ok(!uses(inputs({ ability: 'engineer', enemyAt: { x: 1100, y: 1000 }, hitEveryTick: true })), 'no wall against a shooter 100px away');
});
