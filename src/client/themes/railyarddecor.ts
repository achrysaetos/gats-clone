import type { MapDef } from '../../shared/maps.ts';
import { setLight } from '../lighting.ts';
import { INK } from '../palette.ts';
import type { ThemeView } from './registry.ts';
import { C, DISTRICTS, SIZE, TAU, districtAt, hash } from './railyardkit.ts';
import * as P from './railyardprops.ts';

/**
 * What stands and what moves in the Rail Yard. `railUnder` runs after the walls, before bodies: every hand-placed vignette,
 * and the lights (each tied to a fixture: platform lamps, carriage windows, signal lamps, the clock face, the signal box,
 * the engine shed fire). `railOver` runs above bodies: the signs, the clock and hoist towers (which thin out when anyone
 * stands behind them), the crane, semaphores, steam, fireflies and a drifting newspaper. Everything is slow (nothing
 * above 1 Hz), and with reduced motion it holds still.
 */
type G = CanvasRenderingContext2D;
const calm = (() => { try { return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches; } catch { return false; } })();
const clock = (now: number) => (calm ? 6000 : now);
const inV = (v: ThemeView, x: number, y: number, r: number) => x + r >= v.x0 && x - r <= v.x1 && y + r >= v.y0 && y - r <= v.y1;
const turn = (x: number, y: number): [number, number] => [SIZE - x, SIZE - y];

/* ------------------------------------------------------- sprite stamping */
const SCALE = 2;
const sprites = new Map<string, HTMLCanvasElement>();
const specs = new Map<string, P.Sprite>();
function stamp(g: G, key: string, make: () => P.Sprite, x: number, y: number, o: { rot?: number; alpha?: number; flip?: boolean } = {}) {
  let spec = specs.get(key);
  if (!spec) specs.set(key, (spec = make()));
  let c = sprites.get(key);
  if (!c) {
    c = document.createElement('canvas'); c.width = spec.w * SCALE; c.height = spec.h * SCALE;
    const cg = c.getContext('2d')!; cg.scale(SCALE, SCALE); spec.draw(cg);
    sprites.set(key, c);
  }
  if (o.rot || o.alpha !== undefined || o.flip) {
    g.save(); g.translate(x, y); if (o.rot) g.rotate(o.rot); if (o.flip) g.scale(-1, 1); if (o.alpha !== undefined) g.globalAlpha = o.alpha;
    g.drawImage(c, -spec.ax, -spec.ay, spec.w, spec.h); g.restore();
  } else g.drawImage(c, x - spec.ax, y - spec.ay, spec.w, spec.h);
}

type Prop = { key: string; make: () => P.Sprite; x: number; y: number; r?: number; rot?: number };
const p = (key: string, make: () => P.Sprite, x: number, y: number, rot = 0, r = 90): Prop => ({ key, make, x, y, r, rot });
/** Vignettes. The north-west and south-east halves are the passenger terminus and the goods terminal; each tells its own story. */
const PROPS: Prop[] = [
  // Concourse: luggage nobody came back for, the departure board's puddle of light, a trolley.
  p('lug1', P.luggage, 500, 1620), p('lug2', P.luggage, 1190, 2040, 0.5), p('churn1', P.churnTrolley, 520, 1030, 0.2),
  // Ticket hall.
  p('mug1', P.mugTin, 740, 372), p('photo1', P.photo, 1060, 402),
  // Platform 2: the bouquet, dropped at the carriage door.
  p('bouquet', P.bouquet, 3010, 1182, 0.3, 60),
  // Platform 3: the conductor's whistle.
  p('whistle', P.whistle, 2520, 1428, 0.5, 40),
  // Platform 1: platform nine and three quarters.
  p('p934', P.platform934, 1640, 418, 0, 90), p('churn2', P.churnTrolley, 2250, 620, -0.3),
  // Waiting room: the toy train on the bench, the cat on a cushion.
  p('toy1', P.toyTrain, 580, 2318, 0, 40), p('cat1', P.cat, 520, 2690, 0, 40),
  // Buffet: urn, cups and a watch stopped at 21:47.
  p('urn1', P.urn, 1275, 2290, 0, 40), p('watch1', P.watchCups, 1000, 2478, 0, 50),
  // Lamp room and crossing hut.
  p('lant1', () => P.lantern(), 1900, 2600, 0, 30), p('lant2', () => P.lantern('#ff6a4a'), 2060, 2700, 0, 30), p('kettle1', P.kettle, 2600, 2475, 0, 30), p('tub0', P.tub, 2480, 2380, 0, 40),
  p('ring1', P.lifeRing, 1760, 2480, 0, 30),
  // Cab road.
  p('churn3', P.churnTrolley, 200, 2010, 0.1),
  // Freight yard north: the shovel in the heap, a spilled lantern.
  p('shovel1', P.shovel, 4140, 325, 0.2, 40), p('lant3', () => P.lantern(), 3800, 740, 0, 30),
  // Signal box: lever frame, mug.
  p('levers', P.leverFrame, 4275, 1045, 0, 130), p('mug2', P.mugTin, 4410, 1010, 0.3, 30),
  // Turntable apron.
  p('chalk1', () => P.chalkNote('DO NOT TURN'), 3880, 2290, -0.04, 120), p('chalk1b', () => P.chalkNote('TRAIN WAITING', true), 4300, 2570, 0.03, 100),
  // Engine shed.
  p('bench1', P.toolBench, 5300, 1800, 0, 70), p('mug3', P.mugTin, 5710, 1800, 0, 30),
  // Goods office.
  p('scales1', P.scales, 3220, 1930, 0, 40),
  // Tunnel mouth: a keeper's lantern.
  p('lant4', () => P.lantern('#ff4a30'), 5560, 1200, 0, 30),
  // Level crossing: a lost scarf-tied hat? the keeper's lamp.
  p('lant5', () => P.lantern('#ff4a30'), 2800, 2620, 0, 30),
];
// Their half-turn twins are different places: mail sacks where luggage lay, a balloon on a bench, a gnome by the house.
const TWINS: Prop[] = [
  p('sacks1', P.mailSacks, ...turn(500, 1620), 0, 90), p('sacks2', P.mailSacks, ...turn(1190, 2040), 0.5, 90), p('churn4', P.churnTrolley, ...turn(520, 1030), 0.2),
  p('pig1', P.pigeonholes, 5200, 5610, 0, 90), p('mug4', P.mugTin, ...turn(1060, 402), 0, 30),
  p('balloon1', P.balloon, ...turn(2300, 1030), 0, 40), p('toy2', P.toyTrain, ...turn(2900, 1020), 0.9, 40),
  p('dart1', P.dartboard, 4630, 3520, 0, 40), p('cat2', P.cat, ...turn(1000, 2690), 0, 40), p('urn2', P.urn, ...turn(1275, 2290), 0, 40),
  p('gnome1', P.gnome, 2920, 3880, 0, 40), p('tub1', P.tub, 2300, 3850, 0, 40), p('tub2', P.tub, 2400, 4250, 0, 40),
  p('lant6', () => P.lantern('#9fd0ff'), ...turn(3800, 740), 0, 30), p('shovel2', P.shovel, ...turn(4140, 325), 0.2, 40), p('lever2', P.leverFrame, ...turn(4275, 1045), 0, 130),
  p('chalk2', () => P.chalkNote('CLOSED 1962', true), 480, 4500, 0.02, 100), p('bench2', P.toolBench, ...turn(5300, 1800), 0, 70), p('scales2', P.scales, ...turn(3220, 1930), 0, 40),
  p('lug3', P.luggage, ...turn(3010, 1200), 0, 90), p('ring2', P.lifeRing, ...turn(1760, 2480), 0, 30),
];
const ALL_PROPS = [...PROPS, ...TWINS].filter((q) => !(q.key === 'lug3'));

/* ----------------------------------------------------------- the lights */
type Lamp = { key: string; x: number; y: number; radius: number; color: string; intensity: number; flicker?: number; shadows?: boolean; size?: number };
const LAMPS: Lamp[] = [];
(function build() {
  const add = (l: Omit<Lamp, 'key'>, k: string) => { LAMPS.push({ key: `ry:${k}`, ...l }); const [tx, ty] = turn(l.x, l.y); LAMPS.push({ key: `ry:${k}t`, ...l, x: tx, y: ty }); };
  // Station: hanging lamps down the vault, over the counter, in each room.
  for (const [i, [x, y]] of ([[875, 1000], [875, 1525], [875, 2050], [500, 1275], [1250, 1275], [500, 1800], [1250, 1800]] as const).entries()) add({ x, y, radius: 330, color: '#ffd79a', intensity: 0.62, flicker: 0.05, size: 30, shadows: false }, `vault${i}`);
  add({ x: 875, y: 520, radius: 400, color: '#ffe6b8', intensity: 0.7, flicker: 0.04, size: 30, shadows: false }, 'tickets');
  add({ x: 575, y: 2500, radius: 300, color: '#ffbf80', intensity: 0.6, flicker: 0.08, size: 20, shadows: false }, 'waiting');
  add({ x: 1125, y: 2500, radius: 320, color: '#ffd9a0', intensity: 0.65, flicker: 0.06, size: 20, shadows: false }, 'buffet');
  // Platform canopies: a hanging lamp at each iron column, and the carriage windows spilling light.
  for (const yc of [525, 1025, 1525, 2025]) for (let c = 34; c < 70; c += 8) add({ x: c * 50 + 25, y: yc, radius: 230, color: '#ffc47a', intensity: 0.55, flicker: 0.06, size: 8, shadows: false }, `can${yc}-${c}`);
  for (let n = 0; n < 5; n++) for (const k of [0.3, 0.7]) add({ x: 1600 + n * 640 + 540 * k, y: 1300, radius: 190, color: '#ffc87a', intensity: 0.42, flicker: 0.05, size: 30, shadows: false }, `car${n}-${k}`);
  add({ x: 4800 + 200, y: 1300, radius: 240, color: '#ff9a50', intensity: 0.5, flicker: 0.3, size: 20, shadows: false }, 'loco-fire');
  add({ x: 5120 + 190, y: 1300, radius: 220, color: '#fff2c8', intensity: 0.55, size: 6, shadows: false }, 'loco-head');
  // Yard: the signal box windows, the hopper floodlight, the water tower lamp, the shed fire, the goods office.
  add({ x: 4275, y: 1000, radius: 330, color: '#ffb36a', intensity: 0.75, flicker: 0.07, size: 20 }, 'sigbox');
  add({ x: 3900, y: 450, radius: 380, color: '#fff0cf', intensity: 0.6, size: 20, shadows: false }, 'hopper');
  add({ x: 5250, y: 600, radius: 300, color: '#bfe6ff', intensity: 0.55, size: 16, shadows: false }, 'water');
  add({ x: 5260, y: 2000, radius: 380, color: '#ffa04a', intensity: 0.7, flicker: 0.2, size: 24 }, 'shed');
  add({ x: 3350, y: 1950, radius: 260, color: '#ffd28a', intensity: 0.6, flicker: 0.08, size: 14 }, 'goods');
  add({ x: 5620, y: 1300, radius: 220, color: '#ff5a38', intensity: 0.55, flicker: 0.12, size: 10 }, 'tunnel');
  add({ x: 4300, y: 2200, radius: 330, color: '#ffc47a', intensity: 0.5, size: 20, shadows: false }, 'turn');
  add({ x: 2000, y: 2650, radius: 240, color: '#ffbb70', intensity: 0.6, flicker: 0.1, size: 14 }, 'lamproom');
  add({ x: 2650, y: 2500, radius: 200, color: '#ffd28a', intensity: 0.5, size: 10 }, 'hut');
  add({ x: 3700, y: 2750, radius: 300, color: '#ffa860', intensity: 0.5, size: 16, shadows: false }, 'crane');
  add({ x: 1550, y: 2150, radius: 380, color: '#ffe3a8', intensity: 0.7, size: 30, shadows: false }, 'clock');
})();

/* ----------------------------------------------------------------- under */

export function railUnder(g: G, now: number, view: ThemeView, _map: MapDef) {
  void _map;
  const t = clock(now);
  for (const l of LAMPS) {
    if (!inV(view, l.x, l.y, l.radius + 100)) continue;
    setLight(l.key, { x: l.x, y: l.y, radius: l.radius, color: l.color, intensity: l.intensity, ...(l.flicker !== undefined && !calm && { flicker: l.flicker }), size: l.size ?? 10, shadows: l.shadows ?? false });
  }
  for (const q of ALL_PROPS) if (inV(view, q.x, q.y, (q.r ?? 90) + 40)) {
    // The balloon bobs on its string; the cat breathes.
    let dy = 0;
    if (q.key.startsWith('balloon') && !calm) dy = Math.sin(t * 0.0012) * 2;
    let sc = 1;
    if (q.key.startsWith('cat') && !calm) sc = 1 + Math.sin(t * 0.0016) * 0.025;
    if (sc !== 1) { g.save(); g.translate(q.x, q.y + 8); g.scale(1, sc); g.translate(-q.x, -q.y - 8); stamp(g, q.key, q.make, q.x, q.y, { rot: q.rot }); g.restore(); } else stamp(g, q.key, q.make, q.x, q.y + dy, { rot: q.rot });
  }
  // The signal box's lamp spills a warm square on the boards; the tunnel's lantern glows.
  for (const [x, y, c] of [[4275, 1000, '255, 190, 110'], [5560, 1200, '255, 70, 40']] as const) if (inV(view, x, y, 160)) {
    const gr = g.createRadialGradient(x, y, 4, x, y, 100); gr.addColorStop(0, `rgba(${c}, 0.2)`); gr.addColorStop(1, `rgba(${c}, 0)`); g.fillStyle = gr; g.fillRect(x - 100, y - 100, 200, 200);
  }
  // Drips at the water tower make slow rings in a puddle.
  for (const [x, y] of [[5250, 600], ...[turn(5250, 600)]] as const) if (inV(view, x, y, 90)) {
    g.fillStyle = 'rgba(30, 50, 60, 0.45)'; g.beginPath(); g.ellipse(x, y, 52, 20, 0, 0, TAU); g.fill();
    const k = ((t * 0.0006) % 1);
    g.strokeStyle = `rgba(190, 220, 235, ${(0.5 * (1 - k)).toFixed(3)})`; g.lineWidth = 1.5; g.beginPath(); g.ellipse(x, y, 6 + k * 40, 3 + k * 15, 0, 0, TAU); g.stroke();
  }
}

/* ----------------------------------------------------------------- signs */
type Sign = { a: string; b: string; x: number; y: number; vertical?: boolean; small?: boolean };
/** Names hung over doors and gates; each carries its north-west text and the half-turn twin's own. */
const SIGNS: readonly Sign[] = [
  { a: 'TICKET HALL', b: 'PARCELS OFFICE', x: 250, y: 525, vertical: true },
  { a: 'MAIN CONCOURSE', b: 'GOODS HALL', x: 250, y: 1275, vertical: true },
  { a: 'WAITING ROOMS', b: 'TELEGRAPH OFFICE', x: 250, y: 2475, vertical: true, small: true },
  { a: 'BUFFET', b: 'SIGNALMEN’S MESS', x: 1150, y: 2840, small: true },
  { a: 'PLATFORM 1', b: 'PLATFORM 5', x: 1478, y: 550, vertical: true, small: true },
  { a: 'PLATFORM 2', b: 'PLATFORM 6', x: 1478, y: 1050, vertical: true },
  { a: 'PLATFORM 3', b: 'PLATFORM 7', x: 1478, y: 1550, vertical: true },
  { a: 'PLATFORM 4', b: 'PLATFORM 8', x: 1478, y: 2000, vertical: true },
  { a: 'CLOCK COURT', b: 'HOIST YARD', x: 1900, y: 2260 },
  { a: 'LAMP ROOM', b: 'PLATELAYERS’ HUT', x: 2000, y: 2520, small: true },
  { a: 'CROSSING KEEPER', b: 'STATIONMASTER’S HOUSE', x: 2650, y: 2440, small: true },
  { a: 'LEVEL CROSSING', b: 'LEVEL CROSSING', x: 3000, y: 2580 },
  { a: 'FREIGHT YARD', b: 'MARSHALLING YARD', x: 3900, y: 240 },
  { a: 'COAL STAGE', b: 'COAL STAGE', x: 3900, y: 560, small: true },
  { a: 'SIGNAL BOX', b: 'PERMANENT WAY', x: 4275, y: 800, small: true },
  { a: 'WATER STOP', b: 'COALING TOWER', x: 5250, y: 640 },
  { a: 'TUNNEL MOUTH', b: 'SEALED TUNNEL', x: 5510, y: 940 },
  { a: 'TURNTABLE', b: 'OLD TURNTABLE', x: 4300, y: 1880 },
  { a: 'ENGINE SHED', b: 'CARRIAGE SHED', x: 4790, y: 2125, vertical: true },
  { a: 'GOODS OFFICE', b: 'STATIONMASTER’S HOUSE', x: 3350, y: 1775, small: true },
  { a: 'CRANE SIDING', b: 'SCRAPYARD', x: 3700, y: 2600 },
];
const plates = new Map<string, HTMLCanvasElement>();
function plate(text: string, small: boolean): HTMLCanvasElement {
  const key = `${text}|${small ? 1 : 0}`;
  let c = plates.get(key);
  if (c) return c;
  const size = small ? 15 : 19, padX = 14, h = size + 14;
  c = document.createElement('canvas');
  const g = c.getContext('2d')!;
  const font = `700 ${size}px "Barlow Condensed", "Arial Narrow", sans-serif`;
  g.font = font; (g as unknown as { letterSpacing: string }).letterSpacing = '2px';
  const w = Math.ceil(g.measureText(text).width) + padX * 2;
  c.width = w + 8; c.height = h + 22;
  g.font = font; (g as unknown as { letterSpacing: string }).letterSpacing = '2px';
  g.strokeStyle = INK; g.lineWidth = 3; g.beginPath(); g.moveTo(14, 0); g.lineTo(14, 14); g.moveTo(w - 6, 0); g.lineTo(w - 6, 14); g.stroke();
  g.strokeStyle = C.brass; g.lineWidth = 1.4; g.stroke();
  g.fillStyle = 'rgba(20, 24, 32, 0.3)'; g.fillRect(7, 17, w, h);
  g.fillStyle = '#24382d'; g.fillRect(4, 14, w, h);
  g.strokeStyle = C.brass; g.lineWidth = 2.4; g.strokeRect(7, 17, w - 6, h - 6);
  g.strokeStyle = INK; g.lineWidth = 2; g.strokeRect(4, 14, w, h);
  g.fillStyle = 'rgba(255, 255, 255, 0.12)'; g.fillRect(4, 14, w, 3);
  g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = '#efe6cc'; g.fillText(text, 4 + w / 2, 14 + h / 2 + 1);
  plates.set(key, c);
  return c;
}

/* ------------------------------------------------------------- the towers */

/** The clock tower: a brick shaft rising from the footprint, a stopped clock at 21:47, a belfry and a slate spire with a little locomotive weathervane. */
function clockTower(g: G, now: number, x: number, y: number, a: number) {
  // (x, y) is the footprint's south-centre; the shaft rises up-screen from there.
  g.save(); g.globalAlpha = a;
  const W = 150, H = 540, x0 = x - W / 2, top = y - H;
  g.fillStyle = 'rgba(8, 8, 12, 0.3)'; g.fillRect(x0 + 18, y - 20, W + 24, 32);
  g.fillStyle = C.brickFront; g.fillRect(x0, top, W, H); g.strokeStyle = INK; g.lineWidth = 3; g.strokeRect(x0, top, W, H);
  g.fillStyle = 'rgba(0, 0, 0, 0.22)'; g.fillRect(x0 + W * 0.72, top, W * 0.28, H);
  g.strokeStyle = 'rgba(20, 8, 6, 0.4)'; g.lineWidth = 1.2; g.beginPath(); for (let yy = top + 10; yy < y; yy += 10) { g.moveTo(x0, yy); g.lineTo(x0 + W, yy); } g.stroke();
  g.fillStyle = '#c9bfa6'; for (let yy = top + 6; yy < y - 10; yy += 56) { g.fillRect(x0, yy, 14, 14); g.fillRect(x0 + W - 14, yy, 14, 14); }
  for (const yy of [top + 190, top + 340]) { g.fillStyle = '#c9bfa6'; g.fillRect(x0 - 5, yy, W + 10, 8); g.strokeStyle = INK; g.lineWidth = 2; g.strokeRect(x0 - 5, yy, W + 10, 8); }
  // Arched lit windows on the lower shaft.
  for (const yy of [top + 410, top + 470]) { g.fillStyle = INK; g.beginPath(); g.moveTo(x - 14, yy + 40); g.lineTo(x - 14, yy + 10); g.arc(x, yy + 10, 14, Math.PI, 0); g.lineTo(x + 14, yy + 40); g.fill(); g.fillStyle = 'rgba(255, 200, 110, 0.85)'; g.beginPath(); g.moveTo(x - 10, yy + 38); g.lineTo(x - 10, yy + 10); g.arc(x, yy + 10, 10, Math.PI, 0); g.lineTo(x + 10, yy + 38); g.fill(); g.fillStyle = INK; g.fillRect(x - 1, yy, 2, 40); }
  // The clock: ivory face, brass ring, hands at 9:47.
  const cy = top + 110, r = 52;
  const gl = g.createRadialGradient(x, cy, r * 0.6, x, cy, r * 2.2); gl.addColorStop(0, 'rgba(255, 226, 160, 0.28)'); gl.addColorStop(1, 'rgba(255, 226, 160, 0)'); g.fillStyle = gl; g.fillRect(x - r * 2.2, cy - r * 2.2, r * 4.4, r * 4.4);
  g.fillStyle = C.brassLo; g.beginPath(); g.arc(x, cy, r + 8, 0, TAU); g.fill(); g.strokeStyle = INK; g.lineWidth = 2.5; g.stroke();
  g.fillStyle = C.brass; g.beginPath(); g.arc(x, cy, r + 5, 0, TAU); g.fill();
  g.fillStyle = '#efe8d2'; g.beginPath(); g.arc(x, cy, r, 0, TAU); g.fill(); g.strokeStyle = INK; g.lineWidth = 2; g.stroke();
  g.strokeStyle = INK; for (let i = 0; i < 12; i++) { const an = (i * TAU) / 12; g.lineWidth = i % 3 ? 2 : 4; g.beginPath(); g.moveTo(x + Math.cos(an) * (r - 4), cy + Math.sin(an) * (r - 4)); g.lineTo(x + Math.cos(an) * (r - (i % 3 ? 10 : 14)), cy + Math.sin(an) * (r - (i % 3 ? 10 : 14))); g.stroke(); }
  const hour = ((9 + 47 / 60) / 12) * TAU - Math.PI / 2, min = (47 / 60) * TAU - Math.PI / 2;
  g.lineCap = 'round'; g.strokeStyle = INK; g.lineWidth = 6; g.beginPath(); g.moveTo(x, cy); g.lineTo(x + Math.cos(hour) * r * 0.5, cy + Math.sin(hour) * r * 0.5); g.stroke();
  g.lineWidth = 4; g.beginPath(); g.moveTo(x, cy); g.lineTo(x + Math.cos(min) * r * 0.8, cy + Math.sin(min) * r * 0.8); g.stroke();
  g.fillStyle = C.brass; g.beginPath(); g.arc(x, cy, 4, 0, TAU); g.fill();
  g.lineCap = 'butt';
  // Belfry: louvred arches, then the spire.
  const bt = top - 70;
  g.fillStyle = '#6a2c22'; g.fillRect(x0 + 8, bt, W - 16, 70); g.strokeStyle = INK; g.lineWidth = 3; g.strokeRect(x0 + 8, bt, W - 16, 70);
  for (const dx of [-38, 0, 38]) { g.fillStyle = INK; g.beginPath(); g.moveTo(x + dx - 14, bt + 62); g.lineTo(x + dx - 14, bt + 24); g.arc(x + dx, bt + 24, 14, Math.PI, 0); g.lineTo(x + dx + 14, bt + 62); g.fill(); g.strokeStyle = '#8a4a3a'; g.lineWidth = 1.5; for (let i = 0; i < 6; i++) { g.beginPath(); g.moveTo(x + dx - 12, bt + 30 + i * 6); g.lineTo(x + dx + 12, bt + 30 + i * 6); g.stroke(); } }
  g.fillStyle = C.slate; g.beginPath(); g.moveTo(x0 - 6, bt); g.lineTo(x, bt - 120); g.lineTo(x0 + W + 6, bt); g.closePath(); g.fill(); g.strokeStyle = INK; g.lineWidth = 3; g.stroke();
  g.fillStyle = C.slateHi; g.beginPath(); g.moveTo(x0 - 6, bt); g.lineTo(x, bt - 120); g.lineTo(x - 8, bt); g.closePath(); g.fill();
  g.strokeStyle = 'rgba(14, 16, 22, 0.5)'; g.lineWidth = 1.4; g.beginPath(); for (let i = 1; i < 6; i++) { const yy = bt - 20 * i, hw = (W / 2 + 6) * (1 - (20 * i) / 120); g.moveTo(x - hw, yy); g.lineTo(x + hw, yy); } g.stroke();
  // A weathervane in the shape of a locomotive, turning very slowly in the wind.
  const sway = calm ? 0 : Math.sin(now * 0.0004) * 0.3;
  g.strokeStyle = INK; g.lineWidth = 3; g.beginPath(); g.moveTo(x, bt - 120); g.lineTo(x, bt - 150); g.stroke();
  g.save(); g.translate(x, bt - 146); g.scale(Math.cos(sway) * (Math.sin(now * 0.0004) < 0 ? -1 : 1), 1);
  g.fillStyle = INK; g.fillRect(-14, -6, 24, 9); g.fillRect(4, -12, 5, 7); g.fillRect(-14, -12, 8, 6); g.beginPath(); g.arc(-8, 5, 3.4, 0, TAU); g.arc(2, 5, 3.4, 0, TAU); g.fill();
  g.restore();
  g.restore();
}

/** The hoist tower: the twin's goods lift, a timber and iron derrick with a pulley and a crate swinging slowly on its rope. */
function hoistTower(g: G, now: number, x: number, y: number, a: number) {
  g.save(); g.globalAlpha = a;
  const W = 150, H = 330, x0 = x - W / 2, top = y - H;
  g.fillStyle = 'rgba(8, 8, 12, 0.3)'; g.fillRect(x0 + 18, y - 20, W + 24, 32);
  g.fillStyle = '#5a4a38'; g.fillRect(x0, top, W, H); g.strokeStyle = INK; g.lineWidth = 3; g.strokeRect(x0, top, W, H);
  g.strokeStyle = 'rgba(10, 6, 2, 0.5)'; g.lineWidth = 1.4; g.beginPath(); for (let xx = x0 + 10; xx < x0 + W; xx += 10) { g.moveTo(xx, top); g.lineTo(xx, y); } g.stroke();
  g.fillStyle = 'rgba(0, 0, 0, 0.22)'; g.fillRect(x0 + W * 0.72, top, W * 0.28, H);
  g.strokeStyle = C.iron; g.lineWidth = 6; for (const yy of [top + 60, top + 160, top + 260]) { g.beginPath(); g.moveTo(x0, yy); g.lineTo(x0 + W, yy); g.stroke(); }
  // Loading doors, a lit one open.
  for (const [yy, lit] of [[top + 200, true], [top + 90, false]] as const) { g.fillStyle = INK; g.fillRect(x - 30, yy, 60, 50); g.fillStyle = lit ? 'rgba(255, 190, 110, 0.85)' : '#2a2c32'; g.fillRect(x - 27, yy + 3, 54, 44); g.fillStyle = INK; g.fillRect(x - 1, yy + 3, 2, 44); }
  // Beam, pulley, rope and crate.
  g.fillStyle = '#6a4a2a'; g.fillRect(x - 10, top - 40, 120, 14); g.strokeStyle = INK; g.lineWidth = 2.5; g.strokeRect(x - 10, top - 40, 120, 14);
  g.strokeStyle = '#6a4a2a'; g.lineWidth = 6; g.beginPath(); g.moveTo(x, top); g.lineTo(x, top - 40); g.moveTo(x + 40, top); g.lineTo(x + 100, top - 28); g.stroke();
  const sw = calm ? 0 : Math.sin(now * 0.0007) * 10;
  g.fillStyle = '#8a8f98'; g.beginPath(); g.arc(x + 104, top - 33, 8, 0, TAU); g.fill(); g.strokeStyle = INK; g.lineWidth = 2; g.stroke();
  g.strokeStyle = '#c9b88a'; g.lineWidth = 2.5; g.beginPath(); g.moveTo(x + 104, top - 25); g.lineTo(x + 104 + sw, top + 70); g.stroke();
  g.fillStyle = '#b79a68'; g.fillRect(x + 84 + sw, top + 70, 40, 34); g.strokeStyle = INK; g.lineWidth = 2.5; g.strokeRect(x + 84 + sw, top + 70, 40, 34); g.strokeStyle = '#6a4a2a'; g.lineWidth = 2; g.beginPath(); g.moveTo(x + 84 + sw, top + 70); g.lineTo(x + 124 + sw, top + 104); g.moveTo(x + 124 + sw, top + 70); g.lineTo(x + 84 + sw, top + 104); g.stroke();
  g.fillStyle = C.red; g.beginPath(); g.moveTo(x - 4, top - 40); g.lineTo(x - 4, top - 76); g.lineTo(x + 28, top - 66); g.lineTo(x - 4, top - 56); g.fill(); g.strokeStyle = INK; g.lineWidth = 2; g.stroke();
  g.restore();
}

/** The rusty crane's lattice mast and jib with a swaying hook, drawn thin so it never hides a player. */
function crane(g: G, now: number, bx: number, by: number, dir: 1 | -1) {
  g.save();
  const mastTop = by - 380, jx = bx + dir * 420;
  g.lineCap = 'round'; g.lineJoin = 'round';
  const lattice = (x0: number, y0: number, x1: number, y1: number, w: number, n: number) => {
    const dx = x1 - x0, dy = y1 - y0, L = Math.hypot(dx, dy), nx = -dy / L, ny = dx / L;
    g.strokeStyle = C.rustLo; g.lineWidth = 6; g.beginPath(); g.moveTo(x0 + nx * w, y0 + ny * w); g.lineTo(x1 + nx * w, y1 + ny * w); g.moveTo(x0 - nx * w, y0 - ny * w); g.lineTo(x1 - nx * w, y1 - ny * w); g.stroke();
    g.strokeStyle = C.rust; g.lineWidth = 3; g.beginPath(); g.moveTo(x0 + nx * w, y0 + ny * w); g.lineTo(x1 + nx * w, y1 + ny * w); g.moveTo(x0 - nx * w, y0 - ny * w); g.lineTo(x1 - nx * w, y1 - ny * w); g.stroke();
    g.lineWidth = 2.2; g.beginPath(); for (let i = 0; i < n; i++) { const t0 = i / n, t1 = (i + 1) / n, s = i % 2 ? 1 : -1; g.moveTo(x0 + dx * t0 + nx * w * s, y0 + dy * t0 + ny * w * s); g.lineTo(x0 + dx * t1 - nx * w * s, y0 + dy * t1 - ny * w * s); } g.stroke();
  };
  g.globalAlpha = 0.92;
  lattice(bx, by - 20, bx, mastTop, 22, 14);
  lattice(bx - dir * 150, mastTop + 30, jx, mastTop + 10, 10, 18);
  g.fillStyle = '#6a6c74'; g.fillRect(bx - dir * 160 - 14, mastTop + 20, 36, 40); g.strokeStyle = INK; g.lineWidth = 2; g.strokeRect(bx - dir * 160 - 14, mastTop + 20, 36, 40);
  g.fillStyle = '#7a5a2a'; g.fillRect(bx - 16, mastTop - 12, 32, 24); g.strokeRect(bx - 16, mastTop - 12, 32, 24);
  g.fillStyle = 'rgba(255, 224, 150, 0.9)'; g.fillRect(bx - 10 + dir * 4, mastTop - 6, 12, 10);
  const sw = calm ? 0 : Math.sin(now * 0.0006 + bx) * 14, hy = mastTop + 190;
  g.strokeStyle = '#2a2c32'; g.lineWidth = 2.5; g.beginPath(); g.moveTo(jx - dir * 30, mastTop + 12); g.lineTo(jx - dir * 30 + sw, hy); g.stroke();
  g.strokeStyle = C.brass; g.lineWidth = 5; g.beginPath(); g.arc(jx - dir * 30 + sw, hy + 8, 9, -0.5, Math.PI + 0.5); g.stroke();
  g.fillStyle = '#7a5a2a'; g.fillRect(jx - dir * 30 + sw - 22, hy + 22, 44, 30); g.strokeStyle = INK; g.lineWidth = 2; g.strokeRect(jx - dir * 30 + sw - 22, hy + 22, 44, 30);
  g.restore();
}

/** A semaphore signal post: the arm sags and lifts over a minute; its lamp turns red or green with it. */
function semaphore(g: G, now: number, x: number, y: number, i: number) {
  const phase = calm ? 0 : ((now / 1000 + i * 17) % 60) / 60;
  const clear = phase > 0.5;
  const arm = clear ? -0.5 : 0, ease = calm ? 0 : Math.min(1, Math.abs(phase - 0.5) * 20, Math.abs(phase) * 20, Math.abs(1 - phase) * 20);
  void ease;
  g.save(); g.translate(x, y);
  g.fillStyle = 'rgba(8, 8, 12, 0.3)'; g.fillRect(-4, -4, 24, 8);
  g.fillStyle = '#d8d4c4'; g.fillRect(-4, -150, 8, 150); g.strokeStyle = INK; g.lineWidth = 2; g.strokeRect(-4, -150, 8, 150);
  g.fillStyle = C.ink; for (let k = 0; k < 7; k++) g.fillRect(-4, -140 + k * 20, 8, 3);
  g.save(); g.translate(4, -138); g.rotate(arm);
  g.fillStyle = C.red; g.fillRect(0, -6, 52, 12); g.strokeStyle = INK; g.strokeRect(0, -6, 52, 12); g.fillStyle = '#efe8d4'; g.fillRect(34, -6, 8, 12);
  g.restore();
  const col = clear ? C.signalGreen : '#ff5a40';
  const gr = g.createRadialGradient(0, -118, 1, 0, -118, 30); gr.addColorStop(0, col); gr.addColorStop(1, 'rgba(0,0,0,0)'); g.globalAlpha = 0.5; g.fillStyle = gr; g.fillRect(-30, -148, 60, 60); g.globalAlpha = 1;
  g.fillStyle = INK; g.fillRect(-9, -128, 18, 20); g.fillStyle = col; g.beginPath(); g.arc(0, -118, 5, 0, TAU); g.fill();
  g.restore();
  setLight(`ry:sig${i}`, { x, y: y - 100, radius: 120, color: clear ? '#5be08a' : '#ff5a40', intensity: 0.4, size: 4, shadows: false });
}

/* ---------------------------------------------------------------- steam */
type Vent = { x: number; y: number; r: number; n: number; speed: number; dx: number; dy: number; a: number };
const VENTS: Vent[] = [
  { x: 5371, y: 1262, r: 20, n: 7, speed: 0.00022, dx: -90, dy: -150, a: 0.34 },
  { x: 629, y: 4738, r: 20, n: 7, speed: 0.00022, dx: 90, dy: 150, a: 0.34 },
  { x: 1275, y: 2265, r: 8, n: 4, speed: 0.0003, dx: 10, dy: -50, a: 0.28 },
  { x: 4725, y: 3735, r: 8, n: 4, speed: 0.0003, dx: -10, dy: 50, a: 0.28 },
  { x: 5250, y: 560, r: 10, n: 3, speed: 0.00016, dx: 20, dy: -40, a: 0.2 },
  { x: 3830, y: 1250, r: 6, n: 3, speed: 0.00024, dx: -6, dy: -30, a: 0.16 }, { x: 2330, y: 1350, r: 6, n: 3, speed: 0.00024, dx: 6, dy: 30, a: 0.16 },
];
function steam(g: G, now: number, v: ThemeView) {
  for (const s of VENTS) {
    if (!inV(v, s.x, s.y, 220)) continue;
    for (let i = 0; i < s.n; i++) {
      const k = calm ? (i + 0.5) / s.n * 0.8 : ((now * s.speed + i / s.n) % 1);
      const r = s.r * (1 + k * 3.4), x = s.x + s.dx * k + Math.sin(k * 6 + i) * 8, y = s.y + s.dy * k;
      const a = s.a * Math.sin(Math.PI * Math.min(1, k * 1.15)) * 0.9;
      const gr = g.createRadialGradient(x, y, 0, x, y, r); gr.addColorStop(0, `rgba(226, 232, 240, ${a.toFixed(3)})`); gr.addColorStop(1, 'rgba(226, 232, 240, 0)'); g.fillStyle = gr; g.fillRect(x - r, y - r, r * 2, r * 2);
    }
  }
}

/* ------------------------------------------------------- departures board */
function board(g: G, now: number, x: number, y: number, turned: boolean) {
  const W = 330, H = 96, x0 = x - W / 2;
  const flick = calm ? 1 : 0.9 + 0.1 * Math.max(0, Math.sin(now * 0.0011 + x) * Math.sin(now * 0.00041));
  g.fillStyle = 'rgba(8, 8, 12, 0.3)'; g.fillRect(x0 + 4, y + 8, W, H);
  g.strokeStyle = INK; g.lineWidth = 3; g.beginPath(); g.moveTo(x0 + 30, y - 40); g.lineTo(x0 + 30, y); g.moveTo(x0 + W - 30, y - 40); g.lineTo(x0 + W - 30, y); g.stroke();
  g.fillStyle = '#12161c'; g.fillRect(x0, y, W, H); g.strokeStyle = C.brass; g.lineWidth = 3; g.strokeRect(x0 + 2, y + 2, W - 4, H - 4); g.strokeStyle = INK; g.lineWidth = 2; g.strokeRect(x0, y, W, H);
  g.fillStyle = C.brass; g.font = '700 14px "Barlow Condensed", sans-serif'; g.textAlign = 'left'; g.textBaseline = 'middle'; g.fillText(turned ? 'DESPATCHES' : 'DEPARTURES', x0 + 12, y + 14);
  const rows: [string, string, string, string][] = turned
    ? [['21:30', 'MAIL TO THE NORTH', '6', 'LOADING'], ['21:47', 'NIGHT MAIL', '7', 'HELD'], ['—', 'ALL OTHERS', '', 'CANCELLED']]
    : [['21:47', 'NIGHT EXPRESS', '2', 'ON TIME'], ['22:10', 'COAST STOPPING', '4', 'CANCELLED'], ['22:35', 'CITY SLEEPER', '1', 'CANCELLED']];
  rows.forEach(([tm, dest, pl, st], i) => {
    const yy = y + 36 + i * 20, bad = st === 'CANCELLED';
    g.fillStyle = `rgba(255, 190, 90, ${(0.9 * flick).toFixed(3)})`; g.font = '700 15px "Barlow Condensed", monospace'; g.fillText(tm, x0 + 12, yy); g.fillText(dest, x0 + 62, yy); g.fillText(pl, x0 + 210, yy);
    g.fillStyle = bad ? `rgba(255, 90, 70, ${(0.9 * flick).toFixed(3)})` : `rgba(120, 255, 170, ${(0.9 * flick).toFixed(3)})`; g.fillText(st, x0 + 236, yy);
  });
  const gr = g.createRadialGradient(x, y + H / 2, 10, x, y + H / 2, 220); gr.addColorStop(0, `rgba(255, 190, 90, ${(0.12 * flick).toFixed(3)})`); gr.addColorStop(1, 'rgba(255, 190, 90, 0)'); g.fillStyle = gr; g.fillRect(x - 220, y - 100, 440, 320);
}

/* ------------------------------------------------------------------ over */

const fade = new Map<string, number>();
function fadeFor(key: string, hidden: boolean, now: number): number {
  const a = fade.get(key) ?? 1, t = hidden ? 0.28 : 1;
  const n = a + Math.sign(t - a) * Math.min(Math.abs(t - a), 0.06);
  fade.set(key, n);
  void now;
  return n;
}

export function railOver(g: G, now: number, view: ThemeView, _map: MapDef, bodies: readonly { x: number; y: number }[]) {
  void _map;
  const t = clock(now);
  // Signs over every door and gate.
  for (const s of SIGNS) for (const turned of [false, true]) {
    const [x, y] = turned ? turn(s.x, s.y) : [s.x, s.y];
    if (!inV(view, x, y, 150)) continue;
    const img = plate(turned ? s.b : s.a, !!s.small);
    g.save(); g.translate(x, y); if (s.vertical) g.rotate(-Math.PI / 2); g.drawImage(img, -img.width / 2, -14); g.restore();
  }
  // Departure boards hung in the two great halls.
  if (inV(view, 875, 960, 260)) board(g, t, 875, 935, false);
  { const [bx, by] = turn(875, 935); if (inV(view, bx, by, 260)) board(g, t, bx, by - 96, true); }
  steam(g, t, view);
  // The towers thin out when someone stands in the part of the screen they cover.
  const hideBox = (cx: number, cy: number, w: number, h: number) => (bodies ?? []).some((b) => Math.abs(b.x - cx) < w && b.y > cy - h && b.y < cy + 30);
  for (const [tx, ty, kind] of [[1550, 2400, 'clock'], ...[[...turn(1550, 2400), 'hoist']]] as const) {
    if (!inV(view, tx, ty - 260, 320)) continue;
    const a = fadeFor(`tower:${kind}`, hideBox(tx, ty, 180, 560), now);
    if (kind === 'clock') clockTower(g, t, tx, ty, a); else hoistTower(g, t, tx, ty, a);
  }
  // The rusty cranes lean over the yards, the signals stand along the throat.
  if (inV(view, 3700, 2500, 560)) crane(g, t, 3700, 2750, 1);
  { const [cx, cy] = turn(3700, 2750); if (inV(view, cx, cy - 250, 560)) crane(g, t, cx, cy, -1); }
  for (const [i, [x, y]] of ([[3560, 880], [3560, 1370], [3560, 1850], [2750, 2250]] as const).entries()) {
    if (inV(view, x, y - 100, 100)) semaphore(g, t, x, y, i);
    const [tx, ty] = turn(x, y); if (inV(view, tx, ty - 100, 100)) semaphore(g, t, tx, ty, i + 9);
  }
  // Fireflies drift above the old turntable, where the weeds have won.
  const fx = 1700, fy = 3800;
  if (inV(view, fx, fy, 320)) for (let i = 0; i < 9; i++) {
    const u = t * 0.0003 + i * 7.3, x = fx + Math.sin(u * 1.1 + i) * 230, y = fy + Math.cos(u * 0.8 + i * 2) * 200;
    const a = 0.25 + 0.75 * Math.max(0, Math.sin(u * 3 + i)); // a slow pulse, well under 1 Hz
    const gr = g.createRadialGradient(x, y, 0, x, y, 14); gr.addColorStop(0, `rgba(230, 255, 140, ${(0.6 * a).toFixed(3)})`); gr.addColorStop(1, 'rgba(230, 255, 140, 0)'); g.fillStyle = gr; g.fillRect(x - 14, y - 14, 28, 28);
    g.fillStyle = `rgba(250, 255, 200, ${a.toFixed(3)})`; g.fillRect(x - 1, y - 1, 2, 2);
  }
  void DISTRICTS; void districtAt; void hash;
}
