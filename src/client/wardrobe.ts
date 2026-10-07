import { DEFAULTS, SLOTS, type Equipped, type Picks, type ProgressMsg, type Slot } from '../shared/cosmetics.ts';
import type { ChallengesView } from '../shared/challenges.ts';
import { levelState, type LevelState } from '../shared/cosmetics.ts';
import { fetchProfile, loadCosmetics, postEquip, saveCosmetics, type Account } from './api.ts';
import { joinPicks, mergeEquipped, owns, type ProfileLite } from './progression.ts';
import { COSMETIC_BY_ID } from '../shared/cosmetics.ts';

/**
 * The player's wardrobe: level, XP, what they own and what they wear, kept in step with the server. A signed-in account's
 * choices live on the server (POST /api/equip); a guest's live in the browser (`skirmish.cosmetics`) and travel with `join`.
 * While a match is on, a change is also sent down the socket so everyone sees it at once. The screens subscribe to changes.
 */
export type WardrobeState = {
  name: string;
  level: LevelState;
  xp: number;
  /** Null until the server has been asked (or when the name has no profile: then only defaults are owned). */
  unlocked: ReadonlySet<string> | null;
  equipped: Equipped;
  challenges: ChallengesView | null;
  signedIn: boolean;
  /** The last equip error, for the armory to show. */
  notice: string;
};

export type Wardrobe = ReturnType<typeof createWardrobe>;

export function createWardrobe(deps: { account(): Account | null; sendEquip(slot: Slot, id: string): void }) {
  let local: Picks = loadCosmetics();
  let profile: ProfileLite | null = null;
  let loaded = false;
  let name = '';
  let notice = '';
  let challenges: ChallengesView | null = null;
  let level: LevelState = levelState(0);
  let xp = 0;
  let unlocked: Set<string> | null = null;
  let server: Equipped | null = null;
  const listeners = new Set<() => void>();
  const emit = () => { for (const l of listeners) l(); };

  const equipped = (): Equipped => mergeEquipped({ signedIn: !!deps.account(), server, local, unlocked });
  const state = (): WardrobeState => ({ name, level, xp, unlocked, equipped: equipped(), challenges, signedIn: !!deps.account(), notice });

  const adopt = (p: ProfileLite | null) => {
    profile = p;
    loaded = true;
    if (p) {
      level = { level: p.level, prestige: p.prestige, xpInLevel: p.xpInLevel, xpToNext: p.xpToNext };
      xp = p.xp;
      unlocked = new Set(p.unlocked);
      server = p.equipped;
      challenges = p.challenges;
    } else {
      level = levelState(0);
      xp = 0;
      // A name with no profile owns nothing but defaults.
      unlocked = new Set(SLOTS.map((s) => DEFAULTS[s]));
      server = null;
      challenges = null;
    }
  };

  return {
    state,
    get loaded() { return loaded; },
    subscribe(fn: () => void): () => void { listeners.add(fn); return () => listeners.delete(fn); },
    /** Loads the profile of the name that will be played (the account's own when signed in). */
    async refresh(playName: string) {
      name = deps.account()?.name ?? playName;
      if (!name.trim()) { adopt(null); emit(); return; }
      const asked = name;
      const p = await fetchProfile(asked);
      if (asked !== name) return;
      adopt(p);
      emit();
    },
    /** The picks to send with `join`. */
    joinPicks: (): Picks | undefined => joinPicks(!!deps.account(), equipped()),
    owns: (id: string): boolean => { const c = COSMETIC_BY_ID.get(id); return !!c && owns(unlocked, c); },
    /** Wears `id` in `slot`; false (with a notice) when it is locked or the server refuses. */
    async equip(slot: Slot, id: string): Promise<boolean> {
      const c = COSMETIC_BY_ID.get(id);
      if (!c || c.slot !== slot) return false;
      if (!owns(unlocked, c)) { notice = 'Locked. Keep playing to earn it.'; emit(); return false; }
      notice = '';
      const account = deps.account();
      if (account) {
        const before = server;
        server = { ...equipped(), [slot]: id };
        emit();
        const r = await postEquip(account.token, slot, id);
        if ('error' in r) { server = before; notice = r.error; emit(); return false; }
        server = r.equipped;
        unlocked = new Set(r.unlocked.length ? r.unlocked : [...(unlocked ?? [])]);
      } else {
        local = { ...local, [slot]: id };
        saveCosmetics(local);
      }
      deps.sendEquip(slot, id);
      emit();
      return true;
    },
    /** The server's `equipped` reply: the resolved full set. */
    onEquipped(e: Equipped) { if (deps.account()) server = e; else { local = { ...e }; for (const s of SLOTS) if (e[s] === DEFAULTS[s]) delete local[s]; saveCosmetics(local); } notice = ''; emit(); },
    /** A `progress` message: the new totals, unlocks and challenge state. */
    onProgress(m: ProgressMsg) {
      level = { level: m.level, prestige: m.prestige, xpInLevel: m.xpInLevel, xpToNext: m.xpToNext };
      xp = m.xp;
      challenges = m.challenges;
      if (unlocked) for (const id of m.unlocks) unlocked.add(id);
      else unlocked = new Set([...SLOTS.map((s) => DEFAULTS[s]), ...m.unlocks]);
      if (deps.account()) server = m.equipped;
      emit();
    },
    /** A server error that follows an equip (a locked item). */
    onError(message: string) { notice = message; emit(); },
    get profile() { return profile; },
  };
}
