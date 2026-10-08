import { EXT, SIDES, type Side } from '../../shared/defs.ts';
import { KIT, placed, type PieceId, type Placement } from '../../shared/kit.ts';
import { halfTurnPiece, halfTurnRect, ZONE_RADIUS, type Center, type MapFile } from '../../shared/maps.ts';
import type { Rect } from '../../shared/sim/movement.ts';

/**
 * The map editor's edits, as pure functions of the map file. The file is what gets saved, so on a half-turn map it holds
 * one half: everything the editor shows of the other half is a twin derived here, and editing a twin edits its original.
 */

type SpawnSide = keyof MapFile['spawns'];

/** One editable thing in a map file. */
export type Target =
  | { k: 'piece'; i: number }
  | { k: 'mark'; i: number }
  | { k: 'spawn'; side: SpawnSide; i: number }
  | { k: 'zone'; i: number }
  | { k: 'extract'; side: 'attack' | 'defend'; i: number }
  | { k: 'terminal' }
  | { k: 'pad' }
  | { k: 'lane' }
  | { k: 'core' }
  | { k: 'horde'; side: Side };

/** Where a target sits: a rect, or a point (zone, terminal, core) whose `r` is the circle it is drawn and picked by. */
export type Geom = { kind: 'rect'; rect: Rect } | { kind: 'point'; at: Center; r: number };

/** A target as the editor draws and picks it. A twin is the half-turn copy of its target; moving it moves the target. */
export type Handle = { target: Target; geom: Geom; twin: boolean; label: string };

const POINT_R = { zone: ZONE_RADIUS, terminal: EXT.terminalR, core: 60 } as const;

export const sameTarget = (a: Target, b: Target): boolean => JSON.stringify(a) === JSON.stringify(b);

export function geomOf(f: MapFile, t: Target): Geom | null {
  const rect = (r: Rect | undefined): Geom | null => (r ? { kind: 'rect', rect: r } : null);
  const point = (at: Center | undefined, r: number): Geom | null => (at ? { kind: 'point', at, r } : null);
  switch (t.k) {
    case 'piece': { const at = f.pieces[t.i]; return at ? rect(placed(at).foot) : null; }
    case 'mark': return rect(f.marks[t.i]);
    case 'spawn': return rect(f.spawns[t.side][t.i]);
    case 'zone': return point(f.zones[t.i], POINT_R.zone);
    case 'extract': return rect(f.extract?.[t.side][t.i]);
    case 'terminal': return point(f.extract?.terminal, POINT_R.terminal);
    case 'pad': return rect(f.extract?.pad);
    case 'lane': return rect(f.train?.lane);
    case 'core': return point(f.siege?.core, POINT_R.core);
    case 'horde': return rect(f.siege?.horde[t.side]);
  }
}

const setAt = <T>(list: readonly T[], i: number, v: T): T[] => list.map((x, j) => (j === i ? v : x));

/** The file with `t` moved or resized to `g`. A piece takes only `g`'s corner: its size comes from the kit. */
function withGeom(f: MapFile, t: Target, g: Geom): MapFile {
  const r = g.kind === 'rect' ? g.rect : { x: g.at.x, y: g.at.y, w: 0, h: 0 };
  const c = g.kind === 'point' ? g.at : { x: r.x + r.w / 2, y: r.y + r.h / 2 };
  const box = { x: r.x, y: r.y, w: r.w, h: r.h };
  switch (t.k) {
    case 'piece': return { ...f, pieces: setAt(f.pieces, t.i, { ...f.pieces[t.i]!, x: r.x, y: r.y }) };
    case 'mark': return { ...f, marks: setAt(f.marks, t.i, { ...f.marks[t.i]!, ...box }) };
    case 'spawn': return { ...f, spawns: { ...f.spawns, [t.side]: setAt(f.spawns[t.side], t.i, box) } };
    case 'zone': return { ...f, zones: setAt(f.zones, t.i, c) };
    case 'extract': return f.extract ? { ...f, extract: { ...f.extract, [t.side]: setAt(f.extract[t.side], t.i, box) } } : f;
    case 'terminal': return f.extract ? { ...f, extract: { ...f.extract, terminal: c } } : f;
    case 'pad': return f.extract ? { ...f, extract: { ...f.extract, pad: box } } : f;
    case 'lane': return f.train ? { ...f, train: { ...f.train, lane: box } } : f;
    case 'core': return f.siege ? { ...f, siege: { ...f.siege, core: c } } : f;
    case 'horde': return f.siege ? { ...f, siege: { ...f.siege, horde: { ...f.siege.horde, [t.side]: box } } } : f;
  }
}

/** A piece's footprint is fixed by the kit; every other rect can be resized. */
export const resizable = (t: Target): boolean => t.k !== 'piece' && t.k !== 'zone' && t.k !== 'terminal' && t.k !== 'core';

const turnGeom = (size: number, g: Geom): Geom => (g.kind === 'rect' ? { kind: 'rect', rect: halfTurnRect(size, g.rect) } : { ...g, at: { x: size - g.at.x, y: size - g.at.y } });

/** The twin `t` has on a half-turn map, by the rules `expandMap` applies, or null. */
function twinOf(f: MapFile, t: Target, g: Geom): Geom | null {
  if (f.symmetry !== 'halfTurn') return null;
  switch (t.k) {
    case 'piece': {
      const turned = halfTurnPiece(f.size, f.pieces[t.i]!);
      return turned && { kind: 'rect', rect: placed(turned).foot };
    }
    case 'mark': return turnGeom(f.size, g);
    case 'spawn': return t.side === 'blue' ? null : turnGeom(f.size, g);
    case 'zone': return f.zones.length === 2 && t.i === 0 ? turnGeom(f.size, g) : null;
    default: return null;
  }
}

/** Every target in the file, then every twin, so a twin draws over nothing it hides. */
function targetsOf(f: MapFile): Target[] {
  const ts: Target[] = [];
  f.marks.forEach((_, i) => ts.push({ k: 'mark', i }));
  for (const side of ['ffa', 'red', 'blue'] as const) f.spawns[side].forEach((_, i) => ts.push({ k: 'spawn', side, i }));
  if (f.extract) {
    for (const side of ['attack', 'defend'] as const) f.extract[side].forEach((_, i) => ts.push({ k: 'extract', side, i }));
    if (f.extract.pad) ts.push({ k: 'pad' });
    ts.push({ k: 'terminal' });
  }
  if (f.train) ts.push({ k: 'lane' });
  if (f.siege) { for (const side of SIDES) ts.push({ k: 'horde', side }); ts.push({ k: 'core' }); }
  f.zones.forEach((_, i) => ts.push({ k: 'zone', i }));
  f.pieces.forEach((_, i) => ts.push({ k: 'piece', i }));
  return ts;
}

function labelOf(f: MapFile, t: Target, twin = false): string {
  switch (t.k) {
    case 'piece': return KIT[f.pieces[t.i]!.p].name;
    case 'mark': return `${f.marks[t.i]!.k} mark`;
    case 'spawn': return `${twin && t.side === 'red' ? 'blue' : t.side} spawn`;
    case 'zone': return `zone ${'ABC'[twin ? 2 : t.i] ?? t.i + 1}`;
    case 'extract': return `${t.side} spawn`;
    case 'horde': return `horde ${t.side}`;
    default: return t.k;
  }
}

export function handlesOf(f: MapFile): Handle[] {
  const own: Handle[] = [], twins: Handle[] = [];
  for (const target of targetsOf(f)) {
    const geom = geomOf(f, target)!;
    own.push({ target, geom, twin: false, label: labelOf(f, target) });
    const twin = twinOf(f, target, geom);
    if (twin) twins.push({ target, geom: twin, twin: true, label: labelOf(f, target, true) });
  }
  return [...own, ...twins];
}

const area = (g: Geom) => (g.kind === 'rect' ? g.rect.w * g.rect.h : Math.PI * g.r * g.r);
const holds = (g: Geom, p: Center, grab: number) => (g.kind === 'rect'
  ? p.x >= g.rect.x && p.x <= g.rect.x + g.rect.w && p.y >= g.rect.y && p.y <= g.rect.y + g.rect.h
  : Math.hypot(p.x - g.at.x, p.y - g.at.y) <= grab);

/**
 * The handle under `p`: a point's centre within `grab` first, then the smallest rect holding `p`, so a crate on a spawn or
 * under a roof is picked before them. `only` narrows the pick to the kinds the editor's layer filter shows.
 */
export function pick(handles: readonly Handle[], p: Center, grab: number, only?: (t: Target) => boolean): Handle | null {
  const rank = (g: Geom) => (g.kind === 'point' ? -1 : area(g));
  let best: Handle | null = null;
  for (const h of handles) {
    if (only && !only(h.target)) continue;
    if (holds(h.geom, p, grab) && (!best || rank(h.geom) < rank(best.geom))) best = h;
  }
  return best;
}

export const snap = (v: number, grid: number, free: boolean): number => (free ? Math.round(v) : Math.round(v / grid) * grid);

/** A handle's anchor: a rect's top-left, a point's centre. Drags move the anchor and snap it to the grid. */
export const anchorOf = (g: Geom): Center => (g.kind === 'rect' ? { x: g.rect.x, y: g.rect.y } : g.at);
const atAnchor = (g: Geom, a: Center): Geom => (g.kind === 'rect' ? { kind: 'rect', rect: { ...g.rect, x: a.x, y: a.y } } : { ...g, at: a });

/**
 * The file `from` with `h` dragged so its anchor lands at `to` (already snapped). Dragging a twin places the twin there and
 * its original at the half turn, so the twin is exactly where it was dropped.
 */
export function dragTo(from: MapFile, h: Handle, to: Center): MapFile {
  const moved = atAnchor(h.geom, to);
  return withGeom(from, h.target, h.twin ? turnGeom(from.size, moved) : moved);
}

/** The file with a rect handle's far corner dragged to `corner`; it never shrinks below one grid cell. */
export function resizeTo(from: MapFile, h: Handle, corner: Center, min: number): MapFile {
  if (h.geom.kind !== 'rect' || !resizable(h.target)) return from;
  const r = h.geom.rect;
  const rect = { x: r.x, y: r.y, w: Math.max(min, corner.x - r.x), h: Math.max(min, corner.y - r.y) };
  return withGeom(from, h.target, h.twin ? turnGeom(from.size, { kind: 'rect', rect }) : { kind: 'rect', rect });
}

/**
 * The next quarter turn the kit bakes for piece `i`, about the footprint's centre, with the new corner snapped. A piece that
 * looks the same every way round (`turns: 1`) does not turn; one with two looks flips between 0 and 1.
 */
export function rotatePiece(f: MapFile, i: number, grid: number, free: boolean): MapFile {
  const at = f.pieces[i]!;
  if (KIT[at.p].turns === 1) return f;
  const r = nextTurn(at.p, at.r);
  const before = placed(at).foot, after = placed({ ...at, r }).foot;
  const cx = before.x + before.w / 2, cy = before.y + before.h / 2;
  return { ...f, pieces: setAt(f.pieces, i, { ...at, r, x: snap(cx - after.w / 2, grid, free), y: snap(cy - after.h / 2, grid, free) }) };
}

/** A new piece of `p` at `r` quarter turns centred on `c`, its corner snapped. */
export function placementAt(p: PieceId, c: Center, grid: number, free: boolean, r: Placement['r'] = 0): Placement {
  const { w, h } = placed({ p, x: 0, y: 0, r }).foot;
  return { p, x: snap(c.x - w / 2, grid, free), y: snap(c.y - h / 2, grid, free), r };
}

/** The quarter turn after `r` among those the kit bakes for `p`. */
export const nextTurn = (p: PieceId, r: Placement['r']): Placement['r'] => (((r + 1) % 4) % KIT[p].turns) as Placement['r'];

export function addPiece(f: MapFile, at: Placement): { file: MapFile; target: Target } {
  return { file: { ...f, pieces: [...f.pieces, at] }, target: { k: 'piece', i: f.pieces.length } };
}

/** What the editor can add besides pieces: a spawn region of a side, a DOM zone, an extraction spawn. */
export type Addable = { k: 'spawn'; side: SpawnSide } | { k: 'zone' } | { k: 'extract'; side: 'attack' | 'defend' };

export function addRegion(f: MapFile, what: Addable, c: Center, grid: number): { file: MapFile; target: Target } {
  const box = { x: snap(c.x - 100, grid, false), y: snap(c.y - 100, grid, false), w: 200, h: 200 };
  switch (what.k) {
    case 'spawn': return { file: { ...f, spawns: { ...f.spawns, [what.side]: [...f.spawns[what.side], box] } }, target: { k: 'spawn', side: what.side, i: f.spawns[what.side].length } };
    case 'zone': return { file: { ...f, zones: [...f.zones, { x: snap(c.x, grid, false), y: snap(c.y, grid, false) }] }, target: { k: 'zone', i: f.zones.length } };
    case 'extract': {
      if (!f.extract) return { file: f, target: { k: 'terminal' } };
      return { file: { ...f, extract: { ...f.extract, [what.side]: [...f.extract[what.side], box] } }, target: { k: 'extract', side: what.side, i: f.extract[what.side].length } };
    }
  }
}

const without = <T>(list: readonly T[], i: number): T[] => list.filter((_, j) => j !== i);

/**
 * The file without `t`. What a mode cannot run without stays: the terminal, the lane, the core and the horde strips, and an
 * extraction side's last spawn. Removing the pad falls back to the map's helipad.
 */
export function remove(f: MapFile, t: Target): MapFile {
  switch (t.k) {
    case 'piece': return { ...f, pieces: without(f.pieces, t.i) };
    case 'mark': return { ...f, marks: without(f.marks, t.i) };
    case 'spawn': return { ...f, spawns: { ...f.spawns, [t.side]: without(f.spawns[t.side], t.i) } };
    case 'zone': return { ...f, zones: without(f.zones, t.i) };
    case 'extract': return f.extract && f.extract[t.side].length > 1 ? { ...f, extract: { ...f.extract, [t.side]: without(f.extract[t.side], t.i) } } : f;
    case 'pad': {
      if (!f.extract) return f;
      const { pad: _, ...rest } = f.extract;
      return { ...f, extract: rest };
    }
    default: return f;
  }
}

/** Undo and redo over whole files: each edit is cheap to keep since an edit shares every list it did not touch. */
export type History = { past: readonly MapFile[]; now: MapFile; future: readonly MapFile[] };

const DEPTH = 500;
export const historyOf = (f: MapFile): History => ({ past: [], now: f, future: [] });
export const commit = (h: History, f: MapFile): History => (f === h.now ? h : { past: [...h.past, h.now].slice(-DEPTH), now: f, future: [] });
export const undo = (h: History): History => (h.past.length ? { past: h.past.slice(0, -1), now: h.past.at(-1)!, future: [h.now, ...h.future] } : h);
export const redo = (h: History): History => (h.future.length ? { past: [...h.past, h.now], now: h.future[0]!, future: h.future.slice(1) } : h);
