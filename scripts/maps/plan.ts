// A block plan drawn in text, one character per 100-unit cell, filled with kit pieces. It is how a map's first draft is laid
// out quickly: the plan says where the container stacks, crate piles, rooms and walls go, and the filler packs each block with
// pieces, varied by a hash of where it stands so a plan always fills the same way. The map editor takes it from there.
import { KIT, placed, type PieceId, type Placement } from '../../src/shared/kit.ts';
import type { Rect } from '../../src/shared/sim/movement.ts';

export const CELL = 100;
type Turn = Placement['r'];

/**
 * Blocks (merged into rects): `C` containers, `K` crate piles, `B` breakable crates and fuel barrels, `P` planters,
 * `R` a roofed room (`d` marks a door cell on its edge, `k` a crate pile inside it), `W` a wall and `H` a thick wall along
 * the block's long axis, `L` barriers, `S` sandbags, `U` railings.
 * Props (one per cell): `f` forklift, `g` generator, `a` AC unit, `b` barrels, `x` fuel barrel, `o` burning barrel,
 * `m` metal crate, `c` crate, `n` grate, `v` vent, `l` lamp, `r` warning light, `p` pallet, `t` signal post.
 */
const BLOCKS = new Set('CKBPRWHLSU');
const ROOM = new Set('Rdk');
const PROPS = new Set('fgabxomcnvlrpt');

function hash(x: number, y: number, salt = 0): number {
  let h = Math.imul(x * 374761393 + y * 668265263 + salt * 2246822519, 3266489917);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
const pick = <T>(xs: readonly T[], u: number): T => xs[Math.min(xs.length - 1, Math.floor(u * xs.length))]!;

export type Plan = { rows: string[]; width: number; height: number };

export function parsePlan(text: string): Plan {
  const lines = text.split('\n').map((l) => l.trimEnd());
  while (lines.length && lines[0] === '') lines.shift();
  while (lines.length && lines.at(-1) === '') lines.pop();
  const indent = Math.min(...lines.filter((l) => l !== '').map((l) => l.length - l.trimStart().length));
  const rows = lines.map((l) => l.slice(indent));
  const width = Math.max(...rows.map((r) => r.length));
  return { rows: rows.map((r) => r.padEnd(width, '.')), width, height: rows.length };
}

/** Same-character cells merged into rects: along a row, then down while the next row runs exactly as wide. */
function mergeCells(on: (x: number, y: number) => boolean, w: number, h: number): Rect[] {
  const used = new Uint8Array(w * h);
  const free = (x: number, y: number) => x >= 0 && x < w && y < h && on(x, y) && !used[y * w + x];
  const rects: Rect[] = [];
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (!free(x, y)) continue;
    let x1 = x;
    while (free(x1 + 1, y)) x1++;
    let y1 = y;
    const sameRun = (row: number) => !free(x - 1, row) && !free(x1 + 1, row) && Array.from({ length: x1 - x + 1 }, (_, i) => free(x + i, row)).every(Boolean);
    while (y1 + 1 < h && sameRun(y1 + 1)) y1++;
    for (let yy = y; yy <= y1; yy++) for (let xx = x; xx <= x1; xx++) used[yy * w + xx] = 1;
    rects.push({ x, y, w: x1 - x + 1, h: y1 - y + 1 });
  }
  return rects;
}

/** Rooms are connected runs of room cells; with the props standing in them, each must fill its bounding rect. */
function rooms(plan: Plan): Rect[] {
  const seen = new Uint8Array(plan.width * plan.height);
  const out: Rect[] = [];
  const at = (x: number, y: number) => (x >= 0 && y >= 0 && x < plan.width && y < plan.height ? plan.rows[y]![x]! : '.');
  for (let y = 0; y < plan.height; y++) for (let x = 0; x < plan.width; x++) {
    if (!ROOM.has(at(x, y)) || seen[y * plan.width + x]) continue;
    let x0 = x, x1 = x, y0 = y, y1 = y, n = 0;
    const queue = [[x, y] as const];
    seen[y * plan.width + x] = 1;
    while (queue.length) {
      const [cx, cy] = queue.pop()!;
      n++;
      x0 = Math.min(x0, cx); x1 = Math.max(x1, cx); y0 = Math.min(y0, cy); y1 = Math.max(y1, cy);
      for (const [nx, ny] of [[cx + 1, cy], [cx - 1, cy], [cx, cy + 1], [cx, cy - 1]] as const) {
        if (!ROOM.has(at(nx, ny)) || seen[ny * plan.width + nx]) continue;
        seen[ny * plan.width + nx] = 1;
        queue.push([nx, ny]);
      }
    }
    let props = 0;
    for (let yy = y0; yy <= y1; yy++) for (let xx = x0; xx <= x1; xx++) if (PROPS.has(at(xx, yy))) props++;
    if (n + props !== (x1 - x0 + 1) * (y1 - y0 + 1)) throw new Error(`room at cell ${x0},${y0} is not a rectangle`);
    out.push({ x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 });
  }
  return out;
}

/** A blank plan `w` by `h` cells that blocks are stamped into; `text()` gives it back as rows. */
export function canvas(w: number, h: number) {
  const grid = Array.from({ length: h }, () => Array.from({ length: w }, () => '.'));
  return {
    block(ch: string, x: number, y: number, bw = 1, bh = 1) {
      for (let yy = y; yy < y + bh; yy++) for (let xx = x; xx < x + bw; xx++) {
        if (yy < 0 || xx < 0 || yy >= h || xx >= w) throw new Error(`block ${ch} at ${x},${y} leaves the plan`);
        grid[yy]![xx] = ch;
      }
    },
    plan: (): Plan => ({ rows: grid.map((r) => r.join('')), width: w, height: h }),
  };
}

export class Filler {
  pieces: Placement[] = [];
  salt: number;
  constructor(salt = 0) { this.salt = salt; }
  put(p: PieceId, x: number, y: number, r: Turn = 0): Rect { this.pieces.push({ p, x, y, r }); return placed({ p, x, y, r }).foot; }
  u(x: number, y: number, k = 0) { return hash(Math.round(x), Math.round(y), this.salt * 7 + k); }

  /** A wall run from (x, y) `len` long (a multiple of 25), east (`dir` 0) or south (1). */
  run(x: number, y: number, len: number, dir: 0 | 1, kind: 'wall' | 'lowwall' | 'sandbags' | 'railing' | 'wall.thick' = 'wall') {
    if (len % 25) throw new Error(`a ${len} run is not a multiple of 25`);
    for (let d = 0; d < len;) {
      const left = len - d;
      const piece: PieceId = kind === 'wall' ? (left >= 200 ? 'wall.long' : left >= 100 ? 'wall' : left >= 50 ? 'wall.short' : 'wall.post')
        : kind === 'wall.thick' ? (left >= 100 ? 'wall.thick' : 'wall.post') : left >= 100 ? kind : 'wall.post';
      const step = piece === 'wall.post' ? 25 : KIT[piece].w;
      if (dir === 0) this.put(piece, x + d, y, 0); else this.put(piece, x, y + d, 1);
      d += step;
    }
  }

  /** Containers packed along the block's long axis, with crates closing the leftover end. */
  containers(r: Rect) {
    const vertical = r.h >= r.w;
    const across = vertical ? r.w : r.h, along = vertical ? r.h : r.w;
    for (let i = 0; i < across; i += 100) {
      let d = 0;
      while (along - d >= 250) {
        const kind = pick(['container.blue', 'container.rust', 'container.grey'] as const, this.u(i, d + r.x + r.y));
        if (vertical) this.put(kind, r.x + i, r.y + d, this.u(i, d, 1) < 0.5 ? 0 : 2);
        else this.put(kind, r.x + d, r.y + i, this.u(i, d, 1) < 0.5 ? 1 : 3);
        d += 250;
      }
      for (; along - d >= 50; d += 50) {
        const x = vertical ? r.x + i : r.x + d, y = vertical ? r.y + d : r.y + i;
        this.put('crate.metal', x, y);
        this.put('crate.metal', vertical ? x + 50 : x, vertical ? y : y + 50);
      }
    }
  }

  /** A pile in 100-unit chunks: a stack, a big crate with a small one, four small crates with a pallet, or barrels round a crate. */
  crates(r: Rect, breakable: boolean) {
    for (let y = r.y; y < r.y + r.h; y += 100) for (let x = r.x; x < r.x + r.w; x += 100) {
      const u = this.u(x, y);
      if (breakable) {
        if (u < 0.45) { this.put('crate', x, y); this.put('crate', x + 50, y + 50); this.put(this.u(x, y, 2) < 0.5 ? 'barrel.red' : 'barrel', x + 60, y + 10); }
        else if (u < 0.8) { this.put('crate.big', x + 12.5, y + 12.5); }
        else { this.put('crate', x, y + 50); this.put('barrel.red', x + 10, y + 10); this.put('barrel.red', x + 55, y + 15); this.put('crate', x + 50, y + 50); }
        continue;
      }
      if (u < 0.4) this.put('crate.stack', x, y);
      else if (u < 0.65) this.put('crate.big', x + 12.5, y + 12.5);
      else if (u < 0.85) { this.put('crate', x, y); this.put('crate.metal', x + 50, y); this.put('crate', x, y + 50); this.put('pallet', x + 50, y + 50); }
      else { this.put('crate.metal', x + 50, y); this.put('barrel', x + 5, y + 10); this.put('barrel', x + 15, y + 60); }
    }
  }

  planters(r: Rect) {
    for (let y = r.y; y < r.y + r.h; y += 100) for (let x = r.x; x < r.x + r.w; x += 100) this.put('planter', x, y);
  }

  /** A wall along the block's long axis, centred across it. */
  wall(r: Rect, kind: 'wall' | 'wall.thick' | 'lowwall' | 'sandbags' | 'railing') {
    const thick = kind === 'wall.thick' ? 50 : kind === 'railing' ? 10 : 25;
    if (r.w >= r.h) this.run(r.x, r.y + Math.round((r.h - thick) / 2 / 12.5) * 12.5, r.w, 0, kind);
    else this.run(r.x + Math.round((r.w - thick) / 2 / 12.5) * 12.5, r.y, r.h, 1, kind);
  }

  /** A roofed room on `r`: corner posts, walls with a 100 gap at each door cell, roofs over it, a lamp under each big roof. */
  room(r: Rect, doors: { side: 'n' | 's' | 'w' | 'e'; at: number }[]) {
    const T = 25;
    for (const [cx, cy] of [[0, 0], [1, 0], [0, 1], [1, 1]] as const) this.put('wall.post', r.x + cx * (r.w - T), r.y + cy * (r.h - T));
    const side = (s: 'n' | 's' | 'w' | 'e') => {
      const horizontal = s === 'n' || s === 's';
      const len = horizontal ? r.w : r.h;
      const x = s === 'e' ? r.x + r.w - T : r.x, y = s === 's' ? r.y + r.h - T : r.y;
      const gaps = doors.filter((d) => d.side === s).map((d) => d.at).sort((a, b) => a - b);
      let at = T;
      for (const g of gaps) {
        const from = Math.max(T, g), to = Math.min(len - T, g + 100);
        if (from > at) this.run(horizontal ? x + at : x, horizontal ? y : y + at, from - at, horizontal ? 0 : 1);
        at = to;
      }
      if (len - T > at) this.run(horizontal ? x + at : x, horizontal ? y : y + at, len - T - at, horizontal ? 0 : 1);
    };
    for (const s of ['n', 's', 'w', 'e'] as const) side(s);
    for (let y = r.y; y < r.y + r.h; y += 200) for (let x = r.x; x < r.x + r.w; x += 200) {
      const w = Math.min(200, r.x + r.w - x), h = Math.min(200, r.y + r.h - y);
      if (w === 200 && h === 200) { this.put('roof', x, y); this.put('lamp', x + 87.5, y + 87.5); }
      else for (let yy = y; yy < y + h; yy += 100) for (let xx = x; xx < x + w; xx += 100) this.put('roof.s', xx, yy);
    }
  }

  prop(ch: string, x: number, y: number): boolean {
    const u = this.u(x, y, 3);
    switch (ch) {
      case 'f': this.put('forklift', x + 12.5, y - 12.5, u < 0.5 ? 0 : 2); return true;
      case 'g': this.put('generator', x, y + 12.5); return true;
      case 'a': this.put('ac', x + 12.5, y + 25); return true;
      case 'b': this.put('barrel', x + 15, y + 15); this.put('barrel', x + 55, y + 20); this.put('barrel', x + 30, y + 55); return true;
      case 'x': this.put('barrel.red', x + 20, y + 20); this.put('barrel.red', x + 55, y + 50); return true;
      case 'o': this.put('barrel.fire', x + 35, y + 35); return true;
      case 'm': this.put('crate.metal', x + 25, y + 25); return true;
      case 'c': this.put('crate', x + 25, y + 25); return true;
      case 'n': this.put('grate', x + 25, y + 25); return true;
      case 'v': this.put('vent', x + 25, y + 25); return true;
      case 'l': this.put('lamp', x + 37.5, y + 37.5); return true;
      case 'r': this.put('alarm', x + 37.5, y + 37.5); return true;
      case 'p': this.put('pallet', x + 25, y + 25, u < 0.5 ? 0 : 1); return true;
      case 't': this.put('signal', x + 37.5, y + 37.5); return true;
      default: return false;
    }
  }

  /** Fills the whole plan; cell (0, 0) lands at map (`ox`, `oy`). */
  fill(plan: Plan, ox = 0, oy = 0) {
    const at = (x: number, y: number) => plan.rows[y]?.[x] ?? '.';
    const unit = (r: Rect): Rect => ({ x: ox + r.x * CELL, y: oy + r.y * CELL, w: r.w * CELL, h: r.h * CELL });
    for (const ch of BLOCKS) {
      if (ch === 'R') continue;
      for (const r of mergeCells((x, y) => at(x, y) === ch, plan.width, plan.height).map(unit)) {
        switch (ch) {
          case 'C': this.containers(r); break;
          case 'K': this.crates(r, false); break;
          case 'B': this.crates(r, true); break;
          case 'P': this.planters(r); break;
          case 'W': this.wall(r, 'wall'); break;
          case 'H': this.wall(r, 'wall.thick'); break;
          case 'L': this.wall(r, 'lowwall'); break;
          case 'S': this.wall(r, 'sandbags'); break;
          case 'U': this.wall(r, 'railing'); break;
        }
      }
    }
    for (const room of rooms(plan)) {
      const doors: { side: 'n' | 's' | 'w' | 'e'; at: number }[] = [];
      for (let x = room.x; x < room.x + room.w; x++) {
        if (at(x, room.y) === 'd') doors.push({ side: 'n', at: (x - room.x) * CELL });
        if (at(x, room.y + room.h - 1) === 'd') doors.push({ side: 's', at: (x - room.x) * CELL });
      }
      for (let y = room.y; y < room.y + room.h; y++) {
        if (at(room.x, y) === 'd') doors.push({ side: 'w', at: (y - room.y) * CELL });
        if (at(room.x + room.w - 1, y) === 'd') doors.push({ side: 'e', at: (y - room.y) * CELL });
      }
      this.room(unit(room), doors);
      const inside = mergeCells((x, y) => at(x, y) === 'k' && x > room.x && y > room.y && x < room.x + room.w - 1 && y < room.y + room.h - 1, plan.width, plan.height);
      for (const r of inside) this.crates(unit(r), false);
    }
    for (let y = 0; y < plan.height; y++) for (let x = 0; x < plan.width; x++) this.prop(at(x, y), ox + x * CELL, oy + y * CELL);
  }
}
