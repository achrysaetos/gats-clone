/// <reference types="node" />
// Usage: node scripts/maps/draft.ts <mapId> [--force]
// Writes the first draft of a kit map to src/shared/maps/<id>.json from the layout code below. After that the JSON is the
// source: edit it in the map editor (?dev&editor), and only rerun a draft (with --force) to throw those edits away.
import { existsSync, writeFileSync } from 'node:fs';
import { KIT, placed, type PieceId, type Placement } from '../../src/shared/kit.ts';
import type { MapFile, MapMark } from '../../src/shared/maps.ts';
import type { Rect } from '../../src/shared/sim/movement.ts';
import { canvas, Filler } from './plan.ts';

type Turn = Placement['r'];

class Draft {
  pieces: Placement[] = [];
  marks: MapMark[] = [];
  /** Places `p` with its turned footprint's top-left at (x, y). */
  put(p: PieceId, x: number, y: number, r: Turn = 0) { this.pieces.push({ p, x, y, r }); return placed({ p, x, y, r }).foot; }
  mark(k: MapMark['k'], x: number, y: number, w: number, h: number, r: Turn = 0) { this.marks.push({ k, x, y, w, h, r }); }

  /** A wall run from (x, y) `len` long (a multiple of 25), east (`dir` 0) or south (1), built greedily of 200, 100, 50 and 25 pieces. */
  run(x: number, y: number, len: number, dir: 0 | 1, kind: 'wall' | 'lowwall' | 'sandbags' = 'wall') {
    if (len % 25) throw new Error(`a ${len} run is not a multiple of 25`);
    for (let d = 0; d < len;) {
      const left = len - d;
      const piece: PieceId = kind !== 'wall' ? kind : left >= 200 ? 'wall.long' : left >= 100 ? 'wall' : left >= 50 ? 'wall.short' : 'wall.post';
      if (dir === 0) this.put(piece, x + d, y, 0); else this.put(piece, x, y + d, 1);
      d += KIT[piece].w;
    }
  }

  /**
   * A roofed room: posts at the corners, walls between with door gaps (each side's `doors` are offsets from the room's corner
   * along that side), roofs over it and a lamp under each roof. Sides are multiples of 200 so the roofs tile the room.
   */
  bay(room: Rect, doors: { n?: number[]; s?: number[]; w?: number[]; e?: number[] }, door = 100) {
    const T = 25;
    const side = (x: number, y: number, len: number, dir: 0 | 1, gaps: number[] = []) => {
      let at = T;
      for (const g of [...gaps].sort((a, b) => a - b)) {
        if (g > at) this.run(dir === 0 ? x + at : x, dir === 0 ? y : y + at, g - at, dir);
        at = g + door;
      }
      if (len - T > at) this.run(dir === 0 ? x + at : x, dir === 0 ? y : y + at, len - T - at, dir);
    };
    for (const [cx, cy] of [[0, 0], [1, 0], [0, 1], [1, 1]] as const) this.put('wall.post', room.x + cx * (room.w - T), room.y + cy * (room.h - T));
    side(room.x, room.y, room.w, 0, doors.n);
    side(room.x, room.y + room.h - T, room.w, 0, doors.s);
    side(room.x, room.y, room.h, 1, doors.w);
    side(room.x + room.w - T, room.y, room.h, 1, doors.e);
    for (let y = room.y; y < room.y + room.h; y += 200) for (let x = room.x; x < room.x + room.w; x += 200) {
      this.put('roof', x, y);
      this.put('lamp', x + 87.5, y + 87.5);
    }
  }

  /** A gantry crossing east from x0: a post every `span`, beams between. */
  gantry(x0: number, y: number, spans: number) {
    for (let i = 0; i <= spans; i++) this.put('gantry.post', x0 + i * 600 - 25, y);
    for (let i = 0; i < spans; i++) this.put('gantry', x0 + i * 600, y);
  }

  file(name: string, size: number, extra: Omit<MapFile, 'name' | 'size' | 'pieces' | 'marks' | 'symmetry' | 'light'> & Partial<Pick<MapFile, 'symmetry' | 'light'>>): MapFile {
    return { name, size, symmetry: 'halfTurn', light: 'day', pieces: this.pieces, marks: this.marks, ...extra };
  }
}

/**
 * Warehouse, 4000 square, half-turn symmetric about its centre: the north half is planned, the south half is its twin.
 * Red starts in the north-west beside a loading bay; zone A is the big north-east hall; B is the open floor at the centre,
 * crossed by two gantries. Aisles one or two cells wide run between container stacks and crate piles.
 */
function warehouse(): MapFile {
  const d = new Draft();
  const c = canvas(40, 20);
  // The red start, its sandbags and the loading bay beside it.
  c.block('S', 1, 5, 4, 1); c.block('o', 5, 5);
  c.block('R', 7, 0, 6, 5); c.block('d', 8, 4); c.block('d', 11, 4); c.block('d', 12, 2); c.block('k', 8, 1, 2, 1); c.block('k', 11, 1);
  // North edge: container stacks and crate piles with aisles between.
  c.block('C', 14, 0, 2, 6); c.block('K', 17, 1, 2, 2); c.block('b', 17, 4); c.block('C', 20, 0, 5, 2); c.block('x', 21, 3); c.block('K', 23, 3, 2, 1);
  // Zone A: the north-east hall.
  c.block('R', 27, 1, 12, 9); c.block('d', 27, 4); c.block('d', 27, 5); c.block('d', 30, 9); c.block('d', 35, 9); c.block('d', 32, 1); c.block('d', 38, 6);
  c.block('k', 29, 3, 2, 1); c.block('k', 36, 3, 1, 2); c.block('k', 29, 7); c.block('k', 35, 7, 2, 1);
  c.block('f', 32, 8);
  // The middle band of the north half.
  c.block('C', 1, 8, 2, 3); c.block('K', 5, 7, 2, 2); c.block('W', 9, 6, 1, 6); c.block('B', 11, 8, 2, 2); c.block('m', 13, 11);
  c.block('C', 16, 7, 2, 5); c.block('L', 20, 8, 4, 1); c.block('K', 20, 10, 2, 2); c.block('H', 24, 5, 1, 5); c.block('g', 22, 6);
  // The approach to B, under the gantries.
  c.block('C', 2, 15, 4, 1); c.block('W', 7, 14, 1, 5); c.block('K', 9, 16, 2, 2); c.block('L', 12, 14, 3, 1); c.block('C', 13, 16, 1, 3);
  c.block('S', 16, 17, 2, 1); c.block('B', 22, 15, 2, 2); c.block('K', 25, 14, 3, 2); c.block('C', 30, 13, 2, 4); c.block('W', 33, 11, 4, 1);
  c.block('K', 34, 15, 2, 2); c.block('C', 38, 12, 1, 6); c.block('a', 28, 11); c.block('b', 26, 17); c.block('p', 19, 13); c.block('n', 11, 13); c.block('v', 20, 4);
  const f = new Filler(1);
  f.fill(c.plan());
  d.pieces.push(...f.pieces);
  d.gantry(400, 1250, 3); d.gantry(2200, 1200, 2);
  d.put('pipes', 2600, 525);
  d.mark('hazard', 700, 500, 600, 25); d.mark('line', 1350, 0, 25, 700); d.mark('line', 1900, 0, 25, 700);
  d.mark('box', 2900, 300, 800, 500); d.mark('line', 0, 1350, 4000, 25); d.mark('chevron', 1800, 1500, 200, 100, 0);
  d.mark('box', 1700, 1700, 600, 600); d.mark('hazard', 2700, 1000, 1200, 25);
  return d.file('Warehouse', 4000, {
    spawns: { red: [{ x: 125, y: 125, w: 400, h: 300 }], blue: [], ffa: [{ x: 1450, y: 650, w: 100, h: 200 }, { x: 350, y: 1000, w: 300, h: 150 }, { x: 3250, y: 1300, w: 100, h: 150 }, { x: 1825, y: 525, w: 150, h: 150 }] },
    zones: [{ x: 3300, y: 550 }, { x: 2000, y: 2000 }],
  });
}

/** Outpost, the zombies map: 3000 square, cover round the core, horde strips on every edge. Every solid sits on the 50 grid the horde's flow field and the squad's walls use. */
function outpost(): MapFile {
  const d = new Draft();
  d.put('container.blue', 600, 600, 1); d.put('container.rust', 1000, 300, 0); d.put('container.grey', 2100, 600, 0);
  d.put('crate.stack', 300, 1050); d.put('planter', 500, 1700); d.put('planter', 1350, 650);
  d.put('wall.thick', 1700, 450); d.put('wall.thick', 1800, 450); d.put('wall.thick', 850, 900); d.put('wall.thick', 850, 950);
  d.put('lamp', 1287.5, 1287.5); d.put('lamp', 1687.5, 1287.5);
  return d.file('Outpost', 3000, {
    spawns: { red: [{ x: 1330, y: 1400, w: 60, h: 200 }], blue: [], ffa: [{ x: 1330, y: 1400, w: 60, h: 200 }] },
    zones: [],
    siege: {
      core: { x: 1500, y: 1500 },
      horde: { north: { x: 40, y: 40, w: 2920, h: 30 }, east: { x: 2930, y: 40, w: 30, h: 2920 }, south: { x: 40, y: 2930, w: 2920, h: 30 }, west: { x: 40, y: 40, w: 30, h: 2920 } },
    },
  });
}

const DRAFTS: Record<string, () => MapFile> = { warehouse, outpost };
const [id, force] = process.argv.slice(2);
const draft = id && DRAFTS[id];
if (!draft) { console.error(`usage: node scripts/maps/draft.ts <${Object.keys(DRAFTS).join('|')}> [--force]`); process.exit(2); }
const out = `src/shared/maps/${id}.json`;
if (existsSync(out) && force !== '--force') { console.error(`${out} exists; it may hold editor changes. Pass --force to overwrite.`); process.exit(1); }
writeFileSync(out, JSON.stringify(draft(), null, 1) + '\n');
console.log(`wrote ${out}`);
