/// <reference types="node" />
// Usage: node scripts/bench-maps.ts <FFA|TDM|DOM> [maps=rotation] [minutes=10] [players=minPlayers] [heatDir|-] [seeds=2] [capMinutes=60]
import { mkdirSync, writeFileSync } from 'node:fs';
import { GUN_IDS, GUNS, MODE_IDS, WORLD, type ModeId } from '../src/shared/defs.ts';
import { MAPS, ROTATION, type MapId } from '../src/shared/maps.ts';
import { addPlayer, step } from '../src/shared/sim.ts';
import { circleHitsRect, segmentEntersRectAt, type Rect } from '../src/shared/sim/movement.ts';
import { effectiveStats } from '../src/shared/sim/stats.ts';
import { coverRects, createWorld, isEnemy, rand, type Player, type World } from '../src/shared/sim/world.ts';
import { newBotMemory, randomLoadout, type BotMemory } from '../src/server/bots.ts';
import { thinkBots } from '../src/server/bot/tick.ts';
import { median, pct, quantile, sec } from './lib/stats.ts';

const mode = MODE_IDS.find((m) => m === process.argv[2]) satisfies ModeId | undefined;
if (!mode || mode === 'ZOM' || mode === 'BR' || mode === 'RNG') throw new Error('usage: bench-maps.ts <FFA|TDM|DOM> [maps] [minutes] [players] [heatDir|-] [seeds] [capMinutes]');
const maps = (process.argv[3] && process.argv[3] !== 'rotation' ? process.argv[3].split(',') : ROTATION[mode]) as MapId[];
const minutes = Number(process.argv[4] ?? 10);
const players = Number(process.argv[5] ?? WORLD.minPlayers);
const heatDir = process.argv[6] && process.argv[6] !== '-' ? process.argv[6] : undefined;
const SEEDS = Array.from({ length: Number(process.argv[7] ?? 2) }, (_, i) => i + 1);
const capMinutes = Number(process.argv[8] ?? 60);
const TICK_MS = 1000 / WORLD.tickHz;
const FIGHT_GAP_MS = 3000;
const COVER_HUG_PX = 40;
const LOOKBACK_TICKS = Math.round(1500 / TICK_MS);
const LOSING_HP_FRAC = 0.5;
const WIN_SCORE: Partial<Record<ModeId, number>> = { TDM: WORLD.tdmWinScore, DOM: WORLD.domWinScore };
const TARGETS: Record<Exclude<ModeId, 'ZOM' | 'BR' | 'RNG'>, number[]> = { FFA: [10, 20, 30, 40, 50], TDM: [50, 100, 150, 200, 250], DOM: [1000, 2000, 3000, 4000] };

const RANGE_BUCKETS = [200, 400, 600, 900, 1200, 1800, Infinity];
const sizeOf = (map: MapId) => MAPS[map].size;
const mean = (xs: readonly number[]) => xs.reduce((a, b) => a + b, 0) / Math.max(1, xs.length);

type Sim = { w: World; bots: Map<number, BotMemory>; r: () => number };

function fill(map: MapId, seed: number): Sim {
  const w = createWorld(mode!, seed, map);
  const r = () => rand(w);
  const bots = new Map<number, BotMemory>();
  for (let i = 0; i < players; i++) {
    const p = addPlayer(w, `bot${i}`, randomLoadout(r));
    bots.set(p.id, newBotMemory(r));
  }
  return { w, bots, r };
}

function tick({ w, bots, r }: Sim): { respawned: number[]; thinkMs: number; stepMs: number } {
  const t0 = performance.now();
  const { respawned } = thinkBots(w, bots, r);
  const t1 = performance.now();
  step(w, TICK_MS);
  return { respawned, thinkMs: t1 - t0, stepMs: performance.now() - t1 };
}

type Pulse = { hpFrac: number; seenBy: number; allies: number };
type Life = { bornAt: number; lastFightAt: number | null; pulses: Pulse[] };
type Fight = { start: number; last: number; a: number; b: number };
type Watch = { lives: Map<number, Life>; fights: Map<string, Fight> };
type Tally = {
  firstContact: number[]; betweenFights: number[]; thinkMs: number[]; stepMs: number[]; tickMs: number[]; dmg: number[]; death: number[]; range: number[];
  lifeMs: number[]; fightMs: number[]; combatTicks: number; coverTicks: number; shots: number; stillShots: number;
  deaths: number; lowDeaths: number; outnumberedDeaths: number; losingDeaths: number;
  /** Deaths of a life that had evolved its gun once (stage 1) or twice (stage 2). */
  stage1Deaths: number; stage2Deaths: number;
};
const emptyTally = (): Tally => ({
  firstContact: [], betweenFights: [], thinkMs: [], stepMs: [], tickMs: [], dmg: [], death: [], range: [],
  lifeMs: [], fightMs: [], combatTicks: 0, coverTicks: 0, shots: 0, stillShots: 0, deaths: 0, lowDeaths: 0, outnumberedDeaths: 0, losingDeaths: 0, stage1Deaths: 0, stage2Deaths: 0,
});
const addTally = (into: Tally, t: Tally) => {
  for (const k of Object.keys(t) as (keyof Tally)[]) {
    const v = t[k];
    if (Array.isArray(v)) { const dst = into[k] as number[]; for (const x of v as number[]) dst.push(x); } else (into[k] as number) += v;
  }
};
const freshLife = (bornAt: number): Life => ({ bornAt, lastFightAt: null, pulses: [] });

const sees = (cover: readonly Rect[], a: Player, b: Player) => !cover.some((r) => segmentEntersRectAt(a.x, a.y, b.x - a.x, b.y - a.y, r) !== null);
const near = (a: Player, b: Player, px: number) => Math.hypot(a.x - b.x, a.y - b.y) <= px;

function recordBeforeThink(w: World, watch: Watch, t: Tally): Map<number, { x: number; y: number }> {
  const cover = coverRects(w);
  const players = [...w.players.values()];
  for (const p of players) {
    if (p.life.k !== 'alive') continue;
    const enemies = players.filter((o) => o.life.k === 'alive' && isEnemy(p, o) && near(p, o, WORLD.viewRadius));
    const seenBy = enemies.filter((o) => sees(cover, o, p)).length;
    const allies = players.filter((o) => o.id !== p.id && o.life.k === 'alive' && !isEnemy(p, o) && near(p, o, WORLD.viewRadius)).length;
    const ring = watch.lives.get(p.id)!.pulses;
    ring.push({ hpFrac: p.life.hp / effectiveStats(p).maxHp, seenBy, allies });
    if (ring.length > LOOKBACK_TICKS) ring.shift();
    if (enemies.length === 0) continue;
    t.combatTicks++;
    const foe = enemies.reduce((a, b) => (Math.hypot(a.x - p.x, a.y - p.y) <= Math.hypot(b.x - p.x, b.y - p.y) ? a : b));
    if (cover.some((c) => circleHitsRect(p.x, p.y, WORLD.playerRadius + COVER_HUG_PX, c) && segmentEntersRectAt(foe.x, foe.y, p.x - foe.x, p.y - foe.y, c) !== null)) t.coverTicks++;
  }
  return new Map(players.map((p) => [p.id, { x: p.x, y: p.y }]));
}

function recordAfterStep(w: World, watch: Watch, t: Tally, respawned: readonly number[], before: ReadonlyMap<number, { x: number; y: number }>) {
  for (const id of respawned) watch.lives.set(id, freshLife(w.now));
  const closeFight = (key: string, end: number) => { t.fightMs.push(end - watch.fights.get(key)!.start); watch.fights.delete(key); };
  const touch = (id: number) => {
    const life = watch.lives.get(id) ?? freshLife(0);
    if (life.lastFightAt === null) t.firstContact.push(w.now - life.bornAt);
    else if (w.now - life.lastFightAt > FIGHT_GAP_MS) t.betweenFights.push(w.now - life.lastFightAt);
    watch.lives.set(id, { ...life, lastFightAt: w.now });
  };
  const touched = new Set<number>();
  for (const e of w.events) {
    if (e.e === 'shot') {
      const p = w.players.get(e.owner), was = before.get(e.owner);
      if (!p || !was) continue;
      t.shots++;
      if (p.x === was.x && p.y === was.y) t.stillShots++;
    } else if (e.e === 'dmg' && e.kind === 'player' && e.attacker !== null && e.attacker !== e.victim) {
      touched.add(e.attacker);
      touched.add(e.victim);
      t.dmg.push(Math.round(e.x), Math.round(e.y));
      const shooter = w.players.get(e.attacker);
      if (shooter) t.range.push(Math.hypot(shooter.x - e.x, shooter.y - e.y));
      const [a, b] = e.attacker < e.victim ? [e.attacker, e.victim] : [e.victim, e.attacker];
      const key = `${a}:${b}`;
      const f = watch.fights.get(key);
      if (f) f.last = w.now; else watch.fights.set(key, { start: w.now, last: w.now, a, b });
    } else if (e.e === 'kill') {
      const v = w.players.get(e.victimId);
      if (v) t.death.push(Math.round(v.x), Math.round(v.y));
      const stage = v ? GUNS[v.gun].stage : 0;
      if (stage === 1) t.stage1Deaths++;
      if (stage === 2) t.stage2Deaths++;
      const life = watch.lives.get(e.victimId);
      t.deaths++;
      t.lifeMs.push(w.now - (life?.bornAt ?? 0));
      const then = life?.pulses[0];
      if (then) {
        const low = then.hpFrac < LOSING_HP_FRAC, outnumbered = then.seenBy > then.allies + 1;
        if (low) t.lowDeaths++;
        if (outnumbered) t.outnumberedDeaths++;
        if (low && outnumbered) t.losingDeaths++;
      }
      for (const [key, f] of watch.fights) if (f.a === e.victimId || f.b === e.victimId) closeFight(key, w.now);
    }
  }
  for (const id of touched) touch(id);
  for (const [key, f] of watch.fights) if (w.now - f.last > FIGHT_GAP_MS) closeFight(key, f.last);
}

const lifeReport = (t: Tally) => [
  `life mean ${sec(mean(t.lifeMs))}s median ${sec(median(t.lifeMs))}s`,
  `fight mean ${sec(mean(t.fightMs))}s median ${sec(median(t.fightMs))}s`,
  `in cover ${pct(t.coverTicks, t.combatTicks)}`,
  `still shots ${pct(t.stillShots, t.shots)}`,
  `deaths low ${pct(t.lowDeaths, t.deaths)} outnumbered ${pct(t.outnumberedDeaths, t.deaths)} both ${pct(t.losingDeaths, t.deaths)}`,
  `lives evolved stage 1+ ${pct(t.stage1Deaths + t.stage2Deaths, t.deaths)} stage 2 ${pct(t.stage2Deaths, t.deaths)}`,
].join('  ');

function holdRoundOpen(w: World, banked: { red: number; blue: number }) {
  w.mapChangeAt = Infinity;
  banked.red += w.teamScore.red; banked.blue += w.teamScore.blue;
  w.teamScore = { red: 0, blue: 0 };
}

const leader = (w: World) => (mode === 'FFA' ? Math.max(0, ...[...w.players.values()].map((p) => p.kills)) : Math.max(w.teamScore.red, w.teamScore.blue));

const target = WIN_SCORE[mode];
console.log(`bench-maps ${mode}: ${players} bots, ${minutes} min held open per seed, seeds ${SEEDS.join(',')}, rounds capped at ${capMinutes} min`);
const ranges = [...new Set(GUN_IDS.map((id) => GUNS[id].range))].sort((a, b) => a - b);
console.log(`gun ranges (px, guns at each): ${ranges.map((r) => `${r} x${GUN_IDS.filter((id) => GUNS[id].range === r).length}`).join(', ')}; view radius ${WORLD.viewRadius}`);
const all = emptyTally();
const wins: number[] = [];
for (const map of maps) {
  const t = emptyTally();
  const rounds: { ms: number; winner: string; won: boolean; top: number }[] = [];
  const reach = new Map<number, number[]>();
  let kills = 0;
  let simMs = 0;
  for (const seed of SEEDS) {
    const real = fill(map, seed);
    while (real.w.map === map && real.w.match.k === 'playing' && real.w.now < capMinutes * 60_000) tick(real);
    const top = Math.max(real.w.teamScore.red, real.w.teamScore.blue);
    const won = target !== undefined && real.w.match.k === 'over' && top >= target;
    rounds.push({ ms: real.w.now, winner: real.w.match.k === 'over' ? real.w.match.winner.name : 'nobody', won, top });
    if (won) wins.push(real.w.now);
    const open = fill(map, seed);
    const watch: Watch = { lives: new Map([...open.bots.keys()].map((id) => [id, freshLife(0)])), fights: new Map() };
    const banked = { red: 0, blue: 0 };
    const reached = new Map<number, number>();
    for (let ms = 0; ms < minutes * 60_000; ms += TICK_MS) {
      holdRoundOpen(open.w, banked);
      const before = recordBeforeThink(open.w, watch, t);
      const { respawned, thinkMs, stepMs } = tick(open);
      t.thinkMs.push(thinkMs);
      t.stepMs.push(stepMs);
      t.tickMs.push(thinkMs + stepMs);
      recordAfterStep(open.w, watch, t, respawned, before);
      kills += open.w.events.filter((e) => e.e === 'kill').length;
      const lead = mode === 'FFA' ? leader(open.w) : Math.max(banked.red, banked.blue);
      for (const score of TARGETS[mode]) if (lead >= score && !reached.has(score)) reached.set(score, open.w.now);
    }
    simMs += minutes * 60_000;
    for (const score of TARGETS[mode]) reach.set(score, [...(reach.get(score) ?? []), reached.get(score) ?? Infinity]);
  }
  addTally(all, t);
  console.log(`\n${MAPS[map].name} (${sizeOf(map)}px)`);
  console.log(`  rounds under the rules: ${rounds.map((r) => `${sec(r.ms)}s ${r.winner}`).join(', ')}`);
  if (target !== undefined) console.log(`  to ${target}: ${rounds.map((r) => (r.won ? `${sec(r.ms)}s` : `cap (${Math.round(r.top)})`)).join(' ')}`);
  console.log(`  leader reaches ${TARGETS[mode].map((s) => `${s}: ${(reach.get(s) ?? []).map(sec).join('/')}s`).join('  ')}`);
  console.log(`  kills/min ${(kills / (simMs / 60_000)).toFixed(1)}`);
  console.log(`  first contact after spawn: median ${sec(median(t.firstContact))}s  p75 ${sec(quantile(t.firstContact, 0.75))}s  (${t.firstContact.length} lives)`);
  console.log(`  time between fights: median ${sec(median(t.betweenFights))}s  p75 ${sec(quantile(t.betweenFights, 0.75))}s  (${t.betweenFights.length} gaps over ${FIGHT_GAP_MS / 1000}s)`);
  console.log(`  ${lifeReport(t)}`);
  const buckets = RANGE_BUCKETS.map((b, i) => `<${b} ${pct(t.range.filter((d) => d >= (RANGE_BUCKETS[i - 1] ?? 0) && d < b).length, t.range.length, 0)}`);
  console.log(`  shooter to victim on damaging hits: p50 ${quantile(t.range, 0.5).toFixed(0)}  p90 ${quantile(t.range, 0.9).toFixed(0)}  max ${Math.max(...t.range).toFixed(0)}px  ${buckets.join('  ')}`);
  const msAt = (xs: readonly number[], q: number) => `${quantile(xs, q).toFixed(2)}ms`;
  console.log(`  tick (bots think + step): p50 ${msAt(t.tickMs, 0.5)}  p95 ${msAt(t.tickMs, 0.95)}  max ${msAt(t.tickMs, 1)}`);
  console.log(`  think: mean ${mean(t.thinkMs).toFixed(2)}ms  p50 ${msAt(t.thinkMs, 0.5)}  p95 ${msAt(t.thinkMs, 0.95)}  p99 ${msAt(t.thinkMs, 0.99)}  max ${msAt(t.thinkMs, 1)}  step: p50 ${msAt(t.stepMs, 0.5)}  p95 ${msAt(t.stepMs, 0.95)}  max ${msAt(t.stepMs, 1)}  (tick budget ${TICK_MS.toFixed(1)}ms)`);
  if (heatDir) {
    mkdirSync(heatDir, { recursive: true });
    writeFileSync(`${heatDir}/heat-${map}-${mode}.json`, JSON.stringify({ map, mode, size: sizeOf(map), dmg: t.dmg, death: t.death }));
  }
}
console.log(`\nall maps  ${lifeReport(all)}`);
if (target !== undefined) console.log(`  match to ${target}: mean ${sec(mean(wins))}s median ${sec(median(wins))}s, ${SEEDS.length * maps.length - wins.length} of ${SEEDS.length * maps.length} hit the ${capMinutes} min cap`);
