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

const BASE_TONES: Record<Tone, string> = {
  metal: '#555c67', dark: '#2c3037', poly: '#666b74', wood: '#93633a', tan: '#b19d72', olive: '#6a7255', glass: '#8fc0de', bead: '#efe7d0',
};
/** An airdrop's golden gun: every painted part keeps its shape and light but wears gold (gold means reward). */
const GOLD_TONES: Record<Tone, string> = {
  metal: '#d9a92b', dark: '#7a5a14', poly: '#e6bd47', wood: '#b8862a', tan: '#f0d27a', olive: '#c9a227', glass: '#fff3b0', bead: '#fff8dc',
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

/** What a gun's art becomes once its look is applied: parts in final units, and their bounds. */
type Built = { shapes: Shape[]; accent: readonly Pt[] | null; minX: number; maxX: number; minY: number; maxY: number };
const built = new Map<string, Built>();

function build(gun: GunId): Built {
  const hit = built.get(gun);
  if (hit) return hit;
  const { base, look, stage } = GUNS[gun];
  const art = ART[base];
  const map = ([x, y]: Pt, dy = 0): Pt => [x <= art.pivot ? x : art.pivot + (x - art.pivot) * look.length, y * look.width + dy];
  const moved = (s: Shape, dy: number): Shape =>
    s.kind === 'dot' ? { ...s, at: map(s.at, dy), r: s.r * look.width } : { ...s, pts: s.pts.map((p) => map(p, dy)) } as Shape;
  // Extra barrels stack over-under in profile, a bore's depth apart.
  const bore = 5 * look.width;
  let shapes: Shape[] = [];
  for (const s of art.shapes) {
    if (!s.barrel || look.barrels === 1) { shapes.push(moved(s, 0)); continue; }
    for (let i = look.barrels - 1; i >= 0; i--) shapes.push(moved(s, -i * bore));
  }
  const [ax, ay, aw, ah] = art.accent;
  const accent: Pt[] | null = stage > 0 ? [map([ax, ay]), map([ax + aw, ay]), map([ax + aw, ay + ah]), map([ax, ay + ah])] : null;
  if (look.hands === 2) {
    // Akimbo: a second gun peeks out above and ahead of the first.
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
function paint(ctx: CanvasRenderingContext2D, gun: GunId, flat?: string, golden = false) {
  const b = build(gun);
  const TONES = golden ? GOLD_TONES : BASE_TONES;
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
    ctx.fillStyle = golden ? '#fff1a8' : GUNS[gun].look.accent;
    ctx.fill();
  }
}

export const artBounds = (gun: GunId) => {
  const { minX, maxX, minY, maxY } = build(gun);
  return { minX, maxX, minY, maxY };
};

/** Fits the gun's art into the box at (`x`, `y`) of `w` by `h`, centred, at `scale` units per px if given (so siblings compare true size). */
export function drawGunArt(ctx: CanvasRenderingContext2D, gun: GunId, x: number, y: number, w: number, h: number, opts: { flat?: string; scale?: number; align?: 'center' | 'left'; golden?: boolean } = {}) {
  const b = build(gun);
  const k = opts.scale ?? Math.min(w / (b.maxX - b.minX), h / (b.maxY - b.minY));
  const left = opts.align === 'left' ? x : x + (w - (b.maxX - b.minX) * k) / 2;
  ctx.save();
  ctx.translate(left - b.minX * k, y + h / 2 - ((b.minY + b.maxY) / 2) * k);
  ctx.scale(k, k);
  paint(ctx, gun, opts.flat, opts.golden);
  ctx.restore();
}

/**
 * A gun in the world, held or dropped, is one image: its side art seen from above at an angle, the three-quarter view the
 * whole world is drawn in, so it is squashed across its bore to `squash` of its height. Its length in world px is `base`
 * plus `perUnit` of its art length: a pistol reaches about 30 px past the hand, a rifle about 55 and a bolt-action about
 * 70, and a gun is exactly as big on the ground as in its owner's hands.
 */
export const WORLD_GUN = { base: 4, perUnit: 0.6, squash: 0.6, res: 3 } as const;
/** Where the butt of a held gun sits, in body radii ahead of the holder's centre: a pistol is held out, a long gun shouldered. */
const HOLD_REAR: Record<WeaponId, number> = { pistol: 0.62, smg: 0.38, shotgun: 0.12, assault: 0.16, sniper: 0, lmg: 0.16 };

const images = new Map<string, HTMLCanvasElement>();

function worldImage(gun: GunId, dusted: boolean, golden = false): HTMLCanvasElement {
  const key = `${gun}|${dusted}|${golden}`;
  let image = images.get(key);
  if (image) return image;
  const b = build(gun);
  image = document.createElement('canvas');
  image.width = Math.ceil((b.maxX - b.minX) * WORLD_GUN.res) + 4;
  image.height = Math.ceil((b.maxY - b.minY) * WORLD_GUN.res) + 4;
  const g = image.getContext('2d');
  if (g) {
    drawGunArt(g, gun, 2, 2, image.width - 4, image.height - 4, { golden });
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

/** The world size of a gun's image, its length, world units per art unit along (`k`) and across (`kAcross`) it, and its bore's place in it. */
function worldSize(gun: GunId) {
  const b = build(gun);
  const length = b.maxX - b.minX;
  const k = (WORLD_GUN.base + WORLD_GUN.perUnit * length) / length;
  const kAcross = k * WORLD_GUN.squash;
  const pad = 2 / WORLD_GUN.res;
  return { k, kAcross, length: length * k, w: (length + pad * 2) * k, h: (b.maxY - b.minY + pad * 2) * kAcross, bore: (pad - b.minY) * kAcross, front: pad * k };
}

/** A dropped gun, dulled as if it lay in the dust, centred on (`x`, `y`) along the context's x axis. */
export function drawDroppedGun(ctx: CanvasRenderingContext2D, gun: GunId, x: number, y: number) {
  const { w, h } = worldSize(gun);
  ctx.drawImage(worldImage(gun, true), x - w / 2, y - h / 2, w, h);
}

/** Whether a gun aimed along `angle` is drawn mirrored, so its grip and mag always hang down-screen. */
export const heldFlipped = (angle: number): boolean => Math.cos(angle) < 0;
/** How much shorter a gun looks aimed along `angle`: pointing up- or down-screen it is foreshortened by the three-quarter view. */
export const heldForeshorten = (angle: number): number => 1 - 0.15 * Math.abs(Math.sin(angle));

/**
 * A held gun aimed along `aim`, in the holder's frame (x along the aim, from the body's centre), its bore on the aim line,
 * mirrored when aimed left (see `heldFlipped`) and foreshortened toward up or down (see `heldForeshorten`).
 */
export function drawHeldGun(ctx: CanvasRenderingContext2D, gun: GunId, radius: number, aim = 0, golden = false) {
  const { w, h, bore, front } = worldSize(gun);
  const rear = HOLD_REAR[GUNS[gun].base] * radius;
  const fore = heldForeshorten(aim);
  ctx.save();
  ctx.translate(rear, 0);
  ctx.scale(fore, heldFlipped(aim) ? -1 : 1);
  ctx.drawImage(worldImage(gun, false, golden), -front, -bore, w, h);
  ctx.restore();
}

/**
 * Where the hands hold each class, in its side art units (before an evolution stretches the barrel end): the trigger hand
 * on the grip, the support hand on the handguard or pump, or cupped under the grip (`fore` null) for a pistol held out in
 * both hands. The support hand never reaches past `FORE_REACH` body radii, so a long barrel never stretches an arm.
 */
const GRIP: Record<WeaponId, { grip: Pt; fore: Pt | null }> = {
  pistol: { grip: [21, 10], fore: null },
  smg: { grip: [28, 11], fore: [73, 0] },
  shotgun: { grip: [30, 4], fore: [83, 4] },
  assault: { grip: [35, 11], fore: [84, 0] },
  sniper: { grip: [44, 6], fore: [90, 1] },
  lmg: { grip: [30, 13], fore: [83, 0] },
};
const FORE_REACH = 1.9;

export type Hand = { x: number; y: number };
/**
 * Where a held gun's two hands are, in the holder's frame (x along the aim, from the body's centre, y to the right):
 * `[trigger, support]`, for a gun aimed along `aim` (mirrored and foreshortened with it). Akimbo puts each hand on the grip of
 * its own pistol.
 */
export function heldHands(gun: GunId, radius: number, aim = 0): [Hand, Hand] {
  const { base, look } = GUNS[gun];
  const pivot = ART[base].pivot;
  const { k, kAcross, front } = worldSize(gun);
  const b = build(gun);
  const rear = HOLD_REAR[base] * radius;
  const s = heldFlipped(aim) ? -1 : 1;
  const short = heldForeshorten(aim);
  const at = ([x, y]: Pt, dx = 0, dy = 0): Hand => ({
    x: rear + (((x <= pivot ? x : pivot + (x - pivot) * look.length) + dx - b.minX + 2 / WORLD_GUN.res) * k - front) * short,
    y: s * (y * look.width + dy) * kAcross,
  });
  const { grip, fore } = GRIP[base];
  if (look.hands === 2) return [at(grip), at(grip, 16, -13 * look.width)];
  if (fore === null) return [at(grip), at(grip, -3, 6)];
  const support = at(fore);
  return [at(grip), { x: Math.min(support.x, FORE_REACH * radius), y: support.y }];
}

/** How far ahead of its holder's centre a held gun's muzzle is, `radius` being the holder's body radius, aimed along `aim`. */
export function heldMuzzleReach(gun: GunId, radius: number, aim = 0): number {
  return HOLD_REAR[GUNS[gun].base] * radius + worldSize(gun).length * heldForeshorten(aim);
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
  const reach = heldMuzzleReach(gun, radius, angle);
  return { x: x + Math.cos(angle) * reach, y: y + Math.sin(angle) * reach };
}
