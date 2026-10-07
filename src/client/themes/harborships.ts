import { halfTurn } from '../../shared/geom.ts';
import { PLACED_SHIPS, QUAY, SIZE, type PlacedShip } from '../../shared/maps/causewaydata.ts';
import { INK } from '../palette.ts';
import { C, TAU, calm, clock, hash2, hexA, painted, sprite, stamp, trace } from './harborkit.ts';
import { drawVehicle, vehicleSprite, type VehicleKind } from '../vehicleart.ts';

/** The ships whose hull the vehicle kit drew (by group id): their gunwale bands then skip the hand art (harborpolys.ts). */
export const kitHulls = new Set<string>();
const HULL_KIT: Record<PlacedShip['kind'], { kind: VehicleKind; livery: [string, string] }> = {
  container: { kind: 'containerShip', livery: ['blue', 'green'] },
  trawler: { kind: 'trawler', livery: ['white', 'blue'] },
  patrol: { kind: 'patrolBoat', livery: ['grey', 'green'] },
};

/**
 * The moored ships: their liveries, the slow swell they ride, their decks (planking, bay lashing points, painted names,
 * walkways), the gangways and the mooring lines to the quay. Collision never moves; only the drawing rides the water.
 */

export type Livery = { hull: string; cap: string; stripe: string; deck: string; deckHi: string; accent: string };

const LIVERIES: Record<string, Livery> = {
  kestrel: { hull: '#2c3e57', cap: '#cfcbbb', stripe: '#a8442e', deck: '#6b6a5e', deckHi: '#84826f', accent: '#d8d2b8' },
  'kestrel~': { hull: '#24402f', cap: '#d8d2b8', stripe: '#b58e32', deck: '#5f6a5a', deckHi: '#788670', accent: '#e8e0c0' },
  trawler: { hull: '#d6dad3', cap: '#c04a30', stripe: '#2f5f8c', deck: '#7a6a52', deckHi: '#957f60', accent: '#2f5f8c' },
  'trawler~': { hull: '#2a4f78', cap: '#e0d6b0', stripe: '#c04a30', deck: '#74664e', deckHi: '#8e7a5a', accent: '#e8c040' },
  patrol: { hull: '#6d7d84', cap: '#aab4b8', stripe: '#3a464c', deck: '#55605f', deckHi: '#6a7673', accent: '#d8d4c4' },
  'patrol~': { hull: '#5a6a58', cap: '#a8b0a0', stripe: '#2e3a30', deck: '#4c5a4a', deckHi: '#62705e', accent: '#e0dcc4' },
  cutter: { hull: '#6d7d84', cap: '#aab4b8', stripe: '#8a2e22', deck: '#55605f', deckHi: '#6a7673', accent: '#d8d4c4' },
};
export const liveryOf = (group: string): Livery => LIVERIES[group] ?? LIVERIES.kestrel!;

/** The swell: a slow lift and a hair of roll, a different phase for every hull. Nothing faster than 0.2 Hz. */
export function bobOf(id: string, now: number): { dy: number; roll: number } {
  const t = clock(now) * 0.001;
  const ph = hash2(id.length * 31 + id.charCodeAt(0), id.charCodeAt(id.length - 1)) * TAU;
  return { dy: Math.sin(t * 0.9 + ph) * 1.7 + Math.sin(t * 0.37 + ph * 2) * 0.8, roll: Math.sin(t * 0.7 + ph) * 0.004 };
}

const NAMES: Record<string, string> = { kestrel: 'KESTREL', trawler: 'MARY ELLEN', patrol: 'PB-17' };

function deckSprite(s: PlacedShip) {
  const key = `deck:${s.id}`;
  const pts = s.hull;
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const p of pts) { x0 = Math.min(x0, p.x); y0 = Math.min(y0, p.y); x1 = Math.max(x1, p.x); y1 = Math.max(y1, p.y); }
  const lv = liveryOf(s.east ? `${s.kind === 'container' ? 'kestrel' : s.kind}~` : s.kind === 'container' ? 'kestrel' : s.kind);
  return { x0, y0, sprite: sprite(key, x1 - x0, y1 - y0, 20, (g) => {
    g.translate(-x0, -y0);
    trace(g, pts);
    g.fillStyle = lv.deck; g.fill();
    g.save(); g.clip();
    // Planking along the ship, laid in strakes with butts.
    const north = s.east ? false : true;
    void north;
    g.strokeStyle = 'rgba(20, 22, 20, 0.28)'; g.lineWidth = 2;
    const along = 'y';
    void along;
    for (let x = Math.floor(x0 / 30) * 30; x < x1; x += 30) { g.beginPath(); g.moveTo(x, y0); g.lineTo(x, y1); g.stroke(); }
    g.strokeStyle = 'rgba(255, 255, 255, 0.05)';
    for (let x = Math.floor(x0 / 30) * 30 + 2; x < x1; x += 30) { g.beginPath(); g.moveTo(x, y0); g.lineTo(x, y1); g.stroke(); }
    g.strokeStyle = 'rgba(20, 22, 20, 0.2)'; g.lineWidth = 1.6;
    for (let x = Math.floor(x0 / 30) * 30; x < x1; x += 30) for (let y = y0; y < y1; y += 120) { const yy = y + hash2(x, Math.round(y)) * 110; g.beginPath(); g.moveTo(x, yy); g.lineTo(x + 30, yy); g.stroke(); }
    // Weathering.
    for (let i = 0; i < 26; i++) { const px = x0 + hash2(i, 3) * (x1 - x0), py = y0 + hash2(5, i) * (y1 - y0); g.fillStyle = hash2(i, 9) < 0.5 ? 'rgba(20,20,18,0.14)' : 'rgba(255,255,240,0.05)'; g.beginPath(); g.ellipse(px, py, 18 + hash2(i, 1) * 30, 8 + hash2(i, 2) * 14, hash2(i, 4) * 3, 0, TAU); g.fill(); }
    // Lashing points over the cargo bays of the container ship.
    if (s.kind === 'container') { g.fillStyle = 'rgba(20,22,20,0.4)'; for (let y = y0 + 440; y < y1 - 220; y += 52) for (const x of s.east ? [SIZE - QUAY + 90, SIZE - QUAY + 360] : [QUAY - 90, QUAY - 360]) { g.beginPath(); g.arc(x, y, 3.4, 0, TAU); g.fill(); } }
    g.restore();
    trace(g, pts); g.strokeStyle = INK; g.lineWidth = 2; g.stroke();
  }) };
}

/**
 * Ship decks and their gangways and lines, drawn straight over the water and under every wall. The hull (sides, gunwale rail,
 * boot-topping, tyres) is the vehicle kit's deck-open model (docs/maps/VEHICLES.md); the walkable deck, its furniture and rooms,
 * gangways and water stay here, and the hand-drawn shadow and gunwales are the fallback while the hull bakes.
 */
export function drawShips(g: CanvasRenderingContext2D, now: number, view: { x0: number; y0: number; x1: number; y1: number }): void {
  for (const s of PLACED_SHIPS) {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const p of s.hull) { x0 = Math.min(x0, p.x); y0 = Math.min(y0, p.y); x1 = Math.max(x1, p.x); y1 = Math.max(y1, p.y); }
    if (x1 < view.x0 - 80 || x0 > view.x1 + 80 || y1 < view.y0 - 80 || y0 > view.y1 + 80) continue;
    const { dy } = bobOf(s.id, now);
    const d = deckSprite(s);
    g.save();
    const kit = HULL_KIT[s.kind];
    const hull = { x: (x0 + x1) / 2, y: (y0 + y1) / 2 + dy, rot: s.east ? Math.PI / 2 : -Math.PI / 2, livery: kit.livery[s.east ? 1 : 0], variant: 'deck', t: now };
    const ready = !!vehicleSprite(kit.kind, hull);
    // A soft shadow of the hull on the water.
    g.fillStyle = 'rgba(8, 24, 32, 0.32)';
    trace(g, s.hull.map((p) => ({ x: p.x + (s.east ? 7 : -7), y: p.y + 9 + dy })));
    g.fill();
    // The deck, then the hull over it: its deck is cut open, so only the gunwale rail and the sides cover the deck's edge.
    stamp(g, d.sprite, d.x0, d.y0 + dy);
    if (ready && drawVehicle(g, kit.kind, hull)) kitHulls.add(s.id);
    // The ship's name painted large on the deck, on the foredeck for the west half, aft for the east.
    const name = s.name;
    const span = y1 - y0;
    const cx = (x0 + x1) / 2, cy = s.east ? y0 + span * 0.2 : y0 + span * 0.78;
    const size = Math.min(70, (x1 - x0) * 0.28);
    if (s.kind === 'trawler') painted(g, name, cx, cy + dy, size, hexA('#e8e4d0', 0.5), -Math.PI / 2 * (s.east ? -1 : 1), 0.2);
    g.restore();
  }
}

type Gap = { x: number; y: number; w: number; east: boolean };

/** The gangways: a plank ramp between quay and deck with a rope rail either side. */
export function drawGangways(g: CanvasRenderingContext2D, now: number, view: { x0: number; y0: number; x1: number; y1: number }): void {
  for (const s of PLACED_SHIPS) {
    const { dy } = bobOf(s.id, now);
    for (const gw of s.ship.gangways) {
      const west = { x: gw.x, y: gw.y, w: gw.w, h: gw.h };
      const r = s.east ? halfTurn([{ x: west.x, y: west.y }, { x: west.x + west.w, y: west.y + west.h }], SIZE) : [{ x: west.x, y: west.y }, { x: west.x + west.w, y: west.y + west.h }];
      const x = Math.min(r[0]!.x, r[1]!.x), y = Math.min(r[0]!.y, r[1]!.y), w = Math.abs(r[1]!.x - r[0]!.x), h = Math.abs(r[1]!.y - r[0]!.y);
      if (x + w < view.x0 || x > view.x1 || y + h < view.y0 || y > view.y1) continue;
      const slack = h * 0.12;
      // Planks, a shadow, and the two hand ropes on posts.
      g.save();
      g.fillStyle = 'rgba(10,14,18,0.28)'; g.fillRect(x + 4, y + slack + 5 + dy * 0.3, w, h - slack * 2);
      g.fillStyle = '#8f7048'; g.fillRect(x, y + slack, w, h - slack * 2);
      g.strokeStyle = 'rgba(40,26,14,0.55)'; g.lineWidth = 2;
      for (let xx = x + 8; xx < x + w; xx += 12) { g.beginPath(); g.moveTo(xx, y + slack); g.lineTo(xx, y + h - slack); g.stroke(); }
      g.fillStyle = '#6a5034'; g.fillRect(x, y + slack, w, 4); g.fillRect(x, y + h - slack - 4, w, 4);
      g.strokeStyle = INK; g.lineWidth = 2; g.strokeRect(x, y + slack, w, h - slack * 2);
      for (const yy of [y + slack - 6, y + h - slack + 6]) {
        g.strokeStyle = '#d8cfb0'; g.lineWidth = 3; g.beginPath(); g.moveTo(x - 6, yy); g.lineTo(x + w + 6, yy); g.stroke();
        g.strokeStyle = INK; g.lineWidth = 1; g.stroke();
        g.fillStyle = '#4a4f56';
        for (const xx of [x - 6, x + w + 6]) { g.beginPath(); g.arc(xx, yy, 4, 0, TAU); g.fill(); g.strokeStyle = INK; g.lineWidth = 1.6; g.stroke(); }
      }
      g.restore();
    }
  }
}

/** Mooring lines between the hull's cleats and the quay's bollards, swaying a pixel or two, and a tyre fender at each berth. */
export function drawMoorings(g: CanvasRenderingContext2D, now: number, view: { x0: number; y0: number; x1: number; y1: number }): void {
  const t = clock(now) * 0.001;
  for (const s of PLACED_SHIPS) {
    let y0 = Infinity, y1 = -Infinity;
    for (const p of s.hull) { y0 = Math.min(y0, p.y); y1 = Math.max(y1, p.y); }
    if (y1 < view.y0 - 60 || y0 > view.y1 + 60) continue;
    const dir = s.east ? 1 : -1, quay = s.east ? SIZE - QUAY : QUAY;
    const { dy } = bobOf(s.id, now);
    const marks = [y0 + (y1 - y0) * 0.24, y0 + (y1 - y0) * 0.76];
    for (const [i, my] of marks.entries()) {
      const bx = quay - dir * 26, by = my + (i ? 70 : -70);
      const sway = calm ? 0 : Math.sin(t * 0.8 + my * 0.01) * 2.2;
      // The bollard on the quay: a squat steel mushroom with a shadow.
      g.fillStyle = 'rgba(10,12,16,0.34)'; g.beginPath(); g.ellipse(bx + 5, by + 7, 15, 9, 0, 0, TAU); g.fill();
      g.fillStyle = '#3d4249'; g.beginPath(); g.arc(bx, by, 14, 0, TAU); g.fill(); g.strokeStyle = INK; g.lineWidth = 2; g.stroke();
      g.fillStyle = '#6a727a'; g.beginPath(); g.arc(bx - 2, by - 2, 9, 0, TAU); g.fill(); g.stroke();
      // The line, sagging toward the water, to a cleat on the gunwale.
      const cx = quay + dir * 0 - dir * 40, cy = my + dy;
      g.strokeStyle = INK; g.lineWidth = 5; g.lineCap = 'round';
      g.beginPath(); g.moveTo(bx, by); g.quadraticCurveTo((bx + cx) / 2 + sway, (by + cy) / 2 + 14, cx, cy); g.stroke();
      g.strokeStyle = '#c4aa78'; g.lineWidth = 3; g.stroke();
      // A fender between hull and quay.
      const fy = my + (i ? -60 : 60);
      g.fillStyle = '#1f2124'; g.beginPath(); g.ellipse(quay - dir * 2, fy + dy, 10, 17, 0, 0, TAU); g.fill(); g.strokeStyle = INK; g.lineWidth = 2; g.stroke();
      g.fillStyle = 'rgba(255,255,255,0.18)'; g.beginPath(); g.ellipse(quay - dir * 4, fy - 4 + dy, 3, 7, 0, 0, TAU); g.fill();
    }
  }
}
export { C, NAMES };
