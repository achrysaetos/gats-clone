import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { badgeKey, CAREER, CAREER_IDS, KM_PX, MEDAL_IDS, WEAPON_IDS, type Badge, type MedalId, type WeaponId } from '../shared/defs.ts';

/**
 * Every human name has a profile, signed in or not: career kills and deaths, matches, best streak, distance walked, every
 * medal earned, and every lifetime medal (a rung of a `CAREER` track) with when it was earned. A registered account owns its
 * name: registering wipes whatever guests left under it, and from then on only the signed-in account writes to it (see
 * `profileKey` in room.ts). Guests sharing an unregistered name share a profile. Bots keep none.
 */
export type Profile = {
  name: string;
  kills: number;
  deaths: number;
  games: number;
  bestStreak: number;
  /** Career distance walked, in px. */
  distance: number;
  medals: Partial<Record<MedalId, number>>;
  /** Career kills by weapon class, for the weapon mastery tracks. */
  weaponKills: Partial<Record<WeaponId, number>>;
  /** When each lifetime medal was earned, in ms since the epoch, by `badgeKey`. */
  badges: Record<string, number>;
  firstSeen: number;
  lastSeen: number;
};

export type ProfileDelta = { kills?: number; deaths?: number; games?: number; streak?: number; distance?: number; medals?: readonly MedalId[]; weaponKills?: readonly WeaponId[] };

export type Profiles = {
  get(name: string): Profile | null;
  /** Folds a change into a name's profile, making the profile if need be, and returns any lifetime medals it newly earned. */
  record(name: string, delta: ProfileDelta, now?: number): Badge[];
  /** The rarest lifetime medal a name holds, the one it wears in matches. */
  featured(name: string): Badge | null;
  /** Wipes a name's profile, when an account is registered under it, so nobody inherits what guests did under that name. */
  reset(name: string): void;
  flush(): Promise<void>;
};

const key = (name: string) => name.toLowerCase();
const SAVE_DELAY_MS = 2000;

export const freshProfile = (name: string, now: number): Profile =>
  ({ name, kills: 0, deaths: 0, games: 0, bestStreak: 0, distance: 0, medals: {}, weaponKills: {}, badges: {}, firstSeen: now, lastSeen: now });

/** How far a profile has come on a track. */
export function trackCount(p: Profile, track: (typeof CAREER_IDS)[number]): number {
  const needs = CAREER[track].needs;
  if (needs === 'km') return Math.floor(p.distance / KM_PX);
  if (needs === 'kills' || needs === 'games' || needs === 'bestStreak') return p[needs];
  if (needs.startsWith('kills:')) return p.weaponKills[needs.slice(6) as WeaponId] ?? 0;
  return p.medals[needs as MedalId] ?? 0;
}

/** Applies `delta` to a profile and stamps every rung of a track it now reaches; returns the newly earned ones. */
export function applyDelta(p: Profile, delta: ProfileDelta, now: number): Badge[] {
  p.kills += delta.kills ?? 0;
  p.deaths += delta.deaths ?? 0;
  p.games += delta.games ?? 0;
  p.distance += delta.distance ?? 0;
  p.bestStreak = Math.max(p.bestStreak, delta.streak ?? 0);
  for (const m of delta.medals ?? []) p.medals[m] = (p.medals[m] ?? 0) + 1;
  for (const g of delta.weaponKills ?? []) p.weaponKills[g] = (p.weaponKills[g] ?? 0) + 1;
  p.lastSeen = now;
  const earned: Badge[] = [];
  for (const track of CAREER_IDS) {
    const have = trackCount(p, track);
    CAREER[track].at.forEach((need, tier) => {
      const b: Badge = { track, tier: tier as Badge['tier'] };
      if (have >= need && p.badges[badgeKey(b)] === undefined) { p.badges[badgeKey(b)] = now; earned.push(b); }
    });
  }
  return earned;
}

/** The rarest lifetime medal held: the highest tier on any track, the first such track in `CAREER_IDS` order. */
export function featuredBadge(p: Profile): Badge | null {
  let best: Badge | null = null;
  for (const track of CAREER_IDS) {
    for (let tier = 3; tier >= 0; tier--) {
      if (p.badges[badgeKey({ track, tier: tier as Badge['tier'] })] === undefined) continue;
      if (!best || tier > best.tier) best = { track, tier: tier as Badge['tier'] };
      break;
    }
  }
  return best;
}

/** Drops anything a saved file holds that the game no longer knows, so an old file cannot smuggle odd keys onto a page. */
function clean(raw: unknown): Profile | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : 0);
  if (typeof r.name !== 'string') return null;
  const pick = <K extends string>(ids: readonly K[], v: unknown) => {
    const out: Partial<Record<K, number>> = {};
    if (v && typeof v === 'object') for (const id of ids) if (num((v as Record<string, unknown>)[id])) out[id] = num((v as Record<string, unknown>)[id]);
    return out;
  };
  const keys = CAREER_IDS.flatMap((track) => [0, 1, 2, 3].map((tier) => badgeKey({ track, tier: tier as Badge['tier'] })));
  return {
    name: r.name, kills: num(r.kills), deaths: num(r.deaths), games: num(r.games), bestStreak: num(r.bestStreak), distance: num(r.distance),
    medals: pick(MEDAL_IDS, r.medals), weaponKills: pick(WEAPON_IDS, r.weaponKills), badges: pick(keys, r.badges) as Record<string, number>, firstSeen: num(r.firstSeen), lastSeen: num(r.lastSeen),
  };
}

export async function openProfiles(dataDir: string): Promise<Profiles> {
  await mkdir(dataDir, { recursive: true });
  const file = join(dataDir, 'profiles.json');
  const byKey = new Map<string, Profile>();
  try {
    const saved = JSON.parse(await readFile(file, 'utf8')) as Record<string, unknown>;
    for (const raw of Object.values(saved)) {
      const p = clean(raw);
      if (p) byKey.set(key(p.name), p);
    }
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err;
  }
  let saveQueue = Promise.resolve();
  const save = () => {
    saveQueue = saveQueue
      .then(async () => { await writeFile(`${file}.tmp`, JSON.stringify(Object.fromEntries(byKey))); await rename(`${file}.tmp`, file); })
      .catch((err: unknown) => console.error('profiles save failed', err));
    return saveQueue;
  };
  let pending: ReturnType<typeof setTimeout> | null = null;
  const saveSoon = () => { pending ??= setTimeout(() => { pending = null; void save(); }, SAVE_DELAY_MS); };
  return {
    get: (name) => byKey.get(key(name)) ?? null,
    record(name, delta, now = Date.now()) {
      let p = byKey.get(key(name));
      if (!p) byKey.set(key(name), (p = freshProfile(name, now)));
      const earned = applyDelta(p, delta, now);
      saveSoon();
      return earned;
    },
    featured(name) {
      const p = byKey.get(key(name));
      return p ? featuredBadge(p) : null;
    },
    reset(name) {
      if (byKey.delete(key(name))) saveSoon();
    },
    flush() {
      if (pending) { clearTimeout(pending); pending = null; void save(); }
      return saveQueue;
    },
  };
}

/** A profile as the API serves it. */
export const profileView = (p: Profile) => ({ ...p, featured: featuredBadge(p) });

/** A profile store that keeps nothing, for rooms and tests that need none. */
export const NO_PROFILES: Profiles = { get: () => null, record: () => [], featured: () => null, reset: () => {}, flush: () => Promise.resolve() };
