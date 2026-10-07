import { make, poly, type MapDoor, type MapPoly, type MapRoof, type Pt } from '../geom.ts';
import { room, ship, type RoomSpec } from './causewayship.ts';

/**
 * Causeway Harbour, the walls. A working port at the end of a long shift: two quays on a western and an eastern sea, each with a
 * container ship, a trawler and a patrol boat moored alongside whose decks are real ground to fight on (the hull is a thin
 * gunwale wall, the deck inside is open floor, the bridge a roofed room with swing doors). Between the quays lie container stacks,
 * a fish shed, a customs house, a dry dock with a hull on blocks and a salvage yard, round a stone causeway that crosses two ponds
 * at the centre. Water is a polygon that stops bodies but not bullets or sight.
 *
 * Everything here is authored for the WEST half (x < 3000); `withGeometry` adds the half-turn twin of each piece. The grid
 * (causeway.ts) carries only spawns, zone A and the props. Keep every gap at least 96 px: the nav raster is 25 px.
 */

export const SIZE = 6000;
export const QUAY = 900;

/* -- ships ------------------------------------------------------------------------------------------------------ */

export const PATROL = ship({ id: 'patrol', quayX: QUAY, y0: 1060, length: 700, beam: 340, bow: 260, stern: 80, transom: 0.78, wall: 28, gangways: [{ u: 300, w: 100 }, { u: 500, w: 100 }] });
export const KESTREL = ship({ id: 'kestrel', quayX: QUAY, y0: 1900, length: 2000, beam: 620, bow: 420, stern: 180, transom: 0.82, wall: 36, gangways: [{ u: 520, w: 112 }, { u: 1060, w: 112 }, { u: 1660, w: 112 }] });
export const TRAWLER = ship({ id: 'trawler', quayX: QUAY, y0: 4000, length: 900, beam: 380, bow: 220, stern: 90, transom: 0.8, wall: 30, gangways: [{ u: 330, w: 100 }, { u: 600, w: 100 }] });
export const SHIPS = [PATROL, KESTREL, TRAWLER] as const;

/* -- water ------------------------------------------------------------------------------------------------------ */

const P = (x: number, y: number): Pt => ({ x, y });

const MOLE_HEAD: Pt[] = Array.from({ length: 11 }, (_, i) => { const a = (270 - i * 18) * Math.PI / 180; return P(520 + Math.cos(a) * 200, 800 + Math.sin(a) * 200); });

/** The western sea: the whole west edge, a mole with the lighthouse at its tip and a pier with the cafe, the ships' hulls cut out of it. */
export const SEA: readonly Pt[] = [
  P(0, 0), P(1250, 0), P(1250, 200), P(1050, 380), P(QUAY, 470), P(QUAY, 600), ...MOLE_HEAD, P(QUAY, 1000),
  ...PATROL.waterCut, ...KESTREL.waterCut, ...TRAWLER.waterCut,
  P(QUAY, 5060), P(300, 5060), P(300, 5500), P(QUAY, 5500), P(QUAY, SIZE), P(0, SIZE),
];

/** The central causeway runs between two ponds: these are the two west pieces (the other halves of the ponds are their turns). */
export const POND_N = poly.rect(2640, 2260, 360, 540);
export const POND_S = poly.rect(2640, 3200, 360, 540);

/* -- helpers ---------------------------------------------------------------------------------------------------- */

const polys: MapPoly[] = [];
const doors: MapDoor[] = [];
const roofs: MapRoof[] = [];
/** The rooms, with their names, for the floor painter and the signs. */
export const ROOMS: { id: string; x: number; y: number; w: number; h: number; material: string; name: string }[] = [];
let uid = 0;
type Extra = Partial<Omit<MapPoly, 'points' | 'material'>>;
const add = (pts: readonly Pt[], material: string, o: Extra = {}) => { polys.push(make(pts, material, { id: `${material}${uid++}`, ...o })); };
const rect = (x: number, y: number, w: number, h: number, material: string, o: Extra = {}) => add(poly.rect(x, y, w, h), material, o);
const low = { blocksBullets: false } as const;
const rooms = (r: RoomSpec, name: string) => { const out = room(r); polys.push(...out.polys); doors.push(...out.doors); roofs.push(...out.roofs); ROOMS.push({ id: r.id, x: r.x, y: r.y, w: r.w, h: r.h, material: r.material, name }); };

add(SEA, 'water', { id: 'sea', height: 0, blocksBullets: false, blocksSight: false });
add(POND_N, 'water', { id: 'pond-n', height: 0, blocksBullets: false, blocksSight: false });
add(POND_S, 'water', { id: 'pond-s', height: 0, blocksBullets: false, blocksSight: false });

for (const s of SHIPS) polys.push(...s.gunwale);

/* -- the lighthouse ---------------------------------------------------------------------------------------------- */

add(poly.circle(520, 800, 104, 20), 'lighthouse', { id: 'lighthouse', height: 150, shape: 'lighthouse' });

/* -- Berth 1: the container ship Kestrel ------------------------------------------------------------------------ */

{
  const s = KESTREL;
  const stack = (u0: number, u1: number, v0: number, v1: number, id: string) => { const b = s.box(u0, u1, v0, v1); rect(b.x, b.y, b.w, b.h, 'container', { id, group: 'kestrel', part: 'cargo', height: 46 }); };
  // The cargo bays: a quay-side row and an outboard row of boxes with lanes either side and an alley between them.
  stack(500, 890, 132, 288, 'kq1');
  stack(1010, 1400, 132, 288, 'kq2');
  stack(470, 1250, 428, 584, 'ko1');
  // Hatch coamings in the alley, low enough to shoot over.
  for (const [u, id] of [[560, 'kh1'], [1060, 'kh2']] as const) { const b = s.box(u, u + 240, 322, 396); rect(b.x, b.y, b.w, b.h, 'hatch', { id, group: 'kestrel', part: 'hatch', height: 12, ...low }); }
  // The deckhouse: the bridge, a roofed room with doors on three sides and a lane all the way round.
  const h = s.box(1480, 1880, 140, 480);
  rooms({
    id: 'kbridge', x: h.x, y: h.y, w: h.w, h: h.h, t: 28, material: 'cabin', group: 'kestrel', part: 'house', height: 56, roof: { material: 'cabin', tint: '#d8d2c0' },
    openings: [
      { side: 'n', at: s.at(0, 310).x, w: 140, door: { kind: 'double-swing', material: 'wood' } },
      { side: 'e', at: s.at(1680, 0).y, w: 110, door: { kind: 'swing', material: 'wood' } },
      { side: 'w', at: s.at(1680, 0).y, w: 110, door: { kind: 'swing', material: 'wood' } },
    ],
  }, 'BRIDGE');
  { const b = s.box(1800, 1840, 240, 380); rect(b.x, b.y, b.w, b.h, 'console', { id: 'kconsole', group: 'kestrel', part: 'console', height: 20, ...low }); }
  { const b = s.box(1520, 1590, 170, 270); rect(b.x, b.y, b.w, b.h, 'cabin', { id: 'kengine', group: 'kestrel', part: 'engine', height: 22 }); }
  // Forecastle and aft deck.
  { const b = s.box(190, 310, 255, 365); rect(b.x, b.y, b.w, b.h, 'winch', { id: 'kwindlass', group: 'kestrel', part: 'winch', height: 24 }); }
  { const c = s.at(1925, 310); add(poly.circle(c.x, c.y, 26, 10), 'winch', { id: 'kcapstan', group: 'kestrel', part: 'winch', height: 22 }); }
  { const c = s.at(340, 140); add(poly.circle(c.x, c.y, 36, 12), 'coil', { id: 'kcoil1', group: 'kestrel', part: 'coil', height: 14, ...low }); }
  { const c = s.at(1340, 500); add(poly.capsule(c.x, c.y - 70, c.x, c.y + 70, 30, 5), 'lifeboat', { id: 'klifeboat', group: 'kestrel', part: 'lifeboat', height: 34 }); }
}

/* -- Berth 2: the trawler Mary Ellen ---------------------------------------------------------------------------- */

{
  const s = TRAWLER;
  const h = s.box(230, 430, 150, 350);
  rooms({
    id: 'twheel', x: h.x, y: h.y, w: h.w, h: h.h, t: 26, material: 'cabin', group: 'trawler', part: 'house', height: 52, roof: { material: 'cabin', tint: '#b9cdd0' },
    openings: [
      { side: 'e', at: s.at(330, 0).y, w: 100, door: { kind: 'swing', material: 'wood' } },
      { side: 's', at: s.at(0, 250).x, w: 100, door: { kind: 'swing', material: 'wood' } },
    ],
  }, 'WHEELHOUSE');
  { const b = s.box(255, 310, 262, 318); rect(b.x, b.y, b.w, b.h, 'console', { id: 'ttable', group: 'trawler', part: 'console', height: 20, ...low }); }
  { const b = s.box(470, 580, 120, 230); rect(b.x, b.y, b.w, b.h, 'hatch', { id: 'thatch', group: 'trawler', part: 'hatch', height: 12, ...low }); }
  { const b = s.box(640, 720, 250, 330); rect(b.x, b.y, b.w, b.h, 'winch', { id: 'twinch', group: 'trawler', part: 'winch', height: 24 }); }
  { const b = s.box(790, 830, 50, 90); rect(b.x, b.y, b.w, b.h, 'frame', { id: 'tframe1', group: 'trawler', part: 'frame', height: 44 }); }
  { const b = s.box(790, 830, 290, 330); rect(b.x, b.y, b.w, b.h, 'frame', { id: 'tframe2', group: 'trawler', part: 'frame', height: 44 }); }
  { const b = s.box(500, 570, 262, 332); rect(b.x, b.y, b.w, b.h, 'fishcrate', { id: 'tcrates', group: 'trawler', part: 'crates', height: 24 }); }
  { const c = s.at(110, 300); add(poly.circle(c.x, c.y, 26, 10), 'coil', { id: 'tcoil', group: 'trawler', part: 'coil', height: 14, ...low }); }
}

/* -- Berth 3: the patrol boat PB-17 ----------------------------------------------------------------------------- */

{
  const s = PATROL;
  const h = s.box(280, 470, 100, 270);
  rooms({
    id: 'pcabin', x: h.x, y: h.y, w: h.w, h: h.h, t: 24, material: 'cabin', group: 'patrol', part: 'house', height: 54, roof: { material: 'cabin', tint: '#9fb0a8' },
    openings: [
      { side: 'e', at: s.at(375, 0).y, w: 96, door: { kind: 'slide', material: 'metal', auto: true } },
      { side: 's', at: s.at(0, 185).x, w: 96, door: { kind: 'swing', material: 'metal' } },
    ],
  }, 'CABIN');
  { const c = s.at(215, 170); add(poly.circle(c.x, c.y, 36, 14), 'turret', { id: 'pturret', group: 'patrol', part: 'turret', height: 38 }); }
  { const b = s.box(525, 600, 50, 100); rect(b.x, b.y, b.w, b.h, 'rack', { id: 'prack1', group: 'patrol', part: 'rack', height: 14, ...low }); }
  { const b = s.box(525, 600, 235, 285); rect(b.x, b.y, b.w, b.h, 'rack', { id: 'prack2', group: 'patrol', part: 'rack', height: 14, ...low }); }
}

/* -- the dry dock ----------------------------------------------------------------------------------------------- */

{
  const x0 = 1920, y0 = 250, x1 = 2600, y1 = 1250, t = 44;
  const strips = (a: number, b: number, gaps: readonly (readonly [number, number])[]) => { const out: [number, number][] = []; let cur = a; for (const [g0, g1] of gaps) { if (g0 > cur) out.push([cur, g0]); cur = g1; } if (cur < b) out.push([cur, b]); return out; };
  for (const [a, b] of strips(y0, y1, [[700, 800]])) { rect(x0, a, t, b - a, 'dockwall', { id: `dw${a}`, group: 'drydock', height: 30 }); rect(x1 - t, a, t, b - a, 'dockwall', { id: `de${a}`, group: 'drydock', height: 30 }); }
  for (const [a, b] of strips(x0 + t, x1 - t, [[2220, 2320]])) rect(a, y1 - t, b - a, t, 'dockwall', { id: `ds${a}`, group: 'drydock', height: 30 });
  for (const [a, b] of strips(x0 + t, x1 - t, [[2120, 2400]])) rect(a, y0, b - a, t, 'dockwall', { id: `dn${a}`, group: 'drydock', height: 30 });
  // The hull on blocks, a patrol cutter laid up for her coat of paint.
  add(poly.fromPath([[2260, 440], [2325, 480], [2375, 560], [2375, 980], [2350, 1060], [2170, 1060], [2145, 980], [2145, 560], [2195, 480]]), 'drydockhull', { id: 'drydock-hull', group: 'drydock', part: 'hull', height: 44, shape: 'cutter' });
  rect(2000, 880, 70, 120, 'scaffold', { id: 'scaf1', group: 'drydock', height: 36, ...low });
  rect(2460, 560, 70, 120, 'scaffold', { id: 'scaf2', group: 'drydock', height: 36, ...low });
  // The pump house beside it.
  rooms({
    id: 'pump', x: 2700, y: 300, w: 280, h: 340, t: 28, material: 'plant', height: 54, roof: { material: 'plant', tint: '#a8a08a' },
    openings: [
      { side: 'w', at: 470, w: 110, door: { kind: 'swing', material: 'metal' } },
      { side: 's', at: 2840, w: 100, door: { kind: 'slide', material: 'metal', auto: true } },
    ],
  }, 'PUMP HOUSE');
  add(poly.circle(2762, 545, 38, 14), 'pump', { id: 'pump1', height: 30 });
  rect(2740, 328, 200, 48, 'cabinet', { id: 'pumpcab', height: 36 });
}

/* -- Naval stores ------------------------------------------------------------------------------------------------ */

rooms({
  id: 'stores', x: 1380, y: 1000, w: 420, h: 420, t: 28, material: 'navy', height: 54, roof: { material: 'navy', tint: '#7d8d86' },
  openings: [
    { side: 'w', at: 1210, w: 128, door: { kind: 'double-slide', material: 'metal', auto: true } },
    { side: 's', at: 1590, w: 110, door: { kind: 'swing', material: 'metal' } },
    { side: 'e', at: 1210, w: 110, door: { kind: 'swing', material: 'metal' } },
  ],
}, 'NAVAL STORES');
rect(1470, 1060, 160, 52, 'rack', { id: 'nrack1', height: 20, ...low });
rect(1430, 1300, 120, 52, 'rack', { id: 'nrack2', height: 20, ...low });
rect(1480, 1170, 90, 90, 'crates', { id: 'ncrates', height: 28 });

/* -- Container stacks -------------------------------------------------------------------------------------------- */

export const STACKS: readonly (readonly [number, number, number, number])[] = [
  [1400, 1850, 312, 390], [2092, 1850, 312, 390],
  [1400, 2352, 312, 780], [2320, 2352, 156, 780],
  [1824, 3420, 390, 156],
];
STACKS.forEach(([x, y, w, h], i) => rect(x, y, w, h, 'container', { id: `stack${i}`, group: 'stacks', height: 46 }));

/* -- Fish shed --------------------------------------------------------------------------------------------------- */

rooms({
  id: 'fish', x: 1420, y: 3950, w: 840, h: 650, t: 30, material: 'shed', height: 58, roof: { material: 'shed', tint: '#a9c1c0' },
  openings: [
    { side: 'w', at: 4140, w: 160, door: { kind: 'double-swing', material: 'wood', glow: '#bfe8e4' } },
    { side: 'w', at: 4440, w: 110, door: { kind: 'swing', material: 'wood' } },
    { side: 'e', at: 4275, w: 160, door: { kind: 'double-swing', material: 'wood', glow: '#bfe8e4' } },
    { side: 'n', at: 1980, w: 130, door: { kind: 'slide', material: 'metal', auto: true } },
    { side: 's', at: 1840, w: 130, door: { kind: 'double-slide', material: 'metal', auto: true } },
  ],
}, 'FISH SHED');
for (const y of [4130, 4290, 4450]) for (const x of [1560, 1900]) rect(x, y, 260, 56, 'icebench', { id: `ib${x}-${y}`, group: 'fishshed', height: 18, ...low });
rect(1790, 4240, 80, 80, 'cabin', { id: 'fscale', group: 'fishshed', height: 26 });
rect(1480, 4000, 80, 70, 'fishcrate', { id: 'fcr1', group: 'fishshed', height: 24, ...low });
rect(2150, 4510, 80, 70, 'fishcrate', { id: 'fcr2', group: 'fishshed', height: 24, ...low });
rect(1480, 4520, 60, 60, 'crates', { id: 'fcr3', group: 'fishshed', height: 26 });
rect(2160, 4000, 60, 60, 'crates', { id: 'fcr4', group: 'fishshed', height: 26 });

/* -- Customs ----------------------------------------------------------------------------------------------------- */

rooms({
  id: 'customs', x: 1900, y: 4950, w: 740, h: 520, t: 28, material: 'office', height: 56, roof: { material: 'office', tint: '#b8c2b0' },
  openings: [
    { side: 'n', at: 2270, w: 180, door: { kind: 'double-slide', material: 'glass', auto: true, glow: '#d8f0b0' } },
    { side: 'n', at: 2020, w: 100, door: { kind: 'swing', material: 'wood' } },
    { side: 'e', at: 5130, w: 110, door: { kind: 'slide', material: 'glass', auto: true } },
    { side: 'w', at: 5130, w: 110, door: { kind: 'slide', material: 'glass', auto: true } },
    { side: 's', at: 2093, w: 110, door: { kind: 'swing', material: 'wood' } },
    { side: 's', at: 2447, w: 110, door: { kind: 'swing', material: 'wood' } },
  ],
}, 'CUSTOMS');
// The partition between the public hall and the offices, with two doors in it.
rect(1928, 5260, 80, 24, 'office', { id: 'cp1', height: 56 });
rect(2118, 5260, 312, 24, 'office', { id: 'cp2', height: 56 });
rect(2540, 5260, 72, 24, 'office', { id: 'cp3', height: 56 });
doors.push({ id: 'customs:pd1', kind: 'swing', x: 2008, y: 5260 + 12, w: 110, axis: 'h', material: 'wood', thick: 12 });
doors.push({ id: 'customs:pd2', kind: 'swing', x: 2430, y: 5260 + 12, w: 110, axis: 'h', material: 'wood', thick: 12 });
rect(2258, 5284, 24, 158, 'office', { id: 'cp4', height: 56 });
rect(1980, 5040, 300, 52, 'counter', { id: 'ccounter', height: 22, ...low });
rect(2400, 5040, 190, 52, 'counter', { id: 'ccounter2', height: 22, ...low });
rect(2230, 5150, 120, 70, 'scanner', { id: 'cscan', height: 44 });
rect(1958, 5396, 110, 46, 'cabinet', { id: 'clock1', height: 40 });
rect(2480, 5396, 110, 46, 'cabinet', { id: 'clock2', height: 40 });

/* -- The pier and its cafe --------------------------------------------------------------------------------------- */

rooms({
  id: 'cafe', x: 440, y: 5130, w: 280, h: 300, t: 26, material: 'cafe', height: 52, roof: { material: 'cafe', tint: '#e8d2a0' },
  openings: [
    { side: 'e', at: 5280, w: 110, door: { kind: 'swing', material: 'glass', glow: '#ffd9a0' } },
    { side: 'w', at: 5280, w: 100, door: { kind: 'swing', material: 'glass', glow: '#ffd9a0' } },
  ],
}, 'CAFE');
rect(470, 5156, 230, 46, 'counter', { id: 'cafecounter', height: 22, ...low });
for (const [x, y] of [[600, 5340], [520, 5390]] as const) add(poly.circle(x, y, 28, 10), 'table', { id: `ct${x}`, height: 18, ...low });
for (const y of [5180, 5330, 5430]) add(poly.circle(800, y, 36, 10), 'table', { id: `tt${y}`, height: 18, ...low });

/* -- Net loft ---------------------------------------------------------------------------------------------------- */

rooms({
  id: 'loft', x: 2560, y: 4000, w: 400, h: 380, t: 28, material: 'loft', height: 56, roof: { material: 'loft', tint: '#a58a68' },
  openings: [
    { side: 'w', at: 4190, w: 110, door: { kind: 'swing', material: 'wood' } },
    { side: 'n', at: 2760, w: 110, door: { kind: 'swing', material: 'wood' } },
    { side: 's', at: 2760, w: 110, door: { kind: 'swing', material: 'wood' } },
  ],
}, 'NET LOFT');
add(poly.circle(2790, 4190, 48, 14), 'coil', { id: 'netpile', height: 22, ...low });

/* -- Gantry crane at Berth 1: four legs, rails between ----------------------------------------------------------- */

export const GANTRY = { legs: [925, 1190].flatMap((x) => [2740, 3050].map((y) => ({ x, y, w: 64, h: 64 }))), boom: { x: 957, y: 2927, reach: 520, span: 400 } } as const;
for (const l of GANTRY.legs) rect(l.x, l.y, l.w, l.h, 'crane', { id: `leg${l.x}-${l.y}`, group: 'gantry', height: 70 });

/* -- Salvage yard ------------------------------------------------------------------------------------------------ */

add(poly.fromPath([[2700, 780], [2850, 740], [2940, 840], [2880, 980], [2730, 1000]]), 'scrap', { id: 'heap1', height: 40 });
add(poly.fromPath([[2680, 1180], [2850, 1130], [2950, 1230], [2870, 1360], [2720, 1380]]), 'scrap', { id: 'heap2', height: 42 });
add(poly.transform(poly.rect(-120, -48, 240, 96), { x: 2760, y: 1600, rot: 0.35 }), 'wreck', { id: 'wreck1', height: 34 });
add(poly.transform(poly.rect(-120, -48, 240, 96), { x: 2830, y: 1790, rot: -0.25 }), 'wreck', { id: 'wreck2', height: 34 });
for (const [x, y] of [[2640, 700], [2705, 650], [2650, 770]] as const) add(poly.circle(x, y, 36, 12), 'tyres', { id: `tyre${x}`, height: 20 });

export const WEST_POLYS: readonly MapPoly[] = polys;
export const WEST_DOORS: readonly MapDoor[] = doors;
export const WEST_ROOFS: readonly MapRoof[] = roofs;
