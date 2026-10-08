import { boxPts, convexOverlap } from '../geom.ts';
import type { Rect } from './movement.ts';

/**
 * A uniform-grid broadphase over a fixed list of solids: the map's walls and polygon parts, which never move or change.
 * Collision, bullet and sight queries used to test every wall on the map, so a map of 500+ walls cost six times one of 80;
 * with the grid a query tests only the walls in the cells it crosses.
 *
 * It never changes an answer. A query gets every solid it could touch (cells are padded, so float edges cannot lose one),
 * and the caller runs the same exact test on them, in the same order as the list (each cell holds its solids in list order,
 * and ordered queries sort their candidates), so first hits and ties come out as a linear scan's would.
 *
 * The grid is found from the array a query is handed (`prefixGrid`): any array that starts with the map's fixed walls, such as
 * `World.walls`, `coverRects(w)` or a bot's `arena.walls`, gets the grid for that run and scans the rest (door leaves, built walls,
 * crates, barrels) linearly. Walls are never moved or edited in place, only added and removed, so a run of the same objects
 * is the same geometry.
 */
export class RectGrid {
  readonly rects: readonly Rect[];
  readonly k: number;
  readonly cell: number;
  readonly x0: number;
  readonly y0: number;
  readonly x1: number;
  readonly y1: number;
  readonly cols: number;
  readonly rows: number;
  /** Cell c's solids are `items[start[c] .. start[c + 1])`, by index, ascending. */
  private readonly start: Int32Array;
  private readonly items: Int32Array;
  private readonly stamp: Uint32Array;
  private epoch = 0;
  /** The last query's candidates; valid until the next query on this grid. */
  readonly buf: Int32Array;

  constructor(rects: readonly Rect[], cell = GRID_CELL) {
    this.rects = rects;
    this.k = rects.length;
    this.cell = cell;
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const r of rects) { x0 = Math.min(x0, r.x); y0 = Math.min(y0, r.y); x1 = Math.max(x1, r.x + r.w); y1 = Math.max(y1, r.y + r.h); }
    if (!rects.length) { x0 = y0 = 0; x1 = y1 = 1; }
    this.x0 = x0 - 1; this.y0 = y0 - 1; this.x1 = x1 + 1; this.y1 = y1 + 1;
    this.cols = Math.max(1, Math.ceil((this.x1 - this.x0) / cell));
    this.rows = Math.max(1, Math.ceil((this.y1 - this.y0) / cell));
    const n = this.cols * this.rows;
    const count = new Int32Array(n + 1);
    const cellsOf: number[][] = rects.map((r) => this.cellsUnder(r));
    for (const cs of cellsOf) for (const c of cs) count[c + 1]!++;
    for (let c = 0; c < n; c++) count[c + 1]! += count[c]!;
    this.start = count.slice();
    this.items = new Int32Array(count[n]!);
    const fill = count;
    cellsOf.forEach((cs, i) => { for (const c of cs) this.items[fill[c]!++] = i; });
    this.stamp = new Uint32Array(this.k);
    this.buf = new Int32Array(this.k);
  }

  /** The cells a solid touches: its box's cells, or for a polygon part only those its shape reaches (grown by a pixel). */
  private cellsUnder(r: Rect): number[] {
    const out: number[] = [];
    const c0 = this.col(r.x - 1), c1 = this.col(r.x + r.w + 1), r0 = this.row(r.y - 1), r1 = this.row(r.y + r.h + 1);
    for (let j = r0; j <= r1; j++) for (let i = c0; i <= c1; i++) {
      if (r.pts && !convexOverlap(r.pts, boxPts(this.x0 + i * this.cell, this.y0 + j * this.cell, this.cell, this.cell, 1))) continue;
      out.push(j * this.cols + i);
    }
    return out;
  }

  private col(x: number): number { return Math.min(this.cols - 1, Math.max(0, Math.floor((x - this.x0) / this.cell))); }
  private row(y: number): number { return Math.min(this.rows - 1, Math.max(0, Math.floor((y - this.y0) / this.cell))); }

  private begin(): void {
    if (++this.epoch === 0xffffffff) { this.stamp.fill(0); this.epoch = 1; }
  }

  private addCells(i0: number, i1: number, j0: number, j1: number, n: number): number {
    const { start, items, stamp, buf, epoch, cols } = this;
    for (let j = j0; j <= j1; j++) {
      for (let i = i0; i <= i1; i++) {
        const c = j * cols + i;
        for (let s = start[c]!, e = start[c + 1]!; s < e; s++) {
          const id = items[s]!;
          if (stamp[id] === epoch) continue;
          stamp[id] = epoch;
          buf[n++] = id;
        }
      }
    }
    return n;
  }

  /** Candidates whose box may touch [x0, x1] x [y0, y1], into `buf`; returns how many. Ascending when `ordered`. */
  box(x0: number, y0: number, x1: number, y1: number, ordered: boolean): number {
    if (x1 < this.x0 || y1 < this.y0 || x0 > this.x1 || y0 > this.y1) return 0;
    this.begin();
    const n = this.addCells(this.col(x0), this.col(x1), this.row(y0), this.row(y1), 0);
    if (ordered && n > 1) this.buf.subarray(0, n).sort();
    return n;
  }

  /**
   * Candidates the segment (p, p + d) may enter, into `buf`; returns how many. Walks the cells the segment crosses along its
   * major axis, each column's (or row's) span padded half a pixel, so no solid it touches is missed. Ascending when `ordered`.
   */
  segment(px: number, py: number, dx: number, dy: number, ordered: boolean): number {
    const PAD = 0.5;
    const ax = Math.min(px, px + dx) - PAD, bx = Math.max(px, px + dx) + PAD, ay = Math.min(py, py + dy) - PAD, by = Math.max(py, py + dy) + PAD;
    if (bx < this.x0 || by < this.y0 || ax > this.x1 || ay > this.y1) return 0;
    this.begin();
    let n = 0;
    const c0 = this.col(ax), c1 = this.col(bx), r0 = this.row(ay), r1 = this.row(by);
    // A point (dx = dy = 0) has no major axis to walk (its slope would be 0 / 0), so it takes the cells of its padded box.
    if (c0 === c1 || r0 === r1 || (dx === 0 && dy === 0)) n = this.addCells(c0, c1, r0, r1, 0);
    else if (Math.abs(dx) >= Math.abs(dy)) {
      const k = dy / dx;
      for (let i = c0; i <= c1; i++) {
        const xa = Math.max(ax, this.x0 + i * this.cell), xb = Math.min(bx, this.x0 + (i + 1) * this.cell);
        const ya = py + (xa - px) * k, yb = py + (xb - px) * k;
        n = this.addCells(i, i, this.row(Math.max(ay, Math.min(ya, yb) - PAD)), this.row(Math.min(by, Math.max(ya, yb) + PAD)), n);
      }
    } else {
      const k = dx / dy;
      for (let j = r0; j <= r1; j++) {
        const ya = Math.max(ay, this.y0 + j * this.cell), yb = Math.min(by, this.y0 + (j + 1) * this.cell);
        const xa = px + (ya - py) * k, xb = px + (yb - py) * k;
        n = this.addCells(this.col(Math.max(ax, Math.min(xa, xb) - PAD)), this.col(Math.min(bx, Math.max(xa, xb) + PAD)), j, j, n);
      }
    }
    if (ordered && n > 1) this.buf.subarray(0, n).sort();
    return n;
  }
}

/** The grid's cell, in px: about the size of a typical wall piece. */
export const GRID_CELL = 64;
/** Fewer fixed walls than this and a linear scan is as quick. */
const MIN_INDEXED = 24;

/** A map wall: not a door leaf, not built, never expiring. Only these go in a grid (see `prefixGrid`). */
const isFixed = (r: Rect): boolean => {
  const w = r as Rect & { built?: boolean; door?: string; expiresAt?: number };
  return w.built === false && w.door === undefined && w.expiresAt === Infinity;
};

/** Grids by their first wall, most recently used first: a world has a few runs of its walls (all, those that stop rounds, those that stop sight). */
const BY_FIRST = new WeakMap<Rect, RectGrid[]>();
const MEMO = new WeakMap<readonly Rect[], RectGrid | null>();
const GRIDS_PER_FIRST = 6;

/** `NOGRID=1` in the environment turns the grid off, to benchmark or bisect against the linear scans. */
let enabled = !(globalThis as { process?: { env: Record<string, string | undefined> } }).process?.env.NOGRID;
/** For the equivalence test and benchmarks: `false` makes every query scan linearly. */
export function setGridEnabled(on: boolean): void { enabled = on; }

/**
 * The grid over `solids`' leading run of map walls (`solids[0 .. g.k)` are exactly `g.rects`), or null to scan linearly.
 * Arrays are only appended to or replaced, never edited in place, so an answer holds for an array for good.
 */
export function prefixGrid(solids: readonly Rect[]): RectGrid | null {
  if (!enabled || solids.length < MIN_INDEXED) return null;
  const memo = MEMO.get(solids);
  if (memo !== undefined) return memo;
  const g = findGrid(solids);
  MEMO.set(solids, g);
  return g;
}

function findGrid(solids: readonly Rect[]): RectGrid | null {
  const first = solids[0]!;
  if (!isFixed(first)) return null;
  const list = BY_FIRST.get(first) ?? [];
  for (let i = 0; i < list.length; i++) {
    const g = list[i]!;
    if (g.k > solids.length || (g.k < solids.length && isFixed(solids[g.k]!))) continue;
    let same = true;
    for (let j = g.k - 1; j >= 0 && same; j--) same = solids[j] === g.rects[j];
    if (!same) continue;
    if (i > 0) { list.splice(i, 1); list.unshift(g); }
    return g;
  }
  let k = 1;
  while (k < solids.length && isFixed(solids[k]!)) k++;
  if (k < MIN_INDEXED) return null;
  const g = new RectGrid(solids.slice(0, k));
  list.unshift(g);
  if (list.length > GRIDS_PER_FIRST) list.pop();
  BY_FIRST.set(first, list);
  return g;
}
