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
const EDGE = 'rgba(8, 9, 11, 0.6)';
const OUTLINE = { color: '#1c1f26', width: 3 } as const;

const poly = (tone: Tone, ...pts: Pt[]): Shape => ({ kind: 'poly', pts, tone });
const rect = (tone: Tone, x: number, y: number, w: number, h: number): Shape => poly(tone, [x, y], [x + w, y], [x + w, y + h], [x, y + h]);
const barrel = (s: Shape): Shape => ({ ...s, barrel: true });
const line = (tone: Tone | 'shine' | 'seam', w: number, ...pts: Pt[]): Shape => ({ kind: 'line', pts, tone, w });
const solid = (tone: Tone, w: number, ...pts: Pt[]): Shape => ({ kind: 'line', pts, tone, w, solid: true });
const dot = (tone: Tone, x: number, y: number, r: number): Shape => ({ kind: 'dot', at: [x, y], r, tone });
/**
 * The art is stylized, not a replica: each class is a few chunky, exaggerated shapes with a bold silhouette (stubby
 * pistol, boxy SMG with a long mag, fat-barrelled shotgun with a wooden pump, rifle with a red-dot and a curved mag, long
 * bolt-action under a big scope, LMG with a drum box), so each reads at a glance from across the map.
 */
const ART: Record<WeaponId, Art> = {
  pistol: {
    pivot: 44,
    accent: [20, -7.5, 22, 3],
    shapes: [
      poly('poly', [14, 1], [29, 1], [27, 25], [11, 25]),
      solid('dark', 2.6, [29, 2], [29, 9], [40, 9], [42, 2]),
      rect('metal', 9, -10, 53, 12),
      line('shine', 1.4, [11, -8], [60, -8]),
      barrel(rect('dark', 59, -7, 5, 7)),
    ],
  },
  smg: {
    pivot: 64,
    accent: [26, -9, 26, 3.4],
    shapes: [
      poly('poly', [0, -6], [20, -4], [20, 4], [0, 9]),
      poly('dark', [37, 5], [47, 5], [49, 29], [39, 29]),
      poly('poly', [23, 5], [33, 5], [31, 22], [21, 22]),
      rect('metal', 18, -11, 48, 17),
      line('shine', 1.4, [20, -9], [64, -9]),
      rect('poly', 66, -8, 14, 12),
      barrel(rect('dark', 79, -5, 7, 7)),
    ],
  },
  shotgun: {
    pivot: 60,
    accent: [36, -7, 18, 3.4],
    shapes: [
      poly('wood', [-3, -6], [30, -6], [34, -2], [34, 6], [24, 7], [-3, 15]),
      rect('metal', 32, -9, 28, 16),
      barrel(rect('metal', 60, -8, 56, 8)),
      rect('dark', 60, 0, 44, 6),
      rect('wood', 70, -1, 26, 10),
      barrel(line('shine', 1.4, [62, -6], [114, -6])),
      barrel(rect('dark', 113, -9.5, 6, 10)),
    ],
  },
  assault: {
    pivot: 94,
    accent: [26, -9, 20, 3.4],
    shapes: [
      poly('poly', [-2, -8], [24, -6], [24, 4], [-2, 13]),
      poly('dark', [52, 5], [62, 5], [68, 27], [58, 29]),
      poly('poly', [31, 5], [40, 5], [38, 22], [29, 22]),
      rect('metal', 22, -11, 48, 17),
      line('shine', 1.4, [24, -9], [68, -9]),
      rect('dark', 40, -19, 17, 8),
      dot('glass', 55, -15, 2.4),
      rect('poly', 70, -8, 28, 13),
      barrel(rect('dark', 97, -4.5, 16, 6)),
      barrel(rect('dark', 111, -7, 9, 10)),
    ],
  },
  sniper: {
    pivot: 80,
    accent: [50, -7, 22, 3],
    shapes: [
      poly('tan', [-3, -6], [40, -5], [50, -1], [98, -3], [100, 4], [50, 6], [38, 13], [-3, 15]),
      rect('metal', 46, -7, 32, 8),
      dot('dark', 62, 7, 3.2),
      rect('dark', 46, -18, 38, 8),
      rect('dark', 40, -21, 8, 13),
      rect('dark', 82, -21, 10, 14),
      dot('glass', 89, -14, 3),
      barrel(rect('metal', 96, -4, 47, 6)),
      barrel(line('shine', 1.2, [98, -2.6], [141, -2.6])),
      barrel(rect('dark', 141, -6.5, 10, 10)),
    ],
  },
  lmg: {
    pivot: 92,
    accent: [26, -10, 28, 3.4],
    shapes: [
      poly('poly', [-2, -8], [24, -7], [24, 6], [-2, 13]),
      rect('olive', 38, 7, 28, 24),
      line('shine', 1.2, [40, 9.5], [64, 9.5]),
      poly('poly', [26, 8], [35, 8], [33, 23], [24, 23]),
      rect('metal', 22, -12, 50, 20),
      rect('dark', 28, -16, 40, 5),
      line('shine', 1.4, [24, -9.5], [70, -9.5]),
      rect('poly', 72, -9, 22, 14),
      barrel(rect('metal', 92, -4, 31, 6)),
      barrel(rect('dark', 121, -7, 9, 11)),
    ],
  },
};

/**
 * The same guns seen from above, for the world: held in a player's hands and lying beside a corpse. Same chunky parts and
 * tones as the side art, laid out in plan: x runs butt to muzzle as before (same `pivot`), y is across the gun, centred on
 * the bore. Extra barrels sit side by side, and Akimbo is a pistol in each hand.
 */
const sym = (tone: Tone, x0: number, x1: number, half0: number, half1 = half0): Shape => poly(tone, [x0, -half0], [x1, -half1], [x1, half1], [x0, half0]);

const TOP_ART: Record<WeaponId, Art> = {
  pistol: {
    pivot: 44,
    accent: [22, -1.6, 18, 3.2],
    shapes: [
      sym('poly', 8, 14, 4.4, 5),
      sym('metal', 12, 62, 5.5),
      line('shine', 1.2, [14, -3], [60, -3]),
      barrel(sym('dark', 59, 64, 3)),
    ],
  },
  smg: {
    pivot: 64,
    accent: [30, -1.7, 22, 3.4],
    shapes: [
      sym('poly', 0, 20, 4.6, 4),
      sym('metal', 18, 66, 6.5),
      line('shine', 1.2, [20, -3.8], [64, -3.8]),
      sym('poly', 66, 80, 5.5),
      barrel(sym('dark', 79, 86, 3.2)),
    ],
  },
  shotgun: {
    pivot: 60,
    accent: [36, -1.7, 18, 3.4],
    shapes: [
      poly('wood', [-3, -7.5], [32, -4.6], [32, 4.6], [-3, 7.5]),
      sym('metal', 32, 60, 6.5),
      barrel(sym('metal', 60, 116, 4)),
      barrel(line('shine', 1.2, [62, -1.6], [114, -1.6])),
      sym('wood', 70, 96, 6.5),
      barrel(sym('dark', 113, 119, 5)),
    ],
  },
  assault: {
    pivot: 94,
    accent: [26, -1.7, 12, 3.4],
    shapes: [
      poly('poly', [-2, -7.5], [24, -5], [24, 5], [-2, 7.5]),
      sym('metal', 22, 70, 6.5),
      line('shine', 1.2, [24, -3.8], [68, -3.8]),
      sym('dark', 40, 57, 4.4),
      dot('glass', 55, 0, 2.4),
      sym('poly', 70, 98, 5.5),
      barrel(sym('dark', 97, 113, 3)),
      barrel(sym('dark', 111, 120, 4.6)),
    ],
  },
  sniper: {
    pivot: 80,
    accent: [52, -1.5, 20, 3],
    shapes: [
      poly('tan', [-3, -7.5], [40, -4.4], [100, -5], [100, 5], [40, 4.4], [-3, 7.5]),
      solid('dark', 2.6, [62, 3], [64, 11]),
      dot('dark', 64, 12, 3.2),
      sym('metal', 46, 78, 4.4),
      sym('dark', 46, 84, 3.6),
      sym('dark', 40, 48, 6),
      sym('dark', 82, 92, 6.5),
      dot('glass', 89, 0, 3),
      barrel(sym('metal', 96, 143, 3)),
      barrel(sym('dark', 141, 151, 5)),
    ],
  },
  lmg: {
    pivot: 92,
    accent: [26, -1.7, 10, 3.4],
    shapes: [
      poly('poly', [-2, -8], [24, -5.5], [24, 5.5], [-2, 8]),
      rect('olive', 38, 6, 28, 13),
      sym('metal', 22, 72, 8),
      sym('dark', 28, 68, 5.4),
      line('shine', 1.2, [24, -6.6], [70, -6.6]),
      sym('poly', 72, 94, 6),
      barrel(sym('metal', 92, 123, 3)),
      barrel(sym('dark', 121, 130, 5)),
    ],
  },
};

/** What a gun's art becomes once its look is applied: parts in final units, and their bounds. */
type Built = { shapes: Shape[]; accent: readonly Pt[] | null; minX: number; maxX: number; minY: number; maxY: number };
type View = 'side' | 'top';
const built = new Map<string, Built>();

function build(gun: GunId, view: View = 'side'): Built {
  const hit = built.get(`${gun}|${view}`);
  if (hit) return hit;
  const { base, look, stage } = GUNS[gun];
  const art = view === 'side' ? ART[base] : TOP_ART[base];
  const map = ([x, y]: Pt, dy = 0): Pt => [x <= art.pivot ? x : art.pivot + (x - art.pivot) * look.length, y * look.width + dy];
  const moved = (s: Shape, dy: number): Shape =>
    s.kind === 'dot' ? { ...s, at: map(s.at, dy), r: s.r * look.width } : { ...s, pts: s.pts.map((p) => map(p, dy)) } as Shape;
  // Extra barrels stack over-under in profile, a bore's depth apart; from above they sit side by side about the bore.
  const bore = 5 * look.width;
  let shapes: Shape[] = [];
  for (const s of art.shapes) {
    if (!s.barrel || look.barrels === 1) { shapes.push(moved(s, 0)); continue; }
    for (let i = look.barrels - 1; i >= 0; i--) shapes.push(moved(s, view === 'side' ? -i * bore : (i - (look.barrels - 1) / 2) * bore));
  }
  const [ax, ay, aw, ah] = art.accent;
  const accent: Pt[] | null = stage > 0 ? [map([ax, ay]), map([ax + aw, ay]), map([ax + aw, ay + ah]), map([ax, ay + ah])] : null;
  if (look.hands === 2) {
    // Akimbo: in profile a second gun peeks out above and ahead of the first; from above, one in each hand.
    shapes = view === 'side'
      ? [...shapes.map((s) => shift(s, 16, -13 * look.width)), ...shapes]
      : [...shapes.map((s) => shift(s, 0, -6 * look.width)), ...shapes.map((s) => shift(s, 0, 6 * look.width))];
  }
  const pts = shapes.flatMap((s) => (s.kind === 'dot' ? [s.at] : s.pts));
  const out: Built = {
    shapes, accent,
    minX: Math.min(...pts.map((p) => p[0])), maxX: Math.max(...pts.map((p) => p[0])),
    minY: Math.min(...pts.map((p) => p[1])) - 1, maxY: Math.max(...pts.map((p) => p[1])) + 1,
  };
  built.set(`${gun}|${view}`, out);
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
function paint(ctx: CanvasRenderingContext2D, gun: GunId, flat?: string, view: View = 'side') {
  const b = build(gun, view);
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  if (!flat) {
    // A bold ink outline round the whole silhouette first, so the gun reads like a sticker against any floor.
    ctx.strokeStyle = OUTLINE.color;
    ctx.fillStyle = OUTLINE.color;
    for (const s of b.shapes) {
      if (s.kind === 'line' && !s.solid) continue;
      if (s.kind === 'dot') {
        ctx.beginPath();
        ctx.arc(s.at[0], s.at[1], s.r + OUTLINE.width / 2, 0, Math.PI * 2);
        ctx.fill();
        continue;
      }
      ctx.lineWidth = s.kind === 'line' ? s.w + OUTLINE.width : OUTLINE.width;
      trace(ctx, s.pts, s.kind === 'poly');
      ctx.stroke();
    }
  }
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
    ctx.lineWidth = 0.9;
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
export function drawGunArt(ctx: CanvasRenderingContext2D, gun: GunId, x: number, y: number, w: number, h: number, opts: { flat?: string; scale?: number; align?: 'center' | 'left'; view?: View } = {}) {
  const b = build(gun, opts.view);
  const k = opts.scale ?? Math.min(w / (b.maxX - b.minX), h / (b.maxY - b.minY));
  const left = opts.align === 'left' ? x : x + (w - (b.maxX - b.minX) * k) / 2;
  ctx.save();
  ctx.translate(left - b.minX * k, y + h / 2 - ((b.minY + b.maxY) / 2) * k);
  ctx.scale(k, k);
  paint(ctx, gun, opts.flat, opts.view);
  ctx.restore();
}

/**
 * A gun in the world, held or dropped, is one image: its top-down art, seen from above like everything else in the world.
 * Its length in world px is `base` plus `perUnit` of its art length, so a pistol (about 47 px) reads clearly in its owner's
 * hand while a bolt-action (about 76 px) is plainly longer, and a gun is exactly as big on the ground as in its owner's hands.
 * `thicken` widens it across a little past true scale, so a rifle seen from above still reads at play zoom.
 */
export const WORLD_GUN = { base: 30, perUnit: 0.3, thicken: 1.7, res: 3 } as const;
/** Where the butt of a held gun sits, in body radii ahead of the holder's centre: a pistol is held out, a long gun shouldered. */
const HOLD_REAR: Record<WeaponId, number> = { pistol: 0.75, smg: 0.5, shotgun: 0.25, assault: 0.3, sniper: 0.2, lmg: 0.3 };

const images = new Map<string, HTMLCanvasElement>();

function worldImage(gun: GunId, dusted: boolean): HTMLCanvasElement {
  const key = `${gun}|${dusted}`;
  let image = images.get(key);
  if (image) return image;
  const b = build(gun, 'top');
  image = document.createElement('canvas');
  image.width = Math.ceil((b.maxX - b.minX) * WORLD_GUN.res) + 4;
  image.height = Math.ceil((b.maxY - b.minY) * WORLD_GUN.res) + 4;
  const g = image.getContext('2d');
  if (g) {
    drawGunArt(g, gun, 2, 2, image.width - 4, image.height - 4, { view: 'top' });
    if (dusted) {
      // Dust settles on it: a flat grey wash over the paint only.
      g.globalCompositeOperation = 'source-atop';
      g.fillStyle = 'rgba(120, 118, 112, 0.35)';
      g.fillRect(0, 0, image.width, image.height);
    }
  }
  images.set(key, image);
  return image;
}

/** The world size of a gun's image, and its length. */
function worldSize(gun: GunId) {
  const b = build(gun, 'top');
  const length = b.maxX - b.minX;
  const k = (WORLD_GUN.base + WORLD_GUN.perUnit * length) / length;
  return { k, length: length * k, w: (((b.maxX - b.minX) * WORLD_GUN.res + 4) / WORLD_GUN.res) * k, h: ((((b.maxY - b.minY) * WORLD_GUN.res + 4) / WORLD_GUN.res) * k) * WORLD_GUN.thicken };
}

/** A dropped gun, dulled as if it lay in the dust, centred on (`x`, `y`) along the context's x axis. */
export function drawDroppedGun(ctx: CanvasRenderingContext2D, gun: GunId, x: number, y: number) {
  const { w, h } = worldSize(gun);
  ctx.drawImage(worldImage(gun, true), x - w / 2, y - h / 2, w, h);
}

/** A held gun, in the holder's frame (x along the aim, from the body's centre), its bore on the aim line. */
export function drawHeldGun(ctx: CanvasRenderingContext2D, gun: GunId, radius: number) {
  const { w, h } = worldSize(gun);
  const b = build(gun, 'top');
  const rear = HOLD_REAR[GUNS[gun].base] * radius;
  const bore = (2 - b.minY * WORLD_GUN.res) / ((b.maxY - b.minY) * WORLD_GUN.res + 4);
  ctx.drawImage(worldImage(gun, false), rear, -h * bore, w, h);
}

/** Where a held gun's muzzle is, `radius` being the holder's body radius. */
export function heldMuzzleReach(gun: GunId, radius: number): number {
  return HOLD_REAR[GUNS[gun].base] * radius + worldSize(gun).length;
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

/** Where the muzzle of the gun held by a player at (`x`, `y`) aiming along `angle` is, so a drawn round leaves the barrel. */
export function muzzleTip(x: number, y: number, angle: number, gun: GunId, radius: number) {
  const reach = heldMuzzleReach(gun, radius);
  return { x: x + Math.cos(angle) * reach, y: y + Math.sin(angle) * reach };
}
