import { COSMETIC_BY_ID, DEFAULTS, SLOT_KEY, SLOTS, type Cos, type Cosmetic, type Equipped, type Picks, type Rarity, type Slot } from '../shared/cosmetics.ts';
import { CAREER, CAREER_TIERS } from '../shared/defs.ts';

/**
 * How a player's cosmetics map onto what is drawn. `PlayerView.cos` carries only non-default ids (plus level and stars), and an
 * id this build cannot draw falls back to the slot's default, so an old client never breaks on a newer catalog. Everything here
 * is pure; the drawing itself lives in hats.ts (helmets and camo), gunart.ts (gun skins), killfx.ts (kill effects) and render.ts
 * (name tags).
 */
export type CosLook = {
  helmet: string; camo: string; skin: string; nameColor: string; title: string; killFx: string;
  /** Account level and prestige stars, humans only (0 when not shown). */
  level: number; prestige: number;
};

const known = (slot: Slot, id: string | undefined): string => {
  const c = id ? COSMETIC_BY_ID.get(id) : undefined;
  return c && c.slot === slot ? c.id : DEFAULTS[slot];
};

export function cosLook(cos?: Cos | null): CosLook {
  return {
    helmet: known('helmet', cos?.h), camo: known('camo', cos?.c), skin: known('gunSkin', cos?.g),
    nameColor: known('nameColor', cos?.n), title: known('title', cos?.t), killFx: known('killFx', cos?.k),
    level: Math.max(0, Math.floor(cos?.l ?? 0)), prestige: Math.max(0, Math.floor(cos?.p ?? 0)),
  };
}

/** The same mapping from an equipped set (the armory's preview, the profile page). */
export const lookOfEquipped = (e: Picks | Equipped | undefined): CosLook => {
  const cos: Cos = {};
  for (const slot of SLOTS) { const id = e?.[slot]; if (id && id !== DEFAULTS[slot]) cos[SLOT_KEY[slot]] = id; }
  return cosLook(cos);
};

/** The short id after the slot letter: `h_viking` is `viking`. */
export const shortId = (id: string): string => id.slice(2);

/** Rarity ink for plates and borders: catalog swatch colours only, gold being kept for reward as the art bible asks. */
export const RARITY_INK: Record<Rarity, string> = { common: '#b9b3a2', rare: '#7cc4ff', epic: '#c3a6ff', legendary: '#ffd34d' };
export const RARITY_NAME: Record<Rarity, string> = { common: 'Common', rare: 'Rare', epic: 'Epic', legendary: 'Legendary' };
const RARITY_RANK: Record<Rarity, number> = { common: 0, rare: 1, epic: 2, legendary: 3 };
export const rarityRank = (r: Rarity): number => RARITY_RANK[r];

/** What it takes to earn an item, for the locked card: "Level 34", "Centurion II", "Weekly challenge". */
export function unlockLabel(c: Cosmetic): string {
  const u = c.unlock;
  if ('default' in u) return 'Default';
  if ('level' in u) return `Level ${u.level}`;
  if ('career' in u) return `${CAREER[u.career].name} ${['I', 'II', 'III', 'IV'][u.tier]}`;
  return 'Weekly challenge';
}
/** The lifetime medal rung an item asks for, as its tier name ("silver"), or null. */
export const unlockTier = (c: Cosmetic): string | null => ('career' in c.unlock ? CAREER_TIERS[c.unlock.tier]! : null);
