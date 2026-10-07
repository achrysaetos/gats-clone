import { ZOM, ZOMBIE_KINDS, ZOMBIES, type ZombieKind } from '../shared/defs.ts';
import type { BuildingView, ZombieView } from '../shared/protocol.ts';
import { cellRect } from '../shared/sim/build.ts';
import { HIT_FLASH_MS } from './effects.ts';
import { INK, PALETTE, shade, tint, ZOMBIE_LOOK } from './palette.ts';
import { LIGHT } from './tilt.ts';

const TAU = Math.PI * 2;

/** What a zombie is chewing on, and the point of contact on it. */
export type BiteTarget = { on: 'core' | 'building' | 'player'; x: number; y: number };
type Rect = { x: number; y: number; w: number; h: number };

/** A building's cell as one number, for lookups that allocate nothing. */
export const cellId = (cx: number, cy: number) => cy * 4096 + cx;

/** Slack on top of the bite's own reach, since the drawn zombie sits a frame or two behind the server's. */
export const BITE_SLACK = 6;

function nearestOnRect(r: Rect, x: number, y: number): { x: number; y: number; d: number } {
  const nx = Math.max(r.x, Math.min(r.x + r.w, x)), ny = Math.max(r.y, Math.min(r.y + r.h, y));
  return { x: nx, y: ny, d: Math.hypot(x - nx, y - ny) };
}

/**
 * Whether a zombie at (x, y) is in biting reach of something, read the way the horde bites (horde.ts): a squad player
 * within reach first, then the core, then any squad building beside it. The client has no bite event, so standing in
 * reach is the cue to swing.
 */
export function biteTarget(
  kind: ZombieKind, x: number, y: number, core: Rect | null, buildingAt: ReadonlyMap<number, BuildingView>, players: readonly { x: number; y: number; r: number }[],
): BiteTarget | null {
  const reach = ZOMBIES[kind].radius + ZOM.biteReach + BITE_SLACK;
  for (const p of players) {
    const d = Math.hypot(p.x - x, p.y - y);
    if (d <= reach + p.r) return { on: 'player', x: x + ((p.x - x) / (d || 1)) * (d - p.r), y: y + ((p.y - y) / (d || 1)) * (d - p.r) };
  }
  if (core) {
    const n = nearestOnRect(core, x, y);
    if (n.d <= reach) return { on: 'core', x: n.x, y: n.y };
  }
  const cx = Math.floor(x / ZOM.cell), cy = Math.floor(y / ZOM.cell);
  let best: { x: number; y: number; d: number } | null = null;
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      const b = buildingAt.get(cellId(cx + dx, cy + dy));
      if (!b) continue;
      const n = nearestOnRect(cellRect(b.cx, b.cy), x, y);
      if (n.d <= reach && (!best || n.d < best.d)) best = n;
    }
  }
  return best ? { on: 'building', x: best.x, y: best.y } : null;
}

/** Where in its swing a zombie lands the blow, as a share of its bite period. */
export const STRIKE_AT = 0.62;

/**
 * The pose `t` (0..1) through one bite: rear back and spread the arms, snap forward with the claws crossing, squash on the
 * blow and settle. `lunge` is toward the target in body radii, `spread` opens the arms in radians, `reach` stretches
 * them in radii, `stretch` scales the body along its heading (above 1 stretched, below squashed).
 */
export function swingPose(t: number): { lunge: number; spread: number; reach: number; stretch: number } {
  const ease = (v: number) => v * v * (3 - 2 * v);
  if (t < 0.5) {
    const w = ease(t / 0.5);
    return { lunge: -0.14 * w, spread: 0.55 * w, reach: 1 - 0.15 * w, stretch: 1 - 0.04 * w };
  }
  if (t < STRIKE_AT) {
    const s = (t - 0.5) / (STRIKE_AT - 0.5);
    return { lunge: -0.14 + 0.5 * s * s, spread: 0.55 - 0.95 * s, reach: 0.85 + 0.55 * s, stretch: 0.96 + 0.18 * s };
  }
  if (t < 0.8) {
    const s = (t - STRIKE_AT) / (0.8 - STRIKE_AT);
    const squash = Math.sin(Math.min(1, s * 1.6) * Math.PI);
    return { lunge: 0.36 * (1 - ease(s)), spread: -0.4 * (1 - s), reach: 1.4 - 0.4 * ease(s), stretch: 1 - 0.2 * squash };
  }
  const s = (t - 0.8) / 0.2;
  return { lunge: 0, spread: 0, reach: 1, stretch: 1 + 0 * s };
}

const WARN = '#ff3b30';

/** A swing telegraphs from deep in its wind-up until the blow lands. */
export const telegraphs = (pose: { spread: number; lunge: number }) => pose.spread > 0.3 && pose.lunge <= 0;

/** Whether a cycle's phase moved past `at` between two frames, wrapping round the cycle's end. */
export function crossed(prev: number, cur: number, at: number): boolean {
  return prev <= cur ? prev < at && cur >= at : prev < at || cur >= at;
}

/** Px walked per full stride, so feet keep pace with the ground at any speed. */
export const strideOf = (kind: ZombieKind) => ZOMBIES[kind].radius * 2.6;

type Anim = {
  x: number; y: number; a: number; stride: number; speed: number; at: number;
  swingAt: number | null; phase: number; target: BiteTarget | null; kind: ZombieKind;
};

const anims = new Map<number, Anim>();

export type Strike = { kind: ZombieKind; target: BiteTarget; x: number; y: number; angle: number };

const TURN_PER_SEC = 7;
const turnToward = (a: number, to: number, k: number) => { const d = to - a; return a + Math.atan2(Math.sin(d), Math.cos(d)) * Math.min(1, k); };

/**
 * Advances each zombie's walk and bite from where it is drawn this frame: its heading eases toward the way it walks (or the
 * thing it bites), its stride advances by the ground it covers, and a zombie in reach of something swings on its bite
 * cadence, calling `onStrike` the frame each blow lands. Zombies gone from the snapshot are dropped.
 */
export function animateZombies(
  zombies: readonly ZombieView[], now: number, toward: { x: number; y: number },
  targetOf: (kind: ZombieKind, x: number, y: number) => BiteTarget | null, onStrike: (s: Strike) => void,
) {
  const seen = new Set<number>();
  for (const [id, k, x, y] of zombies) {
    seen.add(id);
    const kind = ZOMBIE_KINDS[k]!;
    let z = anims.get(id);
    if (!z || z.kind !== kind) {
      z = { x, y, a: Math.atan2(toward.y - y, toward.x - x), stride: id * 1.7, speed: 0, at: now, swingAt: null, phase: 0, target: null, kind };
      anims.set(id, z);
    }
    const dt = Math.max(0, Math.min(100, now - z.at)) / 1000;
    const moved = Math.hypot(x - z.x, y - z.y);
    if (moved > 0.25) z.a = turnToward(z.a, Math.atan2(y - z.y, x - z.x), dt * TURN_PER_SEC);
    if (moved < 40) z.stride += (moved / strideOf(kind)) * TAU;
    z.speed += ((dt > 0 ? moved / dt : 0) - z.speed) * Math.min(1, dt * 8);
    z.x = x; z.y = y; z.at = now;
    const target = targetOf(kind, x, y);
    z.target = target;
    if (!target) { z.swingAt = null; continue; }
    z.a = turnToward(z.a, Math.atan2(target.y - y, target.x - x), dt * TURN_PER_SEC * 1.5);
    const period = ZOMBIES[kind].attackMs;
    // A fresh biter starts mid wind-up, so its first blow lands soon after it arrives; ids stagger a crowd's rhythm.
    if (z.swingAt === null) { z.swingAt = now - period * (0.3 + ((id * 0.618) % 1) * 0.2); z.phase = ((now - z.swingAt) % period) / period; }
    const phase = ((now - z.swingAt) % period) / period;
    if (crossed(z.phase, phase, STRIKE_AT)) onStrike({ kind, target, x, y, angle: Math.atan2(target.y - y, target.x - x) });
    z.phase = phase;
  }
  for (const id of anims.keys()) if (!seen.has(id)) anims.delete(id);
}

export const zombieAnim = (id: number): Readonly<Anim> | undefined => anims.get(id);
export const clearZombieAnims = () => anims.clear();

/**
 * Each kind's build, all in body radii. `arms` is the angle off the heading the arms reach at rest (walkers reach out, a
 * runner sweeps them back), `armW` their thickness, `hand` the fist, `head` the head and how far forward it hangs (`neck`),
 * `slump` how far it lolls to one side, `sway` how much the body shambles side to side.
 */
const BUILD: Record<ZombieKind, { arms: number; armLen: number; armW: number; hand: number; head: number; neck: number; slump: number; sway: number; foot: number }> = {
  walker: { arms: 0.42, armLen: 1.12, armW: 0.3, hand: 0.24, head: 0.5, neck: 0.42, slump: 0.16, sway: 0.08, foot: 0.26 },
  runner: { arms: 2.3, armLen: 0.95, armW: 0.3, hand: 0.22, head: 0.5, neck: 0.55, slump: 0.06, sway: 0.04, foot: 0.28 },
  brute: { arms: 0.78, armLen: 1.05, armW: 0.34, hand: 0.36, head: 0.38, neck: 0.36, slump: 0.04, sway: 0.05, foot: 0.24 },
  plated: { arms: 0.5, armLen: 1.08, armW: 0.3, hand: 0.24, head: 0.48, neck: 0.38, slump: 0.08, sway: 0.06, foot: 0.24 },
  bloater: { arms: 0.95, armLen: 0.86, armW: 0.24, hand: 0.18, head: 0.34, neck: 0.62, slump: 0.1, sway: 0.1, foot: 0.2 },
  colossus: { arms: 0.72, armLen: 1.0, armW: 0.3, hand: 0.34, head: 0.34, neck: 0.34, slump: 0.03, sway: 0.04, foot: 0.22 },
};

const SCALE_STEP = 20;
const sprites = new Map<string, HTMLCanvasElement>();
let spritesScale = 0;

function sprite(key: string, radius: number, pxPerUnit: number, paint: (g: CanvasRenderingContext2D, r: number) => void): HTMLCanvasElement {
  const px = Math.round(pxPerUnit * SCALE_STEP) / SCALE_STEP;
  if (px !== spritesScale) { sprites.clear(); spritesScale = px; }
  let image = sprites.get(key);
  if (!image) {
    image = document.createElement('canvas');
    image.width = image.height = Math.ceil((radius + 3) * 2 * px);
    const g = image.getContext('2d')!;
    g.scale(px, px);
    g.translate(radius + 3, radius + 3);
    paint(g, radius);
    sprites.set(key, image);
  }
  return image;
}

function disc(g: CanvasRenderingContext2D, x: number, y: number, r: number, fill: string) {
  g.fillStyle = fill;
  g.beginPath();
  g.arc(x, y, r, 0, TAU);
  g.fill();
}

/** A disc in the kit's cel shading: ink rim, a hard dark crescent away from the light and a hard light one toward it. */
function celDisc(g: CanvasRenderingContext2D, r: number, color: string, rim: number) {
  disc(g, 0, 0, r, INK);
  const c = r - rim;
  g.save();
  g.beginPath();
  g.arc(0, 0, c, 0, TAU);
  g.clip();
  disc(g, 0, 0, c, shade(color, 0.78));
  disc(g, -c * 0.16, -c * 0.16, c, color);
  g.fillStyle = tint(color, 0.3);
  g.beginPath();
  g.arc(0, 0, c, 0, TAU);
  g.arc(c * 0.13, c * 0.13, c, 0, TAU, true);
  g.fill();
  g.restore();
}

/** Inside a disc of radius `c`, clipped, so details never spill past the rim. */
function inside(g: CanvasRenderingContext2D, c: number, paint: () => void) {
  g.save();
  g.beginPath();
  g.arc(0, 0, c, 0, TAU);
  g.clip();
  paint();
  g.restore();
}

const ROT = 'rgba(52, 30, 26, 0.55)';

/** Each kind's torso: the silhouette and the details that tell the six apart at a glance. Drawn unrotated, lit from the world's light. */
function paintBody(g: CanvasRenderingContext2D, kind: ZombieKind, r: number) {
  const look = ZOMBIE_LOOK[kind];
  // Armour shows as plates, not a thicker rim, so the plated read by their kit rather than as dark rings.
  const rim = 1.8 + look.armor * 0.25;
  switch (kind) {
    case 'colossus': {
      // A ring of bone spikes round a scarred hide.
      g.fillStyle = '#d9cfb4';
      g.strokeStyle = INK;
      g.lineWidth = 1.6;
      g.beginPath();
      for (let i = 0; i < 9; i++) {
        const a = (i / 9) * TAU + 0.3;
        g.moveTo(Math.cos(a - 0.16) * r * 0.86, Math.sin(a - 0.16) * r * 0.86);
        g.lineTo(Math.cos(a) * (r + 2.5), Math.sin(a) * (r + 2.5));
        g.lineTo(Math.cos(a + 0.16) * r * 0.86, Math.sin(a + 0.16) * r * 0.86);
      }
      g.fill();
      g.stroke();
      celDisc(g, r * 0.9, look.body, rim);
      inside(g, r * 0.9 - rim, () => {
        g.fillStyle = shade(look.body, 0.62);
        for (const [x, y, w, h] of [[-0.5, -0.2, 0.42, 0.3], [0.1, 0.15, 0.46, 0.28], [-0.2, 0.42, 0.36, 0.22]] as const) {
          g.beginPath();
          g.roundRect(x * r, y * r, w * r, h * r, 2);
          g.fill();
        }
        g.strokeStyle = 'rgba(28, 31, 38, 0.6)';
        g.lineWidth = 1.4;
        g.beginPath();
        g.moveTo(-r * 0.6, -r * 0.45); g.lineTo(-r * 0.1, -r * 0.3); g.lineTo(r * 0.3, -r * 0.5);
        g.moveTo(r * 0.5, r * 0.1); g.lineTo(r * 0.2, r * 0.55);
        g.stroke();
      });
      return;
    }
    case 'plated': {
      celDisc(g, r, look.body, rim);
      inside(g, r - rim, () => {
        // Riveted plates strapped over the torso, the kit's gunmetal gone dull.
        g.fillStyle = '#5c6570';
        g.fillRect(-r, -r * 0.18, r * 2, r * 0.36);
        g.fillStyle = 'rgba(255, 255, 255, 0.22)';
        g.fillRect(-r, -r * 0.18, r * 2, r * 0.08);
        g.fillStyle = '#8a5a3a';
        g.fillRect(-r * 0.12, -r, r * 0.24, r * 2);
        g.fillStyle = '#c9cfd6';
        for (const x of [-0.62, -0.3, 0.3, 0.62]) disc(g, x * r, 0, r * 0.07, '#c9cfd6');
      });
      return;
    }
    case 'bloater': {
      celDisc(g, r, look.body, rim);
      inside(g, r - rim, () => {
        // Swollen with pustules and dark veins.
        g.strokeStyle = 'rgba(70, 30, 20, 0.45)';
        g.lineWidth = 1.1;
        g.beginPath();
        g.moveTo(-r * 0.7, r * 0.1); g.quadraticCurveTo(-r * 0.2, -r * 0.1, r * 0.1, r * 0.5);
        g.moveTo(r * 0.6, -r * 0.4); g.quadraticCurveTo(r * 0.2, -r * 0.05, r * 0.35, r * 0.3);
        g.stroke();
        for (const [x, y, s] of [[-0.42, -0.35, 0.22], [0.38, 0.32, 0.26], [0.05, -0.55, 0.16], [-0.5, 0.42, 0.17], [0.55, -0.15, 0.14]] as const) {
          disc(g, x * r, y * r, s * r + 1, shade('#c9b04a', 0.6));
          disc(g, x * r, y * r, s * r, '#c9b04a');
          disc(g, (x - s * 0.35) * r, (y - s * 0.35) * r, s * r * 0.4, '#f0e2a0');
        }
      });
      return;
    }
    case 'brute': {
      celDisc(g, r, look.body, rim);
      inside(g, r - rim, () => {
        // A hunched back: a heavy spine ridge and stitched scars.
        g.fillStyle = shade(look.body, 0.7);
        g.beginPath();
        g.ellipse(-r * 0.15, -r * 0.05, r * 0.2, r * 0.62, 0.5, 0, TAU);
        g.fill();
        g.strokeStyle = ROT;
        g.lineWidth = 1.3;
        g.beginPath();
        g.moveTo(r * 0.15, -r * 0.55); g.lineTo(r * 0.5, r * 0.2);
        for (let i = 0; i < 4; i++) { const t = i / 3; g.moveTo(r * (0.18 + 0.32 * t) - 3, r * (-0.5 + 0.7 * t) + 1.5); g.lineTo(r * (0.18 + 0.32 * t) + 3, r * (-0.5 + 0.7 * t) - 1.5); }
        g.stroke();
      });
      return;
    }
    case 'runner': {
      celDisc(g, r, look.body, rim);
      inside(g, r - rim, () => {
        // Torn rags over a lean frame.
        g.fillStyle = shade(look.body, 0.72);
        g.beginPath();
        g.moveTo(-r, r * 0.2); g.lineTo(-r * 0.2, r * 0.05); g.lineTo(-r * 0.35, r * 0.4); g.lineTo(r * 0.3, r * 0.25); g.lineTo(r, r * 0.6); g.lineTo(r, r); g.lineTo(-r, r);
        g.closePath();
        g.fill();
      });
      return;
    }
    case 'walker': {
      celDisc(g, r, look.body, rim);
      inside(g, r - rim, () => {
        // A ripped shirt in the kit's khaki and a dark wound.
        g.fillStyle = '#7c7255';
        g.beginPath();
        g.moveTo(-r, -r * 0.1); g.lineTo(-r * 0.3, -r * 0.25); g.lineTo(-r * 0.1, r * 0.05); g.lineTo(r * 0.35, -r * 0.15); g.lineTo(r, r * 0.15); g.lineTo(r, r); g.lineTo(-r, r);
        g.closePath();
        g.fill();
        g.fillStyle = 'rgba(255, 255, 255, 0.14)';
        g.fillRect(-r, -r * 0.1 - 1, r * 0.7, 1.6);
        g.fillStyle = ROT;
        g.beginPath();
        g.ellipse(r * 0.3, r * 0.42, r * 0.2, r * 0.12, -0.5, 0, TAU);
        g.fill();
      });
      return;
    }
  }
}

function paintHead(g: CanvasRenderingContext2D, kind: ZombieKind, r: number) {
  const look = ZOMBIE_LOOK[kind];
  if (kind === 'plated') {
    // A steel helmet.
    celDisc(g, r, '#7a838e', 1.6);
    g.fillStyle = 'rgba(255, 255, 255, 0.3)';
    g.fillRect(-r * 0.55, -r * 0.62, r * 0.6, r * 0.18);
    return;
  }
  celDisc(g, r, tint(look.body, 0.08), 1.5);
  if (kind === 'walker' || kind === 'runner') {
    // Patchy scalp.
    g.fillStyle = shade(look.body, 0.6);
    g.beginPath();
    g.ellipse(-r * 0.18, r * 0.12, r * 0.32, r * 0.22, 0.6, 0, TAU);
    g.fill();
  }
}

export function bodyImage(kind: ZombieKind, pxPerUnit: number) {
  const r = ZOMBIES[kind].radius;
  return sprite(`b|${kind}`, r + 3, pxPerUnit, (g) => paintBody(g, kind, r));
}

function headImage(kind: ZombieKind, pxPerUnit: number) {
  const r = ZOMBIES[kind].radius * BUILD[kind].head;
  return sprite(`h|${kind}`, r, pxPerUnit, (g) => paintHead(g, kind, r));
}

function addCircle(ctx: CanvasRenderingContext2D, x: number, y: number, r: number) {
  ctx.moveTo(x + r, y);
  ctx.arc(x, y, r, 0, TAU);
}

type Pose = { id: number; x: number; y: number; a: number; bx: number; by: number; stretch: number; bob: number; t: number; walk: number; swing: ReturnType<typeof swingPose> | null; hit: number };

/** One kind's crowd as poses: the body pushed by its lunge or knockback, the walk's bob, the swing's squash. */
function posesOf(zombies: readonly ZombieView[], k: number, flashes: ReadonlyMap<number, number>, now: number): Pose[] {
  const kind = ZOMBIE_KINDS[k]!;
  const r = ZOMBIES[kind].radius;
  const out: Pose[] = [];
  for (const [id, , x, y] of zombies) {
    const z = anims.get(id);
    const a = z?.a ?? 0;
    const walk = z ? Math.min(1, z.speed / Math.max(1, ZOMBIES[kind].speed * 0.5)) : 0;
    const swing = z?.swingAt != null ? swingPose(z.phase) : null;
    const hitAt = flashes.get(id);
    const hit = hitAt === undefined ? 0 : Math.max(0, 1 - (now - hitAt) / (HIT_FLASH_MS * 1.6));
    const stride = z?.stride ?? 0;
    const sway = Math.sin(stride) * BUILD[kind].sway * r * walk;
    // Knocked back along the heading on a hit, lunging toward the target on a swing.
    const push = (swing ? swing.lunge * r : 0) - hit * r * 0.22;
    const c = Math.cos(a), s = Math.sin(a);
    out.push({
      id, x, y, a, walk, swing, hit,
      bx: x + c * push - s * sway, by: y + s * push + c * sway,
      stretch: (swing?.stretch ?? 1) * (1 - hit * 0.16),
      bob: 1 + 0.035 * Math.abs(Math.sin(stride)) * walk + (kind === 'bloater' ? 0.045 * Math.sin(now / 260 + id) : 0),
      t: stride,
    });
  }
  return out;
}

/**
 * The horde, batched by kind: feet, then arms, then bodies, heads and eyes, each as one path or one sprite per zombie, so a
 * night of hundreds costs a few fills per kind. Feet step with the ground covered, arms sway against them, the body bobs and
 * shambles; a biter rears back and lunges with its arms swiping across, squashing on the blow; a hit knocks it back and
 * flashes it white.
 */
export function drawHorde(ctx: CanvasRenderingContext2D, zombies: readonly ZombieView[], flashes: ReadonlyMap<number, number>, now: number, pxPerUnit: number) {
  const byKind: ZombieView[][] = ZOMBIE_KINDS.map(() => []);
  for (const z of zombies) byKind[z[1]]?.push(z);
  for (let k = 0; k < ZOMBIE_KINDS.length; k++) {
    const kind = ZOMBIE_KINDS[k]!;
    if (!byKind[k]!.length) continue;
    const poses = posesOf(byKind[k]!, k, flashes, now);
    if (!poses.length) continue;
    const look = ZOMBIE_LOOK[kind];
    const b = BUILD[kind];
    const r = ZOMBIES[kind].radius;
    // Feet, stepping out from under the body.
    const feet: number[] = [];
    for (const p of poses) {
      const c = Math.cos(p.a), s = Math.sin(p.a);
      for (const side of [-1, 1]) {
        const step = Math.sin(p.t + (side > 0 ? 0 : Math.PI)) * r * 0.5 * p.walk;
        const fx = p.x + c * (step + r * 0.1) - s * side * r * 0.42, fy = p.y + s * (step + r * 0.1) + c * side * r * 0.42;
        feet.push(fx, fy, r * b.foot);
      }
    }
    ctx.fillStyle = INK;
    ctx.beginPath();
    for (let i = 0; i < feet.length; i += 3) addCircle(ctx, feet[i]!, feet[i + 1]!, feet[i + 2]! + 1.3);
    ctx.fill();
    ctx.fillStyle = shade(look.arm, 0.62);
    ctx.beginPath();
    for (let i = 0; i < feet.length; i += 3) addCircle(ctx, feet[i]!, feet[i + 1]!, feet[i + 2]!);
    ctx.fill();
    // Arms from the shoulders to the hands, swinging against the stride, or swiping in a bite.
    const arms: number[] = [];
    for (const p of poses) {
      const shoulder = r * 0.62;
      for (const side of [-1, 1]) {
        const swingOpen = p.swing ? p.swing.spread : 0;
        const reach = (p.swing ? p.swing.reach : 1) * b.armLen * r;
        // Runners pump their arms; the rest reach out ahead and loll as they shamble.
        const pump = kind === 'runner' ? Math.sin(p.t + (side > 0 ? Math.PI : 0)) * 0.5 * p.walk : Math.sin(p.t + (side > 0 ? Math.PI : 0)) * 0.16 * p.walk;
        const rest = kind === 'runner' && p.swing ? 0.45 : b.arms;
        const arm = p.a + side * (rest + swingOpen) + pump;
        const sa = p.a + side * Math.PI / 2;
        const sx = p.bx + Math.cos(sa) * shoulder, sy = p.by + Math.sin(sa) * shoulder;
        arms.push(sx, sy, sx + Math.cos(arm) * reach, sy + Math.sin(arm) * reach);
      }
    }
    ctx.lineCap = 'round';
    ctx.strokeStyle = INK;
    ctx.lineWidth = r * b.armW * 2 + 2.6;
    ctx.beginPath();
    for (let i = 0; i < arms.length; i += 4) { ctx.moveTo(arms[i]!, arms[i + 1]!); ctx.lineTo(arms[i + 2]!, arms[i + 3]!); }
    ctx.stroke();
    ctx.strokeStyle = look.arm;
    ctx.lineWidth = r * b.armW * 2;
    ctx.stroke();
    // Hands: ink-rimmed fists, claws for the big ones.
    ctx.fillStyle = INK;
    ctx.beginPath();
    for (let i = 0; i < arms.length; i += 4) addCircle(ctx, arms[i + 2]!, arms[i + 3]!, r * b.hand + 1.3);
    ctx.fill();
    ctx.fillStyle = shade(look.arm, 0.82);
    ctx.beginPath();
    for (let i = 0; i < arms.length; i += 4) addCircle(ctx, arms[i + 2]!, arms[i + 3]!, r * b.hand);
    ctx.fill();
    if (look.shoulders) {
      // Heavy shoulders over the arms' roots.
      const pads: number[] = [];
      for (const p of poses) for (const side of [-1, 1]) { const sa = p.a + side * 1.35; pads.push(p.bx + Math.cos(sa) * r * 0.74, p.by + Math.sin(sa) * r * 0.74, r * 0.42); }
      ctx.fillStyle = INK;
      ctx.beginPath();
      for (let i = 0; i < pads.length; i += 3) addCircle(ctx, pads[i]!, pads[i + 1]!, pads[i + 2]! + 1.6);
      ctx.fill();
      ctx.fillStyle = look.arm;
      ctx.beginPath();
      for (let i = 0; i < pads.length; i += 3) addCircle(ctx, pads[i]!, pads[i + 1]!, pads[i + 2]!);
      ctx.fill();
      ctx.fillStyle = tint(look.arm, 0.25);
      ctx.beginPath();
      for (let i = 0; i < pads.length; i += 3) addCircle(ctx, pads[i]! - LIGHT.x * pads[i + 2]! * 0.3, pads[i + 1]! - LIGHT.y * pads[i + 2]! * 0.3, pads[i + 2]! * 0.5);
      ctx.fill();
    }
    // Bodies: one sprite each, stretched along the heading for a lunge and squashed on the blow.
    const body = bodyImage(kind, pxPerUnit);
    const half = r + 6;
    for (const p of poses) {
      const sz = half * p.bob;
      if (Math.abs(p.stretch - 1) < 0.05) { ctx.drawImage(body, p.bx - sz, p.by - sz, sz * 2, sz * 2); continue; }
      const c = Math.cos(p.a), s = Math.sin(p.a), along = p.stretch, across = 2 - p.stretch;
      ctx.save();
      ctx.translate(p.bx, p.by);
      ctx.transform(along * c * c + across * s * s, (along - across) * c * s, (along - across) * c * s, along * s * s + across * c * c, 0, 0);
      ctx.drawImage(body, -sz, -sz, sz * 2, sz * 2);
      ctx.restore();
    }
    // Heads, hung forward and lolling, then the eyes on them.
    const head = headImage(kind, pxPerUnit);
    const hr = r * b.head, hs = hr + 3;
    const eyes: number[] = [];
    const warn: number[] = [];
    for (const p of poses) {
      const loll = ((p.id % 2) * 2 - 1) * b.slump + Math.sin(now / 340 + p.id) * 0.08;
      const ha = p.a + loll;
      const reachOut = r * b.neck * (p.swing ? 1 + p.swing.lunge * 0.6 : 1);
      // Seen a little from the front, a head rides a touch up the screen from where it hangs.
      const hx = p.bx + Math.cos(ha) * reachOut, hy = p.by + Math.sin(ha) * reachOut - r * 0.14;
      ctx.drawImage(head, hx - hs, hy - hs, hs * 2, hs * 2);
      const list = p.swing && telegraphs(p.swing) ? warn : eyes;
      for (const side of [-1, 1]) list.push(hx + Math.cos(p.a + side * 0.55) * hr * 0.55, hy + Math.sin(p.a + side * 0.55) * hr * 0.55);
    }
    const eyeR = Math.max(1.4, hr * 0.2);
    if (look.eye !== '#1b1d22') {
      // Glowing eyes get a halo, so a brute or the Colossus is spotted in the dark.
      ctx.globalAlpha = 0.35;
      ctx.fillStyle = look.eye;
      ctx.beginPath();
      for (let i = 0; i < eyes.length; i += 2) addCircle(ctx, eyes[i]!, eyes[i + 1]!, eyeR * 2.2);
      ctx.fill();
      ctx.globalAlpha = 1;
    }
    ctx.fillStyle = look.eye;
    ctx.beginPath();
    for (let i = 0; i < eyes.length; i += 2) addCircle(ctx, eyes[i]!, eyes[i + 1]!, eyeR);
    ctx.fill();
    if (warn.length) {
      // The wind-up's telegraph: eyes flare red as it rears back to swing.
      ctx.globalAlpha = 0.45;
      ctx.fillStyle = WARN;
      ctx.beginPath();
      for (let i = 0; i < warn.length; i += 2) addCircle(ctx, warn[i]!, warn[i + 1]!, eyeR * 2.4);
      ctx.fill();
      ctx.globalAlpha = 1;
      ctx.fillStyle = '#ffd0c8';
      ctx.beginPath();
      for (let i = 0; i < warn.length; i += 2) addCircle(ctx, warn[i]!, warn[i + 1]!, eyeR * 1.1);
      ctx.fill();
    }
    // The hit flash, over the drawn body where it was knocked to.
    for (const p of poses) {
      if (p.hit <= 0) continue;
      ctx.globalAlpha = 0.85 * Math.min(1, p.hit * 1.6);
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(p.bx, p.by, r * p.bob, 0, TAU);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }
  drawBars(ctx, zombies);
}

function drawBars(ctx: CanvasRenderingContext2D, zombies: readonly ZombieView[]) {
  for (const [, kind, x, y, hp] of zombies) {
    if (!ZOMBIE_LOOK[ZOMBIE_KINDS[kind]!].bar) continue;
    const r = ZOMBIES[ZOMBIE_KINDS[kind]!].radius, half = r - 2;
    ctx.fillStyle = 'rgba(28, 31, 38, 0.6)';
    ctx.beginPath();
    ctx.roundRect(x - half - 1.5, y - r - 15.5, half * 2 + 3, 7, 3);
    ctx.fill();
    ctx.fillStyle = hp > 3 ? PALETTE.hpBad : '#ff9f43';
    ctx.beginPath();
    ctx.roundRect(x - half, y - r - 14, Math.max(4, half * 2 * (hp / 10)), 4, 2);
    ctx.fill();
  }
}
