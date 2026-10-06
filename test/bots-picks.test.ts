/// <reference types="node" />
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ATTACHMENTS, WEAPON_IDS, type PickOption, type WeaponId } from '../src/shared/defs.ts';
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

test('a bot never takes a perk that does nothing for a bot', () => {
  for (const weapon of ['pistol', 'sniper', 'smg'] as const) {
    const counts = tierOnePicks(weapon, 300);
    for (const useless of ['ghillie', 'longRange'] as const) assert.equal(counts.get(useless) ?? 0, 0, `${weapon} took ${useless}`);
  }
});

test('a bot takes its attachment from its own class menu', () => {
  for (const weapon of WEAPON_IDS) {
    for (const option of tierOnePicks(weapon, 60).keys()) assert.ok(ATTACHMENTS[weapon].some((a) => a === option), `${weapon} took ${option}`);
  }
  assert.ok((tierOnePicks('shotgun', 300).get('choke') ?? 0) > 0, 'shotgun never took choke');
});
