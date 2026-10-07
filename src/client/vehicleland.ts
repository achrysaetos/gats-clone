/**
 * Ground vehicles for the vehicle kit: the airfield's fuel bowser, crash tender, tug and baggage cart; cars (sedan, pickup,
 * armoured SUV, limousine, wrecks), the school bus, the snowcat and the snowmobile. Toy proportions: chunky wheels, rounded
 * boxes, big glass. Each is a model in metres with the nose toward +x.
 */
import { Model, chain, mat, move, rotY, rotZ, type Mat, type Paint } from './vehiclemesh.ts';
import { fbm, weather, type Wear as PaintWear } from './vehiclepaint.ts';

const GLASS = mat('#1e2a3a', { gloss: true });
const GLASS_BROKEN = mat('#141820');
const FONT = (px: number) => `700 ${px}px "Barlow Condensed", "Arial Narrow", sans-serif`;
const hex = (h: string) => { const n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
const darker = (h: string, k: number) => `#${hex(h).map((v) => Math.round(v * (1 - k)).toString(16).padStart(2, '0')).join('')}`;
const lighter = (h: string, k: number) => `#${hex(h).map((v) => Math.round(v + (255 - v) * k).toString(16).padStart(2, '0')).join('')}`;
const near = (v: number, step: number, w: number) => { const r = ((v % step) + step) % step; return r < w || r > step - w; };

function stencil(g: CanvasRenderingContext2D, s: string, x: number, y: number, size: number, color: string, rot = 0, spacing = 0.08) {
  g.save(); g.translate(x, y); g.rotate(rot);
  g.font = FONT(100); g.textAlign = 'center'; g.textBaseline = 'middle';
  g.scale(size / 100, size / 100);
  (g as unknown as { letterSpacing: string }).letterSpacing = `${spacing * 100}px`;
  g.fillStyle = color; g.fillText(s, 0, 0);
  g.restore();
}

/* -- shared parts ----------------------------------------------------------------------------------------------------------- */

type Wheels = { xs: readonly number[]; y: number; r: number; w: number; flat?: boolean };
function wheels(m: Model, w: Wheels, rim = '#8a8f98') {
  const tyre = m.part('#26292e'), hub = m.part(rim);
  for (const x of w.xs) for (const s of [-1, 1]) {
    if (w.flat) {
      // A flat: the tyre squashed to the floor.
      const xf = chain(rotZ(Math.PI / 2), ([a, b, c]) => [a, b, c * 0.72] as [number, number, number], move(x, s * w.y, w.r * 0.72));
      m.tube(tyre, -w.w / 2, w.w / 2, 0, 0, w.r, { ring: 18, cap: w.r * 0.25, xf });
    } else m.wheel(tyre, hub, x, s * w.y, w.r, w.w);
  }
}

/** A rounded box body: a loft with a superellipse section, ends pinched to round corners. */
function body(m: Model, part: number, x0: number, x1: number, w: number, z0: number, z1: number, opts: { n?: number; round?: number; y?: number; taper?: number; noseDrop?: number } = {}) {
  const n = opts.n ?? 5, r = opts.round ?? 0.18, zc = (z0 + z1) / 2, h = (z1 - z0) / 2, y = opts.y ?? 0, tp = opts.taper ?? 1, nd = opts.noseDrop ?? 0;
  m.loft(part, [
    { x: x0, w: 0, h: 0, y, z: zc },
    { x: x0, w: w * tp - r, h: h - r, y, z: zc },
    { x: x0 + r * 0.5, w: w * tp - r * 0.3, h: h - r * 0.3, y, z: zc, n },
    { x: x0 + r * 1.2, w: w, h, y, z: zc, n },
    { x: x1 - r * 1.2, w: w, h: h - nd / 2, y, z: zc - nd / 2, n },
    { x: x1 - r * 0.5, w: w - r * 0.3, h: h - r * 0.3 - nd / 2, y, z: zc - nd / 2, n },
    { x: x1, w: w - r, h: h - r - nd / 2, y, z: zc - nd / 2 },
    { x: x1, w: 0, h: 0, y, z: zc - nd / 2 },
  ], { ring: 28, sub: 1 });
}

/* -- airfield ------------------------------------------------------------------------------------------------------------- */

/** The truck chassis shared by the bowser and the crash tender: shapes.ts `truck` (cab 1.6..4.0 m, body -4.2..1.4 m). */
function truckCab(m: Model, colour: string, roof: string) {
  const c = mat(colour), r = mat(roof), seam = mat(darker(colour, 0.25)), lamp = mat('#ffe08a', { gloss: true }), grille = mat('#2b2e34');
  const cab = m.part((x, y, z, nx, ny, nz) => {
    if (nx > 0.55 && z > 1.65 && z < 2.35 && Math.abs(y) < 1.05) return Math.abs(y) < 0.05 ? seam : GLASS;
    if ((ny > 0.6 || ny < -0.6) && z > 1.7 && z < 2.3 && x > 2.6 && x < 3.75) return GLASS;
    if (nx > 0.55 && z < 1.35 && z > 0.9) return Math.abs(Math.abs(y) - 0.85) < 0.16 ? lamp : grille;
    if (nz > 0.8) return r;
    if ((ny > 0.6 || ny < -0.6) && Math.abs(x - 2.5) < 0.03 && z > 0.9) return seam;
    return c;
  });
  body(m, cab, 1.6, 4.0, 1.22, 0.75, 2.5, { round: 0.22, n: 5 });
  const bumper = m.part('#3d4450');
  m.box(bumper, 3.85, -1.2, 0.55, 4.08, 1.2, 0.85, 0.05);
  // Mirrors on stalks.
  const mirror = m.part('#2b2e34');
  for (const s of [-1, 1]) m.box(mirror, 3.55, s * 1.22 - 0.06, 1.75, 3.7, s * 1.22 + 0.06, 2.15, 0.02);
  const frame = m.part('#2b2e34');
  m.box(frame, -4.15, -0.85, 0.45, 3.9, 0.85, 0.78, 0.02);
}

type BowserLivery = { cab: string; tank: string; band: string; label: string };
const BOWSER: Record<string, BowserLivery> = {
  olive: { cab: '#6c7356', tank: '#b9c0c8', band: '#b4524a', label: 'JET A-1' },
  sand: { cab: '#978562', tank: '#c8c2b0', band: '#d9541f', label: 'AVGAS' },
};

export function bowser(livery = 'olive'): Model {
  const L = BOWSER[livery] ?? BOWSER.olive!;
  const m = new Model();
  m.top = 2.85;
  truckCab(m, L.cab, lighter(L.cab, 0.08));
  // The tank: an elliptical drum with dished ends, two red bands and the ribs where the baffles sit.
  const tankC = mat(L.tank), band = mat(L.band), rib = mat(darker(L.tank, 0.18));
  const tank = m.part((x, _y, _z, _nx, _ny, nz) => {
    if (Math.abs(x + 2.6) < 0.16 || Math.abs(x - 0.0) < 0.16) return band;
    if (near(x + 4.2, 1.3, 0.035) && Math.abs(nz) < 0.98) return rib;
    return tankC;
  });
  m.loft(tank, [
    { x: -4.15, w: 0, h: 0, z: 1.88 }, { x: -4.15, w: 1.0, h: 0.72, z: 1.88 }, { x: -4.0, w: 1.22, h: 0.92, z: 1.88, n: 2.6 }, { x: -3.8, w: 1.28, h: 0.96, z: 1.88, n: 2.6 },
    { x: 1.05, w: 1.28, h: 0.96, z: 1.88, n: 2.6 }, { x: 1.25, w: 1.22, h: 0.92, z: 1.88, n: 2.6 }, { x: 1.4, w: 1.0, h: 0.72, z: 1.88 }, { x: 1.4, w: 0, h: 0, z: 1.88 },
  ], { ring: 30, sub: 1 });
  // Walkway on top with handrails, two manhole domes, the hose reel cabinet at the back.
  const walk = m.part((x) => (near(x, 0.22, 0.04) ? mat('#3d4450') : mat('#59606b')));
  m.box(walk, -3.7, -0.32, 2.7, 0.9, 0.32, 2.86, 0.03);
  const rail = m.part('#c9a23c');
  for (const s of [-1, 1]) {
    m.tube(rail, -3.6, 0.8, s * 0.42, 3.22, 0.045, { ring: 8 });
    for (const x of [-3.5, -1.3, 0.7]) m.tube(rail, 2.8, 3.24, 0, 0, 0.04, { ring: 8, xf: chain(rotY(-Math.PI / 2), move(x, s * 0.42, 0)) });
  }
  const hatch = m.part(mat('#8a929c', { gloss: true }));
  for (const x of [-2.1, -0.4]) m.blob(hatch, x, 0, 2.88, 0.32, 0.32, 0.12, { rows: 8 });
  const cab2 = m.part((_x, _y, _z, _nx, ny) => (ny > 0.6 || ny < -0.6 ? mat(darker(L.cab, 0.12)) : mat(L.cab)));
  m.box(cab2, -4.2, -1.3, 0.55, -3.75, 1.3, 1.85, 0.06);
  const reel = m.part((x) => (near(x, 0.08, 0.02) ? mat('#7a1f18') : mat('#b4524a')));
  m.tube(reel, -0.55, 0.55, 0, 0, 0.36, { ring: 16, xf: chain(rotZ(Math.PI / 2), move(-3.98, 0, 1.3)) });
  wheels(m, { xs: [3.0, -1.5, -3.0], y: 1.08, r: 0.5, w: 0.42 });
  // Fenders over the rear axles.
  const fender = m.part('#2b2e34');
  for (const s of [-1, 1]) m.box(fender, -3.65, s * 0.9 - 0.25, 1.0, -0.85, s * 0.9 + 0.25, 1.1, 0.03);
  const beacon = m.part(mat('#e8a23a', { gloss: true }));
  m.blob(beacon, 2.8, 0, 2.58, 0.16, 0.16, 0.14);
  m.lights.push({ key: 'beacon', at: [2.8, 0, 2.7], color: '#ffb347', radius: 150, intensity: 0.55, blinkMs: 1200, size: 5 });
  m.sideDecals(-4.2, 0.8, 1.4, 3.0, 48, [tank], (g) => {
    stencil(g, L.label, -1.3, -1.95, 0.5, '#1c1f26', 0, 0.1);
    stencil(g, 'FLAMMABLE', -1.3, -1.45, 0.24, '#b4524a', 0, 0.08);
  });
  m.decals(-4.2, -1.4, 4.1, 1.4, 48, [tank], (g) => { stencil(g, 'NO SMOKING', -3.0, 0.82, 0.22, '#b4524a', 0, 0.06); });
  return m;
}

export function crashTender(livery = 'red'): Model {
  const red = livery === 'yellow' ? '#c9a23c' : '#b8432f';
  const m = new Model();
  m.top = 2.75;
  truckCab(m, red, '#d8d2c2');
  // The body: lockers with roller shutters along the flanks, a reflective band, the hose bed on top.
  const c = mat(red), shutter = mat(darker(red, 0.2)), stripe = mat('#e8dcb0'), dark = mat(darker(red, 0.4)), roofC = mat(darker(red, 0.08));
  const bod = m.part((x, _y, z, _nx, ny, nz) => {
    if (nz > 0.8) return roofC;
    if ((ny > 0.5 || ny < -0.5) && z > 1.3 && z < 1.48) return stripe;
    if ((ny > 0.5 || ny < -0.5) && z > 0.75 && z < 2.45 && x > -3.9 && x < 1.1) {
      if (near(x + 3.9, 1.25, 0.04)) return dark;
      return near(z, 0.11, 0.018) ? shutter : c;
    }
    return c;
  });
  body(m, bod, -4.2, 1.4, 1.33, 0.6, 2.75, { round: 0.2, n: 6 });
  // Roof: two hose bays, the roof monitor (a water cannon) and a light bar on the cab.
  const hose = m.part((x, y) => (near(y + x * 0.1, 0.16, 0.03) ? mat('#7a6a42') : mat('#c9a23c')));
  m.box(hose, -3.8, -0.95, 2.72, -1.7, -0.15, 2.92, 0.06);
  const hose2 = m.part((x, y) => (near(y + x * 0.1, 0.16, 0.03) ? mat('#3d4450') : mat('#8a8f98')));
  m.box(hose2, -3.8, 0.15, 2.72, -1.7, 0.95, 2.92, 0.06);
  const gun = m.part(mat('#4f5560', { gloss: true }));
  m.blob(gun, -1.0, 0, 2.86, 0.38, 0.38, 0.22);
  m.tube(gun, -1.0, 0.5, 0, 2.98, 0.1, { ring: 10, xf: ([x, y, z]) => [x, y, z + (x + 1.0) * 0.16] });
  const bar = m.part((_x, y) => (Math.abs(y) < 0.2 ? mat('#e8e2d0') : y < 0 ? mat('#d33a2c', { gloss: true }) : mat('#e8a23a', { gloss: true })));
  m.box(bar, 2.75, -0.95, 2.48, 3.05, 0.95, 2.66, 0.05);
  wheels(m, { xs: [3.0, -1.5, -3.0], y: 1.1, r: 0.55, w: 0.46 }, '#c9c2b0');
  m.lights.push({ key: 'barL', at: [2.9, -0.6, 2.7], color: '#ff4a40', radius: 160, intensity: 0.6, blinkMs: 1100, size: 5 });
  m.lights.push({ key: 'barR', at: [2.9, 0.6, 2.7], color: '#ffb347', radius: 160, intensity: 0.6, blinkMs: 1100, phase: 0.5, size: 5 });
  m.decals(-4.2, -1.4, 4.1, 1.4, 48, [bod], (g) => { stencil(g, 'CRASH 2', 0.75, 0, 0.42, '#e8dcb0', Math.PI / 2, 0.1); });
  m.sideDecals(-4.2, 0.6, 1.4, 2.8, 48, [bod], (g) => { stencil(g, 'AIRFIELD FIRE', -1.4, -1.95, 0.32, '#e8dcb0', 0, 0.08); });
  return m;
}

/** A tow tractor: a low yellow body, a seat and wheel under a roll cage, the hitch at the back. 3 x 1.6 m. */
export function tug(livery = 'yellow'): Model {
  const col = livery === 'orange' ? '#d9772e' : '#c9a23c';
  const m = new Model();
  m.top = 1.0;
  const c = mat(col), hazard = mat('#1c1f26'), d = mat(darker(col, 0.2));
  const bod = m.part((x, y, _z, nx, _ny, nz) => {
    if (nx > 0.6 && Math.abs(y) < 0.5) return near(y + 0.3, 0.3, 0.075) ? hazard : d;
    if (nz > 0.8 && x > 0.55 && x < 1.3) return near(x + y, 0.18, 0.03) ? d : c;
    return c;
  });
  body(m, bod, -1.45, 1.48, 0.76, 0.32, 1.0, { round: 0.16, n: 5 });
  const seat = m.part('#2b2e34');
  m.box(seat, -0.85, -0.38, 0.98, -0.25, 0.38, 1.22, 0.06);
  m.box(seat, -0.95, -0.38, 0.98, -0.78, 0.38, 1.75, 0.05);
  const wheel = m.part(mat('#3d4450', { gloss: true }));
  m.tube(wheel, -0.03, 0.03, 0, 0, 0.22, { ring: 14, xf: chain(rotY(-0.9), move(0.3, 0, 1.45)) });
  m.tube(wheel, 0, 0.5, 0, 0, 0.04, { ring: 6, xf: chain(rotY(-Math.PI / 2 + 0.6), move(0.45, 0, 1.0)) });
  // An open roll bar behind the seat.
  const cage = m.part('#3d4450');
  for (const y of [-0.62, 0.62]) m.tube(cage, 1.0, 1.95, 0, 0, 0.05, { ring: 8, xf: chain(rotY(-Math.PI / 2), move(-1.05, y, 0)) });
  m.tube(cage, -0.67, 0.67, 0, 0, 0.05, { ring: 8, xf: chain(rotZ(Math.PI / 2), move(-1.05, 0, 1.95)) });
  const hitch = m.part('#2b2e34');
  m.box(hitch, -1.75, -0.12, 0.45, -1.4, 0.12, 0.6, 0.03);
  wheels(m, { xs: [0.95, -0.9], y: 0.68, r: 0.36, w: 0.28 });
  const beacon = m.part(mat('#e8a23a', { gloss: true }));
  m.blob(beacon, -1.05, 0, 2.05, 0.12, 0.12, 0.1);
  m.lights.push({ key: 'beacon', at: [-1.05, 0, 2.1], color: '#ffb347', radius: 110, intensity: 0.45, blinkMs: 1300, size: 4 });
  return m;
}

/** A baggage cart: a railed flatbed on four small wheels, piled with bags and crates. 2.3 x 1.4 m. */
export function bagCart(livery = 'olive', variant = 'loaded'): Model {
  const col = livery === 'grey' ? '#7d8794' : '#6c7356';
  const m = new Model();
  m.top = 0.7;
  const bed = m.part((x) => (near(x, 0.25, 0.03) ? mat(darker(col, 0.25)) : mat(col)));
  m.box(bed, -1.17, -0.7, 0.42, 1.17, 0.7, 0.62, 0.04);
  const rail = m.part(darker(col, 0.15));
  for (const s of [-1, 1]) m.box(rail, -1.12, s * 0.66 - 0.05, 0.62, 1.12, s * 0.66 + 0.05, 1.05, 0.02);
  for (const x of [-1.12, 1.07]) m.box(rail, x, -0.66, 0.62, x + 0.05, 0.66, 1.05, 0.02);
  const tow = m.part('#2b2e34');
  m.box(tow, 1.17, -0.06, 0.4, 1.7, 0.06, 0.5, 0.02);
  if (variant !== 'empty') {
    const cols = ['#7a6a42', '#4f6a8a', '#8a5a34', '#5d6a41', '#a8552e'];
    const items: [number, number, number, number, number, number][] = [[-0.95, -0.55, 0.62, -0.25, 0.05, 1.1], [-0.2, -0.55, 0.62, 0.35, -0.05, 0.98], [0.42, -0.55, 0.62, 1.0, 0.1, 1.16], [-0.95, 0.12, 0.62, -0.1, 0.58, 0.92], [0.0, 0.05, 0.62, 0.55, 0.58, 1.2], [-0.8, -0.4, 1.1, -0.35, 0.05, 1.34]];
    items.forEach(([x0, y0, z0, x1, y1, z1], i) => {
      const p = m.part(mat(cols[i % cols.length]!));
      m.box(p, x0, y0, z0, x1, y1, z1, 0.07);
    });
  }
  wheels(m, { xs: [0.8, -0.8], y: 0.58, r: 0.24, w: 0.16 });
  return m;
}

/* -- cars ---------------------------------------------------------------------------------------------------------------- */

type CarSpec = {
  len: number; wid: number; hood: number; trunk: number; cabinH: number; bodyH: number; wheelR: number;
  colour: string; roof?: string; bed?: boolean; lift?: number;
};
type Wear = { broken: boolean; flat: boolean; paint: PaintWear; snow?: boolean; top: number };
const SNOW = mat('#e6ecf2'), SNOW_SHADE = mat('#c8d4e2');

/** Weathers a paint: rust, vines, scorch or dirt from vehiclepaint.ts, and snow lying on the tops. */
function worn(base: Mat, w: Wear, x: number, y: number, z: number, nz: number): Mat {
  if (w.snow && nz > 0.45 && fbm(x * 1.6, y * 1.6) > 0.24) return fbm(x * 5, y * 5) > 0.74 ? SNOW_SHADE : SNOW;
  return weather(base, w.paint, x, y, z, nz, w.top);
}
/** A broken window: the glass gone in ragged holes (the dark inside shows), the rest crazed. */
const shattered = (x: number, y: number, z: number) => fbm(x * 4.1 + y, z * 4.1 + y * 2) > 0.58;

function car(spec: CarSpec, wear: Wear): Model {
  const m = new Model();
  const L = spec.len / 2, W = spec.wid / 2, lift = spec.lift ?? 0;
  const zb0 = spec.wheelR * 0.75 + lift, zb1 = zb0 + spec.bodyH, zr = zb1 + spec.cabinH;
  m.top = zr;
  const paint = mat(spec.colour), roofC = mat(spec.roof ?? spec.colour), trim = mat(darker(spec.colour, 0.3)), lamp = mat('#ffe8b0', { gloss: true }), tail = mat('#c0392b', { gloss: true }), chrome = mat('#9aa2ab');
  const glass = GLASS;
  wear.top = (spec.wheelR * 0.75 + (spec.lift ?? 0)) + spec.bodyH + spec.cabinH;
  const bodyPaint: Paint = (x, y, z, nx, ny, nz) => {
    if (nx > 0.55 && z > zb0 + spec.bodyH * 0.35 && Math.abs(Math.abs(y) - W * 0.72) < W * 0.16) return lamp;
    if (nx < -0.55 && z > zb0 + spec.bodyH * 0.45 && Math.abs(Math.abs(y) - W * 0.75) < W * 0.14) return tail;
    if ((nx > 0.6 || nx < -0.6) && z < zb0 + spec.bodyH * 0.3) return chrome;
    if ((ny > 0.6 || ny < -0.6) && Math.abs(z - (zb0 + spec.bodyH * 0.55)) < 0.03) return trim;
    if (nz > 0.8 && Math.abs(x - (L - spec.hood + 0.02)) < 0.025) return trim;
    return worn(paint, wear, x, y, z, nz);
  };
  const bod = m.part(bodyPaint);
  body(m, bod, -L, L, W, zb0, zb1, { round: Math.min(0.35, spec.bodyH * 0.45), n: 4.5 });
  // The cabin (greenhouse): glass all round under a painted roof.
  const cx0 = -L + spec.trunk, cx1 = L - spec.hood;
  const cabPaint: Paint = (x, y, z, nx, ny, nz) => {
    if (nz > 0.75 && z > zr - 0.12) return worn(roofC, wear, x, y, z, nz);
    if (z > zb1 + 0.05) {
      // Pillars between the windows.
      if ((ny > 0.5 || ny < -0.5) && (Math.abs(x - (cx0 + cx1) / 2) < 0.06 || x < cx0 + 0.12 || x > cx1 - 0.12)) return worn(roofC, wear, x, y, z, nz);
      if (wear.broken && shattered(x, y, z)) return GLASS_BROKEN;
      void nx;
      return glass;
    }
    return worn(paint, wear, x, y, z, nz);
  };
  const cab = m.part(cabPaint, { group: m.group() });
  const ch = spec.cabinH;
  m.loft(cab, [
    { x: cx0 - 0.05, w: 0, h: 0, z: zb1 + ch * 0.2 },
    { x: cx0 - 0.04, w: W * 0.82, h: ch * 0.55, z: zb1 + ch * 0.45, n: 4 },
    { x: cx0 + ch * 0.55, w: W * 0.86, h: ch * 0.6, z: zb1 + ch * 0.4, n: 4 },
    { x: cx1 - ch * 0.75, w: W * 0.86, h: ch * 0.6, z: zb1 + ch * 0.4, n: 4 },
    { x: cx1 + 0.02, w: W * 0.88, h: ch * 0.3, z: zb1 + ch * 0.15, n: 4 },
    { x: cx1 + 0.05, w: 0, h: 0, z: zb1 + ch * 0.1 },
  ], { ring: 24, sub: 2 });
  if (spec.bed) {
    // A pickup's open bed: a dark well behind the cab.
    const well = m.part((x, y, z, _nx, _ny, nz) => worn(nz > 0.8 ? mat('#2b2e34') : trim, wear, x, y, z, nz));
    m.box(well, -L + 0.12, -W + 0.12, zb1 - 0.02, cx0 - 0.15, W - 0.12, zb1 + 0.005, 0);
  }
  wheels(m, { xs: [L - spec.hood * 0.55, -L + spec.trunk * 0.6], y: W - spec.wheelR * 0.2, r: spec.wheelR, w: spec.wheelR * 0.65, flat: wear.flat }, wear.paint.rust || wear.paint.burnt ? '#5a4a3a' : '#9aa2ab');
  for (const s of [-1, 1]) { const mir = m.part(spec.colour); m.box(mir, cx1 - 0.15, s * (W + 0.02) - 0.05, zb1, cx1 + 0.05, s * (W + 0.02) + 0.05, zb1 + 0.16, 0.02); }
  return m;
}

const CAR_COLOURS: Record<string, string> = { silver: '#b9c4cc', yellow: '#c9a23c', rust: '#8a5a38', blue: '#4f6a8a', cream: '#cfc7b3', red: '#a8442e', green: '#5d6a41', black: '#2e3138', white: '#d8d2c2', olive: '#6c7356' };
const wearOf = (variant: string | undefined): Wear => ({
  broken: variant === 'wreck' || variant === 'vines' || variant === 'burnt',
  flat: variant === 'wreck' || variant === 'burnt',
  snow: variant === 'snowed',
  top: 2,
  paint: variant === 'wreck' ? { rust: 0.75, dirt: 0.6 } : variant === 'rust' ? { rust: 0.45, dirt: 0.4 } : variant === 'vines' ? { rust: 0.6, vines: 0.75, dirt: 0.5 } : variant === 'burnt' ? { burnt: 0.85, rust: 0.6 } : variant === 'snowed' ? { dirt: 0.3 } : {},
});

/** A family saloon, 4.6 x 1.9 m. */
export function sedan(livery = 'blue', variant?: string): Model {
  return car({ len: 4.6, wid: 1.9, hood: 1.25, trunk: 0.95, cabinH: 0.55, bodyH: 0.62, wheelR: 0.34, colour: CAR_COLOURS[livery] ?? CAR_COLOURS.blue! }, wearOf(variant));
}
/** A pickup, 5.2 x 2.0 m, the bed open behind the cab. */
export function pickup(livery = 'rust', variant?: string): Model {
  return car({ len: 5.2, wid: 2.0, hood: 1.5, trunk: 2.0, cabinH: 0.6, bodyH: 0.72, wheelR: 0.4, colour: CAR_COLOURS[livery] ?? CAR_COLOURS.rust!, bed: true, lift: 0.08 }, wearOf(variant));
}

/** An armoured SUV, 5.16 x 2.19 m (the Embassy's motorcade): tall, square, black, a whip aerial and a red-blue light bar. */
export function suv(livery = 'black', variant?: string): Model {
  const m = car({ len: 5.16, wid: 2.19, hood: 1.15, trunk: 0.35, cabinH: 0.68, bodyH: 0.78, wheelR: 0.42, colour: CAR_COLOURS[livery] ?? CAR_COLOURS.black!, lift: 0.06 }, wearOf(variant));
  const ant = m.part('#1c1f26');
  m.tube(ant, 0, 0.9, 0, 0, 0.025, { ring: 6, xf: chain(rotY(-Math.PI / 2 + 0.5), move(-2.0, 0.7, m.top)) });
  const red = m.part(mat('#d33a2c', { gloss: true })), blue = m.part(mat('#3a6ad8', { gloss: true }));
  m.box(red, 0.75, -0.7, m.top - 0.02, 0.95, -0.1, m.top + 0.1, 0.04);
  m.box(blue, 0.75, 0.1, m.top - 0.02, 0.95, 0.7, m.top + 0.1, 0.04);
  m.lights.push({ key: 'red', at: [0.85, -0.4, m.top + 0.1], color: '#ff3b30', radius: 140, intensity: 0.55, blinkMs: 900, size: 4 });
  m.lights.push({ key: 'blue', at: [0.85, 0.4, m.top + 0.1], color: '#3a8aff', radius: 140, intensity: 0.55, blinkMs: 900, phase: 0.5, size: 4 });
  return m;
}

/** A stretched limousine, 7.66 x 2.12 m, pennants on the front wings. */
export function limo(livery = 'black', variant?: string): Model {
  const m = car({ len: 7.66, wid: 2.12, hood: 1.5, trunk: 1.1, cabinH: 0.52, bodyH: 0.66, wheelR: 0.36, colour: CAR_COLOURS[livery] ?? CAR_COLOURS.black! }, wearOf(variant));
  const staff = m.part(mat('#c9a23c', { gloss: true })), pennant = m.part((_x, _y, z) => (z > 1.42 ? mat('#4f7fbf') : mat('#e2dccb')));
  for (const s of [-1, 1]) {
    m.tube(staff, 0.95, 1.6, 0, 0, 0.025, { ring: 6, xf: chain(rotY(-Math.PI / 2), move(3.2, s * 0.92, 0)) });
    m.box(pennant, 2.85, s * 0.92 - 0.015, 1.3, 3.18, s * 0.92 + 0.015, 1.58, 0.005);
  }
  return m;
}

/** A van (the Embassy's caterers), 5.16 x 2.19 m: one tall box with a sloped front, a company stripe on the flank. */
export function van(livery = 'white', variant?: string): Model {
  const w = wearOf(variant);
  w.top = 2.45;
  const col = CAR_COLOURS[livery] ?? CAR_COLOURS.white!;
  const m = new Model();
  m.top = 2.45;
  const c = mat(col), stripe = mat('#8a2e3c'), roofC = mat(darker(col, 0.06));
  const bod = m.part((x, y, z, nx, ny, nz) => {
    if (nx > 0.4 && z > 1.45 && z < 2.15 && Math.abs(y) < 0.95) return GLASS;
    if ((ny > 0.5 || ny < -0.5) && z > 1.5 && z < 2.1 && x > 1.1 && x < 1.9) return GLASS;
    if ((ny > 0.5 || ny < -0.5) && Math.abs(z - 1.25) < 0.14) return stripe;
    if (nz > 0.8) return worn(roofC, w, x, y, z, nz);
    return worn(c, w, x, y, z, nz);
  });
  body(m, bod, -2.58, 2.58, 1.08, 0.38, 2.45, { round: 0.3, n: 5, noseDrop: 0.35 });
  wheels(m, { xs: [1.65, -1.6], y: 0.95, r: 0.38, w: 0.28, flat: w.flat });
  m.sideDecals(-2.6, 0.3, 2.6, 2.5, 48, [bod], (g) => { stencil(g, livery === 'yellow' ? 'SHUTTLE' : 'GALA CATERING', -0.4, -1.75, 0.34, livery === 'yellow' ? '#1c1f26' : '#8a2e3c', 0, 0.08); });
  return m;
}

/** A refrigerated truck (the Embassy's caterers), 7.66 x 2.12 m: the cab, then an insulated box with its cold unit. */
export function reefer(livery = 'white'): Model {
  const m = boxTruckOf(7.66, 2.12, livery, undefined, 'COLD CHAIN');
  const unit = m.part((x, _y, _z, nx) => (nx > 0.5 && near(x, 0.1, 0.03) ? mat('#3d4450') : mat('#9ab0bc')));
  m.box(unit, 1.5, -0.6, 2.4, 1.85, 0.6, 3.1, 0.06);
  return m;
}

/** A school bus, 11 x 2.5 m: the long yellow box, black rub rails, a row of windows, a short bonnet at the front. */
export function schoolBus(livery = 'yellow', variant?: string): Model {
  const w = wearOf(variant);
  w.top = 3.0;
  const m = new Model();
  const col = livery === 'white' ? '#d8d2c2' : '#d39a2e';
  m.top = 3.0;
  const paint = mat(col), rub = mat('#1c1f26'), roofC = mat(lighter(col, 0.12)), glass = w.broken ? GLASS_BROKEN : GLASS;
  const bod = m.part((x, y, z, nx, ny, nz) => {
    if (nz > 0.8) return worn(near(x, 0.9, 0.03) ? mat(darker(col, 0.15)) : roofC, w, x, y, z, nz);
    if ((ny > 0.5 || ny < -0.5) && z > 1.95 && z < 2.6 && x > -5.0 && x < 3.3) return near(x + 5.0, 0.92, 0.07) ? worn(paint, w, x, y, z, nz) : w.broken && shattered(x, y, z) ? GLASS_BROKEN : glass;
    if (nx > 0.5 && z > 1.8 && z < 2.65 && Math.abs(y) < 1.1) return Math.abs(y) < 0.05 ? rub : glass;
    if ((ny > 0.5 || ny < -0.5) && (Math.abs(z - 1.55) < 0.05 || Math.abs(z - 1.25) < 0.05)) return rub;
    return worn(paint, w, x, y, z, nz);
  });
  body(m, bod, -5.5, 3.95, 1.25, 0.55, 3.0, { round: 0.3, n: 6 });
  // The bonnet and grille.
  const hood = m.part((x, y, z, nx, _ny, nz) => (nx > 0.6 ? mat('#2b2e34') : worn(paint, w, x, y, z, nz)), { group: m.group() });
  body(m, hood, 3.6, 5.5, 1.1, 0.55, 1.65, { round: 0.25, n: 5 });
  const lamps = m.part(mat('#e0443a', { gloss: true }));
  for (const s of [-1, 1]) for (const x of [-5.4, 3.85]) m.blob(lamps, x, s * 0.9, 2.95, 0.12, 0.12, 0.08);
  const sign = m.part('#c0392b');
  m.box(sign, 2.3, -1.45, 1.55, 2.8, -1.27, 2.0, 0.03);
  wheels(m, { xs: [4.3, -3.6], y: 1.05, r: 0.5, w: 0.4, flat: w.flat });
  m.decals(-5.6, -1.3, 5.6, 1.3, 40, [bod], (g) => { stencil(g, 'SCHOOL BUS', -0.8, 0, 0.55, '#1c1f26', 0, 0.12); });
  m.sideDecals(-5.6, 0.5, 5.6, 3.1, 40, [bod], (g) => { stencil(g, 'SCHOOL BUS', -0.8, -1.4, 0.28, '#1c1f26', 0, 0.12); });
  return m;
}

/* -- snow ------------------------------------------------------------------------------------------------------------------- */

/** A piste-basher snowcat (Summit's groomer, 340 x 176 px plus its blade): two wide rubber tracks, a boxy cab, the blade ahead. */
export function snowcat(livery = 'red'): Model {
  const col = livery === 'orange' ? '#d9772e' : '#b8432f';
  const m = new Model();
  m.top = 2.8;
  const tread = mat('#26292e'), lug = mat('#3d4450');
  const track = m.part((x, _y, _z, _nx, _ny, nz) => (nz > 0.5 && near(x, 0.3, 0.07) ? lug : tread));
  for (const s of [-1, 1]) body(m, track, -2.62, 2.62, 0.5, 0.0, 0.95, { y: s * 0.86, round: 0.45, n: 3 });
  const cabC = mat(col), roof = mat('#d8d2c2'), stripe = mat('#e2dccb');
  const cab = m.part((x, y, z, nx, ny, nz) => {
    if (nz > 0.8) return roof;
    if (z > 1.75 && (nx > 0.5 || ny > 0.5 || ny < -0.5 || nx < -0.5) && !(Math.abs(x - 0.75) < 0.06 || Math.abs(y) < 0.05)) return GLASS;
    if ((ny > 0.5 || ny < -0.5) && Math.abs(z - 1.35) < 0.08) return stripe;
    return cabC;
  });
  body(m, cab, -0.6, 2.0, 0.95, 0.9, 2.8, { round: 0.2, n: 6 });
  const deck = m.part((x) => (near(x, 0.35, 0.04) ? mat(darker(col, 0.35)) : mat(darker(col, 0.15))));
  m.box(deck, -2.55, -0.72, 0.75, 2.45, 0.72, 1.05, 0.05);
  // The hydraulic arms and the blade, hazard-striped along its top.
  const arm = m.part('#3d4450');
  for (const s of [-1, 1]) m.box(arm, 2.3, s * 0.55 - 0.08, 0.5, 2.85, s * 0.55 + 0.08, 0.7, 0.02);
  const blade = m.part((_x, y, z) => (z > 0.82 ? (near(y, 0.5, 0.25) ? mat('#1c1f26') : mat('#c9a23c')) : mat('#c9a23c')));
  m.slab(blade, [[2.82, -1.84], [3.2, -1.7], [3.2, 1.7], [2.82, 1.84]], 0.05, 1.0, { bevel: 0.06 });
  const tiller = m.part((x) => (near(x, 0.2, 0.05) ? mat('#3d4450') : mat('#59606b')));
  m.box(tiller, -2.62, -1.3, 0.05, -2.2, 1.3, 0.6, 0.1);
  const lights = m.part(mat('#ffe8b0', { gloss: true }));
  for (let i = 0; i < 4; i++) m.blob(lights, 1.92, -0.6 + i * 0.4, 2.86, 0.09, 0.11, 0.09);
  m.lights.push({ key: 'beacon', at: [0.2, 0, 2.95], color: '#ffb347', radius: 160, intensity: 0.55, blinkMs: 1200, size: 5 });
  m.lights.push({ key: 'lamps', at: [2.2, 0, 2.6], color: '#ffe8b0', radius: 220, intensity: 0.45, size: 8 });
  const beacon = m.part(mat('#e8a23a', { gloss: true }));
  m.blob(beacon, 0.2, 0, 2.86, 0.14, 0.14, 0.12);
  m.sideDecals(-0.7, 0.8, 2.1, 2.9, 48, [cab], (g) => { stencil(g, 'SUMMIT', 0.7, -1.55, 0.26, '#e2dccb', 0, 0.1); });
  return m;
}

/** A gondola cabin set down on the snow (Summit's twin of the groomer), 5.3 x 2.75 m: big windows, a red band, the grip on top. */
export function gondola(livery = 'white'): Model {
  const col = livery === 'red' ? '#b8432f' : '#e2dccb';
  const m = new Model();
  m.top = 2.6;
  const c = mat(col), band = mat('#b8432f'), roofC = mat('#9aa2ab');
  const cab = m.part((x, y, z, nx, ny, nz) => {
    if (nz > 0.85) return roofC;
    if (z > 1.1 && z < 2.2 && (Math.abs(nx) > 0.45 || Math.abs(ny) > 0.45) && !near(x, 0.88, 0.07) && Math.abs(y) > 0.05) return GLASS;
    if (Math.abs(z - 0.85) < 0.16) return band;
    return c;
  });
  body(m, cab, -2.65, 2.65, 1.37, 0.1, 2.6, { round: 0.55, n: 3.4 });
  const grip = m.part(mat('#4f5560', { gloss: true }));
  m.box(grip, -0.35, -0.2, 2.55, 0.35, 0.2, 3.3, 0.06);
  m.tube(grip, -0.9, 0.9, 0, 3.3, 0.14, { ring: 10 });
  return m;
}

/** A snowmobile, 3 x 1.1 m: skis forward, a sit-on body over the track, a windscreen and the handlebars. */
export function snowmobile(livery = 'red'): Model {
  const col = livery === 'orange' ? '#d9772e' : livery === 'blue' ? '#4f6a8a' : '#b8432f';
  const m = new Model();
  m.top = 1.0;
  const ski = m.part('#2b2e34');
  for (const s of [-1, 1]) m.slab(ski, [[0.4, s * 0.45 - 0.08], [1.5, s * 0.45 - 0.08], [1.62, s * 0.45], [1.5, s * 0.45 + 0.08], [0.4, s * 0.45 + 0.08]], 0, 0.08, { bevel: 0.02 });
  const tr = m.part('#26292e');
  body(m, tr, -1.45, 0.4, 0.3, 0.05, 0.5, { round: 0.2, n: 3 });
  const c = mat(col), stripe = mat('#e2dccb');
  const hull = m.part((x, _y, z, _nx, ny) => ((ny > 0.5 || ny < -0.5) && Math.abs(z - 0.62) < 0.05 && x > -0.2 ? stripe : c));
  body(m, hull, -0.2, 1.45, 0.42, 0.35, 0.9, { round: 0.25, n: 3, noseDrop: 0.25 });
  const seat = m.part('#2b2e34');
  body(m, seat, -1.4, -0.1, 0.28, 0.45, 0.98, { round: 0.15, n: 4 });
  const screen = m.part(mat('#3d5068', { gloss: true }));
  m.slab(screen, [[0, -0.32], [0.18, -0.32], [0.18, 0.32], [0, 0.32]], 0, 0.04, { xf: chain(rotY(-1.1), move(0.15, 0, 0.88)) });
  const bars = m.part('#3d4450');
  m.tube(bars, -0.42, 0.42, 0, 0, 0.035, { ring: 6, xf: chain(rotZ(Math.PI / 2), move(-0.05, 0, 1.05)) });
  return m;
}


/* -- wrecks: the airliner halves and the box truck ------------------------------------------------------------------- */

type AirlinerLook = { top: string; belly: string; cheat: string; pin: string };
const AIRLINER: Record<string, AirlinerLook> = {
  white: { top: '#d8d2c2', belly: '#9aa0a6', cheat: '#4f7fbf', pin: '#b4524a' },
  teal: { top: '#cfd4cc', belly: '#8a9498', cheat: '#3f8a86', pin: '#c9a23c' },
};

/** Paint for an airliner's skin: cheatline, a row of windows, dirt and scorch. */
function airSkin(A: AirlinerLook, burnt: boolean, glassFrom: number, glassTo: number, breakX: number): Paint {
  const top = mat(A.top), belly = mat(A.belly), cheat = mat(A.cheat), pin = mat(A.pin), win = mat('#26303c');
  // Scorch spreads from the torn end: heavy beside it, thinning down the fuselage.
  const near_ = { burnt: 1.0, dirt: 0.2 }, mid = { burnt: 0.62, dirt: 0.2 }, far = { burnt: 0.3, dirt: 0.2 }, clean: PaintWear = { dirt: 0.15 };
  return (x, y, z, _nx, ny, nz) => {
    const d = Math.abs(x - breakX);
    return weather(skinAt(x, y, z, ny, nz), !burnt ? clean : d < 3 ? near_ : d < 6.5 ? mid : far, x, y, z, nz, 4);
  };
  function skinAt(x: number, _y: number, z: number, ny: number, _nz: number): Mat {
    const flank = ny > 0.35 || ny < -0.35;
    if (flank && z > 2.45 && z < 2.78 && x > glassFrom && x < glassTo && near(x, 0.52, 0.13)) return win;
    if (flank && Math.abs(z - 2.12) < 0.14) return cheat;
    if (flank && Math.abs(z - 1.9) < 0.035) return pin;
    if (z < 1.25) return belly;
    return top;
  }
}

/** The airliner's front half, broken off behind the wing: nose toward +x, the torn end at -6.5 m. 13 x 4.1 m. */
export function airlinerFront(livery = 'white', variant = 'solid'): Model {
  const A = AIRLINER[livery] ?? AIRLINER.white!;
  const m = new Model();
  m.top = 4.0;
  const hollow = variant === 'hollow', burnt = variant === 'burnt';
  // Hollow, the south wall has the breach the map leaves open (Wasteland's spanA twin).
  const skin = airSkin(A, burnt, -6.0, 4.2, -6.5);
  const cockpit = mat('#1e2a3a', { gloss: true });
  const post = mat('#3d4450');
  // The flight deck's glazing: four panes across the nose split by posts.
  const p = m.part((x, y, z, nx, ny, nz) => (x > 5.05 && x < 5.85 && z > 2.95 && z < 3.5 && nx > 0.15 && Math.abs(y) < 1.15 ? (near(y, 0.5, 0.05) ? post : cockpit) : skin(x, y, z, nx, ny, nz)), { clip: hollow ? 2.95 : 99, inner: '#b9ae90', ...(hollow && { cut: (x: number, y: number) => y > 0.6 && x > -1.95 && x < -0.08 }) });
  m.loft(p, [
    { x: -6.5, w: 2.0, h: 2.0, z: 2.0, n: 2.1 }, { x: 4.0, w: 2.0, h: 2.0, z: 2.0, n: 2.1 }, { x: 5.2, w: 1.8, h: 1.75, z: 2.05 },
    { x: 6.0, w: 1.25, h: 1.2, z: 2.0 }, { x: 6.42, w: 0.55, h: 0.5, z: 1.9 }, { x: 6.5, w: 0, h: 0, z: 1.85 },
  ], { ring: 34, sub: 3, jag: 0.55, seed: 3 });
  if (hollow) {
    const floor = m.part((x) => (near(x, 0.8, 0.04) ? mat('#3d3833') : mat('#5a5048')));
    m.box(floor, -6.3, -1.75, 0.45, 4.6, 1.75, 0.6, 0.02);
    const seat = m.part('#4f6a8a'), seat2 = m.part('#3f5a7a');
    for (let x = -5.6; x < 3.6; x += 0.85) for (const [y0, y1] of [[-1.55, -0.35], [0.35, 1.55]] as const) {
      if ((x > -1.2 && x < -0.3)) continue;
      m.box((Math.round(x * 10) % 2 ? seat : seat2), x - 0.25, y0, 0.6, x + 0.25, y1, 1.15, 0.07);
    }
  }
  m.decals(-6.6, -2.1, 6.6, 2.1, 40, [p], (g) => { if (!hollow) stencil(g, 'SKY TOY', -1.5, 0, 0.75, A.cheat, 0, 0.14); });
  return m;
}

/** The airliner's tail half: the torn end at +6 m, the cone and the tall fin toward -x. 12 x 4.1 m (7.6 m across the tailplanes). */
export function airlinerTail(livery = 'white', variant = 'solid'): Model {
  const A = AIRLINER[livery] ?? AIRLINER.white!;
  const m = new Model();
  m.top = 4.0;
  const hollow = variant === 'hollow', burnt = variant === 'burnt';
  const skin = airSkin(A, burnt, -0.5, 6.0, 6.0);
  // Hollow, the north wall has the breach the map leaves open (Wasteland's spanB twin).
  const p = m.part(skin, { clip: hollow ? 2.95 : 99, inner: '#b9ae90', ...(hollow && { cut: (x: number, y: number) => y < -0.6 && x > -1.25 && x < 0.63 }) });
  m.loft(p, [
    { x: -6.0, w: 0, h: 0, z: 3.2 }, { x: -5.85, w: 0.45, h: 0.4, z: 3.15 }, { x: -4.5, w: 1.0, h: 1.0, z: 2.9 }, { x: -2.0, w: 1.75, h: 1.7, z: 2.35 },
    { x: 0, w: 2.0, h: 2.0, z: 2.0, n: 2.1 }, { x: 6.0, w: 2.0, h: 2.0, z: 2.0, n: 2.1 },
  ], { ring: 34, sub: 3, jag: 0.6, seed: 7 });
  const finTop = mat(A.top), finBand = mat(A.cheat);
  const tail = m.part((x, y, z, _nx, _ny, nz) => weather(z > 5.6 && z < 6.8 ? finBand : finTop, burnt ? { burnt: 0.6 } : { dirt: 0.3 }, x, y, z, nz, 8));
  m.slab(tail, [[-2.2, 3.4], [-4.8, 7.6], [-5.9, 7.6], [-5.6, 3.2]], -0.18, 0.18, { bevel: 0.08, xf: ([x, y, z]) => [x, z, y] });
  const plane = m.part(A.top);
  m.slab(plane, [[-3.6, -0.6], [-4.8, -3.8], [-5.6, -3.8], [-5.4, -0.6], [-5.4, 0.6], [-5.6, 3.8], [-4.8, 3.8], [-3.6, 0.6]], 3.0, 3.22, { bevel: 0.06 });
  if (hollow) {
    const floor = m.part((x) => (near(x, 0.8, 0.04) ? mat('#3d3833') : mat('#5a5048')));
    m.box(floor, -1.8, -1.75, 0.45, 5.8, 1.75, 0.6, 0.02);
    const seat = m.part('#4f6a8a');
    for (let x = -0.9; x < 5.4; x += 0.85) for (const [y0, y1] of [[-1.55, -0.35], [0.35, 1.55]] as const) m.box(seat, x - 0.25, y0, 0.6, x + 0.25, y1, 1.15, 0.07);
  }
  m.sideDecals(-6.2, 3.0, -2.0, 7.8, 40, [tail], (g) => {
    g.fillStyle = '#e2dccb'; g.beginPath(); g.arc(-4.4, -6.2, 0.55, 0, Math.PI * 2); g.fill();
    g.fillStyle = A.pin; g.beginPath(); g.moveTo(-4.4, -6.65); g.lineTo(-4.0, -5.95); g.lineTo(-4.8, -5.95); g.closePath(); g.fill();
  });
  return m;
}

/** A box truck, 7.6 x 2.6 m: cab at the front (+x), a tall box behind. `wreck` and `vines` weather it. */
export function boxTruck(livery = 'white', variant?: string): Model { return boxTruckOf(7.6, 2.56, livery, variant, 'DELIVERIES'); }

function boxTruckOf(len: number, wid: number, livery: string, variant: string | undefined, label: string): Model {
  const w = wearOf(variant);
  const X = len / 2, Y = wid / 2, cab = Math.min(2.0, len * 0.27);
  w.top = 3.3;
  const col = CAR_COLOURS[livery] ?? CAR_COLOURS.white!;
  const m = new Model();
  m.top = 3.3;
  const c = mat(col), band = mat('#b4524a'), shut = mat(darker(col, 0.15));
  const box = m.part((x, y, z, nx, ny, nz) => {
    if ((ny > 0.5 || ny < -0.5) && Math.abs(z - 2.0) < 0.22) return worn(band, w, x, y, z, nz);
    if (nx < -0.6 && near(z, 0.14, 0.02)) return shut;
    if (nz > 0.8 && near(x, 0.9, 0.03)) return worn(shut, w, x, y, z, nz);
    return worn(c, w, x, y, z, nz);
  });
  m.box(box, -X + 0.05, -Y, 0.85, X - cab - 0.15, Y, 3.3, 0.1);
  const cabC = mat(livery === 'white' ? '#4f6a8a' : col);
  const cabP = m.part((x, y, z, nx, ny, nz) => {
    if (nx > 0.55 && z > 1.75 && z < 2.45 && Math.abs(y) < Y - 0.25) return w.broken && shattered(x, y, z) ? GLASS_BROKEN : GLASS;
    if ((ny > 0.6 || ny < -0.6) && z > 1.8 && z < 2.4 && x > X - cab * 0.65 && x < X - 0.4) return w.broken && shattered(x, y, z) ? GLASS_BROKEN : GLASS;
    return worn(cabC, w, x, y, z, nz);
  });
  body(m, cabP, X - cab, X, Y - 0.08, 0.75, 2.6, { round: 0.22, n: 5 });
  const frame = m.part('#2b2e34');
  m.box(frame, -X + 0.1, -0.9, 0.45, X - 0.05, 0.9, 0.85, 0.02);
  wheels(m, { xs: [X - cab * 0.4, -X + 1.85, -X + 0.85], y: Y - 0.22, r: 0.46, w: 0.38, flat: w.flat }, w.paint.rust ? '#5a4a3a' : '#9aa2ab');
  m.sideDecals(-X, 0.8, X - cab, 3.4, 40, [box], (g) => { if (!w.paint.burnt) stencil(g, label, (-X + X - cab) / 2, -2.75, 0.4, label === 'COLD CHAIN' ? '#4a6a82' : '#1c1f26', 0, 0.1); });
  return m;
}
