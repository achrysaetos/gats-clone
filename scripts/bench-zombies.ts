/// <reference types="node" />
// Usage: node scripts/bench-zombies.ts [seeds] [squad] [runs]
//   runs: skip the full-horde cost samples.
//   seeds: comma-separated, default 1,2,3. squad: 4 runs four bots; 1 runs one bot-brained player with a human's triple health, alone.
// Plays zombies runs to the core's fall or the Tide's dawn and prints the nights reached and how each night went (seconds it lasted, core health lost,
// survivors at dawn, turrets standing), then the win rate and the mean core health bitten off on each night across the seeds.
// Then holds a full horde of ZOM.maxAlive on the squad with an unbreakable core and prints server step cost and snapshot size under it,
// first with no buildings, then with a ring of a dozen always-loaded sentries and cannons round the core, then with two full rings of them.
import { BUILDINGS, WORLD, ZOM, type TurretKind } from '../src/shared/defs.ts';
import { MAPS } from '../src/shared/maps.ts';
import type { Snapshot } from '../src/shared/protocol.ts';
import { addPlayer, step } from '../src/shared/sim.ts';
import { snapshotFor } from '../src/shared/sim/snapshot.ts';
import { zombieMaxHp } from '../src/shared/sim/run.ts';
import { createWorld, newId, rand, type World } from '../src/shared/sim/world.ts';
import { makeSnapshotEncoder } from '../src/shared/wire.ts';
import { newBotMemory, randomLoadout, type BotMemory } from '../src/server/bots.ts';
import { thinkBots } from '../src/server/bot/tick.ts';
import { quantile } from './lib/stats.ts';

const seeds = (process.argv[2] ?? '1,2,3').split(',').map(Number);
const squad = Number(process.argv[3] ?? ZOM.squadSize);
const TICK_MS = 1000 / WORLD.tickHz;
const MAX_NIGHTS = 40;

const ms = (v: number) => v.toFixed(2);

type Squad = { w: World; bots: Map<number, BotMemory>; encoders: Map<number, (snap: Snapshot) => string>; r: () => number };

function newSquad(seed: number): Squad {
  const w = createWorld('ZOM', seed, 'outpost');
  const r = () => rand(w);
  const bots = new Map<number, BotMemory>();
  for (let i = 0; i < squad; i++) {
    const p = addPlayer(w, `bot${i}`, randomLoadout(r), { kind: squad === 1 ? 'human' : 'bot' });
    bots.set(p.id, newBotMemory(r));
  }
  return { w, bots, r, encoders: new Map([...bots.keys()].map((id) => [id, makeSnapshotEncoder()])) };
}

/** One server tick as a room runs it: bot brains, the step, and every squad player's encoded snapshot. */
function tick({ w, bots, r, encoders }: Squad) {
  const started = performance.now();
  thinkBots(w, bots, r, { respawn: false });
  const t0 = performance.now();
  step(w, TICK_MS);
  const stepMs = performance.now() - t0;
  let wire = '';
  for (const [id, encode] of encoders) {
    const json = encode(snapshotFor(w, id, w.events));
    if (json.length > wire.length) wire = json;
  }
  return { stepMs, tickMs: performance.now() - started, bytes: wire.length, wire };
}

const coreLost: number[][] = [];
let wins = 0;
for (const seed of seeds) {
  const sq = newSquad(seed);
  const { w } = sq;
  const nights: string[] = [];
  const lost: number[] = [];
  let nightStart = 0, downs = 0, revives = 0, peak = 0, coreWas: number = ZOM.coreHp, bitten = 0;
  const started = performance.now();
  for (let night = w.run!.night; w.run!.phase.k !== 'over' && w.run!.night <= MAX_NIGHTS;) {
    tick(sq);
    const run = w.run!;
    peak = Math.max(peak, w.zombies.length);
    for (const e of w.events) if (e.e === 'life') { if (e.k === 'downed') downs++; if (e.k === 'revived') revives++; }
    bitten += Math.max(0, coreWas - Math.max(0, run.core.hp));
    coreWas = run.core.hp;
    if (run.night !== night || run.phase.k === 'over') {
      lost[night - 1] = Math.round(bitten);
      bitten = 0;
      nights.push(`n${night} ${((w.now - nightStart) / 1000).toFixed(0)}s -${lost[night - 1]} core, ${run.survivors} left, ${w.buildings.length} up`);
      night = run.night;
      nightStart = w.now;
    }
  }
  coreLost.push(lost);
  const run = w.run!;
  const won = run.phase.k === 'over' && run.phase.won;
  if (won) wins++;
  const reached = run.phase.k === 'over' ? run.phase.night : run.night;
  console.log(`seed ${seed}: ${won ? 'WON' : 'fell'} on night ${reached}${run.phase.k === 'over' ? '' : ' (capped)'}, ${run.survivors} survivors, ${(w.now / 60_000).toFixed(1)} game min, `
    + `${((performance.now() - started) / 1000).toFixed(1)}s wall, peak ${peak} alive, ${downs} downs, ${revives} revives, scrap left ${Math.floor(run.scrap)}`);
  console.log(`  ${nights.join(' | ')}`);
}
const longest = Math.max(...coreLost.map((l) => l.length));
const mean = Array.from({ length: longest }, (_, i) => Math.round(coreLost.reduce((n, l) => n + (l[i] ?? 0), 0) / coreLost.length));
const hurt = Array.from({ length: longest }, (_, i) => coreLost.filter((l) => (l[i] ?? 0) > 0).length);
console.log(`won ${wins}/${seeds.length}; mean core lost by night: ${mean.map((m, i) => `n${i + 1} ${m}`).join(' ')}; runs hurt by night: ${hurt.join(' ')}`);

if (process.argv[4] === 'runs') process.exit(0);
const sq = newSquad(seeds[0]!);
const run = sq.w.run!;
run.core.hp = Infinity;
run.night = 10;
run.phase = { k: 'night', toSpawn: [], nextSpawnAt: Infinity };
// The squad cannot fall either, so it keeps firing into the horde for the whole sample, and the horde is topped up at its edges to the cap every tick.
let shots = 0, kills = 0, turretShots = 0;
const horde = Object.values(MAPS.outpost.siege!.horde);
const holdOut = () => {
  for (const p of sq.w.players.values()) if (p.life.k === 'alive') p.life.hp = 1e9;
  for (const b of sq.w.buildings) if (b.kind !== 'wall') b.ammo = BUILDINGS[b.kind].turret.ammo;
  while (sq.w.zombies.length < ZOM.maxAlive) {
    const edge = horde[Math.floor(sq.r() * horde.length)]!;
    sq.w.zombies.push({ id: newId(sq.w), kind: 'walker', x: edge.x + sq.r() * edge.w, y: edge.y + sq.r() * edge.h, hp: zombieMaxHp('walker', run.night), attackAt: 0 });
  }
  const t = tick(sq);
  for (const e of sq.w.events) { if (e.e === 'shot') shots++; if (e.e === 'zkill') kills++; if (e.e === 'turret') turretShots++; }
  return t;
};

function sample(label: string) {
  for (let i = 0; i < 900; i++) holdOut();
  shots = kills = turretShots = 0;
  const samples = Array.from({ length: 600 }, holdOut);
  const col = (k: 'stepMs' | 'tickMs' | 'bytes') => samples.map((x) => x[k]);
  console.log(`${label}: ${ZOM.maxAlive} alive, ${squad} squad firing (${shots} shots, ${turretShots} turret shots, ${kills} kills), ${samples.length} ticks: `
    + `step ms p50 ${ms(quantile(col('stepMs'), 0.5))} p95 ${ms(quantile(col('stepMs'), 0.95))} max ${ms(Math.max(...col('stepMs')))}; `
    + `whole tick p95 ${ms(quantile(col('tickMs'), 0.95))}; snapshot bytes p50 ${quantile(col("bytes"), 0.5)} p95 ${quantile(col("bytes"), 0.95)} max ${Math.max(...col('bytes'))}`);
  const biggest = JSON.parse(samples.reduce((a, b) => (b.bytes > a.bytes ? b : a)).wire) as Record<string, unknown>;
  console.log(`  biggest snapshot by field: ${Object.entries(biggest).map(([k, v]) => `${k} ${JSON.stringify(v).length}`).join(', ')}`);
  const kinds = new Map<string, number>();
  for (const e of biggest.events as { e: string }[]) kinds.set(e.e, (kinds.get(e.e) ?? 0) + JSON.stringify(e).length);
  console.log(`  its events by kind: ${[...kinds].map(([k, n]) => `${k} ${n}`).join(', ')}`);
}

sample('no buildings');
/** Turrets on the ring of cells `k` out from the core's, every `every`th cell, every third turret a cannon. */
function ringOfTurrets(k: number, every: number) {
  const owner = [...sq.w.players.keys()][0]!;
  let i = 0;
  for (let cy = 29 - k; cy <= 30 + k; cy++) for (let cx = 29 - k; cx <= 30 + k; cx++) {
    if ((cx !== 29 - k && cx !== 30 + k && cy !== 29 - k && cy !== 30 + k) || i++ % every !== 0) continue;
    if (sq.w.buildings.some((b) => b.cx === cx && b.cy === cy)) continue;
    const kind: TurretKind = sq.w.buildings.length % 3 === 2 ? 'cannon' : 'sentry';
    sq.w.buildings.push({ id: newId(sq.w), kind, cx, cy, hp: BUILDINGS[kind].hp, owner, ammo: BUILDINGS[kind].turret.ammo, nextFireAt: 0 });
  }
  sq.w.buildingsVersion++;
  for (const p of sq.w.players.values()) { p.x = 1500; p.y = 1400; }
  const counts = sq.w.buildings.reduce<Record<string, number>>((n, b) => ({ ...n, [b.kind]: (n[b.kind] ?? 0) + 1 }), {});
  return `${counts.sentry ?? 0} sentries and ${counts.cannon ?? 0} cannons`;
}
sample(ringOfTurrets(3, 2));
ringOfTurrets(2, 1);
sample(ringOfTurrets(4, 1));
