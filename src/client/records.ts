import type { Snapshot } from '../shared/protocol.ts';
import { clock, selfOf } from './derive.ts';

/** What one life has done so far: when it began, the damage it dealt to players, and the highest level and streak it reached. */
export type LifeLog = { born: number; damage: number; level: number; streak: number };
/** This browser's records for a single life. */
export type Bests = { kills: number; damage: number; level: number; aliveMs: number };
export type RecapStat = { label: string; value: string; best: boolean };
/** The death card's line-up for the life just lost, and the records it now stands against. */
export type Recap = { stats: RecapStat[]; bests: Bests; newBests: number };

export const NO_BESTS: Bests = { kills: 0, damage: 0, level: 0, aliveMs: 0 };
const KEY = 'skirmish.bests';

export const freshLog = (now: number): LifeLog => ({ born: now, damage: 0, level: 0, streak: 0 });

/** Folds one snapshot into the life's log: player damage you dealt, and your level and streak as they stand. */
export function logSnapshot(log: LifeLog, snap: Snapshot): LifeLog {
  let damage = log.damage;
  for (const ev of snap.events) {
    if (ev.e === 'dmg' && ev.kind === 'player' && ev.attacker === snap.self.id && ev.victim !== snap.self.id) damage += ev.amount;
  }
  const me = selfOf(snap);
  return { born: log.born, damage, level: Math.max(log.level, me?.level ?? 0), streak: Math.max(log.streak, snap.self.streak) };
}

/** Sums a finished life against the records, and the records it set. A record only counts once it beats a real one. */
export function recapOf(log: LifeLog, now: number, bests: Bests): Recap {
  const aliveMs = Math.max(0, now - log.born);
  const life: Bests = { kills: log.streak, damage: Math.round(log.damage), level: log.level, aliveMs };
  const beat = (k: keyof Bests) => life[k] > bests[k] && life[k] > 0;
  const stats: RecapStat[] = [
    { label: 'Kills', value: String(life.kills), best: beat('kills') },
    { label: 'Damage', value: life.damage.toLocaleString('en-US'), best: beat('damage') },
    { label: 'Level', value: String(life.level), best: beat('level') },
    { label: 'Survived', value: clock(aliveMs), best: beat('aliveMs') },
  ];
  const next: Bests = {
    kills: Math.max(bests.kills, life.kills), damage: Math.max(bests.damage, life.damage),
    level: Math.max(bests.level, life.level), aliveMs: Math.max(bests.aliveMs, aliveMs),
  };
  return { stats, bests: next, newBests: stats.filter((s) => s.best).length };
}

export function loadBests(): Bests {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? 'null');
    if (!raw || typeof raw !== 'object') return NO_BESTS;
    const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : 0);
    return { kills: num(raw.kills), damage: num(raw.damage), level: num(raw.level), aliveMs: num(raw.aliveMs) };
  } catch {
    return NO_BESTS;
  }
}

export function saveBests(b: Bests): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(b));
  } catch {
    // Private windows can refuse storage; the records then last only this visit.
  }
}
