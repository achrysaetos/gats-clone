/**
 * Park polygons and doors: round trunks wear the cylinder the square ones had, the bandstand is a pale stone octagon with a fluted
 * balustrade under a verdigris roof, the fountain's rims are curved stone, the screening hedges are curved and clipped, the boathouse and the
 * kiosk are timber with plank doors on iron straps. Shingle and copper roofs come from roofart.ts.
 */
import type { MapDoor, MapPoly } from '../../shared/geom.ts';
import type { GeoInfo, PolyLook } from '../geoart.ts';
import { drawExtruded } from '../geoart.ts';
import { INK } from '../palette.ts';
import { boundsOf, hingePins, noise, outline, paintDoor, type DoorStyle, type G } from './geokit.ts';
import { C } from './parkkit.ts';
import { PARK_WALLS } from './parkwalls.ts';
import type { Theme } from './registry.ts';

const STONE: PolyLook = { top: C.stone, front: C.stoneFront, lit: C.stoneHi, shade: C.stoneLo };
const TIMBER: PolyLook = { top: '#9a7549', front: '#5a4128', lit: '#b9915d', shade: '#76552f' };
const HEDGE: PolyLook = { top: C.hedge, front: C.hedgeFront, lit: C.hedgeHi, shade: C.hedgeLo };
const PLANK: PolyLook = { top: '#a98558', front: '#5f4529', lit: '#c7a06c', shade: '#80603a' };
const FRAME: PolyLook = { top: '#6a4e30', front: '#37281a', lit: '#8a6942', shade: '#4d3822' };

const planks: DoorStyle['deco'] = (g, len, t, _f, i, n) => {
  g.strokeStyle = 'rgba(40, 24, 10, 0.5)'; g.lineWidth = 1.2; g.beginPath();
  for (let x = -len / 2 + 9; x < len / 2; x += 9) { g.moveTo(x, -t / 2); g.lineTo(x, t / 2); }
  g.stroke();
  // Iron straps at the hinge end, a cross brace, a ring pull at the meeting edge.
  const edge = n > 1 ? (i === 0 ? 1 : -1) : 1;
  g.fillStyle = C.iron;
  g.fillRect(-edge * (len / 2 - 2) - 6, -t / 2, 12, t); g.fillRect(-edge * (len / 4), -t / 2, 8, t);
  g.strokeStyle = C.iron; g.lineWidth = 2; g.beginPath(); g.arc(edge * (len / 2 - 9), 0, 3.2, 0, Math.PI * 2); g.stroke();
};
const DOOR: DoorStyle = { leaf: PLANK, frame: FRAME, deco: planks, over: hingePins(C.iron) };

function wall(g: G, p: MapPoly) {
  drawExtruded(g, p.points, p.height ?? 18, TIMBER);
  const b = boundsOf(p.points);
  g.save();
  g.beginPath(); p.points.forEach((q, i) => (i ? g.lineTo(q.x, q.y) : g.moveTo(q.x, q.y))); g.closePath(); g.clip();
  g.strokeStyle = 'rgba(40, 24, 10, 0.4)'; g.lineWidth = 1.5; g.beginPath();
  if (b.w >= b.h) for (let x = b.x + 12; x < b.x + b.w; x += 12) { g.moveTo(x, b.y); g.lineTo(x, b.y + b.h); }
  else for (let y = b.y + 12; y < b.y + b.h; y += 12) { g.moveTo(b.x, y); g.lineTo(b.x + b.w, y); }
  g.stroke();
  g.restore();
  // Plank ends on the front face.
  if (b.w >= b.h) { g.strokeStyle = 'rgba(30, 18, 8, 0.5)'; g.lineWidth = 1; g.beginPath(); for (let x = b.x + 12; x < b.x + b.w; x += 12) { g.moveTo(x, b.y + b.h + 2); g.lineTo(x, b.y + b.h + (p.height ?? 18) - 1); } g.stroke(); }
}

function balustrade(g: G, p: MapPoly) {
  drawExtruded(g, p.points, p.height ?? 18, STONE);
  // Fluted pillars along the face: short strokes at an even spacing over the first edge.
  const pts = p.points;
  const a = pts[0]!, b = pts[1]!, len = Math.hypot(b.x - a.x, b.y - a.y);
  if (len < 40) return;
  g.fillStyle = 'rgba(20, 22, 26, 0.28)';
  const n = Math.max(2, Math.floor(len / 24));
  for (let k = 0; k <= n; k++) { const s = (k + 0.5) / (n + 1); g.beginPath(); g.arc(a.x + (b.x - a.x) * s, a.y + (b.y - a.y) * s, 3.4, 0, Math.PI * 2); g.fill(); }
}

function hedgeArc(g: G, p: MapPoly) {
  drawExtruded(g, p.points, p.height ?? 18, HEDGE);
  const b = boundsOf(p.points);
  g.save();
  g.beginPath(); p.points.forEach((q, i) => (i ? g.lineTo(q.x, q.y) : g.moveTo(q.x, q.y))); g.closePath(); g.clip();
  for (let i = 0; i < b.w * b.h / 300; i++) { g.fillStyle = noise(b.x, i) > 0.5 ? C.hedgeHi : C.hedgeLo; g.beginPath(); g.arc(b.x + noise(b.x, i, 1) * b.w, b.y + noise(b.y, i, 2) * b.h, 4 + noise(i, 3) * 4, 0, Math.PI * 2); g.fill(); }
  g.restore();
  outline(g, p.points, 2);
}

function rim(g: G, p: MapPoly) {
  drawExtruded(g, p.points, p.height ?? 16, STONE);
}

export const parkGeo: Pick<Theme, 'drawPoly' | 'door'> = {
  drawPoly(g: G, p: MapPoly): boolean {
    switch (p.shape) {
      case 'trunk': { const b = boundsOf(p.points); PARK_WALLS.trunk(g, { kind: 'trunk', x: b.x, y: b.y, w: b.w, h: b.h }); return true; }
      case 'bandstand': balustrade(g, p); return true;
      case 'fountainRim': rim(g, p); return true;
      case 'hedgeArc': hedgeArc(g, p); return true;
      default:
        if (p.material === 'parkwood') { wall(g, p); return true; }
        return false;
    }
  },
  door(g: G, d: MapDoor, leaves, open, info: GeoInfo): boolean {
    return paintDoor(g, d, leaves, open, info, DOOR);
  },
};
void INK;
