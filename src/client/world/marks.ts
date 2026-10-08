import { GUNS, type GunId } from '../../shared/defs.ts';
import { KIT, type PieceId } from '../../shared/kit.ts';
import type { Effect } from '../state.ts';
import { CASING, GUN_FRAMES } from './catalog.ts';

/**
 * What a fight leaves on the floor: scorch, blood, plank and rubble piles, chunks and casings. A mark may be thrown first:
 * it flies from (`x0`, `y0`) and lands at (`x`, `y`) `flyMs` after `born`, hopping `hop` units and turning from `turn0` to
 * `turn`, then lies there. Everything follows from these launch values, so drawing a frame never changes a mark.
 */
export type Mark = {
  sprite: string; frame: number;
  x0: number; y0: number; x: number; y: number;
  turn0: number; turn: number;
  hop: number; born: number; flyMs: number;
  /** Units the sprite's frame box is scaled by, and how strongly it marks the floor. */
  scale: number; alpha: number;
  /** Multiplied into the sprite's colour. */
  tint: number;
};

/**
 * A ring of marks: a new one takes the oldest slot once the ring is full. `cap` is the most a ring ever holds; the painter
 * draws only the newest `budget` (the quality tier's), so a low tier recycles sooner without dropping the ring.
 * `lifeMs` retires a mark however much room is left; Infinity keeps it for the match.
 */
export type Ring = { slots: (Mark | null)[]; next: number; lifeMs: number };

export const createRing = (cap: number, lifeMs = Infinity): Ring => ({ slots: Array.from({ length: cap }, () => null), next: 0, lifeMs });

export function add(ring: Ring, m: Mark) {
  ring.slots[ring.next] = m;
  ring.next = (ring.next + 1) % ring.slots.length;
}

export function clear(ring: Ring) {
  ring.slots.fill(null);
  ring.next = 0;
}

/** How long a retiring mark takes to fade, and over how many of the oldest drawn marks a full budget fades out. */
export const FADE = { ms: 2000, ranks: 8 } as const;

export type Placed = { m: Mark; x: number; y: number; turn: number; lift: number; alpha: number; flying: boolean };

/** The share of a throw spent on its first hop; the rest is one small bounce a quarter as high. */
const FIRST_HOP = 0.72;

/** Where a mark is at `now`: eased along its throw, hopping once and bouncing once, then at rest. */
export function markAt(m: Mark, now: number): Omit<Placed, 'alpha' | 'm'> {
  const t = m.flyMs > 0 ? Math.min(1, Math.max(0, (now - m.born) / m.flyMs)) : 1;
  const e = 1 - (1 - t) * (1 - t);
  const u = t < FIRST_HOP ? t / FIRST_HOP : (t - FIRST_HOP) / (1 - FIRST_HOP);
  const lift = m.hop * 4 * u * (1 - u) * (t < FIRST_HOP ? 1 : 0.25);
  return { x: m.x0 + (m.x - m.x0) * e, y: m.y0 + (m.y - m.y0) * e, turn: m.turn0 + (m.turn - m.turn0) * e, lift, flying: t < 1 };
}

/** The newest `budget` marks born by `now`, newest first, with the opacity each is drawn at. */
export function visible(ring: Ring, budget: number, now: number): Placed[] {
  const out: Placed[] = [];
  const n = ring.slots.length;
  const take = Math.min(budget, n);
  // Only a full budget is about to recycle its oldest, so only then do they fade.
  const full = (ring.slots[ring.next] ? n : ring.next) > take;
  for (let i = 1; i <= n && out.length < take; i++) {
    const m = ring.slots[(ring.next - i + n) % n];
    if (!m) break;
    if (m.born > now) continue;
    const age = now - m.born;
    if (age >= ring.lifeMs) continue;
    const fade = Math.min(1, (ring.lifeMs - age) / FADE.ms, full ? (take - out.length) / FADE.ranks : 1);
    out.push({ m, ...markAt(m, now), alpha: m.alpha * fade });
  }
  return out;
}

type Rect = { x: number; y: number; w: number; h: number };
type Rand = () => number;

const mark = (sprite: string, frame: number, x: number, y: number, born: number, rest: Partial<Mark> = {}): Mark =>
  ({ sprite, frame, x0: x, y0: y, x, y, turn0: 0, turn: 0, hop: 0, born, flyMs: 0, scale: 1, alpha: 1, tint: 0xffffff, ...rest });

/** A piece thrown from (x, y) out to `reach` along `angle`, spinning as it flies. */
function thrown(sprite: string, frame: number, x: number, y: number, angle: number, reach: number, born: number, rand: Rand, rest: Partial<Mark> = {}): Mark {
  const turn0 = rand() * Math.PI * 2;
  return mark(sprite, frame, x, y, born, {
    x: x + Math.cos(angle) * reach, y: y + Math.sin(angle) * reach,
    turn0, turn: turn0 + (rand() - 0.5) * 9, hop: reach * (0.25 + rand() * 0.25), flyMs: 260 + reach * 4 + rand() * 120, ...rest,
  });
}

const PILE: Record<'wood' | 'metal' | 'concrete', { pile: string; frames: number; size: number; bits: string; tint: number }> = {
  wood: { pile: 'decal.planks', frames: 3, size: 80, bits: 'fx.plank', tint: 0xffffff },
  metal: { pile: 'decal.scrap', frames: 2, size: 60, bits: 'fx.chunk', tint: 0x6a5048 },
  concrete: { pile: 'decal.rubble', frames: 3, size: 72, bits: 'fx.chunk', tint: 0xffffff },
};

/** A broken piece: its bits flung out across the floor and the pile it leaves where it stood. */
export function brokeMarks(piece: PieceId, r: Rect, born: number, rand: Rand): Mark[] {
  const kind = PILE[KIT[piece].breaks?.debris ?? 'wood'];
  const cx = r.x + r.w / 2, cy = r.y + r.h / 2, size = Math.max(r.w, r.h);
  const out = [mark(kind.pile, Math.floor(rand() * kind.frames), cx, cy, born, { turn: rand() * Math.PI * 2, scale: (size * 1.8) / kind.size })];
  const bits = 5 + Math.round(size / 15);
  for (let i = 0; i < bits; i++) {
    const a = (i / bits) * Math.PI * 2 + rand() * 0.8;
    out.push(thrown(kind.bits, Math.floor(rand() * 3), cx, cy, a, size * (0.45 + rand() * 0.9), born, rand, { tint: kind.tint }));
  }
  return out;
}

/** The nearest point of `r` to (x, y). */
const nearest = (r: Rect, x: number, y: number) => ({ x: Math.max(r.x, Math.min(r.x + r.w, x)), y: Math.max(r.y, Math.min(r.y + r.h, y)) });

/** A blast: the scorch it burns into the floor, smaller than its reach, and chunks it knocks off the concrete walls it reaches. */
export function boomMarks(x: number, y: number, r: number, walls: readonly (Rect & { material?: string })[], born: number, rand: Rand): Mark[] {
  const out = [mark('decal.scorch', Math.floor(rand() * 3), x, y, born, { turn: rand() * Math.PI * 2, scale: r / 140, alpha: 0.8 })];
  for (const w of walls) {
    if (w.material !== 'concrete') continue;
    const p = nearest(w, x, y);
    const d = Math.hypot(p.x - x, p.y - y);
    if (d > r * 0.8 || d < 1) continue;
    const away = Math.atan2(y - p.y, x - p.x);
    for (let i = 0; i < 4; i++) out.push(thrown('fx.chunk', Math.floor(rand() * 3), p.x, p.y, away + (rand() - 0.5) * 1.6, 12 + rand() * 40, born, rand));
    out.push(mark('decal.rubble', Math.floor(rand() * 3), p.x + Math.cos(away) * 10, p.y + Math.sin(away) * 10, born, { turn: rand() * Math.PI * 2, scale: 0.45 }));
  }
  return out;
}

/** A spent casing kicked out to the shooter's right, landing a short way off. */
export function casingMark(gun: GunId, x: number, y: number, angle: number, born: number, rand: Rand): Mark {
  const side = angle + Math.PI / 2 + 0.25 + (rand() - 0.5) * 0.6;
  return thrown('fx.casing', CASING[GUNS[gun].base], x, y, side, 14 + rand() * 18, born, rand, { hop: 6 });
}

const SPLAT = { death: 'decal.blood', splat: 'decal.ichor' } as const;

/**
 * What a round leaves on the floor where it struck: blood flicked out behind a soldier it hit, a chip of concrete or a
 * splinter knocked down from cover. Metal only sparks. One in two rounds leaves one, so a long burst marks without carpeting.
 */
export function impactMarks(fx: Extract<Effect, { kind: 'impact' }>, rand: Rand): Mark[] {
  if (rand() < 0.5) return [];
  const dir = fx.dir ?? rand() * Math.PI * 2;
  if (fx.victim !== null) {
    if (fx.surface !== 'player') return [];
    return [mark('decal.blood', Math.floor(rand() * 4), fx.x + Math.cos(dir) * (14 + rand() * 10), fx.y + Math.sin(dir) * (14 + rand() * 10), fx.born, { turn: rand() * Math.PI * 2, scale: 0.3 + rand() * 0.15, alpha: 0.8 })];
  }
  const back = dir + Math.PI + (rand() - 0.5) * 1.4;
  if (fx.material === 'wood') return [thrown('fx.plank', 2, fx.x, fx.y, back, 8 + rand() * 14, fx.born, rand, { scale: 0.35 })];
  if (fx.material === 'concrete' || fx.material === 'planter' || fx.material === undefined) return [thrown('fx.chunk', 2, fx.x, fx.y, back, 8 + rand() * 16, fx.born, rand, { scale: 0.7 })];
  return [];
}

/** A spent magazine dropped from a reload: the gun's own magazine frame, falling beside the soldier's left foot. */
export function magMark(gun: GunId, x: number, y: number, angle: number, born: number, rand: Rand): Mark {
  return thrown(`gun.${gun}`, GUN_FRAMES.mag, x, y, angle - Math.PI / 2 - 0.4 + (rand() - 0.5) * 0.5, 10 + rand() * 8, born, rand, { hop: 5, turn0: angle, turn: angle + (rand() - 0.5) * 2 });
}

/** The marks a new effect leaves, by ring: `floor` keeps them for the match, `casings` for a little while. */
export function marksOf(fx: Effect, walls: readonly (Rect & { material?: string })[], rand: Rand): { floor: Mark[]; casings: Mark[] } {
  switch (fx.kind) {
    case 'boom': return { floor: boomMarks(fx.x, fx.y, fx.r, walls, fx.born, rand), casings: [] };
    case 'broke': return { floor: brokeMarks(fx.piece, fx, fx.born, rand), casings: [] };
    case 'death':
    case 'splat': return { floor: [mark(SPLAT[fx.kind], Math.floor(rand() * 4), fx.x, fx.y, fx.born, { turn: rand() * Math.PI * 2, alpha: 0.85 })], casings: [] };
    case 'impact': return { floor: impactMarks(fx, rand), casings: [] };
    case 'magdrop': return { floor: [], casings: [magMark(fx.gun, fx.x, fx.y, fx.angle, fx.born, rand)] };
    case 'flash': return { floor: [], casings: [casingMark(fx.gun, fx.x - Math.cos(fx.angle) * 22, fx.y - Math.sin(fx.angle) * 22, fx.angle, fx.born, rand)] };
    default: return { floor: [], casings: [] };
  }
}
