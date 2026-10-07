import { applyEvents, rollChallenges, type ChallengeEvents } from '../shared/challenges.ts';
import { COSMETICS, DEFAULTS, earnedIds, isCosmeticId, levelState, SLOTS, type Picks, type Slot, type XpGain } from '../shared/cosmetics.ts';
import type { Profile, ProfileDelta } from './profiles.ts';

/**
 * Account progression applied to a `Profile`: XP and levels, unlocks, challenge progress and equipping. Everything here is
 * server-side bookkeeping beside the simulation, which never reads any of it. `Pending` collects what the player has not yet
 * been told, so the room can send one `progress` message per moment.
 */
export type Pending = { gained: XpGain[]; levelUps: number[]; unlocks: string[] };
export const newPending = (): Pending => ({ gained: [], levelUps: [], unlocks: [] });
export const hasNews = (n: Pending): boolean => n.gained.length > 0 || n.levelUps.length > 0 || n.unlocks.length > 0;

/** Recomputes `level` and `prestige` from `xp`, returning each level newly reached. */
export function syncLevel(p: Profile): number[] {
  const before = p.level;
  const s = levelState(p.xp);
  p.level = s.level;
  p.prestige = s.prestige;
  return Array.from({ length: Math.max(0, s.level - before) }, (_, i) => before + 1 + i);
}

/** Adds every cosmetic the profile has earned by level or lifetime medal (defaults too), plus `extra`; returns the ids newly added. */
export function grantUnlocks(p: Profile, extra: readonly string[] = []): string[] {
  const have = new Set(p.unlocked);
  const added: string[] = [];
  for (const id of [...earnedIds({ level: p.level, badges: p.badges }), ...extra]) if (!have.has(id)) { have.add(id); added.push(id); }
  if (added.length) p.unlocked = COSMETICS.map((c) => c.id).filter((id) => have.has(id));
  return added;
}

/** The events a delta feeds to challenges. */
export const challengeEvents = (d: ProfileDelta): ChallengeEvents => ({
  kills: d.kills, games: d.games, streak: d.streak, medals: d.medals, weaponKills: d.weaponKills, wins: d.wins, finishes: d.finishes, nights: d.nights, zkills: d.zkills, bastion: d.bastion,
});

/**
 * Settles one moment on a profile: rolls challenges to `now`, feeds them `events` (each completion pays its XP and may grant a
 * cosmetic), banks `gains`, then levels up and unlocks whatever that earns. Notes it all in `pending`.
 */
export function settle(p: Profile, pending: Pending, parts: { gains?: XpGain[]; events?: ChallengeEvents }, now: number): void {
  p.challenges = rollChallenges(p.challenges, now, p.name, new Set(p.unlocked));
  const gains = [...(parts.gains ?? [])];
  const grants: string[] = [];
  if (parts.events) {
    for (const item of [...applyEvents(p.challenges.daily, parts.events), ...applyEvents(p.challenges.weekly, parts.events)]) {
      gains.push({ reason: 'challenge', xp: item.xp, id: item.id });
      if (item.grant) grants.push(item.grant);
    }
  }
  if (gains.length) {
    p.xp += gains.reduce((sum, g) => sum + g.xp, 0);
    pending.gained.push(...gains);
    pending.levelUps.push(...syncLevel(p));
  }
  pending.unlocks.push(...grantUnlocks(p, grants));
}

/**
 * Wears `picks`. An item is accepted when it is the slot's default or the profile has unlocked it. `strict` applies nothing if
 * any pick is refused; otherwise the accepted ones apply and the refused ids are reported. A default pick clears the slot.
 */
export function equip(p: Profile, picks: Picks, strict: boolean): { ok: boolean; rejected: string[] } {
  const entries = SLOTS.flatMap((slot) => (picks[slot] === undefined ? [] : [[slot, picks[slot]!] as [Slot, string]]));
  const accepted = (slot: Slot, id: string) => isCosmeticId(slot, id) && (id === DEFAULTS[slot] || p.unlocked.includes(id));
  const rejected = entries.filter(([s, id]) => !accepted(s, id)).map(([, id]) => id);
  if (strict && rejected.length) return { ok: false, rejected };
  for (const [slot, id] of entries) {
    if (!accepted(slot, id)) continue;
    if (id === DEFAULTS[slot]) delete p.equipped[slot];
    else p.equipped[slot] = id;
  }
  return { ok: rejected.length === 0, rejected };
}
