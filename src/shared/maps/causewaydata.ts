import { halfTurn, type Pt } from '../geom.ts';
import { GANTRY, KESTREL, PATROL, QUAY, ROOMS, SHIPS, SIZE, TRAWLER } from './causewaygeo.ts';

/**
 * What a player can name without a minimap: the harbour's districts, its ships, and the signposts that point between them. The
 * west half is authored; a point on the east half is turned into the west to find its place, and the twin district wears its own
 * name, so the north-east of the harbour reads as a different place from the south-west even where the walls are half-turns.
 */

export type Box = { x: number; y: number; w: number; h: number };
export type District = Box & {
  id: string;
  /** Painted on the west half, and the name of its twin on the east half. */
  name: string;
  twin: string;
  /** The colour of this place's lamps and the wash on its floor, as 'r, g, b'. */
  light: string;
  wash: string;
  /** What the floor is made of there. */
  floor: 'quay' | 'asphalt' | 'cobble' | 'deckplate' | 'tile' | 'plank' | 'gravel' | 'scrap' | 'concrete';
};

const B = (x: number, y: number, w: number, h: number): Box => ({ x, y, w, h });

/** West-half districts, most specific first. */
export const DISTRICTS: readonly District[] = [
  { id: 'point', name: 'LIGHTHOUSE POINT', twin: 'OLD LIGHT', ...B(0, 0, 1400, 1040), light: '#ffe9b0', wash: '255, 233, 176', floor: 'cobble' },
  { id: 'dock', name: 'DRY DOCK', twin: 'SLIPWAY', ...B(1800, 150, 1200, 1250), light: '#ff9a4a', wash: '255, 154, 74', floor: 'concrete' },
  { id: 'naval', name: 'NAVAL QUAY', twin: 'COASTGUARD QUAY', ...B(0, 1040, 1800, 800), light: '#8fd0b0', wash: '143, 208, 176', floor: 'deckplate' },
  { id: 'salvage', name: 'SALVAGE YARD', twin: 'SCRAP ROW', ...B(2500, 650, 500, 1450), light: '#e8a06a', wash: '232, 160, 106', floor: 'scrap' },
  { id: 'berth1', name: 'BERTH 1', twin: 'BERTH 4', ...B(0, 1840, 1380, 1760), light: '#ffc766', wash: '255, 199, 102', floor: 'quay' },
  { id: 'stacks', name: 'CONTAINER STACKS', twin: 'REEFER STACKS', ...B(1380, 1840, 1120, 1860), light: '#9ac6ff', wash: '154, 198, 255', floor: 'asphalt' },
  { id: 'wharf', name: "FISHERMEN'S WHARF", twin: 'TRAWLER ROW', ...B(0, 3700, 2300, 1000), light: '#a8e6e0', wash: '168, 230, 224', floor: 'tile' },
  { id: 'loft', name: 'NET LOFT', twin: 'ROPE WALK', ...B(2300, 3750, 700, 800), light: '#d8b878', wash: '216, 184, 120', floor: 'plank' },
  { id: 'customs', name: 'CUSTOMS', twin: 'BONDED STORES', ...B(1350, 4700, 1650, 1300), light: '#c8f0a0', wash: '200, 240, 160', floor: 'tile' },
  { id: 'pier', name: 'THE PIER', twin: 'THE BOARDWALK', ...B(0, 4700, 1350, 1300), light: '#ffb0a0', wash: '255, 176, 160', floor: 'plank' },
];

/** The middle of the harbour is one place for both halves. */
export const CAUSEWAY_DISTRICT: District = { id: 'causeway', name: 'THE CAUSEWAY', twin: 'THE CAUSEWAY', ...B(2500, 2200, 1000, 1600), light: '#ffe28a', wash: '255, 226, 138', floor: 'cobble' };
export const HARBOUR: District = { id: 'harbour', name: 'THE HARBOUR', twin: 'THE HARBOUR', ...B(0, 0, SIZE, SIZE), light: '#ffd9a0', wash: '255, 217, 160', floor: 'asphalt' };

const inside = (b: Box, x: number, y: number) => x >= b.x && x < b.x + b.w && y >= b.y && y < b.y + b.h;

/** The district a point stands in, and whether it is on the east half (so the twin name applies). */
export function districtAt(x: number, y: number): { d: District; east: boolean; name: string } {
  if (inside(CAUSEWAY_DISTRICT, x, y)) return { d: CAUSEWAY_DISTRICT, east: false, name: CAUSEWAY_DISTRICT.name };
  const east = x >= SIZE / 2;
  const [wx, wy] = east ? [SIZE - x, SIZE - y] : [x, y];
  for (const d of DISTRICTS) if (inside(d, wx, wy)) return { d, east, name: east ? d.twin : d.name };
  return { d: HARBOUR, east, name: HARBOUR.name };
}

export type Berth = { id: string; ship: (typeof SHIPS)[number]; berth: number; name: string; twinBerth: number; twinName: string; kind: 'container' | 'trawler' | 'patrol' };
export const BERTHS: readonly Berth[] = [
  { id: 'kestrel', ship: KESTREL, berth: 1, name: 'KESTREL', twinBerth: 4, twinName: 'HALCYON', kind: 'container' },
  { id: 'trawler', ship: TRAWLER, berth: 2, name: 'MARY ELLEN', twinBerth: 5, twinName: 'ST BRENDAN', kind: 'trawler' },
  { id: 'patrol', ship: PATROL, berth: 3, name: 'PB-17', twinBerth: 6, twinName: 'PB-22', kind: 'patrol' },
];

/** A signpost: where it stands, the lines it shows, and which way its arrows point (radians). West half; twin signs are added by `SIGNPOSTS`. */
export type Signpost = { x: number; y: number; lines: readonly { text: string; angle: number }[] };

const WEST_SIGNPOSTS: readonly Signpost[] = [
  { x: 1120, y: 1860, lines: [{ text: 'BERTH 3', angle: -Math.PI / 2 }, { text: 'BERTH 1', angle: Math.PI / 2 }] },
  { x: 1120, y: 3640, lines: [{ text: 'BERTH 1', angle: -Math.PI / 2 }, { text: "FISHERMEN'S WHARF", angle: Math.PI / 2 }] },
  { x: 1330, y: 4840, lines: [{ text: 'CUSTOMS', angle: 0 }, { text: 'THE PIER', angle: Math.PI }] },
  { x: 1680, y: 1500, lines: [{ text: 'DRY DOCK', angle: -Math.PI / 4 }, { text: 'NAVAL QUAY', angle: Math.PI } ] },
  { x: 2560, y: 2880, lines: [{ text: 'THE CAUSEWAY', angle: 0 }, { text: 'CONTAINER STACKS', angle: Math.PI }] },
  { x: 2440, y: 1980, lines: [{ text: 'SALVAGE YARD', angle: 0 }, { text: 'DRY DOCK', angle: -Math.PI / 2 }] },
];
export const SIGNPOSTS: readonly Signpost[] = [
  ...WEST_SIGNPOSTS,
  ...WEST_SIGNPOSTS.map((s) => ({ x: SIZE - s.x, y: SIZE - s.y, lines: s.lines.map((l) => ({ text: twinText(l.text), angle: l.angle + Math.PI })) })),
];

function twinText(text: string): string {
  for (const d of DISTRICTS) if (d.name === text) return d.twin;
  const b = BERTHS.find((q) => `BERTH ${q.berth}` === text);
  return b ? `BERTH ${b.twinBerth}` : text;
}

/** Every ship on the map with the half it is on: the west three and their turned twins. */
export type PlacedShip = { ship: (typeof SHIPS)[number]; id: string; berth: number; name: string; kind: Berth['kind']; east: boolean; hull: Pt[]; deck: Pt[] };
export const PLACED_SHIPS: readonly PlacedShip[] = BERTHS.flatMap((b) => [
  { ship: b.ship, id: b.id, berth: b.berth, name: b.name, kind: b.kind, east: false, hull: b.ship.hull, deck: b.ship.deck },
  { ship: b.ship, id: `${b.id}~`, berth: b.twinBerth, name: b.twinName, kind: b.kind, east: true, hull: halfTurn(b.ship.hull, SIZE), deck: halfTurn(b.ship.deck, SIZE) },
]);

export { GANTRY, KESTREL, PATROL, QUAY, ROOMS, SHIPS, SIZE, TRAWLER };

/** What the twin of each building is called on the east half. */
export const ROOM_TWIN: Record<string, string> = {
  'FISH SHED': 'COLD STORE', CUSTOMS: 'BONDED STORE', CAFE: 'CHIPPY', 'NET LOFT': 'ROPE LOFT', 'PUMP HOUSE': 'BOILER HOUSE',
  'NAVAL STORES': 'COASTGUARD STORES', BRIDGE: 'BRIDGE', WHEELHOUSE: 'WHEELHOUSE', CABIN: 'CABIN',
};

/** Street lamps on posts, west half; every glow has one of these (or a window, a nav light, the lantern) behind it. */
const WEST_LAMPS: readonly Pt[] = [
  { x: 935, y: 1030 }, { x: 935, y: 1830 }, { x: 935, y: 3950 }, { x: 935, y: 4960 }, { x: 560, y: 5040 }, { x: 640, y: 5520 }, { x: 960, y: 5540 },
  { x: 1330, y: 1520 }, { x: 1330, y: 2420 }, { x: 1330, y: 3320 }, { x: 1330, y: 4400 },
  { x: 700, y: 640 }, { x: 700, y: 960 },
  { x: 1960, y: 300 }, { x: 1960, y: 1200 }, { x: 2560, y: 300 }, { x: 2560, y: 1200 },
  { x: 2700, y: 2790 }, { x: 2700, y: 3210 }, { x: 2880, y: 2790 }, { x: 2880, y: 3210 },
  { x: 2270, y: 4930 }, { x: 1400, y: 4060 }, { x: 1400, y: 4500 }, { x: 2640, y: 900 }, { x: 1860, y: 1810 }, { x: 2200, y: 3680 },
];
export const LAMPS: readonly (Pt & { east: boolean })[] = [
  ...WEST_LAMPS.map((p) => ({ ...p, east: false })),
  ...WEST_LAMPS.map((p) => ({ x: SIZE - p.x, y: SIZE - p.y, east: true })),
];
