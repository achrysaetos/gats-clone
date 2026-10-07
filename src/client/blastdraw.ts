import { WORLD } from '../shared/defs.ts';
import type { ThrownView } from '../shared/protocol.ts';
import { at, BLAST_MS, clamp01, easeOut, fx, GHOST_MS, ghostPlayers, ghostsOf, SCORCH_MS, seeded, SLASH_MS, type Particle } from './blastfx.ts';
import { INK, PALETTE } from './palette.ts';
import { LIGHT } from './tilt.ts';

const TAU = Math.PI * 2;
const R = WORLD.playerRadius;
export type View = { x0: number; y0: number; x1: number; y1: number };
const near = (v: View, x: number, y: number, m: number) => x > v.x0 - m && x < v.x1 + m && y > v.y0 - m && y < v.y1 + m;

/** A colour-batched fill of circles: one path, one fill, a flat union rather than stacked alpha. */
function discs(ctx: CanvasRenderingContext2D, color: string, alpha: number, list: readonly (readonly [number, number, number])[]) {
  if (!list.length) return;
  ctx.globalAlpha = alpha;
  ctx.fillStyle = color;
  ctx.beginPath();
  for (const [x, y, r] of list) {
    ctx.moveTo(x + r, y);
    ctx.arc(x, y, r, 0, TAU);
  }
  ctx.fill();
}

// ---------------------------------------------------------------- scorch decals (floor level)

export function drawScorches(ctx: CanvasRenderingContext2D, now: number, view: View) {
  for (const s of fx.scorches.slots) {
    const age = now - s.born;
    if (age < 0 || age >= SCORCH_MS || !near(view, s.x, s.y, s.r * 1.5)) continue;
    const fade = age < SCORCH_MS * 0.6 ? 1 : 1 - (age - SCORCH_MS * 0.6) / (SCORCH_MS * 0.4);
    const rand = seeded(s.seed);
    const lobes: [number, number, number][] = [[s.x, s.y, s.r * 0.78]];
    const ash: [number, number, number][] = [[s.x, s.y, s.r * 0.36]];
    for (let i = 0; i < 9; i++) {
      const a = rand() * TAU, d = s.r * (0.45 + rand() * 0.3);
      lobes.push([s.x + Math.cos(a) * d, s.y + Math.sin(a) * d, s.r * (0.22 + rand() * 0.2)]);
    }
    discs(ctx, INK, 0.2 * fade, lobes);
    discs(ctx, '#0e1014', 0.2 * fade, lobes.slice(0, 1).map(([x, y, r]) => [x, y, r * 0.7] as const));
    discs(ctx, '#3a342e', 0.35 * fade, ash);
    // Blast streaks thrown outward along the floor.
    ctx.globalAlpha = 0.14 * fade;
    ctx.strokeStyle = INK;
    ctx.lineCap = 'round';
    ctx.lineWidth = 3;
    ctx.beginPath();
    for (let i = 0; i < 11; i++) {
      const a = rand() * TAU, r0 = s.r * 0.7, r1 = s.r * (1 + rand() * 0.5);
      ctx.moveTo(s.x + Math.cos(a) * r0, s.y + Math.sin(a) * r0);
      ctx.lineTo(s.x + Math.cos(a) * r1, s.y + Math.sin(a) * r1);
    }
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
}

// ---------------------------------------------------------------- explosions (over the field)

const SMOKE_TONES = [
  { base: '#6c665f', cap: '#a39c91' },
  { base: '#9a8a6c', cap: '#cdbd9a' },
] as const;

function drawSmoke(ctx: CanvasRenderingContext2D, now: number, view: View) {
  const BANDS = 5;
  const bins: Particle[][][] = SMOKE_TONES.map(() => Array.from({ length: BANDS }, () => []));
  const pos = new WeakMap<Particle, [number, number, number]>();
  for (const p of fx.particles.slots) {
    if (p.kind !== 'smoke' || now < p.born || now - p.born >= p.life) continue;
    const q = at(p, now);
    if (!near(view, q.x, q.y, 60)) continue;
    pos.set(p, [q.x, q.y, p.size * (1 + p.grow * Math.sqrt(q.k))]);
    const alpha = (q.k < 0.12 ? q.k / 0.12 : 1 - (q.k - 0.12) / 0.88) * 0.62;
    bins[p.tone % SMOKE_TONES.length]![Math.min(BANDS - 1, Math.floor(clamp01(alpha / 0.62) * BANDS))]!.push(p);
  }
  for (let tone = 0; tone < SMOKE_TONES.length; tone++) {
    for (let b = 0; b < BANDS; b++) {
      const list = bins[tone]![b]!;
      if (!list.length) continue;
      const alpha = ((b + 0.5) / BANDS) * 0.62;
      const base = list.map((p) => pos.get(p)!);
      discs(ctx, SMOKE_TONES[tone]!.base, alpha, base);
      // Second cel step: a lighter cap offset toward where the light comes from.
      discs(ctx, SMOKE_TONES[tone]!.cap, alpha, base.map(([x, y, r]) => [x - LIGHT.x * r * 0.3, y - LIGHT.y * r * 0.3, r * 0.66] as const));
    }
  }
}

function drawFire(ctx: CanvasRenderingContext2D, now: number, view: View) {
  for (const b of fx.blasts.slots) {
    const age = now - b.born;
    if (age < 0 || age >= BLAST_MS || !near(view, b.x, b.y, b.r * 1.4)) continue;
    const k = age / BLAST_MS, rand = seeded(b.seed);
    const maxR = b.r * (b.pop ? 0.7 : 0.66);
    // Ground glow.
    if (!b.pop) {
      const g = ctx.createRadialGradient(b.x, b.y, 0, b.x, b.y, b.r * 1.35);
      g.addColorStop(0, 'rgba(255, 190, 90, 0.34)');
      g.addColorStop(1, 'rgba(255, 120, 40, 0)');
      ctx.globalAlpha = 1 - k;
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(b.x, b.y, b.r * 1.35, 0, TAU);
      ctx.fill();
    }
    // Lumpy fireball in four flat layers that burn down from the core outward.
    const grow = easeOut(clamp01(age / 200));
    const lobeAng = Array.from({ length: 7 }, () => rand() * TAU), lobeRad = Array.from({ length: 7 }, () => 0.5 + rand() * 0.25);
    const layers = [
      { c: '#c93f16', s: 1, burn: 0.9, o: 0 },
      { c: '#ff7f24', s: 0.78, burn: 0.7, o: 0.12 },
      { c: '#ffc83f', s: 0.54, burn: 0.5, o: 0.2 },
      { c: '#fff4c2', s: 0.3, burn: 0.3, o: 0.26 },
    ];
    for (const L of layers) {
      const lk = clamp01(1 - k / L.burn);
      if (lk <= 0) continue;
      const rad = maxR * L.s * grow * (0.4 + 0.6 * Math.sqrt(lk));
      const ox = -LIGHT.x * rad * L.o, oy = -LIGHT.y * rad * L.o;
      const blob = (grow: number) => {
        ctx.beginPath();
        ctx.moveTo(b.x + ox + rad + grow, b.y + oy);
        ctx.arc(b.x + ox, b.y + oy, rad + grow, 0, TAU);
        for (let i = 0; i < 7; i++) {
          const lx = b.x + ox + Math.cos(lobeAng[i]! + k) * rad * lobeRad[i]!, ly = b.y + oy + Math.sin(lobeAng[i]! + k) * rad * lobeRad[i]!;
          ctx.moveTo(lx + rad * 0.5 + grow, ly);
          ctx.arc(lx, ly, rad * 0.5 + grow, 0, TAU);
        }
        ctx.fill();
      };
      if (L.s === 1) {
        // The ink outline is the same union grown a few px underneath, so interior lobes never show a seam.
        ctx.globalAlpha = lk * 0.7;
        ctx.fillStyle = INK;
        blob(3);
      }
      ctx.globalAlpha = Math.min(1, lk * 2.2);
      ctx.fillStyle = L.c;
      blob(0);
    }
    // White-hot flash with spikes in the first instants.
    if (age < 110) {
      const f = 1 - age / 110;
      ctx.globalAlpha = Math.min(1, f * 1.6);
      ctx.fillStyle = '#fffbe6';
      ctx.beginPath();
      const spikes = b.pop ? 6 : 9;
      for (let i = 0; i < spikes * 2; i++) {
        const a = (i / (spikes * 2)) * TAU + b.seed, len = (i % 2 ? 0.28 : 0.5 + rand() * 0.45) * b.r * (0.5 + 0.5 * easeOut(1 - f));
        const px = b.x + Math.cos(a) * len, py = b.y + Math.sin(a) * len;
        if (i) ctx.lineTo(px, py);
        else ctx.moveTo(px, py);
      }
      ctx.closePath();
      ctx.fill();
    }
    // Shock ring.
    const rk = clamp01(age / 340);
    if (rk < 1) {
      const rr = b.r * (0.2 + 0.85 * easeOut(rk));
      ctx.globalAlpha = (1 - rk) * 0.5;
      ctx.strokeStyle = '#ffb44a';
      ctx.lineWidth = 16 * (1 - rk) + 2;
      ctx.beginPath();
      ctx.arc(b.x, b.y, rr * 0.94, 0, TAU);
      ctx.stroke();
      ctx.globalAlpha = (1 - rk) * 0.95;
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 6 * (1 - rk) + 1.2;
      ctx.beginPath();
      ctx.arc(b.x, b.y, rr, 0, TAU);
      ctx.stroke();
    }
  }
}

const CHIP_TONES = ['#2f2c28', '#5a5249', '#8a5a30'];

function drawDebris(ctx: CanvasRenderingContext2D, now: number, view: View) {
  const chips: Particle[][] = CHIP_TONES.map(() => []);
  const sparks: Particle[][] = [[], []];
  const embers: Particle[] = [];
  for (const p of fx.particles.slots) {
    if (now < p.born || now - p.born >= p.life || p.kind === 'smoke') continue;
    if (p.kind === 'chip') chips[p.tone % CHIP_TONES.length]!.push(p);
    else if (p.kind === 'spark') sparks[p.tone % 2]!.push(p);
    else embers.push(p);
  }
  for (let t = 0; t < CHIP_TONES.length; t++) {
    if (!chips[t]!.length) continue;
    ctx.globalAlpha = 1;
    ctx.fillStyle = CHIP_TONES[t]!;
    ctx.strokeStyle = INK;
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    for (const p of chips[t]!) {
      const q = at(p, now);
      if (!near(view, q.x, q.y, 20)) continue;
      const s = p.size * (1 - q.k * 0.5), a = p.rot + p.spin * (now - p.born) / 1000;
      const c = Math.cos(a) * s, d = Math.sin(a) * s;
      ctx.moveTo(q.x + c, q.y + d);
      ctx.lineTo(q.x - d, q.y + c);
      ctx.lineTo(q.x - c, q.y - d);
      ctx.lineTo(q.x + d, q.y - c);
      ctx.closePath();
    }
    ctx.fill();
    ctx.stroke();
  }
  ctx.lineCap = 'round';
  for (let t = 0; t < 2; t++) {
    if (!sparks[t]!.length) continue;
    ctx.strokeStyle = t ? '#ffb347' : '#fff3c4';
    ctx.lineWidth = t ? 2.6 : 1.8;
    ctx.globalAlpha = 1;
    ctx.beginPath();
    for (const p of sparks[t]!) {
      const q = at(p, now);
      if (!near(view, q.x, q.y, 30)) continue;
      const sp = Math.hypot(p.vx, p.vy) || 1, speed = sp * Math.exp(-p.drag * (now - p.born) / 1000);
      const len = Math.min(26, speed * 0.045) * (1 - q.k * 0.6) + 2;
      ctx.moveTo(q.x, q.y);
      ctx.lineTo(q.x - (p.vx / sp) * len, q.y - (p.vy / sp) * len);
    }
    ctx.stroke();
  }
  if (embers.length) {
    ctx.fillStyle = '#ff9a3a';
    ctx.globalAlpha = 0.9;
    ctx.beginPath();
    for (const p of embers) {
      const q = at(p, now);
      if (!near(view, q.x, q.y, 20)) continue;
      const flick = 0.6 + 0.4 * Math.sin(now / 45 + p.rot * 9);
      const r = p.size * (1 - q.k) * flick + 0.3;
      ctx.moveTo(q.x + r, q.y - q.k * 14);
      ctx.arc(q.x, q.y - q.k * 14, r, 0, TAU);
    }
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

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

export function drawBlastFx(ctx: CanvasRenderingContext2D, now: number, view: View) {
  drawSmoke(ctx, now, view);
  drawFire(ctx, now, view);
  drawDebris(ctx, now, view);
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

// ---------------------------------------------------------------- thrown things

const shadow = (ctx: CanvasRenderingContext2D, x: number, y: number, r: number) => {
  ctx.fillStyle = PALETTE.contact;
  ctx.beginPath();
  ctx.ellipse(x + LIGHT.x * r * 0.5, y + LIGHT.y * r * 0.6, r * 1.05, r * 0.95, 0, 0, TAU);
  ctx.fill();
};

/** A solid disc in the kit's style: ink outline, base colour, and a lighter cel step on the light-facing side. */
function solidDisc(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, base: string, lit: string) {
  ctx.fillStyle = base;
  ctx.strokeStyle = INK;
  ctx.lineWidth = 2.2;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, TAU);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = lit;
  ctx.beginPath();
  ctx.arc(x - LIGHT.x * r * 0.18, y - LIGHT.y * r * 0.18, r * 0.72, Math.atan2(-LIGHT.y, -LIGHT.x) - 1.5, Math.atan2(-LIGHT.y, -LIGHT.x) + 1.5);
  ctx.closePath();
  ctx.fill();
}

const GRENADE_LOOK = {
  grenade: { base: '#4b5a3a', lit: '#66784c', band: '#c7c9cc' },
  fragGrenade: { base: '#55503a', lit: '#736c4c', band: '#e07a22' },
  gasGrenade: { base: '#4b5a3a', lit: '#66784c', band: '#c7d84a' },
} as const;

export function drawThrownBody(ctx: CanvasRenderingContext2D, t: ThrownView, now: number) {
  if (t.kind === 'landMine') return drawMine(ctx, t, now);
  if (t.kind === 'gasCloud') return;
  const look = GRENADE_LOOK[t.kind];
  const spin = now / 140 + t.id * 1.7;
  shadow(ctx, t.x, t.y, 11);
  // Spoon and pin ring tumble around the body.
  ctx.save();
  ctx.translate(t.x, t.y);
  ctx.rotate(spin);
  ctx.fillStyle = '#9aa0a8';
  ctx.strokeStyle = INK;
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  ctx.roundRect(2, -13, 14, 5, 2.5);
  ctx.fill();
  ctx.stroke();
  ctx.restore();
  solidDisc(ctx, t.x, t.y, 11, look.base, look.lit);
  if (t.kind === 'fragGrenade') {
    ctx.strokeStyle = INK;
    ctx.globalAlpha = 0.55;
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    for (const d of [-5, 0, 5]) {
      ctx.moveTo(t.x + d, t.y - 9);
      ctx.lineTo(t.x + d, t.y + 9);
      ctx.moveTo(t.x - 9, t.y + d);
      ctx.lineTo(t.x + 9, t.y + d);
    }
    ctx.stroke();
    ctx.globalAlpha = 1;
  }
  ctx.save();
  ctx.translate(t.x, t.y);
  ctx.rotate(spin);
  ctx.fillStyle = look.band;
  ctx.fillRect(-10.5, -2.2, 21, 4.4);
  ctx.strokeStyle = INK;
  ctx.lineWidth = 1.2;
  ctx.strokeRect(-10.5, -2.2, 21, 4.4);
  ctx.restore();
  // Fuse spark that blinks faster as the thing flies.
  const hot = Math.sin(now / 55 + t.id) > 0;
  ctx.fillStyle = hot ? '#fff1b0' : '#ff9a3a';
  ctx.beginPath();
  ctx.arc(t.x + Math.cos(spin + 0.5) * 6, t.y + Math.sin(spin + 0.5) * 6, hot ? 2.4 : 1.6, 0, TAU);
  ctx.fill();
  if (t.kind === 'gasGrenade') {
    ctx.fillStyle = '#b6d655';
    for (let i = 0; i < 3; i++) {
      const p = ((now / 600) + i / 3) % 1;
      ctx.globalAlpha = (1 - p) * 0.6;
      ctx.beginPath();
      ctx.arc(t.x - 12 * p - 4, t.y - 14 * p, 2 + p * 4, 0, TAU);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }
}

function drawMine(ctx: CanvasRenderingContext2D, t: ThrownView, now: number) {
  shadow(ctx, t.x, t.y, 14);
  solidDisc(ctx, t.x, t.y, 13, '#3b4048', '#585f6a');
  ctx.fillStyle = '#80868f';
  ctx.strokeStyle = INK;
  ctx.lineWidth = 1.2;
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * TAU + Math.PI / 4;
    ctx.beginPath();
    ctx.arc(t.x + Math.cos(a) * 9.5, t.y + Math.sin(a) * 9.5, 1.6, 0, TAU);
    ctx.fill();
  }
  ctx.fillStyle = '#23272e';
  ctx.beginPath();
  ctx.arc(t.x, t.y, 6, 0, TAU);
  ctx.fill();
  ctx.stroke();
  // A short bright blink once a second, with a halo that swells with it.
  const phase = (now % 1000) / 1000, on = phase < 0.18, glow = on ? 1 - phase / 0.18 : 0;
  if (glow > 0) {
    const g = ctx.createRadialGradient(t.x, t.y, 0, t.x, t.y, 22);
    g.addColorStop(0, 'rgba(255, 77, 79, 0.55)');
    g.addColorStop(1, 'rgba(255, 77, 79, 0)');
    ctx.globalAlpha = glow;
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(t.x, t.y, 22, 0, TAU);
    ctx.fill();
    ctx.globalAlpha = 1;
  }
  ctx.fillStyle = on ? '#ff6b6d' : '#6f2022';
  ctx.beginPath();
  ctx.arc(t.x, t.y, 3.2, 0, TAU);
  ctx.fill();
  if (on) {
    ctx.fillStyle = '#fff0f0';
    ctx.beginPath();
    ctx.arc(t.x - 0.8, t.y - 0.8, 1.2, 0, TAU);
    ctx.fill();
  }
}

/** The danger radius of a live grenade: a quiet ink-and-red dashed ring with tick marks, so it reads without shouting. */
export function drawBlastRing(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, now: number) {
  const pulse = 0.5 + 0.5 * Math.sin(now / 110);
  ctx.beginPath();
  ctx.arc(x, y, r, 0, TAU);
  ctx.fillStyle = `rgba(229, 72, 77, ${(0.05 + 0.05 * pulse).toFixed(3)})`;
  ctx.fill();
  ctx.setLineDash([16, 12]);
  ctx.lineDashOffset = -now / 50;
  ctx.lineWidth = 3;
  ctx.strokeStyle = `rgba(229, 72, 77, ${(0.5 + 0.35 * pulse).toFixed(3)})`;
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.beginPath();
  ctx.arc(x, y, r * (0.35 + 0.65 * ((now / 700) % 1)), 0, TAU);
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = `rgba(229, 72, 77, ${(0.3 * (1 - ((now / 700) % 1))).toFixed(3)})`;
  ctx.stroke();
}

const PUFFS = 16;

/** A toxic cloud: two flat unions of drifting puffs (dark body, lighter lit caps), rising bubbles and a wobbling rim. */
export function drawGasCloud(ctx: CanvasRenderingContext2D, t: ThrownView, now: number) {
  const body: [number, number, number][] = [[t.x, t.y, t.r * 0.72]], cap: [number, number, number][] = [];
  const rand = seeded(t.id * 7919 + 13);
  for (let i = 0; i < PUFFS; i++) {
    const a0 = rand() * TAU, d0 = 0.25 + rand() * 0.6, size = 0.2 + rand() * 0.18, sp = (rand() - 0.5) * 0.0006, ph = rand() * TAU;
    const a = a0 + now * sp;
    const d = t.r * d0 * (0.9 + 0.1 * Math.sin(now / 900 + ph));
    const r = t.r * size * (1 + 0.14 * Math.sin(now / 600 + ph * 2));
    const x = t.x + Math.cos(a) * d, y = t.y + Math.sin(a) * d;
    body.push([x, y, r]);
    cap.push([x - LIGHT.x * r * 0.28, y - LIGHT.y * r * 0.28, r * 0.62]);
  }
  discs(ctx, '#6f9a2c', 0.3, body);
  discs(ctx, '#c1d84a', 0.22, cap);
  // Bubbles rising out of the cloud.
  ctx.strokeStyle = '#e4f08a';
  ctx.lineWidth = 1.4;
  ctx.globalAlpha = 0.55;
  ctx.beginPath();
  for (let i = 0; i < 7; i++) {
    const p = (now / 1800 + rand()) % 1, a = rand() * TAU, d = rand() * t.r * 0.7;
    const bx = t.x + Math.cos(a) * d + Math.sin(now / 400 + i) * 3, by = t.y + Math.sin(a) * d - p * 26, br = 2 + rand() * 3.2;
    ctx.moveTo(bx + br, by);
    ctx.arc(bx, by, br * (1 - p * 0.4), 0, TAU);
  }
  ctx.stroke();
  // Wobbling rim.
  ctx.globalAlpha = 0.7;
  ctx.strokeStyle = PALETTE.gasEdge;
  ctx.lineWidth = 3;
  ctx.setLineDash([22, 12]);
  ctx.lineDashOffset = -now / 70;
  ctx.beginPath();
  for (let i = 0; i <= 48; i++) {
    const a = (i / 48) * TAU, rr = t.r * (0.97 + 0.03 * Math.sin(a * 5 + now / 500));
    const px = t.x + Math.cos(a) * rr, py = t.y + Math.sin(a) * rr;
    if (i) ctx.lineTo(px, py);
    else ctx.moveTo(px, py);
  }
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.globalAlpha = 1;
}
