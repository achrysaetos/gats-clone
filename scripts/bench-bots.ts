/// <reference types="node" />
// Usage: node scripts/bench-bots.ts [minutes=10] [seeds=10]
import { PERK_TIERS, WEAPONS, WORLD } from '../src/shared/defs.ts';
import type { InputState, Loadout, PlayerView, Snapshot, WallView } from '../src/shared/protocol.ts';
import { addPlayer, canRespawn, respawn, setInput, step } from '../src/shared/sim.ts';
import { segmentEntersRectAt } from '../src/shared/sim/movement.ts';
import { snapshotFor, wallViews } from '../src/shared/sim/snapshot.ts';
import { choosePerk } from '../src/shared/sim/stats.ts';
import { createWorld, IDLE_INPUT, rand, type World } from '../src/shared/sim/world.ts';
import { botThink, newBotMemory, randomLoadout, type BotMemory } from '../src/server/bots.ts';

const minutes = Number(process.argv[2] ?? 10);
const seeds = Number(process.argv[3] ?? 10);
const TICK_MS = 1000 / WORLD.tickHz;
const HUMAN_LOADOUT: Loadout = { weapon: 'assault', armor: 'medium', color: 'blue' };
const HUMAN_REACTION_MS = [220, 380] as const;
const HUMAN_AIM_SIGMA = 0.04;
const HUMAN_AIM_SIGMA_PER_RAD_PER_SEC = 0.15;
const HUMAN_AIM_CORRELATION = 0.9;
const HUMAN_LEAD = 0.5;
const HUMAN_VIEW_ASPECT = 1280 / 800;

type HumanStyle = 'idle' | 'strafe';
type HumanMind = { target: number | null; fireAtTick: number; aimErr: number; strafe: 1 | -1; flipAtTick: number; seen: { id: number; x: number; y: number } | null; shots: number; wanderX: number; wanderY: number };

const gaussian = (r: () => number) => Math.sqrt(-2 * Math.log(1 - r())) * Math.cos(2 * Math.PI * r());

function visibleEnemies(snap: Snapshot, me: PlayerView, walls: readonly WallView[]): PlayerView[] {
  return snap.players.filter((p) => p.id !== me.id && p.alive && !p.hidden
    && !walls.some((w) => segmentEntersRectAt(me.x, me.y, p.x - me.x, p.y - me.y, w) !== null));
}

function humanThink(snap: Snapshot, walls: readonly WallView[], mind: HumanMind, style: HumanStyle, r: () => number): { input: InputState; mind: HumanMind } {
  const me = snap.players.find((p) => p.id === snap.self.id);
  if (!me || !me.alive || style === 'idle') return { input: { ...IDLE_INPUT, shots: mind.shots }, mind };
  const next = { ...mind };
  const enemy = visibleEnemies(snap, me, walls).sort((a, b) => Math.hypot(a.x - me.x, a.y - me.y) - Math.hypot(b.x - me.x, b.y - me.y))[0] ?? null;
  if (snap.tick >= next.flipAtTick) {
    next.strafe = next.strafe === 1 ? -1 : 1;
    next.flipAtTick = snap.tick + Math.round((300 + r() * 600) / TICK_MS);
  }
  if (Math.hypot(me.x - next.wanderX, me.y - next.wanderY) < 80) { next.wanderX = r() * WORLD.size; next.wanderY = r() * WORLD.size; }
  let angle = Math.atan2(next.wanderY - me.y, next.wanderX - me.x);
  let moveAngle = angle;
  let fire = false, aimDist = 300;
  if (enemy) {
    if (enemy.id !== next.target) {
      next.target = enemy.id;
      next.fireAtTick = snap.tick + Math.round((HUMAN_REACTION_MS[0] + r() * (HUMAN_REACTION_MS[1] - HUMAN_REACTION_MS[0])) / TICK_MS);
    }
    const d = Math.hypot(enemy.x - me.x, enemy.y - me.y);
    const vel = next.seen?.id === enemy.id ? { x: enemy.x - next.seen.x, y: enemy.y - next.seen.y } : { x: 0, y: 0 };
    const flightTicks = (d / WEAPONS[me.weapon].bulletSpeed) * WORLD.tickHz * HUMAN_LEAD;
    const bearing = Math.atan2(enemy.y - me.y, enemy.x - me.x);
    const angularSpeed = next.seen?.id === enemy.id ? Math.abs(Math.atan2(Math.sin(bearing - Math.atan2(next.seen.y - me.y, next.seen.x - me.x)), Math.cos(bearing - Math.atan2(next.seen.y - me.y, next.seen.x - me.x)))) * WORLD.tickHz : 0;
    const sigma = HUMAN_AIM_SIGMA + HUMAN_AIM_SIGMA_PER_RAD_PER_SEC * angularSpeed;
    next.aimErr = next.aimErr * HUMAN_AIM_CORRELATION + Math.sqrt(1 - HUMAN_AIM_CORRELATION ** 2) * sigma * gaussian(r);
    angle = Math.atan2(enemy.y + vel.y * flightTicks - me.y, enemy.x + vel.x * flightTicks - me.x) + next.aimErr;
    aimDist = d;
    fire = snap.tick >= next.fireAtTick && d < WEAPONS[me.weapon].range * 0.95;
    moveAngle = Math.atan2(enemy.y - me.y, enemy.x - me.x) + (Math.PI / 2) * next.strafe;
  } else {
    next.target = null;
  }
  next.seen = enemy ? { id: enemy.id, x: enemy.x, y: enemy.y } : null;
  if (fire) next.shots++;
  const mx = Math.cos(moveAngle), my = Math.sin(moveAngle);
  return {
    input: { up: my < -0.38, down: my > 0.38, left: mx < -0.38, right: mx > 0.38, angle, fire, shots: next.shots, reload: !enemy && snap.self.ammo < snap.self.mag / 2, ability: false, aimDist },
    mind: next,
  };
}

type Tally = { lives: number[]; kills: number; deaths: number; botOnBotKills: number; botsKilledByHuman: number };

function simulate(seed: number, style: HumanStyle): Tally {
  const w: World = createWorld('FFA', seed);
  const r = () => rand(w);
  const bots = new Map<number, BotMemory>();
  for (let i = 0; i < WORLD.minPlayers - 1; i++) bots.set(addPlayer(w, `bot${i}`, randomLoadout(r)).id, newBotMemory(r));
  const human = addPlayer(w, 'human', HUMAN_LOADOUT);
  let mind: HumanMind = { target: null, fireAtTick: 0, aimErr: 0, strafe: 1, flipAtTick: 0, seen: null, shots: 0, wanderX: r() * WORLD.size, wanderY: r() * WORLD.size };
  let bornAt = w.now;
  const tally: Tally = { lives: [], kills: 0, deaths: 0, botOnBotKills: 0, botsKilledByHuman: 0 };
  const ticks = Math.round((minutes * 60_000) / TICK_MS);
  for (let t = 0; t < ticks; t++) {
    const walls = wallViews(w);
    for (const [id, mem] of bots) {
      const d = botThink(snapshotFor(w, id), walls, mem, r);
      bots.set(id, d.mem);
      setInput(w, id, w.tick, d.input);
      if (d.perk) choosePerk(w, id, d.perk.tier, d.perk.perk);
      if (canRespawn(w, id)) respawn(w, id, randomLoadout(r));
    }
    const snap = snapshotFor(w, human.id, w.events, HUMAN_VIEW_ASPECT);
    const h = humanThink(snap, walls, mind, style, r);
    mind = h.mind;
    setInput(w, human.id, w.tick, h.input);
    if (snap.self.pendingTier) choosePerk(w, human.id, snap.self.pendingTier, PERK_TIERS[snap.self.pendingTier][0]);
    if (canRespawn(w, human.id) && respawn(w, human.id, HUMAN_LOADOUT)) bornAt = w.now;
    step(w, TICK_MS);
    for (const e of w.events) {
      if (e.e !== 'kill') continue;
      if (e.victimId === human.id) tally.lives.push((w.now - bornAt) / 1000);
      else if (e.killerId === human.id) tally.botsKilledByHuman++;
      else if (e.killerId !== null && bots.has(e.killerId)) tally.botOnBotKills++;
    }
  }
  tally.kills = human.kills;
  tally.deaths = human.deaths;
  return tally;
}

const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  return s.length === 0 ? NaN : s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2;
};

for (const style of ['idle', 'strafe'] as const) {
  const all: Tally = { lives: [], kills: 0, deaths: 0, botOnBotKills: 0, botsKilledByHuman: 0 };
  for (let seed = 1; seed <= seeds; seed++) {
    const t = simulate(seed, style);
    all.lives.push(...t.lives);
    all.kills += t.kills; all.deaths += t.deaths; all.botOnBotKills += t.botOnBotKills; all.botsKilledByHuman += t.botsKilledByHuman;
  }
  const simMinutes = minutes * seeds;
  console.log([
    `${style.padEnd(6)}`,
    `median life ${median(all.lives).toFixed(1)}s`,
    `deaths ${all.deaths}`,
    `kills ${all.kills}`,
    `K/D ${(all.kills / Math.max(1, all.deaths)).toFixed(2)}`,
    `bot-on-bot kills/min ${(all.botOnBotKills / simMinutes).toFixed(1)}`,
    `(${simMinutes} sim minutes)`,
  ].join('  '));
}
