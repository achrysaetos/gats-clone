/**
 * Sub Pen polygons and doors. Bulkhead rooms are painted by the same bulkhead painter as the grid walls, the boat's cigar is left to the
 * boat overlay in subpen.ts (which draws it moored in the slip), fuel tanks are riveted drums, hatches are round-cornered steel with a wheel,
 * and the torpedo store's blast door is a slab striped with hazard paint. Roofs are standing-seam metal and corrugated sheet (roofart.ts).
 */
import type { MapDoor, MapPoly } from '../../shared/geom.ts';
import type { GeoInfo, PolyLook } from '../geoart.ts';
import { INK } from '../palette.ts';
import { drawVehicle } from '../vehicleart.ts';
import type { MapDef } from '../../shared/maps.ts';
import type { Solid, SolidKind } from '../tilt.ts';
import { boundsOf, clipExtruded, hingePins, outline, paintDoor, rectOf, type DoorStyle, type G } from './geokit.ts';
import type { Theme, ThemeView } from './registry.ts';

const HATCH: PolyLook = { top: '#7d8a92', front: '#3a444c', lit: '#a3b0b8', shade: '#566069' };
const BLAST: PolyLook = { top: '#6a727a', front: '#2f353b', lit: '#8d969e', shade: '#4a5158' };
const FRAME: PolyLook = { top: '#5c6670', front: '#2c333a', lit: '#808c97', shade: '#414a53' };
const HAZARD = '#d9a62b';

const wheel = (g: G, r: number) => {
  g.strokeStyle = '#a8552e'; g.lineWidth = 3;
  g.beginPath(); g.arc(0, 0, r, 0, Math.PI * 2); g.stroke();
  g.beginPath(); for (let k = 0; k < 3; k++) { const a = (k / 3) * Math.PI; g.moveTo(Math.cos(a) * r, Math.sin(a) * r); g.lineTo(-Math.cos(a) * r, -Math.sin(a) * r); } g.stroke();
  g.fillStyle = '#3a444c'; g.beginPath(); g.arc(0, 0, 2.6, 0, Math.PI * 2); g.fill();
  g.strokeStyle = INK; g.lineWidth = 1; g.beginPath(); g.arc(0, 0, r + 1.5, 0, Math.PI * 2); g.stroke();
};

const STYLES: Record<string, DoorStyle> = {
  // A watertight hatch: a steel leaf with a rim of rivets, a wheel handle and a dog lever.
  hatch: {
    leaf: HATCH, frame: FRAME, over: hingePins('#2c333a'),
    deco: (g, len, t) => {
      g.strokeStyle = 'rgba(14, 18, 24, 0.5)'; g.lineWidth = 1.5; g.strokeRect(-len / 2 + 3, -t / 2 + 2, len - 6, t - 4);
      g.fillStyle = 'rgba(220, 228, 235, 0.6)'; for (let x = -len / 2 + 8; x < len / 2 - 4; x += 12) { g.fillRect(x, -t / 2 + 3, 2, 2); g.fillRect(x, t / 2 - 5, 2, 2); }
      g.save(); g.translate(len / 2 - Math.min(18, len * 0.3), 0); wheel(g, Math.min(5.5, t * 0.4)); g.restore();
    },
  },
  blast: {
    leaf: BLAST, frame: FRAME,
    deco: (g, len, t) => {
      g.save(); g.beginPath(); g.rect(-len / 2, -t / 2, len, t); g.clip();
      g.fillStyle = HAZARD; for (let x = -len / 2 - t; x < len / 2 + t; x += 16) { g.beginPath(); g.moveTo(x, t / 2); g.lineTo(x + 8, t / 2); g.lineTo(x + 8 + t, -t / 2); g.lineTo(x + t, -t / 2); g.closePath(); g.fill(); }
      g.restore();
      g.fillStyle = 'rgba(40, 46, 52, 0.85)'; g.fillRect(-len / 2 + 6, -t / 2 + 4, len - 12, t - 8);
      g.fillStyle = 'rgba(210, 220, 228, 0.55)'; g.fillRect(-len / 2 + 6, -t / 2 + 4, len - 12, 2);
      g.strokeStyle = INK; g.lineWidth = 1.5; g.strokeRect(-len / 2, -t / 2, len, t);
    },
  },
  roller: {
    leaf: HATCH, frame: FRAME,
    deco: (g, len, t) => { g.strokeStyle = 'rgba(14,18,24,0.55)'; g.lineWidth = 1.5; g.beginPath(); for (let x = -len / 2 + 6; x < len / 2; x += 6) { g.moveTo(x, -t / 2 + 1); g.lineTo(x, t / 2 - 1); } g.stroke(); },
  },
};

const styleOf = (d: MapDoor): DoorStyle => (d.id.startsWith('store-e') ? STYLES.blast! : d.kind === 'slide' ? STYLES.roller! : STYLES.hatch!);

/** A fuel tank, seen from above and a little to the south: a domed lid, a ladder and two banding rings. */
function drum(g: G, p: MapPoly, face: number) {
  const b = boundsOf(p.points), cx = b.x + b.w / 2, cy = b.y + b.h / 2, r = b.w / 2;
  g.save();
  clipExtruded(g, p.points, face);
  const body = g.createLinearGradient(b.x, 0, b.x + b.w, 0);
  body.addColorStop(0, '#46525c'); body.addColorStop(0.35, '#7d8c97'); body.addColorStop(1, '#3b454e');
  g.fillStyle = body; g.fillRect(b.x, b.y, b.w, b.h + face);
  g.fillStyle = '#aab6bf'; g.beginPath(); g.arc(cx, cy, r - 5, 0, Math.PI * 2); g.fill();
  g.fillStyle = '#8795a0'; g.beginPath(); g.arc(cx, cy, r - 14, 0, Math.PI * 2); g.fill();
  g.strokeStyle = 'rgba(20,26,32,0.55)'; g.lineWidth = 2; g.beginPath(); g.arc(cx, cy, r * 0.55, 0, Math.PI * 2); g.stroke();
  g.fillStyle = '#a8552e'; g.fillRect(cx - 7, cy - 7, 14, 14); g.strokeStyle = INK; g.lineWidth = 1.5; g.strokeRect(cx - 7, cy - 7, 14, 14);
  g.fillStyle = HAZARD; g.fillRect(b.x + 6, b.y + b.h + face - 10, b.w - 12, 4);
  g.restore();
  outline(g, p.points, 2.2);
}

export const subpenGeo = (painters: Partial<Record<SolidKind, (g: G, s: Solid) => void>>): Pick<Theme, 'drawPoly' | 'door'> => ({
  drawPoly(g: G, p: MapPoly): boolean {
    if (p.shape === 'submarine') return true;
    if (p.shape === 'roundTank') { drum(g, p, p.height ?? 52); return true; }
    const r = rectOf(p);
    const paint = r && painters[p.material as SolidKind];
    if (r && paint) { paint(g, { kind: p.material as SolidKind, ...r }); return true; }
    return false;
  },
  door(g: G, d: MapDoor, leaves, open, info: GeoInfo): boolean {
    return paintDoor(g, d, leaves, open, info, styleOf(d));
  },
});

/**
 * Draws the moored boats with the vehicle kit's submarine (docs/maps/VEHICLES.md), over the animated water. Returns false while a boat in view is
 * still baking, so the theme can fall back to its own hand-drawn boat for those frames.
 */
export function drawSubmarines(g: G, now: number, view: ThemeView, map: MapDef): boolean {
  const subs = (map.polys ?? []).filter((p) => p.shape === 'submarine');
  let all = true;
  for (const p of subs) {
    const b = boundsOf(p.points), cx = b.x + b.w / 2, cy = b.y + b.h / 2;
    if (b.x + b.w < view.x0 - 100 || b.x > view.x1 + 100 || b.y + b.h < view.y0 - 100 || b.y > view.y1 + 100) continue;
    // The west boat's bow points west, its twin's east; the model's nose is +x. The model is 1920 px long, the hull polygon 1800.
    if (!drawVehicle(g, 'submarine', { x: cx, y: cy, rot: cx < map.size / 2 ? Math.PI : 0, scale: b.w / 1920, livery: 'grey', number: cx < map.size / 2 ? '77' : '41', t: now, polys: subs })) all = false;
  }
  return all;
}
