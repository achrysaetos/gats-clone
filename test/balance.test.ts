/// <reference types="node" />
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ARMOR_IDS, GUNS, LEVELS, WORLD, type ArmorId } from '../src/shared/defs.ts';
import { addPlayer, canRespawn, respawn, setInput, step } from '../src/shared/sim.ts';
import { snapshotFor, wallViews } from '../src/shared/sim/snapshot.ts';
import { choosePick, levelForScore } from '../src/shared/sim/stats.ts';
import { createWorld, rand } from '../src/shared/sim/world.ts';
import { ROTATION, type MapId } from '../src/shared/maps.ts';
import { botThink, newBotMemory, randomLoadout, type BotMemory } from '../src/server/bots.ts';
import { emptyWorld, shootOnce, spawnAt, TICK_MS } from './helpers.ts';

test('a bolt-action hit kills an unarmored full-health player', () => {
  const w = emptyWorld();
  const sniper = spawnAt(w, 1000, 1000, { loadout: { weapon: 'sniper' } });
  const target = spawnAt(w, 1600, 1000, { loadout: { armor: 'none' } });
  shootOnce(w, sniper, 0, 800);
  assert.equal(target.life.k, 'dead');
});

test('a point-blank shotgun blast kills an unarmored full-health player', () => {
  const w = emptyWorld();
  const shotgun = spawnAt(w, 1000, 1000, { loadout: { weapon: 'shotgun' } });
  const target = spawnAt(w, 1060, 1000, { loadout: { armor: 'none' } });
  shootOnce(w, shotgun, 0, 300);
  assert.equal(target.life.k, 'dead');
});

test('bolt-action hits to kill rise with armor: none 1, light 2, medium 2, heavy 3', () => {
  const shotsToKill = (armor: ArmorId) => {
    const w = emptyWorld();
    const sniper = spawnAt(w, 1000, 1000, { loadout: { weapon: 'sniper' } });
    const target = spawnAt(w, 1600, 1000, { loadout: { armor } });
    let shots = 0;
    while (target.life.k === 'alive' && shots < 10) { shootOnce(w, sniper, 0, GUNS.sniper.fireMs + 100); shots++; }
    return shots;
  };
  assert.deepEqual(ARMOR_IDS.map(shotsToKill), [1, 2, 2, 3]);
});

/** The level each bot life ended at in a fixed-seed FFA room of bots, so a ladder or bot change that stalls progression shows up. */
function botLifeLevels(seed: number, map: MapId, minutes: number): number[] {
  const w = createWorld('FFA', seed, map);
  const r = () => rand(w);
  const bots = new Map<number, BotMemory>();
  for (let i = 0; i < WORLD.minPlayers; i++) bots.set(addPlayer(w, `bot${i}`, randomLoadout(r)).id, newBotMemory(r));
  const levels: number[] = [];
  for (let t = 0; t < minutes * 60_000; t += TICK_MS) {
    const walls = wallViews(w);
    for (const [id, mem] of bots) {
      const d = botThink(snapshotFor(w, id), walls, mem, r);
      bots.set(id, d.mem);
      setInput(w, id, w.tick, d.input);
      if (d.pick) choosePick(w, id, d.pick.level, d.pick.option);
      if (canRespawn(w, id)) respawn(w, id, randomLoadout(r));
    }
    step(w, TICK_MS);
    for (const rec of w.lifeRecords.splice(0)) levels.push(levelForScore(rec.score));
  }
  return levels;
}

test('in a room of bots, a fair share of lives reach the first evolve, the ability tier and the hunted evolve', () => {
  // One room gives ~250 lives, about five of them hunted, so a small sample flips on unrelated balance tweaks; ten rooms (~800 lives) hold within a point.
  const levels = Array.from({ length: 10 }, (_, i) => botLifeLevels(i + 1, ROTATION.FFA[i % ROTATION.FFA.length]!, 2)).flat();
  const reach = (level: number) => levels.filter((l) => l >= level).length / levels.length;
  const [firstEvolve, hunted] = LEVELS.flatMap((l, i) => (l.pick?.k === 'evolve' ? [reach(i)] : []));
  const ability = reach(LEVELS.findIndex((l) => l.pick?.k === 'perk' && l.pick.tier === 3));
  const shares = `first evolve ${(firstEvolve * 100).toFixed(1)}%, ability ${(ability * 100).toFixed(1)}%, hunted ${(hunted * 100).toFixed(1)}% of ${levels.length} lives`;
  assert.ok(firstEvolve >= 0.3 && ability >= 0.07 && hunted >= 0.02, shares);
});

test('no rifle out-damages the SMG at close range', () => {
  const dps = (id: keyof typeof GUNS) => (GUNS[id].damage * GUNS[id].pellets * 1000) / GUNS[id].fireMs;
  for (const id of ['assault', 'lmg', 'pistol'] as const) assert.ok(dps(id) < dps('smg'), `${id} ${dps(id).toFixed(0)} < smg ${dps('smg').toFixed(0)}`);
});
