/**
 * Shared pieces for the themes' door, roof and polygon art (the hooks on `Theme`, docs/maps/GEOMETRY.md): paint leaves with a per-theme
 * look and decoration, convex shapes clipped to a rounded footprint, and the lighting a lit room leaks through an open door.
 */
import { doorSpan, type DoorLeaf } from '../../shared/sim/doors.ts';
import { unflat, type MapDoor, type MapPoly, type Pt } from '../../shared/geom.ts';
import { DOOR_HEIGHT, drawExtruded, type GeoInfo, type PolyLook } from '../geoart.ts';
import { setLight } from '../lighting.ts';
import { INK } from '../palette.ts';

export type G = CanvasRenderingContext2D;

/** A leaf as a long thin box: its centre, the angle of its long axis, its length and thickness. */
type LeafFrame = { cx: number; cy: number; ang: number; len: number; t: number; pts: Pt[] };

function leafFrame(l: DoorLeaf): LeafFrame {
  const pts: Pt[] = l.pts ? unflat(l.pts) : [{ x: l.x, y: l.y }, { x: l.x + l.w, y: l.y }, { x: l.x + l.w, y: l.y + l.h }, { x: l.x, y: l.y + l.h }];
  const e0 = Math.hypot(pts[1]!.x - pts[0]!.x, pts[1]!.y - pts[0]!.y), e1 = Math.hypot(pts[2]!.x - pts[1]!.x, pts[2]!.y - pts[1]!.y);
  const [a, b, long, short] = e0 >= e1 ? [pts[0]!, pts[1]!, e0, e1] : [pts[1]!, pts[2]!, e1, e0];
  const cx = pts.reduce((s, p) => s + p.x, 0) / pts.length, cy = pts.reduce((s, p) => s + p.y, 0) / pts.length;
  return { cx, cy, ang: Math.atan2(b.y - a.y, b.x - a.x), len: long, t: short, pts };
}

export type DoorStyle = {
  leaf: PolyLook;
  frame: PolyLook;
  /** Height of the leaf's front face (default DOOR_HEIGHT; glass is shorter). */
  height?: number;
  /** Painted on a leaf's top face in its own frame: x along the long axis from -len/2 to len/2, y across from -t/2 to t/2. `f` is how open the door is. */
  deco?: (g: G, len: number, t: number, f: number, leafIndex: number, leafCount: number) => void;
  /** Painted last, in world space (hinges, signs). */
  over?: (g: G, d: MapDoor, f: number) => void;
  /** Leaves are see-through glass: drawn at this alpha. */
  alpha?: number;
};

/** Light and a warm wash spilling out of an open door that has a `glow`. */
function doorGlow(g: G, d: MapDoor, f: number, info: GeoInfo): void {
  if (!d.glow || f <= 0.05) return;
  const s = doorSpan(d);
  const cx = (s.ax + s.bx) / 2, cy = (s.ay + s.by) / 2;
  setLight(`door:${info.map.name}:${d.id}`, { x: cx, y: cy, radius: 190, color: d.glow, intensity: 0.55 * f, size: 14, inside: 60 });
  g.save();
  g.globalCompositeOperation = 'lighter';
  const gr = g.createRadialGradient(cx, cy, 6, cx, cy, 130);
  gr.addColorStop(0, d.glow); gr.addColorStop(1, 'rgba(0,0,0,0)');
  g.globalAlpha = 0.16 * f * (1 - 0.6 * info.dark);
  g.fillStyle = gr;
  g.fillRect(cx - 130, cy - 130, 260, 260);
  g.restore();
}

/** Paints a whole door in a theme's style: glow, sliding track, frame posts, leaves with decoration. */
export function paintDoor(g: G, d: MapDoor, leaves: readonly DoorLeaf[], f: number, info: GeoInfo, st: DoorStyle): true {
  doorGlow(g, d, f, info);
  const sp = doorSpan(d);
  const t = d.thick ?? 12;
  if (d.kind === 'slide' || d.kind === 'double-slide') {
    g.strokeStyle = 'rgba(10,12,18,0.5)';
    g.lineWidth = 3;
    g.beginPath(); g.moveTo(sp.ax, sp.ay); g.lineTo(sp.bx, sp.by); g.stroke();
  }
  const h = st.height ?? DOOR_HEIGHT;
  leaves.forEach((leaf, i) => {
    const fr = leafFrame(leaf);
    g.save();
    if (st.alpha !== undefined) g.globalAlpha *= st.alpha;
    drawExtruded(g, fr.pts, h, st.leaf);
    g.restore();
    if (st.deco) {
      g.save();
      g.translate(fr.cx, fr.cy);
      g.rotate(fr.ang);
      st.deco(g, fr.len, fr.t, f, i, leaves.length);
      g.restore();
    }
  });
  for (const [px, py] of [[sp.ax, sp.ay], [sp.bx, sp.by]] as const) {
    drawExtruded(g, [{ x: px - t / 2 - 3, y: py - t / 2 - 3 }, { x: px + t / 2 + 3, y: py - t / 2 - 3 }, { x: px + t / 2 + 3, y: py + t / 2 + 3 }, { x: px - t / 2 - 3, y: py + t / 2 + 3 }], DOOR_HEIGHT + 3, st.frame);
  }
  st.over?.(g, d, f);
  return true;
}

export const hingePins = (color = INK) => (g: G, d: MapDoor): void => {
  if (d.kind !== 'swing' && d.kind !== 'double-swing') return;
  const sp = doorSpan(d);
  const hinges = d.kind === 'double-swing' ? [[sp.ax, sp.ay], [sp.bx, sp.by]] : (d.hinge ?? 'start') === 'start' ? [[sp.ax, sp.ay]] : [[sp.bx, sp.by]];
  g.fillStyle = color;
  for (const [hx, hy] of hinges as [number, number][]) { g.beginPath(); g.arc(hx, hy, 4, 0, Math.PI * 2); g.fill(); }
};

/** Clips to the area a convex footprint sweeps as it is extruded `face` px down the screen: the top face and the front face under it. */
export function clipExtruded(g: G, pts: readonly Pt[], face: number): void {
  const all = [...pts, ...pts.map((p) => ({ x: p.x, y: p.y + face }))].sort((a, b) => a.x - b.x || a.y - b.y);
  const cross = (o: Pt, a: Pt, b: Pt) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
  const lower: Pt[] = [], upper: Pt[] = [];
  for (const p of all) { while (lower.length >= 2 && cross(lower.at(-2)!, lower.at(-1)!, p) <= 0) lower.pop(); lower.push(p); }
  for (const p of [...all].reverse()) { while (upper.length >= 2 && cross(upper.at(-2)!, upper.at(-1)!, p) <= 0) upper.pop(); upper.push(p); }
  const hull = [...lower.slice(0, -1), ...upper.slice(0, -1)];
  g.beginPath();
  hull.forEach((p, i) => (i ? g.lineTo(p.x, p.y) : g.moveTo(p.x, p.y)));
  g.closePath();
  g.clip();
}

export const boundsOf = (pts: readonly Pt[]) => {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const p of pts) { x0 = Math.min(x0, p.x); y0 = Math.min(y0, p.y); x1 = Math.max(x1, p.x); y1 = Math.max(y1, p.y); }
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
};

/** The box of a polygon that is an axis-aligned rectangle, else null. */
export function rectOf(p: MapPoly): { x: number; y: number; w: number; h: number } | null {
  if (p.points.length !== 4) return null;
  const b = boundsOf(p.points);
  return p.points.every((q) => (q.x === b.x || q.x === b.x + b.w) && (q.y === b.y || q.y === b.y + b.h)) ? b : null;
}

/** Strokes a closed path through `pts`. */
export function outline(g: G, pts: readonly Pt[], w = 2, color = INK): void {
  g.beginPath();
  pts.forEach((p, i) => (i ? g.lineTo(p.x, p.y) : g.moveTo(p.x, p.y)));
  g.closePath();
  g.strokeStyle = color;
  g.lineWidth = w;
  g.lineJoin = 'round';
  g.stroke();
}

/** A deterministic 0..1 from a few numbers, so decoration does not shimmer. */
export const noise = (a: number, b = 0, c = 0): number => {
  let h = Math.imul(Math.round(a) | 0, 73856093) ^ Math.imul(Math.round(b) | 0, 19349663) ^ Math.imul(Math.round(c) | 0, 83492791);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
};
