import { COLORS, GUNS, ROYALE, WORLD, ZOM, ZOMBIE_KINDS, ZOMBIES } from '../shared/defs.ts';
import { MAPS, CRATE_SIZE } from '../shared/maps.ts';
import type { BulletView, PlayerView, RunView, Snapshot, ThrownView, WallView, ZoneView } from '../shared/protocol.ts';
import { BLAST_RADIUS } from '../shared/sim/abilities.ts';
import { screenToWorld, type Camera, type Point } from './camera.ts';
import { drawCasings, drawEffects, drawParticles, HIT_FLASH_MS, hitFlashes, kicks, KICK_MS } from './effects.ts';
import { drawJuice } from './killfx.ts';
import { glow, INK, NIGHT, PALETTE, TEAM_COLORS, teamColor } from './palette.ts';
import { serverNow } from './interp.ts';
import { drawCoreGlow, drawCoreTop, drawDowned, drawGhost, drawSiegeTops, drawZombies, wallFlashes } from './siege.ts';
import { drawSiegeFx } from './siegefx.ts';
import { drawBodyShadows, drawSoldier, gaitAmount, stepGait, type Gait } from './bodies.ts';
import { drawBarrels, drawArenaLight, drawBeacon, drawGoldShine, drawParachute, drawPlaneShadow } from './arenafx.ts';
import { drawHeldGun, heldHands, muzzleTip } from './gunart.ts';
import { drawEmoteBubbles, drawEmoteGestures, partyOn } from './emotefx.ts';
import { reducedMotion } from './screenfx.ts';
import { fillIcon, UI_ICONS } from './icons.ts';
import { careerImage } from './medals.ts';
import type { Session } from './state.ts';
import { buildingSolid, coreSolid, crateSolid, createGroundCache, curbSolids, drawGround, drawLooseShadows, drawSolids, FOOT, LIP, wallSolids, type Solid } from './tilt.ts';
import { drawDust, drawNight, drawVignette, nightLights } from './ambience.ts';
import { floorPlanOf } from './floor.ts';
import type { Ghost } from './zombies.ts';
import { trailDashes, type TrailPoint } from './trails.ts';
import { TRACER } from './rounds.ts';
import { heftOf } from './shake.ts';
import { drawCorpses, drawZombieCorpses, liveCorpses, zombieField } from './corpses.ts';
import { drawFloor as drawGunFloor, drawTop as drawGunTop, gunFxOf, noteMap as noteGunMap } from './gunfx.ts';
import { drawDropsWorld, drawRingWorld } from './royale.ts';
import { drawBlastFx, drawBlastRing, drawDashTrails, drawGasCloud, drawScorches, drawThrownBody } from './blastdraw.ts';
import { trackDash } from './blastfx.ts';
import { applyPose, bodyPose, drawGunGlints, drawMotionAbove, drawMotionBelow, drawShieldShimmer, noteStride, observeMotion } from './motionfx.ts';

const TAU = Math.PI * 2;
const R = WORLD.playerRadius;
const GRID = 80;
const CULL_MARGIN = 80;

export const bodyColor = (p: Pick<PlayerView, 'color' | 'team'>): string => (p.team ? TEAM_COLORS[p.team] : COLORS[p.color]);

type Frame = { snap: Snapshot; s: Session; cam: Camera; dpr: number; now: number; /** The real clock, for juice that keeps moving through a hit-stop. */ fxNow?: number; selfAngle: number | null; killerId: number | null; ghost?: Ghost | null };
type View = { x0: number; y0: number; x1: number; y1: number };

const inView = (v: View, x: number, y: number, w: number, h: number) => x + w >= v.x0 && x <= v.x1 && y + h >= v.y0 && y <= v.y1;
const solidInView = (v: View, s: Solid) => inView(v, s.x, s.y, s.w + LIP, s.h + LIP + FOOT);

const ground = createGroundCache();
const mapWallKeys = new WeakMap<readonly WallView[], string>();
export function mapWallsKey(walls: readonly WallView[]): string {
  let key = mapWallKeys.get(walls);
  if (key === undefined) mapWallKeys.set(walls, (key = walls.flatMap((w) => (w.built ? [] : [`${w.material}${w.x},${w.y},${w.w},${w.h}`])).join('|')));
  return key;
}
export const shadowBakes = ground.bakes;

let night = 0;
let nightAt = 0;
const NIGHT_FADE_MS = 1500;

export const nightAmount = () => night;

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
  const siege = snap.run ? [...(snap.buildings ?? []).map(buildingSolid), coreSolid(snap.run)] : 'static';
  drawGround(ctx, ground.get(mapWallsKey(s.walls), s.worldSize, () => [...curbSolids(s.worldSize), ...wallSolids(s.walls.filter((w) => !w.built))], siege, floorPlanOf(snap.match.map)), view.x0, view.y0, view.x1, view.y1);

  const mine = snap.players.find((p) => p.id === s.myId);
  // The squad shares one team, so each squadmate wears their own color instead.
  const colorOf = (p: PlayerView) => (snap.run ? COLORS[p.color] : bodyColor(p));
  for (const [i, z] of snap.zones.entries()) drawZone(ctx, z, i);
  for (const t of snap.thrown) if (t.kind === 'landMine') drawThrown(ctx, t, now);
  if (snap.run) drawCoreGlow(ctx, snap.run, now);
  drawTrails(ctx, s.trails, now);
  drawScorches(ctx, now, view);

  const crates = snap.crates.map(crateSolid).filter((c) => solidInView(view, c));
  drawLooseShadows(ctx, [...crates, ...wallSolids(s.walls.filter((w) => w.built)).filter((w) => solidInView(view, w))]);
  drawCasings(ctx, s.particles, now);
  observeMotion(snap, s.myId, now, colorOf);

  const alive = snap.players.filter((p) => p.alive && inView(view, p.x - R * 3, p.y - R * 3, R * 6, R * 6));
  const downed = snap.players.filter((p) => p.downed && inView(view, p.x - R * 3, p.y - R * 3, R * 6, R * 6));
  const zombies = snap.zombies ?? [];
  drawBodyShadows(ctx, [
    ...alive.filter((p) => !p.hidden).map((p) => ({ x: p.x, y: p.y, r: R })),
    ...zombies.map(([, kind, x, y]) => ({ x, y, r: ZOMBIES[ZOMBIE_KINDS[kind]].radius })),
  ], k);

  const walls = wallSolids(s.walls).filter((w) => solidInView(view, w));
  const standing = (siege === 'static' ? [] : siege).filter((b) => solidInView(view, b));
  drawSolids(ctx, [...curbSolids(s.worldSize).filter((c) => solidInView(view, c)), ...walls, ...standing, ...crates]);
  const airClock = snap.airdrop ? serverNow(s.snaps, now) : null;
  drawBarrels(ctx, snap, now, view);
  drawBeacon(ctx, snap.airdrop, airClock, now, view);
  drawPlaneShadow(ctx, snap.airdrop, airClock, view);
  if (snap.buildings && snap.run) {
    drawSiegeTops(ctx, snap.buildings.filter((b) => inView(view, b.cx * ZOM.cell, b.cy * ZOM.cell, ZOM.cell, ZOM.cell)), wallFlashes(s.effects, now), s.turretAims, snap.run.core, now, k);
  }
  if (snap.run) drawCoreTop(ctx, snap.run, now, s.coreHitAt, k);
  noteGunMap(gunFxOf(s), snap.match.map);
  drawGunFloor(ctx, gunFxOf(s), now, view);
  s.corpses = liveCorpses(s.corpses, snap.match.map, now);
  drawCorpses(ctx, s.corpses.filter((c) => inView(view, c.x - R * 3, c.y - R * 3, R * 6, R * 6)), now, k);
  if (dark > 0) drawNight(ctx, tl, br, dark, nightLights(snap, s.myId, f.selfAngle));
  drawDust(ctx, tl, br, now, dark);
  drawVignette(ctx, cam.w, cam.h, dpr, 0.36 + 0.2 * dark);
  ctx.setTransform(k, 0, 0, k, dpr * (cam.w / 2 - cam.x * cam.scale), dpr * (cam.h / 2 - cam.y * cam.scale));
  const clockNow = snap.royale ? serverNow(s.snaps, now) : null;
  if (snap.royale && clockNow !== null) {
    drawRingWorld(ctx, snap.royale, clockNow, tl, br);
    drawDropsWorld(ctx, snap.royale, clockNow, now, ROYALE.dropSize);
  }
  // Tonight's dead lie over the night shade, so the horde's toll stays readable in the dark.
  const field = zombieField(s.zombieCorpses, snap.run?.phase === 'night', now);
  s.zombieCorpses = { list: field.list, dawnAt: field.dawnAt };
  drawZombieCorpses(ctx, field.list.filter((c) => inView(view, c.x - R * 4, c.y - R * 4, R * 8, R * 8)), field.alpha, now);

  drawRounds(ctx, snap.bullets, dark > 0.5);

  const flashes = hitFlashes(s.effects, now);
  if (zombies.length) {
    drawZombies(ctx, zombies, snap, flashes, now, k);
  }
  for (const p of downed) drawDowned(ctx, p, colorOf(p), serverNow(s.snaps, now), p.id === s.myId, now, k);
  drawGunGlints(ctx, s.corpses, now, (x, y) => inView(view, x - R, y - R, R * 2, R * 2));
  drawMotionBelow(ctx, now);
  const tags = bodyTags(alive, s, now);
  drawNamesUnderBodies(ctx, tags, dark);
  const recoil = kicks(s.effects, now);
  trackDash(snap.players, now);
  drawDashTrails(ctx, (id) => { const p = snap.players.find((q) => q.id === id); return p ? colorOf(p) : null; }, now, view);
  for (const p of alive) {
    const self = p.id === s.myId;
    const angle = self && f.selfAngle !== null ? f.selfAngle : p.angle;
    const flash = flashes.get(p.id);
    const kick = recoil.get(p.id);
    drawPlayer(ctx, { ...p, angle }, colorOf(p), {
      self, rival: !self && p.team === null && p.color === mine?.color,
      flash: flash === undefined ? 0 : 1 - (now - flash) / HIT_FLASH_MS, kick: kick === undefined ? 0 : 1 - (now - kick) / KICK_MS, now, pxPerUnit: k,
    });
    if (p.golden) drawGoldShine(ctx, p.x, p.y, muzzleTip(p.x, p.y, angle, p.gun, R), p.id, now);
  }
  drawEmoteGestures(ctx, alive, colorOf, now, partyOn() ? s.myId : null, reducedMotion());
  for (const t of snap.thrown) if (t.kind !== 'landMine' && t.kind !== 'gasCloud') drawThrown(ctx, t, now);
  for (const t of snap.thrown) if (t.kind === 'gasCloud') drawThrown(ctx, t, now);
  drawEffects(ctx, s.effects.filter((e) => e.kind !== 'flash' && e.kind !== 'boom' && e.kind !== 'slash'), now);
  drawBlastFx(ctx, now, view);
  drawArenaLight(ctx, snap, now, view);
  drawParachute(ctx, snap.airdrop, airClock, now, view);
  drawParticles(ctx, s.particles, now);
  drawMotionAbove(ctx, now);
  drawSiegeFx(ctx, snap, view, now, dark, k, s.coreHitAt);
  drawGunTop(ctx, gunFxOf(s), now, view);
  drawBars(ctx, tags, dark);
  drawEmoteBubbles(ctx, alive, now, dark);
  if (f.ghost && snap.run) drawGhost(ctx, f.ghost, s.lastSelf, snap.run.core, now, k);
  const killer = f.killerId === null ? undefined : alive.find((p) => p.id === f.killerId);
  if (killer) drawKillerMark(ctx, killer, now, dark);
  const nemesis = killer || snap.self.nemesis === null ? undefined : alive.find((p) => p.id === snap.self.nemesis && !p.hidden);
  if (nemesis) drawKillerMark(ctx, nemesis, now, dark, 'NEMESIS');
  drawJuice(ctx, f.fxNow ?? now, MARK_Y - 10);
  drawLetterbox(ctx, cam, dpr);
}

const BACKDROP = { zoom: 0.75, swayMs: 40_000, fill: 0.85 } as const;
const BACKDROP_MAP = MAPS.plaza;
const backdropSolids: Solid[] = [...curbSolids(BACKDROP_MAP.size), ...wallSolids(BACKDROP_MAP.walls.map((w) => ({ ...w, built: false })))];
const backdropCrates: Solid[] = BACKDROP_MAP.crates.map((c, i) => ({ kind: 'crate', x: c.x - CRATE_SIZE / 2, y: c.y - CRATE_SIZE / 2, w: CRATE_SIZE, h: CRATE_SIZE, wear: [0, 0.35, 0.7, 0.1][i % 4] }));

export function drawBackdrop(ctx: CanvasRenderingContext2D, w: number, h: number, dpr: number, now: number) {
  const { size } = BACKDROP_MAP;
  const zoom = Math.max(BACKDROP.zoom, w / (size * BACKDROP.fill), h / (size * BACKDROP.fill));
  const viewW = w / zoom, viewH = h / zoom;
  const freeX = size - viewW, freeY = size - viewH;
  const x = freeX / 2 + (freeX / 2) * Math.sin(now / BACKDROP.swayMs);
  const y = freeY / 2 + (freeY / 2) * 0.5 * Math.cos(now / BACKDROP.swayMs);
  const k = dpr * zoom;
  ctx.setTransform(k, 0, 0, k, -x * k, -y * k);
  drawGround(ctx, ground.get(BACKDROP_MAP, size, () => backdropSolids, 'static', floorPlanOf('plaza')), x, y, x + viewW, y + viewH);
  drawLooseShadows(ctx, backdropCrates);
  drawSolids(ctx, [...backdropSolids, ...backdropCrates]);
  drawDust(ctx, { x, y }, { x: x + viewW, y: y + viewH }, now, 0);
  drawVignette(ctx, w, h, dpr, 0.38);
}

function drawLetterbox(ctx: CanvasRenderingContext2D, cam: Camera, dpr: number) {
  const barW = cam.w / 2 - cam.viewHalfW * cam.scale, barH = cam.h / 2 - cam.viewHalfH * cam.scale;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.fillStyle = PALETTE.letterbox;
  if (barW >= 1) { ctx.fillRect(0, 0, barW, cam.h); ctx.fillRect(cam.w - barW, 0, barW, cam.h); }
  if (barH >= 1) { ctx.fillRect(0, 0, cam.w, barH); ctx.fillRect(0, cam.h - barH, cam.w, barH); }
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
  ctx.font = '800 30px "Barlow Condensed", system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(String.fromCharCode(65 + index), z.x, z.y + 2);
}

function drawThrown(ctx: CanvasRenderingContext2D, t: ThrownView, now: number) {
  if (t.kind === 'gasCloud') return drawGasCloud(ctx, t, now);
  if (t.kind === 'grenade' || t.kind === 'fragGrenade') drawBlastRing(ctx, t.x, t.y, BLAST_RADIUS[t.kind], now);
  drawThrownBody(ctx, t, now);
}

const TRAIL_BANDS = 4;
const TRAIL_INK = '#ffffff';

function drawTrails(ctx: CanvasRenderingContext2D, trails: ReadonlyMap<number, readonly TrailPoint[]>, now: number) {
  const dashes = [...trails.values()].flatMap((t) => trailDashes(t, now));
  if (!dashes.length) return;
  ctx.lineCap = 'round';
  ctx.strokeStyle = TRAIL_INK;
  for (const dashing of [false, true]) {
    ctx.lineWidth = dashing ? R * 0.42 : R * 0.19;
    for (let band = 1; band <= TRAIL_BANDS; band++) {
      ctx.globalAlpha = (0.9 * band) / TRAIL_BANDS;
      ctx.beginPath();
      for (const d of dashes) {
        if (d.dashing !== dashing || Math.ceil(d.fade * TRAIL_BANDS) !== band) continue;
        ctx.moveTo(d.x0, d.y0);
        ctx.lineTo(d.x1, d.y1);
      }
      ctx.stroke();
    }
  }
  ctx.globalAlpha = 1;
}

type RoundLook = { r: number; body: string; shine: string };

/**
 * A round is a short solid slug in its gun's bullet color with a thin highlight down its middle and a faint trail behind it:
 * dark on the pale day floor, and the same slug washed light at night so it reads on the dark floor.
 */
/** `trailSlugs`: the faint trail never runs past this many slug lengths, so a fast round reads as a slug, not a long line. */
const ROUND = { minR: 1.9, rMul: 1.2, slugLen: 4.5, trailAlpha: 0.22, trailSlugs: 2.2 } as const;

function roundLook(b: BulletView, night: boolean): RoundLook {
  const { r, color } = b.gun ? GUNS[b.gun].look.bullet : { r: 1.6, color: '#25211c' };
  const size = Math.max(ROUND.minR, r) * ROUND.rMul;
  return night ? { r: size, body: glow(color, 0.82), shine: '#ffffff' } : { r: size, body: color, shine: glow(color, 0.78) };
}

function drawRounds(ctx: CanvasRenderingContext2D, bullets: readonly BulletView[], night: boolean) {
  ctx.lineCap = 'round';
  const groups = new Map<string, { look: RoundLook; bullets: BulletView[] }>();
  for (const b of bullets) {
    const look = roundLook(b, night);
    const key = `${look.body}|${look.r}`;
    const group = groups.get(key);
    if (group) group.bullets.push(b);
    else groups.set(key, { look, bullets: [b] });
  }
  for (const { look, bullets: group } of groups.values()) {
    const dirs = group.map((b) => { const v = Math.hypot(b.vx, b.vy) || 1; return { b, ux: b.vx / v, uy: b.vy / v }; });
    const stroke = (color: string, width: number, alpha: number, from: (d: (typeof dirs)[number]) => number, to: (d: (typeof dirs)[number]) => number) => {
      ctx.globalAlpha = alpha;
      ctx.strokeStyle = color;
      ctx.lineWidth = width;
      ctx.beginPath();
      for (const d of dirs) {
        ctx.moveTo(d.b.x - d.ux * from(d), d.b.y - d.uy * from(d));
        ctx.lineTo(d.b.x - d.ux * to(d), d.b.y - d.uy * to(d));
      }
      ctx.stroke();
    };
    const slug = look.r * ROUND.slugLen;
    stroke(look.body, look.r * 1.3, ROUND.trailAlpha, (d) => Math.min(slug * ROUND.trailSlugs, Math.max(slug, Math.hypot(d.b.vx, d.b.vy) * TRACER.tail)), () => slug * 0.5);
    stroke(look.body, look.r * 2, 1, () => slug, () => 0);
    stroke(look.shine, Math.max(0.8, look.r * 0.55), 0.9, () => slug * 0.75, () => slug * 0.2);
  }
  ctx.globalAlpha = 1;
}

type PlayerLook = { self: boolean; rival: boolean; flash: number; kick: number; now: number; pxPerUnit: number };
const TIER_COLORS = { 1: '#c9ced8', 2: PALETTE.gold } as const;
/** How far a gun jumps back in the hands when fired; a heavy gun (see `heftOf`) jumps up to `RECOIL_HEAVY` times as far. */
const RECOIL = 3;
const RECOIL_HEAVY = 2.6;
const MARK_Y = -R - 8;
const RING = R + 5;

function drawTierMark(ctx: CanvasRenderingContext2D, stage: 1 | 2) {
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  for (const [width, color] of [[4, 'rgba(28, 31, 38, 0.55)'], [2, TIER_COLORS[stage]]] as const) {
    ctx.lineWidth = width;
    ctx.strokeStyle = color;
    ctx.beginPath();
    for (let i = 0; i < stage; i++) {
      const y = MARK_Y - i * 6;
      ctx.moveTo(-6, y);
      ctx.lineTo(0, y - 4.5);
      ctx.lineTo(6, y);
    }
    ctx.stroke();
  }
}

function drawHuntedMark(ctx: CanvasRenderingContext2D, now: number) {
  const pulse = 0.5 + 0.5 * Math.sin(now / 220);
  const r = R + 9;
  ctx.globalAlpha *= 0.55 + 0.4 * pulse;
  ctx.lineWidth = 2;
  ctx.lineCap = 'round';
  ctx.strokeStyle = PALETTE.hunted;
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, TAU);
  for (let i = 0; i < 4; i++) {
    const a = (i * Math.PI) / 2 + Math.PI / 4;
    ctx.moveTo(Math.cos(a) * (r - 4), Math.sin(a) * (r - 4));
    ctx.lineTo(Math.cos(a) * (r + 4), Math.sin(a) * (r + 4));
  }
  ctx.stroke();
}

/** Each drawn body's walk cycle, from where it was drawn last frame. */
const gaits = new Map<number, Gait>();
let gaitsPrunedAt = 0;

function gaitOf(p: PlayerView, now: number): Gait {
  const g = stepGait(gaits.get(p.id), p.x, p.y, now);
  gaits.set(p.id, g);
  if (!p.hidden) noteStride(p.id, g, p.x, p.y, now);
  if (now - gaitsPrunedAt > 5000) {
    gaitsPrunedAt = now;
    for (const [id, o] of gaits) if (now - o.t > 5000) gaits.delete(id);
  }
  return g;
}

function drawPlayer(ctx: CanvasRenderingContext2D, p: PlayerView, color: string, look: PlayerLook) {
  const alpha = p.hidden ? 0.25 : 1;
  ctx.save();
  ctx.translate(p.x, p.y);
  ctx.globalAlpha = alpha;
  if (look.self || look.rival) {
    // A ring on the ground under the feet: yours in your colour, a same-coloured rival's dashed red.
    ctx.beginPath();
    ctx.arc(0, 0, RING, 0, TAU);
    if (look.self) {
      ctx.fillStyle = color;
      ctx.globalAlpha = alpha * 0.14;
      ctx.fill();
    }
    ctx.lineWidth = 2;
    ctx.strokeStyle = look.self ? color : PALETTE.rival;
    ctx.globalAlpha = alpha * (look.self ? 0.6 : 0.9);
    if (look.rival) ctx.setLineDash([5, 4]);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.globalAlpha = alpha;
  }
  const gait = gaitOf(p, look.now);
  const pose = bodyPose(p.id, look.now, gaitAmount(gait));
  ctx.save();
  applyPose(ctx, pose);
  const jump = RECOIL * (1 + (RECOIL_HEAVY - 1) * heftOf(p.gun)) * Math.max(0, look.kick);
  const hands = heldHands(p.gun, R, p.angle).map((h) => ({ x: h.x - jump, y: h.y })) as [{ x: number; y: number }, { x: number; y: number }];
  drawSoldier(ctx, color, 0, 0, R, {
    angle: p.angle, armor: p.armorTier, hands, jump, gait, flash: look.flash,
    gun: (g) => {
      g.translate(-jump, 0);
      drawHeldGun(g, p.gun, R, p.angle, p.golden === true);
      g.translate(jump, 0);
    },
  }, look.pxPerUnit);
  ctx.globalAlpha = alpha;
  const { stage } = GUNS[p.gun];
  if (p.hunted && !look.self) drawHuntedMark(ctx, look.now);
  ctx.globalAlpha = alpha;
  if (stage !== 0) drawTierMark(ctx, stage);
  if (p.spawnShield) {
    // A bubble over the fresh spawn: a faint blue fill, a pulsing rim, and a glint toward the light.
    const pulse = 0.5 + 0.5 * Math.sin(look.now / 120);
    ctx.beginPath();
    ctx.arc(0, 0, R + 6, 0, TAU);
    ctx.fillStyle = PALETTE.shield;
    ctx.globalAlpha = alpha * (0.1 + 0.05 * pulse);
    ctx.fill();
    ctx.globalAlpha = alpha * (0.55 + 0.3 * pulse);
    ctx.lineWidth = 2;
    ctx.strokeStyle = PALETTE.shield;
    ctx.stroke();
    ctx.globalAlpha = alpha * 0.7;
    ctx.lineCap = 'round';
    ctx.lineWidth = 2.5;
    ctx.strokeStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(0, 0, R + 2, Math.PI * 1.1, Math.PI * 1.4);
    ctx.stroke();
    drawShieldShimmer(ctx, look.now, alpha);
  }
  if (p.shield) {
    ctx.beginPath();
    ctx.arc(0, 0, R + 6, p.angle - 1.05, p.angle + 1.05);
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    ctx.strokeStyle = PALETTE.shield;
    ctx.stroke();
  }
  ctx.restore();
  ctx.restore();
}

/** Your killer while you wait to respawn, and afterwards your nemesis, until you take your revenge. */
function drawKillerMark(ctx: CanvasRenderingContext2D, p: PlayerView, now: number, dark: number, label = 'KILLER') {
  const pulse = 0.5 + 0.5 * Math.sin(now / 200);
  ctx.globalAlpha = 0.65 + 0.35 * pulse;
  ctx.beginPath();
  ctx.arc(p.x, p.y, R + 11, 0, TAU);
  ctx.lineWidth = 2.5;
  ctx.strokeStyle = PALETTE.hunted;
  ctx.stroke();
  ctx.globalAlpha = 1;
  ctx.font = '800 15px "Barlow Condensed", system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = dark > 0.5 ? NIGHT.label : PALETTE.hunted;
  ctx.lineJoin = 'round';
  ctx.lineWidth = 4;
  ctx.strokeStyle = 'rgba(19, 21, 25, 0.85)';
  ctx.strokeText(`${label} · ${p.name}`, p.x, p.y + MARK_Y - (GUNS[p.gun].stage ? 12 + 6 * GUNS[p.gun].stage : 6));
  ctx.fillText(`${label} · ${p.name}`, p.x, p.y + MARK_Y - (GUNS[p.gun].stage ? 12 + 6 * GUNS[p.gun].stage : 6));
}

const HURT_SHOW_MS = 1800;
const HURT_FADE_MS = 500;
const TAG = { bar: R + 7, barW: 36, barH: 3.5, name: R + 22, font: 15, plate: '#131519', plateAlpha: 0.78, ink: '#ece6d6', badge: 20 } as const;

type Tag = { p: PlayerView; bar: number; name: boolean };
let tagsDrawn: { id: number; bar: boolean; name: boolean }[] = [];
export const drawnTags = () => tagsDrawn;

function bodyTags(bodies: readonly PlayerView[], s: Session, now: number): Tag[] {
  const tags = bodies.filter((p) => p.id === s.myId || !p.hidden).map((p) => {
    if (p.id === s.myId) return { p, bar: p.hp < p.maxHp ? 1 : 0, name: false };
    const hurt = s.hurtAt.get(p.id);
    return { p, bar: hurt === undefined ? 0 : Math.max(0, Math.min(1, (HURT_SHOW_MS - (now - hurt)) / HURT_FADE_MS)), name: true };
  });
  tagsDrawn = tags.map((t) => ({ id: t.p.id, bar: t.bar > 0, name: t.name }));
  return tags;
}

function drawNamesUnderBodies(ctx: CanvasRenderingContext2D, tags: readonly Tag[], dark: number) {
  ctx.font = `700 ${TAG.font}px "Barlow Condensed", system-ui, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  // Each name sits on a small gunmetal plate with clipped corners, the HUD's field kit, so it reads on the bone floor by day.
  ctx.fillStyle = TAG.plate;
  ctx.globalAlpha = TAG.plateAlpha * (dark > 0.5 ? 0.8 : 1);
  for (const { p, name } of tags) {
    if (!name) continue;
    const w = ctx.measureText(p.name).width + 10, h = TAG.font + 5, x = p.x - w / 2, y = p.y + TAG.name - TAG.font + 1, c = 4;
    ctx.beginPath();
    ctx.moveTo(x, y); ctx.lineTo(x + w - c, y); ctx.lineTo(x + w, y + c); ctx.lineTo(x + w, y + h); ctx.lineTo(x + c, y + h); ctx.lineTo(x, y + h - c);
    ctx.closePath();
    ctx.fill();
  }
  ctx.globalAlpha = 1;
  ctx.fillStyle = TAG.ink;
  for (const { p, name } of tags) if (name) ctx.fillText(p.name, p.x, p.y + TAG.name);
  // The rarest lifetime medal a player holds rides before their name, so a decorated veteran is plain to see.
  for (const { p, name } of tags) {
    if (!name || !p.badge) continue;
    const img = careerImage(p.badge);
    if (!img) continue;
    const x = p.x - ctx.measureText(p.name).width / 2 - TAG.badge - 8;
    ctx.drawImage(img, x, p.y + TAG.name - TAG.badge * 0.78, TAG.badge, TAG.badge);
  }
  // A player on a streak wears a flame and their kill count beside their name: a target worth a shutdown.
  const hot = tags.filter((t) => t.name && t.p.streak).map((t) => ({ p: t.p, x: t.p.x + ctx.measureText(t.p.name).width / 2 + 9 }));
  if (!hot.length) return;
  ctx.font = `800 ${TAG.font + 1}px "Barlow Condensed", system-ui, sans-serif`;
  ctx.textAlign = 'left';
  for (const { p, x } of hot) {
    fillIcon(ctx, UI_ICONS.flame, x + 5, p.y + TAG.name - 4, 12, STREAK_INK);
    ctx.fillStyle = STREAK_INK;
    ctx.fillText(String(p.streak), x + 12, p.y + TAG.name);
  }
  ctx.textAlign = 'center';
}

const STREAK_INK = '#ff5a1f';

function drawBars(ctx: CanvasRenderingContext2D, tags: readonly Tag[], dark: number) {
  const ink = dark > 0.5 ? NIGHT.label : PALETTE.label;
  for (const { p, bar } of tags) {
    if (bar <= 0) continue;
    ctx.globalAlpha = bar;
    const x = p.x - TAG.barW / 2, y = p.y + TAG.bar;
    ctx.fillStyle = dark > 0.5 ? 'rgba(230, 235, 245, 0.25)' : 'rgba(40, 44, 52, 0.2)';
    ctx.fillRect(x, y, TAG.barW, TAG.barH);
    const frac = Math.max(0, Math.min(1, p.hp / p.maxHp));
    ctx.fillStyle = frac > 0.35 ? ink : PALETTE.hpBad;
    ctx.fillRect(x, y, TAG.barW * frac, TAG.barH);
  }
  ctx.globalAlpha = 1;
}

