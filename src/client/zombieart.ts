import { ZOM, ZOMBIE_KINDS, ZOMBIES, type ZombieKind } from '../shared/defs.ts';
import type { BuildingView, ZombieView } from '../shared/protocol.ts';
import { cellRect } from '../shared/sim/build.ts';
import { HIT_FLASH_MS } from './effects.ts';
import { setLight } from './lighting.ts';
import { INK, PALETTE, shadeHex, ZOMBIE_LOOK } from './palette.ts';
import { LIGHT } from './tilt.ts';
import {
  BUILD, bucketOf, eyeAt, newSpriteFrame, handBucketOf, handHalf, handSprite, headHalf, headSprite, SHOES, topOfTorso, TORSO, torsoHalf, torsoSprite,
  variantOf, ZOMBIE_BUCKETS, type Variant,
} from './zombiekit.ts';

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

export { bucketOf, ZOMBIE_BUCKETS };
export const bodyImage = (kind: ZombieKind, bucket: number, pxPerUnit: number) => torsoSprite(kind, variantOf(0), bucket, 0, pxPerUnit);

/** Plated kit chips away as the wearer's health falls: whole, then notched, cracked, and hanging off. */
const stageOf = (kind: ZombieKind, hp: number) => (kind === 'plated' || kind === 'colossus' ? (hp >= 8 ? 0 : hp >= 5 ? 1 : hp >= 3 ? 2 : 3) : 0);

/** Which kinds wear sleeves to the elbow; the rest go bare-armed. */
const SLEEVES: Record<ZombieKind, boolean> = { walker: true, runner: false, brute: false, plated: true, bloater: false, colossus: true };

type Pose = {
  id: number; kind: ZombieKind; k: number; x: number; y: number; a: number; bx: number; by: number; stretch: number; t: number; walk: number;
  swing: ReturnType<typeof swingPose> | null; hit: number; v: Variant; stage: number;
  /** The torso sprite's centre, and where the head's top face sits. */
  tx: number; ty: number; hx: number; hy: number; mouth: number; pulse: number;
  /** The two arms, posed once a frame by drawLimbs and read again for the hands. */
  arms: Arm[];
};

/** A thud's dust and a Colossus's cracks, short-lived and tiny. */
type Thud = { x: number; y: number; born: number; crack: boolean; seed: number; r: number };
const thuds: Thud[] = [];
const lastPhase = new Map<number, number>();
const THUD_MS = 320, CRACK_MS = 900;
const SEEN = new Map<number, number>();
let frame = 0;

function posesOf(zombies: readonly ZombieView[], flashes: ReadonlyMap<number, number>, now: number): Pose[] {
  const out: Pose[] = [];
  for (const [id, k, x, y, hp] of zombies) {
    const kind = ZOMBIE_KINDS[k]!;
    const b = BUILD[kind], r = ZOMBIES[kind].radius;
    const z = anims.get(id);
    const a = z?.a ?? 0;
    const walk = z ? Math.min(1, z.speed / Math.max(1, ZOMBIES[kind].speed * 0.5)) : 0;
    const swing = z?.swingAt != null ? swingPose(z.phase) : null;
    const hitAt = flashes.get(id);
    const hit = hitAt === undefined ? 0 : Math.max(0, 1 - (now - hitAt) / (HIT_FLASH_MS * 1.6));
    const stride = z?.stride ?? 0;
    const v = variantOf(id);
    const c = Math.cos(a), s = Math.sin(a);
    const sway = Math.sin(stride) * b.sway * r * walk;
    // Knocked back along the heading on a hit, lunging toward the target on a swing.
    const push = (swing ? swing.lunge * r : 0) - hit * r * 0.24;
    const bx = x + c * push - s * sway, by = y + s * push + c * sway;
    // The body rises through each step and drops on the foot that lands; a walker's bad leg drops it further.
    const heavy = kind === 'brute' || kind === 'colossus';
    let rise = r * (heavy ? 0.07 : kind === 'runner' ? 0.08 : 0.05) * walk * Math.abs(Math.cos(stride));
    if (kind === 'walker') rise -= r * 0.07 * walk * Math.max(0, v.limp > 0 ? -Math.sin(stride) : Math.sin(stride)) ** 3;
    const breathe = kind === 'bloater' ? 0.045 * Math.sin(now / 260 + id) : 0.012 * Math.sin(now / 700 + id);
    const ty = by - b.lift * r - rise - r * breathe;
    // The head hangs forward and lolls; it rears back in a wind-up, snaps out on the blow and flinches back on a hit.
    const loll = ((id % 2) * 2 - 1) * b.slump + Math.sin(now / 340 + id) * 0.08;
    const ha = a + loll;
    const neck = b.neck * r * (swing ? 1 + swing.lunge * 0.9 : 1) * (1 - hit * 0.8);
    const hx = bx + Math.cos(ha) * neck, hy = ty + Math.sin(ha) * neck * 0.85 - b.headLift * r + (kind === 'runner' ? 0 : r * 0.02 * Math.sin(stride * 2 + id)) + hit * r * 0.1;
    const mouth = swing ? (telegraphs(swing) ? 3 : swing.spread > 0.15 || swing.lunge > 0.05 ? 2 : 1) : hit > 0.3 ? 2 : kind === 'colossus' || kind === 'runner' ? 1 : id % 3 === 0 ? 0 : 1;
    out.push({
      id, kind, k, x, y, a, walk, swing, hit, v, stage: stageOf(kind, hp),
      bx, by, tx: bx, ty, hx, hy, mouth, arms: [],
      stretch: (swing?.stretch ?? 1) * (1 - hit * 0.16),
      t: stride, pulse: 0.5 + 0.5 * Math.sin(now / 330 + id * 1.3),
    });
  }
  return out;
}

/** Dust where a heavy foot lands, a crack in the ground for the Colossus, spawned as the stride crosses each foot-fall. */
function stomps(poses: readonly Pose[], now: number) {
  for (const p of poses) {
    if (p.kind !== 'brute' && p.kind !== 'colossus' && p.kind !== 'bloater') continue;
    const cur = ((p.t % TAU) + TAU) % TAU;
    const prev = lastPhase.get(p.id);
    lastPhase.set(p.id, cur);
    SEEN.set(p.id, frame);
    if (prev === undefined || p.walk < 0.4) continue;
    for (const [at, side] of [[Math.PI / 2, -1], [Math.PI * 1.5, 1]] as const) {
      if (!crossed(prev, cur, at)) continue;
      const r = ZOMBIES[p.kind].radius, b = BUILD[p.kind];
      const c = Math.cos(p.a), s = Math.sin(p.a);
      const fx = p.bx + c * r * b.stride * 0.9 - s * side * r * b.hip, fy = p.by + s * r * b.stride * 0.9 + c * side * r * b.hip;
      if (thuds.length > 90) thuds.shift();
      thuds.push({ x: fx, y: fy, born: now, crack: p.kind === 'colossus', seed: p.id * 7 + (side + 1), r: p.kind === 'bloater' ? 0.5 : p.kind === 'brute' ? 0.75 : 1 });
    }
  }
  if (frame % 60 === 0) for (const id of lastPhase.keys()) if (frame - (SEEN.get(id) ?? 0) > 120) { lastPhase.delete(id); SEEN.delete(id); }
}

function drawThuds(ctx: CanvasRenderingContext2D, now: number) {
  for (let i = thuds.length - 1; i >= 0; i--) if (now - thuds[i]!.born > CRACK_MS) thuds.splice(i, 1);
  if (!thuds.length) return;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  for (const t of thuds) {
    const age = now - t.born;
    if (t.crack) {
      // Ink cracks splitting the floor from the footfall, in short chunky segments.
      const k = 1 - Math.max(0, age - 200) / (CRACK_MS - 200);
      ctx.globalAlpha = Math.min(1, k * 1.4);
      ctx.strokeStyle = INK;
      ctx.lineWidth = 3;
      ctx.beginPath();
      for (let j = 0; j < 4; j++) {
        const a = ((t.seed * 1.7 + j * 1.6) % TAU), L = 11 + (j % 2) * 7;
        const mx = t.x + Math.cos(a) * L * 0.55, my = t.y + Math.sin(a) * L * 0.55;
        ctx.moveTo(t.x + Math.cos(a) * 3, t.y + Math.sin(a) * 3);
        ctx.lineTo(mx + Math.sin(a) * 3, my - Math.cos(a) * 3);
        ctx.lineTo(t.x + Math.cos(a) * L, t.y + Math.sin(a) * L);
      }
      ctx.stroke();
    }
    if (age < THUD_MS) {
      const k = age / THUD_MS, e = 1 - (1 - k) ** 2;
      ctx.globalAlpha = 0.65 * (1 - k);
      ctx.fillStyle = '#e2dccb';
      ctx.beginPath();
      for (let j = 0; j < 3; j++) {
        const a = j * 2.1 + t.seed, d = (3 + 7 * e) * t.r;
        const rr = (1.6 + 2.6 * e) * t.r;
        const px = t.x + Math.cos(a) * d, py = t.y + Math.sin(a) * d * 0.6 - 3 * e * t.r;
        ctx.moveTo(px + rr, py); ctx.arc(px, py, rr, 0, TAU);
      }
      ctx.fill();
    }
  }
  ctx.globalAlpha = 1;
}

/**
 * The horde, drawn as the toy line it is. First the contact shadows and thuds, then each kind's limbs batched (legs in torn
 * trousers, mismatched shoes, sleeves and bare arms: a few strokes per kind and look), then every zombie's body, hands, head
 * and eyes as cached sprites in depth order, so a crowd overlaps the way a toy diorama would: the nearer one in front.
 * Feet step with the ground covered (a walker favours one leg), arms sway against them, the body rises and drops with the
 * step; a biter rears back with its jaw wide and lunges with its arms swiping across, squashing on the blow; a hit knocks it
 * back, snaps the head and flashes it white.
 */
/** Where the horde's eyes were last drawn, per colour, for the glow that rides over the night shade (drawHordeEyes). */
const eyeGlow: { color: string; r: number; xy: number[] }[] = [];
/** Swollen bellies' glow, which shines through the night too. */
const bellyGlow: { x: number; y: number; r: number; a: number }[] = [];

/** At night the horde is drawn under the shade; its eyes and bellies shine through it, a faint light each, so the horde still reads in the dark. */
export function drawHordeEyes(ctx: CanvasRenderingContext2D, dark: number) {
  if (dark <= 0.02 || (!eyeGlow.length && !bellyGlow.length)) return;
  for (const g of eyeGlow) {
    ctx.fillStyle = g.color;
    ctx.globalAlpha = 0.5 * dark;
    ctx.beginPath();
    for (let i = 0; i < g.xy.length; i += 2) addCircle(ctx, g.xy[i]!, g.xy[i + 1]!, g.r * 2.1);
    ctx.fill();
    ctx.globalAlpha = Math.min(1, 0.95 * dark + 0.05);
    ctx.beginPath();
    for (let i = 0; i < g.xy.length; i += 2) addCircle(ctx, g.xy[i]!, g.xy[i + 1]!, g.r);
    ctx.fill();
  }
  if (bellyGlow.length) {
    ctx.fillStyle = '#b6f06a';
    for (const b of bellyGlow) {
      ctx.globalAlpha = b.a * dark;
      ctx.beginPath();
      addCircle(ctx, b.x, b.y, b.r);
      ctx.fill();
    }
  }
  ctx.globalAlpha = 1;
}

function addCircle(ctx: CanvasRenderingContext2D, x: number, y: number, r: number) {
  ctx.moveTo(x + r, y);
  ctx.arc(x, y, r, 0, TAU);
}

const CONTACT = 'rgba(10, 12, 18, 0.42)';
const eyeRadius = (kind: ZombieKind) => Math.max(1.5, ZOMBIES[kind].radius * BUILD[kind].head * 0.2);

export function drawHorde(ctx: CanvasRenderingContext2D, zombies: readonly ZombieView[], flashes: ReadonlyMap<number, number>, now: number, pxPerUnit: number) {
  eyeGlow.length = 0;
  bellyGlow.length = 0;
  frame++;
  newSpriteFrame();
  if (!zombies.length) { drawThuds(ctx, now); return; }
  const poses = posesOf(zombies, flashes, now);
  stomps(poses, now);
  // Contact shadows: a crisp pool under each pair of feet, a little down-screen, as under the soldiers.
  ctx.fillStyle = CONTACT;
  ctx.beginPath();
  for (const p of poses) {
    const r = ZOMBIES[p.kind].radius;
    ctx.moveTo(p.bx + LIGHT.x * r * 0.12 + r * 0.86, p.by + r * 0.2);
    ctx.ellipse(p.bx + LIGHT.x * r * 0.12, p.by + r * 0.2, r * 0.86, r * 0.5, 0, 0, TAU);
  }
  ctx.fill();
  drawThuds(ctx, now);
  drawLimbs(ctx, poses);
  poses.sort((p, q) => p.by - q.by);
  const warn: number[] = [];
  const eyesBy: ({ color: string; r: number; xy: number[] } | undefined)[] = [];
  let bellies = 0, giants = 0;
  for (const p of poses) {
    const { kind } = p, b = BUILD[kind], r = ZOMBIES[kind].radius, look = ZOMBIE_LOOK[kind];
    const bucket = bucketOf(p.a);
    const half = torsoHalf(kind);
    const body = torsoSprite(kind, p.v, bucket, p.stage, pxPerUnit);
    if (body) {
      if (Math.abs(p.stretch - 1) < 0.05) ctx.drawImage(body, p.tx - half, p.ty - half, half * 2, half * 2);
      else {
        const c = Math.cos(p.a), s = Math.sin(p.a), along = p.stretch, across = 2 - p.stretch;
        ctx.save();
        ctx.translate(p.tx, p.ty);
        ctx.transform(along * c * c + across * s * s, (along - across) * c * s, (along - across) * c * s, along * s * s + across * c * c, 0, 0);
        ctx.drawImage(body, -half, -half, half * 2, half * 2);
        ctx.restore();
      }
    }
    const tTop = topOfTorso(kind) * r;
    if (kind === 'bloater') {
      // The belly's glow and its pustules pulsing under the skin.
      const bx = p.tx + Math.cos(p.a) * r * 0.12, by = p.ty - tTop + Math.sin(p.a) * r * 0.12;
      const pr = r * (0.5 + 0.05 * p.pulse);
      ctx.fillStyle = '#d6ff7a';
      ctx.globalAlpha = 0.14 + 0.2 * p.pulse;
      ctx.beginPath(); ctx.arc(bx, by, pr, 0, TAU); ctx.fill();
      ctx.globalAlpha = 1;
      const c = Math.cos(p.a), s = Math.sin(p.a);
      ctx.fillStyle = '#fff2b0';
      ctx.beginPath();
      for (const [x, y, sz] of [[-0.35, -0.42, 0.18], [0.3, 0.45, 0.2], [-0.38, 0.32, 0.15]] as const) {
        const wx = p.tx + (x * c - y * s) * r, wy = p.ty - tTop + (x * s + y * c) * r, rr = sz * r * (0.3 + 0.25 * p.pulse);
        ctx.moveTo(wx + rr, wy); ctx.arc(wx, wy, rr, 0, TAU);
      }
      ctx.fill();
      bellyGlow.push({ x: bx, y: by, r: pr * 1.6, a: 0.13 + 0.1 * p.pulse });
      if (bellies++ < 10) setLight(`zb${p.id}`, { x: bx, y: by, radius: 110, color: '#a6e05a', intensity: 0.4 + 0.2 * p.pulse, flicker: 0.2, shadows: false, size: 8, inside: 40 });
    }
    // Hands at the end of each arm.
    const hh = handHalf(kind);
    for (let i = 0; i < 2; i++) {
      const h = p.arms[i]!;
      const img = handSprite(kind, p.v, handBucketOf(h.ha), h.stump, pxPerUnit);
      if (img) ctx.drawImage(img, h.hx - hh, h.hy - hh, hh * 2, hh * 2);
    }
    // The head, its jaw on the swing, and the eyes burning in it.
    const head = headSprite(kind, p.v, bucket, p.mouth, pxPerUnit);
    const hs = headHalf(kind);
    if (head) ctx.drawImage(head, p.hx - hs, p.hy - hs, hs * 2, hs * 2);
    const hr = r * b.head;
    const eyeR = eyeRadius(kind);
    const telegraph = p.swing && telegraphs(p.swing);
    const color = telegraph ? WARN : look.eye;
    for (const side of [-1, 1]) {
      const [ex, ey] = eyeAt(p.a, side, hr);
      let list = warn;
      if (!telegraph) {
        let e = eyesBy[p.k];
        if (!e) eyesBy[p.k] = (e = { color, r: eyeR, xy: [] });
        list = e.xy;
      }
      list.push(p.hx + ex, p.hy + ey);
    }
    if (kind === 'colossus' && giants++ < 4) setLight(`zc${p.id}`, { x: p.hx, y: p.hy + hr * 0.4, radius: 95, color: '#ffb347', intensity: 0.5, flicker: 0.1, shadows: false, size: 6, inside: 50 });
    if (p.hit > 0) {
      // The hit flash, over the torso and the head where they were knocked to.
      ctx.globalAlpha = 0.6 * Math.min(1, p.hit * 1.6);
      ctx.fillStyle = '#ffffff';
      const t = TORSO[kind];
      ctx.beginPath();
      ctx.moveTo(p.tx + r * t.rx, p.ty - tTop);
      ctx.ellipse(p.tx + Math.cos(p.a) * t.cx * r, p.ty - tTop, r * t.rx, r * t.ry, p.a, 0, TAU);
      ctx.moveTo(p.hx + hr, p.hy);
      ctx.arc(p.hx, p.hy, hr, 0, TAU);
      ctx.fill();
      ctx.globalAlpha = 1;
    }
  }
  for (const e of eyesBy) if (e) eyeGlow.push(e);
  if (warn.length) eyeGlow.push({ color: WARN, r: 3, xy: warn });
  drawBars(ctx, zombies);
}

type Arm = { sx: number; sy: number; ex: number; ey: number; hx: number; hy: number; ha: number; stump: boolean; sleeve: number };

function armOf(p: Pose, side: -1 | 1): Arm {
  const { kind } = p, b = BUILD[kind], r = ZOMBIES[kind].radius;
  const swingOpen = p.swing ? p.swing.spread : 0;
  const reach = (p.swing ? p.swing.reach : 1) * b.armLen * r;
  // Runners pump their arms; the rest reach out ahead and loll as they shamble, the flinch pulling them in.
  const pump = kind === 'runner' ? Math.sin(p.t + (side > 0 ? Math.PI : 0)) * 0.5 * p.walk : Math.sin(p.t + (side > 0 ? Math.PI : 0)) * 0.16 * p.walk;
  const rest = kind === 'runner' && p.swing ? 0.45 : b.arms;
  const arm = p.a + side * (rest + swingOpen) + pump + side * p.hit * 0.5;
  const sa = p.a + side * Math.PI / 2;
  const sx = p.tx + Math.cos(sa) * b.shoulder * r, sy = p.ty - topOfTorso(kind) * r * 0.6 + Math.sin(sa) * b.shoulder * r * 0.8;
  const gone = p.v.gone === side;
  const len = gone ? reach * 0.38 : reach * (1 - p.hit * 0.25);
  const hx = sx + Math.cos(arm) * len, hy = sy + Math.sin(arm) * len;
  // The elbow bows outward from the body, more the more the arm is bent.
  const bow = r * 0.2 * (1 - Math.min(1, len / (b.armLen * r * 1.3) * 0.6));
  const ex = (sx + hx) / 2 + Math.cos(sa) * bow, ey = (sy + hy) / 2 + Math.sin(sa) * bow * 0.8;
  const torn = kind === 'walker' && side === p.v.limp ? 0.45 : 1;
  return { sx, sy, ex, ey, hx, hy, ha: arm, stump: gone, sleeve: SLEEVES[kind] ? torn : 0 };
}

/** Legs, shoes and arms for every zombie of each kind, batched by look: a handful of strokes per kind rather than per zombie. */
type Tones = { legCloth: string; legSkin: string; armCloth: string; armSkin: string };
const tonesOf: Tones[][] = [];
/** A look's limb colours, worked out once. */
function tones(kind: ZombieKind, k: number, grp: number): Tones {
  const row = tonesOf[k] ?? (tonesOf[k] = []);
  return row[grp] ?? (row[grp] = {
    legCloth: shadeHex(ZOMBIE_LOOK[kind].cloth[(grp / 2) | 0]!, 0.88), legSkin: shadeHex(ZOMBIE_LOOK[kind].skins[grp % 2]!, 0.85),
    armCloth: shadeHex(ZOMBIE_LOOK[kind].cloth[(grp / 2) | 0]!, 0.9), armSkin: shadeHex(ZOMBIE_LOOK[kind].skins[grp % 2]!, 0.82),
  });
}

function drawLimbs(ctx: CanvasRenderingContext2D, poses: readonly Pose[]) {
  const byKind: Pose[][] = ZOMBIE_KINDS.map(() => []);
  for (const p of poses) byKind[p.k]!.push(p);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  for (let k = 0; k < ZOMBIE_KINDS.length; k++) {
    const list = byKind[k]!;
    if (!list.length) continue;
    const kind = ZOMBIE_KINDS[k]!, b = BUILD[kind], r = ZOMBIES[kind].radius, look = ZOMBIE_LOOK[kind];
    const legs: number[][] = [[], [], [], [], [], []];
    const shoes: number[][] = SHOES.map(() => []);
    const armsAll: number[] = [];
    const arms: number[][] = [[], [], [], [], [], []];
    for (const p of list) {
      const c = Math.cos(p.a), s = Math.sin(p.a);
      const grp = p.v.cloth * 2 + p.v.skin;
      for (const side of [-1, 1] as const) {
        const ph = p.t + (side > 0 ? 0 : Math.PI);
        // A walker's bad leg takes short steps and drags its foot; everyone else steps evenly.
        const bad = kind === 'walker' && side === p.v.limp;
        const amp = r * b.stride * p.walk * (bad ? 0.55 : 1);
        const along = Math.sin(ph) * amp + r * 0.08, lift = Math.max(0, Math.cos(ph)) * r * 0.22 * p.walk * (bad ? 0.3 : 1);
        const fx = p.bx + c * along - s * side * b.hip * r, fy = p.by + s * along + c * side * b.hip * r - lift;
        const hipx = p.bx - s * side * b.hip * r * 0.8, hipy = p.by + c * side * b.hip * r * 0.8 - b.lift * r * 0.5;
        legs[grp]!.push(hipx, hipy, fx, fy);
        shoes[side < 0 ? p.v.shoes[0] : p.v.shoes[1]]!.push(fx + c * r * 0.08, fy + s * r * 0.08 + r * 0.04, p.a);
        const arm = armOf(p, side);
        p.arms[side < 0 ? 0 : 1] = arm;
        armsAll.push(arm.sx, arm.sy, arm.ex, arm.ey, arm.hx, arm.hy);
        arms[grp]!.push(arm.sx, arm.sy, arm.ex, arm.ey, arm.hx, arm.hy, arm.stump ? 1 : 0, arm.sleeve);
      }
    }
    const ink = Math.max(2, r * 0.09);
    // Legs: ink, then trousers (or bare skin below torn shorts), per look.
    ctx.strokeStyle = INK;
    ctx.lineWidth = b.legW * r + ink * 2;
    ctx.beginPath();
    for (const g of legs) for (let i = 0; i < g.length; i += 4) { ctx.moveTo(g[i]!, g[i + 1]!); ctx.lineTo(g[i + 2]!, g[i + 3]!); }
    ctx.stroke();
    for (let grp = 0; grp < 6; grp++) {
      const g = legs[grp]!;
      if (!g.length) continue;
      const { legCloth: cloth, legSkin: skin } = tones(kind, k, grp);
      if (b.trouser < 1) {
        ctx.strokeStyle = skin;
        ctx.lineWidth = b.legW * r;
        ctx.beginPath();
        for (let i = 0; i < g.length; i += 4) { ctx.moveTo(g[i]!, g[i + 1]!); ctx.lineTo(g[i + 2]!, g[i + 3]!); }
        ctx.stroke();
      }
      ctx.strokeStyle = cloth;
      ctx.lineWidth = b.legW * r * (b.trouser < 1 ? 1.12 : 1);
      ctx.beginPath();
      for (let i = 0; i < g.length; i += 4) { ctx.moveTo(g[i]!, g[i + 1]!); ctx.lineTo(g[i]! + (g[i + 2]! - g[i]!) * b.trouser, g[i + 1]! + (g[i + 3]! - g[i + 1]!) * b.trouser); }
      ctx.stroke();
    }
    // Shoes, each side a different pair: ink, then paint by colour with a dark sole line.
    ctx.fillStyle = INK;
    ctx.beginPath();
    for (const sh of shoes) for (let i = 0; i < sh.length; i += 3) { const rx = r * b.foot * 1.25 + ink, ry = r * b.foot * 0.85 + ink; ctx.moveTo(sh[i]! + rx, sh[i + 1]!); ctx.ellipse(sh[i]!, sh[i + 1]!, rx, ry, sh[i + 2]!, 0, TAU); }
    ctx.fill();
    shoes.forEach((sh, ci) => {
      if (!sh.length) return;
      ctx.fillStyle = SHOES[ci]!;
      ctx.beginPath();
      for (let i = 0; i < sh.length; i += 3) { const rx = r * b.foot * 1.25, ry = r * b.foot * 0.85; ctx.moveTo(sh[i]! + rx, sh[i + 1]!); ctx.ellipse(sh[i]!, sh[i + 1]!, rx, ry, sh[i + 2]!, 0, TAU); }
      ctx.fill();
    });
    // Arms: one ink pass over every arm, then each look's sleeves, bare forearms and a cel shade along the far side.
    ctx.strokeStyle = INK;
    ctx.lineWidth = r * b.armW * 2 + ink * 2;
    ctx.beginPath();
    for (let i = 0; i < armsAll.length; i += 6) { ctx.moveTo(armsAll[i]!, armsAll[i + 1]!); ctx.lineTo(armsAll[i + 2]!, armsAll[i + 3]!); ctx.lineTo(armsAll[i + 4]!, armsAll[i + 5]!); }
    ctx.stroke();
    for (let grp = 0; grp < 6; grp++) {
      const g = arms[grp]!;
      if (!g.length) continue;
      const { armCloth: cloth, armSkin: skin } = tones(kind, k, grp);
      ctx.lineWidth = r * b.armW * 2;
      ctx.strokeStyle = skin;
      ctx.beginPath();
      for (let i = 0; i < g.length; i += 8) {
        // Bare to the shoulder where the sleeve is torn off or absent.
        ctx.moveTo(g[i]!, g[i + 1]!); ctx.lineTo(g[i + 2]!, g[i + 3]!);
        if (!g[i + 6]) ctx.lineTo(g[i + 4]!, g[i + 5]!);
      }
      ctx.stroke();
      ctx.strokeStyle = cloth;
      ctx.beginPath();
      for (let i = 0; i < g.length; i += 8) {
        const f = g[i + 7]!;
        if (f <= 0) continue;
        ctx.moveTo(g[i]!, g[i + 1]!);
        ctx.lineTo(g[i]! + (g[i + 2]! - g[i]!) * f, g[i + 1]! + (g[i + 3]! - g[i + 1]!) * f);
      }
      ctx.stroke();
    }
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.16)';
    ctx.lineWidth = r * b.armW * 0.7;
    const o = r * b.armW * 0.6;
    ctx.beginPath();
    for (let i = 0; i < armsAll.length; i += 6) { ctx.moveTo(armsAll[i]! + LIGHT.x * o, armsAll[i + 1]! + LIGHT.y * o); ctx.lineTo(armsAll[i + 2]! + LIGHT.x * o, armsAll[i + 3]! + LIGHT.y * o); ctx.lineTo(armsAll[i + 4]! + LIGHT.x * o, armsAll[i + 5]! + LIGHT.y * o); }
    ctx.stroke();
  }
}

function drawBars(ctx: CanvasRenderingContext2D, zombies: readonly ZombieView[]) {
  for (const [, kind, x, y, hp] of zombies) {
    if (!ZOMBIE_LOOK[ZOMBIE_KINDS[kind]!].bar) continue;
    const r = ZOMBIES[ZOMBIE_KINDS[kind]!].radius, half = r - 2;
    const top = y - r - 15.5 - BUILD[ZOMBIE_KINDS[kind]!].lift * r * 0.5 - 4;
    ctx.fillStyle = 'rgba(28, 31, 38, 0.6)';
    ctx.beginPath();
    ctx.roundRect(x - half - 1.5, top, half * 2 + 3, 7, 3);
    ctx.fill();
    ctx.fillStyle = hp > 3 ? PALETTE.hpBad : '#ff9f43';
    ctx.beginPath();
    ctx.roundRect(x - half, top + 1.5, Math.max(4, half * 2 * (hp / 10)), 4, 2);
    ctx.fill();
  }
}

/** Sets a zombie's animation state directly, for the offline gallery and tests: heading, stride, speed and bite phase (null for none). */
export function debugPose(id: number, kind: ZombieKind, a: number, stride: number, speed: number, bitePhase: number | null) {
  anims.set(id, { x: 0, y: 0, a, stride, speed, at: 0, swingAt: bitePhase === null ? null : 0, phase: bitePhase ?? 0, target: null, kind });
}

const frac = (n: number) => n - Math.floor(n);
/**
 * A fallen zombie, for the corpse field: it topples along the blow that killed it (`age` ms since it fell), its head
 * popping off the shoulders and rolling to rest, arms flung, shoes splayed, the same torn toy kit as the living (a dead
 * tone, crossed-out eyes). A zombie that lacked an arm lies beside it.
 */
export function drawZombieRemains(ctx: CanvasRenderingContext2D, kind: ZombieKind, id: number, x: number, y: number, blow: number | null, age: number, pxPerUnit: number) {
  const r = ZOMBIES[kind].radius, b = BUILD[kind], v = variantOf(id);
  const rd = (k: number) => frac(Math.sin(id * 12.9898 + k * 78.233) * 43758.5453);
  const la = blow ?? rd(1) * TAU;
  const f = 1 - (1 - Math.min(1, Math.max(0, age) / 380)) ** 3;
  const c = Math.cos(la), s = Math.sin(la);
  const cx = x + c * r * 0.25 * f, cy = y + s * r * 0.25 * f - b.lift * r * (1 - f);
  const ink = Math.max(2, r * 0.09);
  ctx.lineCap = 'round';
  // Shoes splayed behind it, and the arms flung out to the sides.
  for (const side of [-1, 1] as const) {
    const fx = x - c * r * 0.95 - s * side * r * (0.35 + 0.2 * rd(2 + side)), fy = y - s * r * 0.95 + c * side * r * (0.35 + 0.2 * rd(2 + side));
    ctx.strokeStyle = INK; ctx.lineWidth = r * b.foot * 1.7 + ink * 2;
    ctx.beginPath(); ctx.moveTo(fx, fy); ctx.lineTo(fx - c * r * 0.1, fy - s * r * 0.1); ctx.stroke();
    ctx.strokeStyle = shadeHex(SHOES[side < 0 ? v.shoes[0] : v.shoes[1]]!, 0.8); ctx.lineWidth = r * b.foot * 1.7;
    ctx.stroke();
  }
  const arms: { x: number; y: number; stump: boolean; a: number }[] = [];
  ctx.strokeStyle = INK; ctx.lineWidth = r * b.armW * 2 + ink * 2;
  ctx.beginPath();
  for (const side of [-1, 1] as const) {
    const aa = la + side * (Math.PI / 2 + (rd(5 + side) - 0.3) * 0.9);
    const gone = v.gone === side;
    const len = r * b.armLen * (gone ? 0.4 : 0.95) * f;
    const sx = cx + Math.cos(la + side * Math.PI / 2) * r * b.shoulder * 0.8, sy = cy + Math.sin(la + side * Math.PI / 2) * r * b.shoulder * 0.8;
    ctx.moveTo(sx, sy); ctx.lineTo(sx + Math.cos(aa) * len, sy + Math.sin(aa) * len);
    arms.push({ x: sx + Math.cos(aa) * len, y: sy + Math.sin(aa) * len, stump: gone, a: aa });
  }
  ctx.stroke();
  ctx.strokeStyle = shadeHex(ZOMBIE_LOOK[kind].skins[v.skin]!, 0.7); ctx.lineWidth = r * b.armW * 2;
  ctx.stroke();
  const half = torsoHalf(kind), bucket = bucketOf(la);
  const body = torsoSprite(kind, v, bucket, 0, pxPerUnit, true);
  if (body) {
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate((1 - f) * 0.5 * (rd(3) < 0.5 ? -1 : 1));
    ctx.scale(1 + 0.08 * f + (kind === 'bloater' ? 0.1 * f : 0), 1 - (kind === 'bloater' ? 0.26 : 0.16) * f);
    ctx.drawImage(body, -half, -half, half * 2, half * 2);
    ctx.restore();
  }
  for (const h of arms) {
    const img = handSprite(kind, v, handBucketOf(h.a), h.stump, pxPerUnit, true);
    const hh = handHalf(kind);
    if (img) ctx.drawImage(img, h.x - hh, h.y - hh, hh * 2, hh * 2);
  }
  // The head: from the shoulders up and over to where it comes to rest, a little off the line of the body.
  const sx = x + (c * r * 0.4) * 0 + Math.cos(la) * b.neck * r, sy = y + Math.sin(la) * b.neck * r - b.headLift * r;
  const ex = x + c * r * (0.85 + 0.25 * rd(7)) - s * r * 0.3 * (rd(8) - 0.5), ey = y + s * r * (0.85 + 0.25 * rd(7)) + c * r * 0.3 * (rd(8) - 0.5) - r * 0.08;
  const hx = sx + (ex - sx) * f, hy = sy + (ey - sy) * f - Math.sin(f * Math.PI) * r * 0.35;
  const head = headSprite(kind, v, bucketOf(rd(9) * TAU), 1, pxPerUnit, true);
  const hs = headHalf(kind);
  if (head) ctx.drawImage(head, hx - hs, hy - hs, hs * 2, hs * 2);
  // A piece of kit knocked loose: a plate chip off a plated one, a bone shard off the Colossus.
  if ((kind === 'plated' || kind === 'colossus') && f > 0.5) {
    const px = x + Math.cos(la + 2.2) * r * 1.25, py = y + Math.sin(la + 2.2) * r * 1.25;
    ctx.lineCap = 'butt';
    ctx.strokeStyle = INK; ctx.lineWidth = r * 0.3 + ink * 2;
    ctx.beginPath(); ctx.moveTo(px - r * 0.12, py); ctx.lineTo(px + r * 0.12, py + r * 0.05); ctx.stroke();
    ctx.strokeStyle = kind === 'plated' ? '#4f5661' : '#d9cfb0'; ctx.lineWidth = r * 0.3;
    ctx.stroke();
    ctx.lineCap = 'round';
  }
}
