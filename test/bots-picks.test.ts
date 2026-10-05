/// <reference types="node" />
import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { PickOption, WeaponId } from '../src/shared/defs.ts';
import { MAPS } from '../src/shared/maps.ts';
import { snapshotFor } from '../src/shared/sim/snapshot.ts';
import { botThink, newBotMemory } from '../src/server/bots.ts';
import { arenaFor } from '../src/server/bot/arena.ts';
import { emptyWorld, spawnAt } from './helpers.ts';

const seeded = (seed: number) => { let x = seed; return () => ((x = (x * 16807) % 2147483647) / 2147483647); };

function tierOnePicks(weapon: WeaponId, n: number): Map<PickOption, number> {
  const counts = new Map<PickOption, number>();
  for (let seed = 1; seed <= n; seed++) {
    const w = emptyWorld();
    const bot = spawnAt(w, 1000, 1000, { loadout: { weapon } });
    bot.level = 1;
    const r = seeded(seed);
    const option = botThink(snapshotFor(w, bot.id), arenaFor(w), newBotMemory(r), r).pick?.option;
    assert.ok(option, 'answers the open pick');
    counts.set(option, (counts.get(option) ?? 0) + 1);
  }
  return counts;
}

test('a bot never takes long range, which does nothing for a bot, and does take bipod and ghillie now that it stands still', () => {
  for (const weapon of ['assault', 'sniper', 'smg'] as const) {
    const counts = tierOnePicks(weapon, 300);
    assert.equal(counts.get('longRange') ?? 0, 0, `${weapon} took long range`);
    for (const still of ['bipod', 'ghillie'] as const) assert.ok((counts.get(still) ?? 0) > 0, `${weapon} never took ${still}`);
  }
});

test('a bolt-action bot never takes grip, which an smg bot does', () => {
  assert.equal(tierOnePicks('sniper', 300).get('grip') ?? 0, 0, 'sniper took grip');
  assert.ok((tierOnePicks('smg', 300).get('grip') ?? 0) > 0, 'smg never took grip');
});
