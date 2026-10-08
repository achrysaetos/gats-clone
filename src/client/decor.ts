import type { MapDef, MapWall, WallMaterial } from '../shared/maps.ts';
import { knobs, scaled } from './quality.ts';
import { placeVignettes, type VKind, type Vignette } from './vignettes.ts';

/**
 * Where the environment's practical lights and set dressing go, decided once per map from nothing but the map's own layout
 * (name, walls, pads, zones): the same map always gets the same plan, on every client, and nothing here touches the DOM, so it
 * is unit-tested. docs/art/STYLE.md rules apply: detail hugs walls and edges, lanes stay quiet, and the lit fixtures are the
 * only loud things. Nothing in the plan collides; it is purely visual.
 *
 * fixtures.ts draws and lights the fixtures, decorart.ts bakes the marks into the floor, floor.ts carries the plan.
 */

export type Rect = { x: number; y: number; w: number; h: number };
export type Side = 'n' | 's' | 'e' | 'w';
export type Pt = readonly [number, number];

export const FIXTURE_KINDS = ['lamp', 'work', 'beacon', 'exit', 'tube', 'window', 'uplight', 'fan', 'steam', 'flood', 'alarm', 'boothlamp', 'lanepost', 'scoreboard', 'lantern'] as const;
export type FixtureKind = (typeof FIXTURE_KINDS)[number];

/**
 * `x, y` is where it is drawn (a wall-mounted one sits on its wall's top face, a floor one on the floor); `lx, ly` is where its
 * light starts; `angle` is the way it faces (outward from its wall, or at the core for a floodlight). `phase` 0..1 desyncs
 * its blink and spin. `w, h` size the sign-like ones.
 */
export type Fixture = {
  id: number; kind: FixtureKind; x: number; y: number; lx: number; ly: number; angle: number; phase: number;
  side?: Side; team?: 'red' | 'blue' | null; w?: number; h?: number; text?: string; face?: number;
  /** The district it stands in (an index into the map's `regionsFor` table), or -1 off the versus maps; `lamp` is that district's light colour. */
  region: number; lamp: string;
};

export type Mark =
  | { k: 'bay'; x: number; y: number; rot: number; text: string }
  | { k: 'stripe'; x: number; y: number; w: number; h: number }
  | { k: 'cable'; pts: readonly Pt[]; boxes: readonly Pt[] }
  | { k: 'tire'; x: number; y: number; rot: number; len: number }
  | { k: 'puddle'; x: number; y: number; r: number }
  | { k: 'paper'; x: number; y: number; rot: number }
  | { k: 'leaves'; x: number; y: number; rot: number }
  | { k: 'sandbag'; x: number; y: number; rot: number }
  | { k: 'pallet'; x: number; y: number; rot: number }
  | { k: 'debris'; x: number; y: number; rot: number }
  | { k: 'grime'; x: number; y: number; w: number; h: number }
  | { k: 'grate'; x: number; y: number; rot: number }
  | { k: 'oil'; x: number; y: number; r: number }
  /** A district's name stencilled big on the floor. */
  | { k: 'zone'; x: number; y: number; rot: number; text: string }
  /** A row of painted parking stalls (`n` of them) with a stall line each. */
  | { k: 'stalls'; x: number; y: number; rot: number; n: number }
  | { k: 'gravel'; x: number; y: number; r: number }
  /** A sequence of `n` painted arrows from (x, y) along `rot`, `step` apart, down a real lane toward a real place. */
  | { k: 'arrows'; x: number; y: number; rot: number; n: number; step: number }
  | { k: 'manhole'; x: number; y: number }
  /** A district's painted ground plan (districtart.ts), about 380 x 280 px at scale 1. */
  | { k: 'district'; x: number; y: number; rot: number; scale: number; region: number; plan: PlanKind; label: string };

/** Things bolted to a wall's top or face: drawn per frame over the wall, culled to the view. */
export type Mount =
  | { k: 'pipe'; x0: number; y0: number; x1: number; y1: number }
  | { k: 'plate'; x: number; y: number; text: string; wall: number; face: number };

export const LANDMARK_KINDS = [
  'trailer', 'containers', 'office', 'motor', 'dish', 'tanks', 'scrap', 'warehouse', 'tents',
  'busdepot', 'markethall', 'townhall', 'fountain', 'bandstand', 'bakery', 'church', 'laundry', 'well', 'crusher', 'conveyor', 'dynamite', 'gravel',
] as const;
export type LandmarkKind = (typeof LANDMARK_KINDS)[number];
/** The painted ground plan of a district (districtart.ts). */
export const PLAN_KINDS = [
  'dock', 'containers', 'office', 'motor', 'hq', 'fuel', 'scrap', 'warehouse', 'checkpoint',
  'busbays', 'stallgrid', 'civic', 'fountain', 'flowerbeds', 'cobbles', 'wellring', 'crusherpad', 'conveyorline', 'haulroad', 'pit',
] as const;
export type PlanKind = (typeof PLAN_KINDS)[number];
/** A district's set-piece, painted over the top face of one big wall block (so nothing walkable is hidden or faked). */
export type Landmark = { kind: LandmarkKind; x: number; y: number; w: number; h: number; region: number; wall: number; label: string };

/**
 * The nine districts of a versus map (the four corners, the four mid-edges and the centre), each with its own name, light
 * colour and temperature, floor tint, set-piece, painted ground plan and small stories, so a player knows where they are without
 * a minimap. Every map has its own set (`regionsFor`): Causeway a dockyard, Plaza a civic square, Old Town an old quarter, Quarry
 * an industrial pit. `mix` scales how many of a floor mark the district gets (1 is the baseline); `lamp` is the colour of its lights;
 * `stories` are the vignettes (vignettes.ts) it is given, signature scene first.
 */
export type Region = {
  name: string; signs: readonly string[]; lamp: string; tint: readonly [number, number, number, number]; landmark: LandmarkKind; plan: PlanKind;
  spacing: number; mix: Partial<Record<Mark['k'], number>>; stories: readonly VKind[];
};
const R = (name: string, signs: string[], lamp: string, tint: [number, number, number, number], landmark: LandmarkKind, plan: PlanKind, spacing: number, mix: Region['mix'], stories: VKind[]): Region => ({ name, signs, lamp, tint, landmark, plan, spacing, mix, stories });

/** Causeway: the dockyard. Also the default for a map without a table of its own. */
export const REGIONS: readonly Region[] = [
  R('LOADING DOCK', ['DOCK 4', 'BAY 2', 'DOCK 6'], '#cfe6ff', [90, 130, 180, 0.13], 'trailer', 'dock', 1, { pallet: 3, stripe: 2, tire: 1.5, debris: 0.6, leaves: 0.3, puddle: 1.5 }, ['forklift', 'tally', 'cones', 'poster']),
  R('CONTAINER ROW', ['ROW B', 'STACK 3', 'ROW D'], '#ffa04a', [180, 105, 40, 0.12], 'containers', 'containers', 0.9, { debris: 2, grime: 1.6, pallet: 0.8, leaves: 0.2, cable: 0.6 }, ['cat', 'poster', 'drums', 'tally']),
  R('OFFICE', ['LOT C', 'LOT A', 'VISITORS'], '#fff2d8', [210, 200, 160, 0.09], 'office', 'office', 1, { stalls: 1, leaves: 2.2, paper: 2.2, puddle: 1.6, debris: 0.3, pallet: 0.2, tire: 0.3 }, ['dartboard', 'ashbin', 'bike', 'poster']),
  R('MOTOR POOL', ['MOTOR POOL', 'BAY 7', 'FUEL 2'], '#d4eea0', [110, 140, 70, 0.14], 'motor', 'motor', 1, { tire: 3, oil: 3, sandbag: 1.5, pallet: 0.4, leaves: 0.3 }, ['toolchest', 'tires', 'poster', 'camp']),
  R('CROSSING', ['CROSSING', 'HQ'], '#ffe6b8', [220, 190, 120, 0.06], 'dish', 'hq', 0.8, { debris: 0.4, grime: 0.5, pallet: 0.2, tire: 0.4 }, ['flag', 'poster', 'bench', 'poster']),
  R('FUEL DEPOT', ['TANK 3', 'FUEL', 'NO FLAME'], '#ff9560', [170, 75, 40, 0.15], 'tanks', 'fuel', 1, { oil: 3, puddle: 2.2, stripe: 2.6, cable: 1.5, leaves: 0.1, paper: 0.3 }, ['drums', 'barrier', 'poster', 'tally']),
  R('SCRAP YARD', ['PIT 5', 'SCRAP', 'CRUSHER'], '#ff7e3e', [130, 85, 50, 0.16], 'scrap', 'scrap', 1.5, { debris: 3, sandbag: 1, grime: 2, tire: 1, leaves: 0.2, pallet: 0.5, bay: 0.4 }, ['carcube', 'camp', 'tag', 'poster']),
  R('WAREHOUSE', ['WHSE 9', 'DOCK 9', 'AISLE 2'], '#b4c4ff', [90, 100, 170, 0.14], 'warehouse', 'warehouse', 1, { pallet: 2.5, cable: 2, bay: 1.6, leaves: 0.2, oil: 0.5 }, ['charger', 'tally', 'toolchest', 'poster']),
  R('CHECKPOINT', ['GATE 1', 'BARRACKS', 'HALT'], '#c4f0c8', [100, 150, 105, 0.13], 'tents', 'checkpoint', 1.1, { sandbag: 3.2, paper: 1.5, gravel: 3, debris: 0.8, oil: 0.3, pallet: 0.3, bay: 0.5 }, ['booth', 'barrier', 'flag', 'poster']),
];

/** Plaza: a civic square with a bus depot, a market hall, town hall steps and a fountain. */
const PLAZA_REGIONS: readonly Region[] = [
  R('BUS DEPOT', ['BAY 1', 'BUS 12', 'DEPOT'], '#cfe6ff', [90, 130, 180, 0.13], 'busdepot', 'busbays', 1, { stripe: 2, tire: 2, puddle: 1.5, debris: 0.6, leaves: 0.3, bay: 1.5 }, ['bench', 'tally', 'cones', 'poster']),
  R('MARKET HALL', ['HALL', 'STALLS', 'FISH'], '#ffb060', [190, 120, 50, 0.12], 'markethall', 'stallgrid', 0.9, { pallet: 2, debris: 1.5, paper: 2, grime: 1.2, leaves: 0.4 }, ['cat', 'toolchest', 'drums', 'poster']),
  R('TOWN HALL', ['TOWN HALL', 'STEPS', 'CLERK'], '#fff2d8', [215, 205, 170, 0.09], 'townhall', 'civic', 1, { leaves: 2, paper: 2, puddle: 1.5, debris: 0.2, pallet: 0.1, tire: 0.2 }, ['dartboard', 'ashbin', 'bike', 'poster']),
  R('CAR PARK', ['LOT B', 'LEVEL 2', 'PAY HERE'], '#d4eea0', [110, 140, 90, 0.12], 'office', 'office', 1, { stalls: 1, tire: 1.5, oil: 2, puddle: 1.2, leaves: 0.4 }, ['barrier', 'tires', 'poster', 'toolchest']),
  R('FOUNTAIN SQUARE', ['FOUNTAIN', 'SQUARE'], '#ffe6b8', [225, 200, 140, 0.07], 'fountain', 'fountain', 0.8, { puddle: 2, leaves: 1.5, paper: 1, debris: 0.3, grime: 0.4 }, ['flag', 'bench', 'poster', 'bike']),
  R('BANDSTAND', ['BANDSTAND', 'CONCERT', 'LAWN'], '#ffd0a0', [190, 130, 100, 0.12], 'bandstand', 'flowerbeds', 1.1, { leaves: 3, paper: 2, gravel: 1.5, debris: 0.3, pallet: 0.1 }, ['bench', 'flag', 'camp', 'poster']),
  R('DELIVERIES', ['DELIVERIES', 'BAY 3', 'NO PARKING'], '#ff9a50', [150, 100, 60, 0.15], 'trailer', 'dock', 1.2, { pallet: 3, stripe: 2, tire: 1.5, debris: 1, oil: 1.2 }, ['forklift', 'cones', 'tally', 'poster']),
  R('ARCADE', ['ARCADE', 'SHOPS', 'AISLE 2'], '#b4c4ff', [100, 110, 170, 0.13], 'warehouse', 'warehouse', 1, { pallet: 1.5, cable: 2, bay: 1.5, leaves: 0.5 }, ['charger', 'dartboard', 'toolchest', 'poster']),
  R('COFFEE KIOSKS', ['KIOSKS', 'COFFEE', 'QUEUE'], '#c4f0c8', [120, 160, 110, 0.13], 'tents', 'flowerbeds', 1.1, { paper: 2.5, leaves: 2, sandbag: 1, gravel: 1.5, debris: 0.5 }, ['booth', 'barrier', 'flag', 'poster']),
];

/** Old Town: an old quarter with a bakery, a church yard, laundry lines, a cobble square and a well. */
const OLDTOWN_REGIONS: readonly Region[] = [
  R('BAKERY', ['BAKERY', 'FLOUR', 'OPEN 5AM'], '#ffb878', [200, 140, 80, 0.14], 'bakery', 'cobbles', 1, { debris: 0.8, paper: 1.5, sandbag: 0.3, pallet: 0.8, leaves: 0.8, grime: 1.2 }, ['ashbin', 'tally', 'bench', 'poster']),
  R('CHURCH YARD', ['CHURCH', 'YARD', 'QUIET'], '#cfd8ff', [110, 120, 150, 0.14], 'church', 'cobbles', 1.2, { leaves: 3, paper: 0.5, puddle: 2, debris: 0.8, grime: 1.5 }, ['flag', 'bench', 'bike', 'poster']),
  R('MARKET ROW', ['MARKET', 'ROW 3', 'STALLS'], '#ffa04a', [190, 110, 50, 0.13], 'tents', 'stallgrid', 0.9, { pallet: 2, debris: 1.5, paper: 2.5, leaves: 1, tire: 0.5 }, ['cat', 'drums', 'tally', 'poster']),
  R('LAUNDRY ROW', ['LAUNDRY', 'LINES', 'WASH DAY'], '#e8f0b0', [130, 150, 90, 0.12], 'laundry', 'cobbles', 1, { puddle: 2.5, paper: 1.5, leaves: 1.2, debris: 0.6, grime: 1.5 }, ['bike', 'tally', 'camp', 'poster']),
  R('THE WELL', ['THE WELL', 'SQUARE'], '#ffe2b0', [215, 190, 130, 0.08], 'well', 'wellring', 0.8, { puddle: 1.5, leaves: 1.5, debris: 0.3, grime: 0.4 }, ['bench', 'flag', 'ashbin', 'poster']),
  R('BREWERY', ['BREWERY', 'VATS', 'CASKS'], '#ff9a60', [170, 90, 50, 0.15], 'tanks', 'cobbles', 1, { pallet: 2, puddle: 2, oil: 1, grime: 1.5, debris: 0.8 }, ['drums', 'toolchest', 'tally', 'poster']),
  R('THE RUINS', ['RUINS', 'KEEP OUT', 'UNSAFE'], '#ff8040', [120, 90, 70, 0.17], 'scrap', 'scrap', 1.5, { debris: 3.5, grime: 2, sandbag: 0.5, leaves: 1, pallet: 0.4 }, ['carcube', 'camp', 'tally', 'poster']),
  R('STATION', ['STATION', 'PLATFORM 2', 'MIND THE GAP'], '#b4c4ff', [90, 100, 170, 0.14], 'warehouse', 'warehouse', 1, { bay: 1.5, cable: 2, pallet: 1.2, stripe: 2, leaves: 0.5 }, ['charger', 'bench', 'tally', 'poster']),
  R('GATEHOUSE', ['GATE', 'TOLL', 'HALT'], '#c4f0c8', [110, 150, 100, 0.13], 'tents', 'checkpoint', 1.1, { sandbag: 2.5, paper: 1.5, gravel: 2.5, debris: 0.8, bay: 0.4 }, ['booth', 'barrier', 'flag', 'poster']),
];

/** Quarry: an industrial pit with a rock crusher, conveyor belts, a dynamite shack, gravel piles and a site office. */
const QUARRY_REGIONS: readonly Region[] = [
  R('ROCK CRUSHER', ['CRUSHER', 'HOPPER', 'NOISE'], '#ffa860', [160, 110, 70, 0.15], 'crusher', 'crusherpad', 1, { debris: 3, grime: 2, oil: 1.5, tire: 1, leaves: 0.1 }, ['toolchest', 'tires', 'tally', 'poster']),
  R('CONVEYORS', ['BELT 1', 'BELT 2', 'STOP'], '#e0f0ff', [110, 130, 160, 0.13], 'conveyor', 'conveyorline', 0.9, { stripe: 2.5, cable: 2.5, debris: 1.5, grime: 1.5, oil: 1 }, ['charger', 'cones', 'tally', 'poster']),
  R('SITE OFFICE', ['SITE OFFICE', 'VISITORS', 'PPE'], '#fff2d8', [210, 200, 160, 0.09], 'office', 'office', 1, { stalls: 1, leaves: 1.2, paper: 2.5, puddle: 1.5, tire: 0.5, debris: 0.4 }, ['dartboard', 'ashbin', 'bike', 'poster']),
  R('DYNAMITE SHACK', ['DANGER', 'EXPLOSIVES', 'NO FLAME'], '#ff7a50', [170, 70, 50, 0.16], 'dynamite', 'fuel', 1.2, { stripe: 3, sandbag: 3, debris: 1.2, oil: 0.8, leaves: 0.1 }, ['drums', 'barrier', 'poster', 'cat']),
  R('THE PIT', ['THE PIT', 'EDGE', 'HARD HATS'], '#ffe0a8', [180, 150, 100, 0.09], 'gravel', 'pit', 0.8, { debris: 2, gravel: 3, grime: 1, tire: 0.8 }, ['flag', 'poster', 'tires', 'camp']),
  R('GRAVEL PILES', ['AGGREGATE', 'GRAVEL', '20MM'], '#e8c890', [150, 120, 80, 0.15], 'gravel', 'scrap', 1.4, { gravel: 4, debris: 2.5, tire: 1.2, grime: 1.2, sandbag: 0.6 }, ['carcube', 'camp', 'tally', 'poster']),
  R('WEIGHBRIDGE', ['WEIGH', 'LOAD', 'GATE 2'], '#c4f0c8', [100, 150, 105, 0.13], 'trailer', 'dock', 1, { stripe: 2, tire: 2, bay: 1.5, oil: 1.2, pallet: 0.5 }, ['booth', 'barrier', 'poster', 'cones']),
  R('HAUL ROAD', ['HAUL ROAD', 'SLOW', 'TRUCKS'], '#ffa04a', [160, 110, 60, 0.13], 'motor', 'haulroad', 1, { tire: 3, oil: 1.5, stripe: 1.5, debris: 1.5, puddle: 1.5 }, ['tires', 'cones', 'tally', 'poster']),
  R('FUEL & WASH', ['FUEL', 'WASH BAY', 'NO FLAME'], '#ff9560', [170, 80, 50, 0.15], 'tanks', 'fuel', 1, { oil: 3, puddle: 2.5, stripe: 2.4, cable: 1.5, leaves: 0.1 }, ['drums', 'barrier', 'poster', 'tally']),
];

const REGION_SETS: Readonly<Record<string, readonly Region[]>> = { Causeway: REGIONS, Plaza: PLAZA_REGIONS, 'Old Town': OLDTOWN_REGIONS, Quarry: QUARRY_REGIONS };
/** The districts of a map by its display name; a map without a table gets the dockyard's. */
export const regionsFor = (mapName: string): readonly Region[] => REGION_SETS[mapName] ?? REGIONS;
export const regionAt = (x: number, y: number, size: number): number => Math.min(2, Math.max(0, Math.floor((x / size) * 3))) + 3 * Math.min(2, Math.max(0, Math.floor((y / size) * 3)));

export type DecorPlan = {
  name: string; size: number; flavour: 'versus' | 'siege' | 'range';
  fixtures: readonly Fixture[]; marks: readonly Mark[]; mounts: readonly Mount[];
  landmarks: readonly Landmark[];
  /** The map's districts, and the circles floor marks and the floor's own arrows keep clear of (placed marks, stencils, district plans). */
  regions: readonly Region[];
  avoid: readonly { x: number; y: number; r: number }[];
  /** The small hand-set stories and easter eggs (vignettes.ts). */
  vignettes: readonly Vignette[];
  /** Soft floor tints, one per district: the floor's treatment, baked. */
  tints: readonly { x: number; y: number; r: number; rgb: string; a: number }[];
  /** The floor marks' keep-out, exposed so tests can prove nothing sits on a wall, a pad, a zone or a lane. */
  keep: Keepout;
};

/** A wall's front face, mirrored from tilt.ts's FACE (a test holds the two together). */
export const WALL_FACE: Readonly<Record<string, number>> = { concrete: 16, sandstone: 15, planter: 12 };
const faceFor = (m: WallMaterial): number => WALL_FACE[m] ?? 14;
const NORMAL: Record<Side, readonly [number, number]> = { n: [0, -1], s: [0, 1], e: [1, 0], w: [-1, 0] };
const SIDE_ANGLE: Record<Side, number> = { n: -Math.PI / 2, s: Math.PI / 2, e: 0, w: Math.PI };
const SIDES: readonly Side[] = ['n', 's', 'e', 'w'];

/** How many fixtures of each kind a map may carry at most: the practical lights are dressing, not wallpaper. */
export const CAPS: Record<FixtureKind, number> = {
  lamp: 90, work: 24, beacon: 18, exit: 10, tube: 14, window: 18, uplight: 24, fan: 14, steam: 8, flood: 4, alarm: 4, boothlamp: 8, lanepost: 14, scoreboard: 1, lantern: 6,
};

/** The cap for a kind, thinned by the graphics preset's decor knob (a kind with a cap of one or more keeps at least one). */
const fixtureCap = (k: FixtureKind): number => (CAPS[k] > 0 && knobs().decor > 0 ? Math.max(1, scaled(CAPS[k], knobs().decor)) : CAPS[k]);

function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Seeds from the map's name and wall layout, so a changed map reshuffles and an unchanged one never does. */
export function decorSeed(map: Pick<MapDef, 'name' | 'size' | 'walls'>): number {
  let h = 2166136261;
  const eat = (n: number) => { h = Math.imul(h ^ (n & 0xffff), 16777619); h = Math.imul(h ^ ((n >>> 16) & 0xffff), 16777619); };
  for (const c of map.name) eat(c.charCodeAt(0));
  eat(map.size);
  for (const w of map.walls) { eat(w.x); eat(w.y); eat(w.w); eat(w.h); }
  return h >>> 0;
}

function shuffled<T>(list: readonly T[], rand: () => number): T[] {
  const out = [...list];
  for (let i = out.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [out[i], out[j]] = [out[j]!, out[i]!]; }
  return out;
}

const faceOf = (w: MapWall) => faceFor(w.material);
const distToSeg = (px: number, py: number, ax: number, ay: number, bx: number, by: number): number => {
  const dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy;
  const t = l2 === 0 ? 0 : Math.min(1, Math.max(0, ((px - ax) * dx + (py - ay) * dy) / l2));
  return Math.hypot(px - (ax + dx * t), py - (ay + dy * t));
};

/** Everything a floor mark must stay off: the map's rim, walls with their front faces, pads, zones, the core, props and the worn lanes between them. */
export type Keepout = {
  /** True when a mark of radius `r` at (x, y) would touch a wall, the rim, a pad, a zone, a prop or a lane. */
  blocked(x: number, y: number, r: number): boolean;
  /** Only walls and the rim: for things that may sit on a lane or pad (spawn uplights, a stripe at a choke) but never inside a wall. */
  inWall(x: number, y: number, r: number): boolean;
  readonly lanes: readonly { ax: number; ay: number; bx: number; by: number }[];
  readonly pads: readonly Rect[];
  readonly circles: readonly { x: number; y: number; r: number }[];
};

const RIM = 70;
const LANE_HALF = 100;

function padsOf(map: MapDef): Rect[] {
  const seen = new Set<string>();
  const out: Rect[] = [];
  if (map.range) return out;
  for (const r of [...map.spawns.red, ...map.spawns.blue, ...map.spawns.ffa]) {
    const key = `${r.x},${r.y},${r.w},${r.h}`;
    if (!seen.has(key)) { seen.add(key); out.push(r); }
  }
  return out;
}

/** The worn routes floor.ts lays between pads, zones and the core; the bend is chosen there, so both elbows are kept clear. */
function lanesOf(map: MapDef, pads: readonly Rect[]): { ax: number; ay: number; bx: number; by: number }[] {
  const nodes = [...map.zones, ...(map.siege ? [map.siege.core] : [])];
  const mid = { x: map.size / 2, y: map.size / 2 };
  const hubs = nodes.length ? nodes : [mid];
  const out: { ax: number; ay: number; bx: number; by: number }[] = [];
  const elbow = (a: { x: number; y: number }, b: { x: number; y: number }) => {
    out.push({ ax: a.x, ay: a.y, bx: b.x, by: a.y }, { ax: b.x, ay: a.y, bx: b.x, by: b.y }, { ax: a.x, ay: a.y, bx: a.x, by: b.y }, { ax: a.x, ay: b.y, bx: b.x, by: b.y });
  };
  for (const p of pads) {
    const c = { x: p.x + p.w / 2, y: p.y + p.h / 2 };
    let best = hubs[0]!, bd = Infinity;
    for (const h of hubs) { const d = Math.hypot(h.x - c.x, h.y - c.y); if (d < bd) { bd = d; best = h; } }
    elbow(c, best);
  }
  for (let i = 0; i < nodes.length; i++) for (let j = i + 1; j < nodes.length; j++) elbow(nodes[i]!, nodes[j]!);
  for (const n of nodes) elbow(n, mid);
  return out;
}

export function keepoutOf(map: MapDef): Keepout {
  const pads = padsOf(map);
  const lanes = map.range ? [] : lanesOf(map, pads);
  const circles: { x: number; y: number; r: number }[] = [];
  for (const z of map.zones) circles.push({ x: z.x, y: z.y, r: 290 });
  if (map.siege) circles.push({ x: map.siege.core.x, y: map.siege.core.y, r: 230 });
  for (const c of map.crates) circles.push({ x: c.x, y: c.y, r: 52 });
  for (const b of map.barrels) circles.push({ x: b.x, y: b.y, r: 52 });
  for (const q of map.props) circles.push({ x: q.x, y: q.y, r: 52 });
  // The range keeps every lane quiet: its targets, and the floor paint between the firing line and the far marks.
  if (map.range) {
    const lay = map.range;
    for (const t of lay.targets) circles.push({ x: t.x, y: t.y, r: 130 });
  }
  const walls = map.walls;
  const inWall = (x: number, y: number, r: number): boolean => {
    if (x < RIM + r || y < RIM + r || x > map.size - RIM - r || y > map.size - RIM - r) return true;
    for (const w of walls) {
      const f = faceFor(w.material);
      if (x > w.x - r && x < w.x + w.w + r && y > w.y - r && y < w.y + w.h + f + r) return true;
    }
    return false;
  };
  const rangeLanes = map.range?.lanes;
  const blocked = (x: number, y: number, r: number): boolean => {
    if (inWall(x, y, r)) return true;
    for (const p of pads) if (x > p.x - 70 - r && x < p.x + p.w + 70 + r && y > p.y - 70 - r && y < p.y + p.h + 70 + r) return true;
    for (const c of circles) if (Math.hypot(x - c.x, y - c.y) < c.r + r) return true;
    for (const l of lanes) if (distToSeg(x, y, l.ax, l.ay, l.bx, l.by) < LANE_HALF + r) return true;
    // On the range every lane is a lane: only the strip beside a wall is free, and only walls place marks.
    if (rangeLanes && map.range && x > map.range.line - 60) {
      for (const l of rangeLanes) if (y > l.y0 + 12 + r && y < l.y1 - 12 - r) return !nearWall(x, y, walls, 70);
    }
    return false;
  };
  return { blocked, inWall, lanes, pads, circles };
}

function nearWall(x: number, y: number, walls: readonly MapWall[], d: number): boolean {
  for (const w of walls) if (x > w.x - d && x < w.x + w.w + d && y > w.y - d && y < w.y + w.h + faceOf(w) + d) return true;
  return false;
}

type Spot = { wi: number; wall: MapWall; side: Side; px: number; py: number; len: number; t: number };

/** Candidate places along every wall side, `step` apart, kept `inset` from the corners. */
function spotsOf(walls: readonly MapWall[], step: number, inset: number, minLen: number): Spot[] {
  const out: Spot[] = [];
  walls.forEach((wall, wi) => {
    for (const side of SIDES) {
      const horiz = side === 'n' || side === 's';
      const len = horiz ? wall.w : wall.h;
      if (len < minLen) continue;
      for (let t = inset + (len - inset * 2) % step / 2; t <= len - inset + 0.001; t += step) {
        const px = horiz ? wall.x + t : side === 'e' ? wall.x + wall.w : wall.x;
        const py = !horiz ? wall.y + t : side === 's' ? wall.y + wall.h : wall.y;
        out.push({ wi, wall, side, px, py, len, t });
      }
    }
  });
  return out;
}

/** The floor point `off` px out from a spot, past the wall's front face on a south side. */
function outward(s: Spot, off: number): { x: number; y: number } {
  const [nx, ny] = NORMAL[s.side];
  const extra = s.side === 's' ? faceOf(s.wall) : 0;
  return { x: s.px + nx * (off + extra), y: s.py + ny * (off + extra) };
}

/** How open the ground in front of a spot is: how many of three probes (near, mid, far) land clear of walls. */
function openness(s: Spot, walls: readonly MapWall[], size: number): number {
  let n = 0;
  for (const d of [34, 80, 130]) {
    const p = outward(s, d);
    if (p.x < RIM || p.y < RIM || p.x > size - RIM || p.y > size - RIM) continue;
    if (!nearWall(p.x, p.y, walls, 14)) n++;
  }
  return n;
}

type Gap = { axis: 'x' | 'y'; a: MapWall; b: MapWall; mid: number; lo: number; hi: number; width: number };

/** Chokepoints: two walls facing each other across a gap a squad can just fit through, with nothing between them. */
function gapsOf(walls: readonly MapWall[]): Gap[] {
  const out: Gap[] = [];
  const empty = (r: Rect) => !walls.some((w) => w.x < r.x + r.w && w.x + w.w > r.x && w.y < r.y + r.h && w.y + w.h > r.y);
  for (let i = 0; i < walls.length; i++) {
    const a = walls[i]!;
    for (let j = 0; j < walls.length; j++) {
      if (i === j) continue;
      const b = walls[j]!;
      const gx = b.x - (a.x + a.w);
      if (gx >= 90 && gx <= 220) {
        const lo = Math.max(a.y, b.y), hi = Math.min(a.y + a.h, b.y + b.h);
        if (hi - lo >= 100 && empty({ x: a.x + a.w, y: lo, w: gx, h: hi - lo })) out.push({ axis: 'x', a, b, mid: (lo + hi) / 2, lo, hi, width: gx });
      }
      const gy = b.y - (a.y + a.h);
      if (gy >= 90 && gy <= 220) {
        const lo = Math.max(a.x, b.x), hi = Math.min(a.x + a.w, b.x + b.w);
        if (hi - lo >= 100 && empty({ x: lo, y: a.y + a.h, w: hi - lo, h: gy })) out.push({ axis: 'y', a, b, mid: (lo + hi) / 2, lo, hi, width: gy });
      }
    }
  }
  return out;
}

const inRectPad = (x: number, y: number, r: Rect, pad: number) => x > r.x - pad && x < r.x + r.w + pad && y > r.y - pad && y < r.y + r.h + pad;
const dist = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.hypot(a.x - b.x, a.y - b.y);

/** Whether a map takes this plan: a themed map (src/client/themes) dresses itself; this is the plain yard, the siege compound and the range. */
export const wantsDecor = (map: Pick<MapDef, 'theme'>): boolean => !map.theme;

export function planDecor(map: MapDef): DecorPlan {
  const rand = rng(decorSeed(map));
  const regions = regionsFor(map.name);
  const keep = keepoutOf(map);
  const walls = map.walls;
  const fixtures: Fixture[] = [];
  const marks: Mark[] = [];
  const mounts: Mount[] = [];
  const flavour: DecorPlan['flavour'] = map.range ? 'range' : map.siege ? 'siege' : 'versus';

  const count = (k: FixtureKind) => fixtures.filter((f) => f.kind === k).length;
  /** A fixture stays `d` from its own kind and 90 px from any other, so two lights never share a spot. */
  const apart = (x: number, y: number, d: number, kind?: FixtureKind) => fixtures.every((f) => Math.hypot(f.x - x, f.y - y) >= (f.kind === kind ? d : 90));
  const add = (f: Omit<Fixture, 'id' | 'region' | 'lamp'>) => { fixtures.push({ ...f, id: fixtures.length, region: flavour === 'versus' ? regionAt(f.x, f.y, map.size) : -1, lamp: flavour === 'versus' ? regions[regionAt(f.x, f.y, map.size)]!.lamp : '' }); };

  const wallFixture = (kind: FixtureKind, s: Spot, lightOff: number, extra: Partial<Fixture> = {}) => {
    const [nx, ny] = NORMAL[s.side];
    const face = s.side === 's' ? faceOf(s.wall) : 0;
    const l = outward(s, lightOff);
    add({
      kind, x: s.px - nx * 7, y: s.py - ny * 7, lx: l.x, ly: l.y, angle: SIDE_ANGLE[s.side], phase: rand(), side: s.side, face, ...extra,
    });
  };

  if (flavour === 'range') return planRange(map, keep, rand);

  const all = spotsOf(walls, 100, 22, 60).filter((s) => s.wall.material !== 'planter');
  const open = all.filter((s) => openness(s, walls, map.size) >= 2);
  const versus = flavour === 'versus';

  // ---- Landmarks: each district's set-piece rides on its biggest wall block, so it is solid, not a fake obstacle.
  const landmarks: Landmark[] = [];
  const landWalls = new Set<number>();
  if (versus) {
    for (const [ri, reg] of regions.entries()) {
      let best = -1, score = 0;
      walls.forEach((w, wi) => {
        if (w.material === 'planter' || regionAt(w.x + w.w / 2, w.y + w.h / 2, map.size) !== ri || landWalls.has(wi)) return;
        const sc = Math.min(w.w, w.h) >= 90 ? w.w * w.h : (w.w * w.h) / 10;
        if (sc > score && Math.min(w.w, w.h) >= 50 && Math.max(w.w, w.h) >= 100) { score = sc; best = wi; }
      });
      if (best >= 0) { const w = walls[best]!; landWalls.add(best); landmarks.push({ kind: reg.landmark, x: w.x, y: w.y, w: w.w, h: w.h, region: ri, wall: best, label: reg.name }); }
    }
  }
  const tints = versus ? regions.map((reg, ri) => ({ x: ((ri % 3) + 0.5) * (map.size / 3), y: (Math.floor(ri / 3) + 0.5) * (map.size / 3), r: map.size / 3 * 0.8, rgb: `${reg.tint[0]}, ${reg.tint[1]}, ${reg.tint[2]}`, a: Math.min(0.3, reg.tint[3] * 1.8) })) : [];

  // ---- Chokepoints: a hazard beacon on the wall end, one stripe on each wall foot (the stripes are floor marks, below).
  const gaps = shuffled(gapsOf(walls), rand);
  for (const g of gaps) {
    if (count('beacon') >= 12) break;
    const wall = g.axis === 'x' ? g.a : g.b;
    const side: Side = g.axis === 'x' ? (wall === g.a ? 'e' : 'w') : (wall === g.a ? 's' : 'n');
    const horiz = side === 'n' || side === 's';
    const px = horiz ? g.mid : side === 'e' ? wall.x + wall.w : wall.x;
    const py = !horiz ? g.mid : side === 's' ? wall.y + wall.h : wall.y;
    const s: Spot = { wi: walls.indexOf(wall), wall, side, px, py, len: 0, t: 0 };
    if (!apart(px, py, 900, 'beacon')) continue;
    wallFixture('beacon', s, 10);
  }

  // ---- Fluorescent tubes, windows, exit signs and vent fans: all on south faces, where a face shows.
  const south = open.filter((s) => s.side === 's' && s.wall.material === 'concrete' && s.wall.w >= 100 && s.t > 30 && s.t < s.len - 30);
  for (const s of shuffled(south, rand)) {
    if (count('window') >= fixtureCap('window')) break;
    const below = outward(s, 40);
    if (!apart(s.px, s.py, 700, 'window') || keep.inWall(below.x, below.y, 16)) continue;
    wallFixture('window', s, 6, { w: 30, h: 10, y: s.py - 1 });
  }
  for (const s of shuffled(south, rand)) {
    if (count('tube') >= fixtureCap('tube')) break;
    if (!apart(s.px, s.py, 700, 'tube')) continue;
    wallFixture('tube', s, 6, { w: 36, h: 5 });
  }
  const pads = keep.pads;
  for (const [pi, p] of pads.entries()) {
    const c = { x: p.x + p.w / 2, y: p.y + p.h / 2 };
    const near = south.filter((s) => dist({ x: s.px, y: s.py }, c) < 650 && apart(s.px, s.py, 220));
    near.sort((a, b) => dist({ x: a.px, y: a.py }, c) - dist({ x: b.px, y: b.py }, c));
    const pick = near[Math.floor(rand() * Math.min(2, near.length))];
    if (pick && count('exit') < fixtureCap('exit') && pi % 2 === 0) wallFixture('exit', pick, 4, { w: 28, h: 11 });
  }
  const fanSpots = open.filter((s) => !landWalls.has(s.wi) && s.wall.material === 'concrete' && (s.side === 'n' || s.side === 's') && s.t > 40 && s.t < s.len - 40);
  for (const s of shuffled(fanSpots, rand)) {
    if (count('fan') >= fixtureCap('fan')) break;
    if (!apart(s.px, s.wall.y + s.wall.h / 2, 800, 'fan')) continue;
    // A fan sits mid-top of its wall, not on the edge, so it never reaches over the floor.
    add({ kind: 'fan', x: s.px, y: s.wall.y + s.wall.h / 2, lx: s.px, ly: s.wall.y + s.wall.h / 2, angle: 0, phase: rand(), w: Math.min(26, s.wall.h - 14), h: Math.min(26, s.wall.h - 14) });
  }

  // ---- Floor work lights: a tripod lamp at a wall foot, aimed out into the open. Hugs the wall so it is never in a lane.
  const feet = open.filter((s) => openness(s, walls, map.size) >= 3 && (s.side === 'n' || s.side === 's'));
  for (const s of shuffled(feet, rand)) {
    if (count('work') >= fixtureCap('work')) break;
    const p = outward(s, 18);
    if (!apart(p.x, p.y, 900, 'work') || keep.blocked(p.x, p.y, 10)) continue;
    add({ kind: 'work', x: p.x, y: p.y, lx: p.x + NORMAL[s.side][0] * 16, ly: p.y + NORMAL[s.side][1] * 16, angle: SIDE_ANGLE[s.side], phase: rand(), side: s.side });
  }

  // ---- Wall lamps: caged bulbs on the lane-facing edge of walls, spaced so the yard reads as pools of light with dark between.
  const lampMin = flavour === 'siege' ? 380 : 560;
  for (const s of shuffled(open, rand)) {
    if (count('lamp') >= fixtureCap('lamp')) break;
    const p = outward(s, 20);
    if (!apart(s.px, s.py, lampMin * (versus ? regions[regionAt(s.px, s.py, map.size)]!.spacing : 1), 'lamp')) continue;
    if (keep.inWall(p.x, p.y, 14)) continue;
    wallFixture('lamp', s, 12);
  }

  // A set-piece wall carries one amber beacon on a corner, so each district has a light you can steer by.
  for (const lm of landmarks) {
    if (!['trailer', 'tanks', 'motor', 'dish', 'scrap'].includes(lm.kind)) continue;
    const cx = lm.x + lm.w - 12, cy = lm.y + 12;
    add({ kind: 'beacon', x: cx, y: cy, lx: cx, ly: cy - 10, angle: -Math.PI / 2, phase: rand(), side: 'n', face: 0 });
  }

  // ---- Spawn pad uplights: two low lamps on opposite corners of every pad, just outside its hazard band.
  for (const [i, p] of pads.entries()) {
    const team = map.spawns.red.includes(p) ? 'red' : map.spawns.blue.includes(p) ? 'blue' : null;
    const corners: [number, number][] = i % 2 === 0
      ? [[p.x - 34, p.y - 34], [p.x + p.w + 34, p.y + p.h + 34]]
      : [[p.x + p.w + 34, p.y - 34], [p.x - 34, p.y + p.h + 34]];
    for (const [x, y] of corners) {
      if (count('uplight') >= fixtureCap('uplight') || keep.inWall(x, y, 14)) continue;
      add({ kind: 'uplight', x, y, lx: x, ly: y, angle: Math.atan2(y - (p.y + p.h / 2), x - (p.x + p.w / 2)), phase: rand(), team });
    }
  }

  // ---- Steam vents: a grate and a slow tiny plume, tucked at a wall foot in the quietest corners.
  const quiet = shuffled(open.filter((s) => s.side === 'n' || s.side === 's'), rand);
  for (const s of quiet) {
    if (count('steam') >= fixtureCap('steam')) break;
    const p = outward(s, 26);
    if (!apart(p.x, p.y, 1200, 'steam') || keep.blocked(p.x, p.y, 20)) continue;
    add({ kind: 'steam', x: p.x, y: p.y, lx: p.x, ly: p.y, angle: 0, phase: rand() });
    marks.push({ k: 'grate', x: p.x, y: p.y, rot: 0 });
  }

  // ---- Siege: floodlights on the walls nearest the core, red alarms on the next nearest, one of each per quarter.
  if (flavour === 'siege' && map.siege) {
    const core = map.siege.core;
    const centreOf = (w: MapWall) => ({ x: w.x + w.w / 2, y: w.y + w.h / 2 });
    const byDist = [...walls].filter((w) => w.material !== 'planter').sort((a, b) => dist(centreOf(a), core) - dist(centreOf(b), core));
    const quarter = (w: MapWall) => (centreOf(w).x < core.x ? 0 : 1) + (centreOf(w).y < core.y ? 0 : 2);
    const used = new Set<number>();
    for (const kind of ['flood', 'alarm'] as const) {
      const taken = new Set<number>();
      for (const w of byDist) {
        const q = quarter(w);
        if (taken.has(q) || used.has(walls.indexOf(w))) continue;
        taken.add(q);
        used.add(walls.indexOf(w));
        const c = centreOf(w);
        const a = Math.atan2(core.y - c.y, core.x - c.x);
        add({ kind, x: c.x, y: c.y, lx: c.x + Math.cos(a) * 18, ly: c.y + Math.sin(a) * 18, angle: a, phase: rand() });
      }
    }
  }

  // ---- Wall mounts: pipes along wall tops, and little signage plates on south faces.
  const pipeWalls = shuffled(walls.map((w, wi) => ({ w, wi })).filter(({ w, wi }) => !landWalls.has(wi) && w.material === 'concrete' && Math.max(w.w, w.h) >= 150), rand);
  const pipeCount = Math.min(pipeWalls.length, Math.ceil(walls.length * 0.18) + 4);
  for (const { w } of pipeWalls.slice(0, pipeCount)) {
    if (w.w >= w.h) { const y = w.y + (rand() < 0.5 ? 10 : w.h - 10); mounts.push({ k: 'pipe', x0: w.x + 8, y0: y, x1: w.x + w.w - 8, y1: y }); }
    else { const x = w.x + (rand() < 0.5 ? 10 : w.w - 10); mounts.push({ k: 'pipe', x0: x, y0: w.y + 8, x1: x, y1: w.y + w.h - 8 }); }
  }
  const LABELS = 'AbCEFHLPUd';
  const plateSpots = shuffled(south.filter((s) => !fixtures.some((f) => Math.hypot(f.x - s.px, f.y - s.py) < 70)), rand);
  const plateTaken: { x: number; y: number }[] = [];
  for (const s of plateSpots) {
    if (plateTaken.length >= Math.min(26, Math.ceil(walls.length * 0.2))) break;
    if (plateTaken.some((p) => Math.hypot(p.x - s.px, p.y - s.py) < 420)) continue;
    plateTaken.push({ x: s.px, y: s.py });
    const signs = versus ? regions[regionAt(s.px, s.py, map.size)]!.signs : ['A1'];
    mounts.push({ k: 'plate', x: s.px, y: s.py, text: signs[Math.floor(rand() * signs.length)]!, wall: s.wi, face: faceOf(s.wall) });
  }

  /** Every placed floor mark's circle (its drawn extent), so no two marks, stencils or district plans overlap. */
  const placed: { x: number; y: number; r: number }[] = [];
  // ---- District ground plans: one big painted plan per district, on the clearest open floor nearest its middle. Flat paint, so it
  // reads as the district's character even on a map with few walls, and never as an obstacle.
  if (versus) {
    const third = map.size / 3;
    for (const ri of regions.keys()) {
      const cx = ((ri % 3) + 0.5) * third, cy = (Math.floor(ri / 3) + 0.5) * third;
      type Pick = { x: number; y: number; scale: number; rot: number; d: number };
      let best = null as Pick | null;
      for (const scale of [1, 0.78, 0.6]) {
        const R = 210 * scale;
        for (let y = Math.floor(ri / 3) * third + 120; y < (Math.floor(ri / 3) + 1) * third - 120; y += 60) {
          for (let x = (ri % 3) * third + 120; x < ((ri % 3) + 1) * third - 120; x += 60) {
            if (keep.blocked(x, y, R)) continue;
            const d = Math.hypot(x - cx, y - cy);
            if (!best || d < best.d) best = { x, y, scale, rot: 0, d };
          }
        }
        if (best) break;
      }
      if (best) { marks.push({ k: 'district', x: best.x, y: best.y, rot: best.rot, scale: best.scale, region: ri, plan: regions[ri]!.plan, label: regions[ri]!.signs[0]! }); placed.push({ x: best.x, y: best.y, r: 235 * best.scale }); }
    }
  }

  // ---- Floor marks. Every one hugs a wall and sits outside the keep-out, so the lanes and pads stay quiet.
  const hugs = shuffled(spotsOf(walls, 70, 20, 60), rand);
  let curRegion = -1;
  /** A baseline count scaled to the district being dressed (a whole map's worth spread over nine districts, tilted by its mix). */
  const lim = (base: number, key: Mark['k']) => (curRegion < 0 ? base : Math.max(key === 'zone' ? 1 : 0, Math.round((base / 4.5) * (regions[curRegion]!.mix[key] ?? (key === 'stalls' || key === 'gravel' ? 0 : 1)))));
  const mark = (limit: number, minGap: number, off: [number, number], r: number, make: (x: number, y: number, s: Spot) => Mark | null, filter: (s: Spot) => boolean = () => true, extent = r) => {
    let n = 0;
    for (const s of hugs) {
      if (n >= limit) break;
      if (curRegion >= 0 && regionAt(s.px, s.py, map.size) !== curRegion) continue;
      if (!filter(s)) continue;
      const o = off[0] + rand() * (off[1] - off[0]);
      const p = outward(s, o + r);
      if (keep.blocked(p.x, p.y, r) || placed.some((q) => Math.hypot(q.x - p.x, q.y - p.y) < q.r + extent + 14)) continue;
      const m = make(p.x, p.y, s);
      if (!m) continue;
      // Same-kind marks keep the full gap: two district names never sit side by side.
      if (marks.some((o) => o.k === m.k && 'x' in o && Math.hypot(o.x - p.x, o.y - p.y) < minGap)) continue;
      marks.push(m);
      placed.push({ x: p.x, y: p.y, r: extent });
      n++;
    }
  };
  const alongRot = (s: Spot) => (s.side === 'n' || s.side === 's' ? 0 : Math.PI / 2);
  const solid = (s: Spot) => s.wall.material !== 'planter';
  const lampSpots = (s: Spot) => solid(s) && openness(s, walls, map.size) >= 1;

  // ---- Lane arrows. Painted only where a real aisle runs between two walls, always as a run of two or three along its axis, all
  // pointing the same way: toward the nearest capture zone, core or the middle of the map. Never within 150 px of a wall they face,
  // never near the map's edge, and never where the aisle is too short to hold two. A map or district with no such aisle gets none.
  {
    const hubs = [...map.zones, ...(map.siege ? [map.siege.core] : [])];
    if (!hubs.length) hubs.push({ x: map.size / 2, y: map.size / 2 });
    const STEP = 82, LEN = 74;
    const groups: { x: number; y: number }[] = [];
    for (const g of gaps) {
      if (marks.filter((m) => m.k === 'arrows').length >= 14) break;
      const along = g.axis === 'x' ? 'y' : 'x';
      const fa = g.axis === 'y' ? faceOf(g.a) : 0;
      const free = g.width - fa;
      if (free < 80) continue;
      const cx = g.axis === 'x' ? g.a.x + g.a.w + free / 2 : (g.lo + g.hi) / 2;
      const cy = g.axis === 'x' ? (g.lo + g.hi) / 2 : g.a.y + g.a.h + fa + free / 2;
      const room = g.hi - g.lo;
      const n = room >= 2 * STEP + LEN + 70 ? 3 : room >= STEP + LEN + 70 ? 2 : 0;
      if (!n) continue;
      let hub = hubs[0]!, bd = Infinity;
      for (const h of hubs) { const d = Math.hypot(h.x - cx, h.y - cy); if (d < bd) { bd = d; hub = h; } }
      const sign = (along === 'y' ? hub.y - cy : hub.x - cx) >= 0 ? 1 : -1;
      const rot = along === 'y' ? (sign > 0 ? Math.PI / 2 : -Math.PI / 2) : sign > 0 ? 0 : Math.PI;
      if (cx < 250 || cy < 250 || cx > map.size - 250 || cy > map.size - 250) continue;
      const half = ((n - 1) * STEP + LEN) / 2;
      // Clear ahead: nothing solid for 150 px beyond the lead arrow.
      let clear = true;
      for (let d = half; d <= half + 150 && clear; d += 25) if (keep.inWall(cx + Math.cos(rot) * d, cy + Math.sin(rot) * d, 14)) clear = false;
      if (!clear) continue;
      if (keep.pads.some((p) => inRectPad(cx, cy, p, 90)) || keep.circles.some((c) => Math.hypot(c.x - cx, c.y - cy) < c.r)) continue;
      if (groups.some((q) => Math.hypot(q.x - cx, q.y - cy) < 520) || placed.some((q) => Math.hypot(q.x - cx, q.y - cy) < q.r + half + 12)) continue;
      groups.push({ x: cx, y: cy });
      placed.push({ x: cx, y: cy, r: half + 6 });
      const x0 = cx - Math.cos(rot) * ((n - 1) * STEP) / 2, y0 = cy - Math.sin(rot) * ((n - 1) * STEP) / 2;
      marks.push({ k: 'arrows', x: x0, y: y0, rot, n, step: STEP });
    }
  }

  // ---- Drains and manholes: few, and only along a kerb (a wall's foot), well apart.
  {
    let drains = 0;
    for (const s of hugs) {
      if (drains >= 10) break;
      if (s.wall.material === 'planter' || openness(s, walls, map.size) < 2) continue;
      const p = outward(s, 20);
      if (keep.blocked(p.x, p.y, 16) || placed.some((q) => Math.hypot(q.x - p.x, q.y - p.y) < q.r + 24)) continue;
      if (marks.some((m) => (m.k === 'grate' || m.k === 'manhole') && Math.hypot(m.x - p.x, m.y - p.y) < 650)) continue;
      marks.push(drains % 3 === 2 ? { k: 'manhole', x: p.x, y: p.y } : { k: 'grate', x: p.x, y: p.y, rot: 0 });
      placed.push({ x: p.x, y: p.y, r: 18 });
      drains++;
    }
  }

  for (const cr of versus ? regions.keys() : [-1]) {
    curRegion = cr;
    let zoneSeen = 0;
    // A row of stalls or a stencilled word is long: both of its ends must be clear too, not just its middle.
    const longClear = (x: number, y: number, rot: number, half: number) => [-half, half].every((o) => !keep.blocked(x + Math.cos(rot) * o, y + Math.sin(rot) * o, 24));
    mark(lim(9, 'stalls'), 500, [6, 14], 36, (x, y, s) => (longClear(x, y, alongRot(s), 70) ? { k: 'stalls', x, y, rot: alongRot(s), n: 5 } : null), (s) => lampSpots(s) && s.len >= 160, 78);
    mark(lim(9, 'zone'), 700, [8, 20], 36, (x, y, s) => (curRegion >= 0 && longClear(x, y, alongRot(s), 110) ? { k: 'zone', x, y, rot: alongRot(s), text: regions[curRegion]!.signs[zoneSeen++ % regions[curRegion]!.signs.length]! } : null), (s) => lampSpots(s) && s.len >= 120, 118);
    mark(lim(18, 'bay'), 260, [4, 10], 34, (x, y, s) => ({ k: 'bay', x, y, rot: alongRot(s), text: `${LABELS[Math.floor(rand() * LABELS.length)]}${1 + Math.floor(rand() * 9)}` }), (s) => lampSpots(s) && s.wall.material === 'concrete' && s.len >= 140, 48);
    mark(lim(24, 'grime'), 180, [2, 6], 8, (x, y, s) => ({ k: 'grime', x, y, w: s.side === 'n' || s.side === 's' ? 70 + rand() * 60 : 14, h: s.side === 'n' || s.side === 's' ? 14 : 70 + rand() * 60 }), lampSpots);
    mark(lim(16, 'tire'), 300, [6, 14], 12, (x, y, s) => ({ k: 'tire', x, y, rot: alongRot(s) + (rand() - 0.5) * 0.3, len: 70 + rand() * 50 }), (s) => lampSpots(s) && s.len >= 100);
    mark(lim(14, 'puddle'), 300, [6, 26], 22, (x, y) => ({ k: 'puddle', x, y, r: 16 + rand() * 18 }), lampSpots);
    mark(lim(10, 'oil'), 400, [6, 20], 18, (x, y) => ({ k: 'oil', x, y, r: 14 + rand() * 14 }), lampSpots);
    mark(lim(34, 'paper'), 120, [4, 20], 8, (x, y) => (rand() < 0.5 ? { k: 'paper', x, y, rot: rand() * 6.28 } : { k: 'leaves', x, y, rot: rand() * 6.28 }), solid);
    mark(lim(14, 'sandbag'), 380, [4, 12], 18, (x, y, s) => ({ k: 'sandbag', x, y, rot: alongRot(s) + (rand() - 0.5) * 0.4 }), (s) => s.wall.material === 'sandstone');
    mark(lim(14, 'pallet'), 420, [6, 14], 24, (x, y, s) => ({ k: 'pallet', x, y, rot: alongRot(s) + (rand() < 0.2 ? Math.PI / 2 : 0) + (rand() - 0.5) * 0.2 }), (s) => lampSpots(s) && s.wall.material !== 'sandstone');
    mark(lim(28, 'debris'), 160, [4, 16], 12, (x, y) => ({ k: 'debris', x, y, rot: rand() * 6.28 }), solid);

    mark(lim(9, 'gravel'), 300, [4, 20], 34, (x, y) => ({ k: 'gravel', x, y, r: 40 + rand() * 30 }), lampSpots);
  }

  // Cable runs: a conduit line along the floor beside a wall's foot, with a junction box or two.
  const cableSpots = shuffled(spotsOf(walls, 400, 40, 160).filter((s) => s.wall.material === 'concrete'), rand);
  let cables = 0;
  for (const s of cableSpots) {
    if (cables >= 22) break;
    const horiz = s.side === 'n' || s.side === 's';
    const len = Math.min(s.len - 20, 120 + rand() * 160);
    const a = outward(s, 9);
    const half = len / 2;
    const p0: Pt = horiz ? [a.x - half, a.y] : [a.x, a.y - half], p1: Pt = horiz ? [a.x + half, a.y] : [a.x, a.y + half];
    const mid: Pt = [a.x, a.y];
    const kink: Pt = horiz ? [a.x + half * 0.3, a.y + (s.side === 's' ? 7 : -7)] : [a.x + (s.side === 'e' ? 7 : -7), a.y + half * 0.3];
    if ([p0, p1, mid, kink].some((p) => keep.blocked(p[0], p[1], 6))) continue;
    const pts: Pt[] = rand() < 0.5 ? [p0, p1] : [p0, kink, p1];
    marks.push({ k: 'cable', pts, boxes: rand() < 0.5 ? [mid] : [p0, p1] });
    cables++;
  }

  // Hazard stripes on the foot of each chokepoint wall, two short bands facing each other across the gap.
  let stripes = 0;
  for (const g of gaps) {
    if (stripes >= 10) break;
    const len = Math.min(120, g.hi - g.lo - 10), c = (g.lo + g.hi) / 2;
    if (g.axis === 'x') {
      const r1: Rect = { x: g.a.x + g.a.w + 2, y: c - len / 2, w: 10, h: len }, r2: Rect = { x: g.b.x - 12, y: c - len / 2, w: 10, h: len };
      if ([r1, r2].some((r) => keep.inWall(r.x + r.w / 2, r.y + r.h / 2, 4))) continue;
      marks.push({ k: 'stripe', ...r1 }, { k: 'stripe', ...r2 });
    } else {
      const fa = faceOf(g.a);
      const r1: Rect = { x: c - len / 2, y: g.a.y + g.a.h + fa + 2, w: len, h: 10 }, r2: Rect = { x: c - len / 2, y: g.b.y - 12, w: len, h: 10 };
      if ([r1, r2].some((r) => keep.inWall(r.x + r.w / 2, r.y + r.h / 2, 4))) continue;
      marks.push({ k: 'stripe', ...r1 }, { k: 'stripe', ...r2 });
    }
    stripes++;
  }

  // ---- Vignettes: the small stories, placed last so they steer round everything else.
  let vignettes: Vignette[] = [];
  if (versus) {
    const story = placeVignettes({
      map, keep, rand, regions, regionAt, spots: hugs, outward, openness: (sp) => openness(sp, walls, map.size), face: faceOf, landWalls, landmarks, fixtures,
    });
    vignettes = story.vignettes;
    for (const l of story.lanterns) add({ kind: 'lantern', x: l.x, y: l.y, lx: l.x, ly: l.y, angle: 0, phase: rand() });
  }

  return { name: map.name, size: map.size, flavour, fixtures, marks, mounts, landmarks, vignettes, tints, regions, avoid: placed, keep };
}

/** The range: booth lamps on the dividers, a post lamp on each lane boundary, a scoreboard on the back wall, lane plates on the dividers. */
function planRange(map: MapDef, keep: Keepout, rand: () => number): DecorPlan {
  const lay = map.range!;
  const fixtures: Fixture[] = [];
  const marks: Mark[] = [];
  const mounts: Mount[] = [];
  const add = (f: Omit<Fixture, 'id' | 'region' | 'lamp'>) => { fixtures.push({ ...f, id: fixtures.length, region: -1, lamp: '' }); };
  const walls = map.walls;
  const dividers = walls.filter((w) => w.material === 'sandstone' && w.w === 200 && w.h === 50);
  for (const w of dividers) {
    const cx = w.x + w.w - 30, cy = w.y + w.h / 2;
    add({ kind: 'boothlamp', x: cx, y: cy, lx: cx + 4, ly: cy, angle: 0, phase: rand(), side: 'e' });
  }
  // The lane plates hang on each divider's front face, naming the lane below it.
  walls.forEach((w, wi) => {
    if (!dividers.includes(w)) return;
    const lane = lay.lanes.findIndex((l) => Math.abs(l.y0 - (w.y + w.h / 2)) < 30);
    if (lane >= 0) mounts.push({ k: 'plate', x: w.x + 60, y: w.y + w.h, text: `L${lane + 1}`, wall: wi, face: faceOf(w) });
  });
  // Post lamps stand on the lane boundaries past the far marks, out of every line of fire.
  const bounds = [...new Set(lay.lanes.flatMap((l) => [l.y0, l.y1]))];
  for (const x of [lay.line + 400, lay.line + 1000]) for (const y of bounds) {
    if (y < 120 || y > map.size - 120) continue;
    if (walls.some((w) => x > w.x - 30 && x < w.x + w.w + 30 && y > w.y - 30 && y < w.y + w.h + 40)) continue;
    add({ kind: 'lanepost', x, y, lx: x, ly: y, angle: 0, phase: rand() });
  }
  // The scoreboard: a tall plate on the back wall's top face, reading down the wall.
  const back = walls.filter((w) => w.x === 100).sort((a, b) => a.y - b.y)[0];
  if (back) add({ kind: 'scoreboard', x: back.x + back.w / 2, y: back.y + back.h * 0.5, lx: back.x + back.w + 14, ly: back.y + back.h * 0.5, angle: 0, phase: 0, w: back.w - 12, h: 230, text: 'RANGE' });
  // Quiet dressing beside the back walls and cover only: wall-foot grime and a cable run.
  for (const s of spotsOf(walls, 90, 24, 100)) {
    if (s.wall.material === 'planter' || rand() > 0.5) continue;
    const p = outward(s, 12);
    const horiz = s.side === 'n' || s.side === 's';
    if (keep.inWall(p.x, p.y, 10) || nearWall(p.x, p.y, walls.filter((w) => w !== s.wall), 20)) continue;
    if (marks.filter((m) => m.k === 'grime').length >= 16) break;
    marks.push({ k: 'grime', x: p.x, y: p.y, w: horiz ? 90 : 14, h: horiz ? 14 : 90 });
  }
  const bx = walls.filter((w) => w.x === 100);
  for (const w of bx) marks.push({ k: 'cable', pts: [[w.x + w.w + 10, w.y + 90], [w.x + w.w + 10, w.y + w.h - 90]], boxes: [[w.x + w.w + 10, w.y + 90], [w.x + w.w + 10, w.y + w.h / 2], [w.x + w.w + 10, w.y + w.h - 90]] });
  return { name: map.name, size: map.size, flavour: 'range', fixtures, marks, mounts, landmarks: [], vignettes: [], tints: [], regions: [], avoid: [], keep };
}
