import { WORLD, type ModeId } from './defs.ts';
import type { Rect } from './sim/movement.ts';

export type Center = { x: number; y: number };

export const ZONE_RADIUS = 180;
export const CRATE_SIZE = 44;

export type MapDef = {
  name: string;
  walls: readonly Rect[];
  /** DOM capture points A, B and C. */
  zones: readonly Center[];
  /** Every point inside a region is a clear spot for a player's center. */
  spawns: { red: readonly Rect[]; blue: readonly Rect[]; ffa: readonly Rect[] };
  crates: readonly Center[];
};

const S = WORLD.size;
const turnRect = (r: Rect): Rect => ({ x: S - r.x - r.w, y: S - r.y - r.h, w: r.w, h: r.h });
const turnCenter = (p: Center): Center => ({ x: S - p.x, y: S - p.y });
/** Each map is the same after a half turn about its center, so red (left) and blue (right) get mirror-image ground. */
const withTurned = <T>(half: readonly T[], turn: (t: T) => T): T[] => [...half, ...half.map(turn)];

function symmetricMap(name: string, half: { walls: Rect[]; zoneA: Center; red: Rect[]; ffa: Rect[]; crates: Center[] }): MapDef {
  return {
    name,
    walls: withTurned(half.walls, turnRect),
    zones: [half.zoneA, { x: S / 2, y: S / 2 }, turnCenter(half.zoneA)],
    spawns: { red: half.red, blue: half.red.map(turnRect), ffa: withTurned(half.ffa, turnRect) },
    crates: withTurned(half.crates, turnCenter),
  };
}

export const MAP_IDS = ['boneyard', 'causeway', 'oldtown', 'citadel'] as const;
export type MapId = (typeof MAP_IDS)[number];

export const MAPS: Record<MapId, MapDef> = {
  boneyard: symmetricMap('Boneyard', {
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

  causeway: symmetricMap('Causeway', {
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

  oldtown: symmetricMap('Old Town', {
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

  citadel: symmetricMap('Citadel', {
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
};

export const ROTATION: Record<ModeId, readonly MapId[]> = {
  FFA: ['boneyard', 'oldtown', 'causeway', 'citadel'],
  TDM: ['causeway', 'boneyard', 'citadel', 'oldtown'],
  DOM: ['citadel', 'causeway', 'oldtown', 'boneyard'],
};

/** How long a map lasts; every mode changes map when a round restarts. An FFA round that nobody wins on kills ends when this runs out. */
export const MAP_MS: Record<ModeId, number> = { FFA: 8 * 60_000, TDM: Infinity, DOM: Infinity };
export const MAP_NOTICE_MS = 15_000;

export function nextMap(mode: ModeId, current: MapId): MapId {
  const order = ROTATION[mode];
  return order[(order.indexOf(current) + 1) % order.length];
}
