/**
 * Doors: server-driven walls. A door's whole state is `open` (0 shut .. 255 wide) and `sign` (which side a swing leaf opens toward), so the
 * leaves are a pure function of (door, open, sign) that the server, the client's prediction and the bots all compute the same way.
 * Leaves live in `World.walls` (tagged `door`) so every collision, bullet and sight test sees them; they never go on the `walls` wire.
 */
import { WORLD } from '../defs.ts';
import { partRect, signedArea, type MapDoor, type Pt } from '../geom.ts';
import { MAPS, type MapId } from '../maps.ts';
import { circleHitsRect, clamp, walks, type Rect } from './movement.ts';
import type { Wall, World } from './world.ts';

export const DOOR_THICK = 12;
/** How far a swing leaf opens, in radians (about 95 degrees). */
export const SWING_MAX = 1.65;
/** A slider opens when someone is this close to the span. */
export const DOOR_NEAR_PX = 90;
export const DOOR_USE_PX = 80;
const SLIDE_OPEN_MS = 380, SLIDE_CLOSE_MS = 520, SWING_OPEN_MS = 650, SWING_CLOSE_MS = 900;
const SLIDE_HOLD_MS = 1400, SWING_HOLD_MS = 2500;
const USE_COOLDOWN_MS = 500;

export type DoorState = {
  id: string;
  /** Index in `MapDef.doors`; the wire names a door by it. */
  idx: number;
  /** 0 (shut) .. 255 (wide open). */
  open: number;
  sign: 1 | -1;
  target: 0 | 255;
  /** When a door held open starts to close; Infinity for a manual door left open. */
  closeAt: number;
  lastUse: number;
};

/** `[index, open 0..255, sign]`, one per door that is not shut. */
export type DoorView = [number, number, 1 | -1];

export type DoorLeaf = Rect & { door: string };

/** A map's doors (none for most maps). */
export const mapDoors = (map: MapId): readonly MapDoor[] => MAPS[map].doors ?? [];

const isSlide = (d: MapDoor) => d.kind === 'slide' || d.kind === 'double-slide';
export const isSwing = (d: MapDoor) => !isSlide(d);
export const isDouble = (d: MapDoor) => d.kind === 'double-slide' || d.kind === 'double-swing';
export const doorAuto = (d: MapDoor) => d.auto !== false;
export const doorThick = (d: MapDoor) => d.thick ?? DOOR_THICK;
export const doorHoldMs = (d: MapDoor) => d.closeMs ?? (isSwing(d) ? SWING_HOLD_MS : SLIDE_HOLD_MS);
/** The span's end points on its centre line. */
export const doorSpan = (d: MapDoor) => ({ ax: d.x, ay: d.y, bx: d.axis === 'h' ? d.x + d.w : d.x, by: d.axis === 'v' ? d.y + d.w : d.y });
const flagFor = (d: MapDoor): { ns?: true } => (d.material === 'glass' ? { ns: true } : {});

/** A thin leaf from `hinge` along the unit direction (dx, dy) for `len` px, `t` thick; a plain box while shut, else a convex part. */
function bar(d: MapDoor, hx: number, hy: number, dx: number, dy: number, len: number, t: number, shut: boolean): DoorLeaf {
  const nx = -dy * (t / 2), ny = dx * (t / 2);
  const ex = hx + dx * len, ey = hy + dy * len;
  const pts: Pt[] = [{ x: hx + nx, y: hy + ny }, { x: ex + nx, y: ey + ny }, { x: ex - nx, y: ey - ny }, { x: hx - nx, y: hy - ny }];
  const b = partRect(signedArea(pts) < 0 ? [...pts].reverse() : pts);
  return shut ? { x: b.x, y: b.y, w: b.w, h: b.h, door: d.id, ...flagFor(d) } : { ...b, door: d.id, ...flagFor(d) };
}

/** The solid leaves of door `d` at openness `open` (0..255) swung toward `sign`. */
export function doorLeaves(d: MapDoor, open: number, sign: 1 | -1): DoorLeaf[] {
  // The server never goes past 255; a client may ask for a touch more to overshoot a swing for show.
  const f = clamp(open, 0, 275) / 255;
  const t = doorThick(d);
  const h = d.axis === 'h';
  const ux = h ? 1 : 0, uy = h ? 0 : 1;
  const flag = flagFor(d);
  const out: DoorLeaf[] = [];
  const slab = (from: number, to: number) => {
    if (to - from < 1) return;
    out.push(h ? { x: d.x + from, y: d.y - t / 2, w: to - from, h: t, door: d.id, ...flag } : { x: d.x - t / 2, y: d.y + from, w: t, h: to - from, door: d.id, ...flag });
  };
  if (!isSwing(d)) {
    if (isDouble(d)) { const half = (d.w / 2) * (1 - f); slab(0, half); slab(d.w - half, d.w); }
    else if ((d.hinge ?? 'start') === 'start') slab(0, d.w * (1 - f));
    else slab(d.w * f, d.w);
    return out;
  }
  const a = f * SWING_MAX;
  // Direction of a leaf hinged at the start (along +u) or at the end (along -u), turned toward `sign` normal.
  const nxs = h ? 0 : sign, nys = h ? sign : 0;
  const leaf = (hx: number, hy: number, dir: 1 | -1, len: number) => {
    const bx = ux * dir, by = uy * dir;
    const dx = bx * Math.cos(a) + nxs * Math.sin(a), dy = by * Math.cos(a) + nys * Math.sin(a);
    out.push(bar(d, hx, hy, dx, dy, len, t, f === 0));
  };
  const end = { x: d.x + (h ? d.w : 0), y: d.y + (h ? 0 : d.w) };
  if (isDouble(d)) { leaf(d.x, d.y, 1, d.w / 2); leaf(end.x, end.y, -1, d.w / 2); }
  else if ((d.hinge ?? 'start') === 'start') leaf(d.x, d.y, 1, d.w);
  else leaf(end.x, end.y, -1, d.w);
  return out;
}

const leavesOf = (w: World, s: DoorState): DoorLeaf[] => doorLeaves(MAPS[w.map].doors![s.idx]!, s.open, s.sign);

const asWall = (l: DoorLeaf, d: MapDoor): Wall => ({ ...l, built: false, material: d.material as never, expiresAt: Infinity });

export function loadDoors(w: World): void {
  const doors = MAPS[w.map].doors ?? [];
  w.doors = doors.map((d, idx) => ({ id: d.id, idx, open: 0, sign: d.side ?? 1, target: 0, closeAt: Infinity, lastUse: -Infinity }));
  w.doorsVersion++;
  for (const s of w.doors) for (const l of leavesOf(w, s)) w.walls.push(asWall(l, doors[s.idx]!));
}

function reshape(w: World, s: DoorState) {
  const d = MAPS[w.map].doors![s.idx]!;
  w.walls = w.walls.filter((x) => x.door !== s.id);
  for (const l of leavesOf(w, s)) w.walls.push(asWall(l, d));
  w.doorsVersion++;
}

type Body = { x: number; y: number };

/** Distance from a point to the door's span segment. */
function spanDist(d: MapDoor, p: Body): number {
  const { ax, ay, bx, by } = doorSpan(d);
  const ex = bx - ax, ey = by - ay;
  const t = clamp(((p.x - ax) * ex + (p.y - ay) * ey) / (ex * ex + ey * ey), 0, 1);
  return Math.hypot(p.x - (ax + ex * t), p.y - (ay + ey * t));
}

/** Which side of a door's centre line `p` stands on: -1 toward -normal, 1 toward +normal. */
const sideOf = (d: MapDoor, p: Body): 1 | -1 => ((d.axis === 'h' ? p.y - d.y : p.x - d.x) < 0 ? -1 : 1);

/** Someone walking or dashing into a shut swing leaf pushes it away from themselves. */
function pushing(w: World, d: MapDoor): { sign: 1 | -1 } | null {
  const shut = doorLeaves(d, 0, 1);
  for (const p of w.players.values()) {
    if (p.life.k !== 'alive' || (!walks(p.input) && p.life.dash === null)) continue;
    if (!shut.some((c) => circleHitsRect(p.x, p.y, WORLD.playerRadius + 5, c))) continue;
    const side = sideOf(d, p);
    // Walking toward the leaf, not along it or away from it.
    const mx = (p.input.right ? 1 : 0) - (p.input.left ? 1 : 0), my = (p.input.down ? 1 : 0) - (p.input.up ? 1 : 0);
    const toward = (d.axis === 'h' ? my : mx) * -side + (p.life.dash ? (d.axis === 'h' ? p.life.dash.dirY : p.life.dash.dirX) * -side : 0);
    if (toward > 0) return { sign: -side as 1 | -1 };
  }
  return null;
}

/** Advances every door one tick. */
export function tickDoors(w: World, dtMs: number): void {
  const defs = MAPS[w.map].doors;
  if (!defs?.length) return;
  for (const s of w.doors) {
    const d = defs[s.idx]!;
    if (d.locked) continue;
    const swing = isSwing(d);
    if (swing) {
      const push = pushing(w, d);
      if (push) {
        if (s.open === 0) s.sign = d.side ?? push.sign;
        s.target = 255;
        s.closeAt = w.now + doorHoldMs(d);
      } else if (s.target === 255 && w.now >= s.closeAt) s.target = 0;
    } else if (doorAuto(d)) {
      let near = false;
      for (const p of w.players.values()) if (p.life.k === 'alive' && spanDist(d, p) <= DOOR_NEAR_PX) { near = true; break; }
      if (near) { s.target = 255; s.closeAt = w.now + doorHoldMs(d); }
      else if (s.target === 255 && w.now >= s.closeAt) s.target = 0;
    } else {
      for (const p of w.players.values()) {
        if (p.life.k !== 'alive' || !p.input.use || w.now - s.lastUse < USE_COOLDOWN_MS || spanDist(d, p) > DOOR_USE_PX) continue;
        s.lastUse = w.now;
        s.target = s.target === 255 ? 0 : 255;
        s.closeAt = Infinity;
        break;
      }
    }
    if (s.open === s.target) continue;
    const opening = s.target > s.open;
    const ms = swing ? (opening ? SWING_OPEN_MS : SWING_CLOSE_MS) : (opening ? SLIDE_OPEN_MS : SLIDE_CLOSE_MS);
    const step = Math.max(1, Math.round((255 * dtMs) / ms));
    const next = opening ? Math.min(s.target, s.open + step) : Math.max(s.target, s.open - step);
    // A leaf never crushes: if its next shape would touch a body that the current one does not, it waits.
    const cand = doorLeaves(d, next, s.sign), cur = doorLeaves(d, s.open, s.sign);
    const touches = (p: Body, leaves: readonly Rect[]) => leaves.some((l) => circleHitsRect(p.x, p.y, WORLD.playerRadius, l));
    let crush = false;
    for (const p of w.players.values()) if (p.life.k !== 'dead' && touches(p, cand) && !touches(p, cur)) { crush = true; break; }
    if (crush) continue;
    s.open = next;
    reshape(w, s);
  }
}

/** A blast at (x, y) throws swing doors within its radius open, away from it. */
export function blastDoors(w: World, x: number, y: number, radius: number): void {
  const defs = MAPS[w.map].doors;
  if (!defs?.length) return;
  for (const s of w.doors) {
    const d = defs[s.idx]!;
    if (d.locked || !isSwing(d) || spanDist(d, { x, y }) > radius) continue;
    s.sign = d.side ?? (-sideOf(d, { x, y }) as 1 | -1);
    s.target = 255;
    s.open = Math.max(s.open, 230);
    s.closeAt = w.now + doorHoldMs(d) + 1500;
    reshape(w, s);
  }
}

export const doorViews = (w: World): DoorView[] => w.doors.filter((s) => s.open > 0).map((s) => [s.idx, s.open, s.sign]);

/** The leaves a client holds for the doors the server said are not shut. */
export function leavesFromViews(defs: readonly MapDoor[] | undefined, views: readonly DoorView[] | undefined): DoorLeaf[] {
  if (!defs?.length) return [];
  const open = new Map((views ?? []).map((v) => [v[0], v] as const));
  return defs.flatMap((d, i) => doorLeaves(d, open.get(i)?.[1] ?? 0, open.get(i)?.[2] ?? d.side ?? 1));
}

