import type { ModeId } from './defs.ts';
import type { Rect } from './sim/movement.ts';
import { CAUSEWAY } from './maps/causeway.ts';
import { OLDTOWN } from './maps/oldtown.ts';
import { PLAZA } from './maps/plaza.ts';
import { QUARRY } from './maps/quarry.ts';

export type Center = { x: number; y: number };
export type WallMaterial = 'concrete' | 'sandstone' | 'planter';
export type MapWall = Rect & { material: WallMaterial };

export const ZONE_RADIUS = 180;
export const CRATE_SIZE = 44;

export type MapDef = {
  name: string;
  /** The map is a square this many pixels on a side. */
  size: number;
  walls: readonly MapWall[];
  /** DOM capture points A, B and C. */
  zones: readonly Center[];
  /** Every point inside a region is a clear spot for a player's center. */
  spawns: { red: readonly Rect[]; blue: readonly Rect[]; ffa: readonly Rect[] };
  crates: readonly Center[];
  /** Zombies only: the core the squad defends and the edge strips the horde walks in from. */
  siege?: { core: Center; horde: readonly Rect[] };
};

const BLOCKY = 1.6;
/** Outpost was drawn before walls had a material, when the client told them apart by shape: blocky ones sandstone, long ones concrete. */
const byShape = (r: Rect): MapWall => ({ ...r, material: Math.max(r.w, r.h) <= BLOCKY * Math.min(r.w, r.h) ? 'sandstone' : 'concrete' });

/** A quarter turn about the map's center, so every edge the horde walks in from faces the same cover. */
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
    walls: fourWays(quarter.walls.map(byShape), size),
    zones: [],
    spawns: { red: squad, blue: squad, ffa: squad },
    crates: [],
    siege: { core: { x: size / 2, y: size / 2 }, horde: fourWays([quarter.horde], size) },
  };
}

export const MAP_IDS = ['causeway', 'plaza', 'oldtown', 'quarry', 'outpost'] as const;
export type MapId = (typeof MAP_IDS)[number];

export const MAPS: Record<MapId, MapDef> = {
  causeway: CAUSEWAY,
  plaza: PLAZA,
  oldtown: OLDTOWN,
  quarry: QUARRY,
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
  FFA: ['plaza', 'oldtown', 'causeway', 'quarry'],
  TDM: ['causeway', 'plaza', 'quarry', 'oldtown'],
  DOM: ['quarry', 'causeway', 'oldtown', 'plaza'],
  ZOM: ['outpost'],
};

/** How long a map lasts; every mode changes map when a round restarts. A round that nobody wins outright ends when this runs out. */
export const MAP_MS: Record<ModeId, number> = { FFA: 10 * 60_000, TDM: 12 * 60_000, DOM: Infinity, ZOM: Infinity };
export const MAP_NOTICE_MS = 15_000;

export function nextMap(mode: ModeId, current: MapId): MapId {
  const order = ROTATION[mode];
  return order[(order.indexOf(current) + 1) % order.length];
}
