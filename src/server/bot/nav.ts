import { circleHitsRect, segmentEntersRectAt, type Rect } from '../../shared/sim/movement.ts';

export type Point = { x: number; y: number };

export const dist = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);
export const between = (r: readonly [number, number], rand: () => number) => r[0] + rand() * (r[1] - r[0]);

export type NavGrid = {
  size: number; cell: number; n: number; open: Uint8Array;
  scratch: { g: Float64Array; from: Int32Array; seen: Uint32Array; stamp: number; heapC: number[]; heapF: number[] };
};

const NAV_CELL = 25;
const ORTH = 1, DIAG = Math.SQRT2;
const NEIGHBORS = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]] as const;
const SNAP_CELLS = 4;

export function navGrid(size: number, solids: readonly Rect[], radius: number, cell = NAV_CELL): NavGrid {
  const n = Math.ceil(size / cell);
  const open = new Uint8Array(n * n);
  const centre = (c: number) => (c + 0.5) * cell;
  for (let cy = 0; cy < n; cy++) {
    for (let cx = 0; cx < n; cx++) {
      const x = centre(cx), y = centre(cy);
      if (x >= radius && y >= radius && x <= size - radius && y <= size - radius) open[cy * n + cx] = 1;
    }
  }
  for (const r of solids) stamp(open, n, cell, radius, r);
  return { size, cell, n, open, scratch: { g: new Float64Array(n * n), from: new Int32Array(n * n), seen: new Uint32Array(n * n), stamp: 0, heapC: [], heapF: [] } };
}

function stamp(open: Uint8Array, n: number, cell: number, radius: number, r: Rect) {
  const centre = (c: number) => (c + 0.5) * cell;
  const x0 = Math.max(0, Math.floor((r.x - radius) / cell)), x1 = Math.min(n - 1, Math.floor((r.x + r.w + radius) / cell));
  const y0 = Math.max(0, Math.floor((r.y - radius) / cell)), y1 = Math.min(n - 1, Math.floor((r.y + r.h + radius) / cell));
  for (let cy = y0; cy <= y1; cy++) for (let cx = x0; cx <= x1; cx++) if (circleHitsRect(centre(cx), centre(cy), radius, r)) open[cy * n + cx] = 0;
}

export function withSolids(base: NavGrid, solids: readonly Rect[], radius: number): NavGrid {
  const open = base.open.slice();
  for (const r of solids) stamp(open, base.n, base.cell, radius, r);
  return { ...base, open };
}

const cellOf = (nav: NavGrid, p: Point) => {
  const cx = Math.min(nav.n - 1, Math.max(0, Math.floor(p.x / nav.cell))), cy = Math.min(nav.n - 1, Math.max(0, Math.floor(p.y / nav.cell)));
  return cy * nav.n + cx;
};
const centreOf = (nav: NavGrid, c: number): Point => ({ x: ((c % nav.n) + 0.5) * nav.cell, y: (Math.floor(c / nav.n) + 0.5) * nav.cell });

/** The centre of the open cell nearest `p` within `px`, or null if everything that close is solid. */
export function nearestOpenPoint(nav: NavGrid, p: Point, px: number): Point | null {
  const c = nearestOpen(nav, p, Math.ceil(px / nav.cell));
  return c === null ? null : centreOf(nav, c);
}

export const isOpen = (nav: NavGrid, p: Point) => nav.open[cellOf(nav, p)] === 1;

function nearestOpen(nav: NavGrid, p: Point, reach = SNAP_CELLS): number | null {
  const c = cellOf(nav, p);
  if (nav.open[c]) return c;
  const cx = c % nav.n, cy = Math.floor(c / nav.n);
  let best: number | null = null, bestD = Infinity;
  for (let dy = -reach; dy <= reach; dy++) {
    for (let dx = -reach; dx <= reach; dx++) {
      const x = cx + dx, y = cy + dy;
      if (x < 0 || y < 0 || x >= nav.n || y >= nav.n || !nav.open[y * nav.n + x]) continue;
      const d = dx * dx + dy * dy;
      if (d < bestD) { bestD = d; best = y * nav.n + x; }
    }
  }
  return best;
}

export function walkable(nav: NavGrid, a: Point, b: Point): boolean {
  const steps = Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / (nav.cell / 2));
  for (let i = 0; i <= steps; i++) {
    const t = steps === 0 ? 0 : i / steps;
    if (!nav.open[cellOf(nav, { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t })]) return false;
  }
  return true;
}

export function findPath(nav: NavGrid, from: Point, to: Point, maxExpansions = Infinity): Point[] | null {
  const start = nearestOpen(nav, from), goal = nearestOpen(nav, to);
  if (start === null || goal === null) return null;
  const end = nav.open[cellOf(nav, to)] ? to : centreOf(nav, goal);
  if (walkable(nav, from, end)) return [end];
  const { n, open } = nav;
  const s = nav.scratch;
  s.stamp++;
  const gx = goal % n, gy = Math.floor(goal / n);
  const h = (c: number) => {
    const dx = Math.abs((c % n) - gx), dy = Math.abs(Math.floor(c / n) - gy);
    return Math.max(dx, dy) + (DIAG - 1) * Math.min(dx, dy);
  };
  const hc = s.heapC, hf = s.heapF;
  hc.length = 0;
  hf.length = 0;
  const push = (c: number, f: number) => {
    let i = hc.length;
    hc.push(c);
    hf.push(f);
    while (i > 0) {
      const up = (i - 1) >> 1;
      if (hf[up]! <= f) break;
      hc[i] = hc[up]!;
      hf[i] = hf[up]!;
      i = up;
    }
    hc[i] = c;
    hf[i] = f;
  };
  const pop = (): number => {
    const top = hc[0]!;
    const c = hc.pop()!, f = hf.pop()!;
    const len = hc.length;
    if (len > 0) {
      let i = 0;
      for (;;) {
        const l = 2 * i + 1, r = l + 1;
        let m = -1, mf = f;
        if (l < len && hf[l]! < mf) { m = l; mf = hf[l]!; }
        if (r < len && hf[r]! < mf) { m = r; mf = hf[r]!; }
        if (m < 0) break;
        hc[i] = hc[m]!;
        hf[i] = hf[m]!;
        i = m;
      }
      hc[i] = c;
      hf[i] = f;
    }
    return top;
  };
  const known = (c: number) => s.seen[c] === s.stamp;
  s.seen[start] = s.stamp;
  s.g[start] = 0;
  s.from[start] = -1;
  push(start, h(start));
  let found = false, expanded = 0, best = start, bestH = h(start);
  while (hc.length > 0) {
    const f = hf[0]!;
    const c = pop();
    if (c === goal) { found = true; break; }
    if (++expanded > maxExpansions) break;
    const hc0 = h(c);
    if (hc0 < bestH) { best = c; bestH = hc0; }
    if (f > s.g[c]! + h(c) + 1e-9) continue;
    const cx = c % n, cy = Math.floor(c / n);
    for (const [dx, dy] of NEIGHBORS) {
      const x = cx + dx, y = cy + dy;
      if (x < 0 || y < 0 || x >= n || y >= n) continue;
      const next = y * n + x;
      if (!open[next]) continue;
      if (dx !== 0 && dy !== 0 && (!open[cy * n + x] || !open[y * n + cx])) continue;
      const g = s.g[c]! + (dx !== 0 && dy !== 0 ? DIAG : ORTH);
      if (known(next) && g >= s.g[next]!) continue;
      s.seen[next] = s.stamp;
      s.g[next] = g;
      s.from[next] = c;
      push(next, g + h(next));
    }
  }
  if (!found && (expanded <= maxExpansions || best === start)) return null;
  const last = found ? goal : best;
  const cells: Point[] = [];
  for (let c = last; c !== start; c = s.from[c]!) cells.push(centreOf(nav, c));
  cells.reverse();
  if (found) cells[cells.length - 1] = end;
  return smooth(nav, from, cells);
}

function smooth(nav: NavGrid, from: Point, cells: Point[]): Point[] {
  const out: Point[] = [];
  let at = from;
  for (let i = 0; i < cells.length;) {
    let j = i;
    while (j + 1 < cells.length && walkable(nav, at, cells[j + 1]!)) j++;
    out.push(cells[j]!);
    at = cells[j]!;
    i = j + 1;
  }
  return out;
}

export function clearShot(rects: readonly Rect[], a: Point, b: Point): boolean {
  for (const r of rects) if (segmentEntersRectAt(a.x, a.y, b.x - a.x, b.y - a.y, r) !== null) return false;
  return true;
}
