/**
 * Daily and weekly challenges (see the contract at the top of cosmetics.ts).
 *
 * Every profile holds 3 daily challenges per UTC day and 3 weekly per ISO week (Monday to Sunday, UTC). They are chosen
 * deterministically from the period key and the profile key, from a pool of templates, never two from the same `group`. The
 * third weekly challenge also grants a challenge-only cosmetic (`ChallengeItem.grant`), one the profile does not own yet,
 * rotating with the week. Progress comes from the same events the server credits to profiles; a challenge pays its `xp` once,
 * when its progress reaches its `target`.
 */
import type { MedalId, WeaponId } from './defs.ts';
import { CHALLENGE_COSMETICS, dayKey, hash32, seeded } from './cosmetics.ts';

export type ChallengeStat =
  | 'kills' | 'wins' | 'finishes' | 'games' | 'streak' | 'medals' | 'nights' | 'zkills' | 'bastion'
  | `weapon:${WeaponId}` | `medal:${MedalId}`;

/** `text` has `{n}` where the target goes. `group` keeps one period's three apart. */
export type ChallengeTemplate = { id: string; text: string; stat: ChallengeStat; target: number; xp: number; group: string };

const t = (id: string, text: string, stat: ChallengeStat, target: number, xp: number, group: string): ChallengeTemplate => ({ id, text, stat, target, xp, group });

export const DAILY_POOL: readonly ChallengeTemplate[] = [
  t('d_kills20', 'Get {n} kills', 'kills', 20, 200, 'kills'),
  t('d_kills40', 'Get {n} kills', 'kills', 40, 350, 'kills'),
  t('d_smg', 'Get {n} kills with an SMG', 'weapon:smg', 15, 250, 'weapon'),
  t('d_pistol', 'Get {n} kills with a pistol', 'weapon:pistol', 12, 250, 'weapon'),
  t('d_shotgun', 'Get {n} kills with a shotgun', 'weapon:shotgun', 12, 250, 'weapon'),
  t('d_assault', 'Get {n} kills with an assault rifle', 'weapon:assault', 15, 250, 'weapon'),
  t('d_sniper', 'Get {n} kills with a sniper rifle', 'weapon:sniper', 8, 300, 'weapon'),
  t('d_lmg', 'Get {n} kills with a machine gun', 'weapon:lmg', 15, 250, 'weapon'),
  t('d_longshot', 'Get {n} Long Shots', 'medal:longShot', 3, 300, 'longshot'),
  t('d_pointblank', 'Get {n} Point Blank kills', 'medal:pointBlank', 5, 250, 'pointblank'),
  t('d_doubletap', 'Earn a Double Tap', 'medal:doubleTap', 1, 250, 'doubletap'),
  t('d_doublekill', 'Get {n} Double Kills', 'medal:doubleKill', 3, 250, 'multi'),
  t('d_triple', 'Get a Triple Kill', 'medal:tripleKill', 1, 350, 'multi'),
  t('d_revenge', 'Get {n} Revenges', 'medal:revenge', 2, 250, 'revenge'),
  t('d_clutch', 'Pull off a Clutch', 'medal:clutch', 1, 300, 'clutch'),
  t('d_closecall', 'Survive {n} Close Calls', 'medal:closeCall', 2, 200, 'closecall'),
  t('d_firstblood', 'Draw First Blood {n} times', 'medal:firstBlood', 2, 250, 'firstblood'),
  t('d_bounty', 'Collect a Bounty', 'medal:bounty', 1, 300, 'bounty'),
  t('d_shutdown', 'Shut down a streak', 'medal:shutdown', 1, 300, 'bounty'),
  t('d_airdrop', 'Break an airdrop crate', 'medal:specialDelivery', 1, 250, 'arena'),
  t('d_chain', 'Kill 2 with one barrel chain', 'medal:chainReaction', 1, 400, 'arena'),
  t('d_kaboom', 'Get {n} barrel kills', 'medal:kaboom', 3, 300, 'arena'),
  t('d_games', 'Play {n} matches', 'games', 3, 150, 'games'),
  t('d_finish', 'Finish {n} rounds', 'finishes', 3, 200, 'games'),
  t('d_win', 'Win a round', 'wins', 1, 300, 'win'),
  t('d_streak5', 'Get a {n}-kill streak', 'streak', 5, 300, 'streak'),
  t('d_streak3', 'Get a {n}-kill streak', 'streak', 3, 150, 'streak'),
  t('d_nights', 'Survive {n} zombie nights', 'nights', 2, 300, 'zom'),
  t('d_zkills', 'Squash {n} zombies', 'zkills', 50, 250, 'zom'),
  t('d_medals', 'Earn {n} medals', 'medals', 5, 200, 'medals'),
  t('d_ghost', 'Earn a Ghost medal', 'medal:ghost', 1, 300, 'ghost'),
];

export const WEEKLY_POOL: readonly ChallengeTemplate[] = [
  t('w_kills150', 'Get {n} kills', 'kills', 150, 1000, 'kills'),
  t('w_kills300', 'Get {n} kills', 'kills', 300, 1600, 'kills'),
  t('w_wins5', 'Win {n} rounds', 'wins', 5, 1400, 'win'),
  t('w_games20', 'Play {n} matches', 'games', 20, 1000, 'games'),
  t('w_longshot15', 'Get {n} Long Shots', 'medal:longShot', 15, 1500, 'longshot'),
  t('w_medals40', 'Earn {n} medals', 'medals', 40, 1200, 'medals'),
  t('w_streak10', 'Get a {n}-kill streak', 'streak', 10, 1800, 'streak'),
  t('w_nights10', 'Survive {n} zombie nights', 'nights', 10, 1500, 'zom'),
  t('w_zkills400', 'Squash {n} zombies', 'zkills', 400, 1500, 'zom'),
  t('w_airdrop5', 'Break {n} airdrop crates', 'medal:specialDelivery', 5, 1500, 'arena'),
  t('w_chain3', 'Set off {n} barrel chains', 'medal:chainReaction', 3, 2000, 'arena'),
  t('w_assault60', 'Get {n} kills with an assault rifle', 'weapon:assault', 60, 1200, 'weapon'),
  t('w_sniper40', 'Get {n} kills with a sniper rifle', 'weapon:sniper', 40, 1600, 'weapon'),
  t('w_smg60', 'Get {n} kills with an SMG', 'weapon:smg', 60, 1200, 'weapon'),
  t('w_triple5', 'Get {n} Triple Kills', 'medal:tripleKill', 5, 1500, 'multi'),
  t('w_bastion', 'Hold the Bastion {n} times', 'bastion', 1, 2000, 'zom'),
];

export const CHALLENGE_BY_ID: ReadonlyMap<string, ChallengeTemplate> = new Map([...DAILY_POOL, ...WEEKLY_POOL].map((c) => [c.id, c]));
export const challengeText = (tpl: Pick<ChallengeTemplate, 'text'>, target: number): string => tpl.text.replace('{n}', String(target));

/** One challenge a profile holds. `grant` is the cosmetic id completing it unlocks. */
export type ChallengeItem = { id: string; target: number; xp: number; progress: number; done: boolean; grant?: string };
export type ChallengesState = { day: string; daily: ChallengeItem[]; week: string; weekly: ChallengeItem[] };
export type ChallengeView = ChallengeItem & { text: string };
/** `dailyResetsAt` and `weeklyResetsAt` are ms since the epoch (UTC midnight, and the next Monday's). */
export type ChallengesView = { day: string; dailyResetsAt: number; daily: ChallengeView[]; week: string; weeklyResetsAt: number; weekly: ChallengeView[] };

const DAY_MS = 86_400_000;
const dayStart = (now: number) => Math.floor(now / DAY_MS) * DAY_MS;
export const dayResetAt = (now: number): number => dayStart(now) + DAY_MS;
/** The next Monday 00:00 UTC. */
export const weekResetAt = (now: number): number => { const dow = new Date(now).getUTCDay() || 7; return dayStart(now) + (8 - dow) * DAY_MS; };
/** The ISO week, `YYYY-Www`, Monday to Sunday in UTC. */
export function weekKey(now: number): string {
  const d = new Date(dayStart(now));
  d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
  const week = Math.ceil(((d.getTime() - Date.UTC(d.getUTCFullYear(), 0, 1)) / DAY_MS + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}

/** Three challenges for a period, chosen by `periodKey` and `profileKey` alone (plus `owned`, for the weekly cosmetic). */
export function pickChallenges(kind: 'daily' | 'weekly', periodKey: string, profileKey: string, owned: ReadonlySet<string> = new Set()): ChallengeItem[] {
  const pool = kind === 'daily' ? DAILY_POOL : WEEKLY_POOL;
  const rand = seeded(hash32(`${kind}:${periodKey}:${profileKey.toLowerCase()}`));
  const order = [...pool];
  for (let i = order.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [order[i], order[j]] = [order[j]!, order[i]!]; }
  const chosen: ChallengeTemplate[] = [];
  for (const tpl of order) if (chosen.length < 3 && !chosen.some((c) => c.group === tpl.group)) chosen.push(tpl);
  const items = chosen.map((c): ChallengeItem => ({ id: c.id, target: c.target, xp: c.xp, progress: 0, done: false }));
  if (kind === 'weekly') {
    const free = CHALLENGE_COSMETICS.filter((id) => !owned.has(id));
    // The reward rides on the last challenge that can be done in a versus room, so nobody is held back by a zombies-only one.
    const at = [2, 1, 0].find((i) => chosen[i]!.group !== 'zom') ?? 2;
    if (free.length) items[at]!.grant = free[hash32(periodKey) % free.length]!;
  }
  return items;
}

export function freshChallenges(now: number, profileKey: string, owned?: ReadonlySet<string>): ChallengesState {
  const day = dayKey(now), week = weekKey(now);
  return { day, daily: pickChallenges('daily', day, profileKey), week, weekly: pickChallenges('weekly', week, profileKey, owned) };
}

/** Brings a profile's challenges up to `now`: a new day replaces the daily set, a new ISO week the weekly set. Returns the same object when nothing changed. */
export function rollChallenges(state: ChallengesState | undefined, now: number, profileKey: string, owned?: ReadonlySet<string>): ChallengesState {
  const day = dayKey(now), week = weekKey(now);
  if (state && state.day === day && state.week === week) return state;
  return {
    day, daily: state && state.day === day ? state.daily : pickChallenges('daily', day, profileKey),
    week, weekly: state && state.week === week ? state.weekly : pickChallenges('weekly', week, profileKey, owned),
  };
}

/** What happened since the last event: counts, plus `streak` (this life's kills, a best-of) and the medals and weapon classes of kills. */
export type ChallengeEvents = {
  kills?: number; wins?: number; finishes?: number; games?: number; streak?: number; nights?: number; zkills?: number; bastion?: number;
  medals?: readonly MedalId[]; weaponKills?: readonly WeaponId[];
};

/** How much one event batch moves a stat. */
export function statGain(stat: ChallengeStat, ev: ChallengeEvents): number {
  if (stat.startsWith('weapon:')) return ev.weaponKills?.filter((w) => w === stat.slice(7)).length ?? 0;
  if (stat.startsWith('medal:')) return ev.medals?.filter((m) => m === stat.slice(6)).length ?? 0;
  if (stat === 'medals') return ev.medals?.length ?? 0;
  return ev[stat as 'kills'] ?? 0;
}

/** Folds events into `items` in place and returns those that just completed. A streak challenge keeps the best life, the rest add up. */
export function applyEvents(items: ChallengeItem[], ev: ChallengeEvents): ChallengeItem[] {
  const completed: ChallengeItem[] = [];
  for (const item of items) {
    const tpl = CHALLENGE_BY_ID.get(item.id);
    if (item.done || !tpl) continue;
    const gain = statGain(tpl.stat, ev);
    if (gain <= 0) continue;
    item.progress = Math.min(item.target, tpl.stat === 'streak' ? Math.max(item.progress, gain) : item.progress + gain);
    if (item.progress >= item.target) { item.done = true; completed.push(item); }
  }
  return completed;
}

const viewOf = (item: ChallengeItem): ChallengeView => ({ ...item, text: challengeText(CHALLENGE_BY_ID.get(item.id) ?? { text: item.id }, item.target) });
export const challengesView = (s: ChallengesState, now: number): ChallengesView => ({
  day: s.day, dailyResetsAt: dayResetAt(now), daily: s.daily.map(viewOf), week: s.week, weeklyResetsAt: weekResetAt(now), weekly: s.weekly.map(viewOf),
});

/** Cleans a saved challenge list: known templates only, sane numbers. */
export function cleanItems(raw: unknown, pool: readonly ChallengeTemplate[]): ChallengeItem[] {
  if (!Array.isArray(raw)) return [];
  const out: ChallengeItem[] = [];
  for (const r of raw.slice(0, 3)) {
    if (typeof r !== 'object' || r === null) continue;
    const o = r as Record<string, unknown>;
    const tpl = pool.find((p) => p.id === o.id);
    if (!tpl) continue;
    const progress = typeof o.progress === 'number' && Number.isFinite(o.progress) ? Math.min(tpl.target, Math.max(0, Math.floor(o.progress))) : 0;
    const grant = typeof o.grant === 'string' && CHALLENGE_COSMETICS.includes(o.grant) ? o.grant : undefined;
    out.push({ id: tpl.id, target: tpl.target, xp: tpl.xp, progress, done: o.done === true && progress >= tpl.target, ...(grant && { grant }) });
  }
  return out;
}
