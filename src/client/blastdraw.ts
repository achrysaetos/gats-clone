import { GUNS, WORLD } from '../shared/defs.ts';
import type { BulletView } from '../shared/protocol.ts';
import {
  BLAST_MS, clamp01, DEBRIS, easeOut, fx, GHOST_MS, ghostPlayers, ghostsOf, SCORCH_MS, seeded, SLASH_MS, where, type BlastKind, type PKind, type Where,
} from './blastfx.ts';
import { lightingEnabled } from './lighting.ts';
import { INK } from './palette.ts';
import { LIGHT } from './tilt.ts';

export { drawBlastRing, drawGasCloud, drawThrownBody } from './grenadeart.ts';

const TAU = Math.PI * 2;
const R = WORLD.playerRadius;
export type View = { x0: number; y0: number; x1: number; y1: number };
const near = (v: View, x: number, y: number, m: number) => x > v.x0 - m && x < v.x1 + m && y > v.y0 - m && y < v.y1 + m;

// ---------------------------------------------------------------- colour

const hexOf = (c: string): [number, number, number] => [parseInt(c.slice(1, 3), 16), parseInt(c.slice(3, 5), 16), parseInt(c.slice(5, 7), 16)];
export function mixHex(a: string, b: string, t: number): string {
  const [ar, ag, ab] = hexOf(a), [br, bg, bb] = hexOf(b);
  const h = (v: number) => Math.round(v).toString(16).padStart(2, '0');
  return `#${h(ar + (br - ar) * t)}${h(ag + (bg - ag) * t)}${h(ab + (bb - ab) * t)}`;
}

/** The fire ramp from the art bible: white, #ffe08a, #ff9a3c, #d9541f, then smoke. */
export const FIRE_RAMP = ['#ffffff', '#ffe08a', '#ff9a3c', '#d9541f', '#5a5550'] as const;
const RAMP_STEPS = 3;
const RAMP: string[] = [];
for (let i = 0; i <= (FIRE_RAMP.length - 1) * RAMP_STEPS; i++) {
  const v = i / RAMP_STEPS, lo = Math.floor(v);
  RAMP.push(lo >= FIRE_RAMP.length - 1 ? FIRE_RAMP[FIRE_RAMP.length - 1]! : mixHex(FIRE_RAMP[lo]!, FIRE_RAMP[lo + 1]!, v - lo));
}
/** The flat colour of fire at heat `v` (0 white-hot to 4 smoke), stepped so a fireball paints in a few hard bands. */
export const rampAt = (v: number): string => RAMP[Math.max(0, Math.min(RAMP.length - 1, Math.round(v * RAMP_STEPS)))]!;

// ---------------------------------------------------------------- glow sprite (cached)

let glowSprite: HTMLCanvasElement | null = null;
const GLOW = 96;
function glow(): HTMLCanvasElement | null {
  if (glowSprite || typeof document === 'undefined') return glowSprite;
  const c = document.createElement('canvas');
  c.width = c.height = GLOW;
  const g = c.getContext('2d');
  if (!g) return null;
  const grad = g.createRadialGradient(GLOW / 2, GLOW / 2, 0, GLOW / 2, GLOW / 2, GLOW / 2);
  grad.addColorStop(0, 'rgba(255, 250, 225, 1)');
  grad.addColorStop(0.22, 'rgba(255, 224, 138, 0.7)');
  grad.addColorStop(0.55, 'rgba(255, 154, 60, 0.26)');
  grad.addColorStop(1, 'rgba(217, 84, 31, 0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, GLOW, GLOW);
  glowSprite = c;
  return c;
}

/** An additive warm pool from the cached glow sprite: a flash, or a blast's light on the floor. */
function pool(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, alpha: number) {
  const sprite = glow();
  if (!sprite || alpha <= 0.01) return;
  const prev = ctx.globalCompositeOperation;
  ctx.globalCompositeOperation = 'lighter';
  ctx.globalAlpha = Math.min(1, alpha);
  ctx.drawImage(sprite, x - r, y - r, r * 2, r * 2);
  ctx.globalCompositeOperation = prev;
  ctx.globalAlpha = 1;
}

/** A colour-batched fill of circles from a flat [x, y, r, ...] list: one path, one fill, a flat union rather than stacked alpha. */
function discs(ctx: CanvasRenderingContext2D, color: string, alpha: number, list: readonly number[], squash = 1) {
  const n = list.length;
  if (!n) return;
  ctx.globalAlpha = alpha;
  ctx.fillStyle = color;
  ctx.beginPath();
  for (let i = 0; i < n; i += 3) {
    const x = list[i]!, y = list[i + 1]!, r = list[i + 2]!;
    ctx.moveTo(x + r, y);
    if (squash === 1) ctx.arc(x, y, r, 0, TAU);
    else ctx.ellipse(x, y, r, r * squash, 0, 0, TAU);
  }
  ctx.fill();
}

// ---------------------------------------------------------------- scorch decals (floor level)

const SCORCH_LOOK = [
  { char: INK, ash: '#3a342e', rim: null },
  { char: '#3a2c1f', ash: '#6b5238', rim: '#8a6f4c' },
  { char: '#46502c', ash: '#6f7a4e', rim: null },
  { char: INK, ash: '#26231f', rim: '#5a2c18' },
] as const;
const lobes: number[] = [];
const one: number[] = [0, 0, 0];
const two: number[] = [0, 0, 0, 0, 0, 0];

export function drawScorches(ctx: CanvasRenderingContext2D, now: number, view: View) {
  for (const s of fx.scorches.slots) {
    const age = now - s.born;
    if (age < 0 || age >= SCORCH_MS || !near(view, s.x, s.y, s.r * 1.9)) continue;
    // It holds for 60% of its life, then fades.
    const fade = age < SCORCH_MS * 0.6 ? 1 : 1 - (age - SCORCH_MS * 0.6) / (SCORCH_MS * 0.4);
    const look = SCORCH_LOOK[s.tone] ?? SCORCH_LOOK[0];
    const rand = seeded(s.seed);
    lobes.length = 0;
    lobes.push(s.x, s.y, s.r * 0.78);
    for (let i = 0; i < 10; i++) {
      const a = rand() * TAU, d = s.r * (0.42 + rand() * 0.32);
      lobes.push(s.x + Math.cos(a) * d, s.y + Math.sin(a) * d * 0.9, s.r * (0.2 + rand() * 0.2));
    }
    // A churned-dirt rim (a mine) or a rust ring (a barrel) around the char.
    if (look.rim) { one[0] = s.x; one[1] = s.y; one[2] = s.r * 0.98; discs(ctx, look.rim, 0.28 * fade, one); }
    discs(ctx, look.char, 0.3 * fade, lobes);
    one[2] = s.r * 0.54;
    discs(ctx, '#0e1014', 0.28 * fade, one);
    two[0] = s.x; two[1] = s.y; two[2] = s.r * 0.34; two[3] = s.x + s.r * 0.08; two[4] = s.y - s.r * 0.05; two[5] = s.r * 0.22;
    discs(ctx, look.ash, 0.34 * fade, two);
    // Radial streaks thrown outward along the floor: tapered wedges and a few flecks, one flat shape.
    ctx.globalAlpha = 0.11 * fade;
    ctx.fillStyle = look.char;
    ctx.beginPath();
    const streaks = 10;
    for (let i = 0; i < streaks; i++) {
      const a = (i / streaks) * TAU + (rand() - 0.5) * 0.9, r0 = s.r * 0.6, r1 = s.r * (0.95 + rand() * rand() * 0.8), w = 0.08 + rand() * 0.09;
      ctx.moveTo(s.x + Math.cos(a - w) * r0, s.y + Math.sin(a - w) * r0 * 0.94);
      ctx.lineTo(s.x + Math.cos(a) * r1, s.y + Math.sin(a) * r1 * 0.94);
      ctx.lineTo(s.x + Math.cos(a + w) * r0, s.y + Math.sin(a + w) * r0 * 0.94);
      ctx.closePath();
      if (rand() < 0.6) {
        const d = r1 + 5 + rand() * 8, sx = s.x + Math.cos(a) * d, sy = s.y + Math.sin(a) * d * 0.94;
        ctx.moveTo(sx + 2.4, sy);
        ctx.arc(sx, sy, 2.4, 0, TAU);
      }
    }
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

// ---------------------------------------------------------------- live particles, gathered once a frame

type Bucket = { n: number; at: number[] };
const KINDS: PKind[] = ['spark', 'chip', 'stave', 'smoke', 'ember', 'dust', 'streak', 'cinder', 'ichor'];
const bucket = Object.fromEntries(KINDS.map((k) => [k, { n: 0, at: [] as number[] }])) as unknown as Record<PKind, Bucket>;
const MAXP = fx.particles.slots.length;
const PX = new Float32Array(MAXP), PY = new Float32Array(MAXP), PZ = new Float32Array(MAXP), PK = new Float32Array(MAXP);
const w1: Where = { x: 0, y: 0, z: 0, k: 0, grounded: false };

/** Each live, in-view particle's position, height and life share are worked out once and bucketed by kind. */
function gather(now: number, view: View) {
  for (const k of KINDS) bucket[k].n = 0;
  const slots = fx.particles.slots;
  for (let i = 0; i < slots.length; i++) {
    const p = slots[i]!;
    if (now < p.born || now - p.born >= p.life) continue;
    where(p, now, w1);
    const m = p.kind === 'smoke' || p.kind === 'dust' ? p.size * (1 + p.grow) + 20 : p.kind === 'streak' ? 100 : 40;
    if (!near(view, w1.x, w1.y - w1.z, m)) continue;
    PX[i] = w1.x; PY[i] = w1.y; PZ[i] = w1.z; PK[i] = w1.k;
    const b = bucket[p.kind];
    b.at[b.n++] = i;
  }
}

// ---------------------------------------------------------------- smoke and ground dust

type SmokeTone = { base: string; cap: string; shade: string };
const SMOKE_TONES: readonly SmokeTone[] = [
  { base: '#6c665f', cap: '#a39c91', shade: '#4a4540' },
  { base: '#9a8a6c', cap: '#cdbd9a', shade: '#6f634d' },
  { base: '#7f9440', cap: '#b6cc5a', shade: '#55662c' },
  { base: '#4a4642', cap: '#7a746b', shade: '#322f2c' },
];
const SBINS = 8;
const smokeAlpha = (k: number) => 0.5 * Math.min(1, k / 0.1) * (1 - (Math.max(0, k - 0.1) / 0.9) ** 1.4);
/** [tone][bin]: smoke is lit from inside while the fire is young, so its colours warm toward the fire ramp early on. */
const SMOKE_STEPS = SMOKE_TONES.map((t, tone) => Array.from({ length: SBINS }, (_, b) => {
  const k = (b + 0.5) / SBINS, warm = clamp01(1 - k / 0.32) * (tone === 2 ? 0.25 : 1);
  return { shade: mixHex(t.shade, '#8a3f1c', warm * 0.65), base: mixHex(t.base, '#b8683a', warm * 0.6), cap: mixHex(t.cap, '#ffc070', warm * 0.75), alpha: smokeAlpha(k) };
}));
const sh: number[][] = [], sb: number[][] = [], sc: number[][] = [];
for (let i = 0; i < SMOKE_TONES.length * SBINS; i++) { sh.push([]); sb.push([]); sc.push([]); }

function drawSmoke(ctx: CanvasRenderingContext2D) {
  for (let t = 0; t < sh.length; t++) { sh[t]!.length = 0; sb[t]!.length = 0; sc[t]!.length = 0; }
  const bk = bucket.smoke, slots = fx.particles.slots;
  if (!bk.n) return;
  for (let j = 0; j < bk.n; j++) {
    const i = bk.at[j]!, p = slots[i]!, k = PK[i]!;
    const r = p.size * (1 + p.grow * Math.sqrt(k)), x = PX[i]!, y = PY[i]!;
    const bin = Math.min(SBINS - 1, Math.floor(k * SBINS)), id = (p.tone % SMOKE_TONES.length) * SBINS + bin;
    // Three flat steps: a shade crescent away from the key light, the body, and a lit cap toward it.
    sh[id]!.push(x + LIGHT.x * r * 0.1, y + LIGHT.y * r * 0.1, r);
    sb[id]!.push(x - LIGHT.x * r * 0.03, y - LIGHT.y * r * 0.03, r * 0.86);
    sc[id]!.push(x - LIGHT.x * r * 0.26, y - LIGHT.y * r * 0.26, r * 0.5);
  }
  // Oldest bins first so fresh smoke stays on top of the old.
  for (let bin = SBINS - 1; bin >= 0; bin--) {
    for (let tone = 0; tone < SMOKE_TONES.length; tone++) {
      const id = tone * SBINS + bin, step = SMOKE_STEPS[tone]![bin]!;
      if (!sh[id]!.length) continue;
      discs(ctx, step.shade, step.alpha, sh[id]!);
      discs(ctx, step.base, step.alpha, sb[id]!);
      discs(ctx, step.cap, step.alpha * 0.9, sc[id]!);
    }
  }
}

const DUST = { base: '#b9ae94', cap: '#e9e2cd', shade: '#8f8570' };
/** The dust ring kicked outward along the floor: flattened puffs, three alpha bands as they thin out. */
function drawDust(ctx: CanvasRenderingContext2D) {
  const bk = bucket.dust, slots = fx.particles.slots;
  if (!bk.n) return;
  for (const [bin, alpha] of [[0, 0.5], [1, 0.34], [2, 0.18]] as const) {
    sh[0]!.length = 0; sb[0]!.length = 0; sc[0]!.length = 0;
    for (let j = 0; j < bk.n; j++) {
      const i = bk.at[j]!, p = slots[i]!, k = PK[i]!;
      if (Math.min(2, Math.floor(k * 3)) !== bin) continue;
      const r = p.size * (1 + p.grow * Math.sqrt(k)), x = PX[i]!, y = PY[i]!;
      sh[0]!.push(x + 1, y + 2, r);
      sb[0]!.push(x, y, r * 0.9);
      sc[0]!.push(x - LIGHT.x * r * 0.25, y - LIGHT.y * r * 0.2, r * 0.5);
    }
    discs(ctx, DUST.shade, alpha, sh[0]!, 0.62);
    discs(ctx, DUST.base, alpha, sb[0]!, 0.62);
    discs(ctx, DUST.cap, alpha, sc[0]!, 0.62);
  }
}

// ---------------------------------------------------------------- the fireball

const FIRE_SIZE: Record<BlastKind, number> = { pop: 0.7, grenade: 0.62, frag: 0.6, gas: 0, mine: 0.5, slug: 0.62, shell: 0.7, barrel: 0.66, propane: 0.66, bloater: 0.5 };
/** Four flat layers, hot core inside: base heat on the ramp, the share of the blast that layer burns for, and its offset toward the light. */
const LAYERS = [
  { s: 1, heat: 3, burn: 0.96, o: 0 },
  { s: 0.76, heat: 2, burn: 0.78, o: 0.12 },
  { s: 0.52, heat: 1, burn: 0.58, o: 0.2 },
  { s: 0.3, heat: 0, burn: 0.38, o: 0.26 },
] as const;
const LOBES = 7;
const la = new Float32Array(LOBES), ld = new Float32Array(LOBES), lr = new Float32Array(LOBES), lz = new Float32Array(LOBES);

/** The fireball: overlapping lumpy blobs in four flat layers that cool along the fire ramp, the outer shell going to smoke first, and the whole thing rolling upward. */
function drawFire(ctx: CanvasRenderingContext2D, now: number, view: View) {
  for (const b of fx.blasts.slots) {
    const age = now - b.born;
    if (age < 0 || age >= BLAST_MS || !near(view, b.x, b.y, b.r * 1.5)) continue;
    const k = age / BLAST_MS, rand = seeded(b.seed);
    // The floor pool: only where the lighting pass is not already lighting it.
    if (!b.pop && !lightingEnabled()) pool(ctx, b.x, b.y, b.r * 1.9, 0.5 * (1 - k) ** 1.5);
    const size = FIRE_SIZE[b.kind];
    if (size <= 0) continue;
    const maxR = b.r * size, grow = easeOut(clamp01(age / 170));
    for (let i = 0; i < LOBES; i++) { la[i] = rand() * TAU; ld[i] = 0.4 + rand() * 0.34; lr[i] = 0.42 + rand() * 0.2; lz[i] = 0.4 + rand() * 0.6; }
    const lift = easeOut(clamp01(age / 480)) * maxR * 0.3;
    const lobeCount = b.pop ? 4 : LOBES;
    for (const L of LAYERS) {
      const lk = clamp01(1 - k / L.burn);
      if (lk <= 0) continue;
      const rad = maxR * L.s * grow * (0.45 + 0.55 * Math.sqrt(lk));
      const ox = -LIGHT.x * rad * L.o, oy = -LIGHT.y * rad * L.o - lift * (0.6 + 0.4 * L.s);
      ctx.fillStyle = rampAt(L.heat + 2.1 * Math.pow(k, 1.25));
      ctx.globalAlpha = Math.min(1, lk * 2.4);
      ctx.beginPath();
      ctx.moveTo(b.x + ox + rad, b.y + oy);
      ctx.arc(b.x + ox, b.y + oy, rad, 0, TAU);
      for (let i = 0; i < lobeCount; i++) {
        // Billows drift out and up as the fire rolls.
        const spread = ld[i]! * rad * (1 + 0.35 * easeOut(clamp01(age / 300))), a = la[i]! + k * 0.9 * (i % 2 ? 1 : -1);
        const lx = b.x + ox + Math.cos(a) * spread, ly = b.y + oy + Math.sin(a) * spread * 0.86 - lz[i]! * lift * 0.5, rr = rad * lr[i]!;
        ctx.moveTo(lx + rr, ly);
        ctx.arc(lx, ly, rr, 0, TAU);
      }
      ctx.fill();
    }
  }
  ctx.globalAlpha = 1;
}

/** The white-hot flash (its first frames are enough to bloom) and the shock ring, over everything else of the blast. */
function drawFlash(ctx: CanvasRenderingContext2D, now: number, view: View) {
  for (const b of fx.blasts.slots) {
    const age = now - b.born;
    if (age < 0 || age >= 420 || !near(view, b.x, b.y, b.r * 1.5)) continue;
    const rand = seeded(b.seed ^ 0x51ed);
    const flashMs = b.calm ? 60 : 100;
    if (age < flashMs) {
      const f = 1 - age / flashMs, power = b.calm ? 0.5 : 1;
      const rad = b.r * (b.pop ? 0.62 : 0.58) * (0.7 + 0.5 * easeOut(1 - f));
      // Bloom-bright: a big additive glow, a hard white-hot disc, and a spiked star.
      pool(ctx, b.x, b.y, b.r * (b.pop ? 1.2 : 1.45), Math.min(1, f * 1.3) * 0.85 * power);
      ctx.globalAlpha = Math.min(1, f * 2.2) * power;
      ctx.fillStyle = b.kind === 'gas' || b.kind === 'bloater' ? '#f6fbd0' : '#fffbe6';
      ctx.beginPath();
      ctx.arc(b.x, b.y, rad * 0.8, 0, TAU);
      const spikes = b.pop ? 7 : 11;
      for (let i = 0; i < spikes * 2; i++) {
        const a = (i / (spikes * 2)) * TAU + (b.seed % 100) / 16, len = (i % 2 ? 0.34 : 0.7 + rand() * 0.55) * rad * 1.5 * (0.6 + 0.4 * easeOut(1 - f));
        const px = b.x + Math.cos(a) * len, py = b.y + Math.sin(a) * len;
        if (i) ctx.lineTo(px, py);
        else ctx.moveTo(px, py);
      }
      ctx.closePath();
      ctx.fill();
    }
    // The shock ring reaches the real blast radius: crisp white, a warm band behind it, and (big blasts) a fainter second wave.
    const rk = clamp01(age / 360);
    if (rk < 1) {
      const rr = b.r * (0.2 + 0.85 * easeOut(rk)), tint = b.kind === 'gas' ? '#b8d85a' : b.kind === 'bloater' ? '#c9d86a' : '#ffb44a';
      ctx.globalAlpha = (1 - rk) * (b.pop ? 0.35 : 0.5);
      ctx.strokeStyle = tint;
      ctx.lineWidth = (b.pop ? 9 : 16) * (1 - rk) + 2;
      ctx.beginPath();
      ctx.arc(b.x, b.y, rr * 0.94, 0, TAU);
      ctx.stroke();
      ctx.globalAlpha = (1 - rk) * 0.95;
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = (b.pop ? 3.5 : 6) * (1 - rk) + 1.2;
      ctx.beginPath();
      ctx.arc(b.x, b.y, rr, 0, TAU);
      ctx.stroke();
      if (!b.pop && rk > 0.12) {
        const r2 = b.r * 0.75 * easeOut(clamp01((age - 40) / 380));
        ctx.globalAlpha = (1 - rk) * 0.22;
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(b.x, b.y, r2, 0, TAU);
        ctx.stroke();
      }
    }
  }
  ctx.globalAlpha = 1;
}

// ---------------------------------------------------------------- debris, sparks, embers, cinders

const byTone: number[][] = [];
const shadowBuf: number[] = [];
/** Spin that eases to rest, as a tumbling chunk's does. */
const spinOf = (p: { rot: number; spin: number }, t: number) => p.rot + (p.spin * (1 - Math.exp(-3 * t))) / 3;
const shrink = (k: number) => 1 - clamp01((k - 0.78) / 0.22);

/** Debris chunks, staves and ichor blobs: ink-edged and tumbling, each with a contact shadow that stays on the floor while the chunk is up. */
function drawChunks(ctx: CanvasRenderingContext2D, now: number) {
  const slots = fx.particles.slots;
  while (byTone.length < DEBRIS.length) byTone.push([]);
  for (const t of byTone) t.length = 0;
  shadowBuf.length = 0;
  for (const kind of ['chip', 'stave', 'ichor'] as const) {
    const bk = bucket[kind];
    for (let j = 0; j < bk.n; j++) {
      const i = bk.at[j]!, p = slots[i]!;
      const sz = p.size * shrink(PK[i]!);
      if (sz < 0.4) continue;
      const z = PZ[i]!;
      shadowBuf.push(PX[i]! + LIGHT.x * z * 0.28, PY[i]! + LIGHT.y * z * 0.18 + 1, (kind === 'stave' ? sz * 0.42 : sz * 0.9) * (1 - Math.min(0.5, z / 220)));
      byTone[p.tone]!.push(i);
    }
  }
  discs(ctx, 'rgba(10, 12, 18, 0.42)', 1, shadowBuf, 0.7);
  ctx.strokeStyle = INK;
  ctx.lineJoin = 'round';
  for (let t = 0; t < byTone.length; t++) {
    const list = byTone[t]!;
    if (!list.length) continue;
    ctx.globalAlpha = 1;
    ctx.fillStyle = DEBRIS[t]!;
    ctx.lineWidth = 1.3;
    ctx.beginPath();
    let blobs = false;
    for (const i of list) {
      const p = slots[i]!, kind = p.kind;
      if (kind === 'ichor') { blobs = true; continue; }
      const sz = p.size * shrink(PK[i]!), x = PX[i]!, y = PY[i]! - PZ[i]!, a = spinOf(p, (now - p.born) / 1000);
      const c = Math.cos(a), s = Math.sin(a);
      const hl = kind === 'stave' ? sz * 0.5 : sz * 1.1, hw = kind === 'stave' ? Math.max(1.8, sz * 0.17) : sz * 0.75;
      ctx.moveTo(x + c * hl - s * hw, y + s * hl + c * hw);
      ctx.lineTo(x - c * hl - s * hw, y - s * hl + c * hw);
      ctx.lineTo(x - c * hl + s * hw, y - s * hl - c * hw);
      ctx.lineTo(x + c * hl + s * hw, y + s * hl - c * hw);
      ctx.closePath();
    }
    ctx.fill();
    ctx.stroke();
    if (blobs) {
      ctx.beginPath();
      for (const i of list) {
        const p = slots[i]!;
        if (p.kind !== 'ichor') continue;
        const sz = p.size * shrink(PK[i]!), x = PX[i]!, y = PY[i]! - PZ[i]!;
        ctx.moveTo(x + sz, y);
        ctx.arc(x, y, sz, 0, TAU);
      }
      ctx.fill();
      ctx.stroke();
    }
    // One lit cel step on the light-facing side of the bigger pieces.
    ctx.fillStyle = 'rgba(255, 255, 255, 0.26)';
    ctx.beginPath();
    let any = false;
    for (const i of list) {
      const p = slots[i]!;
      if (p.kind !== 'ichor') continue;
      const sz = p.size * shrink(PK[i]!), x = PX[i]! - LIGHT.x * sz * 0.4, y = PY[i]! - PZ[i]! - LIGHT.y * sz * 0.4;
      ctx.moveTo(x + sz * 0.3, y);
      ctx.arc(x, y, sz * 0.3, 0, TAU);
      any = true;
    }
    if (any) ctx.fill();
  }
  ctx.lineJoin = 'miter';
  ctx.globalAlpha = 1;
}

const CINDER = ['#ffb347', '#ff8a2a', '#d9541f', '#7a3a1e'] as const;
const EMBER = ['#ffd27a', '#ffb347', '#ff9a3c', '#d9541f'] as const;
const dotBuf: number[][] = [[], [], [], []];
const haloBuf: number[] = [];

/** Light things: cinders glowing down the ramp on the floor, floating embers, sparks with motion streaks, and the frag's shrapnel streaks. */
function drawLightBits(ctx: CanvasRenderingContext2D, now: number) {
  const slots = fx.particles.slots;
  for (const [kind, ramp] of [['cinder', CINDER], ['ember', EMBER]] as const) {
    const bk = bucket[kind];
    if (!bk.n) continue;
    for (const d of dotBuf) d.length = 0;
    for (let j = 0; j < bk.n; j++) {
      const i = bk.at[j]!, p = slots[i]!, k = PK[i]!;
      const flick = 0.7 + 0.3 * Math.sin(now / 55 + p.rot * 9), r = p.size * (1 - k * (kind === 'ember' ? 0.9 : 0.5)) * flick + 0.35;
      dotBuf[Math.min(3, Math.floor(k * 4))]!.push(PX[i]!, PY[i]! - PZ[i]! - (kind === 'ember' ? k * 6 : 0), r);
    }
    for (let b = 0; b < 4; b++) {
      const dots = dotBuf[b]!;
      if (!dots.length) continue;
      if (kind === 'cinder' && b < 3) {
        // The glow a hot cinder throws on the floor.
        haloBuf.length = 0;
        for (let q = 0; q < dots.length; q += 3) haloBuf.push(dots[q]!, dots[q + 1]!, dots[q + 2]! * 3.4);
        const prev = ctx.globalCompositeOperation;
        ctx.globalCompositeOperation = 'lighter';
        discs(ctx, '#ff7a2a', (0.16 * (3 - b)) / 3, haloBuf);
        ctx.globalCompositeOperation = prev;
      }
      discs(ctx, ramp[b]!, 0.95, dots);
    }
  }
  ctx.lineCap = 'round';
  const bkS = bucket.spark;
  for (let tone = 0; tone < 2 && bkS.n; tone++) {
    ctx.strokeStyle = tone ? '#ffd27a' : '#fff3c4';
    ctx.lineWidth = tone ? 2.6 : 1.8;
    ctx.globalAlpha = 1;
    ctx.beginPath();
    for (let j = 0; j < bkS.n; j++) {
      const i = bkS.at[j]!, p = slots[i]!;
      if (p.tone % 2 !== tone) continue;
      const k = PK[i]!, x = PX[i]!, y = PY[i]! - PZ[i]!;
      where(p, now - 34, w1);
      const dx = x - w1.x, dy = y - (w1.y - w1.z), len = Math.hypot(dx, dy) || 1, want = (3 + Math.min(24, len * 0.9)) * (1 - k * 0.6);
      ctx.moveTo(x, y);
      ctx.lineTo(x - (dx / len) * want, y - (dy / len) * want);
    }
    ctx.stroke();
  }
  const bkR = bucket.streak;
  if (bkR.n) {
    for (const [width, color, alpha] of [[5, '#ffb44a', 0.3], [2.2, '#fff3c4', 0.95]] as const) {
      ctx.strokeStyle = color;
      ctx.lineWidth = width;
      ctx.globalAlpha = alpha;
      ctx.beginPath();
      for (let j = 0; j < bkR.n; j++) {
        const i = bkR.at[j]!, p = slots[i]!, k = PK[i]!;
        const dx = Math.cos(p.rot), dy = Math.sin(p.rot), len = 14 + 70 * Math.min(1, k * 3.5) * (1 - k * 0.55), x = PX[i]!, y = PY[i]!;
        ctx.moveTo(x, y);
        ctx.lineTo(x - dx * len, y - dy * len);
      }
      ctx.stroke();
    }
  }
  ctx.globalAlpha = 1;
}

// ---------------------------------------------------------------- mortar shells

/** A mortar shell: it climbs on a high arc over the floor with a shadow that stays down, a thin smoke whistle behind, and a warning ring where it will land. */
function drawShells(ctx: CanvasRenderingContext2D, now: number, view: View) {
  for (const s of fx.shells.slots) {
    const t = (now - s.born) / 1000, d = s.speed * t;
    if (t < 0 || d >= s.reach) continue;
    const ex = s.x + Math.cos(s.angle) * s.reach, ey = s.y + Math.sin(s.angle) * s.reach;
    if (!near(view, s.x, s.y, 80) && !near(view, ex, ey, 80)) continue;
    const peak = Math.min(300, 80 + s.reach * 0.3), u = d / s.reach;
    const px = (uu: number) => s.x + Math.cos(s.angle) * s.reach * uu, py = (uu: number) => s.y + Math.sin(s.angle) * s.reach * uu;
    const zAt = (uu: number) => peak * 4 * uu * (1 - uu);
    const gx = px(u), gy = py(u), z = zAt(u);
    // The ring on the floor tightens as the shell drops.
    if (u > 0.5) {
      const warn = (u - 0.5) / 0.5, rr = 120 * (1 - 0.55 * warn);
      ctx.globalAlpha = 0.25 + 0.45 * warn;
      ctx.strokeStyle = '#e5484d';
      ctx.lineWidth = 2.5;
      ctx.setLineDash([10, 8]);
      ctx.lineDashOffset = -now / 40;
      ctx.beginPath();
      ctx.arc(ex, ey, rr, 0, TAU);
      ctx.stroke();
      ctx.setLineDash([]);
    }
    // Shadow on the floor, darker as it nears.
    ctx.globalAlpha = 0.18 + 0.14 * u;
    ctx.fillStyle = INK;
    ctx.beginPath();
    ctx.ellipse(gx + z * 0.12, gy + 2, 7 - Math.min(3, z / 90), 4, 0, 0, TAU);
    ctx.fill();
    // Whistle trail: puffs left along the arc, thinning behind.
    ctx.fillStyle = '#d9d2bf';
    for (let i = 1; i <= 7; i++) {
      const uu = u - i * 0.018;
      if (uu <= 0) break;
      ctx.globalAlpha = 0.5 * (1 - i / 8);
      ctx.beginPath();
      ctx.arc(px(uu), py(uu) - zAt(uu), 3.4 - i * 0.28, 0, TAU);
      ctx.fill();
    }
    // The shell, tilted along its flight, ink-edged.
    const u0 = Math.max(0, u - 0.01), a = Math.atan2(gy - z - (py(u0) - zAt(u0)), gx - px(u0));
    ctx.save();
    ctx.translate(gx, gy - z);
    ctx.rotate(a);
    ctx.globalAlpha = 1;
    ctx.fillStyle = '#4a3f35';
    ctx.strokeStyle = INK;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.roundRect(-7, -3.6, 14, 7.2, 3.4);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#8a6f4c';
    ctx.fillRect(-1.5, -3.6, 4, 7.2);
    ctx.fillStyle = 'rgba(255, 255, 255, 0.25)';
    ctx.fillRect(-5, -2.6, 8, 1.6);
    ctx.restore();
  }
  ctx.globalAlpha = 1;
}

// ---------------------------------------------------------------- explosive rounds in flight

const TRAIL_PUFFS = 6;
/** An exploding round (Boom Slug, Grenadier, Artillery) trails a thin smoke tail and a few falling embers; the round itself is render.ts's lit slug. */
export function drawExplosiveRounds(ctx: CanvasRenderingContext2D, bullets: readonly BulletView[], now: number) {
  let any = false;
  for (const b of bullets) {
    const blast = b.gun ? GUNS[b.gun].blast : undefined;
    if (!blast) continue;
    const sp = Math.hypot(b.vx, b.vy) || 1, ux = b.vx / sp, uy = b.vy / sp, size = 2.4 + blast.radius / 32;
    for (let i = 0; i < TRAIL_PUFFS; i++) {
      const d = 9 + i * (7 + size * 1.1), wob = Math.sin(now / 80 + i * 1.7 + b.id) * 1.6, r = size * (0.5 + 0.13 * i);
      const x = b.x - ux * d - uy * wob, y = b.y - uy * d + ux * wob - i * 0.8, fade = 1 - i / (TRAIL_PUFFS + 1);
      // Each puff has its own alpha, so they are drawn one by one (six per round at most): shade, body, lit cap.
      one[0] = x + LIGHT.x * r * 0.1; one[1] = y + LIGHT.y * r * 0.1; one[2] = r;
      discs(ctx, '#4a4540', 0.34 * fade, one);
      one[0] = x; one[1] = y; one[2] = r * 0.84;
      discs(ctx, '#6c665f', 0.34 * fade, one);
      one[0] = x - LIGHT.x * r * 0.28; one[1] = y - LIGHT.y * r * 0.28; one[2] = r * 0.48;
      discs(ctx, '#a39c91', 0.3 * fade, one);
    }
    // Embers shaken off the tail and falling behind it.
    ctx.fillStyle = '#ffb347';
    ctx.globalAlpha = 0.9;
    ctx.beginPath();
    for (let i = 0; i < 3; i++) {
      const ph = (now / 220 + i / 3 + b.id * 0.37) % 1, d = 6 + ph * 34, off = (i - 1) * 3.2 * ph;
      ctx.moveTo(b.x - ux * d - uy * off + 1.6 * (1 - ph), b.y - uy * d + ux * off + ph * ph * 6);
      ctx.arc(b.x - ux * d - uy * off, b.y - uy * d + ux * off + ph * ph * 6, 1.6 * (1 - ph) + 0.4, 0, TAU);
    }
    ctx.fill();
    any = true;
  }
  if (any) ctx.globalAlpha = 1;
}

// ---------------------------------------------------------------- knife slashes

/** A knife slash: a tapered white crescent that sweeps through its arc, an ink shadow under it, and a few flung flecks. */
function drawSlashes(ctx: CanvasRenderingContext2D, now: number, view: View) {
  const reach = R + 34;
  for (const s of fx.slashes.slots) {
    const age = now - s.born;
    if (age < 0 || age >= SLASH_MS || !near(view, s.x, s.y, reach + 30)) continue;
    const k = age / SLASH_MS, head = easeOut(clamp01(k / 0.45)), tail = clamp01((k - 0.3) / 0.7);
    const half = 1.15, a0 = s.angle - half + 2 * half * tail * 0.85, a1 = s.angle - half + 2 * half * head;
    if (a1 - a0 < 0.02) continue;
    const steps = 14, width = 17 * (1 - k * 0.6);
    for (const [dx, dy, color, alpha] of [[LIGHT.x * 3, LIGHT.y * 3, INK, 0.4], [0, 0, '#ffffff', 1]] as const) {
      ctx.globalAlpha = alpha * (1 - k * k);
      ctx.fillStyle = color;
      ctx.beginPath();
      for (let i = 0; i <= steps; i++) {
        const a = a0 + ((a1 - a0) * i) / steps, w = Math.sin((i / steps) * Math.PI) ** 0.7 * width;
        const rr = reach + w * 0.5;
        ctx.lineTo(s.x + dx + Math.cos(a) * rr, s.y + dy + Math.sin(a) * rr);
      }
      for (let i = steps; i >= 0; i--) {
        const a = a0 + ((a1 - a0) * i) / steps, w = Math.sin((i / steps) * Math.PI) ** 0.7 * width;
        const rr = reach - w * 0.5;
        ctx.lineTo(s.x + dx + Math.cos(a) * rr, s.y + dy + Math.sin(a) * rr);
      }
      ctx.closePath();
      ctx.fill();
    }
    // Speed flecks trailing the blade tip.
    ctx.globalAlpha = (1 - k) * 0.9;
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1.6;
    ctx.lineCap = 'round';
    ctx.beginPath();
    for (let i = 0; i < 3; i++) {
      const a = a1 - 0.12 - i * 0.2, rr = reach + (i - 1) * 9;
      ctx.moveTo(s.x + Math.cos(a) * rr, s.y + Math.sin(a) * rr);
      ctx.lineTo(s.x + Math.cos(a - 0.16) * (rr + 4), s.y + Math.sin(a - 0.16) * (rr + 4));
    }
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
}

/** Every live blast, in layers: dust and smoke, the fireball, debris and cinders, sparks, then the flash and ring on top. */
export function drawBlastFx(ctx: CanvasRenderingContext2D, now: number, view: View) {
  gather(now, view);
  drawDust(ctx);
  drawSmoke(ctx);
  drawFire(ctx, now, view);
  drawChunks(ctx, now);
  drawLightBits(ctx, now);
  drawFlash(ctx, now, view);
  drawShells(ctx, now, view);
  drawSlashes(ctx, now, view);
  ctx.globalAlpha = 1;
}

/** Dash: a ghost of the body at each recent position plus speed streaks, under the players themselves. */
export function drawDashTrails(ctx: CanvasRenderingContext2D, colorOf: (id: number) => string | null, now: number, view: View) {
  for (const id of ghostPlayers()) {
    const list = ghostsOf(id), color = colorOf(id);
    if (!color || !list.length || !near(view, list[list.length - 1]!.x, list[list.length - 1]!.y, 200)) continue;
    ctx.lineCap = 'round';
    for (let i = 0; i < list.length; i++) {
      const g = list[i]!, f = 1 - (now - g.t) / GHOST_MS;
      if (f <= 0) continue;
      ctx.globalAlpha = f * 0.38;
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(g.x, g.y, R * (0.55 + 0.45 * f), 0, TAU);
      ctx.fill();
      const next = list[i + 1];
      if (next) {
        ctx.globalAlpha = f * 0.55;
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = R * 0.5 * f;
        ctx.beginPath();
        ctx.moveTo(g.x, g.y);
        ctx.lineTo(next.x, next.y);
        ctx.stroke();
      }
    }
  }
  ctx.globalAlpha = 1;
}
