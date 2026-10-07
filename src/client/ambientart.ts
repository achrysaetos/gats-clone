import { INK, NIGHT, shade, tint } from './palette.ts';
import { LIGHT } from './tilt.ts';
import { seeded } from './grain.ts';

/**
 * Toy-style sprites for the ambient critters (ambient.ts): bold ink outlines, two hard cel steps lit from the top left, a
 * contact shadow under anything standing. Every sprite is painted once into a shared atlas at 2x (and again, dimmed, for
 * night), so a frame costs one drawImage. Standing birds are side profiles facing right; everything else is seen from above
 * and faces right too, and the engine turns it. Sized against a soldier, who is 48 px across: a pigeon is about half that.
 */
type G = CanvasRenderingContext2D;
type Trace = (g: G) => void;
const TAU = Math.PI * 2;
export const SS = 2;

export type Cell = { img: HTMLCanvasElement; sx: number; sy: number; sw: number; sh: number; ax: number; ay: number; w: number; h: number };
type Def = { w: number; h: number; ax: number; ay: number; frames: number; draw: (g: G, f: number) => void };

/* ------------------------------------------------------------------ painting kit */

const SHADOW = 'rgba(10, 12, 18, 0.42)';

const ell = (cx: number, cy: number, rx: number, ry: number, rot = 0): Trace => (g) => { g.moveTo(cx + rx * Math.cos(rot), cy + rx * Math.sin(rot)); g.ellipse(cx, cy, rx, ry, rot, 0, TAU); };
const poly = (...p: number[]): Trace => (g) => { g.moveTo(p[0]!, p[1]!); for (let i = 2; i < p.length; i += 2) g.lineTo(p[i]!, p[i + 1]!); g.closePath(); };

/** Fills a shape with its two cel steps (a light crescent toward the key light, a dark one away) and an ink outline. */
function cel(g: G, tr: Trace, base: string, o: { lw?: number; band?: number; flat?: boolean } = {}) {
  const lw = o.lw ?? 2, band = o.band ?? 1.5;
  g.save();
  g.beginPath(); tr(g);
  g.fillStyle = base; g.fill();
  if (!o.flat) {
    g.clip();
    for (const [dir, col] of [[1, tint(base, 0.24)], [-1, shade(base, 0.7)]] as const) {
      g.beginPath();
      g.rect(-400, -400, 800, 800);
      g.save(); g.translate(-LIGHT.x * band * dir, -LIGHT.y * band * dir); tr(g); g.restore();
      g.fillStyle = col; g.fill('evenodd');
    }
  }
  g.restore();
  if (lw > 0) { g.save(); g.beginPath(); tr(g); g.lineWidth = lw; g.lineJoin = 'round'; g.lineCap = 'round'; g.strokeStyle = INK; g.stroke(); g.restore(); }
}
/** A line with an ink outline: legs, tails, antennae. */
function limb(g: G, pts: readonly number[], col: string, w: number) {
  g.save();
  g.lineCap = 'round'; g.lineJoin = 'round';
  g.beginPath(); g.moveTo(pts[0]!, pts[1]!);
  for (let i = 2; i < pts.length; i += 2) g.lineTo(pts[i]!, pts[i + 1]!);
  g.lineWidth = w + 1.8; g.strokeStyle = INK; g.stroke();
  g.lineWidth = w; g.strokeStyle = col; g.stroke();
  g.restore();
}
const dot = (g: G, x: number, y: number, r: number, col: string) => { g.beginPath(); g.arc(x, y, r, 0, TAU); g.fillStyle = col; g.fill(); };
const spec = (g: G, x: number, y: number, r = 0.85) => dot(g, x, y, r, 'rgba(255, 255, 255, 0.85)');
const contact = (g: G, rx: number, ry: number, x = 0, y = 0.5) => { g.beginPath(); g.ellipse(x, y, rx, ry, 0, 0, TAU); g.fillStyle = SHADOW; g.fill(); };

/* ------------------------------------------------------------------ standing birds (side profile, feet at the origin) */

type Bird = { s: number; body: string; wing: string; tip: string; head: string; beak: string; eye: string; leg: string; patch?: string; cap?: string; bib?: string; neck: number; tail: number; hook?: boolean; belly?: string; bill?: 'flat' };

const BIRDS = {
  pigeon: { s: 1, body: '#8a909c', wing: '#6c7380', tip: '#3d4450', head: '#7c8390', beak: '#d2cab4', eye: '#ff9a3c', leg: '#c0707a', patch: '#4f8f86', neck: 1, tail: 1 },
  crow: { s: 1.2, body: '#3a4052', wing: '#2c3140', tip: '#1c1f26', head: '#3a4052', beak: '#6a7280', eye: '#d9d2bd', leg: '#2c3140', neck: 1, tail: 1.15 },
  gull: { s: 1.3, body: '#e2dccb', wing: '#9aa3b0', tip: '#2c3140', head: '#ece6d6', beak: '#e0b840', eye: '#1c1f26', leg: '#d9904a', neck: 1.05, tail: 1.1, hook: true },
  sparrow: { s: 0.68, body: '#8a6a46', wing: '#6e5338', tip: '#4b3a28', head: '#9a5a32', beak: '#d2cab4', eye: '#1c1f26', leg: '#c8a080', bib: '#3d3128', neck: 0.8, tail: 1 },
  duck: { s: 1.15, body: '#9a9484', wing: '#6c6a5c', tip: '#4f7f5a', head: '#4f7f5a', beak: '#e0b840', eye: '#1c1f26', leg: '#d9904a', patch: '#e2dccb', neck: 0.75, tail: 0.8, bill: 'flat' },
} satisfies Record<string, Bird>;
export type StandKind = keyof typeof BIRDS;

/** Poses: 0 idle, 1 peck, 2 crouch (anticipation), 3 stretch (launch). */
function standBird(g: G, b: Bird, pose: number) {
  g.save();
  g.scale(b.s, b.s);
  const crouch = pose === 2, stretch = pose === 3, peck = pose === 1;
  contact(g, 11, 3.2);
  const by = crouch ? -6.5 : stretch ? -11 : -9;
  const sq = crouch ? 0.8 : stretch ? 1.1 : 1;
  // Legs.
  if (!crouch) {
    const lift = stretch ? 3 : 0;
    limb(g, [-2, by + 5, -2.5, -lift * 0.0], b.leg, 1.8);
    limb(g, [3, by + 5, 3.8, 0], b.leg, 1.8);
  }
  // A raised wing behind the body when launching.
  if (stretch) cel(g, ell(-3, by - 8, 9, 3.6, -0.95), b.wing, { lw: 1.8 });
  g.save();
  g.translate(0, by);
  g.rotate(peck ? 0.32 : stretch ? -0.32 : 0);
  // Tail.
  cel(g, poly(-7, -2.5, -15 * b.tail, -5.5, -16 * b.tail, 0.5, -7, 2.5), b.wing, { lw: 1.8, band: 1 });
  // Body.
  cel(g, ell(0, 0, 10, 7.5 * sq), b.body);
  if (b.belly) cel(g, ell(1.5, 2.5, 6, 3.4), b.belly, { lw: 0, flat: true });
  // Wing.
  cel(g, ell(-1.5, -0.6, 7.6, 4.4 * sq, -0.12), b.wing, { lw: 1.6, band: 1 });
  cel(g, poly(-6.5, 1, -13.5 * b.tail, 3.5, -13 * b.tail, -1.5, -8.5, -2.4), b.tip, { lw: 1.5, flat: true });
  g.restore();
  // Neck and head.
  const hx = peck ? 11.5 : crouch ? 7.5 : 8, hy = peck ? by + 1.5 : crouch ? by - 6 : by - 7.5 - (b.neck - 1) * 3;
  const nx = 5.5, ny = by - 3;
  cel(g, ell((nx + hx) / 2, (ny + hy) / 2, 4.6, 5.2 * b.neck, Math.atan2(hy - ny, hx - nx) + Math.PI / 2), b.body, { lw: 1.8, band: 1 });
  if (b.patch && !crouch) cel(g, ell((nx + hx) / 2 - 0.5, (ny + hy) / 2 + 1, 2.4, 2.6), b.patch, { lw: 0, flat: true });
  cel(g, ell(hx, hy, 4.7, 4.5), b.head, { lw: 1.9 });
  if (b.bib) cel(g, ell(hx + 1, hy + 2.8, 2.6, 2), b.bib, { lw: 0, flat: true });
  // Beak, eye, specular.
  const bk = b.bill === 'flat' ? [hx + 3.8, hy - 1.6, hx + 9.4, hy + 0.2, hx + 3.8, hy + 2.2] : [hx + 3.8, hy - 1.5, hx + 8.6 + (b.hook ? 0.8 : 0), hy + 0.8, hx + 3.8, hy + 2];
  cel(g, poly(...bk), b.beak, { lw: 1.4, flat: true });
  if (b.hook) dot(g, hx + 6.6, hy + 1.2, 0.9, '#a8552e');
  dot(g, hx + 1.9, hy - 1, 1.15, b.eye); dot(g, hx + 2.1, hy - 1, 0.55, INK);
  spec(g, hx - 1.6, hy - 2.4, 0.8);
  g.restore();
}

/* ------------------------------------------------------------------ flying birds and bats (from above, heading +x) */

const SPREAD = [1, 0.72, 0.38, 0.72];

function wingShape(side: number, w: number, sweep: number, root: number, chord: number, scallop = false): Trace {
  return (g) => {
    g.moveTo(chord * 0.45, side * root);
    g.quadraticCurveTo(chord * 0.55 + sweep * 0.3, side * w * 0.55, -sweep + chord * 0.1, side * w);
    if (scallop) {
      g.lineTo(-sweep - chord * 0.2, side * w * 0.78);
      g.quadraticCurveTo(-sweep - chord * 0.5, side * w * 0.72, -sweep - chord * 0.55, side * w * 0.5);
      g.quadraticCurveTo(-sweep - chord * 0.7, side * w * 0.3, -chord * 0.7, side * root);
    } else {
      g.lineTo(-sweep - chord * 0.55, side * w * 0.9);
      g.quadraticCurveTo(-sweep - chord * 0.4, side * w * 0.45, -chord * 0.7, side * root);
    }
    g.closePath();
  };
}

function flyBird(g: G, b: Bird, f: number, span: number) {
  const sp = SPREAD[f]!, s = b.s;
  g.save();
  g.scale(s, s);
  const w = span * sp, sweep = 2 + (1 - sp) * 6;
  // Far wing, tail, body, near wing: from above both wings sit left and right of the body.
  for (const side of [-1, 1]) {
    cel(g, wingShape(side, w, sweep, 3.4, 9), side > 0 ? shade(b.wing, 0.86) : b.wing, { lw: 1.9, band: 1.3 });
    if (w > 10) {
      g.save(); g.lineWidth = 1.5; g.strokeStyle = b.tip; g.lineCap = 'round';
      g.beginPath(); g.moveTo(-sweep - 1.5, side * w * 0.96); g.lineTo(-sweep - 5, side * w * 0.8); g.moveTo(-sweep + 0.5, side * w * 0.9); g.lineTo(-sweep - 2.4, side * w * 0.62); g.stroke(); g.restore();
    }
  }
  cel(g, poly(-6, -2.6, -15 * b.tail, -4.2, -16 * b.tail, 0, -15 * b.tail, 4.2, -6, 2.6), b.wing, { lw: 1.8, band: 1 });
  cel(g, ell(0, 0, 9.5, 4.8), b.body, { lw: 1.9 });
  cel(g, ell(9, 0, 3.7, 3.4), b.head, { lw: 1.8, band: 1 });
  cel(g, poly(11.5, -1.2, 15.2, 0, 11.5, 1.2), b.beak, { lw: 1.3, flat: true });
  spec(g, 8.4, -1.6, 0.7);
  g.restore();
}

function flyBat(g: G, f: number) {
  const sp = SPREAD[f]!, w = 21 * sp, sweep = 3 + (1 - sp) * 8, wing = '#3b4058';
  for (const side of [-1, 1]) cel(g, wingShape(side, w, sweep, 3, 8, true), side > 0 ? shade(wing, 0.85) : wing, { lw: 1.9, band: 1.2 });
  cel(g, ell(-1, 0, 6.5, 3.8), '#4a5068', { lw: 1.9 });
  cel(g, ell(6.4, 0, 3.4, 3.1), '#4a5068', { lw: 1.8, band: 1 });
  cel(g, poly(6.4, -2.2, 8.8, -5.2, 9.8, -1.8), '#4a5068', { lw: 1.3, flat: true });
  cel(g, poly(6.4, 2.2, 8.8, 5.2, 9.8, 1.8), '#4a5068', { lw: 1.3, flat: true });
  dot(g, 8.6, -1, 0.8, '#ff5a1f'); dot(g, 8.6, 1, 0.8, '#ff5a1f');
}

/* ------------------------------------------------------------------ ground critters (from above, heading +x, frames 0-3 gait, 4 sit, 5 nap) */

type Beast = { len: number; w: number; body: string; marks: string; belly: string; head: number; ear: 'point' | 'round' | 'flop'; tail: 'whip' | 'curl' | 'brush' | 'stub'; tailCol: string; tailTip?: string; nose: string; feet: string; eye: string; stripes?: boolean; s: number; snout: number };

const BEASTS: Record<'rat' | 'mouse' | 'cat' | 'dog' | 'fox', Beast> = {
  rat: { s: 1.2, len: 14, w: 4.4, body: '#7c746a', marks: '#5a544c', belly: '#a89c8c', head: 3.4, ear: 'round', tail: 'whip', tailCol: '#c4958a', nose: '#d99a9a', feet: '#c4958a', eye: '#1c1f26', snout: 3.2 },
  mouse: { s: 0.85, len: 14, w: 4.4, body: '#b8b0a0', marks: '#8f8878', belly: '#e2dccb', head: 3.4, ear: 'round', tail: 'whip', tailCol: '#d6a8a0', nose: '#e8a8a8', feet: '#d6a8a0', eye: '#1c1f26', snout: 3.2 },
  cat: { s: 1.25, len: 24, w: 6.6, body: '#cf8a46', marks: '#a45a24', belly: '#ecd6a8', head: 6.2, ear: 'point', tail: 'curl', tailCol: '#cf8a46', nose: '#e8a8a8', feet: '#ece6d6', eye: '#bcd65a', stripes: true, snout: 4 },
  dog: { s: 1.2, len: 30, w: 8.2, body: '#b4a07a', marks: '#7d6a50', belly: '#d8c8a0', head: 7, ear: 'flop', tail: 'stub', tailCol: '#b4a07a', nose: '#1c1f26', feet: '#8a7556', eye: '#1c1f26', snout: 6 },
  fox: { s: 1.2, len: 28, w: 7, body: '#cf6a2e', marks: '#8f3f1a', belly: '#ece6d6', head: 6.2, ear: 'point', tail: 'brush', tailCol: '#cf6a2e', tailTip: '#ece6d6', nose: '#1c1f26', feet: '#3d3128', eye: '#ffd34d', snout: 6.5 },
};
export type BeastKind = keyof typeof BEASTS;

function tailOf(g: G, b: Beast, f: number, ox: number, curled = false) {
  const wob = Math.sin(f * 1.57) * 2;
  if (b.tail === 'whip') limb(g, [ox, 0, ox - 6, wob * 0.8, ox - 11, -wob * 0.6 + 1, ox - 16, wob], b.tailCol, 1.8);
  else if (b.tail === 'curl') limb(g, [ox, 0, ox - 5, 3 + wob * 0.4, ox - 10, 6, ox - 14, 5, ox - 17, 1], b.tailCol, 3.2);
  else if (b.tail === 'brush') {
    cel(g, ell(ox - 8, wob * 0.5, 10, 4.4, wob * 0.05), b.tailCol, { lw: 2 });
    cel(g, ell(ox - 15, wob * 0.55, 3.6, 3.4), b.tailTip ?? b.tailCol, { lw: 1.6, band: 1 });
  } else cel(g, ell(ox - 3, wob * 0.4, 4, 2.6, wob * 0.08), b.tailCol, { lw: 1.8, band: 1 });
  void curled;
}

function walkBeast(g: G, b: Beast, f: number) {
  const hl = b.len / 2, ph = f * 1.57;
  g.save(); g.scale(b.s, b.s);
  contact(g, hl + 3, b.w + 2, 1, 2);
  tailOf(g, b, f, -hl + 1);
  // Feet: diagonal pairs swing together.
  const reach = b.len * 0.22;
  for (const [fx, side, p] of [[hl * 0.55, -1, 0], [hl * 0.55, 1, Math.PI], [-hl * 0.55, -1, Math.PI], [-hl * 0.55, 1, 0]] as const) {
    const x = fx + Math.sin(ph + p) * reach * 0.6;
    cel(g, ell(x, side * (b.w * 0.82), 2.6 + b.len * 0.03, 1.8 + b.len * 0.015), b.feet, { lw: 1.4, band: 0.8 });
  }
  cel(g, (c) => { c.moveTo(-hl, 0); c.ellipse(0, 0, hl, b.w, 0, 0, TAU); }, b.body);
  if (b.stripes) for (const x of [-hl * 0.55, -hl * 0.1, hl * 0.35]) { g.save(); g.lineWidth = 2; g.strokeStyle = b.marks; g.lineCap = 'round'; g.beginPath(); g.moveTo(x, -b.w * 0.78); g.lineTo(x + 0.6, b.w * 0.78); g.stroke(); g.restore(); }
  else cel(g, ell(-hl * 0.1, 0, hl * 0.55, b.w * 0.55), b.marks, { lw: 0, flat: true });
  headOf(g, b, hl);
  g.restore();
}

function headOf(g: G, b: Beast, hx: number, tilt = 0) {
  const hr = b.head;
  g.save(); g.translate(hx, 0); g.rotate(tilt);
  if (b.ear === 'flop') for (const side of [-1, 1]) cel(g, ell(-1, side * (hr * 0.95), hr * 0.62, hr * 0.42, side * 0.4), b.marks, { lw: 1.6, band: 0.8 });
  // Snout first so the skull overlaps it.
  cel(g, ell(hr * 0.55 + b.snout * 0.4, 0, b.snout * 0.8, hr * (b.ear === 'point' && b.snout > 5 ? 0.38 : 0.55)), b.body, { lw: 1.7, band: 0.9 });
  cel(g, ell(0, 0, hr, hr * 0.9), b.body, { lw: 1.9 });
  if (b.ear === 'point') for (const side of [-1, 1]) cel(g, poly(-hr * 0.2, side * hr * 0.55, -hr * 0.35, side * hr * 1.4, hr * 0.5, side * hr * 0.8), b.body, { lw: 1.5, band: 0.8 });
  if (b.ear === 'round') for (const side of [-1, 1]) { cel(g, ell(-hr * 0.2, side * hr * 0.95, hr * 0.5, hr * 0.5), b.nose, { lw: 1.4, band: 0.6 }); }
  dot(g, hr * 0.55 + b.snout * 1.05, 0, Math.max(1, hr * 0.2), b.nose);
  for (const side of [-1, 1]) dot(g, hr * 0.35, side * hr * 0.42, 0.95, b.eye === '#1c1f26' ? INK : b.eye);
  if (b.eye !== '#1c1f26') for (const side of [-1, 1]) dot(g, hr * 0.38, side * hr * 0.42, 0.45, INK);
  spec(g, -hr * 0.1, -hr * 0.45, 0.7);
  g.restore();
}

function restBeast(g: G, b: Beast, kind: 'sit' | 'nap') {
  g.save(); g.scale(b.s, b.s);
  const hl = b.len / 2;
  if (kind === 'sit') {
    contact(g, hl * 0.8, b.w + 3, 0, 2);
    tailOf(g, b, 0, -hl * 0.7);
    cel(g, ell(-hl * 0.15, 0, hl * 0.62, b.w * 0.95), b.body);
    if (b.stripes) for (const x of [-hl * 0.5, -hl * 0.1]) { g.save(); g.lineWidth = 2; g.strokeStyle = b.marks; g.lineCap = 'round'; g.beginPath(); g.moveTo(x, -b.w * 0.7); g.lineTo(x + 0.6, b.w * 0.7); g.stroke(); g.restore(); }
    for (const side of [-1, 1]) cel(g, ell(hl * 0.3, side * b.w * 0.62, hl * 0.2, 1.8), b.feet, { lw: 1.4, band: 0.7 });
    headOf(g, b, hl * 0.62);
  } else {
    contact(g, hl * 0.8, b.w + 3, 0, 2);
    // Curled up: a fat ring of body, the head tucked on the front paws, the tail wrapped round.
    cel(g, ell(0, 0, hl * 0.7, b.w * 1.15), b.body);
    if (b.stripes) for (const x of [-hl * 0.35, 0, hl * 0.3]) { g.save(); g.lineWidth = 2; g.strokeStyle = b.marks; g.lineCap = 'round'; g.beginPath(); g.moveTo(x - 1, -b.w * 0.95); g.lineTo(x + 1, -b.w * 0.2); g.stroke(); g.restore(); }
    else cel(g, ell(-hl * 0.15, -b.w * 0.2, hl * 0.4, b.w * 0.5), b.marks, { lw: 0, flat: true });
    g.save(); g.lineCap = 'round';
    g.beginPath(); g.arc(0, 0, hl * 0.62, 0.3, 2.6); g.lineWidth = (b.tail === 'brush' ? 7 : 4.4) + 1.8; g.strokeStyle = INK; g.stroke();
    g.lineWidth = b.tail === 'brush' ? 7 : 4.4; g.strokeStyle = b.tailCol; g.stroke();
    if (b.tailTip) { g.beginPath(); g.arc(0, 0, hl * 0.62, 2.1, 2.6); g.strokeStyle = b.tailTip; g.stroke(); }
    g.restore();
    g.save(); g.translate(hl * 0.18, b.w * 0.55); headOf(g, { ...b, snout: b.snout * 0.7 }, 0, -0.5); g.restore();
  }
  g.restore();
}

/* ------------------------------------------------------------------ butterflies, moths, fish, litter */

function flyWings(g: G, f: number, c: { wing: string; edge: string; low: string; span: number; moth?: boolean }) {
  const sp = [1, 0.6, 0.22][f]!, w = c.span * sp;
  for (const side of [-1, 1]) {
    cel(g, (t) => { t.moveTo(1, 0); t.quadraticCurveTo(c.moth ? -1 : 5, side * w * 0.9, c.moth ? -5 : 1, side * w); t.quadraticCurveTo(-5, side * w * 0.9, -2, side * 1); t.closePath(); }, c.wing, { lw: 1.5, band: 0.9 });
    cel(g, (t) => { t.moveTo(-1.5, side * 0.5); t.quadraticCurveTo(-5, side * w * 0.6, c.moth ? -9 : -7, side * w * 0.7); t.quadraticCurveTo(-6, side * 1, -1.5, side * 0.5); t.closePath(); }, c.low, { lw: 1.4, band: 0.8 });
    if (!c.moth && w > 3) dot(g, 0.6, side * w * 0.62, 1.1, c.edge);
  }
  cel(g, ell(-0.5, 0, 4.2, 1.6), '#3d3128', { lw: 1.3, flat: true });
  g.save(); g.lineWidth = 1.1; g.strokeStyle = INK; g.lineCap = 'round'; g.beginPath(); g.moveTo(3.4, -0.6); g.lineTo(6.4, -2.4); g.moveTo(3.4, 0.6); g.lineTo(6.4, 2.4); g.stroke(); g.restore();
}

function fishShadow(g: G, f: number) {
  const sway = [-1.8, 0, 1.8][f]!;
  g.fillStyle = 'rgba(14, 30, 40, 0.55)';
  g.beginPath(); g.ellipse(1, 0, 10, 4.2, 0, 0, TAU); g.fill();
  g.beginPath(); g.moveTo(-8, 0); g.lineTo(-15, sway - 4.4); g.lineTo(-13, sway); g.lineTo(-15, sway + 4.4); g.closePath(); g.fill();
  g.fillStyle = 'rgba(180, 220, 230, 0.16)'; g.beginPath(); g.ellipse(2, -1.4, 6, 1.4, 0, 0, TAU); g.fill();
}

function tumbleweed(g: G) {
  const r = seeded(77);
  contact(g, 13, 11, 2, 3);
  cel(g, ell(0, 0, 12.5, 12), '#a8935f', { lw: 2.2, band: 2 });
  g.save(); g.beginPath(); g.arc(0, 0, 12, 0, TAU); g.clip();
  g.lineCap = 'round';
  for (const [w, col] of [[3.4, INK], [1.5, '#d9c690']] as const) {
    const q = seeded(77);
    g.lineWidth = w; g.strokeStyle = col;
    for (let i = 0; i < 9; i++) {
      const a = q() * TAU, rr = 4 + q() * 9, a2 = a + 1.2 + q() * 1.8;
      g.beginPath(); g.arc(Math.cos(a) * 3, Math.sin(a) * 3, rr, a, a2); g.stroke();
    }
  }
  g.restore();
  void r;
}

function leaf(g: G, v: number) {
  const col = ['#a8552e', '#c9a24a', '#6c7356'][v]!;
  cel(g, (t) => { t.moveTo(-6, 0); t.quadraticCurveTo(-1, -5, 6, 0); t.quadraticCurveTo(-1, 5, -6, 0); t.closePath(); }, col, { lw: 1.4, band: 1 });
  g.save(); g.lineWidth = 1; g.strokeStyle = shade(col, 0.6); g.beginPath(); g.moveTo(-5.5, 0); g.lineTo(3.5, 0); g.stroke(); g.restore();
}

function paper(g: G, v: number) {
  contact(g, 7, 5, 1, 4);
  if (v === 0) {
    cel(g, poly(-6, -8, 5, -7.4, 6.4, 7.6, -5.4, 8), '#e2dccb', { lw: 1.5, band: 1 });
    g.save(); g.lineWidth = 1.2; g.strokeStyle = '#8f8a7a'; g.lineCap = 'round';
    g.beginPath(); for (const y of [-4.5, -1.5, 1.5, 4.5]) { g.moveTo(-3.6, y); g.lineTo(3.8 - (y > 3 ? 3 : 0), y + 0.2); } g.stroke(); g.restore();
    cel(g, poly(3.6, 5.2, 6.4, 7.6, 1.4, 7.8), '#cfc7b3', { lw: 1.2, flat: true });
  } else {
    cel(g, poly(-5, -5, -1, -8, 4, -6.4, 7, -1, 5, 5.5, 0, 8, -5.4, 4.6, -7, -0.5), '#d6cfbb', { lw: 1.5, band: 1.2 });
    g.save(); g.lineWidth = 1.2; g.strokeStyle = '#8f8a7a'; g.lineCap = 'round'; g.beginPath(); g.moveTo(-3, -2); g.lineTo(2, -3); g.moveTo(-3.4, 1); g.lineTo(3, 2.4); g.stroke(); g.restore();
  }
}

function glowDot(g: G, rgb: string) {
  const gr = g.createRadialGradient(0, 0, 0, 0, 0, 16);
  gr.addColorStop(0, `rgba(${rgb}, 0.95)`); gr.addColorStop(0.25, `rgba(${rgb}, 0.45)`); gr.addColorStop(1, `rgba(${rgb}, 0)`);
  g.fillStyle = gr; g.fillRect(-16, -16, 32, 32);
}

/* ------------------------------------------------------------------ the sheet */

const stand = (k: StandKind): Def => ({ w: 56, h: 48, ax: 28, ay: 40, frames: 4, draw: (g, f) => standBird(g, BIRDS[k], f) });
const fly = (k: StandKind, span: number): Def => ({ w: 90, h: 90, ax: 45, ay: 45, frames: 4, draw: (g, f) => flyBird(g, BIRDS[k], f, span) });
const beast = (k: BeastKind): Def => ({ w: 84, h: 60, ax: 42, ay: 30, frames: 6, draw: (g, f) => (f < 4 ? walkBeast(g, BEASTS[k], f) : restBeast(g, BEASTS[k], f === 4 ? 'sit' : 'nap')) });

export const DEFS = {
  pigeon: stand('pigeon'), crow: stand('crow'), gull: stand('gull'), sparrow: stand('sparrow'), duck: stand('duck'),
  'pigeon.fly': fly('pigeon', 21), 'crow.fly': fly('crow', 24), 'gull.fly': fly('gull', 28), 'sparrow.fly': fly('sparrow', 22), 'duck.fly': fly('duck', 22),
  bat: { w: 64, h: 64, ax: 32, ay: 32, frames: 4, draw: (g, f) => flyBat(g, f) },
  rat: beast('rat'), mouse: beast('mouse'), cat: beast('cat'), dog: beast('dog'), fox: beast('fox'),
  butterfly: { w: 32, h: 32, ax: 16, ay: 16, frames: 3, draw: (g, f) => flyWings(g, f, { wing: '#e2943a', edge: '#1c1f26', low: '#a8552e', span: 10 }) },
  moth: { w: 32, h: 32, ax: 16, ay: 16, frames: 3, draw: (g, f) => flyWings(g, f, { wing: '#d2cab4', edge: '#7a808b', low: '#a89c8c', span: 9, moth: true }) },
  fish: { w: 40, h: 24, ax: 20, ay: 12, frames: 3, draw: fishShadow },
  tumbleweed: { w: 40, h: 40, ax: 20, ay: 20, frames: 1, draw: (g) => tumbleweed(g) },
  leaf: { w: 20, h: 20, ax: 10, ay: 10, frames: 3, draw: leaf },
  paper: { w: 24, h: 26, ax: 12, ay: 13, frames: 2, draw: paper },
  glowWarm: { w: 36, h: 36, ax: 18, ay: 18, frames: 1, draw: (g) => glowDot(g, '255, 190, 90') },
  glowGreen: { w: 36, h: 36, ax: 18, ay: 18, frames: 1, draw: (g) => glowDot(g, '200, 255, 120') },
} satisfies Record<string, Def>;
export type SpriteId = keyof typeof DEFS;

type Sheet = { canvas: HTMLCanvasElement; cells: Map<string, Cell> };
let day: Sheet | null = null, night: Sheet | null = null;
const PAD = 3;
const NO_NIGHT = new Set<SpriteId>(['glowWarm', 'glowGreen', 'fish']);

function build(): void {
  const ids = Object.keys(DEFS) as SpriteId[];
  const W = 1024;
  let x = 0, y = 0, rowH = 0;
  const places: { id: SpriteId; f: number; x: number; y: number }[] = [];
  for (const id of ids) {
    const d = DEFS[id] as Def;
    for (let f = 0; f < d.frames; f++) {
      const cw = d.w * SS + PAD * 2, ch = d.h * SS + PAD * 2;
      if (x + cw > W) { x = 0; y += rowH; rowH = 0; }
      places.push({ id, f, x, y });
      x += cw; rowH = Math.max(rowH, ch);
    }
  }
  const H = y + rowH;
  const mk = (): Sheet => { const c = document.createElement('canvas'); c.width = W; c.height = H; return { canvas: c, cells: new Map() }; };
  day = mk(); night = mk();
  const g = day.canvas.getContext('2d')!;
  for (const p of places) {
    const d = DEFS[p.id] as Def;
    g.save();
    g.beginPath(); g.rect(p.x, p.y, d.w * SS + PAD * 2, d.h * SS + PAD * 2); g.clip();
    g.translate(p.x + PAD + d.ax * SS, p.y + PAD + d.ay * SS);
    g.scale(SS, SS);
    d.draw(g, p.f);
    g.restore();
    const cell = (img: HTMLCanvasElement): Cell => ({ img, sx: p.x + PAD, sy: p.y + PAD, sw: d.w * SS, sh: d.h * SS, ax: d.ax, ay: d.ay, w: d.w, h: d.h });
    day.cells.set(`${p.id}:${p.f}`, cell(day.canvas));
    night.cells.set(`${p.id}:${p.f}`, cell(night.canvas));
  }
  // Night: the world's own multiply, applied to the whole sheet and cut back to each sprite's own alpha.
  const n = night.canvas.getContext('2d')!;
  n.drawImage(day.canvas, 0, 0);
  n.globalCompositeOperation = 'multiply';
  n.fillStyle = 'rgb(86, 100, 168)';
  n.fillRect(0, 0, W, H);
  n.globalCompositeOperation = 'destination-in';
  n.drawImage(day.canvas, 0, 0);
  n.globalCompositeOperation = 'source-over';
  // Glows and the fish shadows are light and water, not paint: they keep their day look.
  for (const p of places) if (NO_NIGHT.has(p.id)) { const d = DEFS[p.id] as Def; n.clearRect(p.x, p.y, d.w * SS + PAD * 2, d.h * SS + PAD * 2); n.drawImage(day.canvas, p.x, p.y, d.w * SS + PAD * 2, d.h * SS + PAD * 2, p.x, p.y, d.w * SS + PAD * 2, d.h * SS + PAD * 2); }
  void NIGHT;
}

/** One frame of a sprite, from the day sheet or the night one (the world's night multiply, baked). */
export function cellOf(id: SpriteId, frame: number, dark: boolean): Cell {
  if (!day) build();
  const sheet = dark ? night! : day!;
  return sheet.cells.get(`${id}:${frame}`) ?? sheet.cells.get(`${id}:0`)!;
}

/** Draws a cell with its anchor at (0, 0), `scale` times its natural size. */
export function putCell(g: G, c: Cell, scale = 1) {
  g.drawImage(c.img, c.sx, c.sy, c.sw, c.sh, -c.ax * scale, -c.ay * scale, c.w * scale, c.h * scale);
}
