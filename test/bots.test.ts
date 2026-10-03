/// <reference types="node" />
import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { WallView } from '../src/shared/protocol.ts';
import { snapshotFor } from '../src/shared/sim.ts';
import { botName, botThink, newBotMemory } from '../src/server/bots.ts';
import { emptyWorld, spawnAt } from './helpers.ts';

const rand = (() => { let x = 7; return () => ((x = (x * 16807) % 2147483647) / 2147483647); })();

test('a bot holds fire at an enemy behind a wall and fires once it can see them', () => {
  const w = emptyWorld();
  const bot = spawnAt(w, 1000, 1000, { loadout: { weapon: 'assault' } });
  spawnAt(w, 1400, 1000);
  const wall: WallView = { x: 1180, y: 900, w: 40, h: 200, built: false };
  const blocked = botThink(snapshotFor(w, bot.id), [wall], newBotMemory(rand), rand);
  assert.equal(blocked.input.fire, false, 'no shots into the wall');
  const clear = botThink(snapshotFor(w, bot.id), [], newBotMemory(rand), rand);
  assert.equal(clear.input.fire, true, 'fires with a clear line');
});

test('a bot in range strafes sideways instead of standing still', () => {
  const w = emptyWorld();
  const bot = spawnAt(w, 1000, 1000, { loadout: { weapon: 'assault' } });
  spawnAt(w, 1300, 1000);
  const d = botThink(snapshotFor(w, bot.id), [], newBotMemory(rand), rand);
  assert.ok(d.input.up || d.input.down, 'moves across the line to the enemy');
});

test('a bot leads a target moving across its line of fire', () => {
  const w = emptyWorld();
  const bot = spawnAt(w, 1000, 1000, { loadout: { weapon: 'sniper' } });
  const target = spawnAt(w, 1800, 1000);
  const mem = { ...newBotMemory(rand), seen: { id: target.id, x: 1800, y: 960 } };
  const angles = Array.from({ length: 20 }, () => botThink(snapshotFor(w, bot.id), [], mem, rand).input.angle);
  const mean = angles.reduce((a, b) => a + b, 0) / angles.length;
  assert.ok(mean > 0.01, `aims ahead (downward) of a target moving down: mean angle ${mean.toFixed(3)}`);
});

test('bot names never repeat a name already in the room', () => {
  const taken = new Set<string>();
  for (let i = 0; i < 40; i++) {
    const n = botName(taken, rand);
    assert.ok(!taken.has(n), `${n} reused`);
    taken.add(n);
  }
});
