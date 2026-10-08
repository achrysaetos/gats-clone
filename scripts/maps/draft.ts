/// <reference types="node" />
// Usage: node scripts/maps/draft.ts <mapId> [--force]
// Writes the first draft of a kit map to src/shared/maps/<id>.json from the layout code below. After that the JSON is the
// source: edit it in the map editor (?dev&editor), and only rerun a draft (with --force) to throw those edits away.
import { existsSync, writeFileSync } from 'node:fs';
import { KIT, placed, type PieceId, type Placement } from '../../src/shared/kit.ts';
import { serializeMapFile, type MapFile, type MapMark } from '../../src/shared/maps.ts';
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

/**
 * Vault, the extraction map: 3200 square and lopsided on purpose. Defenders start on the north edge, a walk from the vault, a lit room in
 * the north-east whose terminal sits under red alarm lights. Attackers start on the south edge; the helipad is in the south-west, so a
 * carrier crosses the whole map from the vault, past the lit bay in the middle, with the defenders' waves coming from behind.
 */
function vault(): MapFile {
  const d = new Draft();
  const c = canvas(32, 32);
  // The defenders' start and the vault.
  c.block('S', 13, 4, 3, 1); c.block('S', 18, 4, 3, 1); c.block('K', 21, 1, 2, 2);
  c.block('R', 23, 3, 7, 7); c.block('d', 23, 5); c.block('d', 23, 6); c.block('d', 25, 9); c.block('d', 26, 9); c.block('d', 29, 6);
  c.block('r', 24, 4); c.block('r', 28, 4); c.block('g', 28, 7); c.block('a', 24, 8); c.block('r', 22, 4); c.block('r', 27, 10);
  c.block('C', 5, 1, 2, 5); c.block('K', 9, 6, 2, 2); c.block('x', 10, 9); c.block('b', 30, 2); c.block('v', 18, 7);
  c.block('W', 21, 8, 1, 4); c.block('L', 14, 10, 3, 1); c.block('B', 17, 10); c.block('p', 12, 8);
  c.block('C', 1, 7, 1, 3); c.block('K', 16, 6, 2, 1); c.block('B', 13, 6); c.block('C', 8, 3, 3, 1); c.block('K', 2, 2, 1, 1);
  // The middle: a lit bay, container rows and crate piles.
  c.block('R', 11, 13, 6, 6); c.block('d', 13, 13); c.block('d', 14, 18); c.block('d', 11, 15); c.block('d', 16, 16); c.block('k', 13, 15, 2, 1);
  c.block('C', 19, 12, 1, 5); c.block('C', 6, 10, 4, 1); c.block('C', 22, 14, 3, 1); c.block('C', 4, 15, 1, 4);
  c.block('K', 8, 12, 2, 1); c.block('K', 20, 18, 2, 2); c.block('K', 25, 11, 2, 2); c.block('K', 27, 17, 2, 1); c.block('K', 1, 12, 2, 1);
  c.block('B', 24, 20, 2, 1); c.block('B', 8, 20, 2, 1); c.block('B', 7, 17); c.block('H', 28, 13, 1, 3);
  c.block('K', 1, 17, 2, 2); c.block('C', 2, 20, 3, 1); c.block('B', 5, 13); c.block('C', 30, 10, 1, 5); c.block('B', 26, 15); c.block('K', 9, 17, 1, 1);
  c.block('f', 23, 17); c.block('o', 18, 20); c.block('n', 15, 11); c.block('l', 9, 15); c.block('l', 21, 21);
  // The south: the attackers' start and the pad.
  c.block('L', 15, 21, 3, 1); c.block('W', 18, 22, 3, 1); c.block('S', 13, 27, 3, 1); c.block('S', 20, 27, 3, 1);
  c.block('C', 7, 25, 1, 4); c.block('K', 10, 23, 2, 2); c.block('K', 22, 24, 2, 1); c.block('K', 27, 28, 2, 2); c.block('B', 11, 28);
  c.block('R', 24, 22, 6, 4); c.block('d', 24, 23); c.block('d', 26, 25); c.block('k', 27, 23, 2, 1);
  c.block('C', 14, 23, 1, 3); c.block('K', 17, 24, 2, 1); c.block('B', 12, 21); c.block('S', 5, 26, 1, 2); c.block('K', 3, 30, 2, 1); c.block('B', 9, 30);
  c.block('t', 1, 25); c.block('t', 6, 29); c.block('x', 9, 27); c.block('o', 1, 21); c.block('m', 4, 22); c.block('c', 5, 22);
  const f = new Filler(3);
  f.fill(c.plan());
  d.pieces.push(...f.pieces);
  d.put('terminal', 2612.5, 330);
  d.put('helipad', 200, 2600);
  d.put('pipes', 2500, 1150);
  d.mark('hazard', 175, 2575, 350, 25); d.mark('hazard', 175, 2900, 350, 25); d.mark('chevron', 550, 2400, 200, 100, 2); d.mark('chevron', 850, 2200, 200, 100, 2);
  d.mark('box', 2450, 450, 400, 400); d.mark('line', 0, 1050, 3200, 25); d.mark('line', 0, 2150, 3200, 25); d.mark('box', 1450, 2875, 600, 250);
  const attack = [{ x: 1500, y: 2900, w: 500, h: 200 }], defend = [{ x: 800, y: 100, w: 500, h: 150 }];
  return d.file('Vault', 3200, {
    symmetry: 'none', light: 'dusk',
    spawns: { red: attack, blue: defend, ffa: [...attack, ...defend] },
    zones: [],
    extract: { terminal: { x: 2650, y: 650 }, attack, defend },
  });
}

/**
 * Railyard, 4000 square, half-turn symmetric: a freight line runs west to east across the middle row, railed off on both sides with three
 * crossings, each under signal posts and warning lights. Red starts in the north-west by the depot; the freight shed is the north-east hall.
 * The centre crossing runs under a signal gantry.
 */
function railyard(): MapFile {
  const d = new Draft();
  const c = canvas(40, 18);
  // The red start, the depot and the container rows along the north edge.
  c.block('S', 1, 5, 4, 1); c.block('o', 5, 5);
  c.block('R', 7, 0, 6, 5); c.block('d', 9, 4); c.block('d', 12, 2); c.block('k', 8, 1, 2, 1); c.block('a', 11, 1);
  c.block('C', 14, 0, 2, 5); c.block('K', 17, 1, 2, 2); c.block('b', 17, 4); c.block('C', 20, 0, 5, 2); c.block('x', 21, 3); c.block('K', 23, 3, 2, 1);
  // The freight shed.
  c.block('R', 27, 1, 11, 7); c.block('d', 27, 3); c.block('d', 27, 4); c.block('d', 31, 7); c.block('d', 35, 7); c.block('d', 32, 1); c.block('d', 37, 5);
  c.block('k', 29, 3, 2, 1); c.block('k', 34, 3, 2, 2); c.block('f', 32, 5);
  c.block('C', 39, 2, 1, 5);
  // The middle band.
  c.block('C', 1, 8, 2, 3); c.block('K', 5, 7, 2, 2); c.block('W', 9, 6, 1, 5); c.block('B', 11, 8, 2, 2); c.block('m', 13, 10);
  c.block('C', 16, 7, 2, 4); c.block('L', 20, 8, 4, 1); c.block('K', 20, 10, 2, 2); c.block('H', 24, 5, 1, 4); c.block('g', 22, 6);
  c.block('K', 26, 10, 2, 2); c.block('C', 30, 10, 4, 1); c.block('W', 35, 9, 1, 3); c.block('B', 37, 10, 2, 2);
  // The platforms along the line.
  c.block('L', 2, 15, 4, 1); c.block('C', 7, 13, 1, 3); c.block('K', 10, 15, 2, 2); c.block('S', 13, 13, 3, 1); c.block('x', 15, 16); c.block('L', 17, 15, 3, 1);
  c.block('B', 22, 14, 2, 2); c.block('f', 25, 16); c.block('K', 27, 13, 2, 2); c.block('L', 30, 15, 4, 1); c.block('C', 35, 13, 1, 3); c.block('x', 37, 16); c.block('b', 33, 13);
  c.block('n', 4, 12); c.block('v', 19, 4); c.block('p', 19, 13); c.block('l', 12, 12); c.block('l', 24, 12); c.block('n', 29, 17); c.block('p', 8, 17);
  c.block('P', 38, 12, 2, 1); c.block('m', 21, 17); c.block('c', 11, 17); c.block('b', 31, 17); c.block('K', 13, 7); c.block('c', 18, 12); c.block('B', 32, 12); c.block('P', 0, 13, 1, 2);
  const f = new Filler(5);
  f.fill(c.plan());
  d.pieces.push(...f.pieces);

  const lane = { x: 0, y: 1925, w: 4000, h: 150 };
  for (let x = 0; x < 2000; x += 100) d.put('track', x, lane.y);
  // Railings on the north edge leave crossings at 600, 1900 and 3200; the half turn rails the south edge to match.
  for (const [a, b] of [[0, 600], [800, 1900], [2100, 3200], [3400, 4000]] as const) for (let x = a; x < b; x += 100) d.put('railing', x, 1905);
  for (const x of [562.5, 1862.5, 3162.5]) d.put('signal', x, 1860);
  for (const x of [812.5, 2112.5, 3412.5]) d.put('alarm', x, 1872.5);
  d.put('gantry', 1975, 1700, 1); d.put('gantry.post', 1975, 1650);
  d.put('rubble', 1400, 1780); d.put('rubble', 2600, 1760, 2);
  d.mark('hazard', 0, 1880, 4000, 25); d.mark('line', 0, 1700, 1300, 25); d.mark('chevron', 600, 1720, 200, 100, 1); d.mark('chevron', 3200, 1720, 200, 100, 1);
  d.mark('box', 2850, 250, 1000, 650); d.mark('line', 1350, 0, 25, 700); d.mark('hazard', 2700, 1000, 1200, 25);
  return d.file('Railyard', 4000, {
    spawns: { red: [{ x: 125, y: 125, w: 400, h: 300 }], blue: [], ffa: [{ x: 1450, y: 650, w: 100, h: 200 }, { x: 350, y: 1000, w: 300, h: 150 }, { x: 2350, y: 1150, w: 150, h: 150 }, { x: 1825, y: 525, w: 150, h: 150 }] },
    zones: [],
    train: { lane, axis: 'x', dir: 1, everyMs: 50_000, jitterMs: 12_000, warnMs: 5000, speed: 1400, length: 1300 },
  });
}

/** A run of thick wall from (x, y), `len` long in 100s, east (`dir` 0) or south (1): every edge on the 50 grid the horde and the squad's walls use. */
function thickRun(d: Draft, x: number, y: number, len: number, dir: 0 | 1) {
  if (len % 100) throw new Error(`a ${len} thick run is not a multiple of 100`);
  for (let i = 0; i < len; i += 100) d.put('wall.thick', dir === 0 ? x + i : x, dir === 0 ? y : y + i, dir);
}

/** A roofed hall walled in thick wall, with a 100 gap at each door (an offset along its side, from the hall's corner), a roof over it and a lamp under each roof. */
function hall(d: Draft, x: number, y: number, w: number, h: number, doors: { n?: number[]; s?: number[]; w?: number[]; e?: number[] }) {
  const T = 50;
  const side = (x0: number, y0: number, from: number, to: number, dir: 0 | 1, gaps: number[] = []) => {
    let at = from;
    for (const g of [...gaps].sort((a, b) => a - b)) {
      if (g > at) thickRun(d, dir === 0 ? x0 + at : x0, dir === 0 ? y0 : y0 + at, g - at, dir);
      at = g + 100;
    }
    if (to > at) thickRun(d, dir === 0 ? x0 + at : x0, dir === 0 ? y0 : y0 + at, to - at, dir);
  };
  side(x, y, 0, w, 0, doors.n);
  side(x, y + h - T, 0, w, 0, doors.s);
  side(x, y, T, h - T, 1, doors.w);
  side(x + w - T, y, T, h - T, 1, doors.e);
  for (let yy = y; yy < y + h; yy += 200) for (let xx = x; xx < x + w; xx += 200) {
    if (xx + 200 <= x + w && yy + 200 <= y + h) { d.put('roof', xx, yy); d.put('lamp', xx + 87.5, yy + 87.5); } else for (let sy = yy; sy < Math.min(yy + 200, y + h); sy += 100) for (let sx = xx; sx < Math.min(xx + 200, x + w); sx += 100) d.put('roof.s', sx, sy);
  }
}

/**
 * Yard, 3000 square and half-turn symmetric, built for zombies first: the core stands in an open plaza at the centre ringed by planters,
 * with room round it for the squad's Bastion, and the horde walks in from every edge through a quay yard of halls, container rows,
 * blown walls and fuel barrels. Every wall sits on the 50 grid. In DOM and TDM the plaza is zone B, red starts in the north-west and
 * zone A is the blown yard west of the plaza.
 */
function yard(): MapFile {
  const d = new Draft();
  // The red start, walled off from the yard.
  thickRun(d, 100, 500, 400, 0); d.put('planter', 500, 450);
  // The north-west hall.
  hall(d, 700, 100, 600, 400, { s: [200], e: [150] });
  d.put('crate.stack', 800, 200); d.put('crate.metal', 1150, 350); d.put('crate', 1100, 200);
  // Planters and containers along the north edge.
  d.put('planter.long', 1400, 150); d.put('container.blue', 1700, 150); d.put('container.rust', 1800, 150);
  d.put('container.grey', 2100, 200, 1); d.put('container.blue', 2100, 300, 1);
  d.put('crate', 2450, 150); d.put('barrel.red', 2510, 160); d.put('barrel.red', 2470, 210); d.put('crate.big', 2550, 230);
  // The north-east hall.
  hall(d, 2400, 500, 500, 400, { w: [150], s: [200] });
  d.put('crate.stack', 2700, 600); d.put('crate.metal', 2500, 750);
  // A blown wall north-west of the plaza, rubble round its broken ends and a fuel dump burning beside it.
  thickRun(d, 900, 800, 200, 0); thickRun(d, 1250, 850, 200, 1);
  d.put('rubble', 1100, 790); d.put('rubble', 1170, 1060, 1);
  d.put('barrel.red', 650, 700); d.put('barrel.red', 690, 735); d.put('crate', 720, 680); d.put('crate', 600, 760); d.put('barrel.red', 660, 820);
  // The west: a container row, planters and crates by zone A.
  d.put('container.rust', 150, 800); d.put('container.grey', 250, 800);
  d.put('planter', 500, 1250); d.put('crate.metal', 450, 1000); d.put('crate', 1000, 1300); d.put('crate.big', 950, 1050);
  // The east: a thick wall, planters and a crate stack.
  thickRun(d, 2400, 1100, 300, 1); d.put('planter', 2100, 900); d.put('crate.stack', 2650, 1200); d.put('crate', 2150, 1250);
  d.put('container.blue', 1600, 600, 1); d.put('crate.metal', 1650, 900);
  // The plaza's planters, one at each corner.
  d.put('planter', 1100, 1100); d.put('planter', 1800, 1100);
  d.put('crate.stack', 300, 1400);
  // Fill between: crate piles, a second fuel dump east of the plaza, railed walkways and planters on the west edge.
  d.put('crate.stack', 1950, 850); d.put('crate.metal', 2050, 850); d.put('crate', 1880, 960);
  d.put('barrel.red', 2100, 1310); d.put('barrel.red', 2140, 1345); d.put('crate', 2190, 1300);
  for (let x = 700; x < 1000; x += 100) d.put('railing', x, 600);
  for (let y = 1050; y < 1250; y += 100) d.put('railing', 2300, y, 1);
  d.put('planter.long', 100, 1050, 1); d.put('crate.metal', 1350, 450); d.put('crate.metal', 1400, 450); d.put('crate', 1380, 520);
  d.put('crate.big', 700, 1350); d.put('crate.stack', 2200, 500); d.put('crate', 2310, 520);
  d.put('rubble', 400, 650); d.put('rubble', 1700, 900, 1);
  for (const [x, y] of [[1287.5, 1000], [600, 1087.5], [2287.5, 750]]) d.put('lamp', x, y);
  d.put('vent', 1450, 1150); d.put('grate', 850, 600); d.put('drain', 2000, 1400); d.put('grate', 1950, 700);
  d.mark('hazard', 1150, 1150, 700, 25); d.mark('chevron', 1400, 950, 200, 100, 1); d.mark('box', 100, 100, 500, 350); d.mark('line', 0, 600, 650, 25);
  d.mark('line', 1975, 0, 25, 550); d.mark('hazard', 2400, 1000, 500, 25);
  const red = [{ x: 150, y: 150, w: 400, h: 250 }];
  return d.file('Yard', 3000, {
    spawns: { red, blue: [], ffa: [...red, { x: 1500, y: 300, w: 150, h: 150 }] },
    zones: [{ x: 750, y: 1150 }, { x: 1500, y: 1500 }],
    siege: {
      core: { x: 1500, y: 1500 },
      horde: { north: { x: 40, y: 40, w: 2920, h: 30 }, east: { x: 2930, y: 40, w: 30, h: 2920 }, south: { x: 40, y: 2930, w: 2920, h: 30 }, west: { x: 40, y: 40, w: 30, h: 2920 } },
    },
  });
}

const DRAFTS: Record<string, () => MapFile> = { warehouse, railyard, yard, vault };
const [id, force] = process.argv.slice(2);
const draft = id && DRAFTS[id];
if (!draft) { console.error(`usage: node scripts/maps/draft.ts <${Object.keys(DRAFTS).join('|')}> [--force]`); process.exit(2); }
const out = `src/shared/maps/${id}.json`;
if (existsSync(out) && force !== '--force') { console.error(`${out} exists; it may hold editor changes. Pass --force to overwrite.`); process.exit(1); }
writeFileSync(out, serializeMapFile(draft()));
console.log(`wrote ${out}`);
