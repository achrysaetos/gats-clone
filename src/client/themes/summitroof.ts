import type { MapRoof, Pt } from '../../shared/geom.ts';
import { INK } from '../palette.ts';
import { C, SIZE, TAU, baseId, ell, hash, hexA, isTwin, mix, shade as shadeRgb, type G } from './summitkit.ts';

/** `shade`, but returning '#rrggbb' so the result can be shaded again. */
const shade = (hex: string, k: number): string => {
  const v = parseInt(hex.slice(1), 16);
  const f = (c: number) => Math.max(0, Math.min(255, Math.round(k >= 0 ? c + (255 - c) * k : c * (1 + k)))).toString(16).padStart(2, '0');
  return `#${f((v >> 16) & 255)}${f((v >> 8) & 255)}${f(v & 255)}`;
};
void shadeRgb;

/**
 * Summit's roofs, painted as real pitched roofs rather than slabs: two slopes either side of a ridge (the slope that faces the
 * key light is the lit cel step, the far one the shade step), courses of shake or ribs of tin running down each slope, a
 * ragged blanket of snow that leaves the courses peeking through at the eaves, a snowy ridge cap, a fascia with rafter tails
 * and icicles, a chimney or a vent with its own cast shadow. Each roof is painted once into a sprite (see `cached` in
 * summitpolys.ts) and only the night tint is applied per frame.
 */

type Kind = 'shingle' | 'tin' | 'seam' | 'glass';
type Style = { kind: Kind; base: string; ridge: string };

/** What each building is roofed in, for the lodge-side half and for its half-turn twin. */
export function roofStyle(r: MapRoof): Style {
  const id = baseId(r.id), tw = isTwin(r.id);
  if (!tw) {
    if (id === 'cabin') return { kind: 'shingle', base: '#6b4a30', ridge: '#2c1c12' };
    if (id === 'lift') return { kind: 'tin', base: '#9a4a3a', ridge: '#4a1e16' };
    if (r.material === 'tin') return { kind: 'tin', base: '#7a8794', ridge: '#2f3944' };
    return { kind: 'shingle', base: '#6e4c34', ridge: '#2c1c12' };
  }
  if (id === 'lift') return { kind: 'glass', base: '#7fb0c4', ridge: '#2e4a58' };
  if (id === 'bay') return { kind: 'seam', base: '#8197ab', ridge: '#35465a' };
  if (id === 'cabin' || id === 'hut' || id === 'office') return { kind: 'tin', base: '#8a6448', ridge: '#3a261a' };
  return { kind: 'seam', base: '#5a7c6a', ridge: '#223a30' };
}

const inside = (pts: readonly Pt[], x: number, y: number): boolean => {
  let c = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const a = pts[i]!, b = pts[j]!;
    if ((a.y > y) !== (b.y > y) && x < ((b.x - a.x) * (y - a.y)) / (b.y - a.y) + a.x) c = !c;
  }
  return c;
};

type Rect = { x0: number; y0: number; x1: number; y1: number };
const boundsOf = (pts: readonly Pt[]): Rect => {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const p of pts) { x0 = Math.min(x0, p.x); y0 = Math.min(y0, p.y); x1 = Math.max(x1, p.x); y1 = Math.max(y1, p.y); }
  return { x0, y0, x1, y1 };
};

/** The rectangles a roof outline is built from: the outline itself when it is a box, the two bands of an L. */
function bandsOf(pts: readonly Pt[]): Rect[] {
  const b = boundsOf(pts);
  if (pts.length !== 6) return [b];
  const reflex = pts.find((p) => p.x > b.x0 + 1 && p.x < b.x1 - 1 && p.y > b.y0 + 1 && p.y < b.y1 - 1);
  if (!reflex) return [b];
  const span = (ya: number, yb: number): Rect => {
    const y = (ya + yb) / 2;
    let x0 = Infinity, x1 = -Infinity;
    for (let x = b.x0 + 2; x < b.x1; x += 4) if (inside(pts, x, y)) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); }
    return { x0: Math.round(x0 - 2), y0: ya, x1: Math.round(x1 + 2), y1: yb };
  };
  return [span(b.y0, reflex.y), span(reflex.y, b.y1)];
}

/** Is the edge of `r` that faces (dx, dy) on the outline, rather than a seam against the other band of the roof? */
function exposed(pts: readonly Pt[], r: Rect, dx: number, dy: number): boolean {
  const cx = (r.x0 + r.x1) / 2, cy = (r.y0 + r.y1) / 2, hw = (r.x1 - r.x0) / 2, hh = (r.y1 - r.y0) / 2;
  for (const k of [-0.7, 0, 0.7]) {
    const x = cx + dx * (hw + 5) + (dx ? 0 : k * hw), y = cy + dy * (hh + 5) + (dy ? 0 : k * hh);
    if (!inside(pts, x, y)) return true;
  }
  return false;
}

/** Shingle, rib, seam or pane texture for one slope, in the roof's local frame (ridge along x at y = 0). */
function texture(g: G, st: Style, W: number, y0: number, y1: number, eaveSide: -1 | 1, lit: boolean, seed: number) {
  const hw = W / 2, top = Math.min(y0, y1), bot = Math.max(y0, y1), len = bot - top;
  const base = lit ? shade(st.base, 0.14) : shade(st.base, -0.2);
  g.fillStyle = base; g.fillRect(-hw, top, W, len);
  if (st.kind === 'shingle') {
    const R = 19, T = 27;
    const eave = eaveSide < 0 ? top : bot;
    for (let i = 0; i * R < len; i++) {
      const ya = eaveSide < 0 ? eave + i * R : eave - (i + 1) * R, yb = ya + R;
      const off = i % 2 ? T / 2 : 0;
      for (let x = -hw - off; x < hw; x += T) {
        const k = hash(Math.round(x), Math.round(ya), seed);
        g.fillStyle = k < 0.33 ? shade(base, -0.045) : k < 0.66 ? base : shade(base, 0.05);
        g.fillRect(Math.max(-hw, x), ya, Math.min(T, hw - x), R);
        g.fillStyle = 'rgba(8, 4, 2, 0.3)'; g.fillRect(Math.max(-hw, x), ya, 2, R);
      }
      // The exposed lower edge of the course throws a shade line onto the one below it.
      g.fillStyle = 'rgba(8, 4, 2, 0.42)'; g.fillRect(-hw, eaveSide < 0 ? yb - 3 : ya, W, 3);
      g.fillStyle = lit ? 'rgba(255, 226, 190, 0.13)' : 'rgba(255, 226, 190, 0.06)'; g.fillRect(-hw, eaveSide < 0 ? ya : yb - 2, W, 2);
    }
  } else if (st.kind === 'tin') {
    const P = 18;
    for (let x = -hw, i = 0; x < hw; x += P, i++) {
      g.fillStyle = lit ? 'rgba(255, 255, 255, 0.16)' : 'rgba(255, 255, 255, 0.08)'; g.fillRect(x, top, 5, len);
      g.fillStyle = 'rgba(8, 12, 22, 0.28)'; g.fillRect(x + 11, top, 4, len);
    }
    // Overlapped sheets, with screws along each lap.
    for (let yy = eaveSide < 0 ? top + 150 : bot - 150; yy > top + 4 && yy < bot - 4; yy += eaveSide * 150) {
      g.fillStyle = 'rgba(8, 12, 22, 0.45)'; g.fillRect(-hw, yy - 1.5, W, 3);
      g.fillStyle = 'rgba(255, 255, 255, 0.14)'; g.fillRect(-hw, yy + 1.5, W, 2);
      g.fillStyle = 'rgba(20, 24, 30, 0.7)'; for (let x = -hw + 9; x < hw; x += P * 2) g.fillRect(x, yy - 5, 3, 3);
    }
    // Rust bleeding down from the laps, short and ragged.
    g.fillStyle = 'rgba(150, 74, 40, 0.3)';
    for (let i = 0; i < W / 70; i++) { const x = -hw + hash(i, seed, 3) * W, l = 14 + hash(i, seed, 4) * 46; g.fillRect(x, eaveSide < 0 ? top : bot - l, 5, l); }
  } else if (st.kind === 'seam') {
    const P = 46;
    for (let x = -hw, i = 0; x < hw; x += P, i++) {
      g.fillStyle = i % 2 ? 'rgba(255, 255, 255, 0.06)' : 'rgba(8, 12, 22, 0.1)'; g.fillRect(x, top, P, len);
      g.fillStyle = 'rgba(8, 12, 22, 0.55)'; g.fillRect(x + P - 3, top, 3, len);
      g.fillStyle = lit ? 'rgba(255, 255, 255, 0.34)' : 'rgba(255, 255, 255, 0.16)'; g.fillRect(x, top, 2, len);
    }
  } else {
    const P = 72, Q = 96;
    for (let x = -hw, i = 0; x < hw; x += P, i++) for (let y = top, j = 0; y < bot; y += Q, j++) {
      g.fillStyle = (i + j) % 3 === 0 ? 'rgba(255, 255, 255, 0.1)' : 'rgba(8, 20, 34, 0.1)'; g.fillRect(x, y, P, Math.min(Q, bot - y));
      g.fillStyle = 'rgba(255, 255, 255, 0.2)'; g.beginPath(); g.moveTo(x + 14, y + Q); g.lineTo(x + 30, y + Q); g.lineTo(x + 44, y); g.lineTo(x + 28, y); g.closePath(); g.fill();
    }
    g.fillStyle = 'rgba(14, 30, 42, 0.8)';
    for (let x = -hw; x < hw; x += P) g.fillRect(x, top, 4, len);
    for (let y = top; y < bot; y += Q) g.fillRect(-hw, y, W, 4);
  }
}

/** The snow lying on one slope from the ridge down: lumpy lower edge with a shade lip, courses showing below it. */
function blanket(g: G, W: number, ridgeY: number, dir: 1 | -1, slopeLen: number, cover: number, lit: boolean, seed: number) {
  const hw = W / 2, step = 36;
  const path = (dy: number) => {
    g.beginPath(); g.moveTo(-hw, ridgeY);
    let px = -hw, pd = slopeLen * cover * (0.85 + hash(seed, 0, 1) * 0.2);
    g.lineTo(px, ridgeY + dir * (pd + dy));
    for (let x = -hw + step, i = 1; x < hw + step; x += step, i++) {
      const xe = Math.min(x, hw), d = slopeLen * cover * (0.88 + hash(seed, i, 2) * 0.24);
      g.quadraticCurveTo((px + xe) / 2, ridgeY + dir * (Math.max(pd, d) + 6 + dy), xe, ridgeY + dir * (d + dy));
      px = xe; pd = d;
    }
    g.lineTo(hw, ridgeY); g.closePath();
  };
  g.fillStyle = lit ? 'rgba(34, 48, 84, 0.5)' : 'rgba(18, 26, 52, 0.55)'; path(7); g.fill();
  g.fillStyle = lit ? C.snowCap : mix(C.snowCap, C.snowBlue, 0.4); path(0); g.fill();
  g.save(); path(0); g.clip();
  g.fillStyle = lit ? 'rgba(255, 255, 255, 0.34)' : 'rgba(255, 255, 255, 0.14)'; g.fillRect(-hw, Math.min(ridgeY, ridgeY + dir * 14), W, 14);
  // Wind-scoured hollows and drifts inside the blanket, in the two cel steps.
  for (let i = 0; i < W / 110; i++) {
    const x = -hw + hash(seed, i, 5) * W, y = ridgeY + dir * (30 + hash(seed, i, 6) * slopeLen * cover * 0.7);
    g.fillStyle = 'rgba(70, 92, 134, 0.22)'; ell(g, x, y, 34 + hash(seed, i, 7) * 40, 7, 0); g.fill();
    g.fillStyle = 'rgba(255, 255, 255, 0.2)'; ell(g, x - 6, y - 4, 24 + hash(seed, i, 8) * 24, 4, 0); g.fill();
  }
  g.restore();
  // Loose clumps lower down the slope and a few right at the eave.
  for (let i = 0; i < W / 85; i++) {
    const x = -hw + hash(seed, i, 9) * W, y = ridgeY + dir * (slopeLen * (cover + 0.05 + hash(seed, i, 10) * (0.9 - cover)));
    const rx = 12 + hash(seed, i, 11) * 22;
    g.fillStyle = 'rgba(18, 26, 52, 0.4)'; ell(g, x + 3, y + 4, rx, 6, 0); g.fill();
    g.fillStyle = lit ? C.snowCap : mix(C.snowCap, C.snowBlue, 0.4); ell(g, x, y, rx, 6, 0); g.fill();
  }
}

type Flags = { eaveN: boolean; eaveS: boolean; endL: boolean; endR: boolean };

/** One gable in its local frame: ridge along x at y = 0, the lit slope to -y. */
function gable(g: G, st: Style, W: number, H: number, f: Flags, seed: number) {
  const hw = W / 2, hh = H / 2;
  texture(g, st, W, -hh, 0, -1, true, seed);
  texture(g, st, W, 0, hh, 1, false, seed + 7);
  blanket(g, W, 0, -1, hh, 0.42, true, seed + 11);
  blanket(g, W, 0, 1, hh, 0.3, false, seed + 13);
  // Ridge cap with its own lit edge and a lumpy line of snow along it.
  g.fillStyle = st.ridge; g.fillRect(-hw, -7, W, 14);
  g.fillStyle = 'rgba(255, 255, 255, 0.28)'; g.fillRect(-hw, -7, W, 2);
  g.fillStyle = 'rgba(8, 8, 16, 0.5)'; g.fillRect(-hw, 5, W, 2);
  for (let x = -hw + 10; x < hw - 20; x += 46 + hash(Math.round(x), seed, 3) * 30) {
    const rx = 22 + hash(Math.round(x), seed, 4) * 18;
    g.fillStyle = 'rgba(18, 26, 52, 0.4)'; ell(g, x + 2, 4, rx, 6, 0); g.fill();
    g.fillStyle = C.snowCap; ell(g, x, 0, rx, 6, 0); g.fill();
  }
  // Fascia boards with rafter tails along an exposed eave, and a barge board on an exposed gable end.
  const fascia = (y: number, up: boolean) => {
    g.fillStyle = st.ridge; g.fillRect(-hw, up ? y : y - 9, W, 9);
    g.fillStyle = 'rgba(255, 255, 255, 0.2)'; g.fillRect(-hw, up ? y : y - 9, W, 2);
    g.fillStyle = 'rgba(8, 8, 16, 0.6)';
    for (let x = -hw + 14; x < hw - 8; x += 42) g.fillRect(x, up ? y + 9 : y - 16, 7, 7);
  };
  if (f.eaveN) fascia(-hh, true);
  if (f.eaveS) fascia(hh, false);
  g.fillStyle = st.ridge;
  if (f.endL) { g.fillRect(-hw, -hh, 8, H); g.fillStyle = 'rgba(255, 255, 255, 0.2)'; g.fillRect(-hw, -hh, 2, H); }
  g.fillStyle = st.ridge;
  if (f.endR) { g.fillRect(hw - 8, -hh, 8, H); g.fillStyle = 'rgba(8, 8, 16, 0.5)'; g.fillRect(hw - 3, -hh, 3, H); }
}

const trace = (g: G, pts: readonly Pt[]) => { g.beginPath(); pts.forEach((p, i) => (i ? g.lineTo(p.x, p.y) : g.moveTo(p.x, p.y))); g.closePath(); };

const CHIMNEYS: Record<string, [number, number]> = { hall: [1125, 3025], cabin: [790, 660] };
const ROOF_NAMES: Record<string, [string, string]> = { hall: ['SUMMIT LODGE', 'ALPINE SPA'], lift: ['SUMMIT EXPRESS', 'ICE GARDEN'], bay: ['SNOWCAT GARAGE', 'CABLE CAR TERMINAL'], cabin: ['', 'SAWMILL'] };

function stack(g: G, x: number, y: number, round: boolean) {
  // Its shadow falls down and to the right across the slope, then the body in two cel steps, a snow cap on the lit side, a lit flue.
  g.fillStyle = 'rgba(10, 8, 18, 0.34)';
  g.beginPath(); g.moveTo(x - 20, y + 22); g.lineTo(x + 22, y + 22); g.lineTo(x + 58, y + 50); g.lineTo(x + 16, y + 50); g.closePath(); g.fill();
  g.beginPath(); g.moveTo(x + 22, y - 22); g.lineTo(x + 58, y + 6); g.lineTo(x + 58, y + 50); g.lineTo(x + 22, y + 22); g.closePath(); g.fill();
  if (round) {
    g.fillStyle = C.steelLo; ell(g, x, y, 24, 24); g.fill(); g.strokeStyle = INK; g.lineWidth = 2.5; g.stroke();
    g.fillStyle = C.steelHi; g.beginPath(); g.arc(x, y, 24, Math.PI * 0.75, Math.PI * 1.65); g.arc(x, y, 14, Math.PI * 1.65, Math.PI * 0.75, true); g.fill();
    g.fillStyle = '#16181c'; ell(g, x, y, 12, 12); g.fill();
    g.fillStyle = hexA(C.snowCap, 0.9); ell(g, x - 10, y - 12, 9, 5, -0.5); g.fill();
    return;
  }
  g.fillStyle = C.stone; g.fillRect(x - 22, y - 22, 44, 44);
  g.fillStyle = C.stoneLo; g.fillRect(x + 8, y - 22, 14, 44);
  g.fillStyle = C.stoneHi; g.fillRect(x - 22, y - 22, 44, 5);
  g.strokeStyle = 'rgba(30, 26, 22, 0.7)'; g.lineWidth = 2;
  for (let i = 1; i < 4; i++) { g.beginPath(); g.moveTo(x - 22, y - 22 + i * 11); g.lineTo(x + 22, y - 22 + i * 11); g.stroke(); }
  g.strokeStyle = INK; g.lineWidth = 2.5; g.strokeRect(x - 22, y - 22, 44, 44);
  g.fillStyle = '#16181c'; g.fillRect(x - 12, y - 12, 24, 24);
  g.fillStyle = 'rgba(255, 150, 60, 0.4)'; g.fillRect(x - 10, y - 4, 20, 14);
  g.fillStyle = hexA(C.snowCap, 0.95); g.beginPath(); g.moveTo(x - 24, y - 20); g.quadraticCurveTo(x - 6, y - 30, x + 10, y - 22); g.lineTo(x + 10, y - 14); g.lineTo(x - 24, y - 12); g.closePath(); g.fill();
}

/** Paints a pitched roof (one box or an L of two) into `g`, which already has the sprite's translation. */
export function paintGable(g: G, r: MapRoof): void {
  const id = baseId(r.id), tw = isTwin(r.id), pts = r.points, st = roofStyle(r), b = boundsOf(pts);
  // Cast shadow on the ground, down and to the right, then the roof itself clipped to its outline.
  g.save(); g.translate(7, 11); trace(g, pts); g.fillStyle = 'rgba(10, 12, 24, 0.34)'; g.fill(); g.restore();
  g.save(); trace(g, pts); g.clip();
  g.fillStyle = st.base; g.fillRect(b.x0, b.y0, b.x1 - b.x0, b.y1 - b.y0);
  const bands = bandsOf(pts);
  bands.forEach((band, bi) => {
    const w = band.x1 - band.x0, h = band.y1 - band.y0, vertical = w < h;
    g.save(); g.translate((band.x0 + band.x1) / 2, (band.y0 + band.y1) / 2);
    let flags: Flags;
    if (!vertical) flags = { eaveN: exposed(pts, band, 0, -1), eaveS: exposed(pts, band, 0, 1), endL: exposed(pts, band, -1, 0), endR: exposed(pts, band, 1, 0) };
    else { g.rotate(-Math.PI / 2); flags = { eaveN: exposed(pts, band, -1, 0), eaveS: exposed(pts, band, 1, 0), endL: exposed(pts, band, 0, 1), endR: exposed(pts, band, 0, -1) }; }
    g.beginPath(); g.rect(-(vertical ? h : w) / 2, -(vertical ? w : h) / 2, vertical ? h : w, vertical ? w : h); g.clip();
    gable(g, st, vertical ? h : w, vertical ? w : h, flags, Math.round(band.x0 + band.y0 * 3 + bi * 17));
    g.restore();
  });
  g.restore();
  trace(g, pts); g.strokeStyle = INK; g.lineWidth = 3; g.lineJoin = 'round'; g.stroke();
  // Icicles along an exposed south eave.
  g.fillStyle = 'rgba(214, 238, 250, 0.9)'; g.strokeStyle = 'rgba(20, 30, 50, 0.5)'; g.lineWidth = 1;
  for (const band of bands) {
    if (!exposed(pts, band, 0, 1)) continue;
    for (let x = band.x0 + 14; x < band.x1 - 10; x += 26 + hash(x, band.y1) * 20) {
      const l = 8 + hash(x, band.y1, 4) * 12;
      g.beginPath(); g.moveTo(x - 3, band.y1); g.lineTo(x + 3, band.y1); g.lineTo(x, band.y1 + l); g.closePath(); g.fill(); g.stroke();
    }
  }
  const ch = CHIMNEYS[id];
  if (ch) stack(g, tw ? SIZE - ch[0] : ch[0], tw ? SIZE - ch[1] : ch[1], tw);
  const name = ROOF_NAMES[id]?.[tw ? 1 : 0];
  if (name) {
    const big = bands.reduce((a, c) => ((c.x1 - c.x0) * (c.y1 - c.y0) > (a.x1 - a.x0) * (a.y1 - a.y0) ? c : a));
    const w = big.x1 - big.x0;
    g.save(); g.translate((big.x0 + big.x1) / 2, big.y0 + (big.y1 - big.y0) * 0.45);
    const bw = Math.min(w - 40, name.length * 15 + 36);
    g.fillStyle = 'rgba(10, 12, 24, 0.4)'; g.fillRect(-bw / 2 + 3, -13, bw, 30);
    g.fillStyle = tw ? '#2f3f50' : '#4a3220'; g.fillRect(-bw / 2, -16, bw, 30); g.strokeStyle = INK; g.lineWidth = 2; g.strokeRect(-bw / 2, -16, bw, 30);
    g.strokeStyle = C.brass; g.lineWidth = 1.6; g.strokeRect(-bw / 2 + 4, -12, bw - 8, 22);
    g.fillStyle = '#ece6d6'; g.font = '700 21px "Barlow Condensed", "Arial Narrow", sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    (g as unknown as { letterSpacing: string }).letterSpacing = '3px'; g.fillText(name, 0, -1);
    g.restore();
  }
}

/** The two round roofs: the fuel house's tin cone and the observatory's plaster dome, in faceted cel steps. */
export function paintDome(g: G, r: MapRoof): void {
  const pts = r.points, tw = isTwin(r.id), b = boundsOf(pts), R = (b.x1 - b.x0) / 2, cx = (b.x0 + b.x1) / 2, cy = (b.y0 + b.y1) / 2;
  const base = tw ? '#b9b4a4' : '#7e8a96';
  g.fillStyle = 'rgba(10, 12, 24, 0.34)'; ell(g, cx + 8, cy + 12, R, R); g.fill();
  const N = tw ? 16 : 20, lx = -0.62, ly = -0.78;
  for (let k = 0; k < N; k++) {
    const a0 = (k / N) * TAU, a1 = ((k + 1) / N) * TAU, am = (a0 + a1) / 2;
    const facing = Math.cos(am) * lx + Math.sin(am) * ly;
    g.fillStyle = facing > 0.55 ? shade(base, 0.2) : facing > -0.1 ? base : facing > -0.6 ? shade(base, -0.2) : shade(base, -0.34);
    g.beginPath(); g.moveTo(cx, cy); g.arc(cx, cy, R, a0, a1); g.closePath(); g.fill();
    g.strokeStyle = 'rgba(14, 18, 26, 0.5)'; g.lineWidth = 2.5; g.beginPath(); g.moveTo(cx, cy); g.lineTo(cx + Math.cos(a1) * R, cy + Math.sin(a1) * R); g.stroke();
  }
  // Courses round the cone.
  g.strokeStyle = 'rgba(14, 18, 26, 0.45)'; g.lineWidth = 3;
  for (const f of tw ? [0.38, 0.7] : [0.4, 0.66, 0.86]) { ell(g, cx, cy, R * f, R * f); g.stroke(); }
  if (tw) {
    // The observatory's slit, with the telescope's glint, and a drift of snow on the crown.
    g.save(); g.translate(cx, cy); g.rotate(-0.5);
    g.fillStyle = '#1a2236'; g.fillRect(-R * 0.1, -R, R * 0.2, R * 1.05); g.fillStyle = 'rgba(160, 190, 255, 0.35)'; g.fillRect(-R * 0.1, -R, R * 0.04, R * 1.05);
    g.strokeStyle = INK; g.lineWidth = 2.5; g.strokeRect(-R * 0.1, -R, R * 0.2, R * 1.05); g.restore();
  } else {
    g.fillStyle = 'rgba(150, 74, 40, 0.35)'; for (let k = 0; k < 7; k++) { const a = hash(k, 3, 1) * TAU, d = R * (0.45 + hash(k, 4, 1) * 0.45); g.fillRect(cx + Math.cos(a) * d - 3, cy + Math.sin(a) * d - 8, 6, 16); }
  }
  g.fillStyle = 'rgba(18, 26, 52, 0.4)'; ell(g, cx - R * 0.3 + 5, cy - R * 0.36 + 5, R * 0.32, R * 0.17, -0.6); g.fill();
  g.fillStyle = C.snowCap; ell(g, cx - R * 0.3, cy - R * 0.36, R * 0.32, R * 0.17, -0.6); g.fill();
  g.fillStyle = 'rgba(255, 255, 255, 0.35)'; ell(g, cx - R * 0.34, cy - R * 0.4, R * 0.2, R * 0.07, -0.6); g.fill();
  g.strokeStyle = INK; g.lineWidth = 3; ell(g, cx, cy, R, R); g.stroke();
  g.fillStyle = C.steelLo; ell(g, cx, cy, 24, 24); g.fill(); g.strokeStyle = INK; g.lineWidth = 2.5; g.stroke();
  g.fillStyle = C.steelHi; g.beginPath(); g.arc(cx, cy, 24, Math.PI * 0.75, Math.PI * 1.65); g.arc(cx, cy, 14, Math.PI * 1.65, Math.PI * 0.75, true); g.fill();
}
