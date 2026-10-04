/// <reference types="node" />
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { step } from '../src/shared/sim.ts';
import { snapshotFor } from '../src/shared/sim/snapshot.ts';
import type { World } from '../src/shared/sim/world.ts';
import { botThink, newBotMemory } from '../src/server/bots.ts';
import { emptyWorld, equip, spawnAt, TICK_MS } from './helpers.ts';

const seeded = (seed: number) => { let x = seed; return () => ((x = (x * 16807) % 2147483647) / 2147483647); };

function think(w: World, botId: number, seed: number, ticks: number) {
  const r = seeded(seed);
  let mem = newBotMemory(r);
  for (let i = 1; i < ticks; i++) {
    mem = botThink(snapshotFor(w, botId), [], mem, r).mem;
    step(w, TICK_MS);
  }
  return botThink(snapshotFor(w, botId), [], mem, r).input;
}

test('a bot aims at a hunted enemy in view over a nearer ordinary one', () => {
  for (let seed = 1; seed <= 5; seed++) {
    const w = emptyWorld();
    const bot = spawnAt(w, 1000, 1000, { loadout: { weapon: 'assault' } });
    spawnAt(w, 1200, 1000);
    equip(spawnAt(w, 1000, 1400), 'executioner');
    const angle = think(w, bot.id, seed, 20).angle;
    assert.ok(Math.abs(angle - Math.PI / 2) < 0.3, `seed ${seed}: aims down at the hunted enemy, angle ${angle.toFixed(2)}`);
  }
});

test('a bot with nobody in view heads for the hunted marker on its minimap', () => {
  for (let seed = 1; seed <= 5; seed++) {
    for (const corner of [{ x: 100, y: 100 }, { x: 2900, y: 2900 }]) {
      const w = emptyWorld();
      const bot = spawnAt(w, 1500, 1500);
      equip(spawnAt(w, corner.x, corner.y), 'executioner');
      const input = think(w, bot.id, seed, 1);
      const toward = corner.x < 1500 ? input.left && input.up : input.right && input.down;
      assert.ok(toward, `seed ${seed}: moves toward the marker at (${corner.x}, ${corner.y})`);
    }
  }
});

test('a bot chases the nearer of two hunted markers', () => {
  const w = emptyWorld();
  const bot = spawnAt(w, 1500, 1500);
  equip(spawnAt(w, 200, 1500), 'executioner');
  equip(spawnAt(w, 2900, 2900), 'executioner');
  const input = think(w, bot.id, 1, 1);
  assert.ok(input.left && !input.right && !input.down, 'heads left to the marker 1300px away, not the one 1980px away');
});
