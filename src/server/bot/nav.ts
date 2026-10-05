import { circleHitsRect, segmentEntersRectAt, type Rect } from '../../shared/sim/movement.ts';

export type Point = { x: number; y: number };

/**
 * Where a body of `radius` can stand, sampled at each `cell`'s centre over a square world of `size`.
 * The A* buffers ride along so a search allocates nothing; a grid belongs to one room, which thinks its bots one at a time.
 */
export type NavGrid = {
  size: number; cell: number; n: number; open: Uint8Array;
  search: { g: Float64Array; from: Int32Array; seen: Uint32Array; stamp: number };
};

export const NAV_CELL = 25;
const ORTH = 1, DIAG = Math.SQRT2;
const NEIGHBORS = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]] as const;
/** How far, in cells, a start or goal inside a wall is moved to the nearest open cell. */
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
  for (const r of solids) {
    const x0 = Math.max(0, Math.floor((r.x - radius) / cell)), x1 = Math.min(n - 1, Math.floor((r.x + r.w + radius) / cell));
    const y0 = Math.max(0, Math.floor((r.y - radius) / cell)), y1 = Math.min(n - 1, Math.floor((r.y + r.h + radius) / cell));
    for (let cy = y0; cy <= y1; cy++) for (let cx = x0; cx <= x1; cx++) if (circleHitsRect(centre(cx), centre(cy), radius, r)) open[cy * n + cx] = 0;
  }
  return { size, cell, n, open, search: { g: new Float64Array(n * n), from: new Int32Array(n * n), seen: new Uint32Array(n * n), stamp: 0 } };
}

const cellOf = (nav: NavGrid, p: Point) => {
  const cx = Math.min(nav.n - 1, Math.max(0, Math.floor(p.x / nav.cell))), cy = Math.min(nav.n - 1, Math.max(0, Math.floor(p.y / nav.cell)));
  return cy * nav.n + cx;
};
const centreOf = (nav: NavGrid, c: number): Point => ({ x: ((c % nav.n) + 0.5) * nav.cell, y: (Math.floor(c / nav.n) + 0.5) * nav.cell });

export const isOpen = (nav: NavGrid, p: Point) => nav.open[cellOf(nav, p)] === 1;

/** The open cell nearest `p` within a few cells, for a point a body cannot stand on such as a spot hugging a wall. */
function nearestOpen(nav: NavGrid, p: Point): number | null {
  const c = cellOf(nav, p);
  if (nav.open[c]) return c;
  const cx = c % nav.n, cy = Math.floor(c / nav.n);
  let best: number | null = null, bestD = Infinity;
  for (let dy = -SNAP_CELLS; dy <= SNAP_CELLS; dy++) {
    for (let dx = -SNAP_CELLS; dx <= SNAP_CELLS; dx++) {
      const x = cx + dx, y = cy + dy;
      if (x < 0 || y < 0 || x >= nav.n || y >= nav.n || !nav.open[y * nav.n + x]) continue;
      const d = dx * dx + dy * dy;
      if (d < bestD) { bestD = d; best = y * nav.n + x; }
    }
  }
  return best;
}

/** True when every cell the segment crosses is open, so a body can walk it straight. */
export function walkable(nav: NavGrid, a: Point, b: Point): boolean {
  const steps = Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / (nav.cell / 2));
  for (let i = 0; i <= steps; i++) {
    const t = steps === 0 ? 0 : i / steps;
    if (!nav.open[cellOf(nav, { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t })]) return false;
  }
  return true;
}

/**
 * The shortest 8-way route from `from` to `to` as waypoints a body can walk straight between, ending at `to` (or the nearest open spot to it),
 * or null when `to` cannot be reached. A diagonal step needs both cells it cuts past open, so a route never clips a corner.
 */
export function findPath(nav: NavGrid, from: Point, to: Point): Point[] | null {
  const start = nearestOpen(nav, from), goal = nearestOpen(nav, to);
  if (start === null || goal === null) return null;
  const end = nav.open[cellOf(nav, to)] ? to : centreOf(nav, goal);
  if (walkable(nav, from, end)) return [end];
  const { n, open } = nav;
  const s = nav.search;
  s.stamp++;
  const gx = goal % n, gy = Math.floor(goal / n);
  const h = (c: number) => {
    const dx = Math.abs((c % n) - gx), dy = Math.abs(Math.floor(c / n) - gy);
    return Math.max(dx, dy) + (DIAG - 1) * Math.min(dx, dy);
  };
  const heap: { c: number; f: number }[] = [];
  const push = (c: number, f: number) => {
    heap.push({ c, f });
    for (let i = heap.length - 1; i > 0;) {
      const up = (i - 1) >> 1;
      if (heap[up]!.f <= f) break;
      [heap[i], heap[up]] = [heap[up]!, heap[i]!];
      i = up;
    }
  };
  const pop = () => {
    const top = heap[0]!, last = heap.pop()!;
    if (heap.length > 0) {
      heap[0] = last;
      for (let i = 0; ;) {
        const l = 2 * i + 1, r = l + 1;
        let m = i;
        if (l < heap.length && heap[l]!.f < heap[m]!.f) m = l;
        if (r < heap.length && heap[r]!.f < heap[m]!.f) m = r;
        if (m === i) break;
        [heap[i], heap[m]] = [heap[m]!, heap[i]!];
        i = m;
      }
    }
    return top;
  };
  const known = (c: number) => s.seen[c] === s.stamp;
  s.seen[start] = s.stamp;
  s.g[start] = 0;
  s.from[start] = -1;
  push(start, h(start));
  let found = false;
  while (heap.length > 0) {
    const { c, f } = pop();
    if (c === goal) { found = true; break; }
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
  if (!found) return null;
  const cells: Point[] = [];
  for (let c = goal; c !== start; c = s.from[c]!) cells.push(centreOf(nav, c));
  cells.reverse();
  cells[cells.length - 1] = end;
  return smooth(nav, from, cells);
}

/** Drops every waypoint the walker could skip by going straight, so a route bends only at corners. */
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

/** True when no rect blocks the straight line from `a` to `b`, which is what bullets and eyes need. */
export function clearShot(rects: readonly Rect[], a: Point, b: Point): boolean {
  for (const r of rects) if (segmentEntersRectAt(a.x, a.y, b.x - a.x, b.y - a.y, r) !== null) return false;
  return true;
}
