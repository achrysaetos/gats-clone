/// <reference types="node" />
// Usage: node scripts/level-scale.ts [rooms=26] [minutes=3]
// Plays FFA rooms of bots across the rotation and prints what the level ladder (LEVELS in defs.ts) is set on: how often
// each medal fires (per kill, per kill with its own weapon class for the weapon feats, per life for the medals a kill does
// not earn), the share of score medals pay against kills and assists, and the score a life has just after each of its kills.
import { GUNS, LEVELS, MEDALS, WEAPON_MEDALS, WORLD, type MedalId } from '../src/shared/defs.ts';
import { ROTATION } from '../src/shared/maps.ts';
import { addPlayer, step } from '../src/shared/sim.ts';
import { levelForScore } from '../src/shared/sim/stats.ts';
import { createWorld, rand } from '../src/shared/sim/world.ts';
import { newBotMemory, randomLoadout, type BotMemory } from '../src/server/bots.ts';
import { thinkBots } from '../src/server/bot/tick.ts';
import { quantile } from './lib/stats.ts';

const rooms = Number(process.argv[2] ?? 26);
const minutes = Number(process.argv[3] ?? 3);
const TICK = 1000 / WORLD.tickHz;
const WEAPON_FEATS = new Set<MedalId>(['doubleTap', 'deadeye', 'runAndGun', 'twoBirds', 'longBarrel', 'disciplined', 'oneShot', 'noScope', 'eagleEye', 'reaper', 'pinnedDown', 'beltFed']);
const inc = <K>(m: Map<K, number>, k: K) => m.set(k, (m.get(k) ?? 0) + 1);

let kills = 0, killPts = 0, assistPts = 0, medalPts = 0;
const classKills = new Map<string, number>(), onKill = new Map<MedalId, number>(), offKill = new Map<MedalId, number>(), featClass = new Map<MedalId, string>();
const afterKill: number[][] = [];
const lifeLevels: number[] = [];
for (let i = 0; i < rooms; i++) {
  const w = createWorld('FFA', 1 + Math.floor(i / ROTATION.FFA.length), ROTATION.FFA[i % ROTATION.FFA.length]!);
  const r = () => rand(w);
  const bots = new Map<number, BotMemory>();
  for (let j = 0; j < WORLD.minPlayers; j++) bots.set(addPlayer(w, `bot${j}`, randomLoadout(r)).id, newBotMemory(r));
  for (let t = 0; t < minutes * 60_000; t += TICK) {
    const classOf = new Map([...w.players.values()].map((p) => [p.id, GUNS[p.gun].base as string]));
    thinkBots(w, bots, r); step(w, TICK);
    const killers = new Map<number, string>();
    for (const e of w.events) {
      if (e.e !== 'kill' || e.killerId === null || e.killerId === e.victimId) continue;
      const base = classOf.get(e.killerId) ?? '?';
      killers.set(e.killerId, base);
      kills++; killPts += WORLD.killScore; assistPts += e.assisters.length * WORLD.assistScore;
      inc(classKills, base);
      const p = w.players.get(e.killerId);
      if (p?.life.k === 'alive') (afterKill[p.lifeKills] ??= []).push(p.score);
    }
    for (const e of w.events) {
      if (e.e !== 'medal') continue;
      medalPts += MEDALS[e.medal].score;
      const base = killers.get(e.id);
      if (base === undefined) { inc(offKill, e.medal); continue; }
      inc(onKill, e.medal);
      if (WEAPON_FEATS.has(e.medal)) featClass.set(e.medal, base);
    }
    for (const rec of w.lifeRecords.splice(0)) lifeLevels.push(levelForScore(rec.score));
  }
}

const pc = (n: number, of: number) => `${((100 * n) / Math.max(1, of)).toFixed(1)}%`;
console.log(`${rooms} FFA rooms x ${minutes} min: ${kills} kills, ${lifeLevels.length} lives; weapon feats tuned in WEAPON_MEDALS ${JSON.stringify(WEAPON_MEDALS)}`);
console.log('medal              of kills   of own class kills   per life');
for (const id of new Set([...onKill.keys(), ...offKill.keys()])) {
  const n = onKill.get(id) ?? 0, cls = featClass.get(id);
  console.log(`  ${id.padEnd(16)} ${pc(n, kills).padStart(7)}   ${(cls ? `${pc(n, classKills.get(cls) ?? 0)} ${cls}` : '').padEnd(18)} ${offKill.has(id) ? pc(offKill.get(id)!, lifeLevels.length) : ''}`);
}
const total = killPts + medalPts + assistPts;
console.log(`score share: kills ${pc(killPts, total)}, medals ${pc(medalPts, total)}, assists ${pc(assistPts, total)} (before the catch-up bonus)`);
console.log('score just after a life\'s kth kill (lives that got that far): k n p25 median p75');
afterKill.forEach((xs, k) => { if (xs.length >= 5) console.log(`  ${String(k).padStart(2)} ${String(xs.length).padStart(5)} ${[0.25, 0.5, 0.75].map((q) => String(Math.round(quantile(xs, q))).padStart(5)).join(' ')}`); });
console.log(`lives reaching each pick: ${LEVELS.flatMap((l, i) => (l.pick ? [`${l.score} ${l.pick.k === 'evolve' ? 'evolve' : `tier ${l.pick.tier}`} ${pc(lifeLevels.filter((x) => x >= i).length, lifeLevels.length)}`] : [])).join(', ')}`);
