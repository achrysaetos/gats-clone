import { SIDES, type ModeId, type Side } from './defs.ts';
import { KIT, PIECE_IDS, placed, type Light, type Material, type PieceId, type Placement } from './kit.ts';
import type { Rect } from './sim/movement.ts';
import { timetableProblem, type TrainDef } from './sim/train.ts';
import OUTPOST from './maps/outpost.json' with { type: 'json' };
import VAULT from './maps/vault.json' with { type: 'json' };
import WAREHOUSE from './maps/warehouse.json' with { type: 'json' };

export type Center = { x: number; y: number };
export type WallMaterial = Material;
export type MapWall = Rect & { material: WallMaterial };

export const ZONE_RADIUS = 180;

/** Floor paint baked into the map's light layer: lane lines, hazard stripes, chevrons and painted bays. `r` turns a chevron. */
export const MARK_KINDS = ['line', 'hazard', 'chevron', 'box'] as const;
export type MarkKind = (typeof MARK_KINDS)[number];
export type MapMark = Rect & { k: MarkKind; r: 0 | 1 | 2 | 3 };

/** `day` is the yard under a low sun; `dusk` is darker and leans on its lamps. */
export type MapLight = 'day' | 'dusk';

/**
 * What the map editor saves. With `symmetry: 'halfTurn'` every piece, mark, spawn and zone also stands at its half turn round
 * the map's centre (red spawns turning into blue), so a versus map is fair to both sides by construction.
 */
export type MapFile = {
  name: string;
  size: number;
  symmetry: 'none' | 'halfTurn';
  light: MapLight;
  pieces: Placement[];
  marks: MapMark[];
  spawns: { red: Rect[]; blue: Rect[]; ffa: Rect[] };
  /** DOM capture points; a half-turn map lists A and B, and C is A's twin. */
  zones: Center[];
  siege?: { core: Center; horde: Record<Side, Rect> };
  train?: TrainDef;
  /** Extraction: without `pad`, the pad is the map's one helipad. */
  extract?: { terminal: Center; pad?: Rect; attack: Rect[]; defend: Rect[] };
};

/**
 * Extraction: attackers hack the terminal by standing within `EXT.terminalR` of its point, carry the case it gives up to the pad,
 * and respawn in `attack`; defenders respawn in `defend`. Sides swap every round, so each team spawns in both.
 */
export type ExtractDef = { terminal: Center; pad: Rect; attack: readonly Rect[]; defend: readonly Rect[] };

export type MapDef = {
  name: string;
  size: number;
  light: MapLight;
  /** Every placed piece, twins included. */
  pieces: readonly Placement[];
  marks: readonly MapMark[];
  /** What stops bodies and rounds and never breaks: the `all` solids of every unbreakable piece. */
  walls: readonly MapWall[];
  /** What stops bodies but lets rounds through: railings. */
  fences: readonly Rect[];
  /** The pieces that wear down and break, which the sim keeps as crates. */
  breakables: readonly Placement[];
  /** The lights of every piece, in map space. */
  lights: readonly Light[];
  zones: readonly Center[];
  /** Every point inside a region is a clear spot for a player's center. */
  spawns: { red: readonly Rect[]; blue: readonly Rect[]; ffa: readonly Rect[] };
  /** Zombies only: the core the squad defends and the edge strips the horde walks in from. */
  siege?: { core: Center; horde: Readonly<Record<Side, Rect>> };
  /** A train that runs down its lane on a timetable and kills whatever it meets. */
  train?: TrainDef;
  extract?: ExtractDef;
};

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null;
const fail = (name: string, what: string): never => { throw new Error(`map ${name}: ${what}`); };
const num = (name: string, v: unknown, what: string): number => (typeof v === 'number' && Number.isFinite(v) ? v : fail(name, `${what} is not a number`));
const rect = (name: string, v: unknown, what: string): Rect => {
  if (!isObj(v)) return fail(name, `${what} is not a rect`);
  return { x: num(name, v.x, `${what}.x`), y: num(name, v.y, `${what}.y`), w: num(name, v.w, `${what}.w`), h: num(name, v.h, `${what}.h`) };
};
const center = (name: string, v: unknown, what: string): Center => (isObj(v) ? { x: num(name, v.x, `${what}.x`), y: num(name, v.y, `${what}.y`) } : fail(name, `${what} is not a point`));
const list = (name: string, v: unknown, what: string): unknown[] => (Array.isArray(v) ? v : fail(name, `${what} is not a list`));
const turn = (name: string, v: unknown, what: string): 0 | 1 | 2 | 3 => (v === undefined ? 0 : v === 0 || v === 1 || v === 2 || v === 3 ? v : fail(name, `${what} is not a quarter turn`));

/** Checks a saved map file and gives it its type; anything the editor or a hand edit got wrong fails here with where it is. */
export function parseMapFile(v: unknown): MapFile {
  if (!isObj(v)) return fail('?', 'not an object');
  const name = typeof v.name === 'string' && v.name ? v.name : fail('?', 'no name');
  const sides = isObj(v.spawns) ? v.spawns : fail(name, 'no spawns');
  const siege = v.siege === undefined ? undefined : isObj(v.siege) && isObj(v.siege.horde) ? {
    core: center(name, v.siege.core, 'siege.core'),
    horde: Object.fromEntries(SIDES.map((s) => [s, rect(name, (v.siege as { horde: Record<string, unknown> }).horde[s], `siege.horde.${s}`)])) as Record<Side, Rect>,
  } : fail(name, 'siege is malformed');
  const train = v.train === undefined ? undefined : isObj(v.train) ? {
    lane: rect(name, v.train.lane, 'train.lane'),
    axis: v.train.axis === 'y' ? 'y' as const : v.train.axis === 'x' ? 'x' as const : fail(name, 'train.axis is not x or y'),
    dir: v.train.dir === -1 ? -1 as const : v.train.dir === 1 ? 1 as const : fail(name, 'train.dir is not 1 or -1'),
    everyMs: num(name, v.train.everyMs, 'train.everyMs'),
    jitterMs: num(name, v.train.jitterMs, 'train.jitterMs'),
    warnMs: num(name, v.train.warnMs, 'train.warnMs'),
    speed: num(name, v.train.speed, 'train.speed'),
    length: num(name, v.train.length, 'train.length'),
  } : fail(name, 'train is malformed');
  const extract = v.extract === undefined ? undefined : isObj(v.extract) ? {
    terminal: center(name, v.extract.terminal, 'extract.terminal'),
    ...(v.extract.pad !== undefined && { pad: rect(name, v.extract.pad, 'extract.pad') }),
    attack: list(name, v.extract.attack, 'extract.attack').map((r, i) => rect(name, r, `extract.attack ${i}`)),
    defend: list(name, v.extract.defend, 'extract.defend').map((r, i) => rect(name, r, `extract.defend ${i}`)),
  } : fail(name, 'extract is malformed');
  if (extract && (!extract.attack.length || !extract.defend.length)) fail(name, 'extract needs attack and defend spawns');
  const late = train && timetableProblem(train);
  if (late) fail(name, `train: ${late}`);
  return {
    name,
    size: num(name, v.size, 'size'),
    symmetry: v.symmetry === 'halfTurn' ? 'halfTurn' : v.symmetry === 'none' || v.symmetry === undefined ? 'none' : fail(name, 'symmetry is not none or halfTurn'),
    light: v.light === 'dusk' ? 'dusk' : 'day',
    pieces: list(name, v.pieces, 'pieces').map((p, i) => {
      if (!isObj(p) || typeof p.p !== 'string' || !(PIECE_IDS as string[]).includes(p.p)) return fail(name, `piece ${i} names no kit piece`);
      return { p: p.p as PieceId, x: num(name, p.x, `piece ${i}.x`), y: num(name, p.y, `piece ${i}.y`), r: turn(name, p.r, `piece ${i}.r`) };
    }),
    marks: list(name, v.marks ?? [], 'marks').map((m, i) => {
      if (!isObj(m) || !(MARK_KINDS as readonly unknown[]).includes(m.k)) return fail(name, `mark ${i} has no kind`);
      return { ...rect(name, m, `mark ${i}`), k: m.k as MarkKind, r: turn(name, m.r, `mark ${i}.r`) };
    }),
    spawns: {
      red: list(name, sides.red, 'spawns.red').map((r, i) => rect(name, r, `spawns.red ${i}`)),
      blue: list(name, sides.blue ?? [], 'spawns.blue').map((r, i) => rect(name, r, `spawns.blue ${i}`)),
      ffa: list(name, sides.ffa, 'spawns.ffa').map((r, i) => rect(name, r, `spawns.ffa ${i}`)),
    },
    zones: list(name, v.zones ?? [], 'zones').map((z, i) => center(name, z, `zone ${i}`)),
    ...(siege && { siege }),
    ...(train && { train }),
    ...(extract && { extract }),
  };
}

const footprint = (at: Placement): Rect => placed(at).foot;

/** The map's every piece, mark, spawn and zone, with the half turn's twins added. A twin that lands on its original is kept once. */
export function expandMap(file: MapFile): MapDef {
  const { size } = file;
  const twin = file.symmetry === 'halfTurn';
  const turnRectAbout = <T extends Rect>(r: T): T => ({ ...r, x: size - r.x - r.w, y: size - r.y - r.h });
  const same = (a: Rect, b: Rect) => a.x === b.x && a.y === b.y && a.w === b.w && a.h === b.h;
  const withTwins = <T extends Rect>(items: readonly T[], turned: (t: T) => T): T[] => (twin ? [...items, ...items.flatMap((t) => (same(turned(t), t) ? [] : [turned(t)]))] : [...items]);

  const pieces: Placement[] = [...file.pieces];
  if (twin) for (const at of file.pieces) {
    const foot = turnRectAbout(footprint(at));
    const turned: Placement = { p: at.p, x: foot.x, y: foot.y, r: ((at.r + 2) % 4) as Placement['r'] };
    if (!(turned.x === at.x && turned.y === at.y && KIT[at.p].turns <= 2)) pieces.push(turned);
  }
  const walls: MapWall[] = [];
  const fences: Rect[] = [];
  const lights: Light[] = [];
  const breakables: Placement[] = [];
  for (const at of pieces) {
    const def = KIT[at.p];
    const shape = placed(at);
    lights.push(...shape.lights);
    if (def.breaks) { breakables.push(at); continue; }
    for (const { blocks, ...r } of shape.solids) {
      if (blocks === 'all') walls.push({ ...r, material: def.material });
      else fences.push(r);
    }
  }
  const zones = twin && file.zones.length === 2 ? [file.zones[0]!, file.zones[1]!, { x: size - file.zones[0]!.x, y: size - file.zones[0]!.y }] : [...file.zones];
  return {
    name: file.name,
    size,
    light: file.light,
    pieces,
    marks: withTwins(file.marks, (m) => ({ ...turnRectAbout(m), r: ((m.r + 2) % 4) as MapMark['r'] })),
    walls,
    fences,
    breakables,
    lights,
    zones,
    spawns: {
      red: twin ? [...file.spawns.red] : file.spawns.red,
      blue: twin ? [...file.spawns.blue, ...file.spawns.red.map(turnRectAbout)] : file.spawns.blue,
      ffa: withTwins(file.spawns.ffa, turnRectAbout),
    },
    ...(file.siege && { siege: file.siege }),
    ...(file.train && { train: file.train }),
    ...(file.extract && { extract: extractOf(file.name, file.extract, pieces) }),
  };
}

function extractOf(name: string, ext: NonNullable<MapFile['extract']>, pieces: readonly Placement[]): ExtractDef {
  const pads = pieces.filter((at) => at.p === 'helipad');
  const pad = ext.pad ?? (pads.length === 1 ? footprint(pads[0]!) : fail(name, `extract has no pad and ${pads.length} helipads to take it from`));
  return { terminal: ext.terminal, pad, attack: ext.attack, defend: ext.defend };
}

export const loadMap = (json: unknown): MapDef => expandMap(parseMapFile(json));

export const MAP_IDS = ['warehouse', 'outpost', 'vault'] as const;
export type MapId = (typeof MAP_IDS)[number];

export const MAPS: Record<MapId, MapDef> = {
  warehouse: loadMap(WAREHOUSE),
  outpost: loadMap(OUTPOST),
  vault: loadMap(VAULT),
};

export const ROTATION: Record<ModeId, readonly MapId[]> = {
  FFA: ['warehouse'],
  TDM: ['warehouse'],
  DOM: ['warehouse'],
  ZOM: ['outpost'],
  BR: ['warehouse'],
};

/** How long a map lasts; every mode changes map when a round restarts. A round that nobody wins outright ends when this runs out. */
export const MAP_MS: Record<ModeId, number> = { FFA: 10 * 60_000, TDM: 12 * 60_000, DOM: 15 * 60_000, ZOM: Infinity, BR: Infinity };
export const MAP_NOTICE_MS = 15_000;

export function nextMap(mode: ModeId, current: MapId): MapId {
  const order = ROTATION[mode];
  return order[(order.indexOf(current) + 1) % order.length]!;
}
