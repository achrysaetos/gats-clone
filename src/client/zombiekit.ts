import { ZOMBIES, type ZombieKind } from '../shared/defs.ts';
import { celPart, ellipse, polygon, roundBox, TAU, type Trace } from './cel.ts';
import { INK, shadeHex, ZOMBIE_LOOK } from './palette.ts';

/**
 * The horde's toy kit: every zombie is the same chunky toy as the squad's soldiers, a torso and a head stacked at the world's
 * three-quarter angle (a top face, a darker front face hanging below it), cel-shaded in two hard steps from the key light and
 * outlined in ink, then ruined: torn uniforms, stitches, bandages, scavenged plates, slack jaws. This file paints the cached
 * parts (torsos, heads, hands) turned to an angle bucket; zombieart.ts poses and batches them.
 * Sizes are shares of the zombie's radius `R`, in a frame with x along the heading and y to its right.
 */

/** The sprites turn in this many steps, each lit from the world's light, like the soldiers' turning parts. */
export const ZOMBIE_BUCKETS = 32;
export const bucketOf = (a: number) => ((Math.round((a / TAU) * ZOMBIE_BUCKETS) % ZOMBIE_BUCKETS) + ZOMBIE_BUCKETS) % ZOMBIE_BUCKETS;
const HAND_BUCKETS = 16;
const KIND_INDEX: Record<ZombieKind, number> = { walker: 0, brute: 1, runner: 2, plated: 3, bloater: 4, colossus: 5 };
export const handBucketOf = (a: number) => ((Math.round((a / TAU) * HAND_BUCKETS) % HAND_BUCKETS) + HAND_BUCKETS) % HAND_BUCKETS;

/** One zombie's look, picked from its id so a horde of one kind is never cloned: clothing, skin, headgear, a missing arm, shoes. */
export type Variant = {
  cloth: number; skin: number; hat: number;
  /** 0 both arms, -1 the left one is gone, 1 the right one. */
  gone: -1 | 0 | 1;
  /** Which leg is the bad one (-1 left, 1 right). */
  limp: -1 | 1;
  /** The shoe on each side (an index into SHOES), mismatched on purpose. */
  shoes: readonly [number, number];
};
export const SHOES = ['#33312d', '#cfc7b3', '#a8552e', '#5c6b6e'] as const;
const mix = (n: number) => { let h = Math.imul(n ^ 0x9e3779b9, 0x85ebca6b); h ^= h >>> 13; h = Math.imul(h, 0xc2b2ae35); return (h ^ (h >>> 16)) >>> 0; };
export function variantOf(id: number): Variant {
  const h = mix(id + 1), g = mix(id * 31 + 7);
  return {
    cloth: h % 3, skin: (h >>> 3) % 2, hat: (h >>> 5) % 3,
    gone: ((g >>> 4) % 100) < 16 ? ((g >>> 12) % 2 ? 1 : -1) : 0,
    limp: ((h >>> 9) % 2 ? 1 : -1),
    shoes: [(h >>> 11) % 4, ((h >>> 11) % 4 + 1 + (g % 3)) % 4] as const,
  };
}

/** Each kind's build, in radii: the head, how far it hangs forward and how high it rides, how high the torso stands off the floor. */
export const BUILD: Record<ZombieKind, {
  arms: number; armLen: number; armW: number; hand: number; head: number; neck: number; headLift: number; lift: number; slump: number; sway: number;
  foot: number; legW: number; hip: number; trouser: number; stride: number; shoulder: number;
}> = {
  walker: { arms: 0.42, armLen: 1.1, armW: 0.27, hand: 0.24, head: 0.52, neck: 0.38, headLift: 0.5, lift: 0.2, slump: 0.16, sway: 0.08, foot: 0.27, legW: 0.24, hip: 0.4, trouser: 1, stride: 0.5, shoulder: 0.62 },
  runner: { arms: 2.3, armLen: 0.98, armW: 0.25, hand: 0.22, head: 0.5, neck: 0.58, headLift: 0.36, lift: 0.16, slump: 0.06, sway: 0.04, foot: 0.28, legW: 0.22, hip: 0.36, trouser: 0.42, stride: 0.82, shoulder: 0.54 },
  brute: { arms: 0.8, armLen: 1.08, armW: 0.38, hand: 0.4, head: 0.38, neck: 0.34, headLift: 0.46, lift: 0.14, slump: 0.04, sway: 0.05, foot: 0.3, legW: 0.34, hip: 0.46, trouser: 0.78, stride: 0.4, shoulder: 0.78 },
  plated: { arms: 0.5, armLen: 1.05, armW: 0.28, hand: 0.24, head: 0.5, neck: 0.36, headLift: 0.55, lift: 0.2, slump: 0.08, sway: 0.06, foot: 0.26, legW: 0.26, hip: 0.4, trouser: 1, stride: 0.46, shoulder: 0.7 },
  bloater: { arms: 0.95, armLen: 0.86, armW: 0.24, hand: 0.19, head: 0.4, neck: 0.5, headLift: 0.5, lift: 0.1, slump: 0.1, sway: 0.1, foot: 0.22, legW: 0.28, hip: 0.5, trouser: 0.85, stride: 0.34, shoulder: 0.92 },
  colossus: { arms: 0.72, armLen: 1.0, armW: 0.3, hand: 0.34, head: 0.34, neck: 0.3, headLift: 0.5, lift: 0.14, slump: 0.03, sway: 0.04, foot: 0.22, legW: 0.26, hip: 0.42, trouser: 1, stride: 0.34, shoulder: 0.78 },
};

/** Each kind's torso in its own frame, in radii: a squat body wider across the shoulders than it is deep, like the soldiers'. */
export const TORSO: Record<ZombieKind, { cx: number; rx: number; ry: number; rise: number; lip: number }> = {
  walker: { cx: -0.06, rx: 0.62, ry: 0.9, rise: -0.12, lip: 0.28 },
  runner: { cx: -0.04, rx: 0.52, ry: 0.74, rise: -0.1, lip: 0.24 },
  brute: { cx: 0, rx: 0.78, ry: 1.0, rise: -0.12, lip: 0.32 },
  plated: { cx: -0.04, rx: 0.68, ry: 0.93, rise: -0.12, lip: 0.3 },
  bloater: { cx: 0, rx: 0.96, ry: 1.0, rise: -0.12, lip: 0.34 },
  colossus: { cx: 0, rx: 0.8, ry: 1.0, rise: -0.14, lip: 0.36 },
};
/** How high the torso's top face stands over the floor, in radii. */
export const topOfTorso = (kind: ZombieKind) => TORSO[kind].rise + TORSO[kind].lip;

const BONE = '#e2dccb', UNDER = '#cfc7b3', STEEL = '#7d8693', GUN = '#4f5661', RUST = '#a8552e', OLIVE = '#6c7356', KHAKI = '#b4a07a';
const STRAP = '#3f4433', LEATHER = '#4a3f35', DARK = '#3d4450';

export const skinOf = (kind: ZombieKind, v: Variant) => ZOMBIE_LOOK[kind].skins[v.skin]!;
export const clothOf = (kind: ZombieKind, v: Variant) => ZOMBIE_LOOK[kind].cloth[v.cloth]!;
/** The pale of a dead one: every colour a step darker and flatter. */
const deadly = (hex: string, dead: boolean) => (dead ? shadeHex(hex, 0.74) : hex);

const sprites = new Map<number, HTMLCanvasElement>();
let spritesScale = 0;
const SCALE_STEP = 20;
const canDraw = () => typeof document !== 'undefined';
/** Painting a sprite costs a millisecond or two; past this many ms in a frame, a missing one borrows its nearest turned neighbour. */
const BUDGET_MS = 5;
let spent = 0;
export const newSpriteFrame = () => { spent = 0; };
export const spriteCount = () => sprites.size;

/** A cached sprite, or undefined; a new scale clears the cache. */
function peek(key: number, pxPerUnit: number): HTMLCanvasElement | undefined {
  const px = Math.round(pxPerUnit * SCALE_STEP) / SCALE_STEP;
  if (px !== spritesScale) { sprites.clear(); spritesScale = px; }
  return sprites.get(key);
}
/** The same sprite turned `d` buckets (of `mod`), keys laid out as `base * 64 + bucket * 2 + dead`. */
const turned = (key: number, d: number, mod: number) => (key - (key & 63)) + ((((((key & 63) >> 1) + d) % mod + mod) % mod) << 1) + (key & 1);

/** Paints a new sprite `half` px each way from its centre, in world units at scale `pxPerUnit`; null where there is no DOM or the frame's budget is spent and no neighbour exists. */
function make(key: number, half: number, pxPerUnit: number, mod: number, paint: (g: CanvasRenderingContext2D) => void): HTMLCanvasElement | null {
  if (!canDraw()) return null;
  if (spent > BUDGET_MS && mod > 0) {
    for (let d = 1; d <= mod / 2; d++) for (const s of [1, -1]) { const near = sprites.get(turned(key, d * s, mod)); if (near) return near; }
    return null;
  }
  const t0 = performance.now();
  const px = Math.round(pxPerUnit * SCALE_STEP) / SCALE_STEP;
  const image = document.createElement('canvas');
  image.width = image.height = Math.ceil(half * 2 * px);
  const g = image.getContext('2d')!;
  g.scale(px, px);
  g.translate(half, half);
  paint(g);
  sprites.set(key, image);
  spent += performance.now() - t0;
  return image;
}

const rnd = (n: number) => { const v = Math.sin(n * 12.9898) * 43758.5453; return v - Math.floor(v); };

/** A ragged edge from (x0, y0) to (x1, y1): `n` teeth, each up to `depth` deep to the left of the way along. */
function ragged(x0: number, y0: number, x1: number, y1: number, n: number, depth: number, seed: number): [number, number][] {
  const out: [number, number][] = [[x0, y0]];
  const dx = x1 - x0, dy = y1 - y0, L = Math.hypot(dx, dy) || 1, nx = dy / L, ny = -dx / L;
  for (let i = 0; i < n; i++) {
    const t0 = (i + 0.15) / n, t1 = (i + 0.55) / n, t2 = (i + 0.9) / n;
    const d = depth * (0.55 + 0.45 * rnd(seed + i));
    out.push([x0 + dx * t0, y0 + dy * t0], [x0 + dx * t1 + nx * d, y0 + dy * t1 + ny * d], [x0 + dx * t2, y0 + dy * t2]);
  }
  out.push([x1, y1]);
  return out;
}

type Kit = {
  g: CanvasRenderingContext2D; R: number; ink: number; turn: number; v: Variant; dead: boolean; stage: number;
  skin: string; cloth: string; kind: ZombieKind;
  /** A cel-shaded part standing from `rise` to `rise + lip` radii over the floor. */
  part(trace: Trace, base: string, size: number, rise: number, lip: number, inkScale?: number): void;
  /** The offset, in the turned frame, of a point `h` radii straight up the screen. */
  up(h: number): [number, number];
  /** Runs `fn` with the origin on a part's top face, `h` radii up. */
  on(h: number, fn: () => void): void;
  poly(pts: readonly (readonly [number, number])[]): Trace;
  col(hex: string): string;
};

function makeKit(g: CanvasRenderingContext2D, kind: ZombieKind, v: Variant, turn: number, dead: boolean, stage: number): Kit {
  const R = ZOMBIES[kind].radius, ink = Math.max(1.5, R * 0.09);
  const up = (h: number): [number, number] => [-h * R * Math.sin(turn), -h * R * Math.cos(turn)];
  const col = (hex: string) => deadly(hex, dead);
  return {
    g, R, ink, turn, v, dead, stage, kind, skin: col(skinOf(kind, v)), cloth: col(clothOf(kind, v)),
    part: (trace, base, size, rise, lip, inkScale = 1) => celPart(g, trace, col(base), turn, size * R, ink * inkScale, lip * R, rise * R),
    up,
    on(h, fn) { const [x, y] = up(h); g.save(); g.translate(x, y); fn(); g.restore(); },
    poly: (pts) => polygon(...pts.map(([x, y]) => [x * R, y * R] as const)),
    col,
  };
}

function inkDisc(g: CanvasRenderingContext2D, x: number, y: number, r: number, fill: string, ink: number) {
  g.fillStyle = INK;
  g.beginPath(); g.arc(x, y, r + ink, 0, TAU); g.fill();
  g.fillStyle = fill;
  g.beginPath(); g.arc(x, y, r, 0, TAU); g.fill();
}
function glint(g: CanvasRenderingContext2D, x: number, y: number, r: number) {
  g.fillStyle = 'rgba(255, 255, 255, 0.55)';
  g.beginPath(); g.arc(x, y, r, 0, TAU); g.fill();
}
function button(k: Kit, x: number, y: number, r = 0.055, color = '#b4a07a') {
  inkDisc(k.g, x * k.R, y * k.R, r * k.R, k.col(color), k.ink * 0.6);
  glint(k.g, (x - r * 0.3) * k.R, (y - r * 0.3) * k.R, r * k.R * 0.32);
}
/** A line of cross stitches: the seam from (x0, y0) to (x1, y1) with `n` ticks across it, in radii. */
function stitches(k: Kit, x0: number, y0: number, x1: number, y1: number, n: number, len = 0.1, color = INK) {
  const g = k.g, R = k.R;
  const dx = x1 - x0, dy = y1 - y0, L = Math.hypot(dx, dy) || 1, nx = -dy / L * len, ny = dx / L * len;
  g.strokeStyle = color;
  g.lineWidth = Math.max(1.2, R * 0.05);
  g.lineCap = 'round';
  g.beginPath();
  g.moveTo(x0 * R, y0 * R); g.lineTo(x1 * R, y1 * R);
  for (let i = 0; i <= n; i++) {
    const t = i / n, cx = x0 + dx * t, cy = y0 + dy * t;
    g.moveTo((cx - nx) * R, (cy - ny) * R); g.lineTo((cx + nx) * R, (cy + ny) * R);
  }
  g.stroke();
}
/** A strip of cloth across the part, ink-edged, `w` radii wide from (x0, y0) to (x1, y1). */
function band(k: Kit, x0: number, y0: number, x1: number, y1: number, w: number, color: string, edge = k.ink * 0.8) {
  const g = k.g, R = k.R;
  g.lineCap = 'butt';
  g.strokeStyle = INK;
  g.lineWidth = w * R + edge * 2;
  g.beginPath(); g.moveTo(x0 * R, y0 * R); g.lineTo(x1 * R, y1 * R); g.stroke();
  g.strokeStyle = k.col(color);
  g.lineWidth = w * R;
  g.stroke();
}
/** A torn patch: a ragged polygon of `color` with an ink rim. */
function patch(k: Kit, pts: readonly (readonly [number, number])[], color: string, edge = k.ink * 0.7) {
  const g = k.g;
  g.lineJoin = 'round';
  g.beginPath();
  k.poly(pts)(g);
  g.strokeStyle = INK;
  g.lineWidth = edge * 2;
  g.stroke();
  g.fillStyle = k.col(color);
  g.fill();
}
/** Clips to the torso's top face (the ellipse drawn on `on`'s origin), for flat kit that must not spill over its rim. */
function clipTorso(k: Kit, kind: ZombieKind, grow = 0.97) {
  const t = TORSO[kind];
  k.g.beginPath();
  ellipse(t.cx * k.R, 0, t.rx * k.R * grow, t.ry * k.R * grow)(k.g);
  k.g.clip();
}
/** The two hard cel steps over flat kit on a part's top face, as on the camo vests. */
function slab(k: Kit, trace: Trace, base: string, h: number, size: number, ink = k.ink * 0.8) {
  k.g.save();
  const [x, y] = k.up(h);
  k.g.translate(x, y);
  celPart(k.g, trace, k.col(base), k.turn, size * k.R, ink, 0, 0);
  k.g.restore();
}

/** Bone spike: a cel cone from its base to its tip. */
const spike = (x0: number, y0: number, x1: number, y1: number, w: number): [number, number][] => {
  const dx = x1 - x0, dy = y1 - y0, L = Math.hypot(dx, dy) || 1, nx = -dy / L * w, ny = dx / L * w;
  return [[x0 + nx, y0 + ny], [x1, y1], [x0 - nx, y0 - ny]];
};

const TOP = (kind: ZombieKind) => topOfTorso(kind);

function paintWalker(k: Kit) {
  const { g, R, v } = k, t = TORSO.walker, top = TOP('walker');
  // The shirt tail hanging in rags behind, and a half-torn pack on some.
  k.part(k.poly(ragged(-0.3, -0.58, -0.3, 0.58, 5, -0.32, 3)), UNDER, 0.3, -0.16, 0.1);
  if (v.cloth === 0) k.part(k.poly([[-1.0, -0.3], [-0.52, -0.3], [-0.52, 0.5], [-1.02, 0.46]]), '#6a7255', 0.3, -0.04, 0.3, 0.9);
  k.part(ellipse(t.cx * R, 0, t.rx * R, t.ry * R), k.cloth, t.rx, t.rise, t.lip);
  k.on(top, () => {
    g.save(); clipTorso(k, 'walker');
    // The right shoulder torn clean through to the undershirt and the skin.
    const tear = ragged(-0.4, 0.95, 0.3, 0.95, 4, -0.38, 11);
    patch(k, [[-0.4, 0.2], ...tear.map(([x, y]) => [x, y] as [number, number]), [0.3, 0.2]], UNDER);
    patch(k, [[-0.28, 0.62], [0.16, 0.6], [0.1, 0.9], [-0.22, 0.92]], k.skin, k.ink * 0.5);
    g.restore();
    // Webbing across the chest, a chest pocket and the stitched seam of an old wound.
    band(k, -0.5, -0.72, 0.34, 0.1, 0.13, STRAP);
    button(k, 0.22, -0.02, 0.06, '#d9c46a');
    stitches(k, 0.26, -0.66, -0.12, -0.26, 5, 0.09);
    // The collar and the neck.
    g.fillStyle = INK; g.beginPath(); g.ellipse((0.42) * R, 0, 0.28 * R, 0.34 * R, 0, 0, TAU); g.fill();
    g.fillStyle = k.skin; g.beginPath(); g.ellipse(0.42 * R, 0, 0.2 * R, 0.26 * R, 0, 0, TAU); g.fill();
  });
}

function paintRunner(k: Kit) {
  const { g, R } = k, t = TORSO.runner, top = TOP('runner');
  k.part(ellipse(t.cx * R, 0, t.rx * R, t.ry * R), k.skin, t.rx, t.rise, t.lip);
  k.on(top, () => {
    g.save(); clipTorso(k, 'runner');
    // A torn tank top over the back: the front hem ragged, one strap gone.
    const hem = ragged(0.05, -0.8, 0.05, 0.8, 5, 0.3, 21);
    patch(k, [[-1, -0.8], ...hem.map(([x, y]) => [x, y] as [number, number]), [-1, 0.8]], k.cloth);
    g.restore();
    // A bandage wound twice round the chest with a knot, and rib marks on the bare skin.
    band(k, 0.0, -0.7, 0.34, 0.5, 0.16, UNDER);
    band(k, -0.16, -0.62, 0.18, 0.62, 0.12, UNDER, k.ink * 0.7);
    stitches(k, 0.34, 0.2, 0.46, -0.2, 3, 0.07);
    g.strokeStyle = INK; g.lineWidth = Math.max(1.4, R * 0.06); g.lineCap = 'round';
    g.beginPath();
    for (const y of [-0.3, 0, 0.3]) { g.moveTo(0.42 * R, y * R + 0.12 * R); g.lineTo(0.3 * R, y * R + 0.2 * R); }
    g.stroke();
  });
}

function paintBrute(k: Kit) {
  const { g, R } = k, t = TORSO.brute, top = TOP('brute');
  k.part(ellipse(t.cx * R, 0, t.rx * R, t.ry * R), k.skin, t.rx, t.rise, t.lip);
  // The hunch: a hump of muscle over the shoulders, standing higher than the chest.
  k.part(ellipse(-0.34 * R, 0, 0.52 * R, 0.74 * R), k.skin, 0.5, 0.06, 0.3);
  k.on(top + 0.12, () => {
    g.save();
    const [ox, oy] = k.up(-0.12);
    g.translate(ox, oy);
    g.beginPath(); ellipse(-0.34 * R, 0, 0.5 * R, 0.7 * R)(g); g.clip();
    g.fillStyle = 'rgba(10, 12, 20, 0.2)';
    g.beginPath(); ellipse(-0.34 * R, 0.0, 0.5 * R, 0.7 * R)(g); g.fill();
    g.restore();
    stitches(k, -0.5, -0.5, -0.2, 0.46, 6, 0.1);
  });
  k.on(top, () => {
    g.save(); clipTorso(k, 'brute');
    // A vest burst open at the sides, its edges ragged.
    for (const s of [-1, 1]) {
      const edge = ragged(0.7, s * 0.34, -0.7, s * 0.34, 4, s * 0.2, 31 + s);
      patch(k, [[0.7, s * 1.1], ...edge.map(([x, y]) => [x, y] as [number, number]), [-0.7, s * 1.1]], k.cloth);
    }
    g.restore();
    // The harness straps that strain across it, with a buckle and the buttons that popped.
    band(k, -0.62, -0.78, 0.62, 0.7, 0.14, LEATHER);
    band(k, -0.62, 0.78, 0.62, -0.7, 0.14, LEATHER);
    g.fillStyle = INK; g.beginPath(); g.arc(0, 0, 0.16 * R, 0, TAU); g.fill();
    g.fillStyle = k.col(STEEL); g.beginPath(); g.arc(0, 0, 0.11 * R, 0, TAU); g.fill();
    glint(g, -0.04 * R, -0.04 * R, 0.035 * R);
    button(k, 0.46, -0.1, 0.05); button(k, 0.52, 0.16, 0.045); button(k, 0.38, 0.3, 0.04);
    g.strokeStyle = 'rgba(20, 24, 32, 0.55)'; g.lineWidth = Math.max(1.4, R * 0.04);
    g.beginPath();
    for (const [x, y] of [[0.3, -0.5], [0.34, 0.5], [-0.3, 0.2]]) { g.moveTo(x * R, y * R); g.quadraticCurveTo((x + 0.14) * R, (y + 0.08) * R, (x + 0.24) * R, (y - 0.04) * R); }
    g.stroke();
  });
}

function paintPlated(k: Kit) {
  const { g, R, stage } = k, t = TORSO.plated, top = TOP('plated');
  k.part(ellipse(t.cx * R, 0, t.rx * R, t.ry * R), k.cloth, t.rx, t.rise, t.lip);
  k.on(top, () => {
    g.save(); clipTorso(k, 'plated', 0.99);
    band(k, -0.6, -0.9, -0.6, 0.9, 0.16, UNDER, k.ink * 0.5);
    g.restore();
  });
  // The riot plate on the chest and back, and what the fight has done to it.
  const plate = (x0: number, x1: number, h: number) => {
    k.part(roundBox(x0 * R, -0.58 * R, x1 * R, 0.58 * R, 0.16 * R), '#4f5661', 0.45, 0.1, h, 0.9);
  };
  plate(-0.66, 0.1, 0.08);
  k.on(0.1 + 0.08, () => {
    g.fillStyle = k.col(STEEL); g.globalAlpha = 0.55;
    g.beginPath(); roundBox(-0.58 * R, -0.5 * R, 0.02 * R, -0.34 * R, 0.07 * R)(g); g.fill();
    g.globalAlpha = 1;
    g.fillStyle = INK;
    g.beginPath();
    for (const [x, y] of [[-0.56, -0.5], [-0.56, 0.5], [0.0, -0.5], [0.0, 0.5]]) { g.moveTo(x * R + 0.04 * R, y * R); g.arc(x * R, y * R, 0.04 * R, 0, TAU); }
    g.fill();
    // Chips: stage by stage the plate loses its corners, cracks and gives way to the shirt beneath.
    const cut = (pts: [number, number][], color = k.cloth) => patch(k, pts, color, k.ink * 0.7);
    if (stage >= 1) { cut([[0.1, -0.58], [-0.14, -0.58], [0.1, -0.34]]); g.strokeStyle = INK; g.lineWidth = Math.max(1.5, R * 0.05); g.beginPath(); g.moveTo(-0.3 * R, 0.5 * R); g.lineTo(-0.2 * R, 0.2 * R); g.lineTo(-0.34 * R, 0.0); g.stroke(); }
    if (stage >= 2) { cut([[-0.66, 0.58], [-0.4, 0.58], [-0.5, 0.3], [-0.66, 0.24]]); cut([[0.1, 0.58], [-0.04, 0.58], [0.1, 0.38]]); }
    if (stage >= 3) { cut([[-0.5, -0.58], [-0.12, -0.58], [-0.24, -0.12], [-0.66, -0.2], [-0.66, -0.58]], '#5c6b6e'); g.strokeStyle = INK; g.lineWidth = Math.max(1.5, R * 0.05); g.beginPath(); g.moveTo(-0.2 * R, 0.5 * R); g.lineTo(-0.1 * R, 0.1 * R); g.lineTo(-0.3 * R, -0.05 * R); g.stroke(); }
  });
  // Scavenged shoulder plates: steel on one side, rusted sheet on the other, both riveted on.
  for (const s of [-1, 1] as const) {
    const y0 = 0.5, y1 = 1.0, x0 = -0.4, x1 = 0.3;
    const trace = roundBox(x0 * R, Math.min(s * y0, s * y1) * R, x1 * R, Math.max(s * y0, s * y1) * R, 0.14 * R);
    k.part(trace, s > 0 ? STEEL : RUST, 0.25, 0.04, 0.16);
    k.on(0.2, () => {
      g.fillStyle = INK;
      g.beginPath();
      for (const fx of [0.25, 0.75]) { const rx = (x0 + (x1 - x0) * fx) * R, ry = s * 0.75 * R; g.moveTo(rx + 0.04 * R, ry); g.arc(rx, ry, 0.04 * R, 0, TAU); }
      g.fill();
      if (s < 0 && stage >= 1) { g.strokeStyle = INK; g.lineWidth = Math.max(1.5, R * 0.05); g.beginPath(); g.moveTo(-0.3 * R, -0.62 * R); g.lineTo(0.0 * R, -0.78 * R); g.lineTo(0.1 * R, -0.66 * R); g.stroke(); }
    });
  }
}

function paintBloater(k: Kit) {
  const { g, R } = k, t = TORSO.bloater, top = TOP('bloater');
  // Rags of what was a shirt, hanging off the back.
  k.part(k.poly(ragged(-0.4, -0.62, -0.4, 0.62, 5, -0.4, 41)), UNDER, 0.3, -0.16, 0.1);
  k.part(ellipse(t.cx * R, 0, t.rx * R, t.ry * R), k.skin, t.rx, t.rise, t.lip);
  k.on(top, () => {
    g.save(); clipTorso(k, 'bloater');
    // The taut belly: a pale swollen dome with its veins.
    g.fillStyle = k.col('#a9c85c');
    g.beginPath(); g.ellipse(0.12 * R, 0, 0.62 * R, 0.66 * R, 0, 0, TAU); g.fill();
    g.fillStyle = k.col('#c6e27a');
    g.beginPath(); g.ellipse(0.0 * R, -0.12 * R, 0.4 * R, 0.4 * R, 0, 0, TAU); g.fill();
    g.strokeStyle = k.col('#5f7a2c'); g.lineWidth = Math.max(1.4, R * 0.04); g.lineCap = 'round'; g.lineJoin = 'round';
    g.beginPath();
    for (const [a, b] of [[0.5, 0.6], [-0.3, 0.9], [0.1, -0.7]] as const) { g.moveTo(0.1 * R, a * 0.3 * R); g.quadraticCurveTo(0.3 * R, b * 0.4 * R, 0.62 * R, (a + b) * 0.3 * R); }
    g.stroke();
    // Suspenders pinched into the flesh.
    band(k, -0.8, -0.44, 0.7, -0.34, 0.1, '#6c7356', k.ink * 0.6);
    band(k, -0.8, 0.44, 0.7, 0.34, 0.1, '#6c7356', k.ink * 0.6);
    g.restore();
    // Pustules: ink-rimmed blisters in the fire ramp's orange, bursting.
    for (const [x, y, sz] of [[-0.35, -0.42, 0.18], [0.3, 0.45, 0.2], [-0.38, 0.32, 0.15], [0.42, -0.3, 0.13], [0.1, 0.08, 0.12]] as const) {
      inkDisc(g, x * R, y * R, sz * R, k.col('#ff9a3c'), k.ink * 0.75);
      g.fillStyle = k.col('#ffe08a'); g.beginPath(); g.arc((x - sz * 0.25) * R, (y - sz * 0.25) * R, sz * R * 0.4, 0, TAU); g.fill();
      glint(g, (x - sz * 0.35) * R, (y - sz * 0.35) * R, Math.max(0.8, sz * R * 0.13));
    }
  });
}

function paintColossus(k: Kit) {
  const { g, R, stage } = k, t = TORSO.colossus, top = TOP('colossus');
  // Bone spikes through the back, standing out behind.
  const spikes: [number, number, number, number][] = [[-0.3, -0.7, -0.98, -0.95], [-0.4, -0.32, -1.28, -0.42], [-0.45, 0.02, -1.35, 0.06], [-0.4, 0.36, -1.24, 0.5], [-0.3, 0.7, -0.96, 0.98]];
  for (const [x0, y0, x1, y1] of spikes) k.part(k.poly(spike(x0, y0, x1, y1, 0.17)), '#e3d8bd', 0.2, -0.02, 0.1, 0.9);
  k.part(ellipse(t.cx * R, 0, t.rx * R, t.ry * R), k.skin, t.rx, t.rise, t.lip);
  k.on(top, () => {
    g.save(); clipTorso(k, 'colossus');
    // What is left of a greatcoat, torn to ribbons across the back.
    const hem = ragged(0.0, -1.0, 0.0, 1.0, 6, 0.46, 51);
    patch(k, [[-1, -1], ...hem.map(([x, y]) => [x, y] as [number, number]), [-1, 1]], k.cloth);
    g.restore();
    // Chains slung across the chest, link by link, held by a lock.
    g.lineWidth = Math.max(2, R * 0.04);
    for (const s of [-1, 1] as const) {
      const links = 9;
      for (let i = 0; i <= links; i++) {
        const u = i / links, x = (0.5 - u * 1.0) * R, y = (s * (-0.8 + u * 1.45) + Math.sin(u * Math.PI) * 0.0) * R;
        g.save(); g.translate(x, y + Math.sin(u * Math.PI) * 0.14 * R); g.rotate(i % 2 ? 0.9 : -0.1);
        g.strokeStyle = INK; g.lineWidth = Math.max(2.2, R * 0.075);
        g.beginPath(); g.ellipse(0, 0, 0.1 * R, 0.065 * R, 0, 0, TAU); g.stroke();
        g.strokeStyle = k.col('#9aa3b0'); g.lineWidth = Math.max(1.1, R * 0.035);
        g.stroke();
        g.restore();
      }
    }
    inkDisc(g, 0.02 * R, 0, 0.14 * R, k.col('#6d7480'), k.ink * 0.8);
    glint(g, -0.03 * R, -0.04 * R, 0.035 * R);
    stitches(k, 0.4, -0.55, 0.52, 0.1, 5, 0.1);
  });
  // The scrap pauldron: a sheet of rusted plate welded on over the right shoulder, its rim chipped.
  const pl = roundBox(-0.5 * R, 0.4 * R, 0.46 * R, 1.16 * R, 0.16 * R);
  k.part(pl, RUST, 0.4, 0.04, 0.2, 1.1);
  k.on(0.24, () => {
    g.save();
    g.beginPath(); pl(g); g.clip();
    g.strokeStyle = k.col('#7d8693'); g.lineWidth = R * 0.12;
    g.beginPath(); pl(g); g.stroke();
    g.fillStyle = k.col('#7a3a1f'); g.fillRect(-0.3 * R, 0.62 * R, 0.5 * R, 0.1 * R);
    g.fillStyle = k.col('#cf8c4a'); g.fillRect(-0.3 * R, 0.8 * R, 0.62 * R, 0.07 * R);
    g.restore();
    g.fillStyle = INK; g.beginPath();
    for (const [x, y] of [[-0.36, 0.52], [0.34, 0.52], [-0.36, 1.04], [0.34, 1.04], [0, 0.78]]) { g.moveTo(x * R + 0.045 * R, y * R); g.arc(x * R, y * R, 0.045 * R, 0, TAU); }
    g.fill();
    if (stage >= 1) { g.strokeStyle = INK; g.lineWidth = Math.max(2, R * 0.05); g.beginPath(); g.moveTo(-0.5 * R, 0.62 * R); g.lineTo(-0.18 * R, 0.78 * R); g.lineTo(-0.3 * R, 0.96 * R); g.stroke(); }
    if (stage >= 2) patch(k, [[0.46, 0.4], [0.2, 0.4], [0.4, 0.66]], k.skin, k.ink * 0.7);
  });
  // A steel cuff on the other shoulder.
  k.part(roundBox(-0.34 * R, -1.04 * R, 0.26 * R, -0.58 * R, 0.14 * R), STEEL, 0.25, 0.04, 0.12);
}

const TORSOS: Record<ZombieKind, (k: Kit) => void> = {
  walker: paintWalker, runner: paintRunner, brute: paintBrute, plated: paintPlated, bloater: paintBloater, colossus: paintColossus,
};

/** The most the torso sprite reaches from the body's centre, in radii (spikes and the shirt tail stand out behind). */
const REACH = 1.7;
/** How far a torso sprite reaches, in px; also the half-size it is drawn at. */
export const torsoHalf = (kind: ZombieKind) => ZOMBIES[kind].radius * REACH + 3;

/** A torso turned to angle bucket `bucket`, `stage` chips into its plates; `dead` for the lying one. */
export function torsoSprite(kind: ZombieKind, v: Variant, bucket: number, stage: number, pxPerUnit: number, dead = false): HTMLCanvasElement | null {
  const key = ((((KIND_INDEX[kind] * 3 + v.cloth) * 2 + v.skin) * 4 + stage) * 64) + bucket * 2 + (dead ? 1 : 0);
  const hit = peek(key, pxPerUnit);
  if (hit) return hit;
  return make(key, torsoHalf(kind), pxPerUnit, ZOMBIE_BUCKETS, (g) => {
    const turn = (bucket / ZOMBIE_BUCKETS) * TAU;
    g.rotate(turn);
    TORSOS[kind](makeKit(g, kind, v, turn, dead, stage));
  });
}

/* ---- Heads ---- */

/** Eye positions on a head `hr` wide, as offsets from its top face's centre, for a head facing `a`: on the front, down the face. */
export function eyeAt(a: number, side: number, hr: number): [number, number] {
  const f = 0.5, s = side * 0.42;
  return [(Math.cos(a) * f - Math.sin(a) * s) * hr, (Math.sin(a) * f + Math.cos(a) * s) * hr + hr * 0.2];
}

const HAT_KINDS: Record<ZombieKind, readonly string[]> = {
  walker: ['hair', 'helmet', 'cap'],
  runner: ['hair', 'band', 'capback'],
  brute: ['bald', 'pot', 'band'],
  plated: ['visor', 'dent', 'chunk'],
  bloater: ['hair', 'cap', 'bald'],
  colossus: ['horns', 'mask', 'horns'],
};
export const hatOf = (kind: ZombieKind, v: Variant) => HAT_KINDS[kind][v.hat]!;

export const headHalf = (kind: ZombieKind) => ZOMBIES[kind].radius * BUILD[kind].head * 2.1 + 4;

/** A head turned to bucket `bucket` with its jaw at `mouth` (0 shut, 1 slack, 2 wide); `dead` has crossed-out eyes. */
export function headSprite(kind: ZombieKind, v: Variant, bucket: number, mouth: number, pxPerUnit: number, dead = false): HTMLCanvasElement | null {
  const key = 1e6 + ((((KIND_INDEX[kind] * 2 + v.skin) * 3 + v.hat) * 4 + mouth) * 64) + bucket * 2 + (dead ? 1 : 0);
  const hit = peek(key, pxPerUnit);
  if (hit) return hit;
  return make(key, headHalf(kind), pxPerUnit, ZOMBIE_BUCKETS, (g) => paintHead(g, kind, v, hatOf(kind, v), (bucket / ZOMBIE_BUCKETS) * TAU, mouth, dead));
}

function paintHead(g: CanvasRenderingContext2D, kind: ZombieKind, v: Variant, hat: string, a: number, mouth: number, dead: boolean) {
  const R = ZOMBIES[kind].radius, hr = R * BUILD[kind].head, ink = Math.max(1.5, R * 0.09);
  const col = (h: string) => deadly(h, dead);
  const skin = col(skinOf(kind, v));
  const lip = hr * 0.42;
  // A head part standing on the floor at height `lift` px, its top face centred on the origin and its front face hanging below.
  const part = (trace: Trace, base: string, depth: number, lift = 0, size = hr, inkW = ink) => {
    g.save();
    g.translate(0, depth - lift);
    celPart(g, trace, col(base), 0, size, inkW, depth, 0);
    g.restore();
  };
  const circ = (cx: number, cy: number, r: number): Trace => ellipse(cx, cy, r, r);
  const f = (fw: number, sd: number): [number, number] => [(Math.cos(a) * fw - Math.sin(a) * sd) * hr, (Math.sin(a) * fw + Math.cos(a) * sd) * hr];
  const facing = Math.sin(a) > -0.55;
  part(circ(0, 0, hr), skinOf(kind, v), lip);
  // A lit eye: a hard core in a soft halo, in the kind's glow (red when the zombie is winding up a blow, mouth state 3).
  const eyeColor = mouth === 3 ? '#ff3b30' : ZOMBIE_LOOK[kind].eye, eyeR = Math.max(1.5, hr * 0.2) * (mouth === 3 ? 1.2 : 1);
  const lit: [number, number, number][] = [];
  const eye = (ex: number, ey: number, alpha: number) => {
    g.globalAlpha = 0.35 * alpha; g.fillStyle = eyeColor;
    g.beginPath(); g.arc(ex, ey, eyeR * 2.2, 0, TAU); g.fill();
    g.globalAlpha = alpha;
    g.beginPath(); g.arc(ex, ey, eyeR, 0, TAU); g.fill();
    g.fillStyle = 'rgba(255, 255, 255, 0.7)';
    g.beginPath(); g.arc(ex - eyeR * 0.25, ey - eyeR * 0.25, eyeR * 0.3, 0, TAU); g.fill();
    g.globalAlpha = 1;
  };
  // The face: sunk eye sockets, a nose smudge and the jaw hanging slack with its teeth.
  const dn = hr * 0.2;
  if (facing) {
    for (const s of [-1, 1]) {
      const [ex, ey] = eyeAt(a, s, hr);
      g.fillStyle = INK;
      g.beginPath(); g.ellipse(ex, ey, hr * 0.24, hr * 0.2, 0, 0, TAU); g.fill();
      if (dead) {
        g.strokeStyle = 'rgba(236, 240, 226, 0.92)'; g.lineWidth = Math.max(1.6, hr * 0.1); g.lineCap = 'round';
        g.beginPath(); g.moveTo(ex - hr * 0.12, ey - hr * 0.12); g.lineTo(ex + hr * 0.12, ey + hr * 0.12); g.moveTo(ex + hr * 0.12, ey - hr * 0.12); g.lineTo(ex - hr * 0.12, ey + hr * 0.12); g.stroke();
      } else {
        lit.push([ex, ey, 1]);
      }
    }
    const [mx, my] = f(0.62, 0);
    const open = dead ? 1 : mouth === 3 ? 2 : mouth;
    const mw = hr * (open === 2 ? 0.46 : open === 1 ? 0.34 : 0.3), mh = hr * (open === 2 ? 0.34 : open === 1 ? 0.2 : 0.06);
    g.save();
    g.translate(mx, my + dn * 1.7);
    g.fillStyle = INK;
    g.beginPath(); g.ellipse(0, 0, mw + ink * 0.5, mh + ink * 0.6, 0, 0, TAU); g.fill();
    if (open > 0) {
      g.fillStyle = col('#7a2f2f');
      g.beginPath(); g.ellipse(0, mh * 0.2, mw * 0.8, mh * 0.8, 0, 0, TAU); g.fill();
      // Teeth along the top edge, a gap or two.
      g.fillStyle = col(BONE);
      for (let i = 0; i < 4; i++) {
        if (i === 2 && open === 1) continue;
        const tx = (-0.7 + i * 0.46) * mw;
        g.fillRect(tx - mw * 0.1, -mh * 0.82, mw * 0.2, Math.max(1.3, mh * 0.55));
      }
      if (open === 2) { g.fillStyle = col('#c25a63'); g.beginPath(); g.ellipse(0, mh * 0.5, mw * 0.4, mh * 0.35, 0, 0, TAU); g.fill(); }
    } else {
      g.strokeStyle = col(UNDER); g.lineWidth = Math.max(1.2, hr * 0.06);
      g.beginPath(); for (let i = -2; i <= 2; i++) { g.moveTo(i * mw * 0.4, -mh * 2); g.lineTo(i * mw * 0.4, mh * 2); } g.stroke();
    }
    g.restore();
  } else {
    // Turned away: the back of the head, a stitched seam across the scalp.
    if (!dead) for (const s of [-1, 1]) { const [ex, ey] = eyeAt(a, s, hr); lit.push([ex, ey, 0.6]); }
    g.strokeStyle = INK; g.lineWidth = Math.max(1.4, hr * 0.07); g.lineCap = 'round';
    const [sx, sy] = f(0.1, 0);
    g.beginPath(); g.moveTo(sx - hr * 0.5, sy + hr * 0.1); g.quadraticCurveTo(sx, sy - hr * 0.1, sx + hr * 0.5, sy + hr * 0.1);
    for (let i = -2; i <= 2; i++) { g.moveTo(sx + i * hr * 0.2, sy + hr * 0.02 - Math.abs(i) * 0); g.lineTo(sx + i * hr * 0.2, sy + hr * 0.2); }
    g.stroke();
  }
  // Cheek wound: a pale bandage patch on one side, a skin-tone blotch on the other.
  if (kind === 'walker' && v.skin === 1) { g.fillStyle = col(UNDER); g.beginPath(); g.ellipse(...f(0.25, 0.7), hr * 0.2, hr * 0.14, a + 0.7, 0, TAU); g.fill(); }
  // Headgear.
  const hatTop = hr * 0.26;
  switch (hat) {
    case 'hair':
    case 'bald': {
      if (hat === 'bald') { g.fillStyle = col(shadeHex(skinOf(kind, v), 0.8)); g.beginPath(); g.ellipse(...f(-0.2, -0.2), hr * 0.22, hr * 0.15, 0.5, 0, TAU); g.fill(); break; }
      g.fillStyle = INK;
      g.beginPath();
      for (const [fw, sd, r] of [[-0.45, -0.2, 0.26], [-0.55, 0.25, 0.22], [-0.1, 0.5, 0.18]] as const) { const [x, y] = f(fw, sd); g.moveTo(x + hr * r, y - hr * 0.1); g.arc(x, y - hr * 0.1, hr * r, 0, TAU); }
      g.fill();
      break;
    }
    case 'helmet': case 'pot': {
      // A broken steel helmet pushed back, dented, with a bullet hole.
      const base = hat === 'pot' ? '#5c6b6e' : '#7a838e';
      const sz = hat === 'pot' ? 0.7 : 0.82;
      const back = hat === 'pot' ? -0.3 : -0.38;
      part(circ(...f(back, 0), hr * sz), base, hr * 0.34, hatTop, hr * 0.8);
      g.save(); g.translate(...f(back, 0)); g.translate(0, -hatTop - hr * 0.0);
      g.strokeStyle = INK; g.lineWidth = Math.max(1.5, hr * 0.07); g.lineCap = 'round'; g.lineJoin = 'round';
      g.beginPath(); g.moveTo(-hr * 0.4, -hr * 0.1); g.lineTo(-hr * 0.1, hr * 0.0); g.lineTo(-hr * 0.2, hr * 0.2); g.stroke();
      inkDisc(g, hr * 0.28, -hr * 0.18, hr * 0.08, '#141c3c', ink * 0.5);
      g.restore();
      break;
    }
    case 'cap': case 'capback': {
      // A side cap or a ball cap in the uniform's colour, crooked, with a ragged brim.
      const c = hat === 'cap' ? clothOf(kind, v) : '#978562';
      part(circ(...f(-0.08, 0), hr * 0.98), c, hr * 0.3, hatTop, hr * 0.8);
      const [bx, by] = f(hat === 'cap' ? 0.55 : -0.7, 0);
      g.save(); g.translate(bx, by - hatTop + hr * 0.04); g.rotate(a + (hat === 'cap' ? 0.2 : Math.PI));
      g.fillStyle = INK; g.beginPath(); g.ellipse(0, 0, hr * 0.5, hr * 0.37, 0, 0, TAU); g.fill();
      g.fillStyle = col(shadeHex(c, 0.82)); g.beginPath(); g.ellipse(0, 0, hr * 0.42, hr * 0.29, 0, 0, TAU); g.fill();
      g.restore();
      break;
    }
    case 'band': {
      // A rag knotted round the head, its tails flying.
      g.strokeStyle = INK; g.lineWidth = hr * 0.34 + ink * 2; g.lineCap = 'round';
      g.beginPath(); g.ellipse(0, -hatTop * 0.1, hr * 0.92, hr * 0.78, 0, Math.PI * 1.05, Math.PI * 1.95); g.stroke();
      g.strokeStyle = col(RUST); g.lineWidth = hr * 0.34;
      g.stroke();
      const [kx, ky] = f(-0.8, 0.2);
      g.strokeStyle = INK; g.lineWidth = hr * 0.2 + ink * 1.6;
      g.beginPath(); g.moveTo(kx, ky - hatTop * 0.2); g.lineTo(kx - hr * 0.5, ky + hr * 0.4); g.moveTo(kx, ky - hatTop * 0.2); g.lineTo(kx + hr * 0.3, ky + hr * 0.55); g.stroke();
      g.strokeStyle = col(RUST); g.lineWidth = hr * 0.2;
      g.stroke();
      break;
    }
    case 'visor': case 'dent': case 'chunk': {
      // The riot helmet: a dented steel pot, a cracked visor, or a piece broken clean off.
      part(circ(0, -hr * 0.04, hr * 1.06), '#7a838e', hr * 0.4, hatTop, hr * 0.9);
      g.save(); g.translate(0, -hatTop);
      g.strokeStyle = INK; g.lineCap = 'round'; g.lineJoin = 'round'; g.lineWidth = Math.max(1.5, hr * 0.07);
      if (hat === 'visor') {
        const [vx, vy] = f(0.58, 0);
        g.fillStyle = col('#26304a'); g.beginPath(); g.ellipse(vx, vy + hr * 0.3, hr * 0.5, hr * 0.26, a * 0.0, 0, TAU); g.fill();
        g.strokeStyle = 'rgba(180, 220, 240, 0.7)'; g.beginPath(); g.moveTo(vx - hr * 0.3, vy + hr * 0.2); g.lineTo(vx, vy + hr * 0.34); g.lineTo(vx + hr * 0.26, vy + hr * 0.24); g.stroke();
      }
      g.strokeStyle = INK;
      if (hat === 'dent') { g.beginPath(); g.arc(-hr * 0.3, -hr * 0.1, hr * 0.38, 0.2, 2.2); g.stroke(); }
      if (hat === 'chunk') { g.fillStyle = col('#5c6b6e'); g.beginPath(); g.moveTo(hr * 0.2, -hr * 0.6); g.lineTo(hr * 0.9, -hr * 0.2); g.lineTo(hr * 0.5, hr * 0.0); g.lineTo(hr * 0.35, -hr * 0.3); g.closePath(); g.fill(); g.stroke(); }
      g.restore();
      break;
    }
    case 'mask': case 'horns': {
      // A scorched iron brow band riveted across the scalp, and bone horns through the skull.
      for (const s of [-1, 1]) {
        const [bx, by] = f(-0.2, s * 0.66);
        g.fillStyle = col('#e3d8bd'); g.strokeStyle = INK; g.lineWidth = Math.max(1.5, hr * 0.08); g.lineJoin = 'round';
        const [tx, ty] = f(-0.35, s * 1.25);
        g.beginPath(); g.moveTo(bx - hr * 0.16 * Math.abs(Math.cos(a)), by - hatTop * 0.5); g.lineTo(tx, ty - hr * 0.6 - hatTop); g.lineTo(bx + hr * 0.2, by - hatTop * 0.2); g.closePath(); g.fill(); g.stroke();
      }
      if (hat === 'mask') {
        part(roundBox(-hr * 0.98, -hr * 0.38, hr * 0.98, hr * 0.0, hr * 0.12), '#5d636d', hr * 0.1, hatTop * 0.2, hr * 0.5, ink * 0.9);
      }
      break;
    }
  }
  // The eyes burn over the headgear.
  for (const [ex, ey, al] of lit) eye(ex, ey, al);
}

/* ---- Hands ---- */

export const handHalf = (kind: ZombieKind) => ZOMBIES[kind].radius * BUILD[kind].hand + 6;

/** A fist or a claw reaching toward angle bucket `bucket`; a `stump` is the bandaged end of a missing arm. */
export function handSprite(kind: ZombieKind, v: Variant, bucket: number, stump: boolean, pxPerUnit: number, dead = false): HTMLCanvasElement | null {
  const key = 2e6 + (((KIND_INDEX[kind] * 2 + v.skin) * 2 + (stump ? 1 : 0)) * 64) + bucket * 2 + (dead ? 1 : 0);
  const hit = peek(key, pxPerUnit);
  if (hit) return hit;
  return make(key, handHalf(kind), pxPerUnit, HAND_BUCKETS, (g) => {
    const R = ZOMBIES[kind].radius, hr = R * BUILD[kind].hand, ink = Math.max(1.5, R * 0.09);
    const a = (bucket / HAND_BUCKETS) * TAU;
    const col = (h: string) => deadly(h, dead);
    const skin = col(ZOMBIE_LOOK[kind].skins[v.skin]!);
    const fx = Math.cos(a), fy = Math.sin(a);
    if (stump) {
      // Bandaged to a knot: the arm ends here.
      celPart(g, ellipse(0, 0, hr * 0.9, hr * 0.9), UNDER, 0, hr, ink, 0, 0);
      g.strokeStyle = INK; g.lineWidth = Math.max(1.4, hr * 0.12); g.lineCap = 'round';
      g.beginPath(); g.moveTo(-hr * 0.5, -hr * 0.3); g.lineTo(hr * 0.5, hr * 0.3); g.moveTo(-hr * 0.5, hr * 0.3); g.lineTo(hr * 0.5, -hr * 0.3); g.stroke();
      return;
    }
    celPart(g, ellipse(0, 0, hr, hr * 0.92), skin, 0, hr, ink, 0, 0);
    // Knuckles or claws on the far side, a wrist wrap on the near one.
    const claw = kind !== 'brute';
    g.strokeStyle = INK; g.fillStyle = col(claw ? '#e3d8bd' : shadeHex(ZOMBIE_LOOK[kind].skins[v.skin]!, 0.8)); g.lineWidth = Math.max(1.2, hr * 0.12); g.lineJoin = 'round';
    for (const s of [-1, 0, 1]) {
      const ox = fx * hr * 0.9 - fy * s * hr * 0.55, oy = fy * hr * 0.9 + fx * s * hr * 0.55;
      if (claw) {
        g.beginPath(); g.moveTo(ox - fy * hr * 0.2, oy + fx * hr * 0.2); g.lineTo(ox + fx * hr * 0.55, oy + fy * hr * 0.55); g.lineTo(ox + fy * hr * 0.2, oy - fx * hr * 0.2); g.closePath(); g.fill(); g.stroke();
      } else {
        g.beginPath(); g.arc(ox * 0.85, oy * 0.85, hr * 0.28, 0, TAU); g.fill(); g.stroke();
      }
    }
    if (kind === 'brute' || kind === 'colossus' || kind === 'plated') {
      g.strokeStyle = INK; g.lineWidth = hr * 0.42 + ink; g.lineCap = 'butt';
      g.beginPath(); g.moveTo(-fx * hr * 0.55 - fy * hr, -fy * hr * 0.55 + fx * hr); g.lineTo(-fx * hr * 0.55 + fy * hr, -fy * hr * 0.55 - fx * hr); g.stroke();
      g.strokeStyle = col(kind === 'plated' ? STEEL : kind === 'colossus' ? '#9aa3b0' : UNDER); g.lineWidth = hr * 0.42;
      g.stroke();
    }
    glint(g, -hr * 0.3, -hr * 0.35, Math.max(0.9, hr * 0.12));
  });
}

export { UNDER, BONE };

