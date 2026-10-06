import { ARMORS, EVOLUTIONS, GUN_IDS, GUNS, HP_MULTIPLIER, rulesOf, WEAPON_IDS, WORLD, type ArmorId, type GunId, type WeaponId } from '../../src/shared/defs.ts';
import { addPlayer } from '../../src/shared/sim.ts';
import { effectiveStats, spreadFor, viewRadiusOf } from '../../src/shared/sim/stats.ts';
import { pullTrigger } from '../../src/shared/sim/trigger.ts';
import { createWorld } from '../../src/shared/sim/world.ts';
import { median } from './stats.ts';

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

const HUMAN_AIM = { handWanderRad: 0.012, trackingLagMs: 80, strafe: WORLD.baseSpeed, strafeMisreadFrac: 0.5 } as const;
export const HUMAN_HP = WORLD.baseHp * HP_MULTIPLIER.human;

function hitChance(d: number, spread: number, bulletSpeed: number): number {
  const R = WORLD.playerRadius, cone = d * Math.tan(spread), wander = d * HUMAN_AIM.handWanderRad;
  const misread = HUMAN_AIM.strafeMisreadFrac * HUMAN_AIM.strafe * (d / bulletSpeed + HUMAN_AIM.trackingLagMs / 1000);
  const N = 64;
  let sum = 0;
  for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) {
    const x = cone * ((2 * i + 1) / N - 1) + wander * ((2 * j + 1) / N - 1);
    sum += Math.max(0, Math.min(R - x, misread) - Math.max(-R - x, -misread)) / (2 * misread);
  }
  return sum / (N * N);
}

const LONG_HOLD_MS = 30_000;
const heldTriggerShots = new Map(GUN_IDS.map((id) => {
  const g = GUNS[id];
  const s = { ammo: g.mag, reloadUntil: null as number | null, nextFireAt: 0, burstLeft: 0, pressUntil: -Infinity, spray: 0, firedAt: -Infinity, spin: 0 };
  const shots: { t: number; spray: number }[] = [];
  for (let now = 0; now < LONG_HOLD_MS; now += TICK_MS) {
    if (pullTrigger(s, { def: g, mag: g.mag, reloadMs: g.reloadMs, armed: true }, { fire: true, reload: false, pressed: true }, now, TICK_MS)) shots.push({ t: now, spray: s.spray });
  }
  return [id, shots] as const;
}));

const perPull = (id: GunId, armor: ArmorId) => { const g = GUNS[id]; return g.pellets * (g.damage + (g.blast?.damage ?? 0)) * (1 - ARMORS[armor].blockFrac); };

export function perfectKill(id: GunId, hp: number, armor: ArmorId): { hits: number; firstToLastMs: number } {
  const hits = Math.ceil(hp / perPull(id, armor) - 1e-9);
  const shots = heldTriggerShots.get(id)!;
  return { hits, firstToLastMs: shots[hits - 1]!.t - shots[0]!.t };
}

export function aimKillMs(id: GunId, d: number, still: boolean, hp = HUMAN_HP, armor: ArmorId = 'none'): number {
  const g = GUNS[id];
  if (d > g.range) return Infinity;
  const need = Math.ceil(hp / (perPull(id, armor) / g.pellets) - 1e-9);
  const shots = heldTriggerShots.get(id)!;
  let odds = [1, ...Array<number>(need).fill(0)];
  let expected = 0;
  for (const shot of shots) {
    const p = hitChance(d, spreadFor(id, {}, still, shot.spray), g.bulletSpeed);
    const pellets = Array.from({ length: g.pellets + 1 }, (_, k) => binomial(g.pellets, k) * p ** k * (1 - p) ** (g.pellets - k));
    const next = Array<number>(need + 1).fill(0);
    odds.forEach((o, j) => pellets.forEach((q, k) => { next[Math.min(need, j + k)]! += o * q; }));
    expected += (next[need]! - odds[need]!) * (shot.t - shots[0]!.t);
    odds = next;
  }
  return odds[need]! < LIKELY ? Infinity : expected / odds[need]!;
}

const LIKELY = 0.5;
const binomial = (n: number, k: number): number => (k === 0 ? 1 : (binomial(n, k - 1) * (n - k + 1)) / k);

export const aimDps = (id: GunId, d: number, still: boolean): number => (HUMAN_HP * 1000) / aimKillMs(id, d, still);

export const AIM_BANDS = [100, 300, 600, 900] as const;
type Band = (typeof AIM_BANDS)[number];

const DOCTRINE: Record<WeaponId, { cadenceMs: readonly [number, number]; scope: number; fastestKillS: Record<Band, number> }> = {
  pistol: { cadenceMs: [80, 750], scope: 1, fastestKillS: { 100: 2.5, 300: 4, 600: 7.5, 900: 9.5 } },
  smg: { cadenceMs: [33, 100], scope: 1, fastestKillS: { 100: 1.9, 300: 4, 600: 7.5, 900: Infinity } },
  shotgun: { cadenceMs: [250, 900], scope: 1, fastestKillS: { 100: 1.8, 300: 4.5, 600: 7.5, 900: 9.5 } },
  assault: { cadenceMs: [80, 400], scope: 1.1, fastestKillS: { 100: 2.2, 300: 3.3, 600: 6.5, 900: 9.5 } },
  sniper: { cadenceMs: [500, 1800], scope: 1.2, fastestKillS: { 100: 2.5, 300: 3, 600: 4.5, 900: 6.5 } },
  lmg: { cadenceMs: [33, 120], scope: 1, fastestKillS: { 100: 2.3, 300: 3.3, 600: 5.5, 900: 8 } },
};
const STAGE_GAIN = [1, 1.15, 1.3] as const;
/**
 * Up to 300 px both people are on each other's screen and a shooter who stands still is the easy target, so a class's hold on
 * those bands is judged walking; from 600 px planting is the class's commitment, so it is judged standing.
 */
const PLANTED: Record<Band, boolean> = { 100: false, 300: false, 600: true, 900: true };
const BAND_OWNERS: Record<Band, readonly WeaponId[]> = { 100: ['smg', 'shotgun'], 300: ['assault'], 600: ['lmg', 'sniper'], 900: ['sniper'] };
const OWNER_LEAD = 1.15;
const SNIPER_CLOSE_LAG = 1.4;

/** Each stage's median expected seconds per class for a person to kill a strafing person, in each band's posture. */
export function classKillMatrix(): Record<0 | 1 | 2, Record<WeaponId, Record<Band, number>>> {
  const byStage = (stage: 0 | 1 | 2) => Object.fromEntries(WEAPON_IDS.map((c) => [c, Object.fromEntries(AIM_BANDS.map((d) =>
    [d, median(gunsOfStage(stage).filter((id) => GUNS[id].base === c).map((id) => aimKillMs(id, d, PLANTED[d]) / 1000))]))])) as Record<WeaponId, Record<Band, number>>;
  return { 0: byStage(0), 1: byStage(1), 2: byStage(2) };
}
const BOLT = { minFireMs: 1100, bareHumanHits: 3 } as const;
const MIN_HUMAN_KILL_MS = 850;
const AUTO_MAG_HUMANS = 1.25;

type Breach = { id: GunId; rule: string; detail: string };

export function doctrineBreaches(): Breach[] {
  const out: Breach[] = [];
  const breach = (id: GunId, rule: string, detail: string) => out.push({ id, rule, detail });
  const killS = new Map(GUN_IDS.map((id) => [id, new Map(AIM_BANDS.map((d) => [d, aimKillMs(id, d, true) / 1000]))]));
  const killAt = (id: GunId, d: Band) => killS.get(id)!.get(d)!;
  const classes = classKillMatrix();
  for (const id of GUN_IDS) {
    const g = GUNS[id], doc = DOCTRINE[g.base], ms = msPerRound(id), perfect = perfectKill(id, HUMAN_HP, 'none');
    if (ms < doc.cadenceMs[0] || ms > doc.cadenceMs[1]) breach(id, 'cadence', `${ms.toFixed(0)}ms per round outside ${doc.cadenceMs.join('-')}`);
    if (g.base === 'sniper' && g.breakpoint === 1 && (g.fireMs < BOLT.minFireMs || perfect.hits !== BOLT.bareHumanHits)) breach(id, 'bolt', `${g.fireMs}ms, ${perfect.hits} hits on a bare person`);
    if (perfect.firstToLastMs < MIN_HUMAN_KILL_MS) breach(id, 'delete', `kills a bare person in ${perfect.firstToLastMs.toFixed(0)}ms`);
    if (g.auto && g.mag * perPull(id, 'none') < AUTO_MAG_HUMANS * HUMAN_HP) breach(id, 'mag', `${g.mag} rounds hold ${(g.mag * perPull(id, 'none')).toFixed(0)} damage`);
    if (rulesOf(g).viewMul > doc.scope) breach(id, 'scope', `view x${rulesOf(g).viewMul} over x${doc.scope}`);
    for (const d of AIM_BANDS) {
      const fastest = doc.fastestKillS[d] / STAGE_GAIN[g.stage];
      if (killAt(id, d) < fastest - EPS) breach(id, `aim@${d}`, `kills in ${killAt(id, d).toFixed(2)}s, under ${fastest.toFixed(2)}s`);
    }
  }
  for (const stage of [0, 1, 2] as const) {
    const ids = gunsOfStage(stage);
    const killsOf = (keep: (id: GunId) => boolean, d: Band) => ids.filter(keep).map((id) => killAt(id, d));
    const slowestSmg = Math.max(...killsOf((id) => GUNS[id].base === 'smg', 100));
    for (const id of ids.filter((x) => GUNS[x].base === 'sniper' || GUNS[x].base === 'lmg')) {
      if (killAt(id, 100) < slowestSmg) breach(id, 'close', `kills in ${killAt(id, 100).toFixed(2)}s at 100px, under an SMG's ${slowestSmg.toFixed(2)}s`);
    }
    const walkingSmg = Math.max(...ids.filter((id) => GUNS[id].base === 'smg').map((id) => aimKillMs(id, 100, false) / 1000));
    for (const id of ids.filter((x) => GUNS[x].base === 'sniper')) {
      const kill = aimKillMs(id, 100, false) / 1000;
      if (kill < SNIPER_CLOSE_LAG * walkingSmg) breach(id, 'hipfire', `kills in ${kill.toFixed(2)}s at 100px walking, under ${SNIPER_CLOSE_LAG}x an SMG's ${walkingSmg.toFixed(2)}s`);
    }
    const matrix = classes[stage];
    for (const d of AIM_BANDS) {
      const owned = Math.min(...BAND_OWNERS[d].map((c) => matrix[c][d]));
      for (const c of WEAPON_IDS.filter((x) => !BAND_OWNERS[d].includes(x) && matrix[x][d] < OWNER_LEAD * owned)) {
        breach(c, `band@${d}/s${stage}`, `kills in ${matrix[c][d].toFixed(2)}s, within ${OWNER_LEAD}x of ${BAND_OWNERS[d].join('/')}'s ${owned.toFixed(2)}s`);
      }
    }
    const sniperMid = median(killsOf((id) => GUNS[id].base === 'sniper', 600));
    for (const id of ids.filter((x) => GUNS[x].base === 'smg' || (GUNS[x].base === 'shotgun' && GUNS[x].pellets > 1))) {
      if (killAt(id, 600) < sniperMid) breach(id, 'falloff', `kills in ${killAt(id, 600).toFixed(2)}s at 600px, under the median sniper's ${sniperMid.toFixed(2)}s`);
    }
  }
  return out;
}
