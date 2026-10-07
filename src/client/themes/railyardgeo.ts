import type { MapDoor, MapPoly, MapRoof, Pt } from '../../shared/geom.ts';
import type { DoorLeaf } from '../../shared/sim/doors.ts';
import { DOOR_HEIGHT, drawExtruded, type GeoInfo, type PolyLook } from '../geoart.ts';
import { setLight } from '../lighting.ts';
import { C, hash, TAU } from './railyardkit.ts';
import { drawVehicle } from '../vehicleart.ts';

/**
 * The Rail Yard's polygons, doors and roofs: the two long trains, the turntable, the water and coaling towers, the barrier
 * arm; sliding glass, panelled wood and carriage doors; and the roofs (vault, skylight, canopy iron, slate, rock). Twins
 * (ids ending in `~`) are dressed differently from the north-west originals: a night express against a mail train, a
 * working turntable against an overgrown one, a water tower against a coaling tower.
 */
type G = CanvasRenderingContext2D;
const twin = (id: string | undefined) => !!id && id.endsWith('~');
const look = (top: string, front: string, lit: string, shade: string): PolyLook => ({ top, front, lit, shade });
const bbox = (pts: readonly Pt[]) => {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const p of pts) { x0 = Math.min(x0, p.x); y0 = Math.min(y0, p.y); x1 = Math.max(x1, p.x); y1 = Math.max(y1, p.y); }
  return { x0, y0, x1, y1, w: x1 - x0, h: y1 - y0, cx: (x0 + x1) / 2, cy: (y0 + y1) / 2 };
};
const trace = (g: G, pts: readonly Pt[]) => { g.beginPath(); pts.forEach((p, i) => (i ? g.lineTo(p.x, p.y) : g.moveTo(p.x, p.y))); g.closePath(); };

/* ------------------------------------------------------------ carriages */

type Livery = { body: string; bodyHi: string; bodyLo: string; band: string; roof: string; roofHi: string; text: string; name: string; sub: string };
const EXPRESS: Livery[] = [
  { body: '#e0d6b8', bodyHi: '#f0e8d0', bodyLo: '#b9ae90', band: '#6b2d2a', roof: '#8c9199', roofHi: '#b6bbc2', text: '#6b2d2a', name: 'DINING CAR', sub: 'THE GOLDEN ARROW' },
  { body: '#e0d6b8', bodyHi: '#f0e8d0', bodyLo: '#b9ae90', band: '#6b2d2a', roof: '#8c9199', roofHi: '#b6bbc2', text: '#6b2d2a', name: 'FIRST CLASS', sub: 'THE GOLDEN ARROW' },
  { body: '#e0d6b8', bodyHi: '#f0e8d0', bodyLo: '#b9ae90', band: '#6b2d2a', roof: '#8c9199', roofHi: '#b6bbc2', text: '#6b2d2a', name: 'CORRIDOR COACH', sub: 'THE GOLDEN ARROW' },
  { body: '#e0d6b8', bodyHi: '#f0e8d0', bodyLo: '#b9ae90', band: '#6b2d2a', roof: '#8c9199', roofHi: '#b6bbc2', text: '#6b2d2a', name: 'SECOND CLASS', sub: 'THE GOLDEN ARROW' },
  { body: '#e0d6b8', bodyHi: '#f0e8d0', bodyLo: '#b9ae90', band: '#6b2d2a', roof: '#8c9199', roofHi: '#b6bbc2', text: '#6b2d2a', name: 'BRAKE VAN', sub: 'THE GOLDEN ARROW' },
];
const MAILCAR: Livery = { body: '#7a2f2c', bodyHi: '#9a4a44', bodyLo: '#561f1e', band: '#d9b24a', roof: '#4e4f55', roofHi: '#74767e', text: '#e8c868', name: 'R.M.', sub: 'ROYAL MAIL  SORTING TENDER' };

function windowsRow(g: G, x: number, y: number, w: number, h: number, lit: number, seed: number, door: readonly number[]) {
  const n = Math.floor((w - 40) / 46);
  for (let i = 0; i < n; i++) {
    const wx = x + 24 + i * ((w - 48) / n) + 4;
    if (door.some((d) => Math.abs(wx + 18 - d) < 30)) continue;
    g.fillStyle = C.ink; g.fillRect(wx - 2, y + 3, 40, h - 12);
    const on = hash(seed, i, 7) < lit;
    g.fillStyle = on ? 'rgba(255, 206, 120, 0.95)' : '#2a3038'; g.fillRect(wx, y + 5, 36, h - 16);
    if (on) { g.fillStyle = 'rgba(190, 70, 50, 0.55)'; g.fillRect(wx, y + 5, 11, h - 16); g.fillStyle = 'rgba(255, 244, 210, 0.35)'; g.fillRect(wx + 12, y + 5, 24, 4); }
    else { g.fillStyle = 'rgba(140, 170, 190, 0.2)'; g.fillRect(wx + 2, y + 7, 14, 4); }
  }
}

// The carriages and both locomotives come from the vehicle kit (kitTrain below); this hand art is the fallback while they bake.
function carriage(g: G, pts: readonly Pt[], id: string, idx: number, hollow: boolean) {
  const b = bbox(pts), t = twin(id), L = t ? MAILCAR : EXPRESS[idx]!, fh = 40, c = 26;
  const x = b.x0, y = b.y0, w = b.w, h = b.h;
  // Front face: the body side, a lower skirt, windows, doors, the lettering band.
  g.fillStyle = L.body; g.fillRect(x + (hollow ? 0 : c), y + h, w - (hollow ? 0 : 2 * c), fh);
  g.fillStyle = L.bodyLo; g.fillRect(x + (hollow ? 0 : c), y + h + fh * 0.78, w - (hollow ? 0 : 2 * c), fh * 0.22);
  g.fillStyle = L.band; g.fillRect(x + (hollow ? 0 : c), y + h + 2, w - (hollow ? 0 : 2 * c), 4); g.fillRect(x + (hollow ? 0 : c), y + h + fh * 0.7, w - (hollow ? 0 : 2 * c), 3);
  const doors = hollow ? [x + 130, x + 410] : [x + 60, x + w - 60];
  windowsRow(g, x, y + h + 6, w, fh - 6, t ? 0.25 : 0.7, Math.round(x + y), doors);
  for (const d of doors) {
    g.fillStyle = L.bodyLo; g.fillRect(d - 22, y + h + 3, 44, fh - 6);
    g.strokeStyle = C.ink; g.lineWidth = 1.5; g.strokeRect(d - 22, y + h + 3, 44, fh - 6);
    g.fillStyle = C.brass; g.fillRect(d + 14, y + h + 16, 4, 7);
    g.fillStyle = C.coal; g.fillRect(d - 22, y + h + fh - 6, 44, 4);
  }
  g.fillStyle = L.text; g.font = '700 9px "Barlow Condensed", sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  (g as unknown as { letterSpacing: string }).letterSpacing = '2px';
  g.fillText(`${L.sub}`, x + w / 2, y + h + 8 + 0.5);
  (g as unknown as { letterSpacing: string }).letterSpacing = '0px';
  g.strokeStyle = C.ink; g.lineWidth = 2; g.beginPath(); g.moveTo(x + (hollow ? 0 : c), y + h); g.lineTo(x + (hollow ? 0 : c), y + h + fh); g.lineTo(x + w - (hollow ? 0 : c), y + h + fh); g.lineTo(x + w - (hollow ? 0 : c), y + h); g.stroke();
  // Wheels and bogies under the skirt.
  g.fillStyle = C.coal; for (const bx of [x + 80, x + w - 80]) { g.fillRect(bx - 34, y + h + fh - 3, 68, 7); }
  // The top: roof (or an open interior).
  if (hollow) {
    // Interior seen from above: a runner carpet and seat backs under the roof (which the roof layer covers).
    g.fillStyle = '#6a3a2e'; g.fillRect(x, y, w, h);
    g.fillStyle = '#8a4a3a'; g.fillRect(x + 14, y + h / 2 - 16, w - 28, 32);
    g.fillStyle = C.brass; g.fillRect(x + 14, y + h / 2 - 16, w - 28, 2); g.fillRect(x + 14, y + h / 2 + 14, w - 28, 2);
    g.fillStyle = '#3a2c20'; for (let i = 0; i < 6; i++) { g.fillRect(x + 40 + i * 70, y + 18, 28, 8); g.fillRect(x + 40 + i * 70, y + h - 26, 28, 8); }
    return;
  }
  trace(g, pts); g.fillStyle = L.roof; g.fill();
  g.save(); trace(g, pts); g.clip();
  g.fillStyle = L.roofHi; g.fillRect(x, y, w, h * 0.34);
  g.fillStyle = 'rgba(0, 0, 0, 0.22)'; g.fillRect(x, y + h * 0.7, w, h * 0.3);
  g.strokeStyle = 'rgba(16, 18, 24, 0.4)'; g.lineWidth = 1.5; g.beginPath(); for (let xx = x + 40; xx < x + w; xx += 40) { g.moveTo(xx, y); g.lineTo(xx, y + h); } g.stroke();
  g.fillStyle = L.roofHi; g.fillRect(x + 20, y + h / 2 - 7, w - 40, 14);
  g.fillStyle = C.ink; for (const vx of [x + w * 0.25, x + w * 0.5, x + w * 0.75]) { g.beginPath(); g.arc(vx, y + h / 2, 9, 0, TAU); g.fill(); g.fillStyle = L.roofHi; g.beginPath(); g.arc(vx - 1, y + h / 2 - 1, 6, 0, TAU); g.fill(); g.fillStyle = C.ink; }
  g.fillStyle = 'rgba(255, 255, 255, 0.22)'; g.fillRect(x, y, w, 4);
  g.restore();
  trace(g, pts); g.strokeStyle = C.ink; g.lineWidth = 2.5; g.lineJoin = 'round'; g.stroke();
  // A warm lamp in the clerestory, a brake wheel on the brake van.
  g.fillStyle = 'rgba(255, 214, 140, 0.8)'; g.fillRect(x + w / 2 - 3, y + 3, 6, 3);
}

/* ------------------------------------------------------------- locomotive */

function locomotive(g: G, group: readonly MapPoly[], id: string, cold: boolean) {
  const all = group.flatMap((p) => p.points), b = bbox(all), t = twin(id);
  const tender = group.find((p) => p.part === 'tender')!, cab = group.find((p) => p.part === 'cab')!;
  const flip = bbox(cab.points).cx < bbox(tender.points).cx ? 1 : -1; // tender is on the tail side; flip = -1 when facing west
  const facingEast = bbox(tender.points).cx < bbox(cab.points).cx;
  void flip;
  g.save();
  g.translate(b.cx, b.cy);
  if (!facingEast) g.scale(-1, 1);
  // Local frame: nose +x, x from -320 to 330, y +-70.
  const green = t ? '#3a3f4a' : '#2f5a44', greenHi = t ? '#565c68' : '#4a7a5e', greenLo = t ? '#22262e' : '#1f3b2d';
  const fh = 42;
  // Shadows and front faces.
  g.fillStyle = '#17191e'; g.fillRect(-320, 68, 170, fh * 0.9);
  g.fillStyle = greenLo; g.fillRect(-150, 70, 110, fh + 6); g.fillRect(-40, 52, 330, fh);
  g.fillStyle = C.coal; g.fillRect(-320, 68, 170, fh * 0.9);
  g.fillStyle = '#34363e'; g.fillRect(-320, 68, 170, 6);
  g.strokeStyle = C.ink; g.lineWidth = 2; g.strokeRect(-320, 68, 170, fh * 0.9); g.strokeRect(-150, 70, 110, fh + 6); g.strokeRect(-40, 52, 330, fh);
  // Wheels: big coupled drivers with brass hubs.
  const drivers = [0, 80, 160, 240];
  for (const dx of drivers) {
    g.fillStyle = C.ink; g.beginPath(); g.ellipse(dx, 52 + fh - 6, 26, 15, 0, 0, TAU); g.fill();
    g.fillStyle = t ? '#7a4a3a' : '#a8312a'; g.beginPath(); g.ellipse(dx, 52 + fh - 6, 21, 11, 0, 0, TAU); g.fill();
    g.fillStyle = C.brass; g.beginPath(); g.ellipse(dx, 52 + fh - 6, 6, 3.5, 0, 0, TAU); g.fill();
  }
  g.strokeStyle = C.railHi; g.lineWidth = 3; g.beginPath(); g.moveTo(0, 52 + fh - 6); g.lineTo(240, 52 + fh - 6); g.stroke();
  // Cab front face with a window and the glow of the firebox.
  g.fillStyle = C.ink; g.fillRect(-132, 80, 30, 24);
  g.fillStyle = cold ? '#2a3038' : 'rgba(255, 150, 70, 0.95)'; g.fillRect(-130, 82, 26, 20);
  g.fillStyle = 'rgba(255, 220, 160, 0.4)'; if (!cold) g.fillRect(-130, 82, 26, 6);
  // Tender top: coal heaped high.
  g.fillStyle = '#3e4048'; g.fillRect(-320, -68, 170, 136);
  g.fillStyle = C.ink; g.fillRect(-312, -60, 154, 120);
  g.fillStyle = C.coal; g.beginPath(); g.moveTo(-308, 56); for (let i = 0; i <= 12; i++) g.lineTo(-308 + i * 12.5, -34 + hash(i, 3) * 40 - (i > 3 && i < 9 ? 14 : 0)); g.lineTo(-158, 56); g.closePath(); g.fill();
  for (let i = 0; i < 46; i++) { g.fillStyle = i % 3 ? C.coalHi : '#7a7c88'; g.fillRect(-304 + hash(i, 1) * 144, -48 + hash(i, 2) * 90, 5, 3); }
  g.strokeStyle = C.ink; g.lineWidth = 2.5; g.strokeRect(-320, -68, 170, 136);
  g.fillStyle = t ? '#5a2a2a' : '#8a2a22'; g.fillRect(-320, -68, 170, 7); g.fillStyle = C.brass; g.fillRect(-320, -61, 170, 2);
  g.fillStyle = C.brass; g.font = '700 14px "Barlow Condensed", sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  if (!t) { g.save(); g.translate(-235, 84); if (!facingEast) g.scale(-1, 1); g.fillText('GCR', 0, 0); g.restore(); }
  // Cab roof: a black roof with a lamp and brass window frames; the spectacle plate toward the boiler.
  g.fillStyle = '#26282e'; g.fillRect(-150, -70, 110, 140);
  g.fillStyle = '#34363e'; g.fillRect(-148, -68, 106, 40);
  g.fillStyle = 'rgba(0,0,0,0.25)'; g.fillRect(-150, 28, 110, 42);
  g.strokeStyle = C.brass; g.lineWidth = 2; g.strokeRect(-140, -58, 90, 116);
  g.strokeStyle = C.ink; g.lineWidth = 2.5; g.strokeRect(-150, -70, 110, 140);
  g.fillStyle = cold ? '#4a3a2a' : 'rgba(255, 170, 80, 0.7)'; g.beginPath(); g.arc(-95, 0, 12, 0, TAU); g.fill();
  // Boiler: a green cylinder lit from the top left, brass bands, dome, chimney, valves.
  const boiler = () => { g.beginPath(); g.moveTo(-40, -52); g.lineTo(250, -52); g.lineTo(290, -34); g.lineTo(290, 34); g.lineTo(250, 52); g.lineTo(-40, 52); g.closePath(); };
  boiler(); g.fillStyle = green; g.fill();
  g.save(); boiler(); g.clip();
  g.fillStyle = greenHi; g.fillRect(-40, -52, 330, 30);
  g.fillStyle = 'rgba(255, 255, 255, 0.12)'; g.fillRect(-40, -52, 330, 8);
  g.fillStyle = greenLo; g.fillRect(-40, 24, 330, 28);
  g.fillStyle = '#17181c'; g.fillRect(200, -52, 100, 104);
  g.fillStyle = '#2a2c32'; g.fillRect(200, -52, 100, 28);
  g.fillStyle = C.brass; for (const bx of [10, 70, 140, 196]) g.fillRect(bx, -52, 6, 104);
  g.fillStyle = C.brassHi; for (const bx of [10, 70, 140, 196]) g.fillRect(bx, -52, 2, 104);
  g.restore();
  g.strokeStyle = C.ink; g.lineWidth = 2.5; boiler(); g.stroke();
  // Dome and sandbox, brass; chimney with its flared cap; the headlamp in front.
  g.fillStyle = C.ink; g.beginPath(); g.arc(30, -2, 22, 0, TAU); g.fill();
  g.fillStyle = C.brass; g.beginPath(); g.arc(30, -4, 19, 0, TAU); g.fill(); g.fillStyle = C.brassHi; g.beginPath(); g.arc(24, -10, 9, 0, TAU); g.fill();
  g.fillStyle = 'rgba(255, 255, 255, 0.6)'; g.beginPath(); g.arc(20, -13, 3, 0, TAU); g.fill();
  g.fillStyle = C.ink; g.beginPath(); g.arc(104, 2, 17, 0, TAU); g.fill(); g.fillStyle = greenLo; g.beginPath(); g.arc(104, 0, 14, 0, TAU); g.fill();
  g.fillStyle = C.ink; g.beginPath(); g.arc(255, -2, 24, 0, TAU); g.fill();
  g.fillStyle = '#17181c'; g.beginPath(); g.arc(255, -4, 20, 0, TAU); g.fill(); g.strokeStyle = C.brass; g.lineWidth = 3; g.beginPath(); g.arc(255, -4, 20, 0, TAU); g.stroke();
  g.fillStyle = '#34363e'; g.beginPath(); g.arc(255, -4, 11, 0, TAU); g.fill();
  g.fillStyle = C.ink; g.beginPath(); g.arc(290, 0, 8, 0, TAU); g.fill();
  g.fillStyle = cold ? '#6a6a60' : C.lampPale; g.beginPath(); g.arc(290, 0, 5, 0, TAU); g.fill();
  // Pilot (cowcatcher): striped wedge.
  g.fillStyle = '#2a2c32'; g.beginPath(); g.moveTo(290, -26); g.lineTo(330, -14); g.lineTo(330, 14); g.lineTo(290, 26); g.closePath(); g.fill();
  g.strokeStyle = C.red; g.lineWidth = 3; g.beginPath(); for (let i = -18; i <= 18; i += 9) { g.moveTo(292, i * 1.2); g.lineTo(328, i * 0.55); } g.stroke();
  g.strokeStyle = C.ink; g.lineWidth = 2; g.beginPath(); g.moveTo(290, -26); g.lineTo(330, -14); g.lineTo(330, 14); g.lineTo(290, 26); g.closePath(); g.stroke();
  // Number plate on the boiler front.
  g.fillStyle = C.brass; g.fillRect(262, 8, 20, 12);
  g.fillStyle = C.ink; g.font = '700 10px "Barlow Condensed", sans-serif'; g.fillText(t ? '2' : '4', 272, 14.5);
  if (cold && t) { // The twin in the carriage shed is under a tarpaulin and scaffold poles.
    g.fillStyle = 'rgba(70, 90, 110, 0.82)'; g.fillRect(-140, -64, 400, 128);
    g.strokeStyle = 'rgba(30, 40, 52, 0.7)'; g.lineWidth = 2; g.beginPath(); for (let x = -120; x < 260; x += 40) { g.moveTo(x, -64); g.quadraticCurveTo(x + 20, -20, x, 64); } g.stroke();
    g.strokeStyle = C.timber; g.lineWidth = 6; g.beginPath(); g.moveTo(-100, -80); g.lineTo(-100, 90); g.moveTo(180, -80); g.lineTo(180, 90); g.moveTo(-100, -70); g.lineTo(180, -70); g.stroke();
  }
  g.restore();
}

/* ------------------------------------------------------------ turntable */

const PIT = look('#6e665a', '#3e3830', '#8a8272', '#4a443a');
const GIRDER = look('#566b5e', '#2a3a30', '#7a9484', '#3a4c40');
function turntable(g: G, group: readonly MapPoly[], id: string) {
  const t = twin(id);
  const hub = group.find((p) => p.part === 'hub')!, hb = bbox(hub.points);
  for (const p of group) {
    if (p.part === 'bridge') continue;
    if (p.part === 'hub') continue;
    drawExtruded(g, p.points, p.height ?? 22, t ? look('#5f6a52', '#38402e', '#7e8a6e', '#454e38') : PIT);
  }
  const bridge = group.find((p) => p.part === 'bridge')!;
  drawExtruded(g, bridge.points, 14, t ? look('#6a5a4a', '#3a3028', '#8a7a68', '#4a3e34') : GIRDER);
  // Rivets and a brass centre.
  const bb = bbox(bridge.points);
  g.save(); trace(g, bridge.points); g.clip();
  g.strokeStyle = 'rgba(10, 16, 12, 0.5)'; g.lineWidth = 2; g.translate(hb.cx, hb.cy); g.rotate(0.95);
  for (let x = -220; x < 230; x += 20) { g.beginPath(); g.moveTo(x, -16); g.lineTo(x + 10, 16); g.stroke(); }
  g.restore();
  drawExtruded(g, hub.points, 40, look('#7c725e', '#46402f', '#a39878', '#54503a'));
  g.fillStyle = C.brass; g.beginPath(); g.arc(hb.cx, hb.cy - 2, 18, 0, TAU); g.fill(); g.strokeStyle = C.ink; g.lineWidth = 2; g.stroke();
  g.fillStyle = C.brassHi; g.beginPath(); g.arc(hb.cx - 5, hb.cy - 8, 6, 0, TAU); g.fill();
  g.fillStyle = C.red; g.fillRect(hb.cx - 3, hb.cy - 2, 6, 6);
  void bb;
  if (t) { // Weeds in the rim's joints.
    g.strokeStyle = '#5a8a3e'; g.lineWidth = 2;
    for (let i = 0; i < 40; i++) { const a = hash(i, 11) * TAU, r = 262 + (hash(i, 12) - 0.5) * 30; const x = hb.cx + Math.cos(a) * r, y = hb.cy + Math.sin(a) * r; g.beginPath(); g.moveTo(x, y); g.lineTo(x + 2, y - 8); g.stroke(); }
  }
}

/* ------------------------------------------------------------ the towers */

function roundTower(g: G, group: readonly MapPoly[], id: string) {
  const p = group[0]!, b = bbox(p.points), r = b.w / 2, t = twin(id), h = 72;
  g.fillStyle = 'rgba(8, 8, 12, 0.35)'; g.beginPath(); g.ellipse(b.cx + 10, b.cy + 14, r + 8, r * 0.9, 0, 0, TAU); g.fill();
  if (!t) {
    // Water tower: stave tank on a brick plinth, iron hoops, conical slate roof, a finial.
    g.fillStyle = '#3a2c1e'; g.beginPath(); g.moveTo(b.x0, b.cy); g.lineTo(b.x0, b.cy + h); g.arc(b.cx, b.cy + h, r, Math.PI, 0, true); g.lineTo(b.x1, b.cy); g.fill();
    g.strokeStyle = 'rgba(10, 6, 2, 0.45)'; g.lineWidth = 1.2; for (let x = b.x0 + 8; x < b.x1; x += 9) { const dy = Math.sqrt(Math.max(0, r * r - (x - b.cx) ** 2)); g.beginPath(); g.moveTo(x, b.cy); g.lineTo(x, b.cy + h + dy * 0.9); g.stroke(); }
    g.strokeStyle = C.iron; g.lineWidth = 6; for (const hy of [12, 36, 60]) { g.beginPath(); g.ellipse(b.cx, b.cy + hy, r, r * 0.4, 0, 0, Math.PI); g.stroke(); }
    g.strokeStyle = C.ink; g.lineWidth = 2.5; g.beginPath(); g.moveTo(b.x0, b.cy); g.lineTo(b.x0, b.cy + h); g.arc(b.cx, b.cy + h, r, Math.PI, 0, true); g.lineTo(b.x1, b.cy); g.stroke();
    g.fillStyle = '#4a4f5c'; g.beginPath(); g.arc(b.cx, b.cy, r, 0, TAU); g.fill();
    const gr = g.createRadialGradient(b.cx - r * 0.3, b.cy - r * 0.3, 4, b.cx, b.cy, r); gr.addColorStop(0, '#9aa0b0'); gr.addColorStop(1, '#3a3e4a'); g.fillStyle = gr; g.beginPath(); g.arc(b.cx, b.cy, r, 0, TAU); g.fill();
    g.strokeStyle = 'rgba(16, 18, 26, 0.4)'; g.lineWidth = 1.5; for (let i = 0; i < 14; i++) { const a = (i * TAU) / 14; g.beginPath(); g.moveTo(b.cx, b.cy); g.lineTo(b.cx + Math.cos(a) * r, b.cy + Math.sin(a) * r); g.stroke(); }
    g.strokeStyle = C.ink; g.lineWidth = 3; g.beginPath(); g.arc(b.cx, b.cy, r, 0, TAU); g.stroke();
    g.fillStyle = C.brass; g.beginPath(); g.arc(b.cx, b.cy - 2, 8, 0, TAU); g.fill(); g.stroke();
    g.fillStyle = C.brassHi; g.beginPath(); g.arc(b.cx - 2, b.cy - 5, 3, 0, TAU); g.fill();
    g.fillStyle = 'rgba(232, 224, 200, 0.85)'; g.font = '700 20px "Barlow Condensed", sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('WATER', b.cx, b.cy + 30);
  } else {
    // Coaling tower: a concrete cylinder with slit windows and a hoist head.
    g.fillStyle = '#6a6e74'; g.beginPath(); g.moveTo(b.x0, b.cy); g.lineTo(b.x0, b.cy + h); g.arc(b.cx, b.cy + h, r, Math.PI, 0, true); g.lineTo(b.x1, b.cy); g.fill();
    g.fillStyle = 'rgba(0, 0, 0, 0.25)'; g.fillRect(b.cx + r * 0.2, b.cy, r * 0.8, h + 20);
    g.fillStyle = C.ink; for (let i = 0; i < 5; i++) for (const yy of [14, 46]) { const x = b.x0 + 18 + i * (b.w - 36) / 4; g.fillRect(x, b.cy + yy, 6, 20); g.fillStyle = hash(i, yy) < 0.4 ? 'rgba(255, 190, 110, 0.9)' : C.ink; g.fillRect(x + 1, b.cy + yy + 2, 4, 16); g.fillStyle = C.ink; }
    g.strokeStyle = C.ink; g.lineWidth = 2.5; g.beginPath(); g.moveTo(b.x0, b.cy); g.lineTo(b.x0, b.cy + h); g.arc(b.cx, b.cy + h, r, Math.PI, 0, true); g.lineTo(b.x1, b.cy); g.stroke();
    g.fillStyle = '#868b92'; g.beginPath(); g.arc(b.cx, b.cy, r, 0, TAU); g.fill(); g.strokeStyle = C.ink; g.stroke();
    g.fillStyle = '#17181c'; g.beginPath(); g.arc(b.cx, b.cy, r * 0.72, 0, TAU); g.fill();
    g.fillStyle = C.coal; for (let i = 0; i < 40; i++) { const a = hash(i, 1) * TAU, d = Math.sqrt(hash(i, 2)) * r * 0.66; g.fillStyle = i % 3 ? C.coalHi : '#6a6c78'; g.fillRect(b.cx + Math.cos(a) * d, b.cy + Math.sin(a) * d, 5, 3); }
    g.fillStyle = '#9a8a6a'; g.fillRect(b.cx - 8, b.cy - r, 16, r * 2);
    g.fillStyle = C.rust; g.fillRect(b.cx - 26, b.cy - 20, 52, 40); g.strokeStyle = C.ink; g.strokeRect(b.cx - 26, b.cy - 20, 52, 40);
    g.fillStyle = 'rgba(232, 224, 200, 0.8)'; g.font = '700 16px "Barlow Condensed", sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('COAL', b.cx, b.cy + 52);
  }
}

function crossingArm(g: G, p: MapPoly) {
  const b = bbox(p.points);
  g.fillStyle = 'rgba(8, 8, 12, 0.3)'; g.fillRect(b.x0 + 4, b.y0 + 10, b.w, b.h);
  g.save(); g.beginPath(); g.rect(b.x0, b.y0, b.w, b.h); g.clip();
  for (let x = b.x0; x < b.x1; x += 20) { g.fillStyle = ((x - b.x0) / 20) % 2 ? '#e8e2d0' : C.red; g.fillRect(x, b.y0, 20, b.h); }
  g.restore();
  g.strokeStyle = C.ink; g.lineWidth = 2; g.strokeRect(b.x0, b.y0, b.w, b.h);
  g.fillStyle = C.red; for (const x of [b.x0 + 14, b.x1 - 14]) { g.beginPath(); g.arc(x, b.cy - 1, 4, 0, TAU); g.fill(); }
}

/* ------------------------------------------------------------- dispatch */

/** A group and its half-turn twin share a `group` name, so they arrive merged: split them by id and dress each. */
export function railDrawSetPiece(g: G, merged: readonly MapPoly[], info: GeoInfo): boolean {
  const gid0 = merged[0]!.group ?? '';
  if (!/^(car[1-5]|loco|stored|turntable|water-tower|crossing)$/.test(gid0)) return false;
  const a = merged.filter((q) => !twin(q.id)), b = merged.filter((q) => twin(q.id));
  if (a.length) one(g, a, gid0, info);
  if (b.length) one(g, b, `${gid0}~`, info);
  return true;
}
/** The express from the vehicle kit (docs/maps/VEHICLES.md): the carriages and both engines, placed by their polygons' extent. */
function kitTrain(g: G, group: readonly MapPoly[], gid: string, info: GeoInfo): boolean {
  const tw = twin(gid), b = bbox(group.flatMap((p) => p.points));
  const cy = (b.y0 + b.y1) / 2, rot = tw ? Math.PI : 0;
  if (/^car[1-5]~?$/.test(gid)) {
    const hollow = gid[3] === '3';
    return drawVehicle(g, 'carriage', { x: (b.x0 + b.x1) / 2, y: cy, rot, livery: tw ? 'mail' : 'green', variant: hollow ? 'hollow' : 'solid', t: info.now, polys: group });
  }
  if (/^(loco|stored)~?$/.test(gid)) return drawVehicle(g, 'loco', { x: tw ? b.x1 - 320 : b.x0 + 320, y: cy, rot, livery: tw ? 'mail' : 'green', t: info.now, polys: group });
  return false;
}
function one(g: G, group: readonly MapPoly[], gid: string, info: GeoInfo): boolean {
  if (kitTrain(g, group, gid, info)) return true;
  if (/^car[1-5]~?$/.test(gid)) {
    const idx = Number(gid[3]) - 1, hollow = idx === 2;
    const body = group.length === 1 ? group[0]!.points : group.flatMap((p) => p.points);
    // The hollow carriage's pieces are walls; draw it as one box with a cut-away roof.
    if (hollow) {
      const b = bbox(body);
      const pts: Pt[] = [{ x: b.x0, y: b.y0 }, { x: b.x1, y: b.y0 }, { x: b.x1, y: b.y1 }, { x: b.x0, y: b.y1 }];
      carriage(g, pts, gid, idx, true);
      // Wall pieces: the side walls' tops, between the door openings.
      for (const p of group) { if (p.part === 'end-w' || p.part === 'end-e' || p.part?.startsWith('side')) drawExtruded(g, p.points, 40, look(twin(gid) ? '#7a2f2c' : '#e0d6b8', twin(gid) ? '#561f1e' : '#b9ae90', '#ffffff', '#00000033')); }
    } else carriage(g, body, gid, idx, false);
    return true;
  }
  if (gid === 'loco' || gid === 'loco~') { locomotive(g, group, gid, false); return true; }
  if (gid === 'stored' || gid === 'stored~') { locomotive(g, group, gid, true); return true; }
  if (gid === 'turntable' || gid === 'turntable~') { turntable(g, group, gid); return true; }
  if (gid === 'water-tower' || gid === 'water-tower~') { roundTower(g, group, gid); return true; }
  if (gid === 'crossing' || gid === 'crossing~') { crossingArm(g, group[0]!); return true; }
  return false;
}

/* ---------------------------------------------------------------- doors */

const WOOD = look('#8a5a30', '#4e3016', '#b07a44', '#6a4422');
export function railDoor(g: G, d: MapDoor, leaves: readonly DoorLeaf[], open: number, info: GeoInfo): boolean {
  const h = d.axis === 'h';
  const x1 = d.x + (h ? d.w : 0), y1 = d.y + (h ? 0 : d.w);
  const cx = (d.x + x1) / 2, cy = (d.y + y1) / 2;
  const t = d.thick ?? 12;
  if (d.glow && open > 0.05) {
    setLight(`ry:door:${d.id}`, { x: cx, y: cy, radius: 200, color: d.glow, intensity: 0.5 * open, size: 14, inside: 60 });
    g.save(); g.globalCompositeOperation = 'lighter';
    const gr = g.createRadialGradient(cx, cy, 6, cx, cy, 120); gr.addColorStop(0, d.glow); gr.addColorStop(1, 'rgba(0,0,0,0)');
    g.globalAlpha = 0.18 * open * (1 - 0.6 * info.dark); g.fillStyle = gr; g.fillRect(cx - 120, cy - 120, 240, 240); g.restore();
  }
  // The track the slider runs on, a threshold in brass.
  g.fillStyle = 'rgba(10, 12, 18, 0.35)'; if (h) g.fillRect(d.x, d.y - 3, d.w, 6); else g.fillRect(d.x - 3, d.y, 6, d.w);
  const isCar = d.id.startsWith('car3');
  const glass = d.material === 'glass';
  const lk = isCar ? look('#cfc4a6', '#8a7e62', '#f0e8d0', '#a89c80') : glass ? look('rgba(170,214,232,0.5)', 'rgba(90,130,150,0.45)', 'rgba(225,244,252,0.75)', 'rgba(110,160,180,0.55)') : d.material === 'metal' ? look('#8d9aa0', '#4a5658', '#b4c0c4', '#62706f') : WOOD;
  for (const l of leaves) {
    const pts: Pt[] = l.pts ? Array.from({ length: l.pts.length / 2 }, (_, i) => ({ x: l.pts![2 * i]!, y: l.pts![2 * i + 1]! })) : [{ x: l.x, y: l.y }, { x: l.x + l.w, y: l.y }, { x: l.x + l.w, y: l.y + l.h }, { x: l.x, y: l.y + l.h }];
    drawExtruded(g, pts, glass ? 10 : DOOR_HEIGHT, lk);
    const b = bbox(pts);
    if (glass) { g.strokeStyle = C.brass; g.lineWidth = 2; g.strokeRect(b.x0 + 1, b.y0 + 1, b.w - 2, b.h - 2); }
    else if (!isCar && b.w > 24 && b.h > 24) { g.strokeStyle = 'rgba(20, 10, 4, 0.5)'; g.lineWidth = 1.5; g.strokeRect(b.x0 + 4, b.y0 + 4, b.w - 8, b.h - 8); }
    if (isCar && b.w > 30) { g.fillStyle = 'rgba(255, 210, 130, 0.85)'; g.fillRect(b.x0 + 10, b.y0 + 3, b.w - 20, Math.max(2, b.h - 6)); }
  }
  for (const [px, py] of [[d.x, d.y], [x1, y1]] as const) {
    drawExtruded(g, [{ x: px - t / 2 - 2, y: py - t / 2 - 2 }, { x: px + t / 2 + 2, y: py - t / 2 - 2 }, { x: px + t / 2 + 2, y: py + t / 2 + 2 }, { x: px - t / 2 - 2, y: py + t / 2 + 2 }], DOOR_HEIGHT + 2, look(C.brass, C.brassLo, C.brassHi, C.brassLo));
  }
  if (d.kind === 'swing' || d.kind === 'double-swing') {
    g.fillStyle = C.brassHi;
    const hinges = d.kind === 'double-swing' ? [[d.x, d.y], [x1, y1]] : (d.hinge ?? 'start') === 'start' ? [[d.x, d.y]] : [[x1, y1]];
    for (const [hx, hy] of hinges as [number, number][]) { g.beginPath(); g.arc(hx, hy, 4, 0, TAU); g.fill(); g.strokeStyle = C.ink; g.lineWidth = 1.5; g.stroke(); }
  }
  return true;
}

/* ---------------------------------------------------------------- roofs */

export function railRoof(g: G, r: MapRoof, alpha: number, info: GeoInfo): boolean {
  void alpha;
  const b = bbox(r.points), m = r.material ?? 'slate', pts = r.points;
  const dark = info.dark;
  const fh = m === 'carriage' ? 8 : 12;
  // Front lip along the south edge.
  const lip = m === 'iron' ? '#25392e' : m === 'vault' ? '#2c3a34' : m === 'glass' ? '#3a4a46' : m === 'rock' ? '#2a2420' : '#2a2d36';
  g.fillStyle = lip; g.fillRect(b.x0, b.y1, b.w, fh);
  g.strokeStyle = C.ink; g.lineWidth = 2; g.strokeRect(b.x0, b.y1, b.w, fh);
  if (m === 'iron') { g.fillStyle = C.cream; for (let x = b.x0 + 4; x < b.x1 - 10; x += 16) { g.beginPath(); g.moveTo(x, b.y1); g.lineTo(x + 12, b.y1); g.lineTo(x + 6, b.y1 + fh - 1); g.closePath(); g.fill(); } }
  trace(g, pts);
  const base = m === 'iron' ? '#3d5a48' : m === 'vault' ? '#33433c' : m === 'glass' ? '#3f5a5a' : m === 'rock' ? '#4a423a' : m === 'carriage' ? '#a09a8c' : '#4d525f';
  g.fillStyle = base; g.fill();
  g.save(); trace(g, pts); g.clip();
  const longX = b.w >= b.h;
  if (m === 'vault') {
    // A glazed barrel vault, ribs every 100 px across, a glass crown, a clerestory strip.
    const ribs = (x: number) => { g.fillStyle = '#25322c'; g.fillRect(x - 3, b.y0, 6, b.h); };
    g.fillStyle = '#4a6a68'; g.fillRect(b.x0 + b.w * 0.18, b.y0, b.w * 0.64, b.h);
    g.fillStyle = '#6f9593'; g.fillRect(b.x0 + b.w * 0.34, b.y0, b.w * 0.32, b.h);
    for (let y = b.y0; y < b.y1; y += 100) { g.fillStyle = '#25322c'; g.fillRect(b.x0, y - 3, b.w, 6); }
    for (let x = b.x0 + 50; x < b.x1; x += 100) ribs(x);
    g.fillStyle = 'rgba(255, 255, 255, 0.16)'; for (let i = 0; i < 18; i++) g.fillRect(b.x0 + b.w * 0.2 + hash(i, 1) * b.w * 0.6, b.y0 + hash(i, 2) * b.h, 22, 5);
    g.strokeStyle = C.brass; g.lineWidth = 3; g.beginPath(); g.moveTo(b.cx, b.y0); g.lineTo(b.cx, b.y1); g.stroke();
  } else if (m === 'glass') {
    g.fillStyle = '#58807e'; g.fillRect(b.x0 + 30, b.y0 + 30, b.w - 60, b.h - 60);
    g.strokeStyle = '#2c3d38'; g.lineWidth = 4;
    for (let x = b.x0 + 30; x < b.x1; x += 90) { g.beginPath(); g.moveTo(x, b.y0); g.lineTo(x, b.y1); g.stroke(); }
    for (let y = b.y0 + 30; y < b.y1; y += 90) { g.beginPath(); g.moveTo(b.x0, y); g.lineTo(b.x1, y); g.stroke(); }
    g.fillStyle = 'rgba(255, 255, 255, 0.14)'; for (let i = 0; i < 12; i++) g.fillRect(b.x0 + 40 + hash(i, 3) * (b.w - 120), b.y0 + 40 + hash(i, 4) * (b.h - 100), 36, 6);
  } else if (m === 'iron') {
    // Corrugated iron panels and a glazed ridge.
    g.strokeStyle = 'rgba(10, 20, 14, 0.5)'; g.lineWidth = 2; g.beginPath();
    if (longX) for (let y = b.y0 + 12; y < b.y1; y += 12) { g.moveTo(b.x0, y); g.lineTo(b.x1, y); } else for (let x = b.x0 + 12; x < b.x1; x += 12) { g.moveTo(x, b.y0); g.lineTo(x, b.y1); }
    g.stroke();
    g.fillStyle = '#6a8a80'; if (longX) g.fillRect(b.x0, b.cy - 12, b.w, 24); else g.fillRect(b.cx - 12, b.y0, 24, b.h);
    g.strokeStyle = '#1f2e26'; g.lineWidth = 3; g.beginPath(); if (longX) for (let x = b.x0; x < b.x1; x += 40) { g.moveTo(x, b.cy - 12); g.lineTo(x, b.cy + 12); } else for (let y = b.y0; y < b.y1; y += 40) { g.moveTo(b.cx - 12, y); g.lineTo(b.cx + 12, y); } g.stroke();
    g.strokeStyle = 'rgba(10, 20, 14, 0.55)'; g.lineWidth = 5; g.beginPath(); for (let x = b.x0 + 200; x < b.x1; x += 400) { g.moveTo(x, b.y0); g.lineTo(x, b.y1); } g.stroke();
  } else if (m === 'slate') {
    g.strokeStyle = 'rgba(14, 16, 22, 0.5)'; g.lineWidth = 1.5; g.beginPath();
    for (let y = b.y0 + 10; y < b.y1; y += 10) { g.moveTo(b.x0, y); g.lineTo(b.x1, y); for (let x = b.x0 + (Math.round(y / 10) % 2 ? 7 : 0); x < b.x1; x += 14) { g.moveTo(x, y); g.lineTo(x, y + 10); } }
    g.stroke();
    g.fillStyle = '#7a3a2e'; if (longX) g.fillRect(b.x0, b.cy - 4, b.w, 8); else g.fillRect(b.cx - 4, b.y0, 8, b.h);
    g.fillStyle = '#3c404c'; g.fillRect(b.x0, b.y0, b.w, 5);
  } else if (m === 'rock') {
    for (let i = 0; i < 60; i++) { g.fillStyle = hash(i, 1) < 0.5 ? 'rgba(0,0,0,0.25)' : 'rgba(255,255,255,0.06)'; g.beginPath(); g.ellipse(b.x0 + hash(i, 2) * b.w, b.y0 + hash(i, 3) * b.h, 10 + hash(i, 4) * 26, 6 + hash(i, 5) * 14, hash(i, 6), 0, TAU); g.fill(); }
    g.fillStyle = '#3a6a3a'; for (let i = 0; i < 20; i++) { g.beginPath(); g.arc(b.x0 + hash(i, 7) * b.w, b.y0 + hash(i, 8) * b.h, 5 + hash(i, 9) * 8, 0, TAU); g.fill(); }
  } else {
    g.strokeStyle = 'rgba(40, 40, 36, 0.3)'; g.lineWidth = 1.5; g.beginPath(); for (let x = b.x0 + 30; x < b.x1; x += 30) { g.moveTo(x, b.y0); g.lineTo(x, b.y1); } g.stroke();
  }
  g.fillStyle = 'rgba(255, 250, 225, 0.2)'; g.fillRect(b.x0, b.y0, b.w, 5); g.fillRect(b.x0, b.y0, 5, b.h);
  g.fillStyle = 'rgba(8, 12, 18, 0.28)'; g.fillRect(b.x0, b.y1 - 5, b.w, 5); g.fillRect(b.x1 - 5, b.y0, 5, b.h);
  if (dark > 0) { g.fillStyle = `rgba(20, 28, 60, ${0.45 * dark})`; g.fillRect(b.x0, b.y0, b.w, b.h); }
  g.restore();
  trace(g, pts); g.strokeStyle = C.ink; g.lineWidth = 2.5; g.lineJoin = 'round'; g.stroke();
  return true;
}
