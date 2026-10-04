import { COLORS, WORLD } from '../shared/defs.ts';
import type { BulletView, CrateView, PlayerView, Snapshot, ThrownView, WallView, ZoneView } from '../shared/protocol.ts';
import { BLAST_RADIUS } from '../shared/sim/abilities.ts';
import { screenToWorld, type Camera, type Point } from './camera.ts';
import { drawEffects, drawParticles, HIT_FLASH_MS, hitFlashes } from './effects.ts';
import { NUMBER_MS, type DamageNumber } from './feedback.ts';
import { ARMOR_BAND, INK, PALETTE, shade, TEAM_COLORS, teamColor } from './palette.ts';
import { drawGun, gripsOf } from './sprites.ts';
import type { Session } from './state.ts';
import { crateDamage, crateSprite, floorCracks, PLAYER_SHADOW, SLAB, slabLevels, WALL_SHADOW } from './textures.ts';

const TAU = Math.PI * 2;
const R = WORLD.playerRadius;
const CURB = 18;
const WALL_FACE = 7;
const CULL_MARGIN = 80;
const TRACER = { tail: 0.07, core: 0.022 } as const;

export const bodyColor = (p: Pick<PlayerView, 'color' | 'team'>): string => (p.team ? TEAM_COLORS[p.team] : COLORS[p.color]);

type Frame = { snap: Snapshot; s: Session; cam: Camera; dpr: number; now: number; selfAngle: number | null };
type View = { x0: number; y0: number; x1: number; y1: number };

const inView = (v: View, x: number, y: number, w: number, h: number) => x + w >= v.x0 && x <= v.x1 && y + h >= v.y0 && y <= v.y1;

export function drawWorld(ctx: CanvasRenderingContext2D, f: Frame) {
  const { cam, dpr, snap, s, now } = f;
  const k = dpr * cam.scale;
  ctx.setTransform(k, 0, 0, k, dpr * (cam.w / 2 - cam.x * cam.scale), dpr * (cam.h / 2 - cam.y * cam.scale));
  const tl = screenToWorld(cam, { x: 0, y: 0 });
  const br = screenToWorld(cam, { x: cam.w, y: cam.h });
  const view: View = { x0: tl.x - CULL_MARGIN, y0: tl.y - CULL_MARGIN, x1: br.x + CULL_MARGIN, y1: br.y + CULL_MARGIN };
  drawGround(ctx, s.worldSize, tl, br);
  const toScreen = (x: number, y: number) => ({ x: Math.round(dpr * ((x - cam.x) * cam.scale + cam.w / 2)), y: Math.round(dpr * ((y - cam.y) * cam.scale + cam.h / 2)) });

  const myTeam = snap.players.find((p) => p.id === s.myId)?.team ?? null;
  for (const [i, z] of snap.zones.entries()) drawZone(ctx, z, i);
  for (const t of snap.thrown) if (t.kind === 'landMine') drawThrown(ctx, t, now);
  const crates = snap.crates.filter((c) => inView(view, c.x, c.y, c.size, c.size));
  if (crates.length) {
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    for (const c of crates) drawCrate(ctx, c, k, toScreen);
    ctx.restore();
  }
  const walls = s.walls.filter((w) => inView(view, w.x, w.y, w.w + WALL_SHADOW.x, w.h + WALL_SHADOW.y));
  drawWallShadows(ctx, walls);
  for (const w of walls) drawWall(ctx, w);
  const alive = snap.players.filter((p) => p.alive && inView(view, p.x - R * 3, p.y - R * 3, R * 6, R * 6));
  drawPlayerShadows(ctx, alive);
  for (const p of snap.players) drawTrail(ctx, bodyColor(p), s.trails.get(p.id), now);
  drawTracers(ctx, snap.bullets, s.myId);

  const flashes = hitFlashes(s.effects, now);
  for (const p of alive) {
    const self = p.id === s.myId;
    const angle = self && f.selfAngle !== null ? f.selfAngle : p.angle;
    const flash = flashes.get(p.id);
    drawPlayer(ctx, { ...p, angle }, bodyColor(p), {
      self, friendly: !self && p.team !== null && p.team === myTeam, flash: flash === undefined ? 0 : 1 - (now - flash) / HIT_FLASH_MS,
    });
  }
  for (const t of snap.thrown) if (t.kind !== 'landMine' && t.kind !== 'gasCloud') drawThrown(ctx, t, now);
  for (const t of snap.thrown) if (t.kind === 'gasCloud') drawThrown(ctx, t, now);
  drawEffects(ctx, s.effects, now);
  drawParticles(ctx, s.particles, now);
  for (const p of alive) if (!p.hidden) drawLabel(ctx, p, p.id === s.myId);
  drawDamageNumbers(ctx, s.feedback.numbers, now);
  drawLetterbox(ctx, cam, dpr);
}

const BACKDROP = { zoom: 0.75, swayMs: 40_000, fill: 0.85 } as const;

export function drawBackdrop(ctx: CanvasRenderingContext2D, w: number, h: number, dpr: number, now: number) {
  const zoom = Math.max(BACKDROP.zoom, w / (WORLD.size * BACKDROP.fill), h / (WORLD.size * BACKDROP.fill));
  const viewW = w / zoom, viewH = h / zoom;
  const freeX = WORLD.size - viewW, freeY = WORLD.size - viewH;
  const x = freeX / 2 + (freeX / 2) * Math.sin(now / BACKDROP.swayMs);
  const y = freeY / 2 + (freeY / 2) * 0.5 * Math.cos(now / BACKDROP.swayMs);
  const k = dpr * zoom;
  ctx.setTransform(k, 0, 0, k, -x * k, -y * k);
  drawFloor(ctx, WORLD.size, { x, y }, { x: x + viewW, y: y + viewH });
}

function drawLetterbox(ctx: CanvasRenderingContext2D, cam: Camera, dpr: number) {
  const barW = cam.w / 2 - cam.viewHalfW * cam.scale, barH = cam.h / 2 - cam.viewHalfH * cam.scale;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.fillStyle = PALETTE.letterbox;
  if (barW >= 1) { ctx.fillRect(0, 0, barW, cam.h); ctx.fillRect(cam.w - barW, 0, barW, cam.h); }
  if (barH >= 1) { ctx.fillRect(0, 0, cam.w, barH); ctx.fillRect(0, cam.h - barH, cam.w, barH); }
}

const SLAB_SPREAD = 0.028;
const SLAB_COLORS = [0, -1, 1, -0.5].map((i) => shade(PALETTE.floor, 1 + i * SLAB_SPREAD));
const PLAIN_SLABS = 0.55;
const CRACKS_PER_SLAB = 0.08;
const TONE_PATCH = 2 * SLAB;

/** Per tone, flat [patchX, patchY, length] runs of same-tone patches in a row, reused every frame. */
const slabRuns: number[][] = SLAB_COLORS.map(() => []);

type FloorPlan = { size: number; patchesPerRow: number; levels: number[]; cracks: number[][] };
let floorPlan: FloorPlan | null = null;

function planFor(size: number): FloorPlan {
  if (floorPlan?.size !== size) {
    const patchesPerRow = Math.ceil(size / TONE_PATCH);
    const slabs = (size / SLAB) ** 2;
    floorPlan = { size, patchesPerRow, levels: slabLevels(7, patchesPerRow ** 2, SLAB_COLORS.length, PLAIN_SLABS), cracks: floorCracks(11, size, Math.round(slabs * CRACKS_PER_SLAB)) };
  }
  return floorPlan;
}

function drawGround(ctx: CanvasRenderingContext2D, size: number, tl: Point, br: Point) {
  ctx.fillStyle = PALETTE.outside;
  ctx.fillRect(tl.x, tl.y, br.x - tl.x, br.y - tl.y);
  drawFloor(ctx, size, tl, br);
  ctx.fillStyle = PALETTE.shadow;
  ctx.fillRect(0, 0, size, 14);
  ctx.fillRect(0, 14, 12, size - 14);
  ctx.fillStyle = PALETTE.curb;
  ctx.fillRect(-CURB, -CURB, size + CURB * 2, CURB);
  ctx.fillRect(-CURB, size, size + CURB * 2, CURB);
  ctx.fillRect(-CURB, 0, CURB, size);
  ctx.fillRect(size, 0, CURB, size);
  ctx.fillStyle = PALETTE.curbTop;
  ctx.fillRect(-CURB, -CURB, size + CURB * 2, 4);
  ctx.fillRect(-CURB, size, size + CURB * 2, 4);
  ctx.strokeStyle = INK;
  ctx.lineWidth = 3;
  ctx.strokeRect(-1.5, -1.5, size + 3, size + 3);
  ctx.strokeRect(-CURB, -CURB, size + CURB * 2, size + CURB * 2);
}

/** Axis-aligned fillRect stays on the rasterizer's fast path; one path of many rects does not. */
function drawFloor(ctx: CanvasRenderingContext2D, size: number, tl: Point, br: Point) {
  const plan = planFor(size);
  const x0 = Math.max(0, tl.x), x1 = Math.min(size, br.x), y0 = Math.max(0, tl.y), y1 = Math.min(size, br.y);
  if (x1 <= x0 || y1 <= y0) return;
  ctx.fillStyle = SLAB_COLORS[0]!;
  ctx.fillRect(x0, y0, x1 - x0, y1 - y0);
  const ix0 = Math.floor(x0 / TONE_PATCH), ix1 = Math.min(plan.patchesPerRow - 1, Math.floor(x1 / TONE_PATCH));
  const iy0 = Math.floor(y0 / TONE_PATCH), iy1 = Math.min(plan.patchesPerRow - 1, Math.floor(y1 / TONE_PATCH));
  for (const runs of slabRuns) runs.length = 0;
  for (let iy = iy0; iy <= iy1; iy++) {
    const row = iy * plan.patchesPerRow;
    for (let ix = ix0; ix <= ix1;) {
      const level = plan.levels[row + ix]!;
      let end = ix + 1;
      while (end <= ix1 && plan.levels[row + end] === level) end++;
      if (level) slabRuns[level]!.push(ix, iy, end - ix);
      ix = end;
    }
  }
  for (let level = 1; level < SLAB_COLORS.length; level++) {
    const runs = slabRuns[level]!;
    ctx.fillStyle = SLAB_COLORS[level]!;
    for (let i = 0; i < runs.length; i += 3) ctx.fillRect(runs[i]! * TONE_PATCH, runs[i + 1]! * TONE_PATCH, runs[i + 2]! * TONE_PATCH, TONE_PATCH);
  }
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = PALETTE.speck;
  ctx.globalAlpha = 0.3;
  ctx.beginPath();
  for (const c of plan.cracks) {
    if (c[0]! < x0 - SLAB || c[0]! > x1 + SLAB || c[1]! < y0 - SLAB || c[1]! > y1 + SLAB) continue;
    ctx.moveTo(c[0]!, c[1]!);
    for (let i = 2; i < c.length; i += 2) ctx.lineTo(c[i]!, c[i + 1]!);
  }
  ctx.stroke();
  ctx.globalAlpha = 1;
  ctx.fillStyle = PALETTE.seam;
  for (let x = Math.ceil(x0 / SLAB) * SLAB; x <= x1; x += SLAB) ctx.fillRect(x - 1.25, y0, 2.5, y1 - y0);
  for (let y = Math.ceil(y0 / SLAB) * SLAB; y <= y1; y += SLAB) ctx.fillRect(x0, y - 1.25, x1 - x0, 2.5);
}

function drawZone(ctx: CanvasRenderingContext2D, z: ZoneView, index: number) {
  const color = teamColor(z.owner);
  ctx.beginPath();
  ctx.arc(z.x, z.y, z.r, 0, TAU);
  ctx.fillStyle = color;
  ctx.globalAlpha = 0.14;
  ctx.fill();
  ctx.globalAlpha = 0.75;
  ctx.lineWidth = 6;
  ctx.strokeStyle = color;
  ctx.stroke();
  ctx.setLineDash([4, 26]);
  ctx.lineWidth = 16;
  ctx.globalAlpha = 0.45;
  ctx.beginPath();
  ctx.arc(z.x, z.y, z.r - 14, 0, TAU);
  ctx.stroke();
  ctx.setLineDash([]);
  const progress = Math.min(1, Math.abs(z.progress));
  if (progress > 0) {
    ctx.globalAlpha = 0.95;
    ctx.lineWidth = 12;
    ctx.lineCap = 'butt';
    ctx.strokeStyle = teamColor(z.capturing ?? z.owner);
    ctx.beginPath();
    ctx.arc(z.x, z.y, z.r - 14, -Math.PI / 2, -Math.PI / 2 + progress * TAU);
    ctx.stroke();
  }
  ctx.globalAlpha = 0.7;
  ctx.beginPath();
  ctx.arc(z.x, z.y, 30, 0, TAU);
  ctx.fillStyle = INK;
  ctx.fill();
  ctx.lineWidth = 4;
  ctx.strokeStyle = color;
  ctx.stroke();
  ctx.globalAlpha = 0.9;
  ctx.fillStyle = '#ffffff';
  ctx.font = '800 34px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(String.fromCharCode(65 + index), z.x, z.y + 2);
  ctx.globalAlpha = 1;
}

const SPRITE_SCALE_STEP = 20;

function drawCrate(ctx: CanvasRenderingContext2D, c: CrateView, pxPerUnit: number, toScreen: (x: number, y: number) => Point) {
  const sprite = crateSprite(c.size, crateDamage(c.hp / WORLD.crateHp), Math.round(pxPerUnit * SPRITE_SCALE_STEP) / SPRITE_SCALE_STEP);
  const at = toScreen(c.x - sprite.pad, c.y - sprite.pad);
  ctx.drawImage(sprite.image, at.x, at.y);
}

function drawWallShadows(ctx: CanvasRenderingContext2D, walls: readonly WallView[]) {
  ctx.fillStyle = PALETTE.shadow;
  ctx.beginPath();
  for (const w of walls) ctx.rect(w.x + WALL_SHADOW.x, w.y + WALL_SHADOW.y, w.w, w.h);
  ctx.fill();
}

function drawWall(ctx: CanvasRenderingContext2D, w: WallView) {
  const [top, face, edge] = w.built ? [PALETTE.builtTop, PALETTE.builtFace, PALETTE.builtEdge] : [PALETTE.wallTop, PALETTE.wallFace, PALETTE.wallEdge];
  const faceH = Math.min(WALL_FACE, w.h / 3);
  ctx.fillStyle = face;
  ctx.fillRect(w.x, w.y, w.w, w.h);
  ctx.fillStyle = top;
  ctx.fillRect(w.x, w.y, w.w, w.h - faceH);
  ctx.fillStyle = edge;
  ctx.fillRect(w.x, w.y, w.w, 2.5);
  ctx.fillRect(w.x, w.y, 2.5, w.h - faceH);
  if (w.built) {
    ctx.strokeStyle = face;
    ctx.lineWidth = 2;
    ctx.beginPath();
    const along = w.w >= w.h;
    const span = along ? w.w : w.h - faceH;
    for (let d = 24; d < span; d += 24) {
      if (along) { ctx.moveTo(w.x + d, w.y + 3); ctx.lineTo(w.x + d, w.y + w.h - faceH - 1); }
      else { ctx.moveTo(w.x + 3, w.y + d); ctx.lineTo(w.x + w.w - 1, w.y + d); }
    }
    ctx.stroke();
  }
  ctx.strokeStyle = INK;
  ctx.lineWidth = 3;
  ctx.strokeRect(w.x, w.y, w.w, w.h);
}

function drawThrown(ctx: CanvasRenderingContext2D, t: ThrownView, now: number) {
  switch (t.kind) {
    case 'gasCloud': return drawGas(ctx, t, now);
    case 'landMine': {
      ctx.beginPath();
      ctx.arc(t.x, t.y, 13, 0, TAU);
      ctx.fillStyle = '#3d424b';
      ctx.fill();
      ctx.lineWidth = 3;
      ctx.strokeStyle = INK;
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(t.x, t.y, 5, 0, TAU);
      ctx.fillStyle = Math.floor(now / 400) % 2 ? '#ff4d4f' : '#7a1f21';
      ctx.fill();
      return;
    }
    case 'grenade':
    case 'fragGrenade':
    case 'gasGrenade': {
      if (t.kind !== 'gasGrenade') drawBlastRing(ctx, t.x, t.y, BLAST_RADIUS[t.kind], now);
      const band = t.kind === 'gasGrenade' ? '#7bb33a' : t.kind === 'fragGrenade' ? '#e07a22' : '#c7c9cc';
      ctx.fillStyle = PALETTE.shadow;
      ctx.beginPath();
      ctx.arc(t.x + 4, t.y + 6, 11, 0, TAU);
      ctx.fill();
      if (t.kind === 'fragGrenade') {
        ctx.fillStyle = INK;
        for (let i = 0; i < 8; i++) {
          const a = (i / 8) * TAU + now / 300;
          ctx.fillRect(t.x + Math.cos(a) * 12 - 2.5, t.y + Math.sin(a) * 12 - 2.5, 5, 5);
        }
      }
      ctx.beginPath();
      ctx.arc(t.x, t.y, 11, 0, TAU);
      ctx.fillStyle = '#3a3f47';
      ctx.fill();
      ctx.fillStyle = band;
      ctx.fillRect(t.x - 11, t.y - 3, 22, 6);
      ctx.beginPath();
      ctx.arc(t.x, t.y, 11, 0, TAU);
      ctx.lineWidth = 3;
      ctx.strokeStyle = INK;
      ctx.stroke();
      ctx.fillStyle = 'rgba(255,255,255,0.35)';
      ctx.beginPath();
      ctx.arc(t.x - 4, t.y - 4, 3, 0, TAU);
      ctx.fill();
      return;
    }
  }
}

const GAS_PUFFS = 7;

function drawGas(ctx: CanvasRenderingContext2D, t: ThrownView, now: number) {
  ctx.fillStyle = PALETTE.gas;
  ctx.beginPath();
  ctx.arc(t.x, t.y, t.r, 0, TAU);
  ctx.fill();
  for (let i = 0; i < GAS_PUFFS; i++) {
    const a = (i / GAS_PUFFS) * TAU + now / 2400 * (i % 2 ? 1 : -1);
    const d = t.r * (0.45 + 0.12 * Math.sin(now / 700 + i));
    ctx.beginPath();
    ctx.arc(t.x + Math.cos(a) * d, t.y + Math.sin(a) * d, t.r * 0.42, 0, TAU);
    ctx.fill();
  }
  ctx.setLineDash([10, 10]);
  ctx.lineDashOffset = -now / 60;
  ctx.strokeStyle = PALETTE.gasEdge;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(t.x, t.y, t.r, 0, TAU);
  ctx.stroke();
  ctx.setLineDash([]);
}

function drawBlastRing(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, now: number) {
  const pulse = 0.5 + 0.5 * Math.sin(now / 90);
  ctx.beginPath();
  ctx.arc(x, y, r, 0, TAU);
  ctx.fillStyle = `rgba(229, 72, 77, ${(0.07 + 0.06 * pulse).toFixed(3)})`;
  ctx.fill();
  ctx.setLineDash([14, 10]);
  ctx.lineDashOffset = -now / 40;
  ctx.lineWidth = 3;
  ctx.strokeStyle = `rgba(229, 72, 77, ${(0.55 + 0.35 * pulse).toFixed(3)})`;
  ctx.stroke();
  ctx.setLineDash([]);
}

function drawTrail(ctx: CanvasRenderingContext2D, color: string, trail: { x: number; y: number; at: number }[] | undefined, now: number) {
  if (!trail?.length) return;
  ctx.fillStyle = color;
  for (const pt of trail) {
    const age = (now - pt.at) / TRAIL_MS;
    if (age >= 1) continue;
    ctx.globalAlpha = 0.35 * (1 - age);
    ctx.beginPath();
    ctx.arc(pt.x, pt.y, R * (1 - age * 0.4), 0, TAU);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

export const TRAIL_MS = 260;

function drawTracers(ctx: CanvasRenderingContext2D, bullets: readonly BulletView[], myId: number) {
  ctx.lineCap = 'round';
  for (const own of [false, true]) {
    const mine = bullets.filter((b) => (b.owner === myId) === own);
    if (!mine.length) continue;
    const color = own ? PALETTE.ownBullet : PALETTE.bullet;
    for (const [len, width, alpha] of [[TRACER.tail, 3, 0.28], [TRACER.core, 5, 1]] as const) {
      ctx.globalAlpha = alpha;
      ctx.strokeStyle = color;
      ctx.lineWidth = width;
      ctx.beginPath();
      for (const b of mine) { ctx.moveTo(b.x - b.vx * len, b.y - b.vy * len); ctx.lineTo(b.x, b.y); }
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
    ctx.fillStyle = own ? '#fff1c4' : '#f4efe6';
    ctx.beginPath();
    for (const b of mine) { ctx.moveTo(b.x + 1.6, b.y); ctx.arc(b.x, b.y, 1.6, 0, TAU); }
    ctx.fill();
  }
}

function drawPlayerShadows(ctx: CanvasRenderingContext2D, players: readonly PlayerView[]) {
  ctx.fillStyle = PALETTE.shadow;
  ctx.beginPath();
  for (const p of players) {
    if (p.hidden) continue;
    ctx.moveTo(p.x + PLAYER_SHADOW.x + PLAYER_SHADOW.r, p.y + PLAYER_SHADOW.y);
    ctx.arc(p.x + PLAYER_SHADOW.x, p.y + PLAYER_SHADOW.y, PLAYER_SHADOW.r, 0, TAU);
  }
  ctx.fill();
}

type PlayerLook = { self: boolean; friendly: boolean; flash: number };
const HAND_R = R * 0.27;

function drawPlayer(ctx: CanvasRenderingContext2D, p: PlayerView, color: string, look: PlayerLook) {
  ctx.save();
  ctx.translate(p.x, p.y);
  ctx.globalAlpha = p.hidden ? 0.25 : 1;
  if (look.self) {
    ctx.beginPath();
    ctx.arc(0, 0, R + 9, 0, TAU);
    ctx.lineWidth = 4;
    ctx.strokeStyle = PALETTE.halo;
    ctx.stroke();
  }
  ctx.rotate(p.angle);
  drawGun(ctx, p.gun, R);
  ctx.rotate(-p.angle);
  const band = ARMOR_BAND[p.armorTier];
  ctx.beginPath();
  ctx.arc(0, 0, R, 0, TAU);
  ctx.fillStyle = band ? shade(color, 0.5) : color;
  ctx.fill();
  if (band) {
    ctx.beginPath();
    ctx.arc(0, 0, R - band, 0, TAU);
    ctx.fillStyle = color;
    ctx.fill();
    ctx.beginPath();
    ctx.arc(0, 0, R - band / 2, Math.PI * 0.95, Math.PI * 1.55);
    ctx.lineWidth = Math.max(1.5, band * 0.35);
    ctx.strokeStyle = PALETTE.steelLight;
    ctx.stroke();
  }
  ctx.beginPath();
  ctx.arc(-R * 0.18, -R * 0.2, (R - band) * 0.55, Math.PI * 1.0, Math.PI * 1.5);
  ctx.lineWidth = 4;
  ctx.lineCap = 'round';
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.35)';
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(0, 0, R, 0, TAU);
  ctx.lineWidth = look.self ? 4 : 3;
  ctx.strokeStyle = look.self ? '#ffffff' : INK;
  ctx.stroke();
  if (look.flash > 0) {
    ctx.globalAlpha = look.flash * 0.85;
    ctx.beginPath();
    ctx.arc(0, 0, R, 0, TAU);
    ctx.fillStyle = '#ffffff';
    ctx.fill();
    ctx.globalAlpha = p.hidden ? 0.25 : 1;
  }
  ctx.rotate(p.angle);
  ctx.beginPath();
  for (const [hx, hy] of gripsOf(p.gun)) {
    ctx.moveTo(hx * R + HAND_R, hy * R);
    ctx.arc(hx * R, hy * R, HAND_R, 0, TAU);
  }
  ctx.fillStyle = shade(color, 0.85);
  ctx.fill();
  ctx.lineWidth = 2.5;
  ctx.strokeStyle = INK;
  ctx.stroke();
  ctx.rotate(-p.angle);
  if (look.friendly) {
    ctx.beginPath();
    ctx.moveTo(-11, -R - 26);
    ctx.lineTo(11, -R - 26);
    ctx.lineTo(0, -R - 11);
    ctx.closePath();
    ctx.fillStyle = color;
    ctx.fill();
    ctx.lineWidth = 3;
    ctx.lineJoin = 'round';
    ctx.strokeStyle = '#ffffff';
    ctx.stroke();
  }
  if (p.shield) {
    ctx.beginPath();
    ctx.arc(0, 0, R + 11, p.angle - 1.05, p.angle + 1.05);
    ctx.lineWidth = 7;
    ctx.lineCap = 'round';
    ctx.strokeStyle = PALETTE.shield;
    ctx.stroke();
  }
  ctx.restore();
}

const LABEL = { font: 15, barW: 56, barH: 7 } as const;

function drawLabel(ctx: CanvasRenderingContext2D, p: PlayerView, self: boolean) {
  ctx.font = `${self ? 800 : 650} ${LABEL.font}px system-ui, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  ctx.lineJoin = 'round';
  ctx.lineWidth = 4;
  ctx.strokeStyle = PALETTE.halo;
  ctx.strokeText(p.name, p.x, p.y + R + 24);
  ctx.fillStyle = PALETTE.text;
  ctx.fillText(p.name, p.x, p.y + R + 24);
  const x = p.x - LABEL.barW / 2;
  const y = p.y + R + 31;
  const armored = p.maxArmor > 0;
  ctx.fillStyle = INK;
  ctx.beginPath();
  ctx.roundRect(x - 2, y - 2, LABEL.barW + 4, LABEL.barH + (armored ? 8 : 4), 4);
  ctx.fill();
  const frac = Math.max(0, Math.min(1, p.hp / p.maxHp));
  ctx.fillStyle = frac > 0.35 ? PALETTE.hpGood : PALETTE.hpBad;
  ctx.fillRect(x, y, LABEL.barW * frac, LABEL.barH);
  if (armored) {
    ctx.fillStyle = PALETTE.armor;
    ctx.fillRect(x, y + LABEL.barH + 1, LABEL.barW * Math.max(0, p.armor / p.maxArmor), 3);
  }
}

function drawDamageNumbers(ctx: CanvasRenderingContext2D, numbers: readonly DamageNumber[], now: number) {
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round';
  for (const n of numbers) {
    const k = (now - n.born) / NUMBER_MS;
    if (k < 0 || k >= 1) continue;
    const player = n.kind === 'player';
    ctx.globalAlpha = 1 - k * k;
    ctx.font = `800 ${player ? 26 : 18}px system-ui, sans-serif`;
    const label = String(Math.max(1, Math.round(n.amount)));
    const y = n.y - R - 24 - 46 * k;
    ctx.lineWidth = 5;
    ctx.strokeStyle = INK;
    ctx.strokeText(label, n.x, y);
    ctx.fillStyle = player ? PALETTE.gold : '#f3e2c4';
    ctx.fillText(label, n.x, y);
  }
  ctx.globalAlpha = 1;
}
