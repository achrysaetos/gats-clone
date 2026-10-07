import { PIECES, RADAR, SIZE, TANKS, TANK_R, TOWER, twinOf, type Placed } from '../../shared/maps/airbasedata.ts';
import type { MapPoly, Pt } from '../../shared/geom.ts';
import { drawExtruded, type GeoInfo, type PolyLook } from '../geoart.ts';
import { INK } from '../palette.ts';
import { mix } from './airbasekit.ts';
import { setLight } from '../lighting.ts';
import { drawVehicle, prewarmVehicle, vehicleLights, type VehicleKind, type VehicleOpts } from '../vehicleart.ts';

/**
 * The Airbase's set pieces. The aircraft and vehicles (the two C-130s, olive drab in Hangar 1 with KILROY on the fin and grey
 * and orange in Hangar 2; the fighter on its jacks; the helicopter, whose rotor turns above in airbase.ts; the fuel bowsers,
 * crash tender, tug and carts) are toy models from the vehicle kit (vehicleart.ts), placed where the map put their collision.
 * The rest (tank farm, the tower's ring of walls, the radar dome, the jet blast fences and the L revetments) are painted whole
 * from their polygons. A piece and its half-turn twin share one `group`, so every painter first splits them apart.
 */
type G = CanvasRenderingContext2D;
const TAU = Math.PI * 2;
const look = (top: string): PolyLook => ({ top, front: mix(top, 0, 0.42), lit: mix(top, 255, 0.24), shade: mix(top, 0, 0.3) });
const FONT = (px: number) => `700 ${px}px "Barlow Condensed", "Arial Narrow", sans-serif`;

const frame = (o: Placed) => {
  const c = Math.cos(o.rot), s = Math.sin(o.rot);
  return (x: number, y: number): Pt => ({ x: o.x + x * c - y * s, y: o.y + x * s + y * c });
};
const trace = (g: G, pts: readonly Pt[]) => { g.beginPath(); pts.forEach((p, i) => (i ? g.lineTo(p.x, p.y) : g.moveTo(p.x, p.y))); g.closePath(); };
const pts = (p: MapPoly) => p.points as Pt[];
const isTwin = (p: MapPoly) => !!p.id?.endsWith('~');
const split = (polys: readonly MapPoly[]) => [polys.filter((p) => !isTwin(p)), polys.filter(isTwin)] as const;

function text(g: G, s: string, at: Pt, px: number, fill: string, spacing = 2) {
  g.save();
  g.font = FONT(px);
  (g as unknown as { letterSpacing: string }).letterSpacing = `${spacing}px`;
  g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = fill; g.fillText(s, at.x, at.y);
  g.restore();
}
function ellipse(g: G, c: Pt, rx: number, ry: number, rot = 0) { g.beginPath(); g.ellipse(c.x, c.y, rx, ry, rot, 0, TAU); }

/* ------------------------------------------------------------------------------------------------------------------ *
 * The aircraft and vehicles: toy models from the vehicle kit (docs/maps/VEHICLES.md), one cached sprite each
 * ------------------------------------------------------------------------------------------------------------------ */

/** Every vehicle on the base: what it is, where it was placed, and its look on each half. */
const FLEET: readonly { kind: VehicleKind; at: Placed; livery: [string, string]; variant?: string }[] = [
  { kind: 'c130', at: PIECES.plane, livery: ['olive', 'grey'], variant: 'rampDown' },
  { kind: 'fighter', at: PIECES.jet, livery: ['grey', 'navy'], variant: 'jacks' },
  { kind: 'heli', at: PIECES.heli, livery: ['olive', 'grey'], variant: 'doorsOpen' },
  { kind: 'bowser', at: PIECES.bowser, livery: ['olive', 'olive'] },
  { kind: 'bowser', at: PIECES.bowser2, livery: ['olive', 'sand'] },
  { kind: 'crashTender', at: PIECES.crash, livery: ['red', 'red'] },
];
const optsOf = (f: (typeof FLEET)[number], twin: boolean, now: number): VehicleOpts => {
  const at = twin ? twinOf(f.at) : f.at;
  return { x: at.x, y: at.y, rot: at.rot, livery: f.livery[twin ? 1 : 0], ...(f.variant && { variant: f.variant }), t: now };
};
let warmed = false;
/** Asks the kit for every sprite on the base at once, so none pops in when it first scrolls into view. */
function prewarm() {
  if (warmed) return;
  warmed = true;
  for (const f of FLEET) for (const twin of [false, true]) prewarmVehicle(f.kind, optsOf(f, twin, 0));
}

/** Draws one fleet vehicle and lights its lamps. */
function vehicle(g: G, f: (typeof FLEET)[number], twin: boolean, info: GeoInfo, polys: readonly MapPoly[]) {
  const o = { ...optsOf(f, twin, info.now), polys };
  drawVehicle(g, f.kind, o);
  for (const l of vehicleLights(f.kind, { ...o, id: `${f.kind}${twin ? '~' : ''}` })) setLight(l.key, { x: l.x, y: l.y, radius: l.radius, color: l.color, intensity: l.intensity, size: l.size, shadows: false });
}

/** The mascot at the foot of the ramp: a rubber duck in Hangar 1, a model plane in Hangar 2. */
function mascot(g: G, o: Placed, twin: boolean) {
  const mp = frame(o)(-800, -46);
  g.save();
  if (!twin) {
    g.fillStyle = 'rgba(10,12,18,0.3)'; ellipse(g, { x: mp.x + 3, y: mp.y + 4 }, 11, 7); g.fill();
    g.fillStyle = '#ffd34d'; ellipse(g, mp, 10, 7); g.fill(); g.strokeStyle = INK; g.lineWidth = 1.8; g.stroke();
    g.beginPath(); g.arc(mp.x + 7, mp.y - 3, 5.5, 0, TAU); g.fill(); g.stroke();
    g.fillStyle = '#ff7a1f'; g.beginPath(); g.moveTo(mp.x + 11, mp.y - 5); g.lineTo(mp.x + 17, mp.y - 3); g.lineTo(mp.x + 11, mp.y - 1); g.closePath(); g.fill(); g.stroke();
    g.fillStyle = INK; g.beginPath(); g.arc(mp.x + 8, mp.y - 5, 1.2, 0, TAU); g.fill();
    g.fillStyle = 'rgba(255,255,255,0.6)'; g.beginPath(); g.arc(mp.x - 3, mp.y - 2, 2.2, 0, TAU); g.fill();
  } else {
    g.fillStyle = '#d9541f'; g.beginPath(); g.moveTo(mp.x - 12, mp.y); g.lineTo(mp.x + 12, mp.y - 3); g.lineTo(mp.x + 12, mp.y + 3); g.closePath(); g.fill(); g.strokeStyle = INK; g.lineWidth = 1.6; g.stroke();
    g.beginPath(); g.moveTo(mp.x - 2, mp.y - 11); g.lineTo(mp.x + 2, mp.y); g.lineTo(mp.x - 2, mp.y + 11); g.closePath(); g.fill(); g.stroke();
  }
  g.restore();
}

/** A tow tractor or a baggage cart, from its placed rectangle (axis-aligned; the twin faces the other way). */
function littleVehicle(g: G, p: MapPoly, info: GeoInfo) {
  const b = bounds(pts(p));
  const twin = isTwin(p);
  drawVehicle(g, p.id?.startsWith('tug') ? 'tug' : 'bagCart', { x: (b.x0 + b.x1) / 2, y: (b.y0 + b.y1) / 2, rot: twin ? Math.PI : 0, livery: twin ? 'grey' : 'olive', t: info.now, polys: [p] });
}

const bounds = (p: readonly Pt[]) => { let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity; for (const q of p) { x0 = Math.min(x0, q.x); y0 = Math.min(y0, q.y); x1 = Math.max(x1, q.x); y1 = Math.max(y1, q.y); } return { x0, y0, x1, y1 }; };

/* ------------------------------------------------------------------------------------------------------------------ *
 * Tanks, the tower, the dome, the fences
 * ------------------------------------------------------------------------------------------------------------------ */

const TANK_BANDS = ['#4a8ad8', '#4a8ad8', '#d9541f'] as const;
const TANK_NAMES = ['JET A-1', 'JET A-1', 'AVGAS'] as const;

function fuelTank(g: G, p: MapPoly, idx: number, twin: boolean) {
  const b = bounds(pts(p)), cx = (b.x0 + b.x1) / 2, cy = (b.y0 + b.y1) / 2, r = (b.x1 - b.x0) / 2;
  const h = p.height ?? 52;
  const shell = twin ? '#c9c4b6' : '#c2c8d0';
  // The shell: a cylinder's lower half shows as the front face, banded and ribbed.
  g.save();
  g.fillStyle = mix(shell, 0, 0.42);
  g.beginPath(); g.moveTo(cx - r, cy); g.lineTo(cx - r, cy + h); g.arc(cx, cy + h, r, Math.PI, 0, true); g.lineTo(cx + r, cy); g.closePath(); g.fill();
  g.save(); g.beginPath(); g.moveTo(cx - r, cy); g.lineTo(cx - r, cy + h); g.arc(cx, cy + h, r, Math.PI, 0, true); g.lineTo(cx + r, cy); g.closePath(); g.clip();
  g.fillStyle = TANK_BANDS[idx % 3]!; g.fillRect(cx - r, cy + h * 0.52, r * 2, 10);
  g.fillStyle = 'rgba(10,12,16,0.2)'; g.fillRect(cx - r, cy + h * 0.9, r * 2, 14);
  g.strokeStyle = 'rgba(20,24,30,0.4)'; g.lineWidth = 2; for (let a = -r + 14; a < r; a += 22) { g.beginPath(); g.moveTo(cx + a, cy); g.lineTo(cx + a, cy + h + r); g.stroke(); }
  g.restore();
  g.strokeStyle = INK; g.lineWidth = 2; g.beginPath(); g.moveTo(cx - r, cy); g.lineTo(cx - r, cy + h); g.arc(cx, cy + h, r, Math.PI, 0, true); g.lineTo(cx + r, cy); g.stroke();
  // Stencilled name on the shell.
  text(g, TANK_NAMES[idx % 3]!, { x: cx, y: cy + h * 0.52 + 30 }, 18, '#1c1f26', 2);
  g.restore();
  // The roof: a lit lid, a handrail ring, the spiral stair and the hatch.
  g.save();
  g.beginPath(); g.arc(cx, cy, r, 0, TAU); g.fillStyle = shell; g.fill();
  g.clip();
  g.fillStyle = 'rgba(255,255,255,0.16)'; g.beginPath(); g.arc(cx - r * 0.24, cy - r * 0.26, r * 0.84, Math.PI * 0.82, Math.PI * 1.68); g.lineTo(cx - r * 0.24, cy - r * 0.26); g.fill();
  g.fillStyle = 'rgba(10,12,16,0.2)'; g.beginPath(); g.arc(cx + r * 0.26, cy + r * 0.3, r * 0.86, -Math.PI * 0.18, Math.PI * 0.68); g.lineTo(cx + r * 0.26, cy + r * 0.3); g.fill();
  g.strokeStyle = 'rgba(20,24,30,0.45)'; g.lineWidth = 3; g.beginPath(); g.arc(cx, cy, r - 12, 0, TAU); g.stroke();
  g.strokeStyle = '#b79a4a'; g.lineWidth = 3; g.beginPath(); g.arc(cx, cy, r - 5, 0.3, TAU - 0.3); g.stroke();
  g.strokeStyle = 'rgba(30,34,40,0.5)'; g.lineWidth = 2; for (let k = 0; k < 14; k++) { const a = -0.6 + k * 0.17, rr = r - 6 - k * 3; g.beginPath(); g.arc(cx, cy, rr, a, a + 0.12); g.stroke(); }
  g.fillStyle = '#4f5560'; g.beginPath(); g.arc(cx + 30, cy - 20, 16, 0, TAU); g.fill(); g.strokeStyle = INK; g.lineWidth = 2; g.stroke();
  g.fillStyle = '#2b2e34'; g.beginPath(); g.arc(cx - 40, cy + 30, 9, 0, TAU); g.fill(); g.stroke();
  g.restore();
  g.beginPath(); g.arc(cx, cy, r, 0, TAU); g.strokeStyle = INK; g.lineWidth = 2.4; g.stroke();
  // A hazard diamond and a number on the lid.
  text(g, `T${(idx % 3) + 1}`, { x: cx - 8, y: cy + 4 }, 26, 'rgba(28,31,38,0.55)', 2);
}

/** The tower's wall: a ring of pale concrete whose outer south face carries a band of lit glazing, and whose inner face shows the lobby. */
function ringWall(g: G, p: MapPoly) {
  const cabin = look('#9aa0a6');
  drawExtruded(g, pts(p), p.height ?? 72, cabin);
  // window slits on the south-facing faces, glowing with the lobby's lights
  const ptsAll = pts(p);
  const area = ptsAll.reduce((s, q, i) => s + (q.x * ptsAll[(i + 1) % ptsAll.length]!.y - ptsAll[(i + 1) % ptsAll.length]!.x * q.y), 0);
  const ccw = area < 0 ? [...ptsAll].reverse() : ptsAll;
  const h = p.height ?? 72;
  g.save();
  for (let i = 0; i < ccw.length; i++) {
    const a = ccw[i]!, b = ccw[(i + 1) % ccw.length]!;
    if (b.x >= a.x - 0.5) continue;
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    if (len < 36) continue;
    for (const t of [0.5]) {
      const x = a.x + (b.x - a.x) * t, y = a.y + (b.y - a.y) * t;
      g.fillStyle = INK; g.fillRect(x - 22, y + 14, 44, 26);
      g.fillStyle = '#ffe08a'; g.fillRect(x - 20, y + 16, 40, 22);
      g.fillStyle = 'rgba(255,255,255,0.5)'; g.fillRect(x - 20, y + 16, 40, 5);
      g.fillStyle = INK; g.fillRect(x - 1, y + 16, 2, 22);
    }
    g.strokeStyle = 'rgba(183,154,74,0.8)'; g.lineWidth = 3; g.beginPath(); g.moveTo(a.x, a.y + h * 0.55); g.lineTo(b.x, b.y + h * 0.55); g.stroke();
  }
  g.restore();
}

/** The radar dome: a plinth, a white sphere in two hard steps with geodesic seams, an aircraft warning light on top. */
function radome(g: G, p: MapPoly) {
  const b = bounds(pts(p)), cx = (b.x0 + b.x1) / 2, cy = (b.y0 + b.y1) / 2, r = (b.x1 - b.x0) / 2;
  const h = p.height ?? 64;
  // plinth (the front face under the south half), then the sphere sits on it, lifted by its height
  g.save();
  g.fillStyle = '#5d6672'; g.beginPath(); g.moveTo(cx - r, cy); g.lineTo(cx - r, cy + h * 0.5); g.arc(cx, cy + h * 0.5, r, Math.PI, 0, true); g.lineTo(cx + r, cy); g.closePath(); g.fill();
  g.strokeStyle = INK; g.lineWidth = 2; g.stroke();
  g.beginPath(); g.arc(cx, cy, r, 0, TAU); g.fillStyle = '#7d8793'; g.fill(); g.strokeStyle = INK; g.lineWidth = 2; g.stroke();
  const sy = cy - h * 0.35;
  g.beginPath(); g.arc(cx, sy, r * 0.94, 0, TAU); g.fillStyle = '#d7dde4'; g.fill();
  g.save(); g.beginPath(); g.arc(cx, sy, r * 0.94, 0, TAU); g.clip();
  g.fillStyle = 'rgba(44,56,74,0.3)'; g.beginPath(); g.arc(cx + r * 0.3, sy + r * 0.32, r * 0.92, -Math.PI * 0.12, Math.PI * 0.72); g.lineTo(cx + r * 0.3, sy + r * 0.32); g.fill();
  g.fillStyle = 'rgba(255,255,255,0.5)'; g.beginPath(); g.arc(cx - r * 0.3, sy - r * 0.32, r * 0.5, 0, TAU); g.fill();
  g.strokeStyle = 'rgba(70,84,104,0.5)'; g.lineWidth = 2;
  for (let k = -3; k <= 3; k++) { g.beginPath(); g.ellipse(cx, sy, r * 0.94 * Math.abs(Math.cos(k * 0.22)), r * 0.94, 0, 0, TAU); g.stroke(); }
  for (let k = -3; k <= 3; k++) { g.beginPath(); g.ellipse(cx, sy, r * 0.94, r * 0.94 * Math.abs(Math.cos(k * 0.22)), 0, 0, TAU); g.stroke(); }
  g.restore();
  g.beginPath(); g.arc(cx, sy, r * 0.94, 0, TAU); g.strokeStyle = INK; g.lineWidth = 2.4; g.stroke();
  g.fillStyle = '#2b2e34'; g.beginPath(); g.arc(cx - r * 0.05, sy - r * 0.55, 10, 0, TAU); g.fill(); g.stroke();
  g.fillStyle = 'rgba(255,255,255,0.7)'; g.beginPath(); g.arc(cx - r * 0.2, sy - r * 0.6, 12, 0, TAU); g.fill();
  g.restore();
}

/** A jet blast fence: angled corrugated panels on a steel frame, hazard-capped. */
function blastFence(g: G, p: MapPoly) {
  drawExtruded(g, pts(p), p.height ?? 46, look('#7d8793'));
  const q = pts(p);
  g.save(); trace(g, q); g.clip();
  const b = bounds(q);
  g.strokeStyle = 'rgba(20,26,32,0.4)'; g.lineWidth = 2;
  for (let t = 0; t < 1; t += 0.06) { const x = b.x0 + (b.x1 - b.x0) * t; g.beginPath(); g.moveTo(x, b.y0); g.lineTo(x, b.y1); g.stroke(); }
  g.restore();
  // hazard end caps
  const e0 = q[0]!, e1 = q[1]!;
  g.fillStyle = '#c9a23c'; g.beginPath(); g.arc(e0.x, e0.y + 2, 5, 0, TAU); g.fill(); g.beginPath(); g.arc(e1.x, e1.y + 2, 5, 0, TAU); g.fill();
}

function revetment(g: G, p: MapPoly) {
  drawExtruded(g, pts(p), p.height ?? 16, look('#b4a07a'));
  g.save(); trace(g, pts(p)); g.clip();
  const b = bounds(pts(p));
  g.strokeStyle = 'rgba(70,56,32,0.5)'; g.lineWidth = 1.6;
  for (let y = b.y0; y < b.y1; y += 12) { g.beginPath(); g.moveTo(b.x0, y); g.lineTo(b.x1, y); g.stroke(); }
  for (let y = b.y0, r = 0; y < b.y1; y += 12, r++) for (let x = b.x0 + (r % 2) * 14; x < b.x1; x += 28) { g.beginPath(); g.moveTo(x, y); g.lineTo(x, y + 12); g.stroke(); }
  g.restore();
}

function mastPole(g: G, p: MapPoly) {
  const b = bounds(pts(p)), cx = (b.x0 + b.x1) / 2, cy = (b.y0 + b.y1) / 2, r = (b.x1 - b.x0) / 2;
  drawExtruded(g, pts(p), p.height ?? 80, look(p.material === 'pole' ? '#c8c2b0' : '#8a8f98'));
  g.fillStyle = '#2b2e34'; g.beginPath(); g.arc(cx, cy, r * 0.5, 0, TAU); g.fill(); g.strokeStyle = INK; g.lineWidth = 1.6; g.stroke();
}

/* ------------------------------------------------------------------------------------------------------------------ *
 * The hooks
 * ------------------------------------------------------------------------------------------------------------------ */

export function drawAirbaseSetPiece(g: G, group: readonly MapPoly[], info: GeoInfo): boolean {
  prewarm();
  const first = group[0]!;
  const id = (first.group ?? first.id ?? '').replace(/~$/, '').replace(/:.*$/, '');
  const f = first.shape === 'cargoPlane' ? FLEET[0] : first.shape === 'fighterJet' ? FLEET[1] : first.shape === 'helicopter' ? FLEET[2]
    : first.shape === 'truck' ? FLEET.find((v) => v.at === (id === 'bowser2' ? PIECES.bowser2 : id === 'crash' ? PIECES.crash : id === 'bowser' ? PIECES.bowser : null)) : undefined;
  if (!f) return false;
  const [west, east] = split(group);
  for (const [polys, twin] of [[west, false], [east, true]] as const) {
    if (!polys.length) continue;
    vehicle(g, f, twin, info, polys);
    if (f.kind === 'c130') mascot(g, twin ? twinOf(f.at) : f.at, twin);
  }
  return true;
}

export function drawAirbasePoly(g: G, p: MapPoly, _info: GeoInfo): boolean {
  switch (p.material) {
    case 'tank': {
      const b = bounds(pts(p));
      const cx = (b.x0 + b.x1) / 2, cy = (b.y0 + b.y1) / 2;
      const twin = isTwin(p);
      const wx = twin ? SIZE - cx : cx, wy = twin ? SIZE - cy : cy;
      const idx = Math.max(0, TANKS.findIndex((t) => Math.hypot(t.x - wx, t.y - wy) < 8));
      fuelTank(g, p, idx, twin);
      return true;
    }
    case 'ring': ringWall(g, p); return true;
    case 'dome': radome(g, p); return true;
    case 'fence': blastFence(g, p); return true;
    case 'sbags': revetment(g, p); return true;
    case 'mast': case 'pole': mastPole(g, p); return true;
    case 'vehicle': case 'cart': littleVehicle(g, p, _info); return true;
    default: return false;
  }
}

void TOWER; void RADAR; void TANK_R;
