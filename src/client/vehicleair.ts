/**
 * Aircraft for the vehicle kit: the C-130 cargo plane, the fighter and the utility helicopter. Each is a toy model in metres
 * (nose toward +x) whose plan matches its collision shape in src/shared/shapes.ts.
 */
import { Model, chain, mat, move, rotX, rotY, rotZ, type Mat, type Paint, type RGB } from './vehiclemesh.ts';

const BONE = '#e2dccb';
const INKC = '#1c1f26';
const GLASS = mat('#1e2a3a', { gloss: true });
const FONT = (px: number) => `700 ${px}px "Barlow Condensed", "Arial Narrow", sans-serif`;

const near = (v: number, step: number, w: number) => { const r = ((v % step) + step) % step; return r < w || r > step - w; };
const hexRGB = (hex: string): RGB => { const n = parseInt(hex.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
const darker = (hex: string, k: number) => { const [r, g, b] = hexRGB(hex); return `#${[r, g, b].map((v) => Math.round(v * (1 - k)).toString(16).padStart(2, '0')).join('')}`; };

/** A roundel: a bone ring round a dark disc with a star, drawn into a decal canvas in metres. */
function roundel(g: CanvasRenderingContext2D, x: number, y: number, r: number, star = BONE, ring = BONE, disc = '#2c3a52') {
  g.fillStyle = ring; g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
  g.fillStyle = disc; g.beginPath(); g.arc(x, y, r * 0.8, 0, Math.PI * 2); g.fill();
  g.fillStyle = star; g.beginPath();
  for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + (i * Math.PI) / 5, rr = i % 2 ? r * 0.3 : r * 0.72; g.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr); }
  g.closePath(); g.fill();
}
function stencil(g: CanvasRenderingContext2D, s: string, x: number, y: number, size: number, color: string, rot = 0, spacing = 0.08) {
  g.save(); g.translate(x, y); g.rotate(rot);
  g.font = FONT(100); g.textAlign = 'center'; g.textBaseline = 'middle';
  g.scale(size / 100, size / 100);
  (g as unknown as { letterSpacing: string }).letterSpacing = `${spacing * 100}px`;
  g.fillStyle = color; g.fillText(s, 0, 0);
  g.restore();
}

/* -- C-130 ------------------------------------------------------------------------------------------------------------------ */

type C130Livery = { body: string; wing: string; belly: string; stripe: string; mark: string; code: string; name: string; nacelle: string };
const C130_LIVERIES: Record<string, C130Livery> = {
  olive: { body: '#6f7d58', wing: '#66734f', belly: '#5f6b4c', stripe: '#b4524a', mark: BONE, code: 'A-07', name: '477TH AIRLIFT', nacelle: '#5a6449' },
  grey: { body: '#a3abb5', wing: '#959eaa', belly: '#8c95a1', stripe: '#e0752a', mark: INKC, code: 'X-12', name: 'FLIGHT TEST', nacelle: '#7f8894' },
};

export function c130(livery = 'olive', variant = 'rampDown'): Model {
  const L = C130_LIVERIES[livery] ?? C130_LIVERIES.olive!;
  const m = new Model();
  m.top = 3.5;
  const body = mat(L.body), belly = mat(L.belly), seam = mat(darker(L.body, 0.22)), stripe = mat(L.stripe), boot = mat('#3a3f47'), frame = mat(darker(L.body, 0.3));
  const radome = mat(darker(L.body, 0.28)), soot = mat(darker(L.body, 0.3)), sootWing = mat(darker(L.wing, 0.16));

  // Fuselage: a squarish tube with a bulbous nose and the tail swept up over the ramp.
  const fusPaint: Paint = (x, y, z, _nx, ny, nz) => {
    if (x > 10.05) return radome;
    // Flight deck: a band of windscreens round the nose, side windows behind, the frames between them.
    if (x > 9.0 && x < 9.95 && z > 2.62 && nz > 0.05) return Math.abs(y) < 0.07 || Math.abs(Math.abs(y) - 0.62) < 0.07 ? frame : GLASS;
    if (x > 8.35 && x < 9.0 && z > 2.6 && z < 3.15 && (ny > 0.5 || ny < -0.5)) return near(x - 8.35, 0.33, 0.05) ? frame : GLASS;
    if (z < 1.2) return belly;
    // The red prop-danger band in line with the inboard props.
    if (x > 3.7 && x < 3.98) return stripe;
    if (near(x, 1.6, 0.028) && x < 8 && x > -8) return seam;
    // Paratroop doors on the flanks, crew hatches on the roof.
    if ((ny > 0.6 || ny < -0.6) && x > -6.6 && x < -5.6 && z > 1.0 && z < 2.6 && (x < -6.54 || x > -5.66 || z < 1.06 || z > 2.54)) return seam;
    if (nz > 0.8 && ((x > 6.6 && x < 7.3) || (x > -3.2 && x < -2.5)) && Math.abs(y) < 0.36 && (Math.abs(y) > 0.3 || near(x, 0.7, 0.04) || x < 6.66 && x > 6.6 || x < -2.5 && x > -2.56)) return seam;
    if (x < -7.4 && nz > 0.75 && Math.abs(y) < 0.25) return soot;
    return body;
  };
  const fus = m.part(fusPaint);
  m.loft(fus, [
    { x: 10.58, w: 0, h: 0, z: 2.0 },
    { x: 10.45, w: 0.62, h: 0.58, z: 2.0 },
    { x: 10.1, w: 1.06, h: 1.0, z: 2.05 },
    { x: 9.5, w: 1.38, h: 1.3, z: 2.12, n: 2.2 },
    { x: 8.5, w: 1.56, h: 1.46, z: 2.08, n: 2.5 },
    { x: 6.5, w: 1.6, h: 1.48, z: 2.02, n: 2.7 },
    { x: -2.5, w: 1.6, h: 1.48, z: 2.02, n: 2.7 },
    { x: -5.5, w: 1.5, h: 1.3, z: 2.22, n: 2.5 },
    { x: -8.0, w: 1.18, h: 0.92, z: 2.72, n: 2.3 },
    { x: -9.9, w: 0.62, h: 0.5, z: 3.08 },
    { x: -10.75, w: 0, h: 0, z: 3.18 },
  ], { ring: 32, sub: 4 });

  // Main gear sponsons along the lower flanks, and the toy wheels peeking out under them.
  const spon = m.part(L.belly);
  for (const s of [-1, 1]) m.loft(spon, [
    { x: 2.3, w: 0, h: 0, y: s * 1.55, z: 0.95 }, { x: 1.8, w: 0.36, h: 0.48, y: s * 1.6, z: 0.95 }, { x: 0.5, w: 0.44, h: 0.58, y: s * 1.62, z: 0.95, n: 2.6 },
    { x: -1.2, w: 0.44, h: 0.58, y: s * 1.62, z: 0.95, n: 2.6 }, { x: -1.9, w: 0.3, h: 0.4, y: s * 1.58, z: 1.0 }, { x: -2.2, w: 0, h: 0, y: s * 1.55, z: 1.05 },
  ], { ring: 18 });
  const tyre = m.part('#2b2e34'), hub = m.part('#8a8f98');
  for (const s of [-1, 1]) for (const x of [0.9, -0.4]) m.wheel(tyre, hub, x, s * 1.62, 0.46, 0.34);
  m.wheel(tyre, hub, 7.9, 0, 0.36, 0.3);

  // The wing, mounted high across the roof: de-icer boots on the leading edge, flap and aileron seams, soot behind the engines.
  const wingLE = (y: number) => 2.4 - (Math.max(0, Math.abs(y) - 1.3) * 4) / 10.7;
  const wingTE = (y: number) => -1.8 - (Math.max(0, Math.abs(y) - 1.3) * 1.8) / 10.7;
  const wingMat = mat(L.wing), wingSeam = mat(darker(L.wing, 0.24));
  const wingPaint: Paint = (x, y, _z, _nx, _ny, nz) => {
    const le = wingLE(y), te = wingTE(y), ay = Math.abs(y);
    if (nz < 0.5) return wingMat;
    if (x > le - 0.3) return boot;
    if ((Math.abs(ay - 5.2) < 0.2 || Math.abs(ay - 9.0) < 0.15) && x < le - 1.6 && x > te + 0.25) return sootWing;
    if (Math.abs(x - (te + 0.85)) < 0.03 && ay > 1.6 && ay < 11.5) return wingSeam;
    if ((Math.abs(ay - 7.1) < 0.03 || Math.abs(ay - 3.3) < 0.03 || Math.abs(ay - 10.3) < 0.03) && x < te + 0.85) return wingSeam;
    return wingMat;
  };
  const wing = m.part(wingPaint);
  m.slab(wing, [[-1.6, -12], [2.4, -1.3], [2.4, 1.3], [-1.6, 12], [-3.0, 12.05], [-3.6, 11.7], [-1.8, 1.3], [-1.8, -1.3], [-3.6, -11.7], [-3.0, -12.05]], 3.22, 3.62, { bevel: 0.16 });

  // Four turboprop nacelles slung under the wing and standing proud of it: cowl seams, exhaust, glossy spinners.
  const nacMat = mat(L.nacelle), nacSeam = mat(darker(L.nacelle, 0.28)), intake = mat('#22262c');
  const spin = m.part(mat('#4a515c', { gloss: true }));
  const nacelle = (y: number, x0: number, len: number, r: number) => {
    const part = m.part((x, _y, z, nx) => {
      if (x > x0 - 0.12 && nx > 0.3 && z < 3.0) return intake;
      if (Math.abs(x - (x0 - 0.9)) < 0.035 || Math.abs(x - (x0 - 2.2)) < 0.035) return nacSeam;
      if (x < x0 - len + 1.3 && x > x0 - len + 0.5 && z > 3.2) return soot;
      return nacMat;
    }, { group: nacGroup });
    m.loft(part, [
      { x: x0, w: r * 0.62, h: r * 0.7, y, z: 3.0 }, { x: x0 - 0.3, w: r * 0.8, h: r * 0.95, y, z: 3.04 }, { x: x0 - 1.0, w: r * 0.82, h: r, y, z: 3.08, n: 2.3 },
      { x: x0 - len * 0.7, w: r * 0.78, h: r * 0.95, y, z: 3.12, n: 2.3 }, { x: x0 - len, w: r * 0.3, h: r * 0.32, y, z: 3.3 }, { x: x0 - len - 0.25, w: 0, h: 0, y, z: 3.32 },
    ], { ring: 20 });
    m.loft(spin, [{ x: x0 + 0.66, w: 0, h: 0, y, z: 3.0 }, { x: x0 + 0.5, w: r * 0.3, h: r * 0.3, y, z: 3.0 }, { x: x0 + 0.12, w: r * 0.52, h: r * 0.52, y, z: 3.0 }, { x: x0, w: r * 0.52, h: r * 0.52, y, z: 3.0 }], { ring: 16 });
    m.spinners.push({ at: [x0 + 0.22, y, 3.0], axis: [1, 0, 0], r: Math.abs(y) > 7 ? 1.55 : 1.72, blades: 4, rps: 0.9 });
  };
  const nacGroup = m.group();
  for (const s of [-1, 1]) { nacelle(s * 5.2, 3.65, 5.2, 0.78); nacelle(s * 9.0, 2.05, 4.6, 0.66); }

  // Tailplane, then the tall fin standing up out of the tail.
  const tp = m.part((x, _y, _z, _nx, _ny, nz) => (nz > 0.5 && x > -7.95 ? boot : wingMat));
  m.slab(tp, [[-9.6, -4.8], [-7.6, -1.2], [-7.6, 1.2], [-9.6, 4.8], [-10.9, 4.85], [-11.2, 4.6], [-10.4, 1.2], [-10.4, -1.2], [-11.2, -4.6], [-10.9, -4.85]], 3.12, 3.42, { bevel: 0.12 });
  const finPaint: Paint = (x, _y, z) => (z > 7.05 ? stripe : x > -6.9 - (z - 3.0) * 0.49 - 0.32 && z > 3.6 ? boot : body);
  const fin = m.part(finPaint);
  m.slab(fin, [[-6.9, 3.0], [-9.15, 7.6], [-10.55, 7.6], [-10.95, 3.0]], -0.2, 0.2, { bevel: 0.1, xf: ([x, y, z]) => [x, z, y] });

  // Details on the roof: the beacon, two blade antennas; nav lights on the wing tips.
  const ant = m.part(mat('#3d4450'));
  m.box(ant, 7.7, -0.05, 3.4, 8.15, 0.05, 3.85, 0.02);
  m.box(ant, -7.0, -0.05, 3.1, -7.4, 0.05, 3.52, 0.02);
  const beacon = m.part(mat('#d33a2c', { gloss: true }));
  m.blob(beacon, -3.1, 0, 3.48, 0.16, 0.16, 0.12);
  m.lights.push({ key: 'beacon', at: [-3.1, 0, 3.6], color: '#ff4a40', radius: 140, intensity: 0.6, blinkMs: 1400, size: 5 });
  const navR = m.part(mat('#e0443a', { gloss: true })), navG = m.part(mat('#3fcf7a', { gloss: true }));
  m.blob(navR, -2.1, -12.05, 3.42, 0.22, 0.12, 0.12);
  m.blob(navG, -2.1, 12.05, 3.42, 0.22, 0.12, 0.12);
  m.lights.push({ key: 'navL', at: [-2.1, -12.1, 3.42], color: '#ff4a40', radius: 90, intensity: 0.45, size: 4 });
  m.lights.push({ key: 'navR', at: [-2.1, 12.1, 3.42], color: '#46e08a', radius: 90, intensity: 0.45, size: 4 });

  if (variant !== 'closed') {
    // The ramp lowered to the floor behind the tail, a strapped pallet halfway up it.
    const rampEdge = mat('#b79a4a'), rampRib = mat('#4f5560'), rampDeck = mat('#6b727c');
    const ramp = m.part((x, y) => (Math.abs(Math.abs(y) - 1.05) < 0.07 ? rampEdge : near(x, 0.32, 0.03) ? rampRib : rampDeck));
    const hinge = { x: -8.2, z: 1.45 }, foot = { x: -11.7, z: 0.05 };
    const dx = hinge.x - foot.x, dz = hinge.z - foot.z, len = Math.hypot(dx, dz), a = Math.atan2(dz, dx);
    m.slab(ramp, [[0, -1.2], [len, -1.2], [len, 1.2], [0, 1.2]], -0.14, 0, { bevel: 0.04, xf: chain(([x, y, z]) => [x * Math.cos(a) - z * Math.sin(a), y, x * Math.sin(a) + z * Math.cos(a)] as [number, number, number], move(foot.x, 0, foot.z)) });
    const strap = mat('#2e3424'), c1 = mat('#5d6a41'), c2 = mat('#7a6a42');
    const crate = m.part((x) => (Math.abs(x - along(1.3)[0]) < 0.06 ? strap : c1)), crate2 = m.part((x) => (Math.abs(x - along(0.9)[0]) < 0.05 ? strap : c2));
    const along = (u: number) => [foot.x + Math.cos(a) * u, foot.z + Math.sin(a) * u] as const;
    { const [cx, cz] = along(1.3); m.box(crate, cx - 0.5, -0.75, cz, cx + 0.5, 0.15, cz + 0.85, 0.06); }
    { const [cx, cz] = along(0.9); m.box(crate2, cx - 0.35, 0.25, cz, cx + 0.35, 0.85, cz + 0.6, 0.06); }
  }

  // Paint from above: roundels between the engines, wing-root stencils, the unit on the nose and the code on the tail.
  m.decals(-12, -12.5, 11, 12.5, 40, [wing, fus], (g) => {
    roundel(g, -0.9, -7.15, 0.82);
    roundel(g, -0.9, 7.15, 0.82);
    stencil(g, L.name, 5.5, 0, 0.6, L.mark, 0, 0.1);
    stencil(g, L.code, -4.9, 0, 0.72, L.mark, 0, 0.1);
    stencil(g, 'NO STEP', -0.2, -2.7, 0.34, darker(L.wing, 0.35), Math.PI / 2);
    stencil(g, 'NO STEP', -0.2, 2.7, 0.34, darker(L.wing, 0.35), -Math.PI / 2);
  });
  m.sideDecals(-11.2, 2.9, -6.6, 7.8, 40, [fin], (g) => {
    stencil(g, L.code, -9.75, -4.55, 0.8, L.mark, 0, 0.1);
    stencil(g, 'AF 64-0507', -9.6, -3.75, 0.3, L.mark, 0, 0.05);
    if (livery === 'grey') {
      // Test-fleet chevrons.
      g.fillStyle = L.stripe;
      for (let k = 0; k < 3; k++) { const x = -10.2 + k * 0.55; g.beginPath(); g.moveTo(x, -6.6); g.lineTo(x + 0.3, -6.6); g.lineTo(x + 0.6, -5.6); g.lineTo(x + 0.3, -5.6); g.closePath(); g.fill(); }
    } else {
      // KILROY WAS HERE: the bald head peeking over a wall, nose hanging down, fingers on the top edge.
      const cx = -9.35, cy = -6.1;
      g.strokeStyle = L.mark; g.fillStyle = L.mark; g.lineWidth = 0.09; g.lineCap = 'round';
      g.beginPath(); g.moveTo(cx - 0.75, cy); g.lineTo(cx + 0.75, cy); g.stroke();
      g.beginPath(); g.arc(cx, cy, 0.38, Math.PI, 0); g.stroke();
      for (const k of [-1, 1]) { g.beginPath(); g.arc(cx + k * 0.15, cy - 0.15, 0.06, 0, Math.PI * 2); g.fill(); for (let f = 0; f < 3; f++) { g.beginPath(); g.moveTo(cx + k * (0.5 + f * 0.1), cy); g.lineTo(cx + k * (0.5 + f * 0.1), cy - 0.18); g.stroke(); } }
      g.beginPath(); g.moveTo(cx, cy - 0.2); g.quadraticCurveTo(cx + 0.1, cy + 0.2, cx, cy + 0.42); g.stroke();
      stencil(g, 'KILROY WAS HERE', cx, cy + 0.72, 0.26, L.mark, 0, 0.04);
    }
  });
  return m;
}

/* -- fighter ---------------------------------------------------------------------------------------------------------------- */

type JetLivery = { a: string; b: string; trim: string; code: string };
const JET_LIVERIES: Record<string, JetLivery> = {
  grey: { a: '#808b98', b: '#6a7581', trim: '#c9a23c', code: 'AF 87-031' },
  navy: { a: '#62718a', b: '#515e73', trim: '#e0752a', code: 'AF 91-742' },
};
/** Two-tone disruptive camouflage: soft blobs of the darker grey, the same on every bake. */
const camoAt = (x: number, y: number) => Math.sin(x * 0.9 + Math.sin(y * 1.3) * 1.6) + Math.sin(y * 1.1 - x * 0.45 + 1.7) * 0.8 > 0.55;

export function fighter(livery = 'grey', variant = 'jacks'): Model {
  const L = JET_LIVERIES[livery] ?? JET_LIVERIES.grey!;
  const m = new Model();
  m.top = 2.1;
  const A = mat(L.a), B = mat(L.b), seam = mat(darker(L.a, 0.26)), radome = mat('#4f5560'), cavity = mat('#1f242b'), trim = mat(L.trim);
  const wireR = mat('#b4524a'), wireB = mat('#4f7fbf'), wireY = mat('#b79a4a'), soot = mat('#4a4e52');
  const open = variant === 'jacks';
  const skin = (x: number, y: number) => (camoAt(x, y) ? B : A);
  const fusPaint: Paint = (x, y, z, _nx, _ny, nz) => {
    if (x > 5.7) return radome;
    if (open && nz > 0.55) {
      // Two access panels off: dark bays with a tangle of loom.
      for (const [x0, x1] of [[-0.6, 0.7], [1.3, 2.0]] as const) if (x > x0 && x < x1 && Math.abs(y) < 0.34) {
        if (x < x0 + 0.05 || x > x1 - 0.05 || Math.abs(y) > 0.29) return seam;
        const w = (y + (x - x0) * 0.6) * 9;
        return Math.abs(w % 2.2) < 0.35 ? wireR : Math.abs((w + 0.9) % 2.2) < 0.3 ? wireB : Math.abs((w + 1.6) % 2.6) < 0.25 ? wireY : cavity;
      }
    }
    if (x < -6.2 && z > 1.6) return soot;
    if (near(x, 1.3, 0.025) && x < 5 && x > -6) return seam;
    if (nz > 0.9 && Math.abs(y) < 0.03 && x < 2.2 && x > -5) return seam;
    return skin(x, y);
  };
  const fus = m.part(fusPaint);
  m.loft(fus, [
    { x: 6.96, w: 0, h: 0, z: 1.36 }, { x: 6.6, w: 0.2, h: 0.2, z: 1.38 }, { x: 5.6, w: 0.45, h: 0.42, z: 1.45 }, { x: 4.4, w: 0.6, h: 0.54, z: 1.5, n: 2.2 },
    { x: 3.0, w: 0.7, h: 0.6, z: 1.5, n: 2.4 }, { x: 1.0, w: 0.75, h: 0.62, z: 1.5, n: 2.6 }, { x: -3.5, w: 0.75, h: 0.6, z: 1.5, n: 2.8 },
    { x: -5.6, w: 0.72, h: 0.52, z: 1.48, n: 2.8 }, { x: -6.6, w: 0.7, h: 0.45, z: 1.45, n: 3 }, { x: -6.9, w: 0.6, h: 0.38, z: 1.45, n: 3 }, { x: -6.95, w: 0, h: 0, z: 1.45 },
  ], { ring: 28, sub: 3 });
  // Intakes along the flanks, open mouths forward.
  const intakeMouth = mat('#16191e');
  const intake = m.part((x, y, _z, nx) => (nx > 0.55 && x > 2.7 ? intakeMouth : skin(x, y)), { group: m.group() });
  for (const s of [-1, 1]) m.loft(intake, [
    { x: 3.12, w: 0.24, h: 0.32, y: s * 1.05, z: 1.4, n: 3 }, { x: 3.05, w: 0.32, h: 0.4, y: s * 1.05, z: 1.4, n: 3 }, { x: 1.0, w: 0.33, h: 0.42, y: s * 1.02, z: 1.42, n: 3 },
    { x: -0.2, w: 0.3, h: 0.38, y: s * 0.95, z: 1.45, n: 3 }, { x: -2.6, w: 0.2, h: 0.3, y: s * 0.7, z: 1.48, n: 3 }, { x: -2.8, w: 0, h: 0, y: s * 0.6, z: 1.48 },
  ], { ring: 18, sub: 2 });
  // Swept wings and tailplanes.
  const wingPaint: Paint = (x, y, _z, _nx, _ny, nz) => {
    if (nz > 0.5 && Math.abs(Math.abs(y) - 4.45) < 0.12 && x < -3.5) return trim;
    const le = 1.6 - ((Math.abs(y) - 0.6) * 5.0) / 4.0;
    if (nz > 0.5 && Math.abs(x - (le - 1.25)) < 0.025 && Math.abs(y) > 1) return seam;
    return skin(x, y);
  };
  const wing = m.part(wingPaint);
  m.slab(wing, [[-3.4, -4.6], [1.6, -0.6], [1.6, 0.6], [-3.4, 4.6], [-5.0, 4.6], [-3.8, 0.6], [-3.8, -0.6], [-5.0, -4.6]], 1.38, 1.6, { bevel: 0.08 });
  const tail = m.part((x, y) => skin(x, y));
  m.slab(tail, [[-6.8, -2.4], [-5.6, -0.6], [-5.6, 0.6], [-6.8, 2.4], [-7.9, 2.4], [-7.4, 0.6], [-7.4, -0.6], [-7.9, -2.4]], 1.32, 1.48, { bevel: 0.06 });
  // Twin fins, canted out, with the squadron band at the top.
  const finPaint: Paint = (x, y, z) => (z > 3.25 ? trim : skin(x, y + z));
  const fin = m.part(finPaint);
  for (const s of [-1, 1]) m.slab(fin, [[-4.3, 1.95], [-5.95, 3.7], [-6.65, 3.7], [-6.8, 1.95]], -0.1, 0.1, { bevel: 0.05, xf: chain(([x, y, z]) => [x, z, y - 1.95] as [number, number, number], rotX(s * 0.24), move(0, s * 0.62, 1.95)) });
  // Twin nozzles, petals and a dark throat.
  const throat = mat('#121417'), petal = mat('#5a5e64'), petalRing = mat('#3a3d42');
  const noz = m.part((x, _y, _z, nx) => (nx < -0.6 ? throat : near(x, 0.18, 0.03) ? petalRing : petal));
  for (const s of [-1, 1]) m.tube(noz, -7.35, -6.6, s * 0.36, 1.45, 0.36, { ring: 18, cap: 0.08 });
  // The canopy: a glass bubble with its bow frame.
  const frame = mat('#3a414b');
  const canopy = m.part((x) => (Math.abs(x - 2.95) < 0.06 ? frame : GLASS));
  m.blob(canopy, 3.55, 0, 1.98, 1.3, 0.38, 0.42, { rows: 12 });
  // Gear: toy wheels under the nose and the wing roots.
  const tyre = m.part('#2b2e34'), hub = m.part('#9aa2ab');
  m.wheel(tyre, hub, 4.6, 0, 0.3, 0.2);
  for (const s of [-1, 1]) m.wheel(tyre, hub, -1.6, s * 1.25, 0.36, 0.24);
  // Nav lights.
  const navR = m.part(mat('#e0443a', { gloss: true })), navG = m.part(mat('#3fcf7a', { gloss: true }));
  m.blob(navR, -4.3, -4.6, 1.55, 0.18, 0.1, 0.1);
  m.blob(navG, -4.3, 4.6, 1.55, 0.18, 0.1, 0.1);
  if (open) {
    // Up on jacks: yellow stands under the nose, the wings and the tail, a panel laid on the wing, a ladder at the cockpit.
    const jack = m.part(mat('#c9a23c')), foot = m.part(mat('#4f5560'));
    for (const [x, y, z] of [[5.2, 0, 1.0], [-2.6, -3.0, 1.38], [-2.6, 3.0, 1.38], [-6.2, 0, 1.05]] as const) {
      m.tube(jack, 0, z, 0, 0, 0.16, { ring: 12, xf: chain(rotY(-Math.PI / 2), move(x, y, 0)) });
      for (const a of [0.5, 2.6, 4.7]) m.box(foot, 0, -0.06, 0, 0.7, 0.06, 0.1, 0.02, chain(rotZ(a), move(x, y, 0)));
    }
    const panel = m.part(mat(L.b));
    m.box(panel, -0.5, -0.3, 0, 0.5, 0.3, 0.05, 0.02, chain(rotZ(0.35), move(-2.0, -2.2, 1.6)));
    const ladder = m.part((x) => (near(x, 0.32, 0.06) ? mat('#9a8030') : mat('#c9a23c')));
    m.slab(ladder, [[0, -0.22], [2.1, -0.22], [2.1, 0.22], [0, 0.22]], 0, 0.06, { xf: chain(rotY(-0.75), move(3.4, 1.95, 0)) });
    // REMOVE BEFORE FLIGHT streamers on the intakes and the pitot.
    const tag = m.part(mat('#d9341f'));
    for (const s of [-1, 1]) m.box(tag, 3.1, s * 1.05 - 0.05, 1.0, 3.5, s * 1.05 + 0.05, 1.35, 0.01);
    m.box(tag, 6.9, -0.05, 1.05, 7.3, 0.05, 1.35, 0.01);
  }
  m.decals(-8, -5, 7.5, 5, 48, [wing, fus], (g) => {
    roundel(g, -2.7, -2.9, 0.5);
    roundel(g, -2.7, 2.9, 0.5);
    stencil(g, L.code, -3.4, 0, 0.4, BONE, 0, 0.08);
  });
  return m;
}

/* -- helicopter ------------------------------------------------------------------------------------------------------------- */

type HeliLivery = { body: string; nose: string; band: string; code: string };
const HELI_LIVERIES: Record<string, HeliLivery> = {
  olive: { body: '#6c7356', nose: '#5c6349', band: '#c9a23c', code: '0-17349' },
  grey: { body: '#7d8794', nose: '#69737f', band: '#e0752a', code: '1-20811' },
};

export function heli(livery = 'olive', variant = 'doorsOpen'): Model {
  const L = HELI_LIVERIES[livery] ?? HELI_LIVERIES.olive!;
  const m = new Model();
  m.top = 2.35;
  const body = mat(L.body), seam = mat(darker(L.body, 0.24)), cavity = mat('#1d2128'), seat = mat('#4f5560'), deck = mat(darker(L.body, 0.1)), band = mat(L.band);
  const doors = variant !== 'closed';
  // The cabin: a rounded pod with the greenhouse nose and the cargo doors.
  const cabPaint: Paint = (x, y, z, nx, ny, nz) => {
    // Nose glazing: chin windows and the big windscreen, split by a centre post.
    if (x > 1.7 && z > 0.85 && (nx > 0.15 || nz > 0.25) && x + z * 0.4 > 2.45) return Math.abs(y) < 0.05 || (Math.abs(x - 2.55) < 0.05 && z > 1.5) ? seam : GLASS;
    if (doors && (ny > 0.45 || ny < -0.45) && x > -1.3 && x < 0.9 && z > 0.65 && z < 1.95) return x > 0.5 && x < 0.62 && z > 1.0 ? seat : cavity;
    if (!doors && (ny > 0.45 || ny < -0.45) && x > -1.3 && x < 0.9 && z > 0.65 && z < 1.95 && (x < -1.24 || x > 0.84 || z < 0.71 || z > 1.89)) return seam;
    if (nz > 0.8 && x > -0.5 && x < 0.1 && Math.abs(y) < 0.9) return band;
    if (near(x, 1.0, 0.025) && x < 1.6) return seam;
    void nx;
    return body;
  };
  const cab = m.part(cabPaint);
  m.loft(cab, [
    { x: 3.35, w: 0, h: 0, z: 1.2 }, { x: 3.25, w: 0.6, h: 0.55, z: 1.2 }, { x: 2.8, w: 1.0, h: 0.85, z: 1.3, n: 2.2 }, { x: 1.8, w: 1.15, h: 0.98, z: 1.35, n: 2.6 },
    { x: -0.5, w: 1.15, h: 1.0, z: 1.35, n: 2.8 }, { x: -1.9, w: 1.05, h: 0.9, z: 1.42, n: 2.6 }, { x: -2.6, w: 0.62, h: 0.62, z: 1.62 }, { x: -2.75, w: 0, h: 0, z: 1.7 },
  ], { ring: 28, sub: 3 });
  // Engine deck and cowling over the cabin, the exhaust, the mast and hub.
  const cowl = m.part((x, _y, _z, _nx, _ny, nz) => (nz > 0.85 && near(x, 0.6, 0.03) ? seam : deck));
  m.loft(cowl, [
    { x: 1.35, w: 0, h: 0, z: 2.2 }, { x: 1.2, w: 0.42, h: 0.28, z: 2.25, n: 3 }, { x: 0.4, w: 0.58, h: 0.38, z: 2.3, n: 3 }, { x: -1.6, w: 0.55, h: 0.36, z: 2.3, n: 3 },
    { x: -2.2, w: 0.3, h: 0.25, z: 2.25, n: 3 }, { x: -2.35, w: 0, h: 0, z: 2.2 },
  ], { ring: 20 });
  const exhaust = m.part((_x, _y, _z, nx) => (nx < -0.6 ? cavity : mat('#3d4450')));
  m.tube(exhaust, -2.5, -1.9, 0, 2.38, 0.22, { ring: 14 });
  const mast = m.part(mat('#3d4450', { gloss: true }));
  m.tube(mast, 2.35, 3.05, 0, 0, 0.12, { ring: 10, xf: chain(rotY(-Math.PI / 2), move(0.4, 0, 0)) });
  m.blob(mast, 0.4, 0, 3.08, 0.3, 0.3, 0.14);
  // The tail boom, its stabiliser, the fin and the tail rotor's gearbox.
  const boom = m.part((x, _y, _z, _nx, _ny, nz) => (nz > 0.6 && x < -6.6 && x > -7.0 ? band : near(x, 1.4, 0.025) ? seam : body));
  m.loft(boom, [
    { x: -1.2, w: 0.5, h: 0.62, z: 1.85 }, { x: -2.4, w: 0.4, h: 0.45, z: 2.0 }, { x: -5.0, w: 0.3, h: 0.32, z: 2.15 }, { x: -7.6, w: 0.24, h: 0.26, z: 2.25 }, { x: -7.92, w: 0.15, h: 0.2, z: 2.3 }, { x: -8.0, w: 0, h: 0, z: 2.3 },
  ], { ring: 18 });
  const stab = m.part(body);
  m.slab(stab, [[-5.1, -1.1], [-4.7, -0.2], [-4.7, 0.2], [-5.1, 1.1], [-5.6, 1.1], [-5.6, -1.1]], 2.05, 2.18, { bevel: 0.04 });
  const fin = m.part((_x, _y, z) => (z > 3.25 ? band : body));
  m.slab(fin, [[-7.2, 2.2], [-7.75, 3.45], [-8.2, 3.45], [-8.1, 2.2]], -0.09, 0.09, { bevel: 0.04, xf: ([x, y, z]) => [x, z, y] });
  const gear = m.part(mat('#3d4450'));
  m.blob(gear, -7.95, 0.12, 3.0, 0.16, 0.12, 0.16);
  // Skids on their cross tubes.
  const skid = m.part(mat('#4a515c'));
  for (const s of [-1, 1]) {
    m.loft(skid, [{ x: 2.45, w: 0, h: 0, y: s * 1.42, z: 0.32 }, { x: 2.35, w: 0.09, h: 0.09, y: s * 1.42, z: 0.22 }, { x: 2.0, w: 0.1, h: 0.1, y: s * 1.42, z: 0.12 }, { x: -1.9, w: 0.1, h: 0.1, y: s * 1.42, z: 0.12 }, { x: -2.0, w: 0, h: 0, y: s * 1.42, z: 0.12 }], { ring: 10, sub: 2 });
  }
  for (const x of [1.2, -1.2]) m.tube(skid, -1.42, 1.42, 0, 0, 0.08, { ring: 10, xf: chain(rotZ(Math.PI / 2), move(x, 0, 0.55)) });
  // Rotors: the main one turns over the players, the tail one at the fin.
  m.spinners.push({ at: [0.4, 0, 3.25], axis: [0, 0, 1], r: 7.2, blades: 2, rps: 0.35, over: true });
  m.spinners.push({ at: [-7.95, 0.3, 3.0], axis: [0, 1, 0], r: 0.85, blades: 2, rps: 1.5 });
  const beacon = m.part(mat('#d33a2c', { gloss: true }));
  m.blob(beacon, -3.2, 0, 2.3, 0.12, 0.12, 0.1);
  m.lights.push({ key: 'beacon', at: [-3.2, 0, 2.4], color: '#ff4a40', radius: 120, intensity: 0.55, blinkMs: 1500, size: 5 });
  m.decals(-8.2, -1.6, 3.4, 1.6, 48, [cab, boom], (g) => {
    stencil(g, 'ARMY', -4.4, 0, 0.42, BONE, 0, 0.1);
    stencil(g, L.code, -6.0, 0, 0.3, BONE, 0, 0.06);
  });
  m.sideDecals(-8.2, 1.0, 3.4, 3.5, 48, [boom, fin], (g) => {
    stencil(g, 'ARMY', -4.3, -2.1, 0.42, BONE, 0, 0.1);
  });
  return m;
}

export type { Mat };
