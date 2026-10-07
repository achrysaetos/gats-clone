import { SIDES, type ModeId, type PropKind, type Side } from './defs.ts';
import type { Rect } from './sim/movement.ts';
import { CAUSEWAY } from './maps/causeway.ts';
import { OLDTOWN } from './maps/oldtown.ts';
import { PLAZA } from './maps/plaza.ts';
import { RANGE_MAP } from './maps/range.ts';
import type { RangeLayout } from './range.ts';
import { QUARRY } from './maps/quarry.ts';
import { MARKET } from './maps/market.ts';
import { MUSEUM } from './maps/museum.ts';
import { SUBPEN } from './maps/subpen.ts';
import { PARK } from './maps/park.ts';

export type Center = { x: number; y: number };
export type WallMaterial = 'concrete' | 'sandstone' | 'planter' | 'stall' | 'shopfront' | 'stack' | 'cart' | 'shrine' | 'gallery' | 'marble' | 'vitrine' | 'plinth' | 'counter' | 'hull' | 'tower' | 'bulkhead' | 'rack' | 'water' | 'hedge' | 'pond' | 'parkstone' | 'trunk' | 'bench' | 'play';
/** A map's own look (src/client/themes): its floor, wall art, decor and lights. */
export type ThemeId = 'market' | 'museum' | 'subpen' | 'park';
export type MapWall = Rect & { material: WallMaterial };

export const ZONE_RADIUS = 180;
export const CRATE_SIZE = 44;

export type MapDef = {
  name: string;
  /** The visual theme this map wears; omitted for the plain yard look. */
  theme?: ThemeId;
  size: number;
  walls: readonly MapWall[];
  /** DOM capture points A, B and C. */
  zones: readonly Center[];
  /** Every point inside a region is a clear spot for a player's center. */
  spawns: { red: readonly Rect[]; blue: readonly Rect[]; ffa: readonly Rect[] };
  crates: readonly Center[];
  /** Explosive barrels (versus modes), centers; half-turn twins like the crates. */
  barrels: readonly Center[];
  /** The other shootable props (versus modes), centers; half-turn twins of the same kind. */
  props: readonly (Center & { kind: PropKind })[];
  /** Zombies only: the core the squad defends and the edge strips the horde walks in from. */
  siege?: { core: Center; horde: Readonly<Record<Side, Rect>> };
  /** The shooting range only (mode RNG): where its targets stand and what the floor paints. */
  range?: RangeLayout;
};

const BLOCKY = 1.6;
const outpostMaterialByShape = (r: Rect): MapWall => ({ ...r, material: Math.max(r.w, r.h) <= BLOCKY * Math.min(r.w, r.h) ? 'sandstone' : 'concrete' });

const quarterTurn = <T extends Rect>(r: T, size: number): T => ({ ...r, x: size - r.y - r.h, y: r.x, w: r.h, h: r.w });
const fourWays = <T extends Rect>(quarter: readonly T[], size: number): T[] => {
  const out: T[] = [];
  let turn = [...quarter];
  for (let i = 0; i < 4; i++) { out.push(...turn); turn = turn.map((r) => quarterTurn(r, size)); }
  return out;
};

function siegeMap(name: string, size: number, quarter: { walls: Rect[]; squad: Rect; horde: Rect }): MapDef {
  const squad = fourWays([quarter.squad], size);
  return {
    name,
    size,
    walls: fourWays(quarter.walls.map(outpostMaterialByShape), size),
    zones: [],
    spawns: { red: squad, blue: squad, ffa: squad },
    crates: [],
    barrels: [],
    props: [],
    siege: { core: { x: size / 2, y: size / 2 }, horde: Object.fromEntries(fourWays([quarter.horde], size).map((r, i) => [SIDES[i], r])) as Record<Side, Rect> },
  };
}

export const MAP_IDS = ['causeway', 'plaza', 'oldtown', 'quarry', 'market', 'museum', 'subpen', 'park', 'outpost', 'range'] as const;
export type MapId = (typeof MAP_IDS)[number];

export const MAPS: Record<MapId, MapDef> = {
  causeway: CAUSEWAY,
  plaza: PLAZA,
  oldtown: OLDTOWN,
  quarry: QUARRY,
  market: MARKET,
  museum: MUSEUM,
  subpen: SUBPEN,
  park: PARK,
  range: RANGE_MAP,
  outpost: siegeMap('Outpost', 3000, {
    walls: [
      { x: 600, y: 600, w: 150, h: 50 }, { x: 600, y: 650, w: 50, h: 100 }, { x: 1000, y: 300, w: 50, h: 200 },
      { x: 300, y: 1050, w: 100, h: 100 }, { x: 1350, y: 650, w: 100, h: 50 }, { x: 850, y: 900, w: 100, h: 100 },
    ],
    squad: { x: 1330, y: 1400, w: 60, h: 200 },
    horde: { x: 40, y: 40, w: 2920, h: 30 },
  }),
};

export const ROTATION: Record<ModeId, readonly MapId[]> = {
  FFA: ['plaza', 'oldtown', 'museum', 'subpen', 'causeway', 'market', 'quarry', 'park'],
  TDM: ['causeway', 'plaza', 'market', 'museum', 'subpen', 'quarry', 'oldtown', 'park'],
  DOM: ['quarry', 'causeway', 'market', 'oldtown', 'museum', 'subpen', 'plaza', 'park'],
  ZOM: ['outpost'],
  BR: ['oldtown', 'quarry', 'plaza', 'causeway', 'park', 'subpen', 'museum', 'market'],
  RNG: ['range'],
};

/** How long a map lasts; every mode changes map when a round restarts. A round that nobody wins outright ends when this runs out. */
export const MAP_MS: Record<ModeId, number> = { FFA: 10 * 60_000, TDM: 12 * 60_000, DOM: 15 * 60_000, ZOM: Infinity, BR: Infinity, RNG: Infinity };
export const MAP_NOTICE_MS = 15_000;

export function nextMap(mode: ModeId, current: MapId): MapId {
  const order = ROTATION[mode];
  return order[(order.indexOf(current) + 1) % order.length];
}
