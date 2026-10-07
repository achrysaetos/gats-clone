/**
 * Boats for the vehicle kit: the harbour tug (shapes.ts `boat`), a trawler, a patrol boat, a feeder container ship and the
 * submarine. Hulls are cut at the waterline (z = 0) so they sit in water; everything above is a chunky toy: a round gunwale,
 * tyre fenders, a wheelhouse with big windows, a funnel with its band. Nose toward +x.
 */
import { Model, chain, mat, move, rotX, rotY, rotZ, type Mat, type Paint, type Station } from './vehiclemesh.ts';
import { KESTREL, PATROL, TRAWLER } from '../shared/maps/causewaygeo.ts';
import type { ShipSpec } from '../shared/maps/causewayship.ts';

const GLASS = mat('#1e2a3a', { gloss: true });
const FONT = (px: number) => `700 ${px}px "Barlow Condensed", "Arial Narrow", sans-serif`;
const hex = (h: string) => { const n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
const darker = (h: string, k: number) => `#${hex(h).map((v) => Math.round(v * (1 - k)).toString(16).padStart(2, '0')).join('')}`;
const near = (v: number, step: number, w: number) => { const r = ((v % step) + step) % step; return r < w || r > step - w; };

function stencil(g: CanvasRenderingContext2D, s: string, x: number, y: number, size: number, color: string, rot = 0, spacing = 0.08) {
  g.save(); g.translate(x, y); g.rotate(rot);
  g.font = FONT(100); g.textAlign = 'center'; g.textBaseline = 'middle';
  g.scale(size / 100, size / 100);
  (g as unknown as { letterSpacing: string }).letterSpacing = `${spacing * 100}px`;
  g.fillStyle = color; g.fillText(s, 0, 0);
  g.restore();
}

type HullLook = { hull: string; boot: string; cap: string; deck: string; plank?: boolean };

/**
 * A hull from its half-beam at stations along x (stern first): a round-shouldered tub whose flat top is the deck, cut at the
 * waterline. The gunwale's rounded shoulder takes the cap colour, the deck its planking.
 */
function hull(m: Model, plan: readonly (readonly [number, number])[], free: number, L: HullLook, deckPaint?: (x: number, y: number) => Mat | null): number {
  const hullC = mat(L.hull), boot = mat(L.boot), cap = mat(L.cap), deck = mat(L.deck), plank = mat(darker(L.deck, 0.18));
  const paint: Paint = (x, y, z, _nx, _ny, nz) => {
    if (nz > 0.93) { const d = deckPaint?.(x, y); if (d) return d; return L.plank && near(y, 0.32, 0.025) ? plank : deck; }
    if (nz > 0.62) return cap;
    return z < 0.28 ? boot : hullC;
  };
  const p = m.part(paint, { clipLow: 0 });
  const st: Station[] = plan.map(([x, w]) => ({ x, w, h: free, z: 0, n: 6 }));
  m.loft(p, [{ ...st[0]!, w: 0, h: 0 }, ...st, { ...st[st.length - 1]!, w: 0, h: 0 }], { ring: 32, sub: 3 });
  return p;
}

/** Old tyres hung as fenders along both sides. */
function fenders(m: Model, xs: readonly number[], halfBeam: (x: number) => number, z: number) {
  const tyre = m.part('#26292e');
  for (const x of xs) for (const s of [-1, 1]) m.tube(tyre, -0.14, 0.14, 0, 0, 0.3, { ring: 14, cap: 0.08, xf: chain(rotZ(Math.PI / 2), move(x, s * (halfBeam(x) + 0.06), z)) });
}

/** A lifebuoy: an orange-and-white ring standing on a rail. */
function buoy(m: Model, x: number, y: number, z: number) {
  const p = m.part((_x, yy, zz) => (Math.atan2(zz - z, yy - y) * 2 / Math.PI + 4) % 1 < 0.5 ? mat('#e8e2d0') : mat('#d9541f'));
  m.loft(p, [{ x: x - 0.06, w: 0.28, h: 0.28, y, z }, { x: x + 0.06, w: 0.28, h: 0.28, y, z }], { ring: 16, sub: 1 });
}

/** A wheelhouse: a white box with a band of windows all round and a grey roof with a lip. */
function house(m: Model, x0: number, x1: number, w: number, z0: number, z1: number, colour = '#e2dccb', roof = '#b9b4a6') {
  const c = mat(colour), r = mat(roof);
  const p = m.part((x, y, z, nx, ny, nz) => {
    if (nz > 0.8) return r;
    if (z > z1 - 0.75 && z < z1 - 0.2 && (Math.abs(nx) > 0.5 || Math.abs(ny) > 0.5) && !near(x - x0, 0.7, 0.06) && Math.abs(y) > 0.05) return GLASS;
    return c;
  });
  m.box(p, x0, -w, z0, x1, w, z1, 0.14);
  const lip = m.part(r);
  m.box(lip, x0 - 0.12, -w - 0.12, z1, x1 + 0.12, w + 0.12, z1 + 0.12, 0.04);
  // Roof clutter: a life-raft canister, a vent, a searchlight.
  const raft = m.part((x) => (near(x, 0.25, 0.03) ? mat('#3d4450') : mat('#e2dccb')));
  m.tube(raft, x0 + 0.3, x0 + 1.1, -w * 0.55, z1 + 0.32, 0.22, { ring: 12 });
  const vent = m.part(mat('#5a6068'));
  m.box(vent, x1 - 0.7, w * 0.25, z1 + 0.12, x1 - 0.3, w * 0.65, z1 + 0.36, 0.05);
  const lamp = m.part(mat('#4f5560', { gloss: true }));
  m.blob(lamp, x1 - 0.35, -w * 0.5, z1 + 0.28, 0.16, 0.16, 0.14, { rows: 6 });
  return p;
}

function funnel(m: Model, x: number, z0: number, z1: number, rx: number, body: string, band: string) {
  const top = mat('#1f2226'), b = mat(band), c = mat(body);
  const p = m.part((_x, _y, z) => (z > z1 - 0.3 ? top : Math.abs(z - (z1 - 0.75)) < 0.18 ? b : c));
  m.tube(p, z0, z1, 0, 0, rx, { rz: rx * 0.7, ring: 18, xf: chain(rotY(-Math.PI / 2), move(x, 0, 0)) });
}

/** A mast with a crossbar and its lamps. */
function mast(m: Model, x: number, z0: number, z1: number, lights: boolean) {
  const p = m.part('#3d4450');
  m.tube(p, z0, z1, 0, 0, 0.07, { ring: 8, xf: chain(rotY(-Math.PI / 2), move(x, 0, 0)) });
  m.tube(p, -0.7, 0.7, 0, 0, 0.05, { ring: 6, xf: chain(rotZ(Math.PI / 2), move(x, 0, z1 - 0.5)) });
  if (lights) {
    const r = m.part(mat('#e0443a', { gloss: true })), g = m.part(mat('#3fcf7a', { gloss: true })), w = m.part(mat('#ffe8b0', { gloss: true }));
    m.blob(r, x, -0.7, z1 - 0.45, 0.1, 0.1, 0.1); m.blob(g, x, 0.7, z1 - 0.45, 0.1, 0.1, 0.1); m.blob(w, x, 0, z1 + 0.08, 0.1, 0.1, 0.1);
    m.lights.push({ key: 'mast', at: [x, 0, z1 + 0.1], color: '#ffe8b0', radius: 140, intensity: 0.45, size: 4 });
  }
}

const lerpPlan = (plan: readonly (readonly [number, number])[]) => (x: number) => {
  for (let i = 0; i < plan.length - 1; i++) { const [a, wa] = plan[i]!, [b, wb] = plan[i + 1]!; if (x >= a && x <= b) return wa + ((wb - wa) * (x - a)) / (b - a); }
  return 0;
};

/* -- deck-open hulls for the Causeway harbour ----------------------------------------------------------------------------- */

/** The harbour's liveries, matching its deck and gangway art (themes/harborships.ts). */
const DECK_LOOKS: Record<string, { hull: string; cap: string; boot: string; name: string }> = {
  'containerShip|blue': { hull: '#2c3e57', cap: '#cfcbbb', boot: '#a8442e', name: 'K-1' },
  'containerShip|green': { hull: '#24402f', cap: '#d8d2b8', boot: '#b58e32', name: 'H-4' },
  'trawler|white': { hull: '#d6dad3', cap: '#c04a30', boot: '#2f5f8c', name: 'ME 2' },
  'trawler|blue': { hull: '#2a4f78', cap: '#e0d6b0', boot: '#c04a30', name: 'SB 5' },
  'patrolBoat|grey': { hull: '#6d7d84', cap: '#aab4b8', boot: '#3a464c', name: 'PB-17' },
  'patrolBoat|green': { hull: '#5a6a58', cap: '#a8b0a0', boot: '#2e3a30', name: 'PB-22' },
};

/**
 * A berthed ship's hull with its deck left open (the `deck` variant): exactly the outline `ship()` gives the harbour (bow +x, the
 * quay on +y), from the waterline to the gunwale, its round-shouldered rail, the boot-topping at the waterline, tyres against the
 * quay, a hawse pipe and the hull number on the bow. The deck inside the gunwale band is cut away, so the theme's own deck,
 * fittings and rooms show through.
 */
function deckHull(kind: string, spec: ShipSpec, livery: string, free: number, number?: string): Model {
  const L = DECK_LOOKS[`${kind}|${livery}`] ?? Object.entries(DECK_LOOKS).find(([k]) => k.startsWith(kind))![1];
  const m = new Model();
  m.top = free;
  const P = 64, len = spec.length / P, beam = spec.beam / P, bow = spec.bow / P, stern = spec.stern / P, wall = spec.wall / P;
  // Half beam at a distance u (metres) from the bow tip: the same profile ship() builds the outline from.
  const half = (u: number) => {
    if (u <= bow) { const t = Math.max(0, u / bow); return (beam * (1 - (1 - t) ** 2)) / 2; }
    if (u >= len - stern) { const t = Math.min(1, (u - (len - stern)) / stern); return (beam * (1 - (1 - spec.transom) * t ** 1.7)) / 2; }
    return beam / 2;
  };
  const xOf = (u: number) => len / 2 - u, uOf = (x: number) => len / 2 - x;
  const hull = mat(L.hull), cap = mat(L.cap), boot = mat(L.boot), hawse = mat('#1c1f26'), line = mat('#e2dccb');
  const bowX = xOf(bow * 0.45);
  const paint: Paint = (x, y, z, _nx, ny, nz) => {
    if (nz > 0.45) return cap;
    if (z < 0.24) return boot;
    if (z < 0.3) return line;
    if ((ny > 0.3 || ny < -0.3) && Math.hypot(x - bowX, z - free * 0.62) < 0.2) return hawse;
    return hull;
  };
  const p = m.part(paint, {
    clipLow: 0, open: true,
    cut: (x, y, z) => z > free - 0.1 && x > -len / 2 + wall && Math.abs(y) < half(uOf(x)) - wall,
  });
  const st: Station[] = [];
  const us: number[] = [len];
  for (let k = 1; k <= 3; k++) us.push(len - (stern * k) / 3);
  for (let k = 1; k <= 3; k++) us.push(len - stern - ((len - stern - bow) * k) / 4);
  for (let k = 0; k <= 8; k++) us.push(bow * (1 - k / 8));
  for (const u of us) st.push({ x: xOf(u), w: Math.max(0.001, half(u)), h: free, z: 0, n: 7 });
  m.loft(p, [{ ...st[0]!, w: 0, h: 0 }, ...st.slice(0, -1), { ...st[st.length - 1]!, w: 0, h: 0 }], { ring: 36, sub: 2 });
  // Old tyres hung against the quay.
  const tyre = m.part('#26292e');
  for (let k = 1; k <= 4; k++) {
    const u = bow + ((len - stern - bow) * k) / 5;
    m.tube(tyre, -0.16, 0.16, 0, 0, 0.32, { ring: 14, cap: 0.08, xf: chain(rotZ(Math.PI / 2), move(xOf(u), half(u) + 0.1, free * 0.55)) });
  }
  const label = number ?? L.name;
  m.sideDecals(xOf(bow * 1.6), 0, xOf(0) + 0.2, free + 0.2, 48, [p], (g) => stencil(g, label, xOf(bow * 0.85), -free * 0.6, Math.min(0.75, free * 0.45), '#e2dccb', 0, 0.1));
  return m;
}

/* -- the tug: shapes.ts `boat`, 12 x 4 m ------------------------------------------------------------------------------- */

export function tugboat(livery = 'black'): Model {
  const L: HullLook = livery === 'red' ? { hull: '#8a2e22', boot: '#2b2e34', cap: '#e2dccb', deck: '#6b6a5e' } : { hull: '#2a2d33', boot: '#a8442e', cap: '#e2dccb', deck: '#7a6a52', plank: true };
  const m = new Model();
  m.top = 1.25;
  const plan = [[-6, 1.7], [-5.6, 1.9], [-3, 2.0], [1.5, 2.0], [3.2, 1.85], [4.6, 1.3], [5.6, 0.55], [6, 0.12]] as const;
  hull(m, plan, 1.25, L);
  fenders(m, [-4.6, -3.2, -1.8, -0.4, 1.0, 2.4], lerpPlan(plan), 0.85);
  // The bow's rope pudding.
  const pud = m.part('#4a3a2a');
  m.blob(pud, 5.95, 0, 0.95, 0.35, 0.5, 0.32);
  house(m, -3.2, -0.4, 1.2, 1.2, 3.1);
  funnel(m, -4.3, 1.2, 3.3, 0.55, '#c9a23c', '#b4524a');
  mast(m, -1.0, 3.2, 4.6, true);
  // Bitts and the towing hook on the after deck, a hatch forward.
  const bitt = m.part('#2b2e34');
  for (const s of [-1, 1]) m.tube(bitt, 1.2, 1.7, 0, 0, 0.14, { ring: 10, xf: chain(rotY(-Math.PI / 2), move(-5.3, s * 0.9, 0)) });
  m.box(bitt, -5.1, -0.15, 1.2, -4.8, 0.15, 1.75, 0.04);
  const hatch = m.part((x) => (near(x, 0.25, 0.03) ? mat('#3d4450') : mat('#5a6068')));
  m.box(hatch, 1.6, -0.7, 1.2, 3.0, 0.7, 1.45, 0.06);
  buoy(m, -3.25, 0.65, 2.2);
  return m;
}

/* -- trawler, 18 x 5.4 m ------------------------------------------------------------------------------------------------ */

export function trawler(livery = 'blue', variant?: string, number?: string): Model {
  if (variant === 'deck') return deckHull('trawler', TRAWLER.spec, livery, 1.15, number);
  const L: HullLook = livery === 'white' ? { hull: '#d6dad3', boot: '#c04a30', cap: '#2f5f8c', deck: '#7a6a52', plank: true } : { hull: '#2f5f8c', boot: '#c04a30', cap: '#e2dccb', deck: '#7a6a52', plank: true };
  const m = new Model();
  m.top = 1.5;
  const plan = [[-9, 2.3], [-8.4, 2.6], [-4, 2.7], [3, 2.7], [5.5, 2.3], [7.6, 1.4], [8.8, 0.4], [9, 0.1]] as const;
  hull(m, plan, 1.5, L);
  fenders(m, [-6, -3, 0, 3], lerpPlan(plan), 1.0);
  house(m, 2.4, 5.6, 1.5, 1.45, 3.6);
  mast(m, 4.0, 3.7, 6.2, true);
  // The gantry over the stern, the net drum, floats and fish boxes.
  const gantry = m.part('#d9772e');
  for (const s of [-1, 1]) m.tube(gantry, 1.4, 4.4, 0, 0, 0.13, { ring: 10, xf: chain(rotY(-Math.PI / 2 + 0.18), move(-7.9, s * 2.2, 0)) });
  m.tube(gantry, -2.3, 2.3, 0, 0, 0.14, { ring: 10, xf: chain(rotZ(Math.PI / 2), move(-7.1, 0, 4.4)) });
  const drum = m.part((x, y) => (near(y + x * 0.2, 0.16, 0.04) ? mat('#3f5a40') : mat('#5d7a52')));
  m.tube(drum, -1.6, 1.6, 0, 0, 0.6, { ring: 18, xf: chain(rotZ(Math.PI / 2), move(-5.6, 0, 2.15)) });
  const floatP = m.part(mat('#e8742e', { gloss: true }));
  for (let i = 0; i < 6; i++) m.blob(floatP, -7.6 + (i % 3) * 0.5, -1.7 + Math.floor(i / 3) * 0.55, 1.75, 0.26, 0.26, 0.24, { rows: 6 });
  const boxes = ['#4f7fbf', '#d9541f', '#4f7fbf', '#c9a23c'];
  boxes.forEach((c, i) => { const p = m.part(c); m.box(p, -2.6 + (i % 2) * 0.9, 0.6 + Math.floor(i / 2) * 0.75, 1.5, -1.8 + (i % 2) * 0.9, 1.25 + Math.floor(i / 2) * 0.75, 1.95 - (i === 3 ? 0.0 : 0.0), 0.05); });
  buoy(m, 2.35, -0.9, 2.5);
  return m;
}

/* -- patrol boat, 15 x 4 m ------------------------------------------------------------------------------------------------ */

export function patrolBoat(livery = 'grey', variant?: string, number?: string): Model {
  if (variant === 'deck') return deckHull('patrolBoat', PATROL.spec, livery, 1.0, number);
  const L: HullLook = livery === 'green' ? { hull: '#5a6a58', boot: '#2e3a30', cap: '#a8b0a0', deck: '#4c5a4a' } : { hull: '#6d7d84', boot: '#3a464c', cap: '#aab4b8', deck: '#55605f' };
  const m = new Model();
  m.top = 1.35;
  const plan = [[-7.5, 1.8], [-7.1, 1.95], [-2, 2.0], [2.5, 1.9], [4.8, 1.4], [6.8, 0.6], [7.5, 0.1]] as const;
  const h = hull(m, plan, 1.35, L, (x, y) => (Math.abs(y) < 0.04 && x > 3 ? mat('#e2dccb') : null));
  void h;
  // Superstructure, the radar mast, the gun mount forward.
  house(m, -2.4, 1.2, 1.25, 1.3, 3.2, darker(L.cap, 0.04), darker(L.hull, 0.2));
  const radar = m.part(mat('#3d4450'));
  m.tube(radar, 3.25, 4.6, 0, 0, 0.09, { ring: 8, xf: chain(rotY(-Math.PI / 2), move(-1.2, 0, 0)) });
  m.box(radar, -1.45, -0.85, 4.45, -0.95, 0.85, 4.6, 0.03);
  const mount = m.part(mat(darker(L.hull, 0.1)));
  m.tube(mount, 1.3, 1.8, 0, 0, 0.62, { ring: 18, xf: chain(rotY(-Math.PI / 2), move(3.6, 0, 0)) });
  const gun = m.part(mat('#3d4450', { gloss: true }));
  m.blob(gun, 3.6, 0, 1.95, 0.5, 0.45, 0.3);
  m.tube(gun, 3.9, 5.7, 0, 2.0, 0.09, { ring: 8 });
  const rail = m.part('#aab4b8');
  for (const s of [-1, 1]) m.tube(rail, -6.8, 4.6, s * 1.75, 1.75, 0.04, { ring: 6 });
  m.lights.push({ key: 'nav', at: [-1.2, 0, 4.7], color: '#ff4a40', radius: 120, intensity: 0.45, blinkMs: 1500, size: 4 });
  const blink = m.part(mat('#e0443a', { gloss: true }));
  m.blob(blink, -1.2, 0, 4.68, 0.1, 0.1, 0.1);
  m.decals(-7.6, -2.1, 7.6, 2.1, 48, [0], (g) => { stencil(g, number ?? (livery === 'green' ? 'PB-22' : 'PB-17'), 5.4, 0, 0.55, '#e2dccb', -Math.PI / 2, 0.1); });
  return m;
}

/* -- feeder container ship, 32 x 9.6 m ----------------------------------------------------------------------------------- */

export function containerShip(livery = 'blue', variant?: string, number?: string): Model {
  if (variant === 'deck') return deckHull('containerShip', KESTREL.spec, livery, 1.5, number);
  const L: HullLook = livery === 'green' ? { hull: '#24402f', boot: '#a8442e', cap: '#d8d2b8', deck: '#5f6a5a' } : { hull: '#2c3e57', boot: '#a8442e', cap: '#cfcbbb', deck: '#6b6a5e' };
  const m = new Model();
  m.top = 2.2;
  const plan = [[-16, 4.3], [-15.2, 4.7], [-8, 4.8], [8, 4.8], [11, 4.2], [14.2, 2.4], [15.8, 0.6], [16, 0.1]] as const;
  hull(m, plan, 2.2, L);
  // Containers: rows of boxes in faded company colours, ribbed, two tiers.
  const cols = ['#a8442e', '#4f7fbf', '#c9a23c', '#5d7a52', '#8a8f98', '#b4524a', '#4a6a8a', '#d9772e'];
  let k = 0;
  for (let bay = 0; bay < 6; bay++) for (let row = 0; row < 3; row++) for (let tier = 0; tier < (bay % 3 === 1 && row === 1 ? 1 : 2); tier++) {
    const x0 = -6.6 + bay * 2.75, y0 = -3.9 + row * 2.6;
    const c = cols[(k++ * 5 + bay * 3 + row) % cols.length]!;
    const p = m.part((x, y, _z, _nx, ny, nz) => (nz > 0.8 ? (near(x, 0.5, 0.05) ? mat(darker(c, 0.2)) : mat(c)) : (ny > 0.5 || ny < -0.5) && near(x, 0.22, 0.04) ? mat(darker(c, 0.25)) : mat(c)), { group: m.group() });
    m.box(p, x0, y0, 2.2 + tier * 1.3, x0 + 2.6, y0 + 2.45, 3.45 + tier * 1.3, 0.06);
    void y0;
  }
  // The bridge aft: white decks stepping up, the wheelhouse on top with its wings.
  const deckC = mat('#d8d2c2'), deckRoof = mat('#b9b4a6');
  const tier = m.part((x, _y, z, nx, ny, nz) => (nz > 0.8 ? deckRoof : z > 2.6 && (Math.abs(nx) > 0.5 || Math.abs(ny) > 0.5) && near(z - 2.2, 1.35, 0.3) && near(x, 0.8, 0.28) ? GLASS : deckC));
  m.box(tier, -15.0, -4.0, 2.2, -10.0, 4.0, 4.9, 0.12);
  m.box(tier, -14.4, -3.4, 4.9, -10.4, 3.4, 6.25, 0.1);
  house(m, -13.6, -10.6, 2.6, 6.25, 7.6, '#e2dccb', '#b9b4a6');
  const wing = m.part('#cfc7b3');
  m.box(wing, -11.4, -4.6, 6.9, -10.6, 4.6, 7.2, 0.05);
  funnel(m, -14.4, 6.0, 9.0, 1.0, '#b4524a', '#e2dccb');
  mast(m, -11.5, 7.7, 10.0, true);
  const crane = m.part('#c9a23c');
  m.tube(crane, 2.2, 6.4, 0, 0, 0.22, { ring: 10, xf: chain(rotY(-Math.PI / 2), move(10.6, 0, 0)) });
  m.tube(crane, 0, 6.0, 0, 0, 0.14, { ring: 8, xf: chain(rotY(-0.45), move(10.6, 0, 6.2)) });
  m.decals(-16, -5, 16, 5, 32, [0], (g) => { stencil(g, livery === 'green' ? 'HALCYON' : 'KESTREL', 13.0, 0, 1.0, '#e2dccb', -Math.PI / 2, 0.12); });
  return m;
}

/* -- submarine, 30 x 4.4 m ------------------------------------------------------------------------------------------------- */

export function submarine(livery = 'black', _variant?: string, number?: string): Model {
  const col = livery === 'grey' ? '#4f5866' : '#2a2e34';
  const m = new Model();
  m.top = 2.1;
  const c = mat(col), seam = mat(darker(col, 0.3)), deck = mat('#3a3f47'), red = mat('#7a2e2a');
  const hullPaint: Paint = (x, y, z, _nx, _ny, nz) => {
    if (nz > 0.9 && Math.abs(y) < 0.75 && x > -11 && x < 11) return near(x, 0.6, 0.04) ? seam : deck;
    if (z < 0.12) return red;
    if (near(x, 2.4, 0.03)) return seam;
    return c;
  };
  const h = m.part(hullPaint, { clipLow: 0 });
  m.loft(h, [
    { x: -15, w: 0, h: 0, z: -0.4 }, { x: -14.2, w: 0.7, h: 0.9, z: -0.3 }, { x: -11, w: 1.8, h: 2.0, z: -0.15, n: 2.3 }, { x: -4, w: 2.2, h: 2.25, z: -0.15, n: 2.4 },
    { x: 8, w: 2.2, h: 2.25, z: -0.15, n: 2.4 }, { x: 12.5, w: 1.75, h: 1.9, z: -0.2 }, { x: 14.6, w: 0.9, h: 1.1, z: -0.3 }, { x: 15, w: 0, h: 0, z: -0.4 },
  ], { ring: 30, sub: 3 });
  // The sail with its planes, the periscopes and the hull number.
  const sail = m.part((x, _y, z) => (z > 4.55 ? mat(darker(col, 0.15)) : near(x, 0.9, 0.025) ? seam : c));
  m.slab(sail, [[2.2, -0.55], [5.6, -0.6], [6.4, -0.3], [6.5, 0], [6.4, 0.3], [5.6, 0.6], [2.2, 0.55], [1.8, 0]], 1.9, 4.6, { bevel: 0.14 });
  const planes = m.part(c);
  m.slab(planes, [[4.5, -1.7], [5.3, -1.7], [5.5, 1.7], [4.5, 1.7]], 3.55, 3.7, { bevel: 0.04 });
  const scope = m.part(mat('#4f5560', { gloss: true }));
  for (const [x, hh] of [[3.6, 5.6], [4.4, 5.2]] as const) m.tube(scope, 4.6, hh, 0, 0, 0.09, { ring: 8, xf: chain(rotY(-Math.PI / 2), move(x, 0, 0)) });
  // The rudder fin standing up at the stern, and the stern planes.
  const fin = m.part(c);
  m.slab(fin, [[-14.6, 0.8], [-13.2, 0.8], [-13.8, 2.9], [-14.7, 2.9]], -0.12, 0.12, { bevel: 0.05, xf: ([x, y, z]) => [x, z, y] });
  m.slab(fin, [[-14.6, -2.2], [-13.4, -1.0], [-13.4, 1.0], [-14.6, 2.2], [-15.0, 2.2], [-15.0, -2.2]], 0.55, 0.7, { bevel: 0.04 });
  const hatch = m.part(mat('#4f5560', { gloss: true }));
  for (const x of [-8, 9.5]) m.tube(hatch, 2.15, 2.25, 0, 0, 0.36, { ring: 14, xf: chain(rotY(-Math.PI / 2), move(x, 0, 0)) });
  m.sideDecals(1.5, 1.8, 6.6, 4.8, 48, [sail], (g) => { stencil(g, number ?? (livery === 'grey' ? 'S-12' : 'S-07'), 4.2, -3.4, 0.7, '#e2dccb', 0, 0.12); });
  // The number again, big on the casing forward of the sail, to read from above.
  m.decals(5.5, -1, 9, 1, 48, [h], (g) => stencil(g, number ?? (livery === 'grey' ? '12' : '07'), 7.4, 0, 0.9, 'rgba(226,220,203,0.85)', Math.PI / 2, 0.1));
  m.lights.push({ key: 'sail', at: [4.2, 0, 4.7], color: '#ff4a40', radius: 120, intensity: 0.4, blinkMs: 1600, size: 4 });
  void rotX;
  return m;
}
