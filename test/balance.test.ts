/// <reference types="node" />
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { GUN_IDS, GUNS, LEVELS, WORLD } from '../src/shared/defs.ts';
import { addPlayer, step } from '../src/shared/sim.ts';
import { effectiveStats, levelForScore } from '../src/shared/sim/stats.ts';
import { createWorld, rand } from '../src/shared/sim/world.ts';
import { ROTATION, type MapId } from '../src/shared/maps.ts';
import { newBotMemory, randomLoadout, type BotMemory } from '../src/server/bots.ts';
import { thinkBots } from '../src/server/bot/tick.ts';
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

test('every gun that promises a kill in one or two hits keeps that promise through heavy armor, a pellet gun counting a point-blank blast as one hit', () => {
  for (const id of GUN_IDS.filter((g) => GUNS[g].breakpoint)) {
    const g = GUNS[id];
    const w = emptyWorld();
    const shooter = spawnAt(w, 1000, 1000, { loadout: { weapon: g.base } });
    shooter.gun = id;
    const target = spawnAt(w, 1000 + (g.pellets > 1 ? 60 : 300), 1000, { loadout: { armor: 'heavy' } });
    for (let hit = 1; hit <= g.breakpoint!; hit++) shootOnce(w, shooter, 0, (g.burst ? g.burst.count * g.burst.gapMs : 0) + g.fireMs + (g.mag === 1 ? g.reloadMs : 0) + 100);
    assert.equal(target.life.k, 'dead', `${g.name} kills heavy armor in ${g.breakpoint}`);
  }
  const w = emptyWorld();
  const executioner = spawnAt(w, 1000, 1000, { loadout: { weapon: 'pistol' } });
  executioner.gun = 'executioner';
  const thick = spawnAt(w, 1300, 1000, { loadout: { armor: 'heavy' } });
  thick.perks[2] = 'thickSkin';
  if (thick.life.k === 'alive') thick.life.hp = effectiveStats(thick).maxHp;
  for (let hit = 0; hit < 2; hit++) shootOnce(w, executioner, 0, GUNS.executioner.fireMs + 100);
  assert.equal(thick.life.k, 'dead', 'two Executioner rounds drop heavy armor and Thick skin');
});

/** The level each bot life ended at in a fixed-seed FFA room of bots, so a ladder or bot change that stalls progression shows up. */
function botLifeLevels(seed: number, map: MapId, minutes: number): number[] {
  const w = createWorld('FFA', seed, map);
  const r = () => rand(w);
  const bots = new Map<number, BotMemory>();
  for (let i = 0; i < WORLD.minPlayers; i++) bots.set(addPlayer(w, `bot${i}`, randomLoadout(r)).id, newBotMemory(r));
  const levels: number[] = [];
  for (let t = 0; t < minutes * 60_000; t += TICK_MS) {
    thinkBots(w, bots, r);
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
  assert.ok(firstEvolve >= 0.26 && ability >= 0.07 && hunted >= 0.02, shares);
});

test('no rifle out-damages the SMG at close range', () => {
  const dps = (id: keyof typeof GUNS) => (GUNS[id].damage * GUNS[id].pellets * 1000) / GUNS[id].fireMs;
  for (const id of ['assault', 'lmg', 'pistol'] as const) assert.ok(dps(id) < dps('smg'), `${id} ${dps(id).toFixed(0)} < smg ${dps('smg').toFixed(0)}`);
});
