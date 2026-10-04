import { WORLD } from '../defs.ts';
import type { Dash, InputState } from '../protocol.ts';

export type Rect = { x: number; y: number; w: number; h: number };

const DASH_MS = 200;
const DASH_DISTANCE = 240;
export const MAX_SUBSTEP = WORLD.playerRadius / 2;

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

export function resolveCircle(solids: readonly Rect[], nx: number, ny: number): { x: number; y: number } {
  const r = WORLD.playerRadius;
  let x = clamp(nx, r, WORLD.size - r), y = clamp(ny, r, WORLD.size - r);
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
  return { x: clamp(x, r, WORLD.size - r), y: clamp(y, r, WORLD.size - r) };
}

type MoveKeys = Pick<InputState, 'up' | 'down' | 'left' | 'right'>;
export type Motion = { x: number; y: number; dash: Dash | null };

const keyAxes = (keys: MoveKeys) => ({ mx: (keys.right ? 1 : 0) - (keys.left ? 1 : 0), my: (keys.down ? 1 : 0) - (keys.up ? 1 : 0) });

export function startDash(input: MoveKeys & Pick<InputState, 'angle'>): Dash {
  const { mx, my } = keyAxes(input);
  const len = Math.hypot(mx, my);
  return len > 0
    ? { dirX: mx / len, dirY: my / len, leftMs: DASH_MS }
    : { dirX: Math.cos(input.angle), dirY: Math.sin(input.angle), leftMs: DASH_MS };
}

function slide(solids: readonly Rect[], x: number, y: number, dx: number, dy: number): { x: number; y: number } {
  const steps = Math.max(1, Math.ceil(Math.hypot(dx, dy) / MAX_SUBSTEP));
  let at = { x, y };
  for (let i = 0; i < steps; i++) at = resolveCircle(solids, at.x + dx / steps, at.y + dy / steps);
  return at;
}

export function moveStep(solids: readonly Rect[], from: Motion, keys: MoveKeys, speed: number, dtMs: number): Motion {
  const { dash } = from;
  if (dash) {
    const d = (DASH_DISTANCE * Math.min(dtMs, dash.leftMs)) / DASH_MS;
    const leftMs = dash.leftMs - dtMs;
    return { ...slide(solids, from.x, from.y, dash.dirX * d, dash.dirY * d), dash: leftMs > 0 ? { ...dash, leftMs } : null };
  }
  const { mx, my } = keyAxes(keys);
  if (mx === 0 && my === 0) return from;
  const d = (speed * dtMs) / 1000 / Math.hypot(mx, my);
  return { ...slide(solids, from.x, from.y, mx * d, my * d), dash: null };
}
