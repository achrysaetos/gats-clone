import { ZOM } from '../shared/defs.ts';
import type { RunView } from '../shared/protocol.ts';
import { INK, PALETTE, shade, tint } from './palette.ts';
import { LIGHT } from './tilt.ts';

const TAU = Math.PI * 2;
const HALF = ZOM.coreHalf;

export const CORE_GLOW = '#4fd1e8';
const ALARM = '#ff3b30';
const HAZARD = { a: '#2b2e34', b: '#d9541f' } as const;
const PLATE = '#454b55';
const PYLON = '#4f5560';
const DECK = '#262a31';

/**
 * How worn the Bastion looks at `frac` of its health. Cracks open from 92% down, one at a time, and stay until it is mended
 * above them; smoke rises from `smoke` damaged corners below 60% and thickens below 35%; below 35% its light sputters and
 * its cracks glow; below 22% the alarm wails.
 */
export function coreStage(frac: number): { cracks: number; smoke: number; smokeRate: number; dark: number; sputter: boolean; alarm: boolean; sparkEveryMs: number; chunks: number } {
  const f = Math.max(0, Math.min(1, frac));
  const cracks = Math.max(0, Math.min(CRACK_COUNT, Math.floor(((0.92 - f) / 0.84) * CRACK_COUNT) + (f < 0.92 ? 1 : 0)));
  const smoke = f >= 0.6 ? 0 : f >= 0.35 ? 1 : f >= 0.15 ? 3 : 4;
  return {
    cracks, smoke,
    smokeRate: f >= 0.6 ? 0 : f >= 0.35 ? 3 : f >= 0.15 ? 5 : 7,
    dark: f >= 0.6 ? 0 : f >= 0.35 ? 0.35 : f >= 0.15 ? 0.65 : 1,
    sputter: f < 0.35,
    alarm: f < 0.22,
    sparkEveryMs: f >= 0.5 ? Infinity : 300 + 1600 * (f / 0.5),
    chunks: f >= 0.45 ? 0 : f >= 0.25 ? 2 : 4,
  };
}

export const CRACK_COUNT = 14;

/** A seeded generator, so the same core cracks the same way every time its health passes the same marks. */
export function seeded(seed: number) {
  let s = (seed >>> 0) || 1;
  return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; };
}

/** A crack: its start on the core's rim (relative to the center) and its polyline, branches included, as x0,y0,x1,y1 runs. */
export type CoreCrack = { x: number; y: number; lines: number[]; depth: number };

const crackCache = new Map<string, CoreCrack[]>();

/**
 * The core's cracks in the order they open. Each starts on the rim, mostly near a corner (where the horde piles up and
 * bites), and walks inward with a branch or two. Fixed for a core position, so they develop the same way and stay put.
 */
export function coreCracks(cx: number, cy: number): CoreCrack[] {
  const key = `${cx},${cy}`;
  const hit = crackCache.get(key);
  if (hit) return hit;
  const rand = seeded(Math.round(cx) * 92821 + Math.round(cy) * 68917);
  const cracks: CoreCrack[] = [];
  const lim = HALF - 2;
  const clamp = (v: number) => Math.max(-lim, Math.min(lim, v));
  for (let i = 0; i < CRACK_COUNT; i++) {
    // Walk round the four sides in turn, so damage spreads over the whole block instead of piling on one face.
    const side = (i + Math.floor(i / 4)) % 4;
    const along = (rand() < 0.6 ? (rand() < 0.5 ? -1 : 1) * (0.55 + rand() * 0.4) : rand() * 1.2 - 0.6) * lim;
    const [x, y, inward] = side === 0 ? [along, -lim, Math.PI / 2] : side === 1 ? [lim, along, Math.PI] : side === 2 ? [along, lim, -Math.PI / 2] : [-lim, along, 0];
    const lines: number[] = [];
    const walk = (x0: number, y0: number, a0: number, steps: number, len: number, branch: boolean) => {
      let px = x0, py = y0, a = a0;
      for (let s = 0; s < steps; s++) {
        a += (rand() - 0.5) * 1.0;
        const l = len * (0.6 + rand() * 0.8);
        const nx = clamp(px + Math.cos(a) * l), ny = clamp(py + Math.sin(a) * l);
        lines.push(px, py, nx, ny);
        if (branch && rand() < 0.4) walk(nx, ny, a + (rand() < 0.5 ? -1 : 1) * (0.5 + rand() * 0.7), 2, len * 0.65, false);
        px = nx; py = ny;
      }
    };
    walk(x, y, inward + (rand() - 0.5) * 0.8, 3 + Math.floor(rand() * 3), 7 + rand() * 5, true);
    cracks.push({ x, y, lines, depth: rand() });
  }
  crackCache.set(key, cracks);
  return cracks;
}

const sprites = new Map<string, HTMLCanvasElement>();

function cached(key: string, side: number, pxPerUnit: number, paint: (g: CanvasRenderingContext2D) => void): HTMLCanvasElement {
  const px = Math.round(pxPerUnit * 20) / 20;
  // Keyed by scale too, since the glow is painted at a capped scale: one cache shared by both never thrashes.
  const id = `${key}@${px}`;
  let image = sprites.get(id);
  if (!image) {
    if (sprites.size > 24) sprites.clear();
    image = document.createElement('canvas');
    image.width = image.height = Math.ceil(side * px);
    const g = image.getContext('2d')!;
    g.scale(px, px);
    g.translate(side / 2, side / 2);
    paint(g);
    sprites.set(id, image);
  }
  return image;
}

function octagonPath(g: CanvasRenderingContext2D, cx: number, cy: number, r: number, cut = 0.42) {
  const c = r * cut;
  g.beginPath();
  g.moveTo(cx - r + c, cy - r); g.lineTo(cx + r - c, cy - r); g.lineTo(cx + r, cy - r + c); g.lineTo(cx + r, cy + r - c);
  g.lineTo(cx + r - c, cy + r); g.lineTo(cx - r + c, cy + r); g.lineTo(cx - r, cy + r - c); g.lineTo(cx - r, cy - r + c);
  g.closePath();
}

/** A raised plate in the kit's two hard cel steps: lit on the edges toward the light, dark on the edges away, ink round it. */
function raised(g: CanvasRenderingContext2D, path: () => void, x0: number, y0: number, size: number, color: string, edge = 2.5) {
  path();
  g.fillStyle = color;
  g.fill();
  g.save();
  path();
  g.clip();
  g.fillStyle = tint(color, 0.22);
  g.fillRect(x0, y0, size, edge);
  g.fillRect(x0, y0, edge, size);
  g.fillStyle = shade(color, 0.68);
  g.fillRect(x0, y0 + size - edge, size, edge);
  g.fillRect(x0 + size - edge, y0, edge, size);
  g.restore();
  path();
  g.strokeStyle = INK;
  g.lineWidth = 1.6;
  g.stroke();
}

const PYLON_AT = HALF - 13;
export const CORNERS = [[-1, -1], [1, -1], [1, 1], [-1, 1]] as const;
const WELL = 31;

/**
 * The Bastion's fixed armour, painted once: a hazard-taped rim inside the block's own bevel, four corner pylons, conduits
 * running in to a recessed octagonal well, and bolts. Everything that moves or wears is drawn over it each frame.
 */
function paintBase(g: CanvasRenderingContext2D) {
  const h = HALF;
  // The rim: hazard tape in the interface's orange, framed in ink.
  const band = 7, inset = 4;
  g.save();
  g.beginPath();
  g.rect(-h + inset, -h + inset, (h - inset) * 2, (h - inset) * 2);
  g.rect(-h + inset + band, -h + inset + band, (h - inset - band) * 2, (h - inset - band) * 2);
  g.clip('evenodd');
  g.fillStyle = HAZARD.a;
  g.fillRect(-h, -h, h * 2, h * 2);
  g.strokeStyle = HAZARD.b;
  g.lineWidth = 4;
  g.beginPath();
  for (let d = -h * 2; d < h * 2; d += 11) { g.moveTo(d, -h); g.lineTo(d + h * 2, h); }
  g.stroke();
  g.restore();
  g.strokeStyle = INK;
  g.lineWidth = 1.2;
  g.strokeRect(-h + inset, -h + inset, (h - inset) * 2, (h - inset) * 2);
  g.strokeRect(-h + inset + band, -h + inset + band, (h - inset - band) * 2, (h - inset - band) * 2);
  // The inner plate, a shade lighter than the block, with its seams.
  const p = h - inset - band;
  raised(g, () => { g.beginPath(); g.rect(-p, -p, p * 2, p * 2); }, -p, -p, p * 2, PLATE, 2);
  g.strokeStyle = 'rgba(20, 22, 28, 0.45)';
  g.lineWidth = 1;
  g.beginPath();
  g.moveTo(0, -p); g.lineTo(0, -WELL); g.moveTo(0, WELL); g.lineTo(0, p);
  g.moveTo(-p, 0); g.lineTo(-WELL, 0); g.moveTo(WELL, 0); g.lineTo(p, 0);
  g.stroke();
  // Conduits from each pylon in to the well.
  for (const [sx, sy] of CORNERS) {
    g.lineCap = 'butt';
    g.strokeStyle = INK;
    g.lineWidth = 7;
    g.beginPath();
    g.moveTo(sx * PYLON_AT, sy * PYLON_AT);
    g.lineTo(sx * WELL * 0.62, sy * WELL * 0.62);
    g.stroke();
    g.strokeStyle = '#5d636d';
    g.lineWidth = 4.4;
    g.stroke();
    g.strokeStyle = 'rgba(255, 255, 255, 0.22)';
    g.lineWidth = 1.2;
    g.beginPath();
    g.moveTo(sx * PYLON_AT - 1, sy * PYLON_AT - 1.4);
    g.lineTo(sx * WELL * 0.62 - 1, sy * WELL * 0.62 - 1.4);
    g.stroke();
  }
  // The well: recessed, so its lit edge is the one away from the light.
  octagonPath(g, 0, 0, WELL, 0.38);
  g.fillStyle = DECK;
  g.fill();
  g.save();
  octagonPath(g, 0, 0, WELL, 0.38);
  g.clip();
  g.fillStyle = 'rgba(0, 0, 0, 0.35)';
  g.fillRect(-WELL, -WELL, WELL * 2, 4);
  g.fillRect(-WELL, -WELL, 4, WELL * 2);
  g.fillStyle = 'rgba(255, 255, 255, 0.12)';
  g.fillRect(-WELL, WELL - 3, WELL * 2, 3);
  g.fillRect(WELL - 3, -WELL, 3, WELL * 2);
  g.restore();
  octagonPath(g, 0, 0, WELL, 0.38);
  g.strokeStyle = INK;
  g.lineWidth = 2;
  g.stroke();
  // The emitter track the ring rides in.
  g.strokeStyle = '#15181d';
  g.lineWidth = 5;
  g.beginPath();
  g.arc(0, 0, 23, 0, TAU);
  g.stroke();
  // Pylons with their lamp sockets.
  for (const [sx, sy] of CORNERS) {
    const x = sx * PYLON_AT, y = sy * PYLON_AT, r = 9.5;
    raised(g, () => octagonPath(g, x, y, r), x - r, y - r, r * 2, PYLON, 2.2);
    g.fillStyle = INK;
    g.beginPath();
    g.arc(x, y, 4, 0, TAU);
    g.fill();
  }
  // Bolts along the inner plate.
  for (const [bx, by] of [[-0.5, -1], [0.5, -1], [-0.5, 1], [0.5, 1], [-1, -0.5], [-1, 0.5], [1, -0.5], [1, 0.5]] as const) {
    const x = bx * (p - 4), y = by * (p - 4);
    g.fillStyle = INK;
    g.beginPath();
    g.arc(x, y, 2.2, 0, TAU);
    g.fill();
    g.fillStyle = '#8d939c';
    g.beginPath();
    g.arc(x - 0.4, y - 0.4, 1.3, 0, TAU);
    g.fill();
  }
}

/** The light a lit crystal throws on the floor, a soft round falloff, painted once and tinted by alpha. */
function glowSprite(color: string, pxPerUnit: number) {
  return cached(`glow|${color}`, 256, Math.min(pxPerUnit, 1), (g) => {
    const grad = g.createRadialGradient(0, 0, 0, 0, 0, 128);
    grad.addColorStop(0, color);
    grad.addColorStop(0.35, `${color}88`);
    grad.addColorStop(1, `${color}00`);
    g.fillStyle = grad;
    g.fillRect(-128, -128, 256, 256);
  });
}

/** A light flickering like a failing tube: mostly on, with dips and dropouts that never repeat in step. */
export function sputter(now: number): number {
  const n = Math.sin(now * 0.013) + Math.sin(now * 0.031 + 1.7) * 0.8 + Math.sin(now * 0.0071 + 4.1) * 0.6;
  if (n > 1.55) return 0.12;
  if (n > 1.2) return 0.55;
  return 1;
}

/**
 * The Bastion's body, under the night's shade: its armour, then wear by health (soot, knocked-out chunks and cracks that
 * stay until mended), then the health ring. A bite flashes it and jolts the top.
 */
export function drawCoreBody(ctx: CanvasRenderingContext2D, run: RunView, now: number, hit: number, pxPerUnit: number) {
  const { x, y } = run.core;
  const frac = Math.max(0, run.core.hp / run.core.maxHp);
  const stage = coreStage(frac);
  const jx = x + Math.sin(now * 0.09) * hit * 2.5, jy = y + Math.cos(now * 0.11) * hit * 2.5;
  drawFrontFace(ctx, x, y, frac, now);
  const side = HALF * 2 + 4;
  ctx.drawImage(cached('base', side, pxPerUnit, paintBase), jx - side / 2, jy - side / 2, side, side);
  const cracks = coreCracks(x, y);
  // Soot round the smoking corners.
  if (stage.dark > 0) {
    ctx.fillStyle = `rgba(22, 20, 18, ${(0.32 * stage.dark).toFixed(3)})`;
    ctx.beginPath();
    for (let i = 0; i < stage.smoke; i++) {
      const c = cracks[i * 2]!;
      ctx.moveTo(jx + c.x * 0.8 + 16, jy + c.y * 0.8);
      ctx.ellipse(jx + c.x * 0.8, jy + c.y * 0.8, 16, 12, 0.5, 0, TAU);
    }
    ctx.fill();
  }
  // Chunks bitten out of the rim: ink notches with a lit broken edge.
  for (let i = 0; i < stage.chunks; i++) {
    const c = cracks[i * 2 + 1]!;
    const ox = jx + c.x, oy = jy + c.y;
    const rand = seeded(i * 7 + 3);
    const r = 7 + rand() * 4;
    ctx.beginPath();
    for (let j = 0; j < 6; j++) {
      const a = (j / 6) * TAU, rr = r * (0.6 + rand() * 0.5);
      if (j) ctx.lineTo(ox + Math.cos(a) * rr, oy + Math.sin(a) * rr); else ctx.moveTo(ox + Math.cos(a) * rr, oy + Math.sin(a) * rr);
    }
    ctx.closePath();
    ctx.fillStyle = '#1a1c21';
    ctx.fill();
    ctx.strokeStyle = '#6a707a';
    ctx.lineWidth = 1.2;
    ctx.stroke();
  }
  // Cracks: a dark gash with a pale chipped lip toward the light.
  if (stage.cracks > 0) {
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    for (const [width, color, dx, dy] of [[2.6, 'rgba(160, 166, 176, 0.5)', -LIGHT.x * 0.9, -LIGHT.y * 0.9], [2.2, '#121418', 0, 0]] as const) {
      ctx.strokeStyle = color;
      ctx.lineWidth = width * 1.25;
      ctx.beginPath();
      for (let i = 0; i < stage.cracks; i++) {
        const l = cracks[i]!.lines;
        // The newest crack grows in as health falls through its mark, rather than popping in whole.
        for (let j = 0; j < l.length; j += 4) { ctx.moveTo(jx + l[j]! + dx, jy + l[j + 1]! + dy); ctx.lineTo(jx + l[j + 2]! + dx, jy + l[j + 3]! + dy); }
      }
      ctx.stroke();
    }
  }
  if (hit > 0) {
    ctx.globalAlpha = 0.45 * hit;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(jx - HALF, jy - HALF, HALF * 2, HALF * 2);
    ctx.globalAlpha = 1;
  }
  drawHealthRing(ctx, x, y, frac, now);
}

/** How tall the Bastion's south face hangs below its top, the 3/4 view's height cue (tilt.ts leaves the core's to us). */
export const CORE_FACE = 18;
const VENTS = [-30, -10, 10, 30] as const;

/**
 * The south face: darker plate below the top, ink-edged, with panel seams, a hazard-taped foot and four vents that breathe
 * the crystal's light. A worn core's vents go dark and the face picks up soot.
 */
function drawFrontFace(ctx: CanvasRenderingContext2D, x: number, y: number, frac: number, now: number) {
  const top = y + HALF, l = x - HALF, w = HALF * 2, h = CORE_FACE;
  ctx.fillStyle = '#2a2e35';
  ctx.fillRect(l, top, w, h);
  ctx.fillStyle = 'rgba(255, 255, 255, 0.08)';
  ctx.fillRect(l, top, w, 3);
  ctx.fillStyle = HAZARD.a;
  ctx.fillRect(l, top + h - 5, w, 5);
  ctx.strokeStyle = HAZARD.b;
  ctx.lineWidth = 2.5;
  ctx.save();
  ctx.beginPath();
  ctx.rect(l, top + h - 5, w, 5);
  ctx.clip();
  ctx.beginPath();
  for (let d = l - 10; d < l + w; d += 8) { ctx.moveTo(d, top + h); ctx.lineTo(d + 5, top + h - 5); }
  ctx.stroke();
  ctx.restore();
  ctx.strokeStyle = 'rgba(10, 12, 16, 0.5)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (const vx of [-20, 0, 20]) { ctx.moveTo(x + vx, top + 2); ctx.lineTo(x + vx, top + h - 5); }
  ctx.stroke();
  const pulse = 0.5 + 0.5 * Math.sin(now / 420);
  const lit = frac <= 0 ? 0 : frac < 0.35 ? sputter(now + 333) * 0.7 : 0.6 + 0.4 * pulse;
  for (const vx of VENTS) {
    ctx.fillStyle = INK;
    ctx.fillRect(x + vx - 5, top + 5, 10, 5);
    ctx.globalAlpha = lit;
    ctx.fillStyle = frac < 0.22 && frac > 0 ? '#ff6a5a' : CORE_GLOW;
    ctx.fillRect(x + vx - 4, top + 6, 8, 3);
    ctx.globalAlpha = 1;
  }
  if (frac < 0.6) {
    ctx.fillStyle = `rgba(22, 20, 18, ${(0.45 * (1 - frac / 0.6)).toFixed(3)})`;
    ctx.fillRect(l, top, w, h);
  }
  ctx.strokeStyle = INK;
  ctx.lineWidth = 2;
  ctx.strokeRect(l, top, w, h);
}

/** The health ring round the core: an ink track and twenty segments, green to gold to red, the last one blinking when low. */
function drawHealthRing(ctx: CanvasRenderingContext2D, x: number, y: number, frac: number, now: number) {
  const R = 84, SEG = 20, gap = 0.045;
  ctx.lineCap = 'butt';
  ctx.lineWidth = 9;
  ctx.strokeStyle = 'rgba(28, 31, 38, 0.32)';
  ctx.beginPath();
  ctx.arc(x, y, R, 0, TAU);
  ctx.stroke();
  const color = frac > 0.5 ? PALETTE.hpGood : frac > 0.25 ? PALETTE.gold : PALETTE.hpBad;
  const lit = frac * SEG;
  ctx.lineWidth = 5;
  ctx.strokeStyle = color;
  ctx.beginPath();
  for (let i = 0; i < Math.ceil(lit); i++) {
    const a0 = -Math.PI / 2 + (i / SEG) * TAU + gap / 2;
    const a1 = -Math.PI / 2 + (Math.min(lit, i + 1) / SEG) * TAU - gap / 2;
    if (a1 <= a0) continue;
    if (i === Math.ceil(lit) - 1 && frac < 0.25 && Math.floor(now / 220) % 2) continue;
    ctx.moveTo(x + Math.cos(a0) * R, y + Math.sin(a0) * R);
    ctx.arc(x, y, R, a0, a1);
  }
  ctx.stroke();
}

/** A facet of the crystal is lit, mid or dark by how squarely it faces the world's light, in hard steps like everything else. */
const LIGHT_ANGLE = Math.atan2(-LIGHT.y, -LIGHT.x);
const facetTone = (mid: number) => { const d = Math.cos(mid - LIGHT_ANGLE); return d > 0.45 ? 2 : d < -0.35 ? 0 : 1; };

/**
 * Everything on the core that gives off light, drawn over the night's shade so it glows in the dark: its pool of light on the
 * floor, the turning emitter ring, the hovering crystal (pulsing, sputtering when badly hurt, flaring on a bite), lamps on
 * the pylons, glowing cracks, and the red alarm sweep when critical. `heal` (0..1) is a fresh repair's shimmer.
 */
export function drawCoreLight(ctx: CanvasRenderingContext2D, run: RunView, now: number, hit: number, heal: number, night: number, pxPerUnit: number) {
  const { x, y } = run.core;
  const frac = Math.max(0, run.core.hp / run.core.maxHp);
  const dead = frac <= 0;
  const stage = { ...coreStage(frac), alarm: !dead && coreStage(frac).alarm };
  const pulse = 0.5 + 0.5 * Math.sin(now / 420);
  // A fallen core's crystal is dark: no pool of light, no ring, no alarm.
  const power = dead ? 0 : (stage.sputter ? sputter(now) : 1) * (0.55 + 0.45 * Math.min(1, frac * 1.6));
  const jx = x + Math.sin(now * 0.09) * hit * 2.5, jy = y + Math.cos(now * 0.11) * hit * 2.5;
  // The pool of light on the floor; brighter after dark, red while the alarm sounds.
  const alarmBeat = stage.alarm ? 0.5 + 0.5 * Math.sin(now / 130) : 0;
  const glow = glowSprite(CORE_GLOW, pxPerUnit);
  const reach = 140 + 10 * pulse;
  ctx.globalAlpha = (0.06 + 0.1 * night) * power + 0.12 * hit;
  ctx.drawImage(glow, x - reach, y - reach, reach * 2, reach * 2);
  if (stage.alarm) {
    const red = glowSprite(ALARM, pxPerUnit);
    ctx.globalAlpha = (0.08 + 0.18 * night) * alarmBeat;
    ctx.drawImage(red, x - 190, y - 190, 380, 380);
  }
  ctx.globalCompositeOperation = 'source-over';
  // The alarm's beacon: a red wedge of light sweeping round, and a ring pulsing out across the floor.
  if (stage.alarm) {
    const sweep = now / 380;
    ctx.globalAlpha = 0.1 + 0.08 * night;
    ctx.fillStyle = ALARM;
    ctx.beginPath();
    for (const off of [0, Math.PI]) { ctx.moveTo(x, y); ctx.arc(x, y, 200, sweep + off - 0.22, sweep + off + 0.22); ctx.closePath(); }
    ctx.fill();
    const ring = (now % 1000) / 1000;
    ctx.globalAlpha = 0.6 * (1 - ring);
    ctx.strokeStyle = ALARM;
    ctx.lineWidth = 4 * (1 - ring) + 1;
    ctx.beginPath();
    ctx.arc(x, y, 60 + ring * 110, 0, TAU);
    ctx.stroke();
  }
  // The emitter ring, turning faster the harder the core is pressed.
  const spin = now / (900 - 500 * (1 - frac)) + hit;
  ctx.lineCap = 'round';
  ctx.lineWidth = 3.4;
  ctx.globalAlpha = dead ? 0 : 0.9 * Math.max(0.3, power);
  ctx.strokeStyle = stage.alarm && alarmBeat > 0.5 ? '#ff8a7a' : '#8be9f7';
  ctx.beginPath();
  for (let i = 0; i < 3; i++) { const a = spin + (i / 3) * TAU; ctx.moveTo(jx + Math.cos(a) * 23, jy + Math.sin(a) * 23); ctx.arc(jx, jy, 23, a, a + 1.3); }
  ctx.stroke();
  ctx.globalAlpha = 1;
  // The crystal's halo.
  const bob = Math.sin(now / 600) * 1.6;
  const cy = jy - 7 + bob;
  const halo = 24 + 4 * pulse + 12 * hit;
  ctx.globalAlpha = Math.min(1, (0.18 + 0.1 * pulse) * power + 0.3 * hit);
  ctx.globalCompositeOperation = night > 0.3 ? 'lighter' : 'source-over';
  ctx.drawImage(glow, jx - halo, cy - halo, halo * 2, halo * 2);
  ctx.globalCompositeOperation = 'source-over';
  ctx.globalAlpha = 1;
  // Its shadow on the well's floor, then the crystal: a hexagonal point seen from above, turning, cel-shaded facet by facet.
  const size = (18 + 2 * pulse) * (1 + 0.12 * hit);
  ctx.fillStyle = 'rgba(0, 0, 0, 0.35)';
  ctx.beginPath();
  ctx.ellipse(jx + LIGHT.x * 5, jy + LIGHT.y * 5, size * 0.85, size * 0.6, 0, 0, TAU);
  ctx.fill();
  const turn = now / 2400;
  const lit = power;
  const base = stage.alarm && alarmBeat > 0.6 ? '#e86a6a' : CORE_GLOW;
  const tones = [shade(base, 0.5 + 0.2 * lit), shade(base, 0.75 + 0.25 * lit), tint(base, 0.15 + 0.45 * lit)];
  for (let i = 0; i < 6; i++) {
    const a0 = turn + (i / 6) * TAU, a1 = turn + ((i + 1) / 6) * TAU;
    ctx.fillStyle = tones[facetTone((a0 + a1) / 2)]!;
    ctx.beginPath();
    ctx.moveTo(jx, cy);
    ctx.lineTo(jx + Math.cos(a0) * size, cy + Math.sin(a0) * size * 0.92);
    ctx.lineTo(jx + Math.cos(a1) * size, cy + Math.sin(a1) * size * 0.92);
    ctx.closePath();
    ctx.fill();
  }
  ctx.strokeStyle = INK;
  ctx.lineWidth = 1.8;
  ctx.lineJoin = 'round';
  ctx.beginPath();
  for (let i = 0; i <= 6; i++) {
    const a = turn + (i / 6) * TAU;
    if (i) ctx.lineTo(jx + Math.cos(a) * size, cy + Math.sin(a) * size * 0.92); else ctx.moveTo(jx + Math.cos(a) * size, cy + Math.sin(a) * size * 0.92);
  }
  ctx.stroke();
  ctx.lineWidth = 0.8;
  ctx.strokeStyle = 'rgba(28, 31, 38, 0.45)';
  ctx.beginPath();
  for (let i = 0; i < 6; i++) { const a = turn + (i / 6) * TAU; ctx.moveTo(jx, cy); ctx.lineTo(jx + Math.cos(a) * size, cy + Math.sin(a) * size * 0.92); }
  ctx.stroke();
  // The hot heart and a glint.
  ctx.globalAlpha = Math.min(1, 0.4 + 0.6 * lit + hit);
  ctx.fillStyle = '#f2feff';
  ctx.beginPath();
  ctx.arc(jx, cy, 3.4 + 1.2 * pulse + 3 * hit, 0, TAU);
  ctx.fill();
  ctx.globalAlpha = 0.8 * lit;
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.ellipse(jx - size * 0.38, cy - size * 0.42, 2.6, 1.4, -0.7, 0, TAU);
  ctx.fill();
  ctx.globalAlpha = 1;
  // Pylon lamps: steady cyan, amber blinking once worn, red racing in the alarm.
  const lamp = dead ? '#2c3037' : stage.alarm ? (Math.floor(now / 160) % 2 ? ALARM : '#5a1a1a') : frac < 0.6 ? (Math.floor(now / 500) % 2 ? '#ffb347' : '#6a4a20') : CORE_GLOW;
  for (const [i, [sx, sy]] of CORNERS.entries()) {
    const lx = jx + sx * PYLON_AT, ly = jy + sy * PYLON_AT;
    const on = lamp === CORE_GLOW ? 0.7 + 0.3 * Math.sin(now / 300 + i * 1.6) : 1;
    ctx.globalAlpha = 0.35 * on;
    ctx.fillStyle = lamp;
    ctx.beginPath();
    ctx.arc(lx, ly, 7.5, 0, TAU);
    ctx.fill();
    ctx.globalAlpha = on;
    ctx.beginPath();
    ctx.arc(lx, ly, 3, 0, TAU);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
  // Deep cracks glow with the charge leaking out of them.
  if (stage.sputter && stage.cracks > 0) {
    const cracks = coreCracks(x, y);
    ctx.lineCap = 'round';
    ctx.strokeStyle = stage.alarm ? '#ff9a5a' : '#8be9f7';
    ctx.lineWidth = 1.1;
    ctx.globalAlpha = (0.55 + 0.45 * Math.sin(now / 90)) * Math.max(0.3, power);
    ctx.beginPath();
    for (let i = 0; i < stage.cracks; i++) {
      const c = cracks[i]!;
      if (c.depth < 0.45) continue;
      for (let j = 0; j < c.lines.length; j += 4) { ctx.moveTo(jx + c.lines[j]!, jy + c.lines[j + 1]!); ctx.lineTo(jx + c.lines[j + 2]!, jy + c.lines[j + 3]!); }
    }
    ctx.stroke();
    ctx.globalAlpha = 1;
  }
  // A fresh repair: a cool shimmer sweeping over the block.
  if (heal > 0) {
    ctx.globalAlpha = 0.5 * heal;
    ctx.strokeStyle = '#9ff0c0';
    ctx.lineWidth = 3;
    ctx.strokeRect(x - HALF - 4 - 10 * (1 - heal), y - HALF - 4 - 10 * (1 - heal), HALF * 2 + 8 + 20 * (1 - heal), HALF * 2 + 8 + 20 * (1 - heal));
    ctx.globalAlpha = 1;
  }
}
