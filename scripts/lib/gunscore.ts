import { EVOLUTIONS, GUN_IDS, GUNS, WEAPON_IDS, WORLD, type GunId } from '../../src/shared/defs.ts';
import { addPlayer } from '../../src/shared/sim.ts';
import { effectiveStats, spreadFor } from '../../src/shared/sim/stats.ts';
import { createWorld } from '../../src/shared/sim/world.ts';

export const DPS_RANGES = [150, 400, 700, 1000] as const;

export const AXES = [
  ...DPS_RANGES.map((d) => `still@${d}` as const), ...DPS_RANGES.map((d) => `moving@${d}` as const),
  'perPull', 'moveMul', 'uptime', 'reloadMs', 'penetrate', 'blast', 'silenced',
] as const;
export type Axis = (typeof AXES)[number];
export type GunScore = Record<Axis, number>;
const LOWER_BETTER: ReadonlySet<Axis> = new Set(['reloadMs']);

const msPerRound = (id: GunId) => { const g = GUNS[id]; return g.burst ? ((g.burst.count - 1) * g.burst.gapMs + g.fireMs) / g.burst.count : g.fireMs; };

export function dpsAt(id: GunId, d: number, still: boolean): number {
  const g = GUNS[id];
  if (d > g.range) return 0;
  const hit = Math.min(1, Math.atan(WORLD.playerRadius / d) / spreadFor(id, {}, still));
  return (g.pellets * hit * (g.damage + (g.blast?.damage ?? 0)) * 1000) / msPerRound(id);
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
    const s = effectiveStats(p);
    return s.range > s.viewRadius ? [{ id, range: s.range, view: s.viewRadius }] : [];
  });
}
