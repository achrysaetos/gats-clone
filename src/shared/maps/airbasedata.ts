import type { Rect } from '../sim/movement.ts';

/**
 * Kestrel Field after dark: the districts, the painted names and the small stories of the Airbase, shared by the floor, the
 * walls and the lights. Everything here is for the WEST half; the east half is the same place turned half a turn, and
 * `districtAt` folds a point back into the west half and says which half it was so the art can differ between the twins
 * (Hangar 1 has a rubber duck on its ramp, Hangar 2 a toy plane; the enlisted barracks are bunks, the officers' a card table).
 *
 * The lore: a night scramble. The klaxon went off three minutes ago and every soul on Kestrel Field ran. The two C-130s are
 * half loaded (pallets on the ramps, straps trailing), a pilot's helmet sits on a wing, the mission board in the crib still
 * has OP LANTERN pinned to it, the coffee in the tower is still warm, the cat has slept through all of it, and somebody is
 * still smoking at the fuel farm gate. The base counter says 0 days without an incident. It said 412.
 */
export const SIZE = 6000;

export type DistrictId = 'hangar' | 'bay' | 'comms' | 'barracks' | 'mess' | 'parade' | 'fuel' | 'helipad' | 'apron' | 'tower';
export type FloorKind = 'epoxy' | 'bay' | 'gravel' | 'lino' | 'checker' | 'parade' | 'asphalt' | 'helipad' | 'apron' | 'plaza';
export type District = {
  id: DistrictId;
  /** The name painted on the floor, for the west half and for its twin. */
  names: readonly [string, string];
  sub?: readonly [string, string];
  rect: Rect;
  /** The colour of the light this place is lit with, and a faint wash of it on the floor. */
  light: string;
  tint: string;
  floor: FloorKind;
};

/** First match wins. Edges fall on the grid's 50 px cells. */
export const DISTRICTS: readonly District[] = [
  { id: 'tower', names: ['CONTROL TOWER', 'CONTROL TOWER'], sub: ['APRON CONTROL', 'APRON CONTROL'], rect: { x: 2300, y: 2400, w: 700, h: 1200 }, light: '#ffe08a', tint: 'rgba(255, 210, 120, 0.06)', floor: 'plaza' },
  { id: 'hangar', names: ['HANGAR 1', 'HANGAR 2'], sub: ['C-130 SERVICE BAY', 'C-130 SERVICE BAY'], rect: { x: 0, y: 0, w: 2400, h: 2250 }, light: '#cfe3ff', tint: 'rgba(120, 160, 220, 0.09)', floor: 'epoxy' },
  { id: 'bay', names: ['MAINTENANCE BAY', 'MAINTENANCE BAY'], sub: ['JACKS UP', 'ENGINE SHOP'], rect: { x: 900, y: 2250, w: 1400, h: 1500 }, light: '#d6ffb0', tint: 'rgba(130, 200, 90, 0.08)', floor: 'bay' },
  { id: 'comms', names: ['RADAR AND COMMS', 'RADAR AND COMMS'], sub: ['DISPERSAL WEST', 'DISPERSAL EAST'], rect: { x: 0, y: 2250, w: 900, h: 1500 }, light: '#8fe8ff', tint: 'rgba(60, 170, 200, 0.08)', floor: 'gravel' },
  { id: 'mess', names: ['MESS HALL', 'MESS HALL'], sub: ['CHOW AT ANY HOUR', 'CHOW AT ANY HOUR'], rect: { x: 1350, y: 3750, w: 1050, h: 1050 }, light: '#ffc977', tint: 'rgba(255, 170, 80, 0.08)', floor: 'checker' },
  { id: 'parade', names: ['PARADE GROUND', 'PARADE GROUND'], sub: ['ARMOURY', 'ARMOURY'], rect: { x: 1350, y: 4800, w: 1050, h: 1150 }, light: '#ffe9b0', tint: 'rgba(210, 190, 120, 0.06)', floor: 'parade' },
  { id: 'barracks', names: ['ENLISTED BARRACKS', 'OFFICERS QUARTERS'], sub: ['LIGHTS OUT 2200', 'LIGHTS OUT 2300'], rect: { x: 0, y: 3750, w: 1350, h: 2250 }, light: '#ffd9a0', tint: 'rgba(160, 140, 80, 0.08)', floor: 'lino' },
  { id: 'fuel', names: ['FUEL FARM', 'FUEL FARM'], sub: ['NO SMOKING', 'NO NAKED LIGHTS'], rect: { x: 2400, y: 3750, w: 600, h: 2250 }, light: '#ff9a3c', tint: 'rgba(230, 120, 40, 0.09)', floor: 'asphalt' },
  { id: 'helipad', names: ['HELIPAD', 'HELIPAD'], sub: ['REMAIN CLEAR OF ROTORS', 'REMAIN CLEAR OF ROTORS'], rect: { x: 2400, y: 0, w: 600, h: 1500 }, light: '#9fffd0', tint: 'rgba(60, 200, 160, 0.07)', floor: 'helipad' },
  { id: 'apron', names: ['APRON', 'APRON'], sub: ['TAXIWAY BRAVO', 'TAXIWAY BRAVO'], rect: { x: 0, y: 0, w: 3000, h: 6000 }, light: '#ffb347', tint: 'rgba(255, 170, 60, 0.05)', floor: 'apron' },
];

export type Located = { d: District; twin: boolean; x: number; y: number };

/** The district of any point on the map: its twin's points are turned back into the west half. */
export function districtAt(x: number, y: number): Located {
  const twin = x > SIZE / 2 || (x === SIZE / 2 && y > SIZE / 2);
  const wx = twin ? SIZE - x : x, wy = twin ? SIZE - y : y;
  const d = DISTRICTS.find((q) => wx >= q.rect.x && wx < q.rect.x + q.rect.w && wy >= q.rect.y && wy < q.rect.y + q.rect.h) ?? DISTRICTS.at(-1)!;
  return { d, twin, x: wx, y: wy };
}

/** A name hung over a door, or painted on the floor. West-half coordinates; the twin gets the same text turned about the centre. */
export type AirSign = { text: string; sub?: string; x: number; y: number; /** 'v' hangs across a vertical wall, rotated a quarter turn. */ vertical?: boolean; tone?: 'amber' | 'green' | 'red' | 'white' };

/** Plates hung over the doors: you always know which building you are walking into. */
export const SIGNS: readonly AirSign[] = [
  { text: 'HANGAR 1', sub: 'AIRLIFT SQN', x: 2375, y: 380, vertical: true, tone: 'white' },
  { text: 'HANGAR 1', sub: 'AIRLIFT SQN', x: 2375, y: 1690, vertical: true, tone: 'white' },
  { text: 'TOOL CRIB', x: 500, y: 668, tone: 'amber' },
  { text: 'PARTS CAGE', x: 500, y: 1738, tone: 'amber' },
  { text: 'MAINTENANCE BAY', sub: 'JETS', x: 2275, y: 2830, vertical: true, tone: 'green' },
  { text: 'RADAR AND COMMS', x: 425, y: 2698, tone: 'white' },
  { text: 'TOWER STAIRS', x: 2375, y: 2900, vertical: true, tone: 'amber' },
  { text: 'AIR TRAFFIC CONTROL', x: 3000, y: 2600, tone: 'amber' },
  { text: 'BARRACKS A', x: 1325, y: 4310, vertical: true, tone: 'amber' },
  { text: 'MESS HALL', sub: 'OPEN ALL HOURS', x: 1800, y: 3880, tone: 'amber' },
  { text: 'KITCHEN', x: 1850, y: 4392, tone: 'white' },
  { text: 'ARMOURY', x: 2100, y: 5380, tone: 'red' },
  { text: 'MAIN GATE', sub: 'HALT. SHOW PASS', x: 2625, y: 5740, tone: 'amber' },
];

/** The floor's own stencils: the district's name large, once, in its yard. */
export const STENCILS: readonly { text: string; x: number; y: number; size: number; rot?: number }[] = [
  { text: 'HANGAR', x: 1500, y: 2330, size: 64 },
  { text: 'BAY 1', x: 1050, y: 3710, size: 52 },
  { text: 'DISPERSAL', x: 90, y: 2840, size: 46 },
  { text: 'MESS', x: 1480, y: 3790, size: 44 },
  { text: 'PARADE', x: 1500, y: 5560, size: 60 },
  { text: 'FUEL', x: 2420, y: 5850, size: 56 },
  { text: 'HELIPAD', x: 2490, y: 200, size: 52 },
];

export type RoomKind = 'epoxy' | 'crib' | 'cage' | 'bayfloor' | 'shed' | 'stairs' | 'bunk' | 'corridor' | 'dining' | 'kitchen' | 'armoury' | 'booth' | 'lobby';
/** Interior floors (the walls' inside faces), west half: each is painted its own way and lit by its own fixtures. */
export const ROOMS: readonly { id: string; rect: Rect; kind: RoomKind }[] = [
  { id: 'hangar', rect: { x: 250, y: 250, w: 2100, h: 1950 }, kind: 'epoxy' },
  { id: 'crib', rect: { x: 250, y: 250, w: 550, h: 400 }, kind: 'crib' },
  { id: 'cage', rect: { x: 250, y: 1800, w: 500, h: 400 }, kind: 'cage' },
  { id: 'bay', rect: { x: 950, y: 2550, w: 1300, h: 900 }, kind: 'bayfloor' },
  { id: 'shed', rect: { x: 300, y: 2500, w: 250, h: 200 }, kind: 'shed' },
  { id: 'stairs', rect: { x: 2400, y: 2900, w: 250, h: 200 }, kind: 'stairs' },
  { id: 'ba-corridor', rect: { x: 300, y: 4350, w: 1000, h: 100 }, kind: 'corridor' },
  { id: 'ba-n0', rect: { x: 300, y: 3950, w: 300, h: 350 }, kind: 'bunk' },
  { id: 'ba-n1', rect: { x: 650, y: 3950, w: 300, h: 350 }, kind: 'bunk' },
  { id: 'ba-n2', rect: { x: 1000, y: 3950, w: 300, h: 350 }, kind: 'bunk' },
  { id: 'ba-s0', rect: { x: 300, y: 4500, w: 300, h: 300 }, kind: 'bunk' },
  { id: 'ba-s1', rect: { x: 650, y: 4500, w: 300, h: 300 }, kind: 'bunk' },
  { id: 'ba-s2', rect: { x: 1000, y: 4500, w: 300, h: 300 }, kind: 'bunk' },
  { id: 'bb-r0', rect: { x: 300, y: 5050, w: 350, h: 350 }, kind: 'bunk' },
  { id: 'bb-r1', rect: { x: 700, y: 5050, w: 300, h: 350 }, kind: 'bunk' },
  { id: 'bb-r2', rect: { x: 1050, y: 5050, w: 250, h: 350 }, kind: 'bunk' },
  { id: 'bb-corridor', rect: { x: 300, y: 5450, w: 1000, h: 100 }, kind: 'corridor' },
  { id: 'dining', rect: { x: 1500, y: 3950, w: 800, h: 450 }, kind: 'dining' },
  { id: 'kitchen', rect: { x: 1500, y: 4450, w: 800, h: 300 }, kind: 'kitchen' },
  { id: 'armoury', rect: { x: 2000, y: 5450, w: 250, h: 200 }, kind: 'armoury' },
  { id: 'booth', rect: { x: 2550, y: 5800, w: 150, h: 50 }, kind: 'booth' },
];

/** The tower: a round building whose lobby holds zone B. */
export const TOWER = { x: 3000, y: 3000, inner: 330, outer: 380 } as const;
export type Placed = { x: number; y: number; rot: number };
/** Where the set pieces stand in the west half (the map places them from here, the art finds them here); `twinOf` is the half-turn copy. */
export const PIECES = {
  plane: { x: 1502, y: 1225, rot: 0 },
  jet: { x: 1600, y: 3000, rot: 0 },
  heli: { x: 2780, y: 800, rot: -Math.PI / 2 },
  bowser: { x: 2800, y: 5450, rot: Math.PI / 2 },
  bowser2: { x: 2700, y: 1950, rot: Math.PI / 2 },
  crash: { x: 2470, y: 3480, rot: -Math.PI / 2 },
} as const satisfies Record<string, Placed>;
export const twinOf = (p: Placed): Placed => ({ x: SIZE - p.x, y: SIZE - p.y, rot: p.rot + Math.PI });
export const RADAR = { x: 450, y: 3150, r: 200 } as const;
export const TANKS = [{ x: 2620, y: 4150 }, { x: 2810, y: 4600 }, { x: 2620, y: 5050 }] as const;
export const TANK_R = 176;
