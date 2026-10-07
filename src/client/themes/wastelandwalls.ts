import type { Solid, SolidKind } from '../tilt.ts';
import { C, CEL, hash, openSides, TAU, type Open } from './wastelandkit.ts';

/**
 * The Wasteland's two rect walls, each painted whole into its sprite: rubble (broken concrete with rebar bristling from its
 * ends, moss and a skirt of fallen chunks) and scrap (a patchwork of corrugated sheet in rust, faded teal, khaki and
 * brick, bolted to posts, with a corrugated front face). The ink outline sits only on edges that meet open air.
 */
type G = CanvasRenderingContext2D;
type Rect = { x: number; y: number; w: number; h: number };

export const WASTELAND_FACE = { rubble: 16, scrap: 14 } as const;

const rects = (g: G, list: readonly Rect[]) => { g.beginPath(); for (const r of list) g.rect(r.x, r.y, r.w, r.h); };

function strips(s: Rect, o: Open, t: number): Record<'n' | 'e' | 's' | 'w', Rect[]> {
  return {
    n: o.spans.n.map(([a, b]) => ({ x: s.x + a, y: s.y, w: b - a, h: t })),
    s: o.spans.s.map(([a, b]) => ({ x: s.x + a, y: s.y + s.h - t, w: b - a, h: t })),
    w: o.spans.w.map(([a, b]) => ({ x: s.x, y: s.y + a, w: t, h: b - a })),
    e: o.spans.e.map(([a, b]) => ({ x: s.x + s.w - t, y: s.y + a, w: t, h: b - a })),
  };
}

/** Light on the north and west open edges, shade on the south and east: the two hard steps every top face wears. */
function celBands(g: G, s: Rect, o: Open, e = 4) {
  const st = strips(s, o, e);
  g.fillStyle = CEL.light; rects(g, [...st.n, ...st.w]); g.fill();
  g.fillStyle = CEL.dark; rects(g, [...st.s, ...st.e]); g.fill();
}

/** The top face's outline path: a rect whose open corners are chipped away by a few px, so broken stuff reads as broken. */
function chipped(g: G, s: Rect, o: Open, k: number, seed: number) {
  const c = (n: number) => 3 + hash(seed, n) * k;
  const tl = o.n && o.w ? c(1) : 0, tr = o.n && o.e ? c(2) : 0, br = o.s && o.e ? c(3) : 0, bl = o.s && o.w ? c(4) : 0;
  g.beginPath();
  g.moveTo(s.x + tl, s.y);
  g.lineTo(s.x + s.w - tr, s.y); if (tr) g.lineTo(s.x + s.w, s.y + tr * 0.8);
  g.lineTo(s.x + s.w, s.y + s.h - br); if (br) g.lineTo(s.x + s.w - br * 1.1, s.y + s.h);
  g.lineTo(s.x + bl, s.y + s.h); if (bl) g.lineTo(s.x, s.y + s.h - bl * 0.9);
  g.lineTo(s.x, s.y + tl); if (tl) g.lineTo(s.x + tl * 0.9, s.y);
  g.closePath();
}

function outlineOpen(g: G, s: Rect, o: Open, width = 2) {
  g.save();
  g.beginPath();
  for (const list of Object.values(strips({ x: s.x - 4, y: s.y - 4, w: s.w + 8, h: s.h + 8 }, o, 8))) for (const q of list) g.rect(q.x, q.y, q.w, q.h);
  if (o.n && o.w) g.rect(s.x - 4, s.y - 4, 14, 14);
  if (o.n && o.e) g.rect(s.x + s.w - 10, s.y - 4, 14, 14);
  if (o.s && o.e) g.rect(s.x + s.w - 10, s.y + s.h - 10, 14, 14);
  if (o.s && o.w) g.rect(s.x - 4, s.y + s.h - 10, 14, 14);
  g.clip();
  chipped(g, s, o, 9, Math.round(s.x * 7 + s.y));
  g.strokeStyle = C.ink; g.lineWidth = width; g.lineJoin = 'round'; g.stroke();
  g.restore();
}

/** A front-face rect over each open stretch of the south edge, with its ink sides and base line. */
function southFace(g: G, s: Rect, o: Open, fh: number, fill: string, low: string) {
  const list = o.spans.s.map(([a, b]) => ({ x: s.x + a, y: s.y + s.h, w: b - a, h: fh }));
  g.fillStyle = fill; rects(g, list); g.fill();
  g.fillStyle = 'rgba(255, 244, 214, 0.12)'; rects(g, list.map((q) => ({ ...q, h: 2 }))); g.fill();
  g.fillStyle = low; rects(g, list.map((q) => ({ ...q, y: q.y + fh * 0.62, h: fh * 0.38 }))); g.fill();
  g.strokeStyle = C.ink; g.lineWidth = 2; g.lineJoin = 'miter';
  g.beginPath();
  for (const q of list) { g.moveTo(q.x, q.y); g.lineTo(q.x, q.y + fh); g.lineTo(q.x + q.w, q.y + fh); g.lineTo(q.x + q.w, q.y); }
  g.stroke();
  return list;
}

/* ------------------------------------------------------------------ rubble */

function rebar(g: G, x: number, y: number, a: number, len: number) {
  g.save(); g.translate(x, y); g.rotate(a);
  g.strokeStyle = C.ink; g.lineWidth = 5.4; g.lineCap = 'round';
  g.beginPath(); g.moveTo(0, 0); g.lineTo(len, 0); g.stroke();
  g.strokeStyle = C.rust; g.lineWidth = 3;
  g.beginPath(); g.moveTo(0, 0); g.lineTo(len, 0); g.stroke();
  g.strokeStyle = C.rustHi; g.lineWidth = 1.2;
  g.beginPath(); g.moveTo(3, -0.8); g.lineTo(len - 3, -0.8); g.stroke();
  g.restore();
}

function rubble(g: G, s: Solid) {
  const o = openSides('rubble', s), fh = WASTELAND_FACE.rubble;
  const { x, y, w, h } = s;
  const seed = Math.round(x * 7 + y);
  // the front face: grey-brown concrete, vertical cracks and a stained foot
  const faces = southFace(g, s, o, fh, C.concreteFront, 'rgba(14, 12, 10, 0.34)');
  g.save();
  g.beginPath(); for (const q of faces) g.rect(q.x, q.y, q.w, q.h); g.clip();
  g.strokeStyle = 'rgba(14, 12, 10, 0.55)'; g.lineWidth = 1.8; g.lineCap = 'round';
  for (const q of faces) for (let cx = q.x + 10 + hash(seed, q.x) * 20; cx < q.x + q.w - 6; cx += 28 + hash(seed, cx) * 36) {
    g.beginPath(); g.moveTo(cx, q.y); g.lineTo(cx + (hash(seed, cx, 2) - 0.5) * 8, q.y + fh * 0.5); g.lineTo(cx + (hash(seed, cx, 3) - 0.5) * 12, q.y + fh); g.stroke();
  }
  g.fillStyle = 'rgba(120, 112, 98, 0.18)';
  for (const q of faces) for (let cx = q.x + 6; cx < q.x + q.w - 12; cx += 38) g.fillRect(cx, q.y + 3, 14 + hash(seed, cx, 4) * 12, 4);
  g.restore();
  // the top face
  chipped(g, s, o, 9, seed);
  g.fillStyle = C.concrete; g.fill();
  g.save();
  chipped(g, s, o, 9, seed); g.clip();
  // pale patches and weathering
  for (let i = 0; i < Math.max(2, (w * h) / 1400); i++) {
    const px = x + hash(seed, i, 1) * w, py = y + hash(seed, i, 2) * h, r = 8 + hash(seed, i, 3) * 16;
    g.fillStyle = hash(seed, i, 4) < 0.5 ? 'rgba(210, 200, 180, 0.12)' : 'rgba(20, 18, 14, 0.12)';
    g.beginPath(); g.ellipse(px, py, r, r * 0.7, hash(seed, i, 5) * 3, 0, TAU); g.fill();
  }
  // aggregate: pale flecks
  g.fillStyle = 'rgba(220, 212, 190, 0.28)';
  for (let i = 0; i < (w * h) / 90; i++) g.fillRect(x + hash(seed, i, 6) * w, y + hash(seed, i, 7) * h, 2, 2);
  // a faded stripe of road paint on some, as if the wall were part of a kerb or a bridge parapet
  if (hash(seed, 9) < 0.35) {
    g.fillStyle = hash(seed, 10) < 0.5 ? 'rgba(183, 154, 74, 0.5)' : 'rgba(210, 202, 180, 0.4)';
    if (w >= h) g.fillRect(x, y + h * 0.5 - 3, w, 6); else g.fillRect(x + w * 0.5 - 3, y, 6, h);
  }
  // cracks
  g.strokeStyle = 'rgba(30, 27, 22, 0.6)'; g.lineWidth = 2; g.lineCap = 'round'; g.lineJoin = 'round';
  const n = Math.max(1, Math.round((w + h) / 130));
  for (let i = 0; i < n; i++) {
    let cx = x + hash(seed, i, 11) * w, cy = y + hash(seed, i, 12) * h;
    g.beginPath(); g.moveTo(cx, cy);
    for (let k = 0; k < 4; k++) { cx += (hash(seed, i * 9 + k, 13) - 0.5) * 34; cy += (hash(seed, i * 9 + k, 14) - 0.5) * 24; g.lineTo(cx, cy); }
    g.stroke();
  }
  celBands(g, s, o, 4);
  g.restore();
  // rebar bristling from the free ends
  const bar = (ex: number, ey: number, a: number, k: number) => { for (let i = 0; i < 2 + (k % 2); i++) rebar(g, ex, ey + (i - 0.5) * 11 * (a % Math.PI === 0 ? 1 : 0), a + (hash(seed, k + i, 20) - 0.5) * 0.6, 12 + hash(seed, k + i, 21) * 12); };
  if (w >= h) {
    if (o.e && o.spans.e.length === 1 && o.spans.e[0]![1] - o.spans.e[0]![0] >= h - 1) bar(x + w - 3, y + h * 0.3, 0, 1);
    if (o.w && o.spans.w.length === 1 && o.spans.w[0]![1] - o.spans.w[0]![0] >= h - 1) { for (let i = 0; i < 3; i++) rebar(g, x + 3, y + h * 0.25 + i * 11, Math.PI + (hash(seed, i, 22) - 0.5) * 0.6, 12 + hash(seed, i, 23) * 12); }
  } else {
    if (o.s && o.spans.s.length === 1 && o.spans.s[0]![1] - o.spans.s[0]![0] >= w - 1) for (let i = 0; i < 3; i++) rebar(g, x + w * 0.25 + i * 11, y + h - 3, Math.PI / 2 + (hash(seed, i, 24) - 0.5) * 0.6, 12 + hash(seed, i, 25) * 10);
    if (o.n && o.spans.n.length === 1 && o.spans.n[0]![1] - o.spans.n[0]![0] >= w - 1) for (let i = 0; i < 3; i++) rebar(g, x + w * 0.25 + i * 11, y + 3, -Math.PI / 2 + (hash(seed, i, 26) - 0.5) * 0.6, 12 + hash(seed, i, 27) * 10);
  }
  outlineOpen(g, s, o);
  // moss and weeds on the crown, and the chunks that have fallen at its foot
  for (let i = 0; i < Math.round((w + h) / 90); i++) {
    const px = x + 6 + hash(seed, i, 30) * (w - 12), py = y + 6 + hash(seed, i, 31) * (h - 12);
    g.fillStyle = hash(seed, i, 32) < 0.5 ? C.moss : C.grassHi; g.globalAlpha = 0.85;
    g.beginPath(); g.arc(px, py, 3 + hash(seed, i, 33) * 3, 0, TAU); g.fill();
    g.strokeStyle = C.ink; g.lineWidth = 1.2; g.stroke();
    g.globalAlpha = 1;
  }
  for (const q of o.spans.s) {
    const cnt = Math.round((q[1] - q[0]) / 70);
    for (let i = 0; i < cnt; i++) {
      const cx = x + q[0] + hash(seed, i, 40) * (q[1] - q[0]), cy = y + h + fh - 2 + hash(seed, i, 41) * 6, r = 3 + hash(seed, i, 42) * 4;
      g.fillStyle = hash(seed, i, 43) < 0.5 ? C.concreteHi : C.concreteLo;
      g.beginPath(); g.moveTo(cx - r, cy + r * 0.5); g.lineTo(cx - r * 0.4, cy - r); g.lineTo(cx + r, cy - r * 0.2); g.lineTo(cx + r * 0.8, cy + r * 0.7); g.closePath(); g.fill();
      g.strokeStyle = C.ink; g.lineWidth = 1.4; g.stroke();
    }
  }
}

/* ------------------------------------------------------------------ scrap */

const SHEETS = [C.scrapA, C.scrapB, C.scrapC, C.scrapD, C.scrapE, C.scrapF] as const;

function bolt(g: G, x: number, y: number) {
  g.fillStyle = '#2b2a2a'; g.beginPath(); g.arc(x, y, 2.4, 0, TAU); g.fill();
  g.fillStyle = 'rgba(255, 220, 180, 0.4)'; g.beginPath(); g.arc(x - 0.7, y - 0.7, 0.9, 0, TAU); g.fill();
}

function scrap(g: G, s: Solid) {
  const o = openSides('scrap', s), fh = WASTELAND_FACE.scrap;
  const { x, y, w, h } = s;
  const seed = Math.round(x * 5 + y * 3);
  const horiz = w >= h;
  const len = horiz ? w : h;
  // sheets along the long axis: each its own colour, about 100 to 150 px
  const cuts: number[] = [0];
  for (let t = 0; t < len - 60;) { t += 90 + hash(seed, t, 1) * 60; if (t < len - 50) cuts.push(t); }
  cuts.push(len);
  const sheetAt = (i: number) => SHEETS[Math.floor(hash(seed, i, 2) * SHEETS.length)]!;
  // front face: corrugated, per sheet
  const faces = southFace(g, s, o, fh, C.scrapA, 'rgba(14, 10, 8, 0.3)');
  g.save();
  g.beginPath(); for (const q of faces) g.rect(q.x, q.y, q.w, q.h); g.clip();
  if (horiz) {
    for (let i = 0; i < cuts.length - 1; i++) {
      const sx = x + cuts[i]!, sw = cuts[i + 1]! - cuts[i]!;
      g.fillStyle = sheetAt(i); g.fillRect(sx, y + h, sw, fh);
      g.fillStyle = 'rgba(8, 8, 10, 0.26)';
      for (let rx = sx + 2; rx < sx + sw; rx += 8) g.fillRect(rx, y + h, 3.4, fh);
      g.fillStyle = 'rgba(255, 244, 220, 0.16)';
      for (let rx = sx + 5; rx < sx + sw; rx += 8) g.fillRect(rx, y + h, 1.6, fh);
      g.fillStyle = 'rgba(14, 10, 8, 0.34)'; g.fillRect(sx, y + h + fh * 0.7, sw, fh * 0.3);
      // rust drips
      g.fillStyle = 'rgba(80, 36, 18, 0.5)';
      for (let k = 0; k < 3; k++) g.fillRect(sx + 10 + hash(seed, i * 5 + k, 3) * (sw - 20), y + h, 2.6, 4 + hash(seed, i * 5 + k, 4) * (fh - 4));
      if (i > 0) { g.fillStyle = C.ink; g.fillRect(sx - 1, y + h, 2.4, fh); }
    }
  } else {
    g.fillStyle = sheetAt(0); g.fillRect(x, y + h, w, fh);
    g.fillStyle = 'rgba(8, 8, 10, 0.26)'; for (let rx = x + 2; rx < x + w; rx += 8) g.fillRect(rx, y + h, 3.4, fh);
    g.fillStyle = 'rgba(14, 10, 8, 0.34)'; g.fillRect(x, y + h + fh * 0.7, w, fh * 0.3);
  }
  g.restore();
  // top face: patchwork sheets, seam lines, corrugation, bolts
  chipped(g, s, o, 6, seed);
  g.fillStyle = C.scrapA; g.fill();
  g.save();
  chipped(g, s, o, 6, seed); g.clip();
  for (let i = 0; i < cuts.length - 1; i++) {
    const a = cuts[i]!, b = cuts[i + 1]!;
    const col = sheetAt(i);
    const px = horiz ? x + a : x, py = horiz ? y : y + a, pw = horiz ? b - a : w, ph = horiz ? h : b - a;
    g.fillStyle = col; g.fillRect(px, py, pw, ph);
    // corrugation across the sheet
    g.fillStyle = 'rgba(8, 8, 10, 0.2)';
    if (horiz) for (let rx = px + 3; rx < px + pw; rx += 9) g.fillRect(rx, py, 3.6, ph); else for (let ry = py + 3; ry < py + ph; ry += 9) g.fillRect(px, ry, pw, 3.6);
    g.fillStyle = 'rgba(255, 244, 220, 0.16)';
    if (horiz) for (let rx = px + 6; rx < px + pw; rx += 9) g.fillRect(rx, py, 1.6, ph); else for (let ry = py + 6; ry < py + ph; ry += 9) g.fillRect(px, ry, pw, 1.6);
    // rust blooms and a patch
    if (hash(seed, i, 6) < 0.5) { g.fillStyle = 'rgba(120, 52, 24, 0.4)'; g.beginPath(); g.ellipse(px + hash(seed, i, 7) * pw, py + hash(seed, i, 8) * ph, 10 + hash(seed, i, 9) * 14, 6 + hash(seed, i, 10) * 8, 0.3, 0, TAU); g.fill(); }
    if (hash(seed, i, 11) < 0.28 && pw > 36 && ph > 36) {
      const q = Math.min(pw, ph) * 0.5;
      g.fillStyle = sheetAt(i + 7); g.fillRect(px + pw * 0.5 - q / 2, py + ph * 0.5 - q / 2, q, q);
      g.strokeStyle = 'rgba(28, 31, 38, 0.8)'; g.lineWidth = 1.8; g.strokeRect(px + pw * 0.5 - q / 2, py + ph * 0.5 - q / 2, q, q);
    }
    // a hand-painted mark on a few: X, arrow, tally
    if (hash(seed, i, 12) < 0.14 && w + h > 140) {
      g.save(); g.translate(px + pw / 2, py + ph / 2); g.strokeStyle = hash(seed, i, 13) < 0.5 ? 'rgba(236, 226, 196, 0.8)' : 'rgba(210, 70, 50, 0.85)'; g.lineWidth = 4; g.lineCap = 'round';
      const k = hash(seed, i, 14);
      g.beginPath();
      if (k < 0.4) { g.moveTo(-8, -8); g.lineTo(8, 8); g.moveTo(8, -8); g.lineTo(-8, 8); } else if (k < 0.7) { g.moveTo(-10, 0); g.lineTo(10, 0); g.moveTo(3, -6); g.lineTo(10, 0); g.lineTo(3, 6); } else { for (let t = -2; t <= 1; t++) { g.moveTo(t * 6, -7); g.lineTo(t * 6, 7); } g.moveTo(-14, 5); g.lineTo(10, -5); }
      g.stroke(); g.restore();
    }
    // seam
    g.strokeStyle = C.ink; g.lineWidth = 2;
    g.beginPath(); if (horiz) { if (i > 0) { g.moveTo(px, py); g.lineTo(px, py + ph); } } else if (i > 0) { g.moveTo(px, py); g.lineTo(px + pw, py); } g.stroke();
    // bolts along the seam
    if (i > 0) { for (let k = 0; k < Math.max(2, Math.round((horiz ? h : w) / 22)); k++) { const t = ((k + 0.5) / Math.max(2, Math.round((horiz ? h : w) / 22))) * (horiz ? h : w); if (horiz) bolt(g, px + 5, py + t); else bolt(g, px + t, py + 5); } }
  }
  celBands(g, s, o, 4);
  g.restore();
  outlineOpen(g, s, o);
  // posts: a short dark timber at each seam, and one at each free end
  const post = (px: number, py: number) => {
    g.fillStyle = C.woodLo; g.fillRect(px - 5, py - 5, 10, 10);
    g.fillStyle = C.woodHi; g.fillRect(px - 5, py - 5, 10, 3);
    g.strokeStyle = C.ink; g.lineWidth = 1.8; g.strokeRect(px - 5, py - 5, 10, 10);
  };
  if (len > 140) for (let i = 1; i < cuts.length - 1; i++) { const t = cuts[i]!; if (horiz) post(x + t, y + h / 2); else post(x + w / 2, y + t); }
}

export const WASTELAND_WALLS: Partial<Record<SolidKind, (ctx: CanvasRenderingContext2D, s: Solid) => void>> = { rubble, scrap };
