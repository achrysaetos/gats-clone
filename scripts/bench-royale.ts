/// <reference types="node" />
// Usage: node scripts/bench-royale.ts [--seeds 8] [--seed-base 1] [--maps oldtown,quarry,plaza,causeway] [--no-proxy] [--workers N]
import { availableParallelism } from 'node:os';
import { parseArgs } from 'node:util';
import { isMainThread, parentPort, Worker, workerData } from 'node:worker_threads';
import { COLOR_IDS, GUNS, RING, ROYALE, WORLD, type ColorId } from '../src/shared/defs.ts';
import { ROTATION, type MapId } from '../src/shared/maps.ts';
import type { GameEvent } from '../src/shared/protocol.ts';
import { addPlayer, step } from '../src/shared/sim.ts';
import { closedPhases } from '../src/shared/sim/royale.ts';
import { createWorld, rand, type World } from '../src/shared/sim/world.ts';
import { newBotMemory, randomLoadout, type BotMemory } from '../src/server/bots.ts';
import { thinkBots } from '../src/server/bot/tick.ts';
import { median } from './lib/stats.ts';

const TICK_MS = 1000 / WORLD.tickHz;
const CAP_MS = 15 * 60_000;
const PHASES = RING.length + 1;
const CONTEST_PX = 500;
const SAMPLE_TICKS = 15;
const BUCKET_MS = 30_000;
const TELEPORT_PX = 200;

type Activity = { aliveTicks: number; still: number; travel: number; shots: number; crates: number; scoreSum: number; scoreN: number; nearest: number[] };
const freshActivity = (): Activity => ({ aliveTicks: 0, still: 0, travel: 0, shots: 0, crates: 0, scoreSum: 0, scoreN: 0, nearest: [] });

type Spec = { map: MapId; seed: number; proxy: boolean };
type Result = {
  spec: Spec; won: boolean; ms: number; ringDeaths: number; playerDeaths: number; ringWipes: number; wipes: number;
  takedownsByPhase: number[]; phaseMs: number[];
  squadsLeftByMinute: number[]; lastFightPhase: number; survivorStages: number[];
  drops: number; contested: number; thinkMs: number; ticks: number; proxyTeam: ColorId | null; winner: ColorId | null; activity: Activity[];
};

const hash = (s: string) => { let h = 0x811c9dc5; for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 0x01000193); return h >>> 0; };

function play(spec: Spec): Result {
  const w: World = createWorld('BR', hash(`${spec.map}:${spec.seed}`), spec.map);
  const r = () => rand(w);
  const mems = new Map<number, BotMemory>();
  const proxyTeam = spec.proxy ? COLOR_IDS[spec.seed % COLOR_IDS.length]! : null;
  for (const team of COLOR_IDS) {
    for (let i = 0; i < ROYALE.squadSize; i++) {
      const kind = team === proxyTeam && i === 0 ? 'human' : 'bot';
      const p = addPlayer(w, `${team}${i}`, randomLoadout(r), { team, kind });
      mems.set(p.id, newBotMemory(r));
    }
  }
  const res: Result = {
    spec, won: false, ms: 0, ringDeaths: 0, playerDeaths: 0, ringWipes: 0, wipes: 0, takedownsByPhase: Array(PHASES).fill(0), phaseMs: Array(PHASES).fill(0),
    squadsLeftByMinute: [], lastFightPhase: -1, survivorStages: [], drops: 0, contested: 0, thinkMs: 0, ticks: 0, proxyTeam, winner: null, activity: [],
  };
  const dropSeen = new Map<number, boolean>();
  const lastCause = new Map<number, 'ring' | 'player'>();
  const lastPos = new Map<number, { x: number; y: number }>();
  const broken = new Set<number>();
  const ringBlow = (e: GameEvent) => (e.e === 'kill' && e.weapon === 'Ring') || (e.e === 'life' && e.k === 'finished' && e.by === null);
  while (w.match.k === 'playing' && w.now < CAP_MS) {
    const t0 = performance.now();
    thinkBots(w, mems, r);
    res.thinkMs += performance.now() - t0;
    const before = new Map([...w.players.values()].map((p) => [p.id, p.life.k]));
    step(w, TICK_MS);
    res.ticks++;
    const royale = w.royale!;
    const phase = closedPhases(royale.ring);
    res.phaseMs[phase] += TICK_MS;
    for (const e of w.events) {
      if (e.e === 'kill' || (e.e === 'life' && e.k === 'finished')) {
        const victim = e.e === 'kill' ? e.victimId : e.id;
        lastCause.set(victim, ringBlow(e) ? 'ring' : 'player');
      }
      if (e.e === 'kill' && e.weapon !== 'Ring') { res.takedownsByPhase[phase]++; res.lastFightPhase = phase; }
      if (e.e === 'wiped') {
        res.wipes++;
        const members = [...w.players.values()].filter((p) => p.team === e.team);
        if (members.every((p) => lastCause.get(p.id) === 'ring')) res.ringWipes++;
      }
    }
    const act = (res.activity[Math.floor((w.now - TICK_MS) / BUCKET_MS)] ??= freshActivity());
    act.shots += w.events.filter((e) => e.e === 'shot').length;
    for (const c of w.crates) if (c.respawnAt !== null && !broken.has(c.id)) { broken.add(c.id); act.crates++; }
    const up = [...w.players.values()].filter((p) => p.life.k === 'alive');
    for (const p of up) {
      const last = lastPos.get(p.id);
      lastPos.set(p.id, { x: p.x, y: p.y });
      const d = last ? Math.hypot(p.x - last.x, p.y - last.y) : Infinity;
      if (d >= TELEPORT_PX) continue;
      act.aliveTicks++;
      act.travel += d;
      if (d < 0.5) act.still++;
    }
    if (w.tick % WORLD.tickHz === 0 && up.length) {
      act.scoreSum += up.reduce((s, p) => s + p.score, 0) / up.length;
      act.scoreN++;
      for (const p of up) {
        const d = Math.min(...up.filter((o) => o.team !== p.team).map((o) => Math.hypot(o.x - p.x, o.y - p.y)));
        if (Number.isFinite(d)) act.nearest.push(d);
      }
    }
    for (const p of w.players.values()) {
      if (p.life.k !== 'dead' || before.get(p.id) === 'dead') continue;
      if (lastCause.get(p.id) === 'ring') res.ringDeaths++;
      else res.playerDeaths++;
    }
    if (w.tick % Math.round(60_000 / TICK_MS) === 0) res.squadsLeftByMinute.push(royale.squads.length - royale.out.length);
    if (w.tick % SAMPLE_TICKS === 0) {
      for (const c of w.crates) {
        if (c.tier !== 'drop') continue;
        if (!dropSeen.has(c.id)) dropSeen.set(c.id, false);
        if (c.respawnAt !== null || dropSeen.get(c.id)) continue;
        const near = new Set([...w.players.values()].filter((p) => p.life.k === 'alive' && Math.hypot(p.x - c.x, p.y - c.y) < CONTEST_PX).map((p) => p.team));
        if (near.size >= 2) dropSeen.set(c.id, true);
      }
    }
  }
  res.ms = w.now;
  res.drops = dropSeen.size;
  res.contested = [...dropSeen.values()].filter(Boolean).length;
  if (w.match.k === 'over') {
    res.won = true;
    const royale = w.royale!;
    res.winner = royale.squads.find((s) => !royale.out.includes(s)) ?? royale.out.at(-1)!;
    res.survivorStages = [...w.players.values()].filter((p) => p.life.k === 'alive').map((p) => GUNS[p.gun].stage);
  }
  return res;
}

if (!isMainThread) {
  parentPort!.postMessage((workerData as Spec[]).map(play));
} else {
  const { values: args } = parseArgs({ options: {
    seeds: { type: 'string', default: '8' }, 'seed-base': { type: 'string', default: '1' }, maps: { type: 'string', default: ROTATION.BR.join(',') },
    'no-proxy': { type: 'boolean', default: false }, workers: { type: 'string', default: String(availableParallelism()) },
  } });
  const maps = args.maps.split(',') as MapId[];
  const seeds = Array.from({ length: Number(args.seeds) }, (_, i) => Number(args['seed-base']) + i);
  const specs = maps.flatMap((map) => seeds.map((seed) => ({ map, seed, proxy: !args['no-proxy'] })));
  const n = Math.max(1, Math.min(Number(args.workers), specs.length));
  const started = performance.now();
  const results = (await Promise.all(Array.from({ length: n }, (_, i) => specs.filter((_, j) => j % n === i)).map((chunk) => new Promise<Result[]>((resolve, reject) => {
    const worker = new Worker(new URL(import.meta.url), { workerData: chunk });
    worker.once('message', resolve);
    worker.once('error', reject);
  })))).flat();

  const pc = (x: number) => `${(x * 100).toFixed(0)}%`;
  const min = (ms: number) => (ms / 60_000).toFixed(2);
  const sum = (xs: readonly number[]) => xs.reduce((a, b) => a + b, 0);
  const summarize = (label: string, rs: readonly Result[]) => {
    const won = rs.filter((x) => x.won);
    const deaths = sum(rs.map((x) => x.ringDeaths + x.playerDeaths));
    const lastTwo = won.filter((x) => x.lastFightPhase >= RING.length - 2).length;
    const proxied = rs.filter((x) => x.proxyTeam);
    const stages = rs.flatMap((x) => x.survivorStages);
    console.log(`${label.padEnd(10)} matches ${rs.length}  winner ${won.length}/${rs.length}  median ${min(median(rs.map((x) => x.ms)))} min (${min(Math.min(...rs.map((x) => x.ms)))}..${min(Math.max(...rs.map((x) => x.ms)))})` +
      `  ring deaths ${pc(sum(rs.map((x) => x.ringDeaths)) / Math.max(1, deaths))} of ${deaths}  ring wipes ${sum(rs.map((x) => x.ringWipes))}/${sum(rs.map((x) => x.wipes))}` +
      `  last fight in last two phases ${lastTwo}/${won.length}  drops contested ${sum(rs.map((x) => x.contested))}/${sum(rs.map((x) => x.drops))}` +
      `  think ${(sum(rs.map((x) => x.thinkMs)) / sum(rs.map((x) => x.ticks))).toFixed(2)} ms/tick` +
      (proxied.length ? `  proxy wins ${proxied.filter((x) => x.winner === x.proxyTeam).length}/${proxied.length} (${pc(proxied.filter((x) => x.winner === x.proxyTeam).length / proxied.length)})` : ''));
    const perMin = Array.from({ length: PHASES }, (_, i) => sum(rs.map((x) => x.takedownsByPhase[i]!)) / Math.max(1e-9, sum(rs.map((x) => x.phaseMs[i]!)) / 60_000));
    console.log(`${''.padEnd(10)} fights/min by phase ${perMin.map((f, i) => `${i < RING.length ? i + 1 : 'shut'}:${f.toFixed(1)}`).join(' ')}` +
      `  last fight phase ${won.map((x) => x.lastFightPhase + 1).join('')}` +
      `  survivor gun stage ${[0, 1, 2].map((s) => `${s}:${stages.filter((x) => x === s).length}`).join(' ')}`);
    const minutes = Math.max(...rs.map((x) => x.squadsLeftByMinute.length));
    console.log(`${''.padEnd(10)} squads in by minute ${Array.from({ length: minutes }, (_, m) => (sum(rs.map((x) => x.squadsLeftByMinute[m] ?? 0)) / rs.length).toFixed(1)).join(' ')}`);
  };
  const activity = (rs: readonly Result[]) => {
    console.log(`all matches by ${BUCKET_MS / 1000}s from\n     t  matches  still  px/s  shots/bot-min  crates/match  avg score  nearest enemy px`);
    for (let b = 0; b < Math.max(...rs.map((x) => x.activity.length)); b++) {
      const rows = rs.flatMap((x) => (x.activity[b] ? [x.activity[b]!] : []));
      const a = rows.reduce((t, r) => ({ ...t, aliveTicks: t.aliveTicks + r.aliveTicks, still: t.still + r.still, travel: t.travel + r.travel, shots: t.shots + r.shots, crates: t.crates + r.crates,
        scoreSum: t.scoreSum + r.scoreSum, scoreN: t.scoreN + r.scoreN }), freshActivity());
      const aliveMs = a.aliveTicks * TICK_MS;
      console.log(`${String((b * BUCKET_MS) / 1000).padStart(5)}s ${String(rows.length).padStart(7)} ${pc(a.still / a.aliveTicks).padStart(6)} ${(a.travel / (aliveMs / 1000)).toFixed(0).padStart(5)}` +
        ` ${(a.shots / (aliveMs / 60_000)).toFixed(1).padStart(14)} ${(a.crates / rows.length).toFixed(1).padStart(13)} ${(a.scoreSum / a.scoreN).toFixed(0).padStart(10)} ${median(rows.flatMap((r) => r.nearest)).toFixed(0).padStart(17)}`);
    }
  };
  console.log(`bench-royale: ${specs.length} bot matches (${seeds.length} seeds x ${maps.join('/')}), ${args['no-proxy'] ? 'no proxy' : 'one 4x-health bot in one squad'}, cap ${CAP_MS / 60_000} min, ${((performance.now() - started) / 1000).toFixed(0)}s`);
  for (const map of maps) summarize(map, results.filter((x) => x.spec.map === map));
  summarize('all', results);
  activity(results);
}
