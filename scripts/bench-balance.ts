/// <reference types="node" />
// Usage: node scripts/bench-balance.ts [worlds=8] [minutes=5] [mode=FFA]
// Worlds take the mode's maps in rotation order, one map per world.
import { ARMOR_IDS, LEVEL_SCORES, MODE_IDS, WEAPON_IDS, GUNS, WORLD, type ArmorId, type ModeId, type WeaponId } from '../src/shared/defs.ts';
import { MAPS, ROTATION, type MapId } from '../src/shared/maps.ts';
import { addPlayer, canRespawn, respawn, setInput, step } from '../src/shared/sim.ts';
import { snapshotFor, wallViews } from '../src/shared/sim/snapshot.ts';
import { choosePerk, levelForScore } from '../src/shared/sim/stats.ts';
import { createWorld, IDLE_INPUT, rand } from '../src/shared/sim/world.ts';
import { botThink, newBotMemory, randomLoadout, type BotMemory } from '../src/server/bots.ts';

const worlds = Number(process.argv[2] ?? 8);
const minutes = Number(process.argv[3] ?? 5);
const mode = MODE_IDS.find((m) => m === (process.argv[4] ?? 'FFA')) satisfies ModeId | undefined;
if (!mode) throw new Error(`unknown mode ${process.argv[4]}; use one of ${MODE_IDS.join(', ')}`);
const TICK_MS = 1000 / WORLD.tickHz;

const median = (xs: number[]) => {
  if (!xs.length) return NaN;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
};
const pct = (n: number, total: number) => `${((100 * n) / Math.max(1, total)).toFixed(1)}%`;
const tally = <K extends string>(m: Map<K, number>, k: K) => m.set(k, (m.get(k) ?? 0) + 1);

const killsBy = new Map<string, number>();
const killsByMap = new Map<MapId, Map<string, number>>();
const deathsByArmor = new Map<ArmorId, number>();
const livesByArmor = new Map<ArmorId, number>();
const lifeMs: number[] = [];
const lifeTiers: number[] = [];

for (let seed = 1; seed <= worlds; seed++) {
  const map = ROTATION[mode][(seed - 1) % ROTATION[mode].length];
  const w = createWorld(mode, seed, map);
  const mapKills = killsByMap.get(map) ?? new Map<string, number>();
  killsByMap.set(map, mapKills);
  const r = () => rand(w);
  const bots = new Map<number, BotMemory>();
  const bornAt = new Map<number, number>();
  for (let i = 0; i < WORLD.minPlayers; i++) {
    const p = addPlayer(w, `bot${i}`, randomLoadout(r));
    bots.set(p.id, newBotMemory(r));
    bornAt.set(p.id, w.now);
    tally(livesByArmor, p.loadout.armor);
  }
  for (let t = 0; t < minutes * 60_000; t += TICK_MS) {
    const walls = wallViews(w);
    for (const [id, mem] of bots) {
      const d = botThink(snapshotFor(w, id), walls, mem, r);
      bots.set(id, d.mem);
      setInput(w, id, w.tick, d.input);
      if (d.perk) choosePerk(w, id, d.perk.tier, d.perk.perk);
      if (canRespawn(w, id) && respawn(w, id, randomLoadout(r))) {
        bornAt.set(id, w.now);
        tally(livesByArmor, w.players.get(id)!.loadout.armor);
      }
    }
    step(w, TICK_MS);
    for (const e of w.events) {
      if (e.e !== 'kill') continue;
      tally(killsBy, e.weapon);
      tally(mapKills, e.weapon);
      tally(deathsByArmor, w.players.get(e.victimId)!.loadout.armor);
      lifeMs.push(w.now - (bornAt.get(e.victimId) ?? 0));
    }
    for (const rec of w.lifeRecords.splice(0)) lifeTiers.push(levelForScore(rec.score));
  }
}

const totalKills = [...killsBy.values()].reduce((a, b) => a + b, 0);
console.log(`bench ${mode}: ${worlds} worlds x ${minutes} min, ${WORLD.minPlayers} bots each, ${totalKills} kills`);
console.log('\nkill share by weapon (bots pick weapons uniformly, so even is 16.7%)');
for (const [label, n] of [...killsBy].sort((a, b) => b[1] - a[1])) console.log(`  ${label.padEnd(12)} ${String(n).padStart(5)}  ${pct(n, totalKills)}`);
console.log('\nkill share by weapon per map');
for (const [map, kills] of killsByMap) {
  const total = [...kills.values()].reduce((a, b) => a + b, 0);
  console.log(`  ${MAPS[map].name.padEnd(10)} ${String(total).padStart(5)} kills  ${WEAPON_IDS.map((id) => `${id} ${pct(kills.get(GUNS[id].name) ?? 0, total)}`).join('  ')}`);
}
console.log('\ndeaths per life started, by armor');
for (const a of ARMOR_IDS) console.log(`  ${a.padEnd(8)} ${pct(deathsByArmor.get(a) ?? 0, livesByArmor.get(a) ?? 0)} of ${livesByArmor.get(a) ?? 0} lives`);
console.log(`\nlife length: median ${(median(lifeMs) / 1000).toFixed(1)}s over ${lifeMs.length} deaths`);
console.log(`tier reached per life (thresholds ${LEVEL_SCORES.join('/')}):`);
for (const tier of [1, 2, 3]) console.log(`  tier ${tier}: ${pct(lifeTiers.filter((t) => t >= tier).length, lifeTiers.length)}`);

const DUEL_SEEDS = 25;
const DUEL_CAP_MS = 15_000;
function timeToKill(weapon: WeaponId, armor: ArmorId, range: number, seed: number): number {
  const w = createWorld('FFA', seed, 'boneyard');
  w.walls = [];
  w.crates = [];
  const shooter = addPlayer(w, 'shooter', { weapon, armor: 'none', color: 'red' }, { at: { x: 500, y: 1500 } });
  const target = addPlayer(w, 'target', { weapon: 'pistol', armor, color: 'blue' }, { at: { x: 500 + range, y: 1500 } });
  for (let t = 0, shots = 1; t < DUEL_CAP_MS; t += TICK_MS, shots++) {
    setInput(w, shooter.id, shots, { ...IDLE_INPUT, fire: true, shots });
    step(w, TICK_MS);
    if (target.life.k === 'dead') return w.now;
  }
  return Infinity;
}
const RANGES = [100, 250, 400];
console.log(`\nduel: median seconds to kill a still target (${DUEL_SEEDS} seeds; inf = alive after ${DUEL_CAP_MS / 1000}s)`);
console.log(`  ${'weapon'.padEnd(12)}${ARMOR_IDS.flatMap((a) => RANGES.map((d) => `${a[0]}@${d}`.padStart(8))).join('')}`);
for (const weapon of WEAPON_IDS) {
  const cells = ARMOR_IDS.flatMap((armor) => RANGES.map((d) => {
    const s = median(Array.from({ length: DUEL_SEEDS }, (_, i) => timeToKill(weapon, armor, d, i + 1))) / 1000;
    return (Number.isFinite(s) ? s.toFixed(2) : 'inf').padStart(8);
  }));
  console.log(`  ${weapon.padEnd(12)}${cells.join('')}`);
}
