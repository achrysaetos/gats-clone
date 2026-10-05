/// <reference types="node" />
// Usage: node scripts/bench-maps.ts <FFA|TDM|DOM> [maps=rotation] [minutes=10] [players=minPlayers] [heatDir]
import { mkdirSync, writeFileSync } from 'node:fs';
import { GUN_IDS, GUNS, MODE_IDS, WORLD, type ModeId } from '../src/shared/defs.ts';
import { MAPS, ROTATION, type MapId } from '../src/shared/maps.ts';
import { addPlayer, canRespawn, respawn, setInput, step } from '../src/shared/sim.ts';
import { snapshotFor, wallViews } from '../src/shared/sim/snapshot.ts';
import { choosePick } from '../src/shared/sim/stats.ts';
import { createWorld, rand, type World } from '../src/shared/sim/world.ts';
import { botThink, newBotMemory, randomLoadout, type BotMemory } from '../src/server/bots.ts';

const mode = MODE_IDS.find((m) => m === process.argv[2]) satisfies ModeId | undefined;
if (!mode || mode === 'ZOM') throw new Error('usage: bench-maps.ts <FFA|TDM|DOM> [maps] [minutes] [players] [heatDir]');
const maps = (process.argv[3] && process.argv[3] !== 'rotation' ? process.argv[3].split(',') : ROTATION[mode]) as MapId[];
const minutes = Number(process.argv[4] ?? 10);
const players = Number(process.argv[5] ?? WORLD.minPlayers);
const heatDir = process.argv[6];
const TICK_MS = 1000 / WORLD.tickHz;
const SEEDS = [1, 2];
const FIGHT_GAP_MS = 3000;
const TARGETS: Record<Exclude<ModeId, 'ZOM'>, number[]> = { FFA: [10, 20, 30, 40, 50], TDM: [50, 100, 150, 200, 250], DOM: [1000, 2000, 3000, 4000] };

const quantile = (xs: readonly number[], q: number) => {
  if (!xs.length) return NaN;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor(q * s.length))]!;
};
const pct = (n: number, total: number) => `${((100 * n) / Math.max(1, total)).toFixed(0)}%`;
const RANGE_BUCKETS = [200, 400, 600, 900, 1200, 1800, Infinity];
const sec = (ms: number) => (Number.isFinite(ms) ? (ms / 1000).toFixed(1) : '-');
const sizeOf = (map: MapId) => MAPS[map].size;

type Sim = { w: World; bots: Map<number, BotMemory>; r: () => number };

function fill(map: MapId, seed: number): Sim {
  const w = createWorld(mode!, seed, map);
  const r = () => rand(w);
  const bots = new Map<number, BotMemory>();
  for (let i = 0; i < players; i++) {
    const p = addPlayer(w, `bot${i}`, randomLoadout(r));
    bots.set(p.id, newBotMemory(r, sizeOf(map)));
  }
  return { w, bots, r };
}

function tick({ w, bots, r }: Sim): { respawned: number[]; ms: number } {
  const t0 = performance.now();
  const walls = wallViews(w);
  const respawned: number[] = [];
  for (const [id, mem] of bots) {
    const d = botThink(snapshotFor(w, id), walls, mem, r, sizeOf(w.map));
    bots.set(id, d.mem);
    setInput(w, id, w.tick, d.input);
    if (d.pick) choosePick(w, id, d.pick.level, d.pick.option);
    if (canRespawn(w, id) && respawn(w, id, randomLoadout(r))) respawned.push(id);
  }
  step(w, TICK_MS);
  return { respawned, ms: performance.now() - t0 };
}

type Contact = { bornAt: number; lastAt: number | null };
type Tally = { firstContact: number[]; betweenFights: number[]; tickMs: number[]; dmg: number[]; death: number[]; range: number[] };

function watch(sim: Sim, contact: Map<number, Contact>, t: Tally, respawned: readonly number[]) {
  const { w } = sim;
  for (const id of respawned) contact.set(id, { bornAt: w.now, lastAt: null });
  const touch = (id: number) => {
    const c = contact.get(id) ?? { bornAt: 0, lastAt: null };
    if (c.lastAt === null) t.firstContact.push(w.now - c.bornAt);
    else if (w.now - c.lastAt > FIGHT_GAP_MS) t.betweenFights.push(w.now - c.lastAt);
    contact.set(id, { ...c, lastAt: w.now });
  };
  const touched = new Set<number>();
  for (const e of w.events) {
    if (e.e === 'dmg' && e.kind === 'player' && e.attacker !== null && e.attacker !== e.victim) {
      touched.add(e.attacker);
      touched.add(e.victim);
      t.dmg.push(Math.round(e.x), Math.round(e.y));
      const shooter = w.players.get(e.attacker);
      if (shooter) t.range.push(Math.hypot(shooter.x - e.x, shooter.y - e.y));
    } else if (e.e === 'kill') {
      const v = w.players.get(e.victimId);
      if (v) t.death.push(Math.round(v.x), Math.round(v.y));
    }
  }
  for (const id of touched) touch(id);
}

const leader = (w: World) => (mode === 'FFA' ? Math.max(0, ...[...w.players.values()].map((p) => p.kills)) : Math.max(w.teamScore.red, w.teamScore.blue));

console.log(`bench-maps ${mode}: ${players} bots, ${minutes} min held open per seed, seeds ${SEEDS.join(',')}`);
const ranges = [...new Set(GUN_IDS.map((id) => GUNS[id].range))].sort((a, b) => a - b);
console.log(`gun ranges (px, guns at each): ${ranges.map((r) => `${r} x${GUN_IDS.filter((id) => GUNS[id].range === r).length}`).join(', ')}; view radius ${WORLD.viewRadius}`);
for (const map of maps) {
  const t: Tally = { firstContact: [], betweenFights: [], tickMs: [], dmg: [], death: [], range: [] };
  const rounds: { ms: number; winner: string }[] = [];
  const reach = new Map<number, number[]>();
  let kills = 0;
  let simMs = 0;
  for (const seed of SEEDS) {
    const real = fill(map, seed);
    while (real.w.map === map && real.w.match.k === 'playing' && real.w.now < 60 * 60_000) tick(real);
    rounds.push({ ms: real.w.now, winner: real.w.match.k === 'over' ? real.w.match.winner.name : 'nobody' });
    const open = fill(map, seed);
    const contact = new Map<number, Contact>([...open.bots.keys()].map((id) => [id, { bornAt: 0, lastAt: null }]));
    const banked = { red: 0, blue: 0 };
    const reached = new Map<number, number>();
    for (let ms = 0; ms < minutes * 60_000; ms += TICK_MS) {
      open.w.mapChangeAt = Infinity;
      const { respawned, ms: took } = tick(open);
      t.tickMs.push(took);
      watch(open, contact, t, respawned);
      kills += open.w.events.filter((e) => e.e === 'kill').length;
      if (mode !== 'FFA') {
        banked.red += open.w.teamScore.red; banked.blue += open.w.teamScore.blue;
        open.w.teamScore = { red: 0, blue: 0 };
      }
      const lead = mode === 'FFA' ? leader(open.w) : Math.max(banked.red, banked.blue);
      for (const target of TARGETS[mode]) if (lead >= target && !reached.has(target)) reached.set(target, open.w.now);
    }
    simMs += minutes * 60_000;
    for (const target of TARGETS[mode]) reach.set(target, [...(reach.get(target) ?? []), reached.get(target) ?? Infinity]);
  }
  console.log(`\n${MAPS[map].name} (${sizeOf(map)}px)`);
  console.log(`  rounds under the rules: ${rounds.map((r) => `${sec(r.ms)}s ${r.winner}`).join(', ')}`);
  console.log(`  leader reaches ${TARGETS[mode].map((s) => `${s}: ${(reach.get(s) ?? []).map(sec).join('/')}s`).join('  ')}`);
  console.log(`  kills/min ${(kills / (simMs / 60_000)).toFixed(1)}`);
  console.log(`  first contact after spawn: median ${sec(quantile(t.firstContact, 0.5))}s  p75 ${sec(quantile(t.firstContact, 0.75))}s  (${t.firstContact.length} lives)`);
  console.log(`  time between fights: median ${sec(quantile(t.betweenFights, 0.5))}s  p75 ${sec(quantile(t.betweenFights, 0.75))}s  (${t.betweenFights.length} gaps over ${FIGHT_GAP_MS / 1000}s)`);
  const buckets = RANGE_BUCKETS.map((b, i) => `<${b} ${pct(t.range.filter((d) => d >= (RANGE_BUCKETS[i - 1] ?? 0) && d < b).length, t.range.length)}`);
  console.log(`  shooter to victim on damaging hits: p50 ${quantile(t.range, 0.5).toFixed(0)}  p90 ${quantile(t.range, 0.9).toFixed(0)}  max ${Math.max(...t.range).toFixed(0)}px  ${buckets.join('  ')}`);
  console.log(`  tick (bots think + step): p50 ${quantile(t.tickMs, 0.5).toFixed(2)}ms  p95 ${quantile(t.tickMs, 0.95).toFixed(2)}ms  max ${Math.max(...t.tickMs).toFixed(2)}ms`);
  if (heatDir) {
    mkdirSync(heatDir, { recursive: true });
    writeFileSync(`${heatDir}/heat-${map}-${mode}.json`, JSON.stringify({ map, mode, size: sizeOf(map), dmg: t.dmg, death: t.death }));
  }
}
