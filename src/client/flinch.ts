import { reducedMotion } from './screenfx.ts';

/**
 * A victim's flinch: when a round or blast lands the sprite jolts a few px along the shot and settles, harder the bigger the hit.
 * It is drawing only; the real shove is the sim's knockback (`KNOCK`), which moves the body itself.
 */
export const FLINCH = { ms: 150, minPx: 2, maxPx: 8, ref: 50 } as const;

export type Flinch = { dx: number; dy: number; px: number; at: number };
export type FlinchBook = Map<number, Flinch>;

const books = new WeakMap<object, FlinchBook>();
/** The flinches of one match session. */
export function flinchOf(key: object): FlinchBook {
  let b = books.get(key);
  if (!b) books.set(key, (b = new Map()));
  return b;
}

/** How hard a hit of `amount` health jolts: from `minPx` for a graze to `maxPx` for a sniper round. */
export const flinchPx = (amount: number): number => Math.min(FLINCH.maxPx, FLINCH.minPx + (FLINCH.maxPx - FLINCH.minPx) * Math.min(1, Math.sqrt(Math.max(0, amount) / (FLINCH.ref * 2))));

/** Notes a hit on `victim` shoving along `push` radians; a bigger hit replaces a smaller one still running. */
export function noteFlinch(book: FlinchBook, victim: number, push: number, amount: number, now: number) {
  const px = flinchPx(amount);
  const live = book.get(victim);
  if (live && now - live.at < FLINCH.ms && live.px * (1 - (now - live.at) / FLINCH.ms) > px) return;
  book.set(victim, { dx: Math.cos(push), dy: Math.sin(push), px, at: now });
}

/** How far the sprite is thrown at `now`: it snaps out in the first fifth, then eases back to rest. Zero when motion is reduced. */
export function flinchOffset(book: FlinchBook, victim: number, now: number): { x: number; y: number } {
  const f = book.get(victim);
  if (!f || reducedMotion()) return { x: 0, y: 0 };
  const t = (now - f.at) / FLINCH.ms;
  if (t < 0 || t >= 1) { if (t >= 1) book.delete(victim); return { x: 0, y: 0 }; }
  const k = t < 0.2 ? t / 0.2 : (1 - (t - 0.2) / 0.8) ** 2;
  return { x: f.dx * f.px * k, y: f.dy * f.px * k };
}
