import { MAPS, type MapWall } from '../../shared/maps.ts';
import { INK } from '../palette.ts';

/**
 * Shared bits of the Rail Yard theme: palette, districts (each half of the plan is a different place), the track plan, and
 * a view of the map's own walls so a painter can tell which edges face open air.
 */
export const RY = MAPS.railyard;
export const SIZE = RY.size;
export const MID = SIZE / 2;
export const TAU = Math.PI * 2;

export const C = {
  ink: INK,
  brick: '#8a4a3a', brickHi: '#a8604a', brickLo: '#6a362b', brickFront: '#5e3028', brickDeep: '#3c1f19', mortar: '#b9a58a', soot: '#2c2523',
  iron: '#3f5a4a', ironHi: '#5a7d68', ironLo: '#2a3f33', ironFront: '#26382e',
  brass: '#c9a23c', brassHi: '#e8c868', brassLo: '#8a6d24',
  cream: '#e2dccb', creamLo: '#b9b29c', slate: '#4a4f5c', slateHi: '#686e7c',
  timber: '#7a5a3a', timberHi: '#9a7448', timberLo: '#4f3a24', sleeper: '#4a3826', ballast: '#57544d', ballastHi: '#706c62', ballastLo: '#3f3d38',
  rail: '#8a8f98', railHi: '#c3c9d2', coal: '#25262c', coalHi: '#4a4c56', rust: '#a8552e', rustLo: '#6e3820',
  paintGreen: '#3f6a52', paintGreenHi: '#5f8d72', paintGreenLo: '#2c4a39',
  lamp: '#ffb347', lampPale: '#ffe2a8', steam: '#dfe6ee', glass: '#9fc4cc', glassLit: '#ffd98a', red: '#c4473a', signalGreen: '#5be08a',
} as const;

/** Tiny deterministic hash to 0..1. */
export function hash(a: number, b = 0, c = 0): number {
  let h = Math.imul(a | 0, 374761393) ^ Math.imul(b | 0, 668265263) ^ Math.imul(c | 0, 2147483647);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}



/* ----------------------------------------------------------- walls view */
type Bucket = { rects: readonly MapWall[]; cells: Map<number, MapWall[]> };
const buckets = new Map<string, Bucket>();
const BK = 100;
const bkey = (cx: number, cy: number) => cx * 4096 + cy;
function bucketOf(material: string): Bucket {
  let b = buckets.get(material);
  if (b) return b;
  const rects = RY.walls.filter((w) => w.material === material);
  const cells = new Map<number, MapWall[]>();
  for (const r of rects) for (let cy = Math.floor(r.y / BK); cy <= Math.floor((r.y + r.h) / BK); cy++) for (let cx = Math.floor(r.x / BK); cx <= Math.floor((r.x + r.w) / BK); cx++) {
    const k = bkey(cx, cy), l = cells.get(k);
    if (l) l.push(r); else cells.set(k, [r]);
  }
  buckets.set(material, (b = { rects, cells }));
  return b;
}
export function inside(material: string, x: number, y: number): boolean {
  const l = bucketOf(material).cells.get(bkey(Math.floor(x / BK), Math.floor(y / BK)));
  return !!l?.some((r) => x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h);
}
export type Open = { n: boolean; e: boolean; s: boolean; w: boolean; spans: Record<'n' | 'e' | 's' | 'w', [number, number][]> };
const exposures = new Map<string, Open>();
export function openSides(material: string, r: { x: number; y: number; w: number; h: number }): Open {
  const key = `${material}${r.x},${r.y},${r.w},${r.h}`;
  const known = exposures.get(key);
  if (known) return known;
  const step = 5;
  const run = (len: number, at: (t: number) => boolean): [number, number][] => {
    const out: [number, number][] = [];
    let from = -1;
    for (let t = 0; t < len; t += step) {
      const open = at(t + step / 2);
      if (open && from < 0) from = t;
      if (!open && from >= 0) { out.push([from, t]); from = -1; }
    }
    if (from >= 0) out.push([from, len]);
    return out;
  };
  const spans = {
    n: run(r.w, (t) => !inside(material, r.x + t, r.y - 2)), s: run(r.w, (t) => !inside(material, r.x + t, r.y + r.h + 2)),
    w: run(r.h, (t) => !inside(material, r.x - 2, r.y + t)), e: run(r.h, (t) => !inside(material, r.x + r.w + 2, r.y + t)),
  };
  const o: Open = { n: spans.n.length > 0, e: spans.e.length > 0, s: spans.s.length > 0, w: spans.w.length > 0, spans };
  exposures.set(key, o);
  return o;
}

/* ------------------------------------------------------------ districts */
export type Box = { x0: number; y0: number; x1: number; y1: number };
export type District = { id: string; name: string; box: Box; light: string; /** Wash colour 'r, g, b'. */ wash: string; floor?: string };
const B = (x0: number, y0: number, x1: number, y1: number): Box => ({ x0, y0, x1, y1 });
/** Most specific first. The east and south halves are different places on the same plan. */
export const DISTRICTS: readonly District[] = [
  { id: 'tickets', name: 'TICKET HALL', box: B(300, 200, 1450, 900), light: '#ffd9a0', wash: '255, 210, 140', floor: 'terrazzo' },
  { id: 'concourse', name: 'CONCOURSE', box: B(300, 850, 1450, 2200), light: '#ffe0a8', wash: '255, 200, 120', floor: 'encaustic' },
  { id: 'buffet', name: 'BUFFET & WAITING ROOMS', box: B(300, 2150, 1450, 2850), light: '#ffc27a', wash: '255, 170, 90', floor: 'checker' },
  { id: 'platforms', name: 'PLATFORMS 1-4', box: B(1450, 300, 3500, 2250), light: '#ffcf8a', wash: '255, 190, 110' },
  { id: 'clock', name: 'CLOCK COURT', box: B(1450, 2200, 2700, 3000), light: '#ffd28a', wash: '255, 200, 120' },
  { id: 'parcels', name: 'PARCELS OFFICE', box: B(4550, 5100, 5700, 5800), light: '#c9e2b0', wash: '170, 210, 140', floor: 'lino' },
  { id: 'goodshall', name: 'GOODS HALL', box: B(4550, 3800, 5700, 5150), light: '#ffbf80', wash: '255, 170, 100', floor: 'boards' },
  { id: 'mess', name: "SIGNALMEN'S MESS", box: B(4550, 3150, 5700, 3850), light: '#b8d8ff', wash: '150, 190, 255', floor: 'lino' },
  { id: 'platforms2', name: 'PLATFORMS 5-8', box: B(2500, 3750, 4550, 5700), light: '#ffc47a', wash: '255, 180, 100' },
  { id: 'hoist', name: 'HOIST YARD', box: B(3300, 3000, 4550, 3800), light: '#ffcf8a', wash: '255, 190, 110' },
  { id: 'tunnel', name: 'TUNNEL MOUTH', box: B(5350, 1000, 6000, 1600), light: '#ff7a4a', wash: '255, 110, 60' },
  { id: 'tunnel2', name: 'SEALED TUNNEL', box: B(0, 4400, 650, 5000), light: '#9fb4d8', wash: '120, 150, 210' },
  { id: 'water', name: 'WATER STOP', box: B(4850, 0, 5800, 800), light: '#9fe0e8', wash: '120, 200, 220' },
  { id: 'coaling', name: 'COALING TOWER', box: B(200, 5200, 1150, 6000), light: '#ffb070', wash: '255, 150, 90' },
  { id: 'sigbox', name: 'SIGNAL BOX', box: B(3950, 800, 4500, 1160), light: '#ff9a6a', wash: '255, 130, 90' },
  { id: 'hut', name: 'PLATELAYERS HUT', box: B(1500, 4840, 2050, 5200), light: '#bcd8a8', wash: '170, 210, 140' },
  { id: 'freight', name: 'FREIGHT YARD', box: B(3500, 0, 5400, 1000), light: '#ffa860', wash: '255, 150, 80', floor: 'cinder' },
  { id: 'marshal', name: 'MARSHALLING YARD', box: B(600, 5000, 2500, 6000), light: '#a8c8ff', wash: '140, 180, 255', floor: 'cinder' },
  { id: 'turntable', name: 'TURNTABLE', box: B(3950, 1850, 4750, 2650), light: '#ffb86a', wash: '255, 170, 90' },
  { id: 'turntable2', name: 'OLD TURNTABLE', box: B(1250, 3350, 2050, 4150), light: '#b8e0a8', wash: '170, 220, 150' },
  { id: 'shed', name: 'ENGINE SHED', box: B(4800, 1700, 5800, 2600), light: '#ffa050', wash: '255, 140, 70', floor: 'oil' },
  { id: 'shed2', name: 'CARRIAGE SHED', box: B(200, 3400, 1200, 4300), light: '#e8e0ff', wash: '200, 190, 255', floor: 'oil' },
  { id: 'goods', name: 'GOODS OFFICE', box: B(3100, 1800, 3650, 2100), light: '#ffd28a', wash: '255, 200, 120' },
  { id: 'house', name: "STATIONMASTER'S HOUSE", box: B(2350, 3900, 2900, 4200), light: '#ffc8a0', wash: '255, 190, 150' },
  { id: 'crane', name: 'CRANE SIDING', box: B(3500, 2600, 4900, 3000), light: '#ffa860', wash: '255, 150, 80' },
  { id: 'scrap', name: 'SCRAPYARD', box: B(1100, 3000, 2500, 3400), light: '#c8a888', wash: '200, 160, 130' },
  { id: 'crossing', name: 'LEVEL CROSSING', box: B(2650, 2650, 3350, 3350), light: '#ff6a5a', wash: '255, 100, 90' },
  { id: 'cab', name: 'CAB ROAD', box: B(0, 0, 300, 6000), light: '#ffd9a0', wash: '255, 210, 150' },
  { id: 'cab2', name: 'CAB ROAD', box: B(5700, 0, 6000, 6000), light: '#ffd9a0', wash: '255, 210, 150' },
];
export const YARD: District = { id: 'yard', name: 'THE YARD', box: B(0, 0, 6000, 6000), light: '#ffc27a', wash: '255, 190, 110' };
export const districtAt = (x: number, y: number): District =>
  DISTRICTS.find((d) => x >= d.box.x0 && x < d.box.x1 && y >= d.box.y0 && y < d.box.y1) ?? YARD;

/* --------------------------------------------------------- track plan */
export type Pt = readonly [number, number];
/** Track centre lines for the north half; each is drawn again turned. kind: main, siding. */
export const TRACKS: readonly { pts: readonly Pt[]; kind: 'main' | 'siding'; buffer?: 'start' | 'end' | 'both' }[] = [
  { pts: [[1560, 800], [3500, 800], [3640, 800], [5560, 800]], kind: 'main', buffer: 'start' },
  { pts: [[3700, 800], [3800, 550], [4980, 550]], kind: 'siding', buffer: 'end' },
  { pts: [[1560, 1300], [5990, 1300]], kind: 'main', buffer: 'start' },
  { pts: [[1560, 1800], [3500, 1800], [3800, 1800], [4008, 2200]], kind: 'main', buffer: 'start' },
  { pts: [[3500, 1800], [3640, 1950], [3990, 1950]], kind: 'siding', buffer: 'end' },
  { pts: [[4592, 2200], [4720, 2125], [5700, 2125]], kind: 'siding' },
  { pts: [[4592, 2200], [4720, 1875], [4800, 1875], [5000, 1875]], kind: 'siding' },
  { pts: [[4592, 2200], [4720, 2375], [4800, 2375], [5000, 2375]], kind: 'siding' },
  { pts: [[1900, 2600], [2200, 3000], [3800, 3000], [4100, 3400]], kind: 'main' },
  { pts: [[3300, 2850], [4900, 2850]], kind: 'siding', buffer: 'start' },
  { pts: [[4200, 2880], [4520, 2850]], kind: 'siding' },
];
