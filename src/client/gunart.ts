import { GUNS, type GunId, type WeaponId } from '../shared/defs.ts';

/**
 * Every gun drawn in side profile as a set of shaded vector parts, for the loadout cards, the evolve picks, the kill feed and
 * the guns corpses drop (a dropped gun lies on its side). Units are arbitrary: the bore runs along y = 0, the butt at x = 0.
 * An evolution reuses its class's art: everything past `pivot` (the barrel end) stretches by the look's length, the whole gun
 * thickens by its width, `barrel` parts repeat over-under for extra barrels, two-handed guns come as a stacked pair, and an
 * evolved gun carries its accent on the `accent` plate.
 */
type Pt = readonly [number, number];
type Tone = 'metal' | 'dark' | 'poly' | 'wood' | 'tan' | 'olive' | 'glass' | 'bead';
type Shape =
  | { kind: 'poly'; pts: readonly Pt[]; tone: Tone; barrel?: true }
  /** A stroke; `solid` ones (struts, guards, handles) belong to the silhouette, the rest are surface detail. */
  | { kind: 'line'; pts: readonly Pt[]; tone: Tone | 'shine' | 'seam'; w: number; solid?: true; barrel?: true }
  | { kind: 'dot'; at: Pt; r: number; tone: Tone; barrel?: true };
type Art = { pivot: number; accent: readonly [number, number, number, number]; shapes: readonly Shape[] };

const TONES: Record<Tone, string> = {
  metal: '#555c67', dark: '#2c3037', poly: '#666b74', wood: '#93633a', tan: '#b19d72', olive: '#6a7255', glass: '#8fc0de', bead: '#efe7d0',
};
const SHINE = 'rgba(255, 255, 255, 0.28)';
const SEAM = 'rgba(0, 0, 0, 0.55)';
const EDGE = 'rgba(8, 9, 11, 0.75)';

const poly = (tone: Tone, ...pts: Pt[]): Shape => ({ kind: 'poly', pts, tone });
const rect = (tone: Tone, x: number, y: number, w: number, h: number): Shape => poly(tone, [x, y], [x + w, y], [x + w, y + h], [x, y + h]);
const barrel = (s: Shape): Shape => ({ ...s, barrel: true });
const line = (tone: Tone | 'shine' | 'seam', w: number, ...pts: Pt[]): Shape => ({ kind: 'line', pts, tone, w });
const solid = (tone: Tone, w: number, ...pts: Pt[]): Shape => ({ kind: 'line', pts, tone, w, solid: true });
const dot = (tone: Tone, x: number, y: number, r: number): Shape => ({ kind: 'dot', at: [x, y], r, tone });
const teeth = (x0: number, x1: number, step: number, y0: number, y1: number): Shape[] => {
  const out: Shape[] = [];
  for (let x = x0; x <= x1; x += step) out.push(line('seam', 0.6, [x, y0], [x, y1]));
  return out;
};
const slots = (xs: number[], y: number, w: number, h: number): Shape[] => xs.map((x) => rect('dark', x, y, w, h));

const ART: Record<WeaponId, Art> = {
  pistol: {
    pivot: 44,
    accent: [24, -7.6, 18, 1.8],
    shapes: [
      poly('poly', [13, 1], [27, 1], [23, 27], [9, 27], [7, 24], [10, 12]),
      ...[9, 13, 17, 21].map((y) => line('seam', 0.5, [11.5 - y * 0.12, y], [24.5 - y * 0.14, y])),
      rect('dark', 7.5, 27, 16.5, 3),
      poly('poly', [12, -1], [58, -1], [58, 3], [30, 3], [28, 5], [16, 5], [12, 2]),
      solid('dark', 1.6, [27, 3], [27, 9], [30, 11], [40, 11], [42, 8], [42, 3]),
      line('dark', 1.4, [32, 3], [33.5, 7], [32.5, 9]),
      poly('metal', [10, -9], [60, -9], [62, -7], [62, -1], [10, -1]),
      ...teeth(13, 21, 2, -8, -2.5),
      rect('dark', 34, -8, 10, 3),
      line('shine', 0.8, [11, -8.4], [59, -8.4]),
      rect('dark', 11, -11, 4, 2),
      rect('dark', 57, -10.5, 2, 1.5),
      barrel(rect('dark', 61.5, -5.5, 1, 3)),
    ],
  },
  smg: {
    pivot: 64,
    accent: [30, -6.8, 22, 2],
    shapes: [
      solid('metal', 2.2, [0, -6], [22, -4]),
      solid('metal', 2.2, [0, 6], [22, 2]),
      rect('poly', -2.5, -9, 4.5, 18),
      poly('poly', [30, 6], [39, 6], [37, 24], [28, 24], [27, 20]),
      ...[11, 15, 19].map((y) => line('seam', 0.5, [29, y], [37.5, y])),
      poly('dark', [50, 5], [57, 5], [61, 32], [54, 33]),
      ...[12, 18, 24].map((y) => line('seam', 0.5, [51 + y * 0.12, y], [57.5 + y * 0.13, y])),
      solid('dark', 1.6, [39, 6], [39, 11], [42, 13], [48, 13], [50, 10], [50, 6]),
      poly('metal', [20, -8], [62, -8], [64, -6], [64, 4], [56, 6], [20, 6]),
      line('shine', 0.8, [21, -7.4], [62, -7.4]),
      line('seam', 0.6, [20, 1], [56, 1]),
      rect('dark', 26, -11, 26, 3),
      ...teeth(28, 50, 3, -11, -9),
      rect('dark', 23, -13.5, 4, 5.5),
      rect('dark', 56, -5.5, 5, 2.5),
      rect('poly', 64, -5, 14, 8),
      ...slots([66.5, 71], -3, 2.2, 4),
      rect('dark', 74, -9.5, 2, 4.5),
      barrel(rect('dark', 78, -2.5, 8, 3)),
    ],
  },
  shotgun: {
    pivot: 60,
    accent: [39, -5.5, 16, 2],
    shapes: [
      poly('wood', [0, -6], [30, -5], [36, -2], [40, 4], [36, 8], [30, 7], [18, 10], [0, 14], [-1, 4]),
      line('shine', 0.7, [1, -5.4], [30, -4.4]),
      rect('dark', -3, -6, 3, 20.5),
      solid('dark', 1.6, [42, 4], [42, 9], [45, 11], [52, 11], [54, 8], [54, 4]),
      line('dark', 1.4, [47, 4], [48.5, 8]),
      poly('metal', [36, -7], [58, -7], [58, 4], [40, 4], [36, 0]),
      line('shine', 0.8, [37, -6.4], [57, -6.4]),
      rect('dark', 42, 0.5, 12, 2.2),
      rect('metal', 58, -1.5, 46, 4.5),
      line('seam', 0.5, [58, 0.8], [104, 0.8]),
      barrel(rect('metal', 58, -6.5, 60, 4)),
      barrel(line('shine', 0.7, [59, -6], [117, -6])),
      barrel(line('seam', 0.6, [58, -7.1], [117, -7.1])),
      barrel(rect('dark', 115.5, -7, 2.5, 5)),
      barrel(dot('bead', 116, -7.8, 0.9)),
      poly('wood', [66, -2.5], [88, -2.5], [90, 0], [88, 5.5], [66, 5.5], [64, 3]),
      ...[70, 73, 76, 79, 82, 85].map((x) => line('seam', 0.6, [x, -1.5], [x, 4.5])),
    ],
  },
  assault: {
    pivot: 94,
    accent: [32, -7.5, 14, 2.2],
    shapes: [
      poly('poly', [0, -5], [20, -4], [26, -3], [26, 5], [16, 6], [0, 12]),
      rect('dark', -2.5, -5.5, 2.5, 18),
      ...[6, 11, 16].map((x) => line('seam', 0.5, [x, -3.8], [x, 9.5 - x * 0.2])),
      rect('metal', 24, -3, 8, 4),
      poly('poly', [38, 4], [46, 4], [43, 22], [35, 21], [34, 17]),
      ...[10, 14, 18].map((y) => line('seam', 0.5, [37 - y * 0.12, y], [44.5 - y * 0.15, y])),
      poly('dark', [56, 5], [64, 5], [68, 30], [60, 32]),
      ...[11, 17, 23].map((y) => line('seam', 0.5, [57 + y * 0.13, y], [64.5 + y * 0.14, y])),
      solid('dark', 1.6, [46, 6], [46, 10], [49, 12], [55, 12], [56, 6]),
      poly('metal', [32, -2], [62, -2], [62, 4], [56, 6], [32, 6]),
      rect('metal', 30, -8, 36, 6),
      line('shine', 0.8, [31, -7.4], [65, -7.4]),
      line('seam', 0.6, [30, -2], [66, -2]),
      rect('dark', 46, -6, 9, 3),
      rect('dark', 32, -11, 32, 3),
      ...teeth(34, 62, 3, -11, -9),
      poly('dark', [40, -17], [52, -17], [54, -15], [54, -11], [40, -11], [38, -13]),
      dot('glass', 53, -14, 1.3),
      rect('poly', 66, -7, 28, 10),
      ...slots([70, 76, 82, 88], -5, 3, 5),
      line('shine', 0.7, [67, -6.4], [93, -6.4]),
      rect('dark', 91, -13, 2, 6),
      barrel(rect('metal', 94, -3.5, 20, 3)),
      barrel(rect('dark', 112, -4.8, 8, 5.6)),
      barrel(line('seam', 0.6, [115, -4.6], [115, 0.6])),
      barrel(line('seam', 0.6, [117.5, -4.6], [117.5, 0.6])),
    ],
  },
  sniper: {
    pivot: 80,
    accent: [48, -5.2, 26, 2],
    shapes: [
      poly('tan', [0, -5], [14, -4], [40, -1], [48, 0], [56, 0], [106, 0], [110, 2], [110, 6], [56, 7], [48, 12], [40, 8], [30, 9], [14, 12], [0, 15]),
      poly('tan', [10, -8], [34, -6], [34, -2.5], [10, -4]),
      line('seam', 0.6, [10, -4], [34, -2.5]),
      line('shine', 0.7, [1, -4.4], [40, -0.6]),
      line('seam', 0.6, [58, 3.5], [108, 3.5]),
      rect('dark', -3, -5.5, 3, 21),
      solid('dark', 1.5, [46, 9], [47, 13], [53, 13], [56, 8]),
      rect('dark', 60, 4, 10, 5),
      poly('metal', [46, -6], [78, -6], [78, 0], [46, 0]),
      line('shine', 0.8, [47, -5.4], [77, -5.4]),
      solid('metal', 1.6, [57, -2], [55, 5]),
      dot('dark', 55, 6, 1.9),
      rect('metal', 50, -9, 4, 3),
      rect('metal', 72, -9, 4, 3),
      rect('dark', 44, -13, 42, 4),
      line('shine', 0.6, [45, -12.4], [85, -12.4]),
      poly('dark', [36, -15], [44, -14], [44, -8], [36, -7]),
      poly('dark', [84, -14], [88, -16.5], [96, -16.5], [96, -5.5], [88, -5.5], [84, -8]),
      rect('dark', 62, -17, 4, 4),
      dot('glass', 95.6, -11, 1.4),
      solid('dark', 1.4, [100, 4.6], [124, 3.2]),
      barrel(poly('metal', [78, -4.5], [146, -3.6], [146, -0.6], [78, -0.5])),
      barrel(line('shine', 0.6, [79, -4], [145, -3.2])),
      barrel(rect('dark', 142, -5, 8, 6)),
      barrel(line('seam', 0.6, [145, -4.8], [145, 0.8])),
    ],
  },
  lmg: {
    pivot: 92,
    accent: [26, -3.2, 34, 2.2],
    shapes: [
      poly('poly', [0, -6], [22, -5], [24, -2], [24, 6], [14, 7], [0, 12]),
      rect('dark', -2.5, -6.5, 2.5, 19),
      poly('olive', [42, 7], [64, 7], [64, 30], [42, 30]),
      line('seam', 0.6, [42, 12], [64, 12]),
      line('seam', 0.6, [53, 14], [53, 28]),
      line('shine', 0.6, [43, 7.6], [63, 7.6]),
      poly('poly', [28, 7], [36, 7], [34, 24], [26, 23], [25, 19]),
      solid('dark', 1.6, [36, 7], [36, 11], [39, 13], [42, 13]),
      poly('metal', [24, -9], [70, -9], [70, 5], [62, 7], [24, 7]),
      line('shine', 0.8, [25, -8.4], [69, -8.4]),
      line('seam', 0.6, [24, -1], [70, -1]),
      poly('dark', [32, -13], [66, -13], [68, -9], [30, -9]),
      ...teeth(34, 64, 3, -13, -11),
      solid('dark', 2.2, [70, -9], [72, -17], [88, -17], [90, -7]),
      rect('poly', 70, -7, 22, 10),
      ...slots([73, 79, 85], -5, 3, 5),
      solid('dark', 1.5, [96, 1.2], [120, 2.2]),
      solid('dark', 1.5, [96, 3.4], [119, 5]),
      barrel(rect('metal', 92, -3.5, 32, 3)),
      barrel(rect('dark', 118, -10, 2, 6.5)),
      barrel(rect('dark', 122, -4.5, 8, 5.5)),
      barrel(line('seam', 0.6, [125, -4.3], [125, 0.8])),
    ],
  },
};

/** What a gun's art becomes once its look is applied: parts in final units, and their bounds. */
type Built = { shapes: Shape[]; accent: readonly Pt[] | null; minX: number; maxX: number; minY: number; maxY: number };
const built = new Map<GunId, Built>();

function build(gun: GunId): Built {
  const hit = built.get(gun);
  if (hit) return hit;
  const { base, look, stage } = GUNS[gun];
  const art = ART[base];
  const map = ([x, y]: Pt, dy = 0): Pt => [x <= art.pivot ? x : art.pivot + (x - art.pivot) * look.length, y * look.width + dy];
  const moved = (s: Shape, dy: number): Shape =>
    s.kind === 'dot' ? { ...s, at: map(s.at, dy), r: s.r * look.width } : { ...s, pts: s.pts.map((p) => map(p, dy)) } as Shape;
  // Extra barrels stack over-under, each a bore's depth above the last.
  const bore = 5 * look.width;
  let shapes: Shape[] = [];
  for (const s of art.shapes) {
    if (!s.barrel || look.barrels === 1) { shapes.push(moved(s, 0)); continue; }
    for (let i = look.barrels - 1; i >= 0; i--) shapes.push(moved(s, -i * bore));
  }
  const [ax, ay, aw, ah] = art.accent;
  const accent: Pt[] | null = stage > 0 ? [map([ax, ay]), map([ax + aw, ay]), map([ax + aw, ay + ah]), map([ax, ay + ah])] : null;
  if (look.hands === 2) {
    // Akimbo: a second gun drawn behind the first, peeking out above and ahead of it.
    shapes = [...shapes.map((s) => shift(s, 16, -13 * look.width)), ...shapes];
  }
  const pts = shapes.flatMap((s) => (s.kind === 'dot' ? [s.at] : s.pts));
  const out: Built = {
    shapes, accent,
    minX: Math.min(...pts.map((p) => p[0])), maxX: Math.max(...pts.map((p) => p[0])),
    minY: Math.min(...pts.map((p) => p[1])) - 1, maxY: Math.max(...pts.map((p) => p[1])) + 1,
  };
  built.set(gun, out);
  return out;
}

function shift(s: Shape, dx: number, dy: number): Shape {
  return s.kind === 'dot' ? { ...s, at: [s.at[0] + dx, s.at[1] + dy] } : { ...s, pts: s.pts.map(([x, y]) => [x + dx, y + dy] as Pt) } as Shape;
}

/** A hex colour moved `k` of the way toward white (k > 0) or black (k < 0). */
function tint(hex: string, k: number): string {
  const v = parseInt(hex.slice(1), 16);
  const to = k > 0 ? 255 : 0;
  const ch = (s: number) => Math.round(((v >> s) & 255) + (to - ((v >> s) & 255)) * Math.abs(k));
  return `rgb(${ch(16)}, ${ch(8)}, ${ch(0)})`;
}

function trace(ctx: CanvasRenderingContext2D, pts: readonly Pt[], close: boolean) {
  ctx.beginPath();
  ctx.moveTo(pts[0]![0], pts[0]![1]);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i]![0], pts[i]![1]);
  if (close) ctx.closePath();
}

/**
 * Draws the gun's art in its own units (call after scaling the context). `flat` fills every solid part in one colour, for
 * the kill feed's small glyphs; otherwise each part is shaded top to bottom and edged, with seams and highlights on top.
 */
function paint(ctx: CanvasRenderingContext2D, gun: GunId, flat?: string) {
  const b = build(gun);
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  for (const s of b.shapes) {
    if (s.kind === 'dot') {
      ctx.fillStyle = flat ?? TONES[s.tone];
      ctx.beginPath();
      ctx.arc(s.at[0], s.at[1], s.r, 0, Math.PI * 2);
      ctx.fill();
      continue;
    }
    if (s.kind === 'line') {
      if (flat && !s.solid) continue;
      ctx.strokeStyle = flat ?? (s.tone === 'shine' ? SHINE : s.tone === 'seam' ? SEAM : TONES[s.tone]);
      ctx.lineWidth = s.w;
      trace(ctx, s.pts, false);
      ctx.stroke();
      continue;
    }
    trace(ctx, s.pts, true);
    if (flat) {
      ctx.fillStyle = flat;
      ctx.fill();
      continue;
    }
    const ys = s.pts.map((p) => p[1]);
    const top = Math.min(...ys), bottom = Math.max(...ys);
    const base = TONES[s.tone];
    // Two hard cel steps, as the walls and bodies are shaded: a light band along the top and a dark one along the bottom.
    const fill = ctx.createLinearGradient(0, top, 0, bottom);
    fill.addColorStop(0, tint(base, 0.24));
    fill.addColorStop(0.3, tint(base, 0.24));
    fill.addColorStop(0.3, base);
    fill.addColorStop(0.72, base);
    fill.addColorStop(0.72, tint(base, -0.3));
    fill.addColorStop(1, tint(base, -0.3));
    ctx.fillStyle = fill;
    ctx.fill();
    ctx.strokeStyle = EDGE;
    ctx.lineWidth = 0.55;
    ctx.stroke();
  }
  if (b.accent && !flat) {
    trace(ctx, b.accent, true);
    ctx.fillStyle = GUNS[gun].look.accent;
    ctx.fill();
  }
}

export const artBounds = (gun: GunId) => {
  const { minX, maxX, minY, maxY } = build(gun);
  return { minX, maxX, minY, maxY };
};

/** Fits the gun's art into the box at (`x`, `y`) of `w` by `h`, centred, at `scale` units per px if given (so siblings compare true size). */
export function drawGunArt(ctx: CanvasRenderingContext2D, gun: GunId, x: number, y: number, w: number, h: number, opts: { flat?: string; scale?: number; align?: 'center' | 'left' } = {}) {
  const b = build(gun);
  const k = opts.scale ?? Math.min(w / (b.maxX - b.minX), h / (b.maxY - b.minY));
  const left = opts.align === 'left' ? x : x + (w - (b.maxX - b.minX) * k) / 2;
  ctx.save();
  ctx.translate(left - b.minX * k, y + h / 2 - ((b.minY + b.maxY) / 2) * k);
  ctx.scale(k, k);
  paint(ctx, gun, opts.flat);
  ctx.restore();
}

/**
 * A dropped gun's length on the ground in world px: `base` plus `perUnit` of its art length, so a pistol (about 37 px) still
 * reads beside its owner while a bolt-action (about 63 px) lies clearly longer.
 */
export const DROPPED_SIZE = { base: 18, perUnit: 0.3 } as const;
const dropped = new Map<GunId, HTMLCanvasElement>();
/** Pixels per art unit in the cached image of a dropped gun, sharp at the camera's closest zoom on a dense screen. */
const DROPPED_RES = 4;

/**
 * A dropped gun as a cached image, dulled as if it lay in the dust, so a field of corpses costs one image draw apiece.
 * Drawn centred on (`x`, `y`) along the context's x axis.
 */
export function drawDroppedGun(ctx: CanvasRenderingContext2D, gun: GunId, x: number, y: number) {
  let image = dropped.get(gun);
  const b = build(gun);
  if (!image) {
    image = document.createElement('canvas');
    image.width = Math.ceil((b.maxX - b.minX) * DROPPED_RES) + 4;
    image.height = Math.ceil((b.maxY - b.minY) * DROPPED_RES) + 4;
    const g = image.getContext('2d');
    if (g) {
      drawGunArt(g, gun, 2, 2, image.width - 4, image.height - 4);
      // Dust settles on it: a flat grey wash over the paint only.
      g.globalCompositeOperation = 'source-atop';
      g.fillStyle = 'rgba(120, 118, 112, 0.35)';
      g.fillRect(0, 0, image.width, image.height);
    }
    dropped.set(gun, image);
  }
  const length = b.maxX - b.minX;
  const k = (DROPPED_SIZE.base + DROPPED_SIZE.perUnit * length) / length;
  const w = (image.width / DROPPED_RES) * k, h = (image.height / DROPPED_RES) * k;
  ctx.drawImage(image, x - w / 2, y - h / 2, w, h);
}

/**
 * Paints a gun card into a DOM canvas at the screen's pixel density. `cssW` by `cssH` is its size on the page; `peers`
 * share one scale so a pick's options, or the six class guns, compare at true size.
 */
export function drawGunCard(canvas: HTMLCanvasElement, gun: GunId, cssW: number, cssH: number, peers: readonly GunId[] = [gun]) {
  const dpr = Math.max(2, Math.min(4, typeof devicePixelRatio === 'number' ? devicePixelRatio : 1) * 1.5);
  canvas.width = Math.round(cssW * dpr);
  canvas.height = Math.round(cssH * dpr);
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const pad = 0.06;
  const w = canvas.width * (1 - pad * 2), h = canvas.height * (1 - pad * 2);
  const scale = Math.min(...peers.map((p) => {
    const b = build(p);
    return Math.min(w / (b.maxX - b.minX), h / (b.maxY - b.minY));
  }));
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  drawGunArt(ctx, gun, canvas.width * pad, canvas.height * pad, w, h, { scale });
}
