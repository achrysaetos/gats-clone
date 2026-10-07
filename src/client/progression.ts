import { COSMETIC_BY_ID, DEFAULTS, isCosmeticId, levelState, MAX_LEVEL, PRESTIGE_XP, SLOTS, XP_REASON_LABEL, type Cosmetic, type Equipped, type LevelState, type Picks, type ProgressMsg, type Slot, type XpGain } from '../shared/cosmetics.ts';
import { CHALLENGE_BY_ID, challengeText, type ChallengesView, type ChallengeView } from '../shared/challenges.ts';
import { rarityRank } from './cosmeticlook.ts';

/**
 * The account progression the client shows, as pure functions (no DOM, no network): which cosmetics are worn when the server and
 * the browser both have a say, the level bar's numbers, the XP card's lines and the bar's fill steps, the challenges' countdowns
 * and completions. wardrobe.ts keeps the live state and the screens (armory.ts, xpcard.ts, challengepanel.ts) draw it.
 */

/** What the profile endpoint says about a player that the menu shows (a subset of `GET /api/profile/:name`). */
export type ProfileLite = {
  name: string; xp: number; level: number; prestige: number; xpInLevel: number; xpToNext: number;
  unlocked: string[]; equipped: Equipped; challenges: ChallengesView | null;
};

const num = (v: unknown, d = 0): number => (typeof v === 'number' && Number.isFinite(v) ? v : d);
const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null;

/** Reads the profile endpoint's JSON defensively; null when it is not a profile. */
export function parseProfile(v: unknown): ProfileLite | null {
  if (!isObj(v) || typeof v.name !== 'string') return null;
  const equipped: Equipped = { ...DEFAULTS };
  if (isObj(v.equipped)) for (const slot of SLOTS) { const id = v.equipped[slot]; if (isCosmeticId(slot, id)) equipped[slot] = id; }
  const unlocked = Array.isArray(v.unlocked) ? v.unlocked.filter((id): id is string => typeof id === 'string' && COSMETIC_BY_ID.has(id)) : [];
  const state = levelState(num(v.xp));
  return {
    name: v.name, xp: num(v.xp), level: num(v.level, state.level), prestige: num(v.prestige, state.prestige),
    xpInLevel: num(v.xpInLevel, state.xpInLevel), xpToNext: num(v.xpToNext, state.xpToNext), unlocked, equipped,
    challenges: isObj(v.challenges) && Array.isArray(v.challenges.daily) && Array.isArray(v.challenges.weekly) ? (v.challenges as unknown as ChallengesView) : null,
  };
}

/**
 * What a player wears in the armory: a signed-in account is whatever the server says it is. A guest keeps picks in the browser
 * (`local`), and a pick counts only when the guest's name has unlocked it (`unlocked` null while that is not known yet, when picks
 * are taken on trust and the server settles it at join); a slot with no pick of its own wears what the server holds for that name,
 * and anything else is the slot's default.
 */
export function mergeEquipped(o: { signedIn: boolean; server: Equipped | null; local: Picks; unlocked: ReadonlySet<string> | null }): Equipped {
  if (o.signedIn && o.server) return { ...DEFAULTS, ...o.server };
  const out: Equipped = { ...DEFAULTS, ...(o.server ?? {}) };
  for (const slot of SLOTS) {
    const id = o.local[slot];
    if (isCosmeticId(slot, id) && (o.unlocked === null || o.unlocked.has(id) || id === DEFAULTS[slot])) out[slot] = id;
  }
  return out;
}

/** The picks to send with `join`: a guest's whole look, every slot (a signed-in account's is the server's own, so nothing). */
export function joinPicks(signedIn: boolean, equipped: Equipped): Picks | undefined {
  if (signedIn) return undefined;
  const out: Picks = {};
  for (const slot of SLOTS) out[slot] = equipped[slot];
  return out;
}

/** Whether the account has the item (`unlocked` holds defaults too; before it is known only defaults count). */
export const owns = (unlocked: ReadonlySet<string> | null, c: Cosmetic): boolean => 'default' in c.unlock || (unlocked?.has(c.id) ?? false);

// ---- The level bar -------------------------------------------------------------------------------------------------

export type LevelBar = { level: number; prestige: number; pct: number; label: string; max: boolean };

/** The fill (0..1) of a level's bar. At the top level the bar fills toward the next prestige star instead. */
export const fillOf = (s: Pick<LevelState, 'xpInLevel' | 'xpToNext'>): number => {
  const span = s.xpInLevel + s.xpToNext;
  return span > 0 ? Math.max(0, Math.min(1, s.xpInLevel / span)) : 0;
};

export function levelBar(s: LevelState): LevelBar {
  const max = s.level >= MAX_LEVEL;
  const span = s.xpInLevel + s.xpToNext;
  const nf = (n: number) => Math.round(n).toLocaleString('en-US');
  return {
    level: s.level, prestige: s.prestige, max, pct: fillOf(s),
    label: max ? `${nf(s.xpInLevel)} / ${nf(PRESTIGE_XP)} XP to the next star` : `${nf(s.xpInLevel)} / ${nf(span)} XP`,
  };
}

// ---- The XP card ---------------------------------------------------------------------------------------------------

export type XpLine = { label: string; xp: number; text: string; reason: XpGain['reason'] };

/** One line per reason (a challenge per challenge), summed, in the order first seen, with `+` text for the plate. */
export function xpLines(gained: readonly XpGain[]): XpLine[] {
  const lines: XpLine[] = [];
  for (const g of gained) {
    if (g.xp <= 0) continue;
    const label = g.reason === 'challenge' && g.id ? challengeLabel(g.id) : XP_REASON_LABEL[g.reason];
    const hit = lines.find((l) => l.reason === g.reason && l.label === label);
    if (hit) { hit.xp += g.xp; hit.text = `+${hit.xp}`; } else lines.push({ label, xp: g.xp, text: `+${g.xp}`, reason: g.reason });
  }
  return lines;
}
export const xpTotal = (gained: readonly XpGain[]): number => gained.reduce((sum, g) => sum + Math.max(0, g.xp), 0);

function challengeLabel(id: string): string {
  const tpl = CHALLENGE_BY_ID.get(id);
  return tpl ? challengeText(tpl, tpl.target) : XP_REASON_LABEL.challenge;
}

/** Everything one card shows: the gains so far, the levels reached, the unlocks, and the state to fill the bar from and to. */
export type CardState = {
  gained: XpGain[]; levelUps: number[]; unlocks: string[];
  /** The XP total before the first gain this card holds, and after the last. */
  from: number; to: number;
};

/** Folds a `progress` message into the card being built (a life's end and a round's end close together share one card). */
export function foldProgress(card: CardState | null, msg: Pick<ProgressMsg, 'xp' | 'gained' | 'levelUps' | 'unlocks'>): CardState | null {
  const sum = xpTotal(msg.gained);
  if (sum === 0 && msg.levelUps.length === 0 && msg.unlocks.length === 0) return card;
  if (!card) return { gained: [...msg.gained], levelUps: [...msg.levelUps], unlocks: [...msg.unlocks], from: Math.max(0, msg.xp - sum), to: msg.xp };
  return {
    gained: [...card.gained, ...msg.gained],
    levelUps: [...card.levelUps, ...msg.levelUps],
    unlocks: [...new Set([...card.unlocks, ...msg.unlocks])],
    from: card.from, to: msg.xp,
  };
}

/** One leg of the bar's fill: on level `level` (with `prestige` stars) from `from` to `to` (0..1); `up` when it ends at a level-up. */
export type BarStep = { level: number; prestige: number; from: number; to: number; up: boolean };

/** The legs the bar fills through, from XP total `from` to `to`: a full leg for each level crossed, then the last part-leg. */
export function barSteps(from: number, to: number): BarStep[] {
  const a = levelState(Math.min(from, to)), b = levelState(Math.max(from, to));
  const steps: BarStep[] = [];
  let level = a.level, prestige = a.prestige, start = fillOf(a);
  for (let guard = 0; guard < 400 && (level < b.level || prestige < b.prestige); guard++) {
    steps.push({ level, prestige, from: start, to: 1, up: true });
    start = 0;
    if (level < MAX_LEVEL) level++; else prestige++;
  }
  steps.push({ level, prestige, from: start, to: fillOf(b), up: false });
  return steps;
}

/** The unlocked ids ordered for the reveal: rarest first, then catalog order. */
export function revealOrder(ids: readonly string[]): string[] {
  return ids.filter((id) => COSMETIC_BY_ID.has(id)).sort((x, y) => rarityRank(COSMETIC_BY_ID.get(y)!.rarity) - rarityRank(COSMETIC_BY_ID.get(x)!.rarity));
}

// ---- Challenges ----------------------------------------------------------------------------------------------------

/** "5h 12m", "2d 4h", "12m", "under a minute": the time to a reset. */
export function formatReset(ms: number): string {
  if (ms < 60_000) return 'under a minute';
  const mins = Math.floor(ms / 60_000), d = Math.floor(mins / 1440), h = Math.floor((mins % 1440) / 60), m = mins % 60;
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

export const challengePct = (c: Pick<ChallengeView, 'progress' | 'target'>): number => (c.target > 0 ? Math.max(0, Math.min(1, c.progress / c.target)) : 0);

/** The challenges that are done in `next` and were not in `prev` (all of the done ones when there is no `prev`: none, a first look is not news). */
export function newlyDone(prev: ChallengesView | null, next: ChallengesView): ChallengeView[] {
  if (!prev) return [];
  const was = new Set([...prev.daily, ...prev.weekly].filter((c) => c.done).map((c) => `${c.id}`));
  const sameDay = prev.day === next.day, sameWeek = prev.week === next.week;
  return [...(sameDay ? next.daily : []), ...(sameWeek ? next.weekly : [])].filter((c) => c.done && !was.has(c.id));
}

/** The weekly challenge that carries the cosmetic reward, and the reward. */
export function weeklyReward(c: ChallengesView): { challenge: ChallengeView; item: Cosmetic } | null {
  for (const w of c.weekly) { const item = w.grant ? COSMETIC_BY_ID.get(w.grant) : undefined; if (item) return { challenge: w, item }; }
  return null;
}

/** How many challenges are still open, for the menu tab's badge. */
export const openChallenges = (c: ChallengesView | null): number => (c ? [...c.daily, ...c.weekly].filter((x) => !x.done).length : 0);

/** Slots shown in the armory, in order, with a label each. */
export const SLOT_LABEL: Record<Slot, string> = { helmet: 'Helmet', camo: 'Camo', gunSkin: 'Gun skin', nameColor: 'Name colour', title: 'Title', killFx: 'Kill effect' };

/** How many of a slot's items an account holds, for the profile page's collection counts. */
export function collectionCounts(unlocked: ReadonlySet<string>): Record<Slot, { have: number; total: number }> {
  const out = Object.fromEntries(SLOTS.map((s) => [s, { have: 0, total: 0 }])) as Record<Slot, { have: number; total: number }>;
  for (const c of COSMETIC_BY_ID.values()) {
    out[c.slot].total++;
    if ('default' in c.unlock || unlocked.has(c.id)) out[c.slot].have++;
  }
  return out;
}

/** The next cosmetic a level earns above `level` (the lowest such level, the rarest of a tie), or null at the top. */
export function nextUnlock(level: number): Cosmetic | null {
  let best: Cosmetic | null = null;
  for (const c of COSMETIC_BY_ID.values()) {
    if (!('level' in c.unlock) || c.unlock.level <= level) continue;
    const at = c.unlock.level, bat = best && 'level' in best.unlock ? best.unlock.level : Infinity;
    if (at < bat || (at === bat && best && rarityRank(c.rarity) > rarityRank(best.rarity))) best = c;
  }
  return best;
}
