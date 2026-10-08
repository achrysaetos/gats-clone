import { FEEL, WORLD } from '../defs.ts';
import type { Dash, InputState, Shove } from '../protocol.ts';

export type Rect = { x: number; y: number; w: number; h: number };

const DASH_MS = 200;
const DASH_DISTANCE = 240;
export const MAX_SUBSTEP = WORLD.playerRadius / 2;

export const walks = (i: { up: boolean; down: boolean; left: boolean; right: boolean }): boolean => i.right !== i.left || i.down !== i.up;

export const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
export const dist2 = (ax: number, ay: number, bx: number, by: number) => (ax - bx) ** 2 + (ay - by) ** 2;

export function rectsOverlap(a: Rect, b: Rect, pad = 0) {
  return a.x - pad < b.x + b.w && a.x + a.w + pad > b.x && a.y - pad < b.y + b.h && a.y + a.h + pad > b.y;
}

export function circleHitsRect(x: number, y: number, r: number, b: Rect) {
  const cx = clamp(x, b.x, b.x + b.w), cy = clamp(y, b.y, b.y + b.h);
  return dist2(x, y, cx, cy) < r * r;
}

export function angleDiff(a: number, b: number) {
  return Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b)));
}

export function segmentEntersCircleAt(px: number, py: number, dx: number, dy: number, cx: number, cy: number, r: number): number | null {
  const fx = px - cx, fy = py - cy;
  const a = dx * dx + dy * dy;
  const b = 2 * (fx * dx + fy * dy);
  const c = fx * fx + fy * fy - r * r;
  if (c <= 0) return 0;
  const disc = b * b - 4 * a * c;
  if (disc < 0 || a === 0) return null;
  const t = (-b - Math.sqrt(disc)) / (2 * a);
  return t >= 0 && t <= 1 ? t : null;
}

export function segmentEntersRectAt(px: number, py: number, dx: number, dy: number, r: Rect): number | null {
  let t0 = 0, t1 = 1;
  for (const [p, d, lo, hi] of [[px, dx, r.x, r.x + r.w], [py, dy, r.y, r.y + r.h]] as const) {
    if (d === 0) { if (p < lo || p > hi) return null; continue; }
    let a = (lo - p) / d, b = (hi - p) / d;
    if (a > b) [a, b] = [b, a];
    t0 = Math.max(t0, a);
    t1 = Math.min(t1, b);
    if (t0 > t1) return null;
  }
  return t0;
}

function resolveCircle(solids: readonly Rect[], nx: number, ny: number, r: number, size: number): { x: number; y: number } {
  let x = clamp(nx, r, size - r), y = clamp(ny, r, size - r);
  for (const b of solids) {
    const cx = clamp(x, b.x, b.x + b.w), cy = clamp(y, b.y, b.y + b.h);
    const d2 = dist2(x, y, cx, cy);
    if (d2 >= r * r) continue;
    if (d2 > 0) {
      const d = Math.sqrt(d2);
      x = cx + ((x - cx) / d) * r;
      y = cy + ((y - cy) / d) * r;
    } else {
      const exits = [
        { x: b.x - r, y, depth: x - b.x },
        { x: b.x + b.w + r, y, depth: b.x + b.w - x },
        { x, y: b.y - r, depth: y - b.y },
        { x, y: b.y + b.h + r, depth: b.y + b.h - y },
      ];
      const shallowest = exits.reduce((m, o) => (o.depth < m.depth ? o : m));
      x = shallowest.x;
      y = shallowest.y;
    }
  }
  return { x: clamp(x, r, size - r), y: clamp(y, r, size - r) };
}

type MoveKeys = Pick<InputState, 'up' | 'down' | 'left' | 'right'>;
/** `staggerMs` is how long walking stays slowed by a stagger from the start of the next step. */
export type Motion = { x: number; y: number; dash: Dash | null; shove: Shove | null; staggerMs: number };

const keyAxes = (keys: MoveKeys) => ({ mx: (keys.right ? 1 : 0) - (keys.left ? 1 : 0), my: (keys.down ? 1 : 0) - (keys.up ? 1 : 0) });

export function startDash(input: MoveKeys & Pick<InputState, 'angle'>): Dash {
  const { mx, my } = keyAxes(input);
  const len = Math.hypot(mx, my);
  return len > 0
    ? { dirX: mx / len, dirY: my / len, leftMs: DASH_MS }
    : { dirX: Math.cos(input.angle), dirY: Math.sin(input.angle), leftMs: DASH_MS };
}

export function slide(solids: readonly Rect[], x: number, y: number, dx: number, dy: number, r: number, size: number): { x: number; y: number } {
  const steps = Math.max(1, Math.ceil(Math.hypot(dx, dy) / MAX_SUBSTEP));
  let at = { x, y };
  for (let i = 0; i < steps; i++) at = resolveCircle(solids, at.x + dx / steps, at.y + dy / steps, r, size);
  return at;
}

export const KNIFE_LUNGE = 90;
export const KNIFE_REACH = 70;
const KNIFE_ARC = Math.PI / 3;

type Point = { x: number; y: number };

const insideWorld = (x: number, y: number, size: number) =>
  x >= WORLD.playerRadius && x <= size - WORLD.playerRadius && y >= WORLD.playerRadius && y <= size - WORLD.playerRadius;

function knifeTarget<T extends Point>(at: Point, angle: number, enemies: readonly T[], solids: readonly Rect[]): T | null {
  let best: T | null = null, bestD = Infinity;
  for (const v of enemies) {
    const d = Math.sqrt(dist2(at.x, at.y, v.x, v.y));
    if (d > KNIFE_REACH + WORLD.playerRadius || d >= bestD) continue;
    if (d > WORLD.playerRadius && angleDiff(Math.atan2(v.y - at.y, v.x - at.x), angle) > KNIFE_ARC) continue;
    if (solids.some((b) => segmentEntersRectAt(at.x, at.y, v.x - at.x, v.y - at.y, b) !== null)) continue;
    best = v;
    bestD = d;
  }
  return best;
}

export function knifeLunge<T extends Point>(solids: readonly Rect[], from: Point, angle: number, enemies: readonly T[], size: number): Point & { victim: T | null } {
  const steps = Math.ceil(KNIFE_LUNGE / MAX_SUBSTEP);
  const sx = (Math.cos(angle) * KNIFE_LUNGE) / steps, sy = (Math.sin(angle) * KNIFE_LUNGE) / steps;
  let { x, y } = from;
  let victim = knifeTarget(from, angle, enemies, solids);
  for (let i = 0; i < steps && !victim; i++) {
    const nx = x + sx, ny = y + sy;
    if (!insideWorld(nx, ny, size) || solids.some((b) => circleHitsRect(nx, ny, WORLD.playerRadius, b))) break;
    x = nx;
    y = ny;
    victim = knifeTarget({ x, y }, angle, enemies, solids);
  }
  return { x, y, victim };
}

export function moveStep(solids: readonly Rect[], from: Motion, keys: MoveKeys, speed: number, dtMs: number, size: number): Motion {
  const slowed = Math.min(dtMs, from.staggerMs);
  const pace = speed * (1 - ((1 - FEEL.stagger.speedMul) * slowed) / dtMs);
  const walked = { ...stride(solids, from, keys, pace, dtMs, size), staggerMs: from.staggerMs - slowed };
  const { shove } = from;
  if (!shove) return walked;
  const s = Math.min(dtMs, shove.leftMs) / 1000;
  const leftMs = shove.leftMs - dtMs;
  return { ...walked, ...slide(solids, walked.x, walked.y, shove.vx * s, shove.vy * s, WORLD.playerRadius, size), shove: leftMs > 0 ? { ...shove, leftMs } : null };
}

function stride(solids: readonly Rect[], from: Motion, keys: MoveKeys, speed: number, dtMs: number, size: number): Motion {
  const { dash } = from;
  if (dash) {
    const d = (DASH_DISTANCE * Math.min(dtMs, dash.leftMs)) / DASH_MS;
    const leftMs = dash.leftMs - dtMs;
    return { ...from, ...slide(solids, from.x, from.y, dash.dirX * d, dash.dirY * d, WORLD.playerRadius, size), dash: leftMs > 0 ? { ...dash, leftMs } : null };
  }
  const { mx, my } = keyAxes(keys);
  if (mx === 0 && my === 0) return from;
  const d = (speed * dtMs) / 1000 / Math.hypot(mx, my);
  return { ...from, ...slide(solids, from.x, from.y, mx * d, my * d, WORLD.playerRadius, size), dash: null };
}

/** The shove that `px` more of push along (`dirX`, `dirY`) leaves, folded into what is left of `prev` and capped, so stacked hits add up to one bounded push. */
export function addShove(prev: Shove | null, dirX: number, dirY: number, px: number, maxPx: number, ms: number): Shove {
  const left = prev ? prev.leftMs / 1000 : 0;
  let x = (prev?.vx ?? 0) * left + dirX * px, y = (prev?.vy ?? 0) * left + dirY * px;
  const len = Math.hypot(x, y);
  if (len > maxPx) { x *= maxPx / len; y *= maxPx / len; }
  return { vx: (x * 1000) / ms, vy: (y * 1000) / ms, leftMs: ms };
}
