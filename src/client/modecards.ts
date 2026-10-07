import { COLORS } from '../shared/defs.ts';
import { celPart, ellipse, polygon, roundBox } from './cel.ts';
import { INK, shade, tint } from './palette.ts';
import { TAU } from './menuart.ts';

/**
 * The mode cards' art (screen one of the menu): one bold emblem per fight, drawn as flat ink-outlined cel shapes on a medallion
 * that sits at the same size and the same spot on every card, over a mode-coloured ground (stencil stripes, contour lines, halftone,
 * grain, a key light from the top left). No scenes and no soldiers: the shooters people like (Call of Duty's tiles, Brawl Stars,
 * Halo, Apex) all give each mode one icon at one scale and let colour and type do the rest (see docs/art/STYLE.md).
 * Hovering lifts the emblem, slides a glint across the medallion and shifts the layers a little against the pointer.
 */
export const STAGE = { w: 360, h: 180 } as const;
export type SceneId = 'FFA' | 'TDM' | 'DOM' | 'BR' | 'ZOM' | 'RNG';

/** What each mode is called on its card and in one line. (No all-caps codes in the pitch: the chip carries the code.) */
export const MODE_INFO: Record<SceneId, { name: string; pitch: string; short: string }> = {
  FFA: { name: 'Free for all', pitch: 'Every soldier for themselves. Top score when the clock runs out wins the yard.', short: 'Free for all' },
  TDM: { name: 'Team deathmatch', pitch: 'Red against Blue. Every kill counts for your squad; hold the line together.', short: 'Team deathmatch' },
  DOM: { name: 'Domination', pitch: 'Capture the zones and keep them. Points tick up for whoever holds the ground.', short: 'Domination' },
  BR: { name: 'Last squad', pitch: 'Squads of three drop in as the storm closes the ring. Be the last squad standing.', short: 'Last squad' },
  ZOM: { name: 'Bastion squad', pitch: 'Hold the core against the horde with up to three friends. Build by day, survive the night.', short: 'Bastion squad' },
  RNG: { name: 'Shooting range', pitch: 'Your own private range. Any gun, any perk, nothing counts toward your record.', short: 'Shooting range' },
};

const BONE = '#e2dccb';
const GOLD = '#ffd34d';
const ORANGE = '#ff5a1f';
const STEEL = '#4f5560';
/** Where the medallion sits, and its radius: identical on every card. */
const MED = { x: 180, y: 98, r: 64 } as const;

/** Per mode: the ground (a dark and a darker step), the accent the bezel and stripes lean toward. */
const LOOK: Record<SceneId, { a: string; b: string; accent: string }> = {
  FFA: { a: '#8a3414', b: '#6e2810', accent: '#ff8a4f' },
  TDM: { a: '#2f438f', b: '#8a2a32', accent: '#e2dccb' },
  DOM: { a: '#2b3f8f', b: '#22336f', accent: '#8fa8ff' },
  BR: { a: '#512d78', b: '#3f235f', accent: '#c9a2ef' },
  ZOM: { a: '#43552a', b: '#34431f', accent: '#b6d77e' },
  RNG: { a: '#256470', b: '#1c5059', accent: '#8fd8e4' },
};

type Pt = readonly [number, number];
type Scene = {
  g: CanvasRenderingContext2D; k: number; t: number; hot: number; calm: boolean;
  /** The pointer, as -1..1 across the stage (0 when it is elsewhere), eased by `hot`. */
  px: number; py: number;
};

const rnd = (seed: number) => { let n = seed * 9301 + 7; return () => { n = (n * 9301 + 49297) % 233280; return n / 233280; }; };

/** A flat ink-outlined shape with the two cel steps (2px ink at 1x). */
const cel = (g: CanvasRenderingContext2D, trace: (g: CanvasRenderingContext2D) => void, base: string, size = 30, ink = 2) => celPart(g, trace, base, 0, size, ink, 0);

/** A chunky stroke: ink under, colour over, so the visible outline is 2px. */
function bar(g: CanvasRenderingContext2D, pts: readonly Pt[], color: string, w = 5, close = false) {
  g.save();
  g.lineJoin = 'round'; g.lineCap = 'round';
  g.beginPath();
  g.moveTo(pts[0]![0], pts[0]![1]);
  for (let i = 1; i < pts.length; i++) g.lineTo(pts[i]![0], pts[i]![1]);
  if (close) g.closePath();
  g.strokeStyle = INK; g.lineWidth = w + 4; g.stroke();
  g.strokeStyle = color; g.lineWidth = w; g.stroke();
  g.restore();
}

function ring(g: CanvasRenderingContext2D, x: number, y: number, r: number, color: string, w = 5, dash: number[] = [], off = 0) {
  g.save();
  g.lineCap = 'butt';
  g.setLineDash([]);
  if (!dash.length) { g.beginPath(); g.arc(x, y, r, 0, TAU); g.strokeStyle = INK; g.lineWidth = w + 4; g.stroke(); }
  g.setLineDash(dash); g.lineDashOffset = off;
  g.beginPath(); g.arc(x, y, r, 0, TAU); g.strokeStyle = color; g.lineWidth = w; g.stroke();
  g.restore();
}

const star = (cx: number, cy: number, ro: number, ri: number, n = 5, rot = -Math.PI / 2) => (g: CanvasRenderingContext2D) => {
  for (let i = 0; i < n * 2; i++) {
    const a = rot + (i * Math.PI) / n, r = i & 1 ? ri : ro;
    if (i) g.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r); else g.moveTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
  }
  g.closePath();
};

// ---- the ground

/** Mode-coloured ground: two flat steps split on a diagonal, stencil stripes, contour lines, halftone, a key light, grain. */
function ground(s: Scene, id: SceneId) {
  const { g } = s;
  const L = LOOK[id];
  const W = STAGE.w, H = STAGE.h;
  const ox = -s.px * 3, oy = -s.py * 2;
  g.fillStyle = L.a; g.fillRect(0, 0, W, H);
  // Step two: the far (lower right) side, a hard diagonal. TDM splits red and blue across it.
  g.fillStyle = L.b;
  g.beginPath(); g.moveTo(W * 0.62 + ox, 0); g.lineTo(W, 0); g.lineTo(W, H); g.lineTo(W * 0.34 + ox, H); g.closePath(); g.fill();
  // Stencil stripes, running with the split.
  g.save();
  g.fillStyle = 'rgba(236, 230, 214, 0.06)';
  const dx = ox * 1.6;
  for (let i = -4; i < 16; i++) {
    const x = i * 38 + dx;
    g.beginPath(); g.moveTo(x, 0); g.lineTo(x + 14, 0); g.lineTo(x - 70 + 14, H); g.lineTo(x - 70, H); g.closePath(); g.fill();
  }
  g.restore();
  // Contour lines: a few wobbly rings round a point low right, like a map's hill.
  g.save();
  g.translate(300 + ox * 0.6, 150 + oy * 0.6);
  g.strokeStyle = 'rgba(236, 230, 214, 0.1)'; g.lineWidth = 2; g.lineJoin = 'round';
  for (let i = 1; i <= 7; i++) {
    g.beginPath();
    for (let a = 0; a <= 48; a++) {
      const th = (a / 48) * TAU, r = i * 17 * (1 + 0.1 * Math.sin(th * 3 + i * 0.7) + 0.05 * Math.sin(th * 5 + id.length));
      const x = Math.cos(th) * r * 1.35, y = Math.sin(th) * r * 0.9;
      if (a) g.lineTo(x, y); else g.moveTo(x, y);
    }
    g.stroke();
  }
  g.restore();
  // Halftone fading toward the bottom right.
  g.fillStyle = 'rgba(10, 12, 18, 0.28)';
  for (let j = 0; j < 14; j++) {
    for (let i = 0; i < 28; i++) {
      const x = 4 + i * 13 + (j & 1) * 6.5 + ox * 0.4, y = 4 + j * 13 + oy * 0.4;
      const f = ((x / W) * 0.55 + (y / H) * 0.75 - 0.55) * 2.2;
      if (f <= 0.05) continue;
      g.beginPath(); g.arc(x, y, Math.min(3.1, f * 3.1), 0, TAU); g.fill();
    }
  }
  // Key light from the top left: light itself, so a gradient is allowed.
  const gr = g.createRadialGradient(40, -10, 0, 40, -10, 250);
  gr.addColorStop(0, 'rgba(255, 244, 222, 0.34)');
  gr.addColorStop(0.5, 'rgba(255, 244, 222, 0.1)');
  gr.addColorStop(1, 'rgba(255, 244, 222, 0)');
  g.fillStyle = gr; g.fillRect(0, 0, W, H);
  // Grain.
  const r = rnd(id.charCodeAt(0) * 31 + id.length);
  for (let i = 0; i < 170; i++) {
    g.fillStyle = r() < 0.5 ? 'rgba(255, 255, 255, 0.07)' : 'rgba(0, 0, 0, 0.1)';
    g.fillRect(Math.floor(r() * W), Math.floor(r() * H), 2, 2);
  }
}

/** TDM's ground is two sides: blue left, red right, the hard split under the clash. */
function groundTDM(s: Scene) {
  const { g } = s;
  const W = STAGE.w, H = STAGE.h, ox = -s.px * 3;
  ground(s, 'TDM');
  g.save();
  g.fillStyle = '#8f2c35';
  g.beginPath(); g.moveTo(W * 0.56 + ox, 0); g.lineTo(W, 0); g.lineTo(W, H); g.lineTo(W * 0.44 + ox, H); g.closePath(); g.fill();
  g.fillStyle = 'rgba(10, 12, 18, 0.3)';
  g.beginPath(); g.moveTo(W * 0.75 + ox, 0); g.lineTo(W, 0); g.lineTo(W, H); g.lineTo(W * 0.62 + ox, H); g.closePath(); g.fill();
  g.restore();
}

// ---- the medallion

/** The same bezel on every card: ink ring, gunmetal plate, bone tick marks, and a dark well tinted to the mode. */
function medallion(s: Scene, id: SceneId) {
  const { g } = s;
  const L = LOOK[id];
  const { x, y, r } = MED;
  g.save();
  g.translate(x, y);
  cel(g, ellipse(0, 0, r, r), STEEL, r * 0.9, 2.5);
  // Tick marks round the bezel, turning a hair when the card is up.
  const spin = s.calm ? 0 : s.hot * 0.5;
  g.fillStyle = 'rgba(236, 230, 214, 0.55)';
  for (let i = 0; i < 36; i++) {
    const a = (i / 36) * TAU + spin;
    g.save(); g.rotate(a);
    g.fillRect(r - 6.5, -1, i % 3 === 0 ? 4.5 : 3, 2);
    g.restore();
  }
  const well = shade(L.a, 0.5);
  cel(g, ellipse(0, 0, r - 10, r - 10), well, r * 0.7, 2.5);
  g.restore();
}

/** Every emblem is drawn in a box 84 units across, centred on the origin. */
type Emblem = (s: Scene) => void;

const crosshair: Emblem = (s) => {
  const { g } = s;
  g.save();
  g.rotate(s.calm ? 0 : s.hot * 0.35 + Math.sin(s.t / 2600) * 0.03);
  ring(g, 0, 0, 30, BONE, 6);
  for (const [a, b] of [[-42, -20], [20, 42]] as const) {
    bar(g, [[a, 0], [b, 0]], BONE, 6);
    bar(g, [[0, a], [0, b]], BONE, 6);
  }
  g.restore();
  cel(g, star(0, 1, 17, 7.5), GOLD, 17);
};

const chevrons: Emblem = (s) => {
  const { g } = s;
  const c = (dx: number, flip: number, col: string) => {
    const f = (x: number) => x * flip;
    cel(g, polygon([f(dx - 9), -26], [f(dx), -26], [f(dx + 17), 0], [f(dx), 26], [f(dx - 9), 26], [f(dx + 8), 0]), col, 22);
  };
  const clash = s.calm ? 0 : s.hot * 3;
  g.save(); g.translate(clash, 0); c(-34, 1, COLORS.blue); c(-19, 1, COLORS.blue); g.restore();
  g.save(); g.translate(-clash, 0); c(-34, -1, COLORS.red); c(-19, -1, COLORS.red); g.restore();
};

const zones: Emblem = (s) => {
  const { g } = s;
  ring(g, 0, 0, 34, BONE, 5, [], 0);
  // Pole and pennant.
  const w = s.calm ? 0 : Math.sin(s.t / 420) * 1.6;
  bar(g, [[0, 14], [0, -22]], BONE, 4);
  cel(g, polygon([2, -22], [22, -17 + w], [2, -8]), COLORS.blue, 14);
  cel(g, ellipse(0, -24, 3.6, 3.6), GOLD, 4, 1.6);
  const pip = (x: number, y: number, label: string, own: boolean) => {
    cel(g, ellipse(x, y, 10, 10), own ? COLORS.blue : BONE, 12);
    g.save();
    g.font = '900 15px "Barlow Condensed", sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillStyle = own ? '#f4f1e6' : INK;
    g.fillText(label, x, y + 1);
    g.restore();
  };
  pip(-30, 17, 'A', true); pip(0, -34, 'B', false); pip(30, 17, 'C', false);
};

const storm: Emblem = (s) => {
  const { g } = s;
  const safe = 28 + (s.calm ? 0 : Math.sin(s.t / 1700) * 1.5 - s.hot * 3);
  const cx = -4, cy = 3;
  // The storm is the shaded ground outside the safe circle (even-odd), the ring marks the edge.
  g.save();
  g.beginPath(); g.arc(0, 0, 41, 0, TAU); g.arc(cx, cy, safe, 0, TAU, true);
  g.fillStyle = '#7a45b4'; g.fill('evenodd');
  g.restore();
  ring(g, 0, 0, 41, '#c9a2ef', 4, [10, 7], s.calm ? 0 : -s.t / 70);
  ring(g, cx, cy, safe, BONE, 4);
  // Three helmets, one squad.
  const helm = (x: number, y: number) => {
    cel(g, (c) => { c.arc(x, y, 9.5, Math.PI, 0); c.lineTo(x + 10.5, y + 4); c.lineTo(x - 10.5, y + 4); c.closePath(); }, COLORS.purple, 10, 1.8);
    g.fillStyle = INK; g.fillRect(x - 6, y - 1, 12, 3);
  };
  helm(cx, cy - 9); helm(cx - 15, cy + 10); helm(cx + 15, cy + 10);
};

const bastion: Emblem = (s) => {
  const { g } = s;
  const bob = s.calm ? 0 : Math.sin(s.t / 800) * 1.6;
  const pulse = s.calm ? 0.5 : 0.5 + 0.5 * Math.sin(s.t / 900);
  // The core is its own light: a hard cyan disc of glow behind the gem.
  g.save();
  g.globalCompositeOperation = 'lighter';
  g.fillStyle = `rgba(79, 209, 232, ${0.16 + 0.1 * pulse + 0.1 * s.hot})`;
  g.beginPath(); g.arc(-3, -9, 31, 0, TAU); g.fill();
  g.restore();
  // Sandbags, two rows, the front of the wall.
  const bag = (x: number, y: number) => cel(g, roundBox(x - 11, y - 6, x + 11, y + 6, 5), '#b4a07a', 12, 1.8);
  bag(-23, 31); bag(0, 31); bag(23, 31); bag(-11, 21); bag(11, 21);
  g.save();
  g.translate(-3, -10 + bob);
  g.scale(0.85, 0.85);
  cel(g, polygon([0, -28], [16, -9], [12, 17], [0, 26], [-12, 17], [-16, -9]), '#4fd1e8', 26);
  g.fillStyle = 'rgba(255, 255, 255, 0.9)';
  g.beginPath(); g.moveTo(-7, -13); g.lineTo(-3, -18); g.lineTo(-2, -7); g.lineTo(-7, -3); g.closePath(); g.fill();
  g.restore();
  // Claw marks from the right: three slashes, bone with ink under.
  for (let i = 0; i < 3; i++) bar(g, [[24 + i * 7, -36 + i * 1.5], [34 + i * 7, -6 + i * 1.5]], BONE, 3.4);
};

const bullseye: Emblem = (s) => {
  const { g } = s;
  g.save();
  g.translate(0, -5);
  cel(g, ellipse(0, 0, 33, 33), BONE, 30);
  cel(g, ellipse(0, 0, 25, 25), '#3d4450', 25, 1.8);
  cel(g, ellipse(0, 0, 17, 17), BONE, 17, 1.8);
  cel(g, ellipse(0, 0, 9.5, 9.5), ORANGE, 9, 1.8);
  // Holes, and a fresh one that kicks when the card is up.
  g.fillStyle = INK;
  for (const [x, y] of [[4, -3], [-7, 9], [12, 11]] as const) { g.beginPath(); g.arc(x, y, 2.2, 0, TAU); g.fill(); }
  const kick = s.calm ? 0 : s.hot * Math.max(0, 1 - ((s.t % 1500) / 300));
  if (kick > 0) { g.strokeStyle = `rgba(255, 224, 138, ${kick})`; g.lineWidth = 3; g.beginPath(); g.arc(1, 0, 5 + (1 - kick) * 20, 0, TAU); g.stroke(); }
  g.restore();
  // Distance ticks under it, long at each hundred.
  const y = 36;
  bar(g, [[-34, y], [34, y]], BONE, 3);
  g.fillStyle = BONE;
  for (let i = 0; i <= 6; i++) { const x = -30 + i * 10; const long = i % 3 === 0; g.fillRect(x - 1.5, y - (long ? 9 : 5), 3, long ? 9 : 5); }
};

const EMBLEMS: Record<SceneId, { draw: Emblem; k: number }> = {
  FFA: { draw: crosshair, k: 1.18 }, TDM: { draw: chevrons, k: 1.12 }, DOM: { draw: zones, k: 1.1 },
  BR: { draw: storm, k: 1.16 }, ZOM: { draw: bastion, k: 1.1 }, RNG: { draw: bullseye, k: 1.14 },
};

let scratch: HTMLCanvasElement | null = null;

/** Paints one card's art into the stage. `k` is canvas pixels per stage unit; `ptr` is the pointer in stage units. */
export function paintScene(id: SceneId, g: CanvasRenderingContext2D, k: number, t: number, hot: number, ptr: { x: number; y: number } | null, calm: boolean) {
  const px = ptr && hot > 0.02 ? Math.max(-1, Math.min(1, (ptr.x - STAGE.w / 2) / (STAGE.w / 2))) * hot : 0;
  const py = ptr && hot > 0.02 ? Math.max(-1, Math.min(1, (ptr.y - STAGE.h / 2) / (STAGE.h / 2))) * hot : 0;
  const s: Scene = { g, k, t, hot: calm ? 0 : hot, calm, px, py };
  g.save();
  g.setTransform(k, 0, 0, k, 0, 0);
  g.lineJoin = 'round';
  if (id === 'TDM') groundTDM(s); else ground(s, id);
  // The medallion's shadow: a hard shape down and to the right, like every plate in the menu.
  const lift = s.hot * 4;
  g.fillStyle = 'rgba(10, 12, 18, 0.38)';
  g.beginPath(); g.arc(MED.x + 6 + px * 1.5, MED.y + 8 + lift * 0.6, MED.r + 1, 0, TAU); g.fill();
  g.save(); g.translate(px * 2, py * 1.5); medallion(s, id); g.restore();
  // The emblem goes on a scratch layer so one hard shadow falls under the whole silhouette, not under every shape.
  const cw = g.canvas.width, ch = g.canvas.height;
  const sc = (scratch ??= document.createElement('canvas'));
  if (sc.width !== cw || sc.height !== ch) { sc.width = cw; sc.height = ch; }
  const e = sc.getContext('2d')!;
  e.setTransform(1, 0, 0, 1, 0, 0);
  e.clearRect(0, 0, cw, ch);
  e.setTransform(k, 0, 0, k, 0, 0);
  e.lineJoin = 'round';
  const em = EMBLEMS[id];
  e.translate(MED.x + px * 4.5, MED.y - lift + py * 3);
  const grow = em.k * (1 + 0.06 * s.hot);
  e.scale(grow, grow);
  em.draw({ ...s, g: e });
  g.save();
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.shadowColor = 'rgba(10, 12, 18, 0.45)';
  g.shadowOffsetX = 3 * k; g.shadowOffsetY = (4 + lift * 0.4) * k;
  g.drawImage(sc, 0, 0);
  g.restore();
  // The glint: a skewed band of light across the medallion, a quick pass now and then, a steady one while the card is up.
  if (!calm) {
    const cyc = s.hot > 0.05 ? (t / 1100) % 2.2 : (t / 7000) % 1;
    const f = s.hot > 0.05 ? cyc / 1.2 : cyc / 0.12;
    if (f >= 0 && f <= 1) {
      g.save();
      g.beginPath(); g.arc(MED.x, MED.y, MED.r - 10, 0, TAU); g.clip();
      g.globalCompositeOperation = 'lighter';
      g.fillStyle = `rgba(255, 244, 222, ${0.2 * Math.sin(f * Math.PI)})`;
      const x = MED.x - 90 + f * 180;
      g.beginPath(); g.moveTo(x, MED.y - 70); g.lineTo(x + 22, MED.y - 70); g.lineTo(x - 18, MED.y + 70); g.lineTo(x - 40, MED.y + 70); g.closePath(); g.fill();
      g.restore();
    }
  }
  // A hard ink frame; the DOM plate adds the bevel.
  g.strokeStyle = INK;
  g.lineWidth = 3;
  g.strokeRect(0, 0, STAGE.w, STAGE.h);
  g.restore();
  void tint;
}

type Entry = { canvas: HTMLCanvasElement; id: SceneId; card: HTMLElement; hot: number; target: number; ptr: { x: number; y: number } | null; last: number; seen: boolean };

/** Runs every card's art on one clock: the hovered card at ~30 fps, the rest slowly; nothing while off screen, hidden or calm. */
export function createModeArt(calm: () => boolean) {
  const entries = new Map<HTMLCanvasElement, Entry>();
  let raf = 0;
  let on = false;
  const io = typeof IntersectionObserver === 'function' ? new IntersectionObserver((list) => { for (const e of list) { const en = entries.get(e.target as HTMLCanvasElement); if (en) en.seen = e.isIntersecting; } }) : null;

  const size = (e: Entry) => {
    const r = e.canvas.getBoundingClientRect();
    const dpr = Math.min(2, Math.max(1, typeof devicePixelRatio === 'number' ? devicePixelRatio : 1));
    const w = Math.max(2, Math.round(r.width * dpr));
    const h = Math.round((w * STAGE.h) / STAGE.w);
    if (e.canvas.width !== w || e.canvas.height !== h) { e.canvas.width = w; e.canvas.height = h; }
    return { w, k: w / STAGE.w, rect: r };
  };

  const draw = (e: Entry, now: number) => {
    const { k } = size(e);
    if (e.canvas.width <= 2) return;
    const g = e.canvas.getContext('2d');
    if (!g) return;
    e.last = now;
    paintScene(e.id, g, k, now, e.hot, e.ptr, calm());
  };

  const tick = (now: number) => {
    raf = on ? requestAnimationFrame(tick) : 0;
    const still = calm();
    for (const e of entries.values()) {
      if (!e.seen) continue;
      const ease = e.hot + (e.target - e.hot) * 0.2;
      e.hot = Math.abs(ease - e.target) < 0.01 ? e.target : ease;
      const busy = e.target > 0 || e.hot > 0;
      const gap = busy ? 33 : still ? 600 : 90;
      if (now - e.last >= gap) draw(e, now);
    }
  };

  return {
    add(canvas: HTMLCanvasElement, id: SceneId, card: HTMLElement) {
      const e: Entry = { canvas, id, card, hot: 0, target: 0, ptr: null, last: -1e9, seen: true };
      entries.set(canvas, e);
      io?.observe(canvas);
      const place = (ev: PointerEvent) => {
        const r = canvas.getBoundingClientRect();
        // The canvas may be cropped to the card's window (object-fit: cover, centred), so map through the same fit.
        const k = Math.max(r.width / STAGE.w, r.height / STAGE.h);
        e.ptr = { x: (ev.clientX - r.left - (r.width - STAGE.w * k) * 0.5) / k, y: (ev.clientY - r.top - (r.height - STAGE.h * k) * 0.5) / k };
      };
      card.addEventListener('pointerenter', (ev) => { if (ev.pointerType === 'touch') return; e.target = 1; place(ev); });
      card.addEventListener('pointermove', (ev) => { if (ev.pointerType !== 'touch') place(ev); });
      card.addEventListener('pointerleave', () => { e.target = 0; e.ptr = null; });
      card.addEventListener('focusin', () => { e.target = 1; if (!e.ptr) e.ptr = { x: STAGE.w * 0.62, y: STAGE.h * 0.5 }; });
      card.addEventListener('focusout', () => { e.target = 0; e.ptr = null; });
    },
    remove(canvas: HTMLCanvasElement) { io?.unobserve(canvas); entries.delete(canvas); },
    clear() { for (const c of entries.keys()) io?.unobserve(c); entries.clear(); },
    /** Repaints every card now (a resize, a step change, or the calm still). */
    paint(now = 0) { for (const e of entries.values()) draw(e, now); },
    start() { if (on) return; on = true; if (!raf) raf = requestAnimationFrame(tick); },
    stop() { on = false; },
    get running() { return on; },
  };
}

export type ModeArt = ReturnType<typeof createModeArt>;
