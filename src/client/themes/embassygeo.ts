import { unflat, type MapDoor, type MapPoly, type MapRoof, type Pt } from '../../shared/geom.ts';
import { ATRIUM, FOUNTAIN, STAIR_ROOM, TABLE, VEHICLES } from '../../shared/maps/embassy.ts';
import type { DoorLeaf } from '../../shared/sim/doors.ts';
import { drawExtruded, type GeoInfo, type PolyLook } from '../geoart.ts';
import { INK } from '../palette.ts';
import { setLight } from '../lighting.ts';
import { drawVehicle, vehicleLights } from '../vehicleart.ts';
import { BRASS, BRASS_HI, CREAM, NAVY, TAU, WALNUT, WALNUT_DK, clock, hash, hexA, mix, reduced, seal, star } from './embassykit.ts';

/**
 * Embassy set pieces, doors and roofs. Everything geometric is a polygon on the map, and each is dressed by where it stands, as
 * the walls are: the long oval table is a walnut conference table in the Office Wing and a banquet table laid with linen in the
 * Ballroom, the two curved flights are a glass partition and a marble staircase, the motorcade is two armoured SUVs and a limousine
 * and its half turn is the caterer's fleet. A `~` on an id marks the half-turned twin.
 */

type G = CanvasRenderingContext2D;
const look = (top: string, front = mix(top, 0, 0.42), lit = mix(top, 255, 0.24), shade = mix(top, 0, 0.3)): PolyLook => ({ top, front, lit, shade });
const twin = (p: { id?: string }) => !!p.id?.endsWith('~');
const centroid = (pts: readonly Pt[]): Pt => ({ x: pts.reduce((s, p) => s + p.x, 0) / pts.length, y: pts.reduce((s, p) => s + p.y, 0) / pts.length });
const trace = (g: G, pts: readonly Pt[]) => { g.beginPath(); pts.forEach((p, i) => (i ? g.lineTo(p.x, p.y) : g.moveTo(p.x, p.y))); g.closePath(); };
const disc = (g: G, x: number, y: number, r: number, fill: string, lw = 1.4) => { g.fillStyle = fill; g.beginPath(); g.arc(x, y, r, 0, TAU); g.fill(); g.strokeStyle = INK; g.lineWidth = lw; g.stroke(); };

const MARBLE = look('#d6cdb8', '#a89f88');
const HEDGE = look('#3f6a38', '#2a4a2a');

function leafy(g: G, pts: readonly Pt[], seed: number, tone = ['#2f5a30', '#3f7a3a', '#2a4a26']) {
  const xs = pts.map((p) => p.x), ys = pts.map((p) => p.y);
  const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
  g.save(); trace(g, pts); g.clip();
  let s = seed >>> 0; const rnd = () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; };
  const n = Math.min(260, ((x1 - x0) * (y1 - y0)) / 90);
  for (let i = 0; i < n; i++) { g.fillStyle = tone[Math.floor(rnd() * 3)]!; g.globalAlpha = 0.75; g.beginPath(); g.arc(x0 + rnd() * (x1 - x0), y0 + rnd() * (y1 - y0), 2.4 + rnd() * 2.4, 0, TAU); g.fill(); }
  g.globalAlpha = 1; g.fillStyle = 'rgba(220, 255, 170, 0.14)';
  for (let i = 0; i < n / 3; i++) g.fillRect(x0 + rnd() * (x1 - x0), y0 + rnd() * (y1 - y0), 3, 2);
  g.restore();
}

function poolOf(p: MapPoly): string { return p.id ?? ''; }

/* -- vehicles ---------------------------------------------------------------------------------------------------- */

/** The motorcade (two armoured SUVs and the limousine) and, on the turned half, the caterers' vans and cold-chain truck: toy models from the vehicle kit. */
function vehicle(g: G, p: MapPoly, _pts: Pt[], info: GeoInfo) {
  const id = poolOf(p).replace('~', '');
  const v = VEHICLES.find((q) => q.id === id)!;
  const isTwin = twin(p);
  const o = { x: isTwin ? 6000 - v.x : v.x, y: isTwin ? 6000 - v.y : v.y, rot: v.rot + (isTwin ? Math.PI : 0), t: clock(info.now), polys: [p] };
  const kind = isTwin ? (v.kind === 'limo' ? 'reefer' : 'van') : v.kind;
  // The motorcade is pale (a white limousine, silver SUVs): near-black cars vanished into the asphalt at dusk.
  drawVehicle(g, kind, isTwin ? o : { ...o, livery: v.kind === 'limo' ? 'white' : 'silver' });
  for (const l of vehicleLights(kind, { ...o, id: poolOf(p) })) setLight(l.key, { x: l.x, y: l.y, radius: l.radius, color: l.color, intensity: l.intensity, size: l.size, shadows: false });
}

/* -- the fountain ------------------------------------------------------------------------------------------------ */

function fountain(g: G, p: MapPoly, pts: Pt[], info: GeoInfo) {
  const isTwin = twin(p);
  const c = centroid(pts), r = Math.hypot(pts[0]!.x - c.x, pts[0]!.y - c.y);
  const t = clock(info.now);
  drawExtruded(g, pts, p.height ?? 14, look('#b9b19c', '#8a826e'));
  // A stone rim round a basin of water (or, on the lot, a weedy pond), with slow rings and a sparkle or two.
  g.save(); g.fillStyle = isTwin ? '#3d5a40' : '#4a7d96'; g.beginPath(); g.arc(c.x, c.y, r - 16, 0, TAU); g.fill();
  g.strokeStyle = INK; g.lineWidth = 2; g.stroke();
  g.clip();
  g.fillStyle = isTwin ? 'rgba(120, 170, 110, 0.18)' : 'rgba(180, 225, 245, 0.16)'; g.beginPath(); g.arc(c.x - 14, c.y - 18, r * 0.7, 0, TAU); g.fill();
  g.strokeStyle = isTwin ? 'rgba(200, 240, 190, 0.3)' : 'rgba(225, 245, 255, 0.4)'; g.lineWidth = 2;
  for (let k = 0; k < 3; k++) { const rad = 40 + ((t * 0.02 + k * 38) % 110); g.globalAlpha = 1 - (rad - 40) / 110; g.beginPath(); g.arc(c.x, c.y, rad, 0, TAU); g.stroke(); }
  g.globalAlpha = 1;
  if (isTwin) { for (const [dx, dy, s] of [[-70, 40, 14], [60, -56, 12], [-30, -80, 10], [80, 48, 11]] as const) { disc(g, c.x + dx, c.y + dy, s, '#4f8a4a', 1.2); g.fillStyle = '#e8a0b0'; g.beginPath(); g.arc(c.x + dx + 3, c.y + dy - 2, 3, 0, TAU); g.fill(); } }
  g.restore();
  // Rim highlight.
  g.strokeStyle = 'rgba(255,255,255,0.3)'; g.lineWidth = 3; g.beginPath(); g.arc(c.x, c.y, r - 4, Math.PI * 1.05, Math.PI * 1.55); g.stroke();
}

function plinth(g: G, p: MapPoly, pts: Pt[], info: GeoInfo) {
  const c = centroid(pts), h = p.height ?? 58, isTwin = twin(p);
  drawExtruded(g, pts, h, look('#cfc8b4', '#9a937e'));
  g.save();
  g.translate(c.x, c.y - 4);
  if (!isTwin) {
    // The republic's soldier on the plinth, in gilt: helmet, shoulders, a raised rifle, and a jet of water behind him.
    const bob = Math.sin(clock(info.now) * 0.002) * 1.2;
    g.fillStyle = hexA('#dff4ff', 0.5); g.beginPath(); g.moveTo(-3, -16); g.quadraticCurveTo(0, -60 + bob * 3, 3, -16); g.fill();
    disc(g, 0, -4, 11, '#d9b24a'); disc(g, 0, -17, 7, '#e8c860'); g.fillStyle = '#b79a4a'; g.fillRect(-9, -22, 18, 4); g.strokeStyle = INK; g.lineWidth = 1.2; g.strokeRect(-9, -22, 18, 4);
    g.strokeStyle = INK; g.lineWidth = 4; g.beginPath(); g.moveTo(10, -6); g.lineTo(14, -34); g.stroke(); g.strokeStyle = '#d9b24a'; g.lineWidth = 2; g.stroke();
  } else {
    // A stone heron on one leg.
    g.fillStyle = '#e8e4d8'; g.beginPath(); g.ellipse(0, -8, 9, 6, -0.3, 0, TAU); g.fill(); g.strokeStyle = INK; g.lineWidth = 1.3; g.stroke();
    g.strokeStyle = INK; g.lineWidth = 3; g.beginPath(); g.moveTo(4, -10); g.quadraticCurveTo(10, -30, 4, -40); g.stroke(); g.strokeStyle = '#e8e4d8'; g.lineWidth = 1.6; g.stroke();
    g.fillStyle = '#d9a23c'; g.fillRect(4, -42, 9, 2);
  }
  g.restore();
}

/* -- the oval table ---------------------------------------------------------------------------------------------- */

function oval(g: G, p: MapPoly, pts: Pt[]) {
  const isTwin = twin(p);
  const cx = isTwin ? 6000 - TABLE.x : TABLE.x, cy = isTwin ? 6000 - TABLE.y : TABLE.y;
  // Chairs round it first, then the table over their seats.
  g.fillStyle = isTwin ? '#7a2e3a' : '#2f3a58';
  const n = 7;
  for (let i = 0; i < n; i++) for (const side of [-1, 1]) {
    const x = cx - TABLE.w / 2 + 40 + (i * (TABLE.w - 80)) / (n - 1), y = cy + side * (TABLE.h / 2 + 12);
    g.beginPath(); rrect(g, x - 11, y - 9, 22, 18, 5); g.fill(); g.strokeStyle = INK; g.lineWidth = 1.5; g.stroke();
  }
  for (const side of [-1, 1]) { g.beginPath(); rrect(g, cx + side * (TABLE.w / 2 + 14) - 9, cy - 11, 18, 22, 5); g.fill(); g.stroke(); }
  drawExtruded(g, pts, p.height ?? 20, isTwin ? look('#ebe6d6', '#b8b19c') : look('#7d5532', '#4a321c'));
  g.save(); trace(g, pts); g.clip();
  if (!isTwin) {
    g.strokeStyle = hexA(BRASS, 0.7); g.lineWidth = 2; g.beginPath(); g.ellipse(cx, cy, TABLE.w / 2 - 14, TABLE.h / 2 - 12, 0, 0, TAU); g.stroke();
    seal(g, cx, cy, 30, { alpha: 0.95 });
    // Papers, a water jug, glasses, one laptop left open.
    for (const [dx, dy, a] of [[-150, -34, 0.1], [-60, 38, -0.1], [90, -30, 0.2], [160, 30, -0.2]] as const) { g.save(); g.translate(cx + dx, cy + dy); g.rotate(a); g.fillStyle = '#ece6d6'; g.fillRect(-9, -6, 18, 12); g.strokeStyle = INK; g.lineWidth = 1; g.strokeRect(-9, -6, 18, 12); g.restore(); }
    disc(g, cx + 70, cy + 2, 6, '#9ac0d8'); disc(g, cx - 110, cy + 4, 5, '#9ac0d8');
    g.fillStyle = '#2a2d34'; g.fillRect(cx - 190, cy - 8, 22, 14); g.fillStyle = '#8fb4e0'; g.fillRect(cx - 188, cy - 6, 18, 8);
  } else {
    // Laid for the gala: candelabra, plates, folded napkins, glasses; one chair pushed back.
    g.fillStyle = 'rgba(0,0,0,0.08)'; g.beginPath(); g.ellipse(cx, cy, TABLE.w / 2 - 6, TABLE.h / 2 - 6, 0, 0, TAU); g.fill();
    for (let i = 0; i < 7; i++) for (const side of [-1, 1]) { const x = cx - TABLE.w / 2 + 40 + (i * (TABLE.w - 80)) / 6; disc(g, x, cy + side * 52, 9, '#f6f2e6', 1.1); disc(g, x, cy + side * 52, 5, '#e0d8c0', 0.8); disc(g, x + 13, cy + side * 62, 3, 'rgba(210,235,245,0.9)', 0.9); }
    for (const dx of [-120, 0, 120]) { g.fillStyle = hexA(BRASS_HI, 0.9); g.fillRect(cx + dx - 1.5, cy - 4, 3, 10); disc(g, cx + dx, cy - 6, 2.6, '#ffe9a8', 0.8); disc(g, cx + dx - 7, cy - 3, 2, '#ffe9a8', 0.8); disc(g, cx + dx + 7, cy - 3, 2, '#ffe9a8', 0.8); }
    g.fillStyle = '#c0392b'; for (const dx of [-60, 60, 160]) g.fillRect(cx + dx - 4, cy - 2, 8, 6);
  }
  g.restore();
}
const rrect = (g: G, x: number, y: number, w: number, h: number, r: number) => { g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); };

/* -- the curved flights ------------------------------------------------------------------------------------------ */

function flight(g: G, p: MapPoly, pts: Pt[]) {
  const isTwin = twin(p);
  const cx = isTwin ? 6000 - STAIR_ROOM.cx : STAIR_ROOM.cx, cy = isTwin ? 6000 - STAIR_ROOM.cy : STAIR_ROOM.cy;
  if (!isTwin) {
    // A curved glass partition on a navy plinth, with a brass cap.
    drawExtruded(g, pts, p.height ?? 26, look('#7fa9b8', '#2f4a6a'));
    g.save(); trace(g, pts); g.clip();
    g.strokeStyle = 'rgba(255,255,255,0.28)'; g.lineWidth = 2;
    for (const rad of [292, 308]) { g.beginPath(); g.arc(cx, cy, rad, 0, TAU); g.stroke(); }
    g.strokeStyle = hexA(BRASS, 0.8); g.lineWidth = 3; g.beginPath(); g.arc(cx, cy, 300, 0, TAU); g.stroke();
    g.restore();
  } else {
    // Marble steps in rings, a crimson runner down the middle, a brass handrail along the inside edge.
    drawExtruded(g, pts, p.height ?? 26, look('#d8cfd0', '#9a8085'));
    g.save(); trace(g, pts); g.clip();
    g.strokeStyle = 'rgba(80, 56, 62, 0.45)'; g.lineWidth = 1.5;
    for (let rad = 276; rad < 326; rad += 7) { g.beginPath(); g.arc(cx, cy, rad, 0, TAU); g.stroke(); }
    g.strokeStyle = 'rgba(138, 46, 60, 0.75)'; g.lineWidth = 16; g.beginPath(); g.arc(cx, cy, 300, 0, TAU); g.stroke();
    g.strokeStyle = BRASS_HI; g.lineWidth = 3; g.beginPath(); g.arc(cx, cy, 277, 0, TAU); g.stroke();
    g.restore();
  }
}

/* -- the atrium ring and columns --------------------------------------------------------------------------------- */

function ring(g: G, p: MapPoly, pts: Pt[]) {
  drawExtruded(g, pts, p.height ?? 34, look('#d6cdb8', '#a39a84'));
  g.save(); trace(g, pts); g.clip();
  g.strokeStyle = hexA(BRASS, 0.9); g.lineWidth = 3;
  g.beginPath(); g.arc(ATRIUM.x, ATRIUM.y, ATRIUM.rOut - 3, 0, TAU); g.stroke();
  g.beginPath(); g.arc(ATRIUM.x, ATRIUM.y, ATRIUM.rIn + 3, 0, TAU); g.stroke();
  g.restore();
  // Pilasters along the outer face: a dark joint and a brass cap every few paces.
  const n = pts.length / 2;
  for (let i = 0; i < n; i += 2) {
    const q = pts[i]!, a = Math.atan2(q.y - ATRIUM.y, q.x - ATRIUM.x);
    g.strokeStyle = 'rgba(60, 52, 40, 0.55)'; g.lineWidth = 2; g.beginPath(); g.moveTo(ATRIUM.x + Math.cos(a) * (ATRIUM.rIn + 4), ATRIUM.y + Math.sin(a) * (ATRIUM.rIn + 4)); g.lineTo(ATRIUM.x + Math.cos(a) * (ATRIUM.rOut - 4), ATRIUM.y + Math.sin(a) * (ATRIUM.rOut - 4)); g.stroke();
  }
}

function column(g: G, p: MapPoly, pts: Pt[]) {
  const c = centroid(pts), r = Math.hypot(pts[0]!.x - c.x, pts[0]!.y - c.y);
  drawExtruded(g, pts, p.height ?? 44, look('#d8d0bc', '#a8a08c'));
  g.fillStyle = hexA(BRASS, 0.9); g.beginPath(); g.arc(c.x, c.y, r - 8, 0, TAU); g.fill(); g.strokeStyle = INK; g.lineWidth = 1.5; g.stroke();
  g.fillStyle = '#e8dfc6'; g.beginPath(); g.arc(c.x, c.y, r - 14, 0, TAU); g.fill();
  g.fillStyle = 'rgba(255,255,255,0.55)'; g.beginPath(); g.arc(c.x - 7, c.y - 8, 4, 0, TAU); g.fill();
  g.strokeStyle = 'rgba(70, 60, 44, 0.3)'; g.lineWidth = 1; for (let k = 0; k < 6; k++) { const a = k * 1.047; g.beginPath(); g.moveTo(c.x + Math.cos(a) * 6, c.y + Math.sin(a) * 6); g.lineTo(c.x + Math.cos(a) * (r - 15), c.y + Math.sin(a) * (r - 15)); g.stroke(); }
}

/* -- garden ------------------------------------------------------------------------------------------------------ */

function hedge(g: G, p: MapPoly, pts: Pt[]) {
  drawExtruded(g, pts, p.height ?? 40, HEDGE);
  leafy(g, pts, hash(pts[0]!.x, pts[0]!.y));
}
function topiary(g: G, p: MapPoly, pts: Pt[]) {
  const c = centroid(pts), r = Math.hypot(pts[0]!.x - c.x, pts[0]!.y - c.y), h = p.height ?? 46;
  // A clipped ball on a short stem: shade, body, leaf stipple, one specular dot.
  g.fillStyle = 'rgba(14,16,22,0.3)'; g.beginPath(); g.ellipse(c.x + 8, c.y + h * 0.5, r * 1.05, r * 0.6, 0, 0, TAU); g.fill();
  g.fillStyle = '#6a4a2a'; g.fillRect(c.x - 4, c.y + 4, 8, h * 0.5);
  drawExtruded(g, pts, h * 0.5, look('#3f7a3a', '#26452a'));
  leafy(g, pts, hash(c.x, c.y));
  g.fillStyle = 'rgba(255,255,230,0.55)'; g.beginPath(); g.arc(c.x - r * 0.35, c.y - r * 0.4, r * 0.14, 0, TAU); g.fill();
}
function urn(g: G, p: MapPoly, pts: Pt[]) {
  const c = centroid(pts);
  drawExtruded(g, pts, p.height ?? 40, look('#c8bea4', '#8f866e'));
  g.fillStyle = '#4a3a2a'; g.beginPath(); g.arc(c.x, c.y, 26, 0, TAU); g.fill();
  for (let k = 0; k < 9; k++) { const a = k * 0.7; g.strokeStyle = k % 2 ? '#3f7a3a' : '#5a9a48'; g.lineWidth = 3; g.beginPath(); g.moveTo(c.x, c.y); g.quadraticCurveTo(c.x + Math.cos(a) * 14, c.y + Math.sin(a) * 14 - 6, c.x + Math.cos(a) * 28, c.y + Math.sin(a) * 28); g.stroke(); }
  g.strokeStyle = INK; g.lineWidth = 1.6; g.beginPath(); g.arc(c.x, c.y, 28, 0, TAU); g.stroke();
}

export function drawEmbassyPoly(g: G, p: MapPoly, info: GeoInfo): boolean {
  const id = poolOf(p);
  const pts = unflat(p.points.flatMap((q) => [q.x, q.y]));
  if (id.startsWith('ring')) { ring(g, p, pts); return true; }
  if (id.startsWith('stair')) { flight(g, p, pts); return true; }
  if (id.startsWith('oval')) { oval(g, p, pts); return true; }
  if (id === 'fountain' || id === 'fountain~') { fountain(g, p, pts, info); return true; }
  if (id.startsWith('fountain-plinth')) { plinth(g, p, pts, info); return true; }
  if (id.startsWith('fountain-hedge') || id.startsWith('maze')) { hedge(g, p, pts); return true; }
  if (id.startsWith('lobby-col') || id.startsWith('gal-col')) { column(g, p, pts); return true; }
  if (id.startsWith('topiary')) { topiary(g, p, pts); return true; }
  if (id.startsWith('urn')) { urn(g, p, pts); return true; }
  if (VEHICLES.some((v) => id.replace('~', '') === v.id)) { vehicle(g, p, pts, info); return true; }
  void FOUNTAIN; void NAVY; void CREAM; void WALNUT; void WALNUT_DK; void MARBLE; void star;
  return false;
}

/* -- doors ------------------------------------------------------------------------------------------------------- */

const leafPts = (l: DoorLeaf): Pt[] => (l.pts ? unflat(l.pts) : [{ x: l.x, y: l.y }, { x: l.x + l.w, y: l.y }, { x: l.x + l.w, y: l.y + l.h }, { x: l.x, y: l.y + l.h }]);
const inResidence = (d: MapDoor) => { const cx = d.axis === 'h' ? d.x + d.w / 2 : d.x, cy = d.axis === 'h' ? d.y : d.y + d.w / 2; return cx + cy > 6000 + 200 && !(Math.hypot(cx - 3000, cy - 3000) < 700); };

export function drawEmbassyDoor(g: G, d: MapDoor, leaves: readonly DoorLeaf[], open: number, info: GeoInfo): boolean {
  const h = d.axis === 'h';
  const x1 = d.x + (h ? d.w : 0), y1 = d.y + (h ? 0 : d.w);
  const res = inResidence(d);
  const slide = d.kind === 'slide' || d.kind === 'double-slide';
  const metal = d.material === 'metal', glass = d.material === 'glass';
  const wood = res ? look('#6a2a2e', '#3a1618') : look('#9a6a3a', '#573a1e');
  const L = metal ? look('#9aa4b2', '#4a5361') : wood;
  if (slide) { g.strokeStyle = 'rgba(10,12,18,0.55)'; g.lineWidth = 4; g.beginPath(); g.moveTo(d.x, d.y); g.lineTo(x1, y1); g.stroke(); }
  for (const leaf of leaves) {
    const pts = leafPts(leaf);
    if (glass) {
      drawExtruded(g, pts, 12, look('rgba(150, 205, 225, 0.5)', 'rgba(70, 120, 145, 0.45)', 'rgba(225, 244, 252, 0.8)', 'rgba(90, 140, 160, 0.6)'));
      g.save(); trace(g, pts); g.clip(); g.strokeStyle = hexA(BRASS_HI, 0.95); g.lineWidth = 4; trace(g, pts); g.stroke(); g.restore();
    } else {
      drawExtruded(g, pts, 22, L);
      g.save(); trace(g, pts); g.clip();
      // Brass kick-plate along the leaf, a push plate at its free end.
      g.fillStyle = hexA(BRASS_HI, 0.9);
      const bx = Math.min(...pts.map((q) => q.x)), by = Math.min(...pts.map((q) => q.y)), bw = Math.max(...pts.map((q) => q.x)) - bx, bh = Math.max(...pts.map((q) => q.y)) - by;
      if (bw >= bh) g.fillRect(bx + 2, by + bh / 2 - 1.2, bw - 4, 2.4); else g.fillRect(bx + bw / 2 - 1.2, by + 2, 2.4, bh - 4);
      g.restore();
    }
  }
  // Brass frame posts, and the lintel gear: a sensor over an automatic slider, a status lamp over the server room's.
  for (const [px, py] of [[d.x, d.y], [x1, y1]] as const) { g.fillStyle = INK; g.fillRect(px - 8, py - 8, 16, 16); g.fillStyle = BRASS; g.fillRect(px - 6, py - 6, 12, 12); g.fillStyle = 'rgba(255,255,255,0.35)'; g.fillRect(px - 6, py - 6, 12, 3); }
  if (slide && h) {
    const mx = d.x + d.w / 2;
    g.fillStyle = INK; g.fillRect(mx - 12, d.y - 22, 24, 9);
    const lit = open > 8 || Math.floor(clock(info.now) / 900) % 4 === 0;
    const server = metal;
    g.fillStyle = server ? (open > 8 ? '#46e08a' : '#e0403a') : lit ? '#7fd0ff' : '#35566a';
    g.beginPath(); g.arc(mx, d.y - 17.5, 2.6, 0, TAU); g.fill();
  }
  if (d.kind === 'double-swing' || d.kind === 'swing') { g.fillStyle = INK; for (const [hx, hy] of d.kind === 'double-swing' ? [[d.x, d.y], [x1, y1]] : (d.hinge ?? 'start') === 'start' ? [[d.x, d.y]] : [[x1, y1]]) { g.beginPath(); g.arc(hx!, hy!, 4, 0, TAU); g.fill(); } }
  return true;
}

/* -- roofs ------------------------------------------------------------------------------------------------------- */

export function drawEmbassyRoof(g: G, r: MapRoof, alpha: number, info: GeoInfo): boolean {
  const xs = r.points.map((p) => p.x), ys = r.points.map((p) => p.y);
  const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
  const t = clock(info.now);
  if (r.id === 'dome') {
    const cx = ATRIUM.x, cy = ATRIUM.y, R = ATRIUM.rOut + 8;
    // A glass dome: you can see the fight through it, and the brass ribs and the lantern at its crown.
    g.save(); g.globalAlpha = alpha * 0.46;
    const grd = g.createRadialGradient(cx - R * 0.3, cy - R * 0.35, R * 0.1, cx, cy, R);
    grd.addColorStop(0, '#e4f4fa'); grd.addColorStop(0.6, '#8ec0d2'); grd.addColorStop(1, '#4a7a92');
    g.fillStyle = grd; g.beginPath(); g.arc(cx, cy, R, 0, TAU); g.fill();
    g.restore();
    g.save(); g.globalAlpha = alpha * 0.9;
    g.strokeStyle = BRASS_HI; g.lineWidth = 4;
    for (let k = 0; k < 16; k++) { const a = (k / 16) * TAU + 0.2; g.beginPath(); g.moveTo(cx + Math.cos(a) * 34, cy + Math.sin(a) * 34); g.lineTo(cx + Math.cos(a) * R, cy + Math.sin(a) * R); g.stroke(); }
    g.lineWidth = 3; for (const rad of [110, 210, 320]) { g.beginPath(); g.arc(cx, cy, rad, 0, TAU); g.stroke(); }
    g.strokeStyle = INK; g.lineWidth = 2; g.beginPath(); g.arc(cx, cy, R, 0, TAU); g.stroke();
    disc(g, cx, cy, 34, '#d9b24a', 2); disc(g, cx, cy, 20, '#ffe9a8', 1.6);
    g.fillStyle = 'rgba(255,255,255,0.7)'; g.beginPath(); g.ellipse(cx - R * 0.42, cy - R * 0.46, 60, 20, -0.7, 0, TAU); g.fill();
    g.restore();
    return true;
  }
  const res = r.id.endsWith('~');
  const id = r.id.replace('~', '');
  const w = x1 - x0, h = y1 - y0;
  g.fillStyle = INK; g.fillRect(x0, y1, w, 8);
  g.fillStyle = res ? '#4a3a3e' : '#6e7480'; g.fillRect(x0, y1, w, 6);
  g.fillStyle = res ? '#6a5258' : '#8a919c'; g.fillRect(x0, y0, w, h);
  g.save(); g.beginPath(); g.rect(x0, y0, w, h); g.clip();
  if (res) {
    // Slate tiles in courses with a ridge along the long axis.
    g.strokeStyle = 'rgba(20, 12, 16, 0.4)'; g.lineWidth = 1.4;
    for (let y = y0 + 14; y < y1; y += 14) { g.beginPath(); g.moveTo(x0, y); g.lineTo(x1, y); g.stroke(); for (let x = x0 + (Math.round((y - y0) / 14) % 2) * 12; x < x1; x += 24) { g.beginPath(); g.moveTo(x, y - 14); g.lineTo(x, y); g.stroke(); } }
    g.fillStyle = '#3a2a2e'; if (w >= h) g.fillRect(x0, y0 + h / 2 - 5, w, 10); else g.fillRect(x0 + w / 2 - 5, y0, 10, h);
    if (id === 'conference') { // The ballroom's skylight: a glazed lantern over the dance floor.
      g.fillStyle = 'rgba(190, 225, 240, 0.7)'; g.fillRect(x0 + w / 2 - 110, y0 + h / 2 - 70, 220, 140);
      g.strokeStyle = BRASS_HI; g.lineWidth = 3; g.strokeRect(x0 + w / 2 - 110, y0 + h / 2 - 70, 220, 140); g.beginPath(); g.moveTo(x0 + w / 2, y0 + h / 2 - 70); g.lineTo(x0 + w / 2, y0 + h / 2 + 70); g.moveTo(x0 + w / 2 - 110, y0 + h / 2); g.lineTo(x0 + w / 2 + 110, y0 + h / 2); g.stroke();
    }
  } else {
    // A flat membrane roof: seams, a vent or two, an air-conditioning unit with a slow fan, a skylight over the big rooms.
    g.strokeStyle = 'rgba(20, 24, 32, 0.28)'; g.lineWidth = 1.6;
    for (let x = x0 + 40; x < x1; x += 40) { g.beginPath(); g.moveTo(x, y0); g.lineTo(x, y1); g.stroke(); }
    const s = hash(x0, y0);
    for (let i = 0; i < 2 + (w * h > 150000 ? 2 : 0); i++) {
      const ux = x0 + 40 + ((s >> (i * 3)) % Math.max(10, Math.floor(w - 110))), uy = y0 + 36 + ((s >> (i * 5 + 1)) % Math.max(10, Math.floor(h - 100)));
      g.fillStyle = 'rgba(14,16,22,0.28)'; g.fillRect(ux + 5, uy + 5, 60, 44);
      g.fillStyle = '#b6bcc6'; g.fillRect(ux, uy, 60, 44); g.strokeStyle = INK; g.lineWidth = 2; g.strokeRect(ux, uy, 60, 44);
      g.fillStyle = '#4a505a'; g.beginPath(); g.arc(ux + 30, uy + 22, 14, 0, TAU); g.fill();
      g.strokeStyle = '#9aa0aa'; g.lineWidth = 3; const a = reduced ? 0.4 : t * 0.003; g.beginPath(); g.moveTo(ux + 30 + Math.cos(a) * 12, uy + 22 + Math.sin(a) * 12); g.lineTo(ux + 30 - Math.cos(a) * 12, uy + 22 - Math.sin(a) * 12); g.moveTo(ux + 30 + Math.cos(a + 1.57) * 12, uy + 22 + Math.sin(a + 1.57) * 12); g.lineTo(ux + 30 - Math.cos(a + 1.57) * 12, uy + 22 - Math.sin(a + 1.57) * 12); g.stroke();
    }
    if (id === 'conference') {
      // The helipad on the roof's edge: a ring, an H, edge lights that blink slowly.
      const hx = x1 - 170, hy = y0 + 120;
      g.fillStyle = '#4a4f58'; g.beginPath(); g.arc(hx, hy, 90, 0, TAU); g.fill();
      g.strokeStyle = '#e8e2d0'; g.lineWidth = 7; g.beginPath(); g.arc(hx, hy, 80, 0, TAU); g.stroke();
      g.fillStyle = '#e8e2d0'; g.fillRect(hx - 30, hy - 36, 12, 72); g.fillRect(hx + 18, hy - 36, 12, 72); g.fillRect(hx - 30, hy - 7, 60, 14);
      for (let k = 0; k < 12; k++) { const a = (k / 12) * TAU; g.fillStyle = Math.floor(t / 700 + k) % 2 || reduced ? '#ffb347' : '#6a4a22'; g.beginPath(); g.arc(hx + Math.cos(a) * 90, hy + Math.sin(a) * 90, 3.4, 0, TAU); g.fill(); }
    }
  }
  g.restore();
  g.strokeStyle = 'rgba(255,255,255,0.22)'; g.lineWidth = 6; g.beginPath(); g.moveTo(x0 + 3, y1 - 3); g.lineTo(x0 + 3, y0 + 3); g.lineTo(x1 - 3, y0 + 3); g.stroke();
  g.strokeStyle = INK; g.lineWidth = 2; g.strokeRect(x0, y0, w, h);
  void alpha;
  return true;
}
