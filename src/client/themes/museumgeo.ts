/**
 * Museum polygons and doors: round marble columns and the rounded dinosaur plinth wear the same stone as the square ones did, the
 * wing doors are oak with brass, the front is glass at the main entrance and a steel grille at the loading dock, the vault door is a
 * steel slab with a brass wheel. Roofs are slate (roofart.ts) with a copper ridge and skylights.
 */
import type { MapDoor, MapPoly } from '../../shared/geom.ts';
import type { GeoInfo, PolyLook } from '../geoart.ts';
import { drawExtruded } from '../geoart.ts';
import { INK } from '../palette.ts';
import type { Solid } from '../tilt.ts';
import { boundsOf, clipExtruded, hingePins, outline, paintDoor, type DoorStyle, type G } from './geokit.ts';
import { MUSEUM_WALLS } from './museumart.ts';
import type { Theme } from './registry.ts';

const BRASS = '#c9a24a', BRASS_HI = '#ecd088', BRASS_LO = '#7a5f24';
const BRASS_LOOK: PolyLook = { top: BRASS, front: '#6b5420', lit: BRASS_HI, shade: '#9b7a30' };
const OAK: PolyLook = { top: '#8a5a2e', front: '#4a2f17', lit: '#a97746', shade: '#68421f' };
const STEEL: PolyLook = { top: '#8f98a6', front: '#434b57', lit: '#b6bfcc', shade: '#69727f' };
const FIRE: PolyLook = { top: '#6f7d78', front: '#3a4440', lit: '#8f9e98', shade: '#505c58' };
const GLASS: PolyLook = { top: 'rgba(170,214,232,0.5)', front: 'rgba(90,130,150,0.45)', lit: 'rgba(225,244,252,0.75)', shade: 'rgba(110,160,180,0.55)' };
const GRILLE: PolyLook = { top: '#59616d', front: '#2e343d', lit: '#7d8896', shade: '#3f4650' };

/** Oak leaf: two raised panels, a brass push plate and pull at the meeting edge, a kick plate. */
const oakDeco: DoorStyle['deco'] = (g, len, t, _f, i, n) => {
  const edge = n > 1 ? (i === 0 ? 1 : -1) : 1;
  g.strokeStyle = 'rgba(30, 16, 6, 0.55)'; g.lineWidth = 1.5;
  const pw = Math.max(8, len / 2 - 6);
  for (const cx of len > 70 ? [-len / 4, len / 4] : [0]) g.strokeRect(cx - pw / 2, -t / 2 + 2, pw, t - 4);
  g.fillStyle = BRASS; g.fillRect(edge * (len / 2 - 14) - 5, -t / 2 + 1, 10, t - 2);
  g.fillStyle = BRASS_HI; g.fillRect(edge * (len / 2 - 14) - 5, -t / 2 + 1, 10, 2);
  g.strokeStyle = INK; g.lineWidth = 1.2; g.strokeRect(edge * (len / 2 - 14) - 5, -t / 2 + 1, 10, t - 2);
};

const slats = (color: string): DoorStyle['deco'] => (g, len, t) => {
  g.strokeStyle = color; g.lineWidth = 1.5; g.beginPath();
  for (let x = -len / 2 + 6; x < len / 2; x += 6) { g.moveTo(x, -t / 2 + 1); g.lineTo(x, t / 2 - 1); }
  g.stroke();
};

const STYLES: Record<string, DoorStyle> = {
  wood: { leaf: OAK, frame: BRASS_LOOK, deco: oakDeco, over: hingePins(BRASS_LO) },
  fire: {
    leaf: FIRE, frame: BRASS_LOOK, over: hingePins(),
    deco: (g, len, t, _f, i, n) => {
      const edge = n > 1 ? (i === 0 ? 1 : -1) : 1;
      g.fillStyle = '#b53a2a'; g.fillRect(edge * (len / 2 - 22) - 12, -2, 24, 4); g.strokeStyle = INK; g.lineWidth = 1; g.strokeRect(edge * (len / 2 - 22) - 12, -2, 24, 4);
      g.fillStyle = '#3fbf74'; g.fillRect(-4, -t / 2 + 1, 8, 3);
    },
  },
  glass: { leaf: GLASS, frame: BRASS_LOOK, height: 10, deco: (g, len, t) => { g.fillStyle = BRASS; g.fillRect(-len / 2, -t / 2, len, 2); g.fillRect(-len / 2, t / 2 - 2, len, 2); g.fillRect(-len / 2, -t / 2, 3, t); g.fillRect(len / 2 - 3, -t / 2, 3, t); } },
  grille: { leaf: GRILLE, frame: STEEL, deco: slats('rgba(12,16,22,0.7)') },
  vault: {
    leaf: STEEL, frame: BRASS_LOOK,
    deco: (g, len, t) => {
      g.fillStyle = 'rgba(20,26,34,0.35)'; for (let x = -len / 2 + 10; x < len / 2; x += 18) { g.fillRect(x, -t / 2 + 1, 2, 2); g.fillRect(x, t / 2 - 3, 2, 2); }
      g.fillStyle = BRASS; g.beginPath(); g.arc(0, 0, t * 0.46, 0, Math.PI * 2); g.fill(); g.strokeStyle = INK; g.lineWidth = 1.5; g.stroke();
      g.strokeStyle = INK; g.lineWidth = 2; g.beginPath(); g.moveTo(-t * 0.4, 0); g.lineTo(t * 0.4, 0); g.moveTo(0, -t * 0.4); g.lineTo(0, t * 0.4); g.stroke();
    },
  },
};

const styleOf = (d: MapDoor): DoorStyle => {
  if (d.id === 'vault') return STYLES.vault!;
  if (d.id.startsWith('front-door')) return d.x < 3000 ? STYLES.grille! : STYLES.glass!;
  if (d.id.startsWith('exit')) return STYLES.fire!;
  return STYLES[d.material] ?? STYLES.wood!;
};

const MARBLE_FACE = 16, PLINTH_FACE = 22;

/** A rounded footprint painted by the old square painter (stone, fluting, brass, the skeleton) and clipped to its true outline. */
function paintClipped(g: G, p: MapPoly, kind: 'marble' | 'plinth', face: number) {
  const b = boundsOf(p.points);
  const s: Solid = { kind: kind === 'marble' ? 'marble' : 'plinth', x: b.x, y: b.y, w: b.w, h: b.h };
  g.save();
  clipExtruded(g, p.points, face);
  MUSEUM_WALLS[kind](g, s);
  g.restore();
  // The seam between the top and the front, and the outlines along the real curve.
  g.save();
  clipExtruded(g, p.points, face);
  g.strokeStyle = INK; g.lineWidth = 3;
  g.beginPath(); p.points.forEach((q, i) => (i ? g.lineTo(q.x, q.y + face) : g.moveTo(q.x, q.y + face))); g.closePath(); g.stroke();
  g.restore();
  outline(g, p.points, 2);
}

function drawGlassFront(g: G, p: MapPoly) {
  const b = boundsOf(p.points);
  const dock = (p.id ?? '').startsWith('front-') && b.x < 3000;
  const look = dock ? GRILLE : GLASS;
  drawExtruded(g, p.points, 20, look);
  g.save();
  g.beginPath(); p.points.forEach((q, i) => (i ? g.lineTo(q.x, q.y) : g.moveTo(q.x, q.y))); g.closePath(); g.clip();
  g.fillStyle = dock ? '#7d8896' : BRASS;
  g.fillRect(b.x + b.w / 2 - 2, b.y, 4, b.h);
  g.fillStyle = dock ? 'rgba(10,14,20,0.55)' : 'rgba(255,255,255,0.4)';
  if (dock) for (let y = b.y + 8; y < b.y + b.h; y += 8) g.fillRect(b.x, y, b.w, 2); else { g.beginPath(); g.moveTo(b.x + 6, b.y + b.h); g.lineTo(b.x + 22, b.y); g.lineTo(b.x + 34, b.y); g.lineTo(b.x + 18, b.y + b.h); g.closePath(); g.fill(); }
  g.restore();
}

export const museumGeo: Pick<Theme, 'drawPoly' | 'door'> = {
  drawPoly(g: G, p: MapPoly): boolean {
    if (p.shape === 'column') { paintClipped(g, p, 'marble', MARBLE_FACE); return true; }
    if (p.shape === 'plinth') { paintClipped(g, p, 'plinth', PLINTH_FACE); return true; }
    if (p.material === 'glass') { drawGlassFront(g, p); return true; }
    return false;
  },
  door(g: G, d: MapDoor, leaves, open, info: GeoInfo): boolean {
    return paintDoor(g, d, leaves, open, info, styleOf(d));
  },
};
