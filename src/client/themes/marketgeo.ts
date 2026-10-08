/**
 * Night Market polygons, doors and roofs: shop walls are painted plaster with a lit trim, the roll-up shutters are corrugated slats that
 * wind into a coil as they open, carts and shrine posts are painted by the old square painters and clipped to their round outline, and a
 * shop's roof is the same rooftop its neighbouring shopfront blocks wear (air-con, tank, sign), baked once and faded.
 */
import type { MapDoor, MapPoly, MapRoof } from '../../shared/geom.ts';
import { doorSpan } from '../../shared/sim/doors.ts';
import type { GeoInfo, PolyLook } from '../geoart.ts';
import { drawExtruded } from '../geoart.ts';
import { INK } from '../palette.ts';
import { FACE, type Solid } from '../tilt.ts';
import { boundsOf, clipExtruded, outline, paintDoor, type DoorStyle, type G } from './geokit.ts';
import { paintCart, paintLandmark, paintShopfront } from './marketwalls.ts';
import { districtAt } from './marketkit.ts';
import type { Theme } from './registry.ts';

const PLASTER: PolyLook = { top: '#8d8272', front: '#4a4339', lit: '#b3a792', shade: '#5f574b' };
const SHUTTER: PolyLook = { top: '#8a9096', front: '#474c52', lit: '#b0b6bc', shade: '#5b6168' };
const FRAME: PolyLook = { top: '#6a6f76', front: '#33373d', lit: '#8c9299', shade: '#4a4f56' };

const shutter: DoorStyle = {
  leaf: SHUTTER, frame: FRAME,
  deco: (g, len, t) => {
    g.fillStyle = 'rgba(10,14,20,0.32)';
    for (let x = -len / 2; x < len / 2; x += 5) g.fillRect(x, -t / 2, 2, t);
    g.fillStyle = 'rgba(255,255,255,0.2)';
    for (let x = -len / 2 + 2; x < len / 2; x += 5) g.fillRect(x, -t / 2, 1, t);
    g.fillStyle = '#c9ccd1'; g.fillRect(-len / 2, -t / 2, len, 2);
    g.strokeStyle = INK; g.lineWidth = 1.2; g.strokeRect(-len / 2, -t / 2, len, t);
  },
  // The coil the shutter winds onto at its pocket end, fatter the more is rolled up.
  over: (g, d: MapDoor, f) => {
    if (f < 0.04) return;
    const sp = doorSpan(d);
    const [px, py] = d.kind === 'slide' && (d.hinge ?? 'start') === 'end' ? [sp.bx, sp.by] : [sp.ax, sp.ay];
    const r = 3 + 6 * f;
    g.fillStyle = '#7c838a'; g.beginPath(); g.arc(px, py, r, 0, Math.PI * 2); g.fill();
    g.strokeStyle = INK; g.lineWidth = 1.5; g.stroke();
    g.strokeStyle = 'rgba(10,14,20,0.4)'; g.beginPath(); g.arc(px, py, r * 0.55, 0, Math.PI * 2); g.stroke();
  },
};

const roofCache = new Map<string, HTMLCanvasElement | null>();
const MARGIN = 40;
/** One shop's rooftop baked at the neighbours' look. */
function roofSprite(r: MapRoof): HTMLCanvasElement | null {
  let c = roofCache.get(r.id);
  if (c !== undefined) return c;
  const b = boundsOf(r.points);
  c = typeof document === 'undefined' ? null : document.createElement('canvas');
  if (c) {
    c.width = Math.ceil(b.w) + 2 * MARGIN; c.height = Math.ceil(b.h) + 2 * MARGIN + FACE.shopfront;
    const g = c.getContext('2d')!;
    g.translate(MARGIN - b.x, MARGIN - b.y);
    const s: Solid = { kind: 'shopfront', x: b.x, y: b.y, w: b.w, h: b.h };
    paintShopfront(g, s);
  }
  roofCache.set(r.id, c);
  return c;
}

function clipped(g: G, p: MapPoly, paint: (g: G, s: Solid) => void, kind: 'cart' | 'shrine', face: number) {
  const b = boundsOf(p.points);
  g.save();
  clipExtruded(g, p.points, face);
  paint(g, { kind, x: b.x, y: b.y, w: b.w, h: b.h });
  g.restore();
  g.save(); clipExtruded(g, p.points, face);
  g.strokeStyle = INK; g.lineWidth = 3;
  g.beginPath(); p.points.forEach((q, i) => (i ? g.lineTo(q.x, q.y + face) : g.moveTo(q.x, q.y + face))); g.closePath(); g.stroke();
  g.restore();
  outline(g, p.points, 2);
}

export const marketGeo: Pick<Theme, 'drawPoly' | 'door' | 'roof'> = {
  drawPoly(g: G, p: MapPoly): boolean {
    if (p.shape === 'cart') { clipped(g, p, paintCart, 'cart', FACE.cart); return true; }
    if (p.shape === 'shrine') { clipped(g, p, (c, sd) => paintLandmark(c, sd, true), 'shrine', FACE.shrine); return true; }
    if (p.material === 'shop') {
      drawExtruded(g, p.points, p.height ?? 22, PLASTER);
      // A lit trim along the top of every wall that faces south, in the district's neon.
      const b = boundsOf(p.points), d = districtAt(b.x + b.w / 2, b.y + b.h / 2);
      if (b.w > b.h) { g.fillStyle = d.neon; g.globalAlpha = 0.85; g.fillRect(b.x + 4, b.y + b.h + 3, Math.max(0, b.w - 8), 3); g.globalAlpha = 1; }
      return true;
    }
    return false;
  },
  door(g: G, d: MapDoor, leaves, open, info: GeoInfo): boolean {
    return paintDoor(g, d, leaves, open, info, shutter);
  },
  roof(g: G, r: MapRoof, _alpha: number, info: GeoInfo): boolean {
    if (r.material !== 'shop') return false;
    const c = roofSprite(r);
    if (!c) return false;
    const b = boundsOf(r.points);
    g.drawImage(c, b.x - MARGIN, b.y - MARGIN);
    if (info.dark > 0) { g.fillStyle = `rgba(20, 28, 60, ${0.5 * info.dark})`; g.fillRect(b.x, b.y, b.w, b.h); }
    return true;
  },
};
