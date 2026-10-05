/// <reference types="node" />
// Usage: node scripts/bench-tactics.ts [minutes=4] [seeds=3] [tdmCapMinutes=10] [thinkBots=20]
// Plays all-bot FFA rounds on every FFA map, then all-bot TDM matches to their kill target, and times the bot brain at thinkBots bots.
// Every number is measured from the world, not from what the bots believe, so the same seeds compare one brain against another.
import { WORLD, type ModeId } from '../src/shared/defs.ts';
import { ROTATION, type MapId } from '../src/shared/maps.ts';
import { addPlayer, canRespawn, respawn, setInput, step } from '../src/shared/sim.ts';
import { circleHitsRect, segmentEntersRectAt, type Rect } from '../src/shared/sim/movement.ts';
import { snapshotFor, wallViews } from '../src/shared/sim/snapshot.ts';
import { choosePick, effectiveStats } from '../src/shared/sim/stats.ts';
import { coverRects, createWorld, isEnemy, rand, type Player, type World } from '../src/shared/sim/world.ts';
import { botThink, newBotMemory, randomLoadout, type BotMemory } from '../src/server/bots.ts';

const minutes = Number(process.argv[2] ?? 4);
const seeds = Number(process.argv[3] ?? 3);
const tdmCapMinutes = Number(process.argv[4] ?? 10);
const thinkBots = Number(process.argv[5] ?? 20);
const TICK_MS = 1000 / WORLD.tickHz;
const SIGHT_PX = WORLD.viewRadius;
/** A fight between two players ends when neither has hurt the other for this long. */
const FIGHT_GAP_MS = 3000;
/** Within this of a wall's or crate's edge, with it between the body and the nearest enemy, counts as in cover. */
const COVER_HUG_PX = 40;
const LOOKBACK_TICKS = Math.round(1500 / TICK_MS);
const LOSING_HP_FRAC = 0.5;

type Brain = { think(w: World, id: number): void };

function makeBrain(w: World, ids: readonly number[]): Brain {
  const r = () => rand(w);
  const mems = new Map<number, BotMemory>(ids.map((id) => [id, newBotMemory(r)]));
  return {
    think(w, id) {
      const d = botThink(snapshotFor(w, id), wallViews(w), mems.get(id)!, r);
      mems.set(id, d.mem);
      setInput(w, id, w.tick, d.input);
      if (d.pick) choosePick(w, id, d.pick.level, d.pick.option);
    },
  };
}

type Pulse = { hpFrac: number; seenBy: number; allies: number };
type Tally = {
  lives: number[]; fights: number[]; combatTicks: number; coverTicks: number; shots: number; stillShots: number;
  deaths: number; lowDeaths: number; outnumberedDeaths: number; losingDeaths: number; kills: number; minutes: number;
};
const emptyTally = (): Tally => ({ lives: [], fights: [], combatTicks: 0, coverTicks: 0, shots: 0, stillShots: 0, deaths: 0, lowDeaths: 0, outnumberedDeaths: 0, losingDeaths: 0, kills: 0, minutes: 0 });

const sees = (cover: readonly Rect[], a: Player, b: Player) => !cover.some((r) => segmentEntersRectAt(a.x, a.y, b.x - a.x, b.y - a.y, r) !== null);
const near = (a: Player, b: Player, px: number) => Math.hypot(a.x - b.x, a.y - b.y) <= px;

/** Plays `w` with every player a bot until `done` or `ticks` run out, adding what it measured to `t`. */
function play(w: World, t: Tally, ticks: number, done: () => boolean = () => false): number {
  const ids = [...w.players.keys()];
  const brain = makeBrain(w, ids);
  const r = () => rand(w);
  const bornAt = new Map(ids.map((id) => [id, w.now]));
  const pulses = new Map<number, Pulse[]>(ids.map((id) => [id, []]));
  const fights = new Map<string, { start: number; last: number; a: number; b: number }>();
  const closeFight = (key: string, end: number) => { const f = fights.get(key)!; t.fights.push(end - f.start); fights.delete(key); };
  let tick = 0;
  for (; tick < ticks && !done(); tick++) {
    const cover = coverRects(w);
    const players = [...w.players.values()];
    const before = new Map(players.map((p) => [p.id, { x: p.x, y: p.y }]));
    for (const p of players) {
      if (p.life.k !== 'alive') continue;
      const enemies = players.filter((o) => o.life.k === 'alive' && isEnemy(p, o) && near(p, o, SIGHT_PX));
      const seenBy = enemies.filter((o) => sees(cover, o, p)).length;
      const allies = players.filter((o) => o.id !== p.id && o.life.k === 'alive' && !isEnemy(p, o) && near(p, o, SIGHT_PX)).length;
      const ring = pulses.get(p.id)!;
      ring.push({ hpFrac: p.life.hp / effectiveStats(p).maxHp, seenBy, allies });
      if (ring.length > LOOKBACK_TICKS) ring.shift();
      if (enemies.length === 0) continue;
      t.combatTicks++;
      const foe = enemies.reduce((a, b) => (Math.hypot(a.x - p.x, a.y - p.y) <= Math.hypot(b.x - p.x, b.y - p.y) ? a : b));
      if (cover.some((c) => circleHitsRect(p.x, p.y, WORLD.playerRadius + COVER_HUG_PX, c) && segmentEntersRectAt(foe.x, foe.y, p.x - foe.x, p.y - foe.y, c) !== null)) t.coverTicks++;
    }
    for (const id of ids) {
      brain.think(w, id);
      if (canRespawn(w, id) && respawn(w, id, randomLoadout(r))) { bornAt.set(id, w.now); pulses.set(id, []); }
    }
    step(w, TICK_MS);
    for (const e of w.events) {
      if (e.e === 'shot') {
        const p = w.players.get(e.owner), was = before.get(e.owner);
        if (!p || !was) continue;
        t.shots++;
        if (p.x === was.x && p.y === was.y) t.stillShots++;
      } else if (e.e === 'dmg' && e.kind === 'player' && e.attacker !== null && e.attacker !== e.victim) {
        const [a, b] = e.attacker < e.victim ? [e.attacker, e.victim] : [e.victim, e.attacker];
        const key = `${a}:${b}`;
        const f = fights.get(key);
        if (f) f.last = w.now; else fights.set(key, { start: w.now, last: w.now, a, b });
      } else if (e.e === 'kill') {
        t.deaths++;
        if (e.killerId !== null && e.killerId !== e.victimId) t.kills++;
        t.lives.push(w.now - bornAt.get(e.victimId)!);
        const then = pulses.get(e.victimId)![0];
        if (then) {
          const low = then.hpFrac < LOSING_HP_FRAC, outnumbered = then.seenBy > then.allies + 1;
          if (low) t.lowDeaths++;
          if (outnumbered) t.outnumberedDeaths++;
          if (low && outnumbered) t.losingDeaths++;
        }
        for (const [key, f] of fights) if (f.a === e.victimId || f.b === e.victimId) closeFight(key, w.now);
      }
    }
    for (const [key, f] of fights) if (w.now - f.last > FIGHT_GAP_MS) closeFight(key, f.last);
  }
  t.minutes += (tick * TICK_MS) / 60_000;
  return tick * TICK_MS;
}

function world(mode: ModeId, map: MapId, seed: number, bots: number): World {
  const w = createWorld(mode, seed, map);
  const r = () => rand(w);
  for (let i = 0; i < bots; i++) addPlayer(w, `bot${i}`, randomLoadout(r));
  return w;
}

const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  return s.length === 0 ? NaN : s.length % 2 ? s[(s.length - 1) / 2]! : (s[s.length / 2 - 1]! + s[s.length / 2]!) / 2;
};
const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / Math.max(1, xs.length);
const pct = (n: number, d: number) => `${((100 * n) / Math.max(1, d)).toFixed(1)}%`;
const sec = (ms: number) => `${(ms / 1000).toFixed(1)}s`;

function report(label: string, t: Tally) {
  console.log([
    `  ${label.padEnd(10)}`,
    `life mean ${sec(mean(t.lives))} median ${sec(median(t.lives))}`,
    `fight mean ${sec(mean(t.fights))} median ${sec(median(t.fights))}`,
    `in cover ${pct(t.coverTicks, t.combatTicks)}`,
    `still shots ${pct(t.stillShots, t.shots)}`,
    `deaths low ${pct(t.lowDeaths, t.deaths)} outnumbered ${pct(t.outnumberedDeaths, t.deaths)} both ${pct(t.losingDeaths, t.deaths)}`,
    `kills/min ${(t.kills / Math.max(1e-9, t.minutes)).toFixed(1)}`,
  ].join('  '));
}

const MAX_TICKS = (m: number) => Math.round((m * 60_000) / TICK_MS);

if (minutes > 0) {
  console.log(`FFA, ${WORLD.minPlayers} bots, ${minutes} min x ${seeds} seeds per map`);
  const all = emptyTally();
  for (const map of ROTATION.FFA) {
    const t = emptyTally();
    for (let seed = 1; seed <= seeds; seed++) play(world('FFA', map, seed, WORLD.minPlayers), t, MAX_TICKS(minutes));
    report(map, t);
    for (const k of Object.keys(t) as (keyof Tally)[]) {
      const v = t[k];
      if (Array.isArray(v)) (all[k] as number[]).push(...v); else (all[k] as number) += v;
    }
  }
  report('all', all);
}

if (tdmCapMinutes > 0) {
  console.log(`\nTDM to ${WORLD.tdmWinScore} kills, ${WORLD.minPlayers} bots, capped at ${tdmCapMinutes} min, ${seeds} seeds per map`);
  const all = emptyTally();
  const lengths: number[] = [];
  let unfinished = 0;
  for (const map of ROTATION.TDM) {
    const t = emptyTally();
    const mapLengths: number[] = [];
    for (let seed = 1; seed <= seeds; seed++) {
      const w = world('TDM', map, seed, WORLD.minPlayers);
      const ms = play(w, t, MAX_TICKS(tdmCapMinutes), () => w.match.k === 'over');
      if (w.match.k === 'over' && w.teamScore.red !== w.teamScore.blue && Math.max(w.teamScore.red, w.teamScore.blue) >= WORLD.tdmWinScore) mapLengths.push(ms);
      else unfinished++;
    }
    lengths.push(...mapLengths);
    report(map, t);
    console.log(`  ${''.padEnd(10)}  to ${WORLD.tdmWinScore} kills ${mapLengths.map(sec).join(' ') || 'none'}`);
    for (const k of Object.keys(t) as (keyof Tally)[]) {
      const v = t[k];
      if (Array.isArray(v)) (all[k] as number[]).push(...v); else (all[k] as number) += v;
    }
  }
  report('all', all);
  console.log(`  match to ${WORLD.tdmWinScore} kills: mean ${sec(mean(lengths))} median ${sec(median(lengths))}, ${unfinished} of ${seeds * ROTATION.TDM.length} hit the ${tdmCapMinutes} min cap`);
}

if (thinkBots > 0) {
  const w = world('FFA', ROTATION.FFA[0]!, 1, thinkBots);
  const brain = makeBrain(w, [...w.players.keys()]);
  const r = () => rand(w);
  const perTick: number[] = [];
  for (let tick = 0; tick < MAX_TICKS(2); tick++) {
    const started = performance.now();
    for (const id of w.players.keys()) brain.think(w, id);
    perTick.push(performance.now() - started);
    for (const id of w.players.keys()) if (canRespawn(w, id)) respawn(w, id, randomLoadout(r));
    step(w, TICK_MS);
  }
  const warm = perTick.slice(WORLD.tickHz * 5).sort((a, b) => a - b);
  const at = (q: number) => warm[Math.min(warm.length - 1, Math.floor(q * warm.length))]!.toFixed(3);
  console.log(`\nthink time, ${thinkBots} bots on ${ROTATION.FFA[0]}, 2 min: per tick mean ${mean(warm).toFixed(3)}ms p50 ${at(0.5)}ms p95 ${at(0.95)}ms p99 ${at(0.99)}ms max ${at(1)}ms (tick budget ${TICK_MS.toFixed(1)}ms)`);
}
