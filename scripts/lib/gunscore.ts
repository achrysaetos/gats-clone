import { ARMORS, EVOLUTIONS, GUN_IDS, GUNS, HP_MULTIPLIER, rulesOf, WEAPON_IDS, WORLD, type ArmorId, type GunId, type WeaponId } from '../../src/shared/defs.ts';
import { addPlayer } from '../../src/shared/sim.ts';
import { effectiveStats, spreadFor, viewRadiusOf } from '../../src/shared/sim/stats.ts';
import { pullTrigger } from '../../src/shared/sim/trigger.ts';
import { createWorld } from '../../src/shared/sim/world.ts';

export const DPS_RANGES = [150, 400, 700, 1000] as const;

export const AXES = [
  ...DPS_RANGES.map((d) => `still@${d}` as const), ...DPS_RANGES.map((d) => `moving@${d}` as const),
  'perPull', 'magSeconds', 'range', 'bulletSpeed', 'moveMul', 'uptime', 'reloadMs', 'penetrate', 'blast', 'silenced',
] as const;
export type Axis = (typeof AXES)[number];
export type GunScore = Record<Axis, number>;
const LOWER_BETTER: ReadonlySet<Axis> = new Set(['reloadMs']);

const msPerRound = (id: GunId) => { const g = GUNS[id]; return g.burst ? ((g.burst.count - 1) * g.burst.gapMs + g.fireMs) / g.burst.count : g.fireMs; };

const HOLD_MS = 2000;
const TICK_MS = 1000 / WORLD.tickHz;

/** The spray index of every shot over the first two seconds of a held trigger, reloads, spin-up and bloom included, through the sim's own trigger. */
const heldShots = new Map(GUN_IDS.map((id) => {
  const g = GUNS[id];
  const s = { ammo: g.mag, reloadUntil: null as number | null, nextFireAt: 0, burstLeft: 0, pressUntil: -Infinity, spray: 0, firedAt: -Infinity, spin: 0 };
  const sprays: number[] = [];
  for (let now = 0; now < HOLD_MS; now += TICK_MS) {
    if (pullTrigger(s, { def: g, mag: g.mag, reloadMs: g.reloadMs, armed: true }, { fire: true, reload: false, pressed: true }, now, TICK_MS)) sprays.push(s.spray);
  }
  return [id, sprays] as const;
}));

export function dpsAt(id: GunId, d: number, still: boolean): number {
  const g = GUNS[id];
  if (d > g.range) return 0;
  const hits = heldShots.get(id)!.reduce((sum, spray) => sum + Math.min(1, Math.atan(WORLD.playerRadius / d) / spreadFor(id, {}, still, spray)), 0);
  return (g.pellets * hits * (g.damage + (g.blast?.damage ?? 0)) * 1000) / HOLD_MS;
}

export function scoreGun(id: GunId): GunScore {
  const g = GUNS[id];
  const firing = g.mag * msPerRound(id);
  const dps = (still: boolean) => DPS_RANGES.map((d) => dpsAt(id, d, still));
  const [s150, s400, s700, s1000] = dps(true);
  const [m150, m400, m700, m1000] = dps(false);
  return {
    'still@150': s150!, 'still@400': s400!, 'still@700': s700!, 'still@1000': s1000!,
    'moving@150': m150!, 'moving@400': m400!, 'moving@700': m700!, 'moving@1000': m1000!,
    perPull: g.pellets * (g.damage + (g.blast?.damage ?? 0)) * (g.burst?.count ?? 1),
    magSeconds: firing / 1000, range: g.range, bulletSpeed: g.bulletSpeed,
    moveMul: g.moveMul, uptime: firing / (firing + g.reloadMs), reloadMs: g.reloadMs,
    penetrate: g.penetrate ?? 0, blast: g.blast ? 1 : 0, silenced: g.silenced ? 1 : 0,
  };
}

const EPS = 1e-9;
const atLeast = (axis: Axis, a: number, b: number) => (LOWER_BETTER.has(axis) ? a <= b + EPS : a >= b - EPS);
export const dominates = (a: GunScore, b: GunScore) => AXES.every((k) => atLeast(k, a[k], b[k])) && AXES.some((k) => !atLeast(k, b[k], a[k]));

export const TREE_ORDER: readonly GunId[] = WEAPON_IDS.flatMap((base) => [base, ...EVOLUTIONS[base].flatMap((g) => [g, ...EVOLUTIONS[g]])]);

export type Pair = readonly [winner: GunId, loser: GunId];
export const gunsOfStage = (stage: 0 | 1 | 2) => GUN_IDS.filter((id) => GUNS[id].stage === stage);

export function dominatedPairs(stage: 0 | 1 | 2): Pair[] {
  const ids = gunsOfStage(stage);
  const scores = new Map(ids.map((id) => [id, scoreGun(id)]));
  return ids.flatMap((a) => ids.filter((b) => a !== b && dominates(scores.get(a)!, scores.get(b)!)).map((b) => [a, b] as const));
}

export function rangeBeyondView(): { id: GunId; range: number; view: number }[] {
  const w = createWorld('FFA', 1, 'plaza');
  return GUN_IDS.flatMap((id) => {
    const p = addPlayer(w, id, { weapon: GUNS[id].base, armor: 'none', color: 'red' });
    p.gun = id;
    if (p.life.k === 'alive') p.life.lastMoveAt = -Infinity;
    const range = effectiveStats(p).range, view = viewRadiusOf(p, w.now);
    return range > view ? [{ id, range, view }] : [];
  });
}

/** A gun's felt edges over another: every axis it leads by `margin` or more, a lead too small to notice in play being no edge. */
export function edgesOver(a: GunId, b: GunId, margin = 1.2): Axis[] {
  const sa = scoreGun(a), sb = scoreGun(b);
  return AXES.filter((k) => (LOWER_BETTER.has(k) ? sb[k] >= sa[k] * margin && sa[k] > 0 : sa[k] >= Math.max(sb[k], EPS) * margin));
}

/**
 * How a person's aim lands on a person: the gun's cone, a hand that wanders `jitter` radians, and a target strafing at base
 * speed whose path over the bullet's flight plus `lagMs` of tracking lag the shooter misreads by up to `dodge` of it. Each is uniform about the aim.
 */
export const HUMAN_AIM = { jitter: 0.012, lagMs: 80, strafe: WORLD.baseSpeed, dodge: 0.5 } as const;
export const HUMAN_HP = WORLD.baseHp * HP_MULTIPLIER.human;

export function hitChance(d: number, spread: number, bulletSpeed: number): number {
  const R = WORLD.playerRadius, a = d * Math.tan(spread), b = d * HUMAN_AIM.jitter;
  const c = HUMAN_AIM.dodge * HUMAN_AIM.strafe * (d / bulletSpeed + HUMAN_AIM.lagMs / 1000);
  const N = 64;
  let sum = 0;
  for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) {
    const x = a * ((2 * i + 1) / N - 1) + b * ((2 * j + 1) / N - 1);
    sum += Math.max(0, Math.min(R - x, c) - Math.max(-R - x, -c)) / (2 * c);
  }
  return sum / (N * N);
}

const LONG_HOLD_MS = 12_000;
/** When each shot of a held trigger leaves and its spray index, reloads included. */
const timeline = new Map(GUN_IDS.map((id) => {
  const g = GUNS[id];
  const s = { ammo: g.mag, reloadUntil: null as number | null, nextFireAt: 0, burstLeft: 0, pressUntil: -Infinity, spray: 0, firedAt: -Infinity, spin: 0 };
  const shots: { t: number; spray: number }[] = [];
  for (let now = 0; now < LONG_HOLD_MS; now += TICK_MS) {
    if (pullTrigger(s, { def: g, mag: g.mag, reloadMs: g.reloadMs, armed: true }, { fire: true, reload: false, pressed: true }, now, TICK_MS)) shots.push({ t: now, spray: s.spray });
  }
  return [id, shots] as const;
}));

/** A pellet gun's whole point-blank pull is one hit, as `breakpoint` counts it. */
const perHit = (id: GunId, armor: ArmorId) => { const g = GUNS[id]; return g.pellets * (g.damage + (g.blast?.damage ?? 0)) * (1 - ARMORS[armor].blockFrac); };

/** Hits, and ms from the first to the last, for perfect aim to kill `hp` through `armor`. */
export function perfectKill(id: GunId, hp: number, armor: ArmorId): { hits: number; ms: number } {
  const hits = Math.ceil(hp / perHit(id, armor) - 1e-9);
  const shots = timeline.get(id)!;
  return { hits, ms: shots[hits - 1]!.t - shots[0]!.t };
}

/** Expected ms for a person's aim to kill `hp` at `d`, standing (`still`) or walking. */
export function aimKillMs(id: GunId, d: number, still: boolean, hp = HUMAN_HP, armor: ArmorId = 'none'): number {
  const g = GUNS[id];
  if (d > g.range) return Infinity;
  let dealt = 0;
  for (const shot of timeline.get(id)!) {
    dealt += hitChance(d, spreadFor(id, {}, still, shot.spray), g.bulletSpeed) * perHit(id, armor);
    if (dealt >= hp - 1e-9) return shot.t;
  }
  return Infinity;
}

const SUSTAIN_MS = 5000;
/** Expected damage per second a person's aim puts on a strafing person at `d` over a five-second hold. */
export function aimDps(id: GunId, d: number, still: boolean): number {
  const g = GUNS[id];
  if (d > g.range) return 0;
  const shots = timeline.get(id)!.filter((s) => s.t < SUSTAIN_MS);
  return (shots.reduce((sum, s) => sum + hitChance(d, spreadFor(id, {}, still, s.spray), g.bulletSpeed), 0) * perHit(id, 'none') * 1000) / SUSTAIN_MS;
}

export const AIM_BANDS = [100, 300, 600, 900] as const;
type Band = (typeof AIM_BANDS)[number];

/**
 * Each class's job against a person. `cadenceMs` bounds ms per round; `ceiling` caps a stage-0 gun's `aimDps` standing at each
 * band, and an evolution may reach `STAGE_GAIN` of it, so a stage buys more of the class's strength rather than a new one.
 */
export const DOCTRINE: Record<WeaponId, { cadenceMs: readonly [number, number]; scope: number; ceiling: Record<Band, number> }> = {
  pistol: { cadenceMs: [80, 600], scope: 1, ceiling: { 100: 125, 300: 85, 600: 52, 900: 42 } },
  smg: { cadenceMs: [33, 100], scope: 1, ceiling: { 100: 160, 300: 90, 600: 45, 900: 0 } },
  shotgun: { cadenceMs: [250, 900], scope: 1, ceiling: { 100: 165, 300: 80, 600: 55, 900: 42 } },
  assault: { cadenceMs: [80, 400], scope: 1.1, ceiling: { 100: 130, 300: 105, 600: 60, 900: 42 } },
  sniper: { cadenceMs: [500, 1800], scope: 1.2, ceiling: { 100: 115, 300: 95, 600: 70, 900: 50 } },
  lmg: { cadenceMs: [33, 120], scope: 1, ceiling: { 100: 125, 300: 100, 600: 65, 900: 42 } },
};
export const STAGE_GAIN = [1, 1.15, 1.3] as const;
/** A rifle that drops a bot in one hit works its bolt this long, and takes this many hits on a bare person. */
export const BOLT = { minMs: 1100, humanHits: 3 } as const;
/** No gun kills a bare person faster than this even with every round landing. */
export const MIN_HUMAN_KILL_MS = 850;

export type Breach = { id: GunId; rule: string; detail: string };

export function doctrineBreaches(): Breach[] {
  const out: Breach[] = [];
  const breach = (id: GunId, rule: string, detail: string) => out.push({ id, rule, detail });
  const aim = new Map(GUN_IDS.map((id) => [id, new Map(AIM_BANDS.map((d) => [d, aimDps(id, d, true)]))]));
  for (const id of GUN_IDS) {
    const g = GUNS[id], doc = DOCTRINE[g.base], ms = msPerRound(id);
    if (ms < doc.cadenceMs[0] || ms > doc.cadenceMs[1]) breach(id, 'cadence', `${ms.toFixed(0)}ms per round outside ${doc.cadenceMs.join('-')}`);
    if (g.base === 'sniper' && g.breakpoint === 1) {
      const hits = perfectKill(id, HUMAN_HP, 'none').hits;
      if (g.fireMs < BOLT.minMs || hits !== BOLT.humanHits) breach(id, 'bolt', `${g.fireMs}ms, ${hits} hits on a bare person`);
    }
    const kill = perfectKill(id, HUMAN_HP, 'none').ms;
    if (kill < MIN_HUMAN_KILL_MS) breach(id, 'delete', `kills a bare person in ${kill.toFixed(0)}ms`);
    const scope = rulesOf(g).viewMul;
    if (scope > doc.scope) breach(id, 'scope', `view x${scope} over x${doc.scope}`);
    for (const d of AIM_BANDS) {
      const cap = doc.ceiling[d] * STAGE_GAIN[g.stage];
      if (aim.get(id)!.get(d)! > cap + EPS) breach(id, `aim@${d}`, `${aim.get(id)!.get(d)!.toFixed(0)} dps over ${cap.toFixed(0)}`);
    }
  }
  for (const stage of [0, 1, 2] as const) {
    const ids = gunsOfStage(stage);
    const weakest = (keep: (id: GunId) => boolean, d: Band) => Math.min(...ids.filter(keep).map((id) => aim.get(id)!.get(d)!));
    const smgFloor = weakest((id) => GUNS[id].base === 'smg', 100);
    for (const id of ids.filter((x) => GUNS[x].base === 'sniper' || GUNS[x].base === 'lmg')) {
      if (aim.get(id)!.get(100)! > smgFloor) breach(id, 'close', `${aim.get(id)!.get(100)!.toFixed(0)} dps at 100px beats an SMG's ${smgFloor.toFixed(0)}`);
    }
    const sniperFloor = weakest((id) => GUNS[id].base === 'sniper', 600);
    for (const id of ids.filter((x) => GUNS[x].base === 'smg' || (GUNS[x].base === 'shotgun' && GUNS[x].pellets > 1))) {
      if (aim.get(id)!.get(600)! > sniperFloor) breach(id, 'falloff', `${aim.get(id)!.get(600)!.toFixed(0)} dps at 600px beats a sniper's ${sniperFloor.toFixed(0)}`);
    }
  }
  return out;
}
