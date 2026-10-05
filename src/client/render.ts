import { COLORS, GUNS, WORLD, ZOM, ZOMBIE_KINDS, ZOMBIES } from '../shared/defs.ts';
import { MAPS, CRATE_SIZE } from '../shared/maps.ts';
import type { BulletView, PlayerView, RunView, Snapshot, ThrownView, ZoneView } from '../shared/protocol.ts';
import { BLAST_RADIUS } from '../shared/sim/abilities.ts';
import { screenToWorld, type Camera, type Point } from './camera.ts';
import { drawCasings, drawEffects, drawParticles, HIT_FLASH_MS, hitFlashes, kicks, KICK_MS } from './effects.ts';
import { NUMBER_MS, numberHeight, type DamageNumber } from './feedback.ts';
import { ARMOR_BAND, INK, NIGHT, PALETTE, TEAM_COLORS, teamColor, tint } from './palette.ts';
import { serverNow } from './interp.ts';
import { drawCoreGlow, drawCoreTop, drawDowned, drawGhost, drawSiegeTops, drawZombies, faceZombies, wallFlashes } from './siege.ts';
import { drawContactShadows, drawSphere, sphereSprite } from './spheres.ts';
import { drawGun } from './sprites.ts';
import type { Session } from './state.ts';
import { buildingSolid, coreSolid, crateSolid, createShadowCache, curbSolids, drawCrateShadows, drawShadowLayer, drawSolids, faceDepth, wallSolids, type Solid } from './tilt.ts';
import type { Ghost } from './zombies.ts';

const TAU = Math.PI * 2;
const R = WORLD.playerRadius;
const GRID = 32;
const MAJOR_EVERY = 5;
const CULL_MARGIN = 80;
export const TRACER = { tail: 0.05, core: 0.018 } as const;

export const bodyColor = (p: Pick<PlayerView, 'color' | 'team'>): string => (p.team ? TEAM_COLORS[p.team] : COLORS[p.color]);

type Frame = { snap: Snapshot; s: Session; cam: Camera; dpr: number; now: number; selfAngle: number | null; killerId: number | null; ghost?: Ghost | null };
type View = { x0: number; y0: number; x1: number; y1: number };

const inView = (v: View, x: number, y: number, w: number, h: number) => x + w >= v.x0 && x <= v.x1 && y + h >= v.y0 && y <= v.y1;
const solidInView = (v: View, s: Solid) => inView(v, s.x, s.y, s.w, s.h + faceDepth(s.kind));

const shadows = createShadowCache();
export const shadowBakes = shadows.bakes;

/** How far into night the world is drawn, eased so dusk and dawn take a moment rather than a frame. */
let night = 0;
let nightAt = 0;
const NIGHT_FADE_MS = 1500;

function easeNight(run: RunView | undefined, now: number): number {
  const target = run?.phase === 'night' ? 1 : 0;
  const step = Math.min(1, Math.max(0, now - nightAt) / NIGHT_FADE_MS);
  nightAt = now;
  night = night < target ? Math.min(target, night + step) : Math.max(target, night - step);
  return night;
}

export function drawWorld(ctx: CanvasRenderingContext2D, f: Frame) {
  const { cam, dpr, snap, s, now } = f;
  const k = dpr * cam.scale;
  ctx.setTransform(k, 0, 0, k, dpr * (cam.w / 2 - cam.x * cam.scale), dpr * (cam.h / 2 - cam.y * cam.scale));
  const tl = screenToWorld(cam, { x: 0, y: 0 });
  const br = screenToWorld(cam, { x: cam.w, y: cam.h });
  const view: View = { x0: tl.x - CULL_MARGIN, y0: tl.y - CULL_MARGIN, x1: br.x + CULL_MARGIN, y1: br.y + CULL_MARGIN };
  const dark = easeNight(snap.run, now);
  drawGround(ctx, s.worldSize, tl, br);

  const mine = snap.players.find((p) => p.id === s.myId);
  const myTeam = mine?.team ?? null;
  // The squad shares one team, so each squadmate wears their own color instead.
  const colorOf = (p: PlayerView) => (snap.run ? COLORS[p.color] : bodyColor(p));
  for (const [i, z] of snap.zones.entries()) drawZone(ctx, z, i);
  for (const t of snap.thrown) if (t.kind === 'landMine') drawThrown(ctx, t, now);
  if (snap.run) drawCoreGlow(ctx, snap.run, now);

  const siege = snap.run ? [...(snap.buildings ?? []).map(buildingSolid), coreSolid(snap.run)] : [];
  const layer = shadows.get(s.walls, s.worldSize, () => [...curbSolids(s.worldSize), ...wallSolids(s.walls)], siege);
  drawShadowLayer(ctx, layer, view.x0, view.y0, view.x1, view.y1);
  const crates = snap.crates.map(crateSolid).filter((c) => solidInView(view, c));
  drawCrateShadows(ctx, crates);
  drawCasings(ctx, s.particles, now);

  const alive = snap.players.filter((p) => p.alive && inView(view, p.x - R * 3, p.y - R * 3, R * 6, R * 6));
  const downed = snap.players.filter((p) => p.downed && inView(view, p.x - R * 3, p.y - R * 3, R * 6, R * 6));
  const zombies = snap.zombies ?? [];
  drawContactShadows(ctx, [
    ...alive.filter((p) => !p.hidden).map((p) => ({ x: p.x, y: p.y, r: R })),
    ...zombies.map(([, kind, x, y]) => ({ x, y, r: ZOMBIES[ZOMBIE_KINDS[kind]].radius })),
  ], k);

  const walls = wallSolids(s.walls).filter((w) => solidInView(view, w));
  const standing = siege.filter((b) => solidInView(view, b));
  drawSolids(ctx, [...curbSolids(s.worldSize).filter((c) => solidInView(view, c)), ...walls, ...standing, ...crates]);
  if (snap.buildings && snap.run) {
    drawSiegeTops(ctx, snap.buildings.filter((b) => inView(view, b.cx * ZOM.cell, b.cy * ZOM.cell, ZOM.cell, ZOM.cell)), wallFlashes(s.effects, now), s.turretAims, snap.run.core, now, k);
  }
  if (snap.run) drawCoreTop(ctx, snap.run, now, s.coreHitAt);
  if (dark > 0) drawNight(ctx, tl, br, dark);

  for (const p of snap.players) drawTrail(ctx, colorOf(p), s.trails.get(p.id), now);
  drawTracers(ctx, snap.bullets, s.myId);

  const flashes = hitFlashes(s.effects, now);
  if (zombies.length) {
    faceZombies(s.zombieFaces, zombies, snap.run?.core ?? s.lastSelf);
    drawZombies(ctx, zombies, s.zombieFaces, flashes, now, k);
  }
  for (const p of downed) drawDowned(ctx, p, colorOf(p), serverNow(s.snaps, now), p.id === s.myId);
  const recoil = kicks(s.effects, now);
  for (const p of alive) {
    const self = p.id === s.myId;
    const angle = self && f.selfAngle !== null ? f.selfAngle : p.angle;
    const flash = flashes.get(p.id);
    const kick = recoil.get(p.id);
    drawPlayer(ctx, { ...p, angle }, colorOf(p), {
      self, friendly: !self && p.team !== null && p.team === myTeam, rival: !self && p.team === null && p.color === mine?.color,
      flash: flash === undefined ? 0 : 1 - (now - flash) / HIT_FLASH_MS, kick: kick === undefined ? 0 : 1 - (now - kick) / KICK_MS, now, pxPerUnit: k,
    });
  }
  for (const t of snap.thrown) if (t.kind !== 'landMine' && t.kind !== 'gasCloud') drawThrown(ctx, t, now);
  for (const t of snap.thrown) if (t.kind === 'gasCloud') drawThrown(ctx, t, now);
  drawEffects(ctx, s.effects, now);
  drawParticles(ctx, s.particles, now);
  for (const p of [...downed, ...alive]) if (!p.hidden) drawLabel(ctx, p, p.id === s.myId, dark);
  if (f.ghost && snap.run) drawGhost(ctx, f.ghost, s.lastSelf, snap.run.core, now, k);
  const killer = f.killerId === null ? undefined : alive.find((p) => p.id === f.killerId);
  if (killer) drawKillerMark(ctx, killer, now);
  drawDamageNumbers(ctx, s.feedback.numbers, now);
  drawLetterbox(ctx, cam, dpr);
}

/** The world under night: a cool blue laid over the floor and cover, so they sink while the bodies and fire drawn after stay bright. A plain blend, since a multiply costs a software canvas over a millisecond a frame. */
function drawNight(ctx: CanvasRenderingContext2D, tl: Point, br: Point, dark: number) {
  ctx.globalAlpha = dark * NIGHT.alpha;
  ctx.fillStyle = NIGHT.shade;
  ctx.fillRect(tl.x, tl.y, br.x - tl.x, br.y - tl.y);
  ctx.globalAlpha = 1;
}

const BACKDROP = { zoom: 0.75, swayMs: 40_000, fill: 0.85 } as const;
const BACKDROP_MAP = MAPS.boneyard;
const backdropSolids: Solid[] = [
  ...curbSolids(WORLD.size),
  ...BACKDROP_MAP.walls.map((w): Solid => ({ kind: 'concrete', ...w })),
];
const backdropCrates: Solid[] = BACKDROP_MAP.crates.map((c) => ({ kind: 'crate', x: c.x - CRATE_SIZE / 2, y: c.y - CRATE_SIZE / 2, w: CRATE_SIZE, h: CRATE_SIZE }));

export function drawBackdrop(ctx: CanvasRenderingContext2D, w: number, h: number, dpr: number, now: number) {
  const zoom = Math.max(BACKDROP.zoom, w / (WORLD.size * BACKDROP.fill), h / (WORLD.size * BACKDROP.fill));
  const viewW = w / zoom, viewH = h / zoom;
  const freeX = WORLD.size - viewW, freeY = WORLD.size - viewH;
  const x = freeX / 2 + (freeX / 2) * Math.sin(now / BACKDROP.swayMs);
  const y = freeY / 2 + (freeY / 2) * 0.5 * Math.cos(now / BACKDROP.swayMs);
  const k = dpr * zoom;
  ctx.setTransform(k, 0, 0, k, -x * k, -y * k);
  drawFloor(ctx, WORLD.size, { x, y }, { x: x + viewW, y: y + viewH });
  drawShadowLayer(ctx, shadows.get(BACKDROP_MAP, WORLD.size, () => backdropSolids, []), x, y, x + viewW, y + viewH);
  drawCrateShadows(ctx, backdropCrates);
  drawSolids(ctx, [...backdropSolids, ...backdropCrates]);
}

function drawLetterbox(ctx: CanvasRenderingContext2D, cam: Camera, dpr: number) {
  const barW = cam.w / 2 - cam.viewHalfW * cam.scale, barH = cam.h / 2 - cam.viewHalfH * cam.scale;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.fillStyle = PALETTE.letterbox;
  if (barW >= 1) { ctx.fillRect(0, 0, barW, cam.h); ctx.fillRect(cam.w - barW, 0, barW, cam.h); }
  if (barH >= 1) { ctx.fillRect(0, 0, cam.w, barH); ctx.fillRect(0, cam.h - barH, cam.w, barH); }
}

function drawGround(ctx: CanvasRenderingContext2D, size: number, tl: Point, br: Point) {
  ctx.fillStyle = PALETTE.outside;
  ctx.fillRect(tl.x, tl.y, br.x - tl.x, br.y - tl.y);
  drawFloor(ctx, size, tl, br);
}

/** Thin fillRects rather than stroked paths, which keep the rasterizer on its fast path. */
function drawFloor(ctx: CanvasRenderingContext2D, size: number, tl: Point, br: Point) {
  const x0 = Math.max(0, tl.x), x1 = Math.min(size, br.x), y0 = Math.max(0, tl.y), y1 = Math.min(size, br.y);
  if (x1 <= x0 || y1 <= y0) return;
  ctx.fillStyle = PALETTE.floor;
  ctx.fillRect(x0, y0, x1 - x0, y1 - y0);
  for (const major of [false, true]) {
    ctx.fillStyle = major ? PALETTE.gridMajor : PALETTE.gridMinor;
    const step = major ? GRID * MAJOR_EVERY : GRID;
    for (let x = Math.ceil(x0 / step) * step; x <= x1; x += step) if (major || x % (GRID * MAJOR_EVERY)) ctx.fillRect(x - 0.5, y0, 1, y1 - y0);
    for (let y = Math.ceil(y0 / step) * step; y <= y1; y += step) if (major || y % (GRID * MAJOR_EVERY)) ctx.fillRect(x0, y - 0.5, x1 - x0, 1);
  }
}

function drawZone(ctx: CanvasRenderingContext2D, z: ZoneView, index: number) {
  const color = teamColor(z.owner);
  ctx.beginPath();
  ctx.arc(z.x, z.y, z.r, 0, TAU);
  ctx.fillStyle = color;
  ctx.globalAlpha = 0.1;
  ctx.fill();
  ctx.globalAlpha = 0.6;
  ctx.lineWidth = 4;
  ctx.strokeStyle = color;
  ctx.stroke();
  ctx.setLineDash([3, 18]);
  ctx.lineCap = 'round';
  ctx.lineWidth = 6;
  ctx.globalAlpha = 0.35;
  ctx.beginPath();
  ctx.arc(z.x, z.y, z.r - 14, 0, TAU);
  ctx.stroke();
  ctx.setLineDash([]);
  const progress = Math.min(1, Math.abs(z.progress));
  if (progress > 0) {
    ctx.globalAlpha = 0.9;
    ctx.lineWidth = 8;
    ctx.lineCap = 'butt';
    ctx.strokeStyle = teamColor(z.capturing ?? z.owner);
    ctx.beginPath();
    ctx.arc(z.x, z.y, z.r - 14, -Math.PI / 2, -Math.PI / 2 + progress * TAU);
    ctx.stroke();
  }
  ctx.globalAlpha = 0.88;
  ctx.beginPath();
  ctx.roundRect(z.x - 28, z.y - 28, 56, 56, 12);
  ctx.fillStyle = 'rgba(28, 32, 40, 0.82)';
  ctx.fill();
  ctx.lineWidth = 3;
  ctx.strokeStyle = color;
  ctx.stroke();
  ctx.globalAlpha = 1;
  ctx.fillStyle = '#ffffff';
  ctx.font = '800 30px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(String.fromCharCode(65 + index), z.x, z.y + 2);
}

function drawThrown(ctx: CanvasRenderingContext2D, t: ThrownView, now: number) {
  switch (t.kind) {
    case 'gasCloud': return drawGas(ctx, t, now);
    case 'landMine': {
      ctx.fillStyle = PALETTE.contact;
      ctx.beginPath();
      ctx.arc(t.x + 3, t.y + 4, 14, 0, TAU);
      ctx.fill();
      const body = ctx.createRadialGradient(t.x - 4, t.y - 5, 1, t.x, t.y, 13);
      body.addColorStop(0, '#8a919d');
      body.addColorStop(1, '#2c313b');
      ctx.fillStyle = body;
      ctx.beginPath();
      ctx.arc(t.x, t.y, 13, 0, TAU);
      ctx.fill();
      const on = Math.floor(now / 400) % 2;
      ctx.beginPath();
      ctx.arc(t.x, t.y, on ? 7 : 5, 0, TAU);
      ctx.fillStyle = on ? 'rgba(255, 77, 79, 0.35)' : 'rgba(0, 0, 0, 0)';
      ctx.fill();
      ctx.beginPath();
      ctx.arc(t.x, t.y, 4, 0, TAU);
      ctx.fillStyle = on ? '#ff4d4f' : '#7a1f21';
      ctx.fill();
      return;
    }
    case 'grenade':
    case 'fragGrenade':
    case 'gasGrenade': {
      if (t.kind !== 'gasGrenade') drawBlastRing(ctx, t.x, t.y, BLAST_RADIUS[t.kind], now);
      const band = t.kind === 'gasGrenade' ? '#7bb33a' : t.kind === 'fragGrenade' ? '#e07a22' : '#c7c9cc';
      ctx.fillStyle = PALETTE.contact;
      ctx.beginPath();
      ctx.arc(t.x + 5, t.y + 6, 11, 0, TAU);
      ctx.fill();
      if (t.kind === 'fragGrenade') {
        ctx.fillStyle = INK;
        for (let i = 0; i < 8; i++) {
          const a = (i / 8) * TAU + now / 300;
          ctx.fillRect(t.x + Math.cos(a) * 13 - 2, t.y + Math.sin(a) * 13 - 2, 4, 4);
        }
      }
      const body = ctx.createRadialGradient(t.x - 4, t.y - 4, 1, t.x, t.y, 11);
      body.addColorStop(0, '#7d8592');
      body.addColorStop(1, '#262a31');
      ctx.fillStyle = body;
      ctx.beginPath();
      ctx.arc(t.x, t.y, 11, 0, TAU);
      ctx.fill();
      ctx.fillStyle = band;
      ctx.fillRect(t.x - 10.5, t.y - 2.5, 21, 5);
      ctx.fillStyle = 'rgba(255,255,255,0.45)';
      ctx.beginPath();
      ctx.arc(t.x - 4, t.y - 4, 2.5, 0, TAU);
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
    ctx.globalAlpha = 0.3 * (1 - age);
    ctx.beginPath();
    ctx.arc(pt.x, pt.y, R * (1 - age * 0.4), 0, TAU);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

export const TRAIL_MS = 260;

type TracerLook = { r: number; glow: string; core: string };

/**
 * Every round is a glowing tracer: class guns and shrapnel in warm gold, a touch whiter for your own, and an evolved gun's in
 * its own hue. The guns' hues are dark, chosen for ink on a pale floor, so the glow and core are lifted toward white.
 */
function tracerLook(b: BulletView, myId: number): TracerLook {
  if (b.gun && GUNS[b.gun].stage > 0) {
    const { r, color } = GUNS[b.gun].look.bullet;
    return { r, glow: tint(color, 0.35), core: tint(color, 0.75) };
  }
  return { r: 1.6, glow: PALETTE.tracer, core: b.owner === myId ? PALETTE.ownTracer : PALETTE.tracerCore };
}

/** The tail's passes from its far end in: [from, to] as shares of `TRACER.tail` behind the head, then width in radii, alpha and which color. */
const TRACER_PASSES = [
  [1, 0, 4.5, 0.18, 'glow'],
  [1, 0.55, 1.3, 0.3, 'glow'],
  [0.55, 0, 1.8, 0.7, 'core'],
  [TRACER.core / TRACER.tail, 0, 2.4, 1, 'core'],
] as const;

/** Each look's passes are one path apiece, so the tail fades from a faint glow to a bright core, then a white-hot head on every round. */
function drawTracers(ctx: CanvasRenderingContext2D, bullets: readonly BulletView[], myId: number) {
  ctx.lineCap = 'round';
  const groups = new Map<string, { look: TracerLook; bullets: BulletView[] }>();
  for (const b of bullets) {
    const look = tracerLook(b, myId);
    const key = `${look.glow}|${look.core}|${look.r}`;
    const group = groups.get(key);
    if (group) group.bullets.push(b);
    else groups.set(key, { look, bullets: [b] });
  }
  for (const { look, bullets: group } of groups.values()) {
    for (const [from, to, width, alpha, color] of TRACER_PASSES) {
      ctx.globalAlpha = alpha;
      ctx.strokeStyle = look[color];
      ctx.lineWidth = look.r * width;
      ctx.beginPath();
      for (const b of group) {
        const far = TRACER.tail * from, near = TRACER.tail * to;
        ctx.moveTo(b.x - b.vx * far, b.y - b.vy * far);
        ctx.lineTo(b.x - b.vx * near, b.y - b.vy * near);
      }
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
    ctx.fillStyle = PALETTE.tracerHead;
    ctx.beginPath();
    for (const b of group) { ctx.moveTo(b.x + look.r * 1.2, b.y); ctx.arc(b.x, b.y, look.r * 1.2, 0, TAU); }
    ctx.fill();
  }
}

/** `rival` marks a free-for-all enemy wearing your color, so it never reads as you. `kick` is how much of the last shot's recoil is left. */
type PlayerLook = { self: boolean; friendly: boolean; rival: boolean; flash: number; kick: number; now: number; pxPerUnit: number };
const TIER_COLORS = { 1: '#d8dee9', 2: PALETTE.gold } as const;
const RECOIL = R * 0.22;

/** The name sits this far above a body's center, its health bar between; markers stack above the name. */
const LABEL = { font: 13, name: R + 18, bar: R + 11, barW: 48, barH: 5 } as const;
const MARK_BASE = -LABEL.name - 16;

function drawTierMark(ctx: CanvasRenderingContext2D, stage: 1 | 2, top: number) {
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  for (const [width, color] of [[7, 'rgba(28, 31, 38, 0.75)'], [3.5, TIER_COLORS[stage]]] as const) {
    ctx.lineWidth = width;
    ctx.strokeStyle = color;
    ctx.beginPath();
    for (let i = 0; i < stage; i++) {
      const y = top - i * 9;
      ctx.moveTo(-10, y);
      ctx.lineTo(0, y - 7);
      ctx.lineTo(10, y);
    }
    ctx.stroke();
  }
}

function drawHuntedMark(ctx: CanvasRenderingContext2D, now: number) {
  const pulse = 0.5 + 0.5 * Math.sin(now / 150);
  const r = R + 13 + 3 * pulse;
  const spin = now / 900;
  ctx.lineCap = 'round';
  for (const [width, color, alpha] of [[7, 'rgba(120, 10, 10, 0.35)', 1], [3.5, PALETTE.hunted, 0.7 + 0.3 * pulse]] as const) {
    ctx.globalAlpha = alpha;
    ctx.lineWidth = width;
    ctx.strokeStyle = color;
    ctx.beginPath();
    for (let i = 0; i < 4; i++) {
      const a = spin + (i * Math.PI) / 2;
      ctx.moveTo(Math.cos(a - 0.45) * r, Math.sin(a - 0.45) * r);
      ctx.arc(0, 0, r, a - 0.45, a + 0.45);
      ctx.moveTo(Math.cos(a) * (r - 6), Math.sin(a) * (r - 6));
      ctx.lineTo(Math.cos(a) * (r + 6), Math.sin(a) * (r + 6));
    }
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
}

function drawPlayer(ctx: CanvasRenderingContext2D, p: PlayerView, color: string, look: PlayerLook) {
  const alpha = p.hidden ? 0.25 : 1;
  ctx.save();
  ctx.translate(p.x, p.y);
  ctx.globalAlpha = alpha;
  if (look.self) {
    ctx.beginPath();
    ctx.arc(0, 0, R + 6 + Math.sin(look.now / 300), 0, TAU);
    ctx.lineWidth = 3.5;
    ctx.strokeStyle = PALETTE.selfRing;
    ctx.stroke();
  }
  if (look.rival) {
    ctx.beginPath();
    ctx.arc(0, 0, R + 6, 0, TAU);
    ctx.lineWidth = 3.5;
    ctx.strokeStyle = PALETTE.rival;
    ctx.stroke();
  }
  ctx.rotate(p.angle);
  ctx.translate(-RECOIL * Math.max(0, look.kick), 0);
  drawGun(ctx, p.gun, R);
  ctx.translate(RECOIL * Math.max(0, look.kick), 0);
  ctx.rotate(-p.angle);
  drawSphere(ctx, sphereSprite(color, R, ARMOR_BAND[p.armorTier], look.pxPerUnit), 0, 0, R);
  if (look.flash > 0) {
    ctx.globalAlpha = look.flash * 0.8 * alpha;
    ctx.beginPath();
    ctx.arc(0, 0, R, 0, TAU);
    ctx.fillStyle = '#ffffff';
    ctx.fill();
    ctx.globalAlpha = alpha;
  }
  const { stage } = GUNS[p.gun];
  if (p.hunted && !look.self) drawHuntedMark(ctx, look.now);
  ctx.globalAlpha = alpha;
  if (look.friendly) {
    ctx.beginPath();
    ctx.moveTo(-8, MARK_BASE - 11);
    ctx.lineTo(8, MARK_BASE - 11);
    ctx.lineTo(0, MARK_BASE);
    ctx.closePath();
    ctx.fillStyle = color;
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.lineJoin = 'round';
    ctx.strokeStyle = '#ffffff';
    ctx.stroke();
  }
  if (stage !== 0) drawTierMark(ctx, stage, look.friendly ? MARK_BASE - 16 : MARK_BASE);
  if (p.shield) {
    ctx.beginPath();
    ctx.arc(0, 0, R + 10, p.angle - 1.05, p.angle + 1.05);
    ctx.lineWidth = 6;
    ctx.lineCap = 'round';
    ctx.strokeStyle = PALETTE.shield;
    ctx.stroke();
  }
  ctx.restore();
}

function drawKillerMark(ctx: CanvasRenderingContext2D, p: PlayerView, now: number) {
  const pulse = 0.5 + 0.5 * Math.sin(now / 160);
  ctx.globalAlpha = 0.7 + 0.3 * pulse;
  ctx.beginPath();
  ctx.arc(p.x, p.y, R + 14 + 3 * pulse, 0, TAU);
  ctx.lineWidth = 3.5;
  ctx.strokeStyle = PALETTE.hunted;
  ctx.stroke();
  ctx.globalAlpha = 1;
  ctx.font = '800 13px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const y = p.y + MARK_BASE - (GUNS[p.gun].stage ? 30 : 10);
  const w = ctx.measureText('KILLER').width + 14;
  ctx.fillStyle = PALETTE.hunted;
  ctx.beginPath();
  ctx.roundRect(p.x - w / 2, y - 10, w, 20, 6);
  ctx.fill();
  ctx.fillStyle = '#ffffff';
  ctx.fillText('KILLER', p.x, y + 1);
}

function drawLabel(ctx: CanvasRenderingContext2D, p: PlayerView, self: boolean, dark: number) {
  ctx.font = `${self ? 750 : 600} ${LABEL.font}px system-ui, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = dark > 0.5 ? NIGHT.label : PALETTE.label;
  ctx.fillText(p.name, p.x, p.y - LABEL.name);
  const x = p.x - LABEL.barW / 2;
  const y = p.y - LABEL.bar - LABEL.barH;
  const armored = p.maxArmor > 0;
  ctx.fillStyle = dark > 0.5 ? 'rgba(230, 235, 245, 0.25)' : 'rgba(40, 44, 52, 0.22)';
  ctx.beginPath();
  ctx.roundRect(x, y, LABEL.barW, LABEL.barH + (armored ? 3 : 0), 2.5);
  ctx.fill();
  const frac = Math.max(0, Math.min(1, p.hp / p.maxHp));
  ctx.fillStyle = frac > 0.35 ? PALETTE.hpGood : PALETTE.hpBad;
  ctx.beginPath();
  ctx.roundRect(x, y, Math.max(LABEL.barH, LABEL.barW * frac), LABEL.barH, 2.5);
  ctx.fill();
  if (armored) {
    ctx.fillStyle = PALETTE.armor;
    ctx.fillRect(x + 1, y + LABEL.barH + 0.5, (LABEL.barW - 2) * Math.max(0, p.armor / p.maxArmor), 2);
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
    ctx.font = `800 ${player ? 24 : 17}px system-ui, sans-serif`;
    const label = String(Math.max(1, Math.round(n.amount)));
    const y = n.y + MARK_BASE - 8 - numberHeight(n, now);
    ctx.lineWidth = 4;
    ctx.strokeStyle = 'rgba(28, 31, 38, 0.85)';
    ctx.strokeText(label, n.x, y);
    ctx.fillStyle = player ? PALETTE.gold : '#fff3dc';
    ctx.fillText(label, n.x, y);
  }
  ctx.globalAlpha = 1;
}
