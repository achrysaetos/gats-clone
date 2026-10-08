import { GUNS, type GunId } from '../shared/defs.ts';
import { MAPS, type ThemeId } from '../shared/maps.ts';
import type { FoleyId, Surface } from './foley.ts';
import { soundTimeline, type TimelineEntry } from './reloadbeats.ts';
import { emitSfxAt } from './sfxbus.ts';

/**
 * Reload foley, event-driven. A reload is a clock `[elapsedMs, totalMs]` (the server's `rl` for other soldiers, the predicted
 * one for you, see `selfReload`) and `soundTimeline(gun)` says at which share of it each sound belongs, the same beats the arm
 * animation is keyframed on. Each frame the clock is stepped and every beat it crossed is voiced once, live, so:
 *   - the sounds land on the motions at the reload's real length, perks and evolved guns included;
 *   - nothing is queued ahead: a reload that is cut off (a pickup, a death, a gun change) simply stops, with no orphan sounds;
 *   - a reload first seen part-way through (a soldier coming into view) skips the beats already behind it.
 * Your own are non-positional and a little louder; others' are placed in the world, quieter, culled out of earshot and rate-limited.
 */

// --- Mix ---------------------------------------------------------------------------------------------------------------------

/** Your own reload is heard at this level (twice the foley trim, so the mechanism reads over the fight); another soldier's at `OTHER_GAIN` before distance takes its share. */
export const SELF_GAIN = 2;
export const OTHER_GAIN = 1;
/** Beyond this share of the audible radius (1.2 view radii) a soldier's reload is not voiced at all: it would be near silent and just spend voices. */
const HEARD_SHARE = 0.8;
const AUDIBLE_RADII = 1.2;
/** At most this many of other soldiers' reload sounds per window, whatever the crowd. */
export const CROWD = { windowMs: 300, max: 5 } as const;
/** A frame gap longer than this (a hidden tab, a stall) is not caught up with beat by beat: the beats it spans are skipped. */
export const MAX_CATCHUP_MS = 250;
/** State kept for a soldier not stepped for this long is dropped. */
const STALE_MS = 400;

// --- Heft and floor ------------------------------------------------------------------------------------------------------------

/**
 * How big a gun's foley sounds next to its class gun's: from its damage and its reload time, an evolved gun is pitched lower
 * and hits a little harder if it is the bigger gun, higher and lighter if it is the smaller. Always within a tone of the class.
 */
export function heftOf(gun: GunId): { pitch: number; gain: number } {
  const g = GUNS[gun], b = GUNS[g.base];
  const size = (g.damage / b.damage) ** 0.08 * (g.reloadMs / b.reloadMs) ** 0.12;
  return { pitch: Math.max(0.86, Math.min(1.14, 1 / size)), gain: Math.max(0.9, Math.min(1.15, size ** 0.6)) };
}

const THEME_FLOOR: Record<ThemeId, Surface> = {
  market: 'concrete', museum: 'wood', subpen: 'metal', park: 'grass', summit: 'snow', railyard: 'dirt', harbor: 'concrete', embassy: 'wood', airbase: 'concrete', wasteland: 'dirt',
};
let probe: ((x: number, y: number) => Surface | null) | null = null;
/** A map or theme that knows its floor to the tile (a wooden dock in a concrete harbor) registers it here; null falls back to the map's own floor. */
export const setFloorProbe = (p: ((x: number, y: number) => Surface | null) | null) => { probe = p; };

/** What the floor is at (`x`, `y`) of map `mapId`: the probe's say, else the theme's floor, else concrete. */
export function floorAt(mapId: string | undefined, x: number, y: number): Surface {
  const fine = probe?.(x, y);
  if (fine) return fine;
  const theme = mapId ? (MAPS as Record<string, { theme?: ThemeId }>)[mapId]?.theme : undefined;
  return (theme && THEME_FLOOR[theme]) || 'concrete';
}

// --- Cues --------------------------------------------------------------------------------------------------------------------------

export type FoleyCue = { id: FoleyId; gain: number; pitch: number; pan?: number; afterMs: number };

/** The sound `e` of `gun`'s reload makes: its recipe (the drop's by the floor), level, pitch and, for your own akimbo pair, stereo side. */
export function cueOf(e: TimelineEntry, gun: GunId, self: boolean, surface: Surface): FoleyCue {
  const h = heftOf(gun);
  const id = e.id === 'foley:drop' ? (`foley:drop:${surface}` as const) : e.id;
  return { id, gain: (e.gain ?? 1) * h.gain * (self ? SELF_GAIN : OTHER_GAIN), pitch: (e.pitch ?? 1) * h.pitch, ...(self && e.pan ? { pan: e.pan } : {}), afterMs: e.afterMs ?? 0 };
}

/** The whole reload of `gun` as cues, each `delayMs` into it at a reload of `reloadMs`: for rendering and checking a reload end to end (live play steps the clock instead). */
export function reloadCues(gun: GunId, reloadMs: number, o: { self?: boolean; surface?: Surface } = {}): (FoleyCue & { delayMs: number })[] {
  return soundTimeline(gun).map((e) => {
    const c = cueOf(e, gun, o.self ?? true, o.surface ?? 'concrete');
    return { ...c, delayMs: Math.round(e.at * reloadMs) + c.afterMs };
  });
}

// --- The clock ---------------------------------------------------------------------------------------------------------------------

export type FoleyEmit = (id: FoleyId, x: number, y: number, self: boolean, o: { gain: number; pitch: number; pan?: number; delayMs?: number }) => void;
export type Soldier = { id: number; gun: GunId; x: number; y: number; self: boolean; hidden?: boolean };
export type FoleyEnv = {
  /** Map id, for the floor a dropped mag lands on. */
  mapId?: string;
  /** Where the listener is and how far they see: soldiers beyond earshot are not voiced. Omitted, everyone is. */
  listener?: { x: number; y: number }; viewRadius?: number;
};

type Track = { gun: GunId; total: number; prev: number; at: number };

export type ReloadFoley = {
  /** Steps soldier `who`'s reload clock `rl` (`[elapsedMs, totalMs]`, null when not reloading) at page time `now`, voicing the beats crossed since the last step. */
  step(who: Soldier, rl: readonly [number, number] | null | undefined, now: number, env?: FoleyEnv): void;
  clear(): void;
};

export function createReloadFoley(emit: FoleyEmit): ReloadFoley {
  const tracks = new Map<number, Track>();
  const heard: number[] = [];
  let prunedAt = -Infinity;

  /** Whether another soldier's sound may play now: at most `CROWD.max` per window. */
  function crowdAllows(now: number): boolean {
    while (heard.length && now - heard[0]! >= CROWD.windowMs) heard.shift();
    if (heard.length >= CROWD.max) return false;
    heard.push(now);
    return true;
  }

  function step(who: Soldier, rl: readonly [number, number] | null | undefined, now: number, env: FoleyEnv = {}) {
    if (now - prunedAt > 2000) {
      prunedAt = now;
      for (const [i, t] of tracks) if (now - t.at > 3000) tracks.delete(i);
    }
    // No reload (it ended, or was cut off): nothing is pending, because nothing was ever queued.
    if (!rl || !(rl[1] > 0)) { tracks.delete(who.id); return; }
    const total = rl[1], t = Math.max(0, Math.min(1, rl[0] / total));
    let tr = tracks.get(who.id);
    // First seen (or seen again after a gap, a new gun, a new length, or the clock running backwards: a fresh reload): the beats behind `t` are skipped.
    if (!tr || tr.gun !== who.gun || tr.total !== total || now - tr.at > STALE_MS || t < tr.prev) {
      tracks.set(who.id, { gun: who.gun, total, prev: t, at: now });
      return;
    }
    const from = tr.prev;
    tr.prev = t;
    tr.at = now;
    if (t <= from) return;
    if ((t - from) * total > MAX_CATCHUP_MS) return;
    if (who.hidden && !who.self) return;
    if (!who.self && env.listener && env.viewRadius) {
      if (Math.hypot(who.x - env.listener.x, who.y - env.listener.y) > env.viewRadius * AUDIBLE_RADII * HEARD_SHARE) return;
    }
    let surface: Surface | null = null;
    for (const e of soundTimeline(who.gun)) {
      if (e.at <= from) continue;
      if (e.at > t) break;
      if (!who.self && !crowdAllows(now)) continue;
      surface ??= floorAt(env.mapId, who.x, who.y);
      const c = cueOf(e, who.gun, who.self, surface);
      emit(c.id, who.x, who.y, who.self, { gain: c.gain, pitch: c.pitch, ...(c.pan === undefined ? {} : { pan: c.pan }), ...(c.afterMs ? { delayMs: c.afterMs } : {}) });
    }
  }

  return { step, clear: () => { tracks.clear(); heard.length = 0; } };
}

let tap: FoleyEmit | null = null;
/** Dev probe: sees every reload sound the page voices (`?dev` logs them for `skirmishDev.reloadLog`). */
export const tapReloadFoley = (fn: FoleyEmit | null) => { tap = fn; };

/** The page's reload foley, voiced through the sound bus. */
export const reloadFoley = createReloadFoley((id, x, y, self, o) => { tap?.(id, x, y, self, o); emitSfxAt(id, x, y, self, o); });
