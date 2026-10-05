import type { ModeId } from './defs.ts';
import type { Rect } from './sim/movement.ts';

export type Center = { x: number; y: number };

export const ZONE_RADIUS = 180;
export const CRATE_SIZE = 44;

export type MapDef = {
  name: string;
  /** The map is a square this many pixels on a side. */
  size: number;
  walls: readonly Rect[];
  /** DOM capture points A, B and C. */
  zones: readonly Center[];
  /** Every point inside a region is a clear spot for a player's center. */
  spawns: { red: readonly Rect[]; blue: readonly Rect[]; ffa: readonly Rect[] };
  crates: readonly Center[];
  /** Zombies only: the core the squad defends and the edge strips the horde walks in from. */
  siege?: { core: Center; horde: readonly Rect[] };
};

export const turnRect = (r: Rect, size: number): Rect => ({ x: size - r.x - r.w, y: size - r.y - r.h, w: r.w, h: r.h });
export const turnCenter = (p: Center, size: number): Center => ({ x: size - p.x, y: size - p.y });
/** Each map is the same after a half turn about its center, so red (left) and blue (right) get mirror-image ground. */
const withTurned = <T>(half: readonly T[], turn: (t: T, size: number) => T, size: number): T[] => [...half, ...half.map((t) => turn(t, size))];

function symmetricMap(name: string, size: number, half: { walls: Rect[]; zoneA: Center; red: Rect[]; ffa: Rect[]; crates: Center[] }): MapDef {
  return {
    name,
    size,
    walls: withTurned(half.walls, turnRect, size),
    zones: [half.zoneA, { x: size / 2, y: size / 2 }, turnCenter(half.zoneA, size)],
    spawns: { red: half.red, blue: half.red.map((r) => turnRect(r, size)), ffa: withTurned(half.ffa, turnRect, size) },
    crates: withTurned(half.crates, turnCenter, size),
  };
}

/** A quarter turn about the map's center, so every edge the horde walks in from faces the same cover. */
const quarterTurn = (r: Rect, size: number): Rect => ({ x: size - r.y - r.h, y: r.x, w: r.h, h: r.w });
const fourWays = (quarter: readonly Rect[], size: number): Rect[] => {
  const out: Rect[] = [];
  let turn = [...quarter];
  for (let i = 0; i < 4; i++) { out.push(...turn); turn = turn.map((r) => quarterTurn(r, size)); }
  return out;
};

function siegeMap(name: string, size: number, quarter: { walls: Rect[]; squad: Rect; horde: Rect }): MapDef {
  const squad = fourWays([quarter.squad], size);
  return {
    name,
    size,
    walls: fourWays(quarter.walls, size),
    zones: [],
    spawns: { red: squad, blue: squad, ffa: squad },
    crates: [],
    siege: { core: { x: size / 2, y: size / 2 }, horde: fourWays([quarter.horde], size) },
  };
}

export const MAP_IDS = ['boneyard', 'causeway', 'oldtown', 'citadel', 'outpost'] as const;
export type MapId = (typeof MAP_IDS)[number];

export const MAPS: Record<MapId, MapDef> = {
  boneyard: symmetricMap('Boneyard', 3000, {
    walls: [
      { x: 420, y: 300, w: 260, h: 50 }, { x: 900, y: 200, w: 50, h: 280 }, { x: 1250, y: 450, w: 120, h: 120 },
      { x: 600, y: 750, w: 120, h: 120 }, { x: 1000, y: 850, w: 280, h: 50 }, { x: 350, y: 1050, w: 50, h: 240 },
      { x: 880, y: 1150, w: 50, h: 200 }, { x: 1130, y: 1280, w: 50, h: 200 }, { x: 420, y: 1800, w: 240, h: 50 },
      { x: 900, y: 1700, w: 50, h: 260 }, { x: 1150, y: 1950, w: 240, h: 50 }, { x: 550, y: 2250, w: 120, h: 120 },
      { x: 380, y: 2600, w: 260, h: 50 }, { x: 900, y: 2450, w: 50, h: 280 }, { x: 1250, y: 2350, w: 120, h: 120 },
      { x: 1300, y: 2750, w: 200, h: 50 }, { x: 1330, y: 1150, w: 80, h: 80 },
    ],
    zoneA: { x: 650, y: 1500 },
    red: [{ x: 60, y: 150, w: 220, h: 2700 }],
    ffa: [{ x: 60, y: 150, w: 220, h: 1000 }, { x: 1000, y: 60, w: 450, h: 100 }, { x: 450, y: 1000, w: 300, h: 200 }],
    crates: [
      { x: 330, y: 600 }, { x: 780, y: 520 }, { x: 1100, y: 680 }, { x: 520, y: 1250 }, { x: 1050, y: 1500 }, { x: 700, y: 2000 },
      { x: 1100, y: 2200 }, { x: 400, y: 2300 }, { x: 750, y: 2800 }, { x: 1420, y: 900 }, { x: 820, y: 1050 }, { x: 1250, y: 1700 },
    ],
  }),

  causeway: symmetricMap('Causeway', 3000, {
    walls: [
      { x: 500, y: 980, w: 600, h: 50 }, { x: 1300, y: 980, w: 400, h: 50 }, { x: 1900, y: 980, w: 600, h: 50 },
      { x: 380, y: 1330, w: 50, h: 340 }, { x: 800, y: 1250, w: 160, h: 50 }, { x: 800, y: 1700, w: 160, h: 50 },
      { x: 1150, y: 1420, w: 60, h: 160 },
      { x: 850, y: 400, w: 100, h: 100 }, { x: 1100, y: 650, w: 200, h: 50 }, { x: 600, y: 200, w: 50, h: 250 }, { x: 700, y: 480, w: 500, h: 50 },
      { x: 850, y: 2450, w: 50, h: 300 }, { x: 1150, y: 2250, w: 100, h: 100 }, { x: 600, y: 2300, w: 200, h: 50 },
    ],
    zoneA: { x: 1500, y: 500 },
    red: [{ x: 60, y: 150, w: 260, h: 2700 }],
    ffa: [{ x: 60, y: 150, w: 260, h: 700 }, { x: 60, y: 2150, w: 260, h: 700 }, { x: 1000, y: 1060, w: 1000, h: 80 }],
    crates: [
      { x: 700, y: 650 }, { x: 1250, y: 350 }, { x: 450, y: 700 }, { x: 1000, y: 1500 }, { x: 650, y: 1500 }, { x: 1350, y: 1270 },
      { x: 1000, y: 2200 }, { x: 1350, y: 2650 }, { x: 450, y: 2400 }, { x: 1250, y: 1800 },
    ],
  }),

  oldtown: symmetricMap('Old Town', 3000, {
    walls: [
      { x: 360, y: 360, w: 280, h: 280 }, { x: 860, y: 360, w: 280, h: 280 }, { x: 1360, y: 360, w: 780, h: 280 },
      { x: 2360, y: 360, w: 280, h: 280 },
      { x: 360, y: 860, w: 280, h: 780 }, { x: 1360, y: 860, w: 280, h: 280 }, { x: 1860, y: 860, w: 280, h: 280 },
      { x: 2360, y: 860, w: 280, h: 280 },
      { x: 860, y: 1360, w: 280, h: 280 }, { x: 1140, y: 1440, w: 80, h: 40 },
    ],
    zoneA: { x: 1000, y: 1000 },
    red: [{ x: 60, y: 100, w: 260, h: 2800 }],
    ffa: [{ x: 60, y: 100, w: 260, h: 1000 }, { x: 680, y: 680, w: 140, h: 140 }, { x: 1180, y: 680, w: 140, h: 140 }],
    crates: [
      { x: 750, y: 250 }, { x: 1250, y: 1250 }, { x: 750, y: 1250 }, { x: 500, y: 1750 }, { x: 1750, y: 250 }, { x: 1250, y: 1750 },
      { x: 2250, y: 750 }, { x: 750, y: 2250 },
    ],
  }),

  citadel: symmetricMap('Citadel', 3000, {
    walls: [
      { x: 1080, y: 1080, w: 300, h: 60 }, { x: 1620, y: 1080, w: 300, h: 60 },
      { x: 1080, y: 1140, w: 60, h: 240 }, { x: 1080, y: 1620, w: 60, h: 240 },
      { x: 1220, y: 1220, w: 70, h: 70 }, { x: 1710, y: 1220, w: 70, h: 70 },
      { x: 1150, y: 350, w: 50, h: 300 }, { x: 1800, y: 350, w: 50, h: 300 }, { x: 1350, y: 750, w: 300, h: 50 },
      { x: 500, y: 700, w: 300, h: 50 }, { x: 500, y: 750, w: 50, h: 250 },
      { x: 550, y: 1350, w: 50, h: 300 },
      { x: 500, y: 2000, w: 50, h: 250 }, { x: 500, y: 2250, w: 300, h: 50 },
      { x: 2200, y: 600, w: 250, h: 50 },
    ],
    zoneA: { x: 1500, y: 450 },
    red: [{ x: 60, y: 150, w: 260, h: 2700 }],
    ffa: [{ x: 60, y: 150, w: 260, h: 900 }, { x: 700, y: 1000, w: 250, h: 200 }, { x: 2050, y: 150, w: 600, h: 300 }],
    crates: [
      { x: 1270, y: 1500 }, { x: 1500, y: 1270 }, { x: 850, y: 900 }, { x: 900, y: 1500 }, { x: 1500, y: 950 }, { x: 650, y: 450 },
      { x: 1000, y: 2000 }, { x: 2100, y: 900 }, { x: 400, y: 1500 },
    ],
  }),

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
  FFA: ['boneyard', 'oldtown', 'causeway', 'citadel'],
  TDM: ['causeway', 'boneyard', 'citadel', 'oldtown'],
  DOM: ['citadel', 'causeway', 'oldtown', 'boneyard'],
  ZOM: ['outpost'],
};

/** How long a map lasts; every mode changes map when a round restarts. A round that nobody wins outright ends when this runs out. */
export const MAP_MS: Record<ModeId, number> = { FFA: 6 * 60_000, TDM: 10 * 60_000, DOM: Infinity, ZOM: Infinity };
export const MAP_NOTICE_MS = 15_000;

export function nextMap(mode: ModeId, current: MapId): MapId {
  const order = ROTATION[mode];
  return order[(order.indexOf(current) + 1) % order.length];
}
