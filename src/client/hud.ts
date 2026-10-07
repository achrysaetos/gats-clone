import { STICK_RADIUS, stickVector, type Sticks } from './touch.ts';
import { ABILITY_COOLDOWN_MS, byColor, COLORS, GUN_IDS, GUNS, LEVELS, PERK_INFO, WORLD, ZOM, ZOMBIE_KINDS, ZOMBIES, type BuildingKind, type ColorId, type GunId, type PendingPick, type PerkId, type Tier } from '../shared/defs.ts';
import { MAP_MS } from '../shared/maps.ts';
import type { PlayerView, Snapshot } from '../shared/protocol.ts';
import { worldToScreen, type Camera, type Point } from './camera.ts';
import { clearOfRects, clock, edgePoint, boardRows, feedMentions, levelProgress, mapNotice, mostKillsText, objectiveFor, roundTimeLeft, type Rect } from './derive.ts';
import { ASSIST_MS, HITMARKER_MS, HURT_ARC_MS, HURT_MS } from './feedback.ts';
import { serverNow } from './interp.ts';
import { fillIcon, PERK_ICONS, strokeIcon, UI_ICONS } from './icons.ts';
import { CALLOUT_MS, POPUP_MS, RING_MS } from './moments.ts';
import { glow, PALETTE, TEAM_COLORS, tint, ZOMBIE_LOOK } from './palette.ts';
import { nightAmount } from './render.ts';
import { CORE_ALERT_MS } from './siege.ts';
import { BUILD_HINTS, downedLine, forecast, phaseLine, readyHint, squadShare, useHint } from './zombies.ts';
import { airdropLine, drawAirdropMap } from './arenafx.ts';
import { drawRingMap, drawTracker, reviveHint, ringLine, ringPill, spectateLines, squadLabel, trackerSize } from './royale.ts';
import { drawGunArt } from './gunart.ts';
import type { Session } from './state.ts';
import { uiScaleFor } from './uiscale.ts';

/** The kit's condensed face (style.css), with the system face standing in until it loads. */
const HUD_FONT = '"Barlow Condensed", "Arial Narrow", system-ui, sans-serif';
const touchScreen = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;
/**
 * Text sizes, before the HUD's scale (uiscale.ts). The smallest is 13 px, so on a desktop of 560px or more on its short side
 * (scale 1 and up) no HUD text falls under 13 CSS px; a phone's HUD draws at 0.9, still just under 12.
 */
const TYPE = { micro: 13, label: 14, body: 16, title: 18, figure: 24 } as const;
const SPACE = { sm: 8, md: 12, lg: 16 } as const;
/** The kit's gunmetal plates (style.css): bone ink, grey labels, one orange accent, and a clipped corner instead of a round one. */
const PANEL_FILL = 'rgba(19, 21, 25, 0.86)';
const PANEL_INK = '#ece6d6';
const PANEL_MUTED = '#9a9ea6';
const PANEL_CUT = 7;
const ACCENT = '#ff5a1f';
/** Text on a plate needs no halo; the plate is its ground. */
const ON_PANEL = { ink: PANEL_INK, muted: PANEL_MUTED, track: 'rgba(236, 230, 214, 0.14)', glyph: PANEL_INK, halo: 'rgba(0, 0, 0, 0)' } as const;
const ON_WORLD = {
  day: { ink: '#454953', muted: '#80848e', track: '#9b9fa9', glyph: '#4f535d', halo: 'rgba(230, 229, 232, 0.9)' },
  night: { ink: '#eef1f6', muted: '#b4bccb', track: 'rgba(210, 216, 230, 0.35)', glyph: '#dfe4ee', halo: 'rgba(24, 30, 56, 0.6)' },
} as const;
type OnWorld = { ink: string; muted: string; track: string; glyph: string; halo: string };
const EDGE = 16;
const FEED_ROW = 24;
const FEED_MS = 6000;
const TAU = Math.PI * 2;
const HURT_BANDS = 12;
const HURT_EDGE = { depth: 0.06, alpha: 0.05, alphaPerStrength: 0.12 } as const;
/**
 * Suppression closes in on the screen as tunnel vision: a vignette clear for the inner `clear` of the way out, black from `reach`
 * of the way to the corners (so each edge's middle is in full shade too), `alpha` dark at full strength and rising with the
 * server's value to the power `curve` so a burst is felt at once, easing toward it at `ease` per ms. Past `readable` the HUD
 * text takes its night colors so it stays legible over the shade.
 */
const SUPPRESS_EDGE = { clear: 0.16, alpha: 0.96, ease: 0.008, readable: 0.3, reach: 0.82, curve: 0.65 } as const;
let shownSuppression = 0;
let suppressShade: { w: number; h: number; image: HTMLCanvasElement } | null = null;

/** A soft elliptical vignette, baked once per screen size, since a full-screen radial gradient costs milliseconds to rasterize every frame. */
function vignette(w: number, h: number): HTMLCanvasElement {
  if (suppressShade?.w === w && suppressShade.h === h) return suppressShade.image;
  const image = document.createElement('canvas');
  const scale = 0.5;
  image.width = Math.max(1, Math.round(w * scale));
  image.height = Math.max(1, Math.round(h * scale));
  const g = image.getContext('2d')!;
  // Squashed to the screen's shape, so the circle that reaches the corners is the screen's own ellipse.
  const cx = image.width / 2;
  g.translate(cx, image.height / 2);
  g.scale(1, image.height / image.width);
  // Black already at `reach` of the way to the corners, which puts the middle of each edge in full shade: tunnel vision.
  const outer = cx * Math.SQRT2 * SUPPRESS_EDGE.reach;
  const fill = g.createRadialGradient(0, 0, outer * SUPPRESS_EDGE.clear, 0, 0, outer);
  fill.addColorStop(0, 'rgba(6, 7, 10, 0)');
  fill.addColorStop(0.35, 'rgba(6, 7, 10, 0.45)');
  fill.addColorStop(0.7, 'rgba(6, 7, 10, 0.88)');
  fill.addColorStop(1, 'rgba(6, 7, 10, 1)');
  g.fillStyle = fill;
  g.fillRect(-cx, -cx, image.width, image.width);
  suppressShade = { w, h, image };
  return image;
}
const HP_FILL = ['#ef6b60', '#d6463e'] as const;

type Hud = { ctx: CanvasRenderingContext2D; w: number; h: number; snap: Snapshot; s: Session; me: PlayerView | null; now: number; dt: number; cam: Camera; selfAt: Point; on: OnWorld };

const GUN_BY_NAME = new Map<string, GunId>(GUN_IDS.map((id) => [GUNS[id].name, id]));
const PERK_BY_NAME = new Map<string, PerkId>(Object.entries(PERK_INFO).map(([id, info]) => [info.name, id as PerkId]));

/**
 * Where an idle stick's guide ring sits, in px in from its bottom-left (move) or bottom-right (aim) corner, where the touch buttons arc above it (style.css),
 * and how faint it is before and after the player has first used that stick.
 */
const STICK_GUIDE = { inset: 96, aimRight: 150, alpha: 0.24, usedAlpha: 0.1 } as const;
const sticksUsed = { move: false, aim: false };

/** Touch screens draw a faint ring where each stick goes while no thumb is on it, so players know the sticks are there. */
function drawStickGuides(ctx: CanvasRenderingContext2D, sticks: Sticks, w: number, h: number) {
  const guides = [
    { key: 'move', active: sticks.move, x: STICK_GUIDE.inset, label: 'MOVE' },
    { key: 'aim', active: sticks.aim, x: w - STICK_GUIDE.aimRight, label: 'AIM · FIRE' },
  ] as const;
  for (const g of guides) {
    if (g.active) { sticksUsed[g.key] = true; continue; }
    const y = h - STICK_GUIDE.inset;
    ctx.globalAlpha = sticksUsed[g.key] ? STICK_GUIDE.usedAlpha : STICK_GUIDE.alpha;
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(g.x, y, STICK_RADIUS, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(g.x, y, STICK_RADIUS * 0.42, 0, Math.PI * 2);
    ctx.fill();
    ctx.font = '700 15px "Barlow Condensed", system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(g.label, g.x, y + STICK_RADIUS + 12);
  }
}

export function drawSticks(ctx: CanvasRenderingContext2D, sticks: Sticks, dpr: number, w: number, h: number, touchScreen: boolean) {
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  if (touchScreen) drawStickGuides(ctx, sticks, w, h);
  for (const st of [sticks.move, sticks.aim]) {
    if (!st) continue;
    const v = stickVector(st);
    ctx.globalAlpha = 0.35;
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(st.ox, st.oy, STICK_RADIUS, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 0.8;
    ctx.beginPath();
    ctx.arc(st.ox + v.x * STICK_RADIUS, st.oy + v.y * STICK_RADIUS, STICK_RADIUS * 0.42, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

/** `spread` is your current aim spread, or null when no reticle should be drawn. */
/** The whole HUD, panels and text alike, draws on a virtual screen 1 / `scale` as large: see UI_SCALE (uiscale.ts). */
let hudScale = 1;
export const hudScaleFor = (w: number, h: number, touch = touchScreen): number => uiScaleFor(w, h, touch);

export function drawHud(ctx: CanvasRenderingContext2D, dpr: number, screenCam: Camera, snap: Snapshot, s: Session, now: number, screenCrosshair: Point, spread: number | null, fullBoard = false) {
  hudScale = hudScaleFor(screenCam.w, screenCam.h);
  const k = hudScale;
  ctx.setTransform(dpr * k, 0, 0, dpr * k, 0, 0);
  hudFont = '';
  const cam = k === 1 ? screenCam : { ...screenCam, w: screenCam.w / k, h: screenCam.h / k, scale: screenCam.scale / k };
  const crosshair = { x: screenCrosshair.x / k, y: screenCrosshair.y / k };
  const { w, h } = cam;
  const me = snap.players.find((p) => p.id === s.myId) ?? null;
  const on = nightAmount() > 0.5 || shownSuppression > SUPPRESS_EDGE.readable ? ON_WORLD.night : ON_WORLD.day;
  const hud: Hud = { ctx, w, h, snap, s, me, now, dt: Math.min(100, Math.max(0, now - lastHudAt)), cam, selfAt: worldToScreen(cam, s.lastSelf), on };
  lastHudAt = now;
  panels = [];
  buildChips = [];
  const compact = w < 640 || h < 520 || k < 1;
  drawSuppression(hud);
  drawHurtVignette(hud);
  drawHurtArcs(hud);
  const boardBottom = drawLeaderboard(hud, compact, fullBoard);
  drawKillFeed(hud, boardBottom + SPACE.sm, touchScreen && k < 1 ? 2 : compact ? 3 : 5);
  drawMinimap(hud, compact ? 96 : 160);
  const below = drawPill(hud, compact);
  ctx.globalAlpha = 1;
  const siegeTop = drawObjectiveLine(hud, below, fullBoard);
  if (me?.alive) drawVitals(hud, compact);
  if (snap.run) drawSiege(hud, snap.run, siegeTop, compact);
  if (snap.royale) drawRoyale(hud, snap.royale, siegeTop);
  drawHuntedArrows(hud);
  drawScorePopups(hud);
  drawCallouts(hud);
  trackAbility(snap.self, now);
  if (spread !== null) drawReticle(hud, crosshair, spread);
  drawHitmarker(hud, crosshair);
  drawAssist(hud, crosshair);
}

/** Near misses close in a dark shade round the screen's edges, deepest when fully suppressed. */
function drawSuppression({ ctx, w, h, snap, me, dt }: Hud) {
  const target = me?.alive ? snap.self.suppression : 0;
  shownSuppression += (target - shownSuppression) * Math.min(1, dt * SUPPRESS_EDGE.ease);
  if (shownSuppression < 0.01) return;
  // Rises steeply at first, so even a burst of near misses is felt; full suppression all but blinds the edges.
  ctx.globalAlpha = SUPPRESS_EDGE.alpha * shownSuppression ** SUPPRESS_EDGE.curve;
  ctx.drawImage(vignette(w, h), 0, 0, w, h);
  ctx.globalAlpha = 1;
}

/** Stacked translucent edge bands instead of a full-screen radial gradient, which costs several milliseconds to rasterize. */
function drawHurtVignette({ ctx, w, h, s, now }: Hud) {
  const hurt = s.feedback.hurt;
  if (!hurt) return;
  const k = (now - hurt.born) / HURT_MS;
  if (k < 0 || k >= 1) return;
  const depth = Math.min(w, h) * HURT_EDGE.depth;
  const step = depth / HURT_BANDS;
  ctx.fillStyle = 'rgb(200, 40, 40)';
  ctx.globalAlpha = ((HURT_EDGE.alpha + HURT_EDGE.alphaPerStrength * hurt.strength) * (1 - k)) / HURT_BANDS;
  for (let i = 0; i < HURT_BANDS; i++) {
    const d = depth - i * step;
    ctx.fillRect(0, 0, w, d);
    ctx.fillRect(0, h - d, w, d);
    ctx.fillRect(0, d, d, h - d * 2);
    ctx.fillRect(w - d, d, d, h - d * 2);
  }
  ctx.globalAlpha = 1;
}

const EDGE_INSET = 34;
const ARROW_CLEARANCE = 16;

function edgeArrow(ctx: CanvasRenderingContext2D, at: Point, angle: number, scale: number, alpha: number) {
  ctx.save();
  ctx.translate(at.x, at.y);
  ctx.rotate(angle);
  ctx.scale(scale, scale);
  ctx.globalAlpha = alpha;
  ctx.beginPath();
  ctx.moveTo(11, 0);
  ctx.lineTo(-6, -9);
  ctx.lineTo(-2, 0);
  ctx.lineTo(-6, 9);
  ctx.closePath();
  ctx.fillStyle = PALETTE.hunted;
  ctx.fill();
  ctx.restore();
}

function drawHuntedArrows({ ctx, w, h, snap, now, cam, selfAt }: Hud) {
  const pulse = 0.5 + 0.5 * Math.sin(now / 160);
  for (const m of snap.minimap) {
    if (m.pingAge === null) continue;
    const at = edgePoint(selfAt, worldToScreen(cam, m), w, h, EDGE_INSET);
    if (!at) continue;
    edgeArrow(ctx, clearOfRects(selfAt, at, panels, ARROW_CLEARANCE), at.angle, 1 + 0.12 * pulse, 0.6 + 0.35 * pulse);
  }
  ctx.globalAlpha = 1;
}

const ARC = { radius: 58, half: 0.5 } as const;

function drawHurtArcs({ ctx, s, now, selfAt }: Hud) {
  ctx.lineCap = 'round';
  ctx.lineWidth = 3.5;
  ctx.strokeStyle = PALETTE.hunted;
  for (const arc of s.feedback.arcs) {
    const k = (now - arc.born) / HURT_ARC_MS;
    if (k < 0 || k >= 1) continue;
    ctx.globalAlpha = (1 - k * k) * (0.45 + 0.45 * arc.strength);
    ctx.beginPath();
    ctx.arc(selfAt.x, selfAt.y, ARC.radius + 6 * k, arc.angle - ARC.half, arc.angle + ARC.half);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
}

function drawAssist({ ctx, s, now }: Hud, at: Point) {
  const assist = s.feedback.assist;
  if (!assist) return;
  const k = (now - assist.born) / ASSIST_MS;
  if (k < 0 || k >= 1) return;
  ctx.globalAlpha = 1 - k * k;
  outlined(ctx, `+${WORLD.assistScore} assist`, at.x, at.y - 30 - 16 * k, TYPE.body, PALETTE.gold, 800);
  ctx.globalAlpha = 1;
}

function drawScorePopups({ ctx, s, now, cam, selfAt }: Hud) {
  for (const p of s.moments.popups) {
    const k = (now - p.born) / POPUP_MS;
    if (k < 0 || k >= 1) continue;
    const at = p.onSelf ? selfAt : worldToScreen(cam, p);
    ctx.globalAlpha = 1 - k * k * k;
    outlined(ctx, p.text ?? `+${p.amount}`, at.x, at.y - 36 - 44 * k, Math.round(17 + 5 * Math.max(0, 1 - k * 5)), p.color ?? PALETTE.gold, 850);
  }
  ctx.globalAlpha = 1;
}

const CALLOUT_GAP = 70;

function drawCallouts({ ctx, w, h, s, now, selfAt }: Hud) {
  let row = 0;
  for (const c of s.moments.callouts) {
    const age = now - c.born;
    if (age < 0 || age >= CALLOUT_MS) continue;
    if (c.ring && age < RING_MS) drawRingBurst(ctx, selfAt, c.color, age);
    const pop = 1 + 0.25 * Math.max(0, 1 - age / 160);
    ctx.globalAlpha = Math.min(1, age / 90, (CALLOUT_MS - age) / 450);
    const y = h * 0.24 + row * CALLOUT_GAP;
    drawCalloutPlate(ctx, c, w / 2, y, pop, age);
    row++;
  }
  ctx.globalAlpha = 1;
}

/**
 * A callout is a stamped plate: the title in heavy italic capitals in its colour, the line in bone beneath, on a dark band
 * edged in the title's colour that slides open as it lands.
 */
function drawCalloutPlate(ctx: CanvasRenderingContext2D, c: { title: string; line: string; color: string }, x: number, y: number, pop: number, age: number) {
  const size = Math.round(32 * pop);
  setFont(ctx, 900, size, true);
  const tw = ctx.measureText(c.title).width;
  setFont(ctx, 700, TYPE.body);
  const lw = ctx.measureText(c.line).width;
  const open = Math.min(1, age / 140);
  const pw = (Math.max(tw, lw) + 48) * (0.6 + 0.4 * open), ph = 62;
  const left = x - pw / 2, top = y - 24;
  const alpha = ctx.globalAlpha;
  ctx.globalAlpha = alpha * 0.88;
  plate(ctx, left, top, pw, ph);
  ctx.fillStyle = PANEL_FILL;
  ctx.fill();
  ctx.globalAlpha = alpha;
  ctx.fillStyle = c.color;
  ctx.fillRect(left, top, pw - PANEL_CUT, 3);
  setFont(ctx, 900, size, true);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = c.color;
  ctx.fillText(c.title, x, y);
  text(ctx, c.line, x, y + 24, TYPE.body, PANEL_INK, 'center', 700);
}

function drawRingBurst(ctx: CanvasRenderingContext2D, at: Point, color: string, age: number) {
  for (const lag of [0, 140]) {
    const k = (age - lag) / (RING_MS - lag);
    if (k <= 0 || k >= 1) continue;
    ctx.globalAlpha = 1 - k;
    ctx.lineWidth = 4 * (1 - k) + 1;
    ctx.strokeStyle = color;
    ctx.beginPath();
    ctx.arc(at.x, at.y, 24 + 120 * (1 - (1 - k) ** 3), 0, TAU);
    ctx.stroke();
  }
}

const RETICLE = { minGap: 5, maxGap: 90, tick: 7, ring: 6, ringClearance: 6 } as const;

export const reticleGap = (spread: number, distPx: number): number =>
  Math.min(RETICLE.maxGap, Math.max(RETICLE.minGap, Math.tan(spread) * distPx));


let reticleDrawnGap = 0;

/** The ability chip pulses gold for `readyPulseMs` once the cooldown is over, and shakes red for `deniedMs` after Space is pressed too early. */
const ABILITY_CUE = { readyPulseMs: 900, deniedMs: 450 } as const;
let abilityDeniedAt = -Infinity;
let abilityBackAt = -Infinity;
let abilityWasCooling = false;

/** Space was pressed while the ability was still cooling down. */
export const noteAbilityDenied = (now: number) => { abilityDeniedAt = now; };

function trackAbility(self: SelfView, now: number) {
  const cooling = self.ability !== null && self.abilityReadyIn > 0;
  if (abilityWasCooling && !cooling && self.ability !== null) abilityBackAt = now;
  abilityWasCooling = cooling;
}

const deniedShake = (now: number) => {
  const k = (now - abilityDeniedAt) / ABILITY_CUE.deniedMs;
  return k >= 0 && k < 1 ? Math.sin(k * Math.PI * 6) * 3 * (1 - k) : 0;
};

export const drawnReticleGap = (): number => reticleDrawnGap;

function drawReticle({ ctx, snap, selfAt }: Hud, at: Point, spread: number) {
  const reloading = snap.self.reloading;
  const gap = Math.max(reloading ? RETICLE.ring + RETICLE.ringClearance : 0, reticleGap(spread, Math.hypot(at.x - selfAt.x, at.y - selfAt.y)));
  reticleDrawnGap = gap;
  ctx.lineCap = 'round';
  for (const [width, color] of [[3.5, 'rgba(30, 32, 38, 0.75)'], [1.5, '#ffffff']] as const) {
    ctx.lineWidth = width;
    ctx.strokeStyle = color;
    ctx.beginPath();
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      ctx.moveTo(at.x + dx * gap, at.y + dy * gap);
      ctx.lineTo(at.x + dx * (gap + RETICLE.tick), at.y + dy * (gap + RETICLE.tick));
    }
    ctx.stroke();
  }
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(at.x - 1, at.y - 1, 2, 2);
  if (!reloading) return;
  ctx.lineWidth = 3.5;
  ctx.strokeStyle = 'rgba(30, 32, 38, 0.5)';
  ctx.beginPath();
  ctx.arc(at.x, at.y, RETICLE.ring, 0, TAU);
  ctx.stroke();
  ctx.lineWidth = 2;
  ctx.strokeStyle = PALETTE.gold;
  ctx.beginPath();
  ctx.arc(at.x, at.y, RETICLE.ring, -Math.PI / 2, -Math.PI / 2 + snap.self.reloadFrac * TAU);
  ctx.stroke();
}

function drawHitmarker({ ctx, s, now }: Hud, at: Point) {
  const hm = s.feedback.hitmarker;
  if (!hm) return;
  const k = (now - hm.born) / HITMARKER_MS[hm.kill ? 'kill' : 'hit'];
  if (k < 0 || k >= 1) return;
  const [inner, outer] = hm.kill ? [8, 20] : [5, 10];
  const pop = 1 + (1 - k) * (hm.kill ? 0.45 : 0.25);
  ctx.lineCap = 'round';
  if (hm.kill) {
    // A kill also rings out from the crosshair, so it reads as a different event from a hit even out of the corner of an eye.
    ctx.globalAlpha = (1 - k) * 0.9;
    ctx.lineWidth = 2.5 * (1 - k) + 0.5;
    ctx.strokeStyle = '#ff4d4f';
    ctx.beginPath();
    ctx.arc(at.x, at.y, 14 + 26 * (1 - (1 - k) ** 3), 0, TAU);
    ctx.stroke();
  }
  ctx.globalAlpha = 1 - k * k;
  for (const [width, color] of [[hm.kill ? 6 : 4, 'rgba(30, 32, 38, 0.55)'], [hm.kill ? 3.5 : 2, hm.kill ? '#ff4d4f' : '#ffffff']] as const) {
    ctx.lineWidth = width;
    ctx.strokeStyle = color;
    ctx.beginPath();
    for (const [dx, dy] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
      ctx.moveTo(at.x + dx * inner * pop, at.y + dy * inner * pop);
      ctx.lineTo(at.x + dx * outer * pop, at.y + dy * outer * pop);
    }
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
}

const MINIMAP = { bg: 'rgba(19, 21, 25, 0.86)', block: '#454a53', built: '#6a7da6' } as const;
const MINIMAP_BUILDING: Record<BuildingKind, string> = { wall: '#c7a383', sentry: '#f5c400', cannon: '#ff6b3d', scatter: '#3fd1b8', mortar: '#b98cff' };

/** Panels drawn this frame, so edge markers drawn after them can stay clear. */
let panels: Rect[] = [];

/** A plate with its top right and bottom left corners clipped; a tall one also gets the kit's orange corner bracket. */
function panel(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, fill: string = PANEL_FILL) {
  panels.push({ x, y, w, h });
  plate(ctx, x, y, w, h);
  ctx.fillStyle = fill;
  ctx.fill();
  if (h < 60) return;
  ctx.fillStyle = ACCENT;
  ctx.fillRect(x, y, 14, 2);
  ctx.fillRect(x, y, 2, 14);
}

function plate(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number) {
  const c = Math.min(PANEL_CUT, h / 3);
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(x + w - c, y);
  ctx.lineTo(x + w, y + c);
  ctx.lineTo(x + w, y + h);
  ctx.lineTo(x + c, y + h);
  ctx.lineTo(x, y + h - c);
  ctx.closePath();
}

function bar(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, frac: number, color: string | CanvasGradient, track: string) {
  ctx.fillStyle = track;
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, Math.min(2, h / 2));
  ctx.fill();
  const f = Math.max(0, Math.min(1, frac));
  if (f <= 0) return;
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.roundRect(x, y, Math.max(h, w * f), h, Math.min(2, h / 2));
  ctx.fill();
}

/** Assigning ctx.font reparses the string every time, so skip the assignment when the HUD's last font is still set. */
let hudFont = '';
let lastHudAt = 0;
const fonts = new Map<number, string>();
function setFont(ctx: CanvasRenderingContext2D, weight: number, size: number, italic = false) {
  const key = (italic ? -1 : 1) * (weight * 1000 + size);
  let font = fonts.get(key);
  if (!font) fonts.set(key, (font = `${italic ? 'italic ' : ''}${weight} ${size}px ${HUD_FONT}`));
  if (font !== hudFont) { ctx.font = font; hudFont = font; }
}

function text(ctx: CanvasRenderingContext2D, s: string, x: number, y: number, size: number, color: string, align: CanvasTextAlign = 'left', weight = 600) {
  setFont(ctx, weight, size);
  ctx.fillStyle = color;
  ctx.textAlign = align;
  ctx.textBaseline = 'middle';
  ctx.fillText(s, x, y);
}

function worldText(ctx: CanvasRenderingContext2D, on: OnWorld, s: string, x: number, y: number, size: number, color: string, weight: number) {
  setFont(ctx, weight, size);
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round';
  ctx.lineWidth = 3;
  ctx.strokeStyle = on.halo;
  ctx.strokeText(s, x, y);
  ctx.fillStyle = color;
  ctx.fillText(s, x, y);
}

function outlined(ctx: CanvasRenderingContext2D, s: string, x: number, y: number, size: number, color: string, weight: number, italic = false) {
  setFont(ctx, weight, size, italic);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round';
  ctx.lineWidth = Math.max(3, size / 4.5);
  ctx.strokeStyle = 'rgba(19, 21, 25, 0.9)';
  ctx.strokeText(s, x, y);
  ctx.fillStyle = color;
  ctx.fillText(s, x, y);
}

/**
 * A line of text over the world, on its own gunmetal plate with clipped corners, so it reads on the bone floor by day as
 * well as by night. Returns the plate's height.
 */
function platedLine(ctx: CanvasRenderingContext2D, s: string, cx: number, cy: number, size: number, color: string, weight: number, accent: string | null = null): number {
  setFont(ctx, weight, size);
  const pw = ctx.measureText(s).width + size * 1.4, ph = Math.round(size * 1.65);
  const alpha = ctx.globalAlpha;
  ctx.globalAlpha = alpha * 0.92;
  plate(ctx, cx - pw / 2, cy - ph / 2, pw, ph);
  ctx.fillStyle = PANEL_FILL;
  ctx.fill();
  ctx.globalAlpha = alpha;
  panels.push({ x: cx - pw / 2, y: cy - ph / 2, w: pw, h: ph });
  if (accent) {
    ctx.fillStyle = accent;
    ctx.fillRect(cx - pw / 2, cy - ph / 2, 3, ph - Math.min(PANEL_CUT, ph / 3));
  }
  text(ctx, s, cx, cy + 1, size, color, 'center', weight);
  return ph;
}

const FEED_ICON_W = 44;
const BOUNTY_TAG = `+${WORLD.bountyScore} BOUNTY`;

/** Class guns read as their icon; an evolved gun is spelled out in its accent color, since its silhouette is easy to mistake. */
function feedWeapon(ctx: CanvasRenderingContext2D, label: string): { width: number; draw(x: number, y: number): void } {
  const gun = GUN_BY_NAME.get(label);
  if (gun && GUNS[gun].stage === 0) {
    return { width: FEED_ICON_W, draw: (x, y) => drawGunArt(ctx, gun, x, y - 7, FEED_ICON_W - SPACE.sm, 14, { flat: PANEL_INK, align: 'left' }) };
  }
  const perk = PERK_BY_NAME.get(label);
  if (perk) return { width: 20, draw: (x, y) => strokeIcon(ctx, PERK_ICONS[perk], x + 8, y, 13, PANEL_INK, 2.2) };
  const [color, weight] = gun ? [glow(GUNS[gun].look.accent, 0.74), 800] : [PANEL_MUTED, 500];
  setFont(ctx, weight, TYPE.label);
  return { width: ctx.measureText(label).width + SPACE.sm, draw: (x, y) => text(ctx, label, x, y, TYPE.label, color, 'left', weight) };
}

const LIFE_LINE = { downed: PALETTE.hunted, revived: PALETTE.hpGood, bledOut: PANEL_MUTED, finished: PALETTE.hunted, redeployed: PALETTE.hpGood } as const;
const KNOCK_TAG = 'KNOCKED';

function lifeLine(f: Extract<Snapshot['events'][number], { e: 'life' }>, by: string | null | undefined): string {
  switch (f.k) {
    case 'downed': return `${f.name} is down`;
    case 'revived': return by ? `${by} revived ${f.name}` : `${f.name} is back up`;
    case 'bledOut': return `${f.name} bled out`;
    case 'finished': return by ? `${by} finished ${f.name}` : `${f.name} fell to the ring`;
    case 'redeployed': return `${f.name} redeployed`;
  }
}

function drawKillFeed(hud: Hud, top: number, rows: number) {
  const { ctx, w, s, now } = hud;
  const lines = s.feed.filter((f) => now - f.at < FEED_MS).slice(-rows);
  const right = w - EDGE;
  const drawRow = (f: (typeof lines)[number], i: number) => {
    const y = top + i * FEED_ROW + 10;
    ctx.globalAlpha = Math.min(1, (FEED_MS - (now - f.at)) / 600) * 0.95;
    setFont(ctx, 650, TYPE.label + 1);
    if (f.e === 'life') {
      const by = f.by === null ? null : hud.snap.players.find((p) => p.id === f.by)?.name ?? hud.snap.leaderboard.find((r) => r.id === f.by)?.name;
      const [line, color] = [lifeLine(f, by), LIFE_LINE[f.k]];
      const pw = ctx.measureText(line).width + SPACE.md * 2;
      feedRow(ctx, right - pw, y, pw, f.id === s.myId);
      ctx.fillStyle = color;
      ctx.fillRect(right - pw + 4, y - 5, 2, 10);
      text(ctx, line, right - pw + SPACE.md, y, TYPE.label + 1, PANEL_INK, 'left', 650);
      ctx.globalAlpha = 1;
      return;
    }
    if (f.e === 'airdrop') {
      const row = airdropLine(f);
      if (!row) return;
      const pw = ctx.measureText(row.text).width + SPACE.md * 2 + 8;
      feedRow(ctx, right - pw, y, pw, f.k === 'taken');
      ctx.fillStyle = row.color;
      ctx.fillRect(right - pw + 4, y - 5, 4, 10);
      text(ctx, row.text, right - pw + SPACE.md + 6, y, TYPE.label + 1, PANEL_INK, 'left', 650);
      ctx.globalAlpha = 1;
      return;
    }
    if (f.e === 'wiped') {
      const line = `${squadLabel(f.team)} is out · #${f.place}`;
      const pw = ctx.measureText(line).width + SPACE.md * 2 + 8;
      feedRow(ctx, right - pw, y, pw, hud.me?.team === f.team);
      ctx.fillStyle = TEAM_COLORS[f.team];
      ctx.fillRect(right - pw + 6, y - 5, 6, 10);
      text(ctx, line, right - pw + SPACE.md + 8, y, TYPE.label + 1, PANEL_INK, 'left', 650);
      ctx.globalAlpha = 1;
      return;
    }
    if (f.e === 'hunted') {
      const line = `${f.name} is hunted`;
      const pw = ctx.measureText(line).width + 20 + SPACE.md * 2;
      feedRow(ctx, right - pw, y, pw, f.id === s.myId);
      strokeIcon(ctx, UI_ICONS.target, right - pw + SPACE.md + 6, y, 12, PALETTE.hunted, 2.2);
      text(ctx, line, right - pw + SPACE.md + 18, y, TYPE.label + 1, PANEL_INK, 'left', 650);
      ctx.globalAlpha = 1;
      return;
    }
    const kw = f.killer ? ctx.measureText(f.killer).width : 0;
    const vw = ctx.measureText(f.victim).width;
    const weapon = feedWeapon(ctx, f.weapon);
    setFont(ctx, 800, TYPE.micro);
    const tag = f.bounty ? BOUNTY_TAG : f.knock ? KNOCK_TAG : null;
    const bw = tag ? ctx.measureText(tag).width + SPACE.sm : 0;
    const pw = kw + vw + weapon.width + bw + SPACE.md * 2 + (f.killer ? SPACE.sm : 0);
    let x = right - pw;
    feedRow(ctx, x, y, pw, feedMentions(f, s.myId));
    x += SPACE.md;
    if (f.killer) { text(ctx, f.killer, x, y, TYPE.label + 1, nameColor(hud, f.killerId), 'left', 650); x += kw + SPACE.sm; }
    weapon.draw(x, y);
    x += weapon.width;
    text(ctx, f.victim, x, y, TYPE.label + 1, nameColor(hud, f.victimId), 'left', 650);
    if (tag) text(ctx, tag, x + vw + SPACE.sm, y, TYPE.micro, f.bounty ? FEED_TEAM.red : PALETTE.gold, 'left', 800);
    ctx.globalAlpha = 1;
  };
  lines.forEach((f, i) => {
    // A new line punches in from the right with a little overshoot; one of yours also flashes.
    const age = now - f.at;
    const slide = REDUCED || age > FEED_IN_MS ? 0 : 1 - easeOutBack(Math.max(0, age) / FEED_IN_MS);
    feedAge = age;
    ctx.translate(slide * 150, 0);
    drawRow(f, i);
    ctx.translate(-slide * 150, 0);
  });
  feedAge = 1e9;
}

const FEED_IN_MS = 320;
const FEED_FLASH_MS = 620;
let feedAge = 1e9;
const easeOutBack = (t: number): number => { const c = 1.9; return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2); };

/** A line you took part in carries an orange edge. */
function feedRow(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, mine: boolean) {
  panel(ctx, x, y - 10, w, 20);
  if (!mine) return;
  ctx.fillStyle = ACCENT;
  ctx.fillRect(x, y - 10, 3, 20);
  const flash = popOf(feedAge, FEED_FLASH_MS);
  if (flash > 0) {
    const a = ctx.globalAlpha;
    ctx.globalAlpha = a * flash * 0.7;
    ctx.fillStyle = '#ffd7b0';
    plate(ctx, x, y - 10, w, 20);
    ctx.fill();
    ctx.globalAlpha = a * flash * 0.5;
    ctx.fillStyle = ACCENT;
    ctx.fillRect(x - 4 * flash, y - 10, 3 + 4 * flash, 20);
    ctx.globalAlpha = a;
  }
}

const FEED_TEAM: Record<ColorId, string> = { ...byColor((c) => tint(COLORS[c], 0.55)), red: '#ffb0b2', blue: '#b5c6ff' };

function nameColor({ s, snap, me }: Hud, id: number | null): string {
  if (id === s.myId) return me ? ownColor(snap, me) : PALETTE.gold;
  const team = id === null ? null : snap.leaderboard.find((r) => r.id === id)?.team ?? null;
  return team && !snap.run ? FEED_TEAM[team] : PANEL_INK;
}

const ownColor = (snap: Snapshot, me: PlayerView) => (me.team && !snap.run ? FEED_TEAM[me.team] : tint(COLORS[me.color], 0.55));

const timeLeft = ({ snap, s, now }: Hud) => roundTimeLeft(snap.match, serverNow(s.snaps, now));

/** On a phone the board lists only the top `touchTop` and you, so it ends above the ability button (style.css). */
const BOARD = { w: 168, compactW: 140, row: 21, pad: 10, touchTop: 3 } as const;

let boardYs = new Map<number, number>();
const boardMine = { place: null as number | null, climbAt: -1e9 };

function drawLeaderboard(hud: Hud, compact: boolean, full: boolean): number {
  const { ctx, w, h, snap, s, me } = hud;
  const rows = boardRows(snap.leaderboard, s.myId, full ? (compact || h < 760 ? 6 : 12) : null, touchScreen && compact ? BOARD.touchTop : undefined);
  const teams = snap.match.mode === 'TDM' || snap.match.mode === 'DOM' || snap.match.mode === 'BR';
  const pw = compact ? BOARD.compactW : BOARD.w;
  const x = w - pw - EDGE, top = EDGE;
  const split = rows.length > 1 && rows.at(-1)!.place - rows.at(-2)!.place > 1;
  const head = full ? 22 : 0;
  const ph = BOARD.pad * 2 + rows.length * BOARD.row + head + (split ? 5 : 0);
  fadePanel(hud, 'board', x, top, pw, ph);
  panel(ctx, x, top, pw, ph);
  let y = top + BOARD.pad + BOARD.row / 2;
  if (full) {
    const line = snap.run || snap.royale ? 'Squad kills' : teams ? `First to ${snap.match.mode === 'TDM' ? WORLD.tdmWinScore : WORLD.domWinScore}` : mostKillsText(timeLeft(hud));
    text(ctx, line[0]!.toUpperCase() + line.slice(1), x + BOARD.pad + 2, y - 2, TYPE.micro, PANEL_MUTED, 'left', 600);
    y += head;
  }
  const mineColor = me ? ownColor(snap, me) : PALETTE.gold;
  const myPlace = rows.find((r) => r.row.id === s.myId)?.place ?? null;
  if (myPlace !== null && boardMine.place !== null && myPlace < boardMine.place) boardMine.climbAt = hud.now;
  boardMine.place = myPlace;
  const rowYs = new Map<number, number>();
  rows.forEach(({ place, row: r }, i) => {
    if (split && i === rows.length - 1) {
      ctx.fillStyle = 'rgba(255, 255, 255, 0.14)';
      ctx.fillRect(x + BOARD.pad, y - BOARD.row / 2, pw - BOARD.pad * 2, 1);
      y += 5;
    }
    const mine = r.id === s.myId;
    const color = mine ? mineColor : PANEL_INK;
    const weight = mine ? 750 : 500;
    // Rows glide to their slot when the order changes; yours flares when you climb.
    const slotY = y;
    const from = boardYs.get(r.id) ?? slotY;
    const rowY = REDUCED ? slotY : Math.abs(slotY - from) < 0.4 ? slotY : from + (slotY - from) * (1 - Math.exp(-hud.dt / 70));
    rowYs.set(r.id, rowY);
    y = rowY;
    if (mine) {
      const climb = popOf(hud.now - boardMine.climbAt, 900);
      if (climb > 0) {
        ctx.globalAlpha = climb * 0.55;
        ctx.fillStyle = mineColor;
        ctx.fillRect(x + 3, y - BOARD.row / 2 + 1, pw - 6, BOARD.row - 2);
        ctx.globalAlpha = climb * (0.5 + 0.5 * Math.sin(hud.now / 70));
        ctx.fillStyle = '#fff1d2';
        ctx.fillRect(x + 3, y - BOARD.row / 2 + 1, 2, BOARD.row - 2);
        ctx.globalAlpha = 1;
      }
    }
    text(ctx, String(place), x + BOARD.pad + 2, y, TYPE.body, mine ? mineColor : PANEL_MUTED, 'left', weight);
    const nx = x + BOARD.pad + 22;
    if (r.team && teams) {
      ctx.fillStyle = TEAM_COLORS[r.team];
      ctx.beginPath();
      ctx.arc(nx + 3, y, 3, 0, TAU);
      ctx.fill();
    }
    text(ctx, mine ? 'you' : r.name, nx + (r.team && teams ? 11 : 0), y, TYPE.body, color, 'left', weight);
    text(ctx, String(r.kills), x + pw - BOARD.pad - 2, y, TYPE.body, color, 'right', weight);
    y = slotY + BOARD.row;
  });
  boardYs = rowYs;
  ctx.globalAlpha = 1;
  return top + ph;
}

export const PANEL_ALPHA = { rest: 0.97, covering: 0.8 } as const;
const PANEL_FADE_MS = 180;

export function approachAlpha(alpha: number, covering: boolean, dtMs: number): number {
  const target = covering ? PANEL_ALPHA.covering : PANEL_ALPHA.rest;
  const step = (dtMs / PANEL_FADE_MS) * (PANEL_ALPHA.rest - PANEL_ALPHA.covering);
  return alpha < target ? Math.min(target, alpha + step) : Math.max(target, alpha - step);
}

type PanelId = 'score' | 'board' | 'minimap';
const panelAlpha: Record<PanelId, number> = { score: PANEL_ALPHA.rest, board: PANEL_ALPHA.rest, minimap: PANEL_ALPHA.rest };
const fadeRects: Partial<Record<PanelId, Rect>> = {};

export const drawnPanels = (): Readonly<Partial<Record<PanelId, Rect>>> => fadeRects;

function fadePanel({ ctx, snap, cam, dt }: Hud, id: PanelId, x: number, y: number, w: number, h: number): number {
  fadeRects[id] = { x, y, w, h };
  const pad = WORLD.playerRadius * cam.scale;
  const covering = snap.players.some((p) => {
    if (!p.alive) return false;
    const at = worldToScreen(cam, p);
    return at.x > x - pad && at.x < x + w + pad && at.y > y - pad && at.y < y + h + pad;
  });
  panelAlpha[id] = approachAlpha(panelAlpha[id], covering, dt);
  ctx.globalAlpha = panelAlpha[id];
  return panelAlpha[id];
}

const PING_WAVE_MS = 700;
const DIAMOND_R = 5;

function drawMinimap(hud: Hud, size: number) {
  const { ctx, w, h, snap, s, me } = hud;
  const k = size / s.worldSize;
  const pad = 8;
  // On a touch screen the bottom right is the aiming thumb's, so the minimap sits top left under the vitals, as in mobile shooters.
  const x0 = touchScreen ? EDGE : w - EDGE - size - pad * 2, y0 = touchScreen ? EDGE + VITALS.height + 8 : h - EDGE - size - pad * 2;
  const base = fadePanel(hud, 'minimap', x0, y0, size + pad * 2, size + pad * 2);
  panel(ctx, x0, y0, size + pad * 2, size + pad * 2, MINIMAP.bg);
  const x = x0 + pad, y = y0 + pad;
  for (const wall of s.walls) {
    ctx.fillStyle = wall.built ? MINIMAP.built : MINIMAP.block;
    ctx.fillRect(x + wall.x * k, y + wall.y * k, Math.max(1.5, wall.w * k), Math.max(1.5, wall.h * k));
  }
  for (const z of snap.zones) {
    ctx.beginPath();
    ctx.arc(x + z.x * k, y + z.y * k, Math.max(4, z.r * k), 0, TAU);
    ctx.fillStyle = z.owner ? TEAM_COLORS[z.owner] : PALETTE.neutral;
    ctx.globalAlpha = base * 0.45;
    ctx.fill();
    ctx.globalAlpha = base;
  }
  for (const m of snap.minimap) {
    if (m.pingAge !== null) continue;
    ctx.fillStyle = m.team ? TEAM_COLORS[m.team] : '#ff6b5f';
    ctx.beginPath();
    ctx.arc(x + m.x * k, y + m.y * k, 2.5, 0, TAU);
    ctx.fill();
  }
  const inside = (v: number) => Math.min(size - DIAMOND_R, Math.max(DIAMOND_R, v));
  for (const m of snap.minimap) {
    if (m.pingAge === null) continue;
    const mx = x + inside(m.x * k), my = y + inside(m.y * k);
    const wave = m.pingAge / PING_WAVE_MS;
    if (wave < 1) {
      ctx.save();
      ctx.beginPath();
      ctx.rect(x, y, size, size);
      ctx.clip();
      ctx.globalAlpha = base * (1 - wave);
      ctx.beginPath();
      ctx.arc(mx, my, 4 + 12 * wave, 0, TAU);
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = PALETTE.hunted;
      ctx.stroke();
      ctx.restore();
    }
    ctx.beginPath();
    ctx.moveTo(mx, my - DIAMOND_R);
    ctx.lineTo(mx + DIAMOND_R, my);
    ctx.lineTo(mx, my + DIAMOND_R);
    ctx.lineTo(mx - DIAMOND_R, my);
    ctx.closePath();
    ctx.fillStyle = PALETTE.hunted;
    ctx.fill();
  }
  if (snap.run) {
    for (const b of snap.buildings ?? []) {
      ctx.fillStyle = MINIMAP_BUILDING[b.kind];
      ctx.fillRect(x + b.cx * ZOM.cell * k, y + b.cy * ZOM.cell * k, Math.max(1.5, ZOM.cell * k), Math.max(1.5, ZOM.cell * k));
    }
    for (const kind of ZOMBIE_KINDS) {
      const r = Math.max(1.2, ZOMBIES[kind].radius / 10);
      ctx.fillStyle = ZOMBIE_LOOK[kind].body;
      ctx.beginPath();
      for (const [, k2, zx, zy] of snap.zombies ?? []) {
        if (ZOMBIE_KINDS[k2] !== kind) continue;
        ctx.moveTo(x + zx * k + r, y + zy * k);
        ctx.arc(x + zx * k, y + zy * k, r, 0, TAU);
      }
      ctx.fill();
    }
    const c = snap.run.core, half = Math.max(3, ZOM.coreHalf * k);
    ctx.fillStyle = hud.now - s.coreHitAt < CORE_ALERT_MS && Math.floor(hud.now / 200) % 2 ? PALETTE.hunted : '#4fd1e8';
    ctx.fillRect(x + c.x * k - half, y + c.y * k - half, half * 2, half * 2);
  }
  drawAirdropMap(ctx, snap.airdrop, serverNow(s.snaps, hud.now), hud.now, x, y, k, size, base);
  const clockNow = snap.royale ? serverNow(s.snaps, hud.now) : null;
  if (snap.royale && clockNow !== null) {
    drawRingMap(ctx, snap.royale, clockNow, hud.now, x, y, k, size);
    ctx.globalAlpha = base;
    const lines = [ringLine(snap.royale, clockNow), ...(snap.royale.redeploys ? [] : ['Last lives'])];
    lines.forEach((line, i) => platedLine(ctx, line, x0 + (size + pad * 2) / 2, y0 - 16 - (lines.length - 1 - i) * 28, TYPE.label + 1, i === 0 ? PANEL_INK : PALETTE.lossOnDark, 700));
  }
  const self = me ?? s.lastSelf;
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.arc(x + self.x * k, y + self.y * k, 3.5, 0, TAU);
  ctx.fill();
  ctx.globalAlpha = 1;
}

function drawPill(hud: Hud, compact: boolean): number {
  const { ctx, w, snap, me, s, now } = hud;
  const ph = compact ? 24 : 28, y = EDGE;
  const side = compact ? 40 : 48, mid = compact ? 56 : 66;
  const big = compact ? 14 : 16;
  const left = timeLeft(hud);
  const cy = y + ph / 2;
  if (snap.match.mode === 'TDM' || snap.match.mode === 'DOM') {
    const x = w / 2 - side - mid / 2;
    fadePanel(hud, 'score', x, y, side * 2 + mid, ph);
    panel(ctx, x, y, side * 2 + mid, ph);
    for (const [team, bx] of [['red', x], ['blue', x + side + mid]] as const) {
      text(ctx, String(snap.match.teamScore[team]), bx + side / 2, cy + 1, big, FEED_TEAM[team], 'center', 800);
      if (me?.team === team) {
        ctx.fillStyle = FEED_TEAM[team];
        ctx.fillRect(bx + side / 2 - 7, y + ph - 4, 14, 2);
      }
    }
    const center = snap.match.mode === 'DOM' ? `to ${WORLD.domWinScore}` : left === null ? `to ${WORLD.tdmWinScore}` : clock(left);
    text(ctx, center, x + side + mid / 2, cy + 1, TYPE.body, PANEL_INK, 'center', 600);
    return y + ph;
  }
  if (snap.royale) {
    const pill = ringPill(snap.royale, serverNow(s.snaps, now) ?? snap.royale.ring.shrinkAt);
    const lw = compact ? 70 : 86;
    const x = w / 2 - (lw + mid) / 2;
    fadePanel(hud, 'score', x, y, lw + mid, ph);
    panel(ctx, x, y, lw + mid, ph);
    text(ctx, pill.label, x + lw / 2 + 4, cy + 1, TYPE.label + 1, '#c9b3ff', 'center', 800);
    text(ctx, pill.time, x + lw + mid / 2 - 4, cy + 1, TYPE.body, PANEL_INK, 'center', 600);
    return y + ph;
  }
  if (snap.run) {
    const run = snap.run;
    const [label, color] = run.phase === 'day' ? [`DAY ${run.night}`, PALETTE.gold] : run.phase === 'night' ? [`NIGHT ${run.night}`, '#a99bff'] : run.report?.won ? ['HELD', PALETTE.hpGood] : ['FALLEN', PALETTE.hunted];
    const until = run.phaseEndsAt === null ? null : run.phaseEndsAt - (serverNow(s.snaps, now) ?? run.phaseEndsAt);
    const center = run.phase === 'night' ? `${run.waveLeft} left` : until === null ? '' : clock(until);
    const lw = compact ? 64 : 78;
    const x = w / 2 - (lw + mid) / 2;
    fadePanel(hud, 'score', x, y, lw + mid, ph);
    panel(ctx, x, y, lw + mid, ph);
    text(ctx, label, x + lw / 2 + 4, cy + 1, TYPE.label + 1, color, 'center', 800);
    text(ctx, center, x + lw + mid / 2 - 4, cy + 1, TYPE.body, PANEL_INK, 'center', 600);
    return y + ph;
  }
  const x = w / 2 - mid / 2;
  fadePanel(hud, 'score', x, y, mid, ph);
  panel(ctx, x, y, mid, ph);
  text(ctx, left === null ? clock(MAP_MS.FFA) : clock(left), x + mid / 2, cy + 1, TYPE.body + 1, PANEL_INK, 'center', 650);
  return y + ph;
}

function drawObjectiveLine(hud: Hud, top: number, full: boolean): number {
  const { ctx, w, snap, me } = hud;
  if (!me) return top;
  const lines: [string, string][] = [];
  if (full) lines.push([snap.run ? `${snap.match.map} · ${phaseLine(snap.run, serverNow(hud.s.snaps, hud.now))}` : `${snap.match.map} · ${objectiveFor(snap.match.mode, me.team, timeLeft(hud)).line}`, PANEL_INK]);
  const notice = mapNotice(snap.match);
  if (notice) lines.push([notice, PALETTE.gold]);
  let y = top + 6;
  for (const [line, color] of lines) {
    setFont(ctx, 600, TYPE.label);
    const lw = ctx.measureText(line).width + 18;
    panel(ctx, w / 2 - lw / 2, y, lw, 20);
    text(ctx, line, w / 2, y + 10, TYPE.label, color, 'center', 600);
    y += 24;
  }
  return y - 4;
}

function drawSiege(hud: Hud, run: NonNullable<Snapshot['run']>, top: number, compact: boolean) {
  const { ctx, w, h, s, me, now } = hud;
  const y = top + 17;
  const cx = w / 2;
  setFont(ctx, 750, TYPE.body);
  const scrapW = ctx.measureText(`${run.scrap}`).width;
  const frac = run.core.hp / run.core.maxHp;
  const alert = now - s.coreHitAt < CORE_ALERT_MS;
  const coreColor = alert && Math.floor(now / 200) % 2 ? PALETTE.hunted : frac > 0.5 ? PALETTE.hpGood : frac > 0.25 ? PALETTE.gold : PALETTE.hpBad;
  const people = `${run.survivors}`;
  const peopleW = ctx.measureText(people).width;
  const mourned = run.phase === 'night' && run.lost > 0 ? `−${run.lost} tonight` : null;
  setFont(ctx, 500, TYPE.label);
  const scrapLabelW = ctx.measureText('scrap').width, peopleLabelW = ctx.measureText('survivors').width;
  setFont(ctx, 700, TYPE.label);
  const mournedW = mourned ? ctx.measureText(mourned).width + 8 : 0;
  const total = 16 + scrapW + 6 + scrapLabelW + 14 + 16 + 90 + 14 + peopleW + 6 + peopleLabelW + mournedW;
  let x = cx - total / 2;
  panel(ctx, x - 10, y - 12, total + 20, 24);
  strokeIcon(ctx, UI_ICONS.scrap, x + 6, y, 12, PALETTE.gold, 2.2);
  text(ctx, `${run.scrap}`, x + 16, y, TYPE.body, PANEL_INK, 'left', 750);
  x += 16 + scrapW + 6;
  text(ctx, 'scrap', x, y, TYPE.label, PANEL_MUTED, 'left', 500);
  x += scrapLabelW + 14;
  strokeIcon(ctx, UI_ICONS.core, x + 6, y, 12, coreColor, 2.2);
  bar(ctx, x + 16, y - 3, 90, 6, frac, coreColor, 'rgba(255, 255, 255, 0.18)');
  x += 16 + 90 + 14;
  text(ctx, people, x, y, TYPE.body, alert ? coreColor : PANEL_INK, 'left', 750);
  text(ctx, 'survivors', x + peopleW + 6, y, TYPE.label, PANEL_MUTED, 'left', 500);
  if (mourned) text(ctx, mourned, x + peopleW + 6 + peopleLabelW + 8, y, TYPE.label, PALETTE.lossOnDark, 'left', 700);
  let below = y + 30;
  if (alert) below += drawCoreAlert(hud, run.core, below) + 6;
  if (run.phase === 'over') return;
  if (run.phase === 'day') platedLine(ctx, `Tonight · ${forecast(run.night, squadShare(hud.snap.players))}`, cx, below, TYPE.body, PALETTE.gold, 700, ACCENT);
  if (me?.downed) {
    drawDownedSelf(hud, me.downed);
    return;
  }
  if (!me?.alive) return;
  const use = useHint(hud.snap, s.lastSelf);
  const row = h - (compact ? 150 : 30);
  if (use) platedLine(ctx, use, w / 2, h * 0.64, TYPE.body + 1, PALETTE.gold, 750, ACCENT);
  if (s.building) {
    hintBar(ctx, s, BUILD_HINTS.filter((p) => p.pick), w / 2, row - 32, null);
    hintBar(ctx, s, BUILD_HINTS.filter((p) => !p.pick), w / 2, row, 'BUILD');
  } else if (run.phase === 'day') {
    hintBar(ctx, s, [{ key: 'B', what: 'build walls and turrets' }, { key: 'N', what: readyHint(run, hud.snap.players, hud.snap.self.id) }], w / 2, row, null);
  }
}

/** You're down: a red-edged plate with the title, how long you have or who is reviving you, and the revive bar. */
function drawDownedSelf({ ctx, w, h, s, now }: Hud, downed: NonNullable<PlayerView['downed']>) {
  const k = 0.5 + 0.5 * Math.sin(now / 260);
  const line = downedLine(downed, serverNow(s.snaps, now));
  const y = h * 0.64;
  setFont(ctx, 850, 24);
  const tw = ctx.measureText("You're down").width;
  setFont(ctx, 650, TYPE.body + 1);
  const pw = Math.max(tw, ctx.measureText(line).width, 180) + 36, ph = 78;
  const left = w / 2 - pw / 2, top = y - 18;
  ctx.globalAlpha = 0.92;
  plate(ctx, left, top, pw, ph);
  ctx.fillStyle = PANEL_FILL;
  ctx.fill();
  ctx.globalAlpha = 1;
  panels.push({ x: left, y: top, w: pw, h: ph });
  ctx.fillStyle = PALETTE.hunted;
  ctx.fillRect(left, top, pw - PANEL_CUT, 3);
  text(ctx, "You're down", w / 2, y + 1, 24, PALETTE.hunted, 'center', 850);
  text(ctx, line, w / 2, y + 26, TYPE.body + 1, PANEL_INK, 'center', 650);
  ctx.globalAlpha = 0.6 + 0.4 * k;
  bar(ctx, w / 2 - 90, y + 44, 180, 5, downed.revive, PALETTE.hpGood, ON_PANEL.track);
  ctx.globalAlpha = 1;
}

function drawRoyale(hud: Hud, royale: NonNullable<Snapshot['royale']>, top: number) {
  const { ctx, w, h, snap, s, me, now } = hud;
  const mine = me?.team ?? null;
  const box = trackerSize(royale.squads.length);
  const x = w / 2 - box.w / 2 - 6, y = top + 6;
  panel(ctx, x, y, box.w + 12, box.h + 8);
  panels.push({ x, y, w: box.w + 12, h: box.h + 8 });
  drawTracker(ctx, royale, mine, x + 6, y + 4);
  if (me?.downed) { drawDownedSelf(hud, me.downed); return; }
  const revive = reviveHint(snap, me);
  if (revive) platedLine(ctx, revive, w / 2, h * 0.64, TYPE.body + 1, PALETTE.gold, 750, ACCENT);
  if (me?.alive) return;
  const clockNow = serverNow(s.snaps, now);
  if (clockNow === null) return;
  const lines = spectateLines(snap, royale, clockNow);
  platedLine(ctx, lines.title, w / 2, h - 100, TYPE.title + 2, PANEL_INK, 800, ACCENT);
  platedLine(ctx, lines.sub, w / 2, h - 66, TYPE.body, PANEL_MUTED, 650);
}

function hintBar(ctx: CanvasRenderingContext2D, s: Session, hints: readonly { key: string; what: string; pick?: BuildingKind }[], cx: number, row: number, label: string | null) {
  setFont(ctx, 650, TYPE.label);
  const parts = hints.map((p) => ({ ...p, kw: ctx.measureText(p.key).width + 10, ww: ctx.measureText(p.what).width }));
  const total = parts.reduce((t, p) => t + p.kw + p.ww + 22, label ? 56 : 0) + 8;
  let hx = cx - total / 2;
  panel(ctx, hx, row - 12, total, 24);
  hx += 10;
  if (label) {
    text(ctx, label, hx, row, TYPE.label, PALETTE.gold, 'left', 850);
    hx += 48;
  }
  for (const p of parts) {
    const picked = p.pick !== undefined && p.pick === s.buildKind;
    ctx.fillStyle = picked ? PALETTE.gold : 'rgba(255, 255, 255, 0.16)';
    ctx.beginPath();
    ctx.roundRect(hx, row - 8, p.kw, 16, 3);
    ctx.fill();
    text(ctx, p.key, hx + 5, row, TYPE.label, picked ? '#16181d' : PANEL_INK, 'left', 750);
    text(ctx, p.what, hx + p.kw + 5, row, TYPE.label, picked ? PALETTE.gold : PANEL_MUTED, 'left', picked ? 750 : 550);
    if (p.pick) buildChips.push({ kind: p.pick, x: hx - 4, y: row - 12, w: p.kw + p.ww + 12, h: 24 });
    hx += p.kw + p.ww + 22;
  }
}

/** The build bar's kind chips as last drawn, in CSS px, so a click on one picks its kind. */
let buildChips: (Rect & { kind: BuildingKind })[] = [];
export const drawnBuildChips = (): readonly (Rect & { kind: BuildingKind })[] => buildChips;
export const buildChipAt = (sx: number, sy: number): BuildingKind | null => {
  const x = sx / hudScale, y = sy / hudScale;
  return buildChips.find((c) => x >= c.x && x <= c.x + c.w && y >= c.y && y <= c.y + c.h)?.kind ?? null;
};

/** Returns the height of the warning's plate, so lines below it can stand clear. */
function drawCoreAlert({ ctx, w, h, now, cam, selfAt }: Hud, core: { x: number; y: number }, y: number): number {
  const pulse = 0.5 + 0.5 * Math.sin(now / 110);
  ctx.globalAlpha = 0.75 + 0.25 * pulse;
  const tall = platedLine(ctx, 'CORE UNDER ATTACK', w / 2, y, TYPE.body, PALETTE.hunted, 850, PALETTE.hunted);
  ctx.globalAlpha = 1;
  const at = edgePoint(selfAt, worldToScreen(cam, core), w, h, EDGE_INSET + 10);
  if (!at) return tall;
  const clear = clearOfRects(selfAt, at, panels, ARROW_CLEARANCE);
  edgeArrow(ctx, clear, at.angle, 1.25 + 0.2 * pulse, 1);
  strokeIcon(ctx, UI_ICONS.core, clear.x - Math.cos(at.angle) * 24, clear.y - Math.sin(at.angle) * 24, 15, PALETTE.hunted, 2.4);
  return tall;
}

/** Players who ask the OS for less motion keep the HUD's colour cues but lose the pops, throbs, glints and sparkles. */
/** The bible's heal green and its hottest spark, the only near-whites the HUD's effects use. */
const HEAL = '#8ff0c4';
const SPARK_WHITE = '#ffe9b0';
const REDUCED = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

/** 1 as a cue starts, easing to 0 over `ms`; 0 before and after (and always with reduced motion). */
const popOf = (age: number, ms: number): number => (REDUCED || age < 0 || age > ms ? 0 : 1 - age / ms);

function mixHex(a: string, b: string, t: number): string {
  const k = Math.max(0, Math.min(1, t));
  const ch = (hex: string, i: number) => parseInt(hex.slice(1 + i * 2, 3 + i * 2), 16);
  const m = (i: number) => Math.round(ch(a, i) + (ch(b, i) - ch(a, i)) * k);
  return `rgb(${m(0)},${m(1)},${m(2)})`;
}

type Spark = { x: number; y: number; vx: number; vy: number; born: number; life: number; r: number; color: string };
let sparks: Spark[] = [];

/** A burst of four-point glints flying out from a point, in HUD space. */
function burst(x: number, y: number, n: number, color: string, speed: number, now: number, r: number) {
  if (REDUCED) return;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * TAU + Math.random() * 0.6;
    const v = speed * (0.45 + Math.random() * 0.75);
    sparks.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 8, born: now, life: 520 + Math.random() * 380, r: r * (0.6 + Math.random() * 0.7), color: i % 3 === 0 ? SPARK_WHITE : color });
  }
  if (sparks.length > 90) sparks = sparks.slice(-90);
}

function starPath(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, rot: number) {
  ctx.beginPath();
  for (let i = 0; i < 8; i++) {
    const a = rot + (i * Math.PI) / 4;
    const rr = i % 2 === 0 ? r : r * 0.26;
    if (i === 0) ctx.moveTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
    else ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
  }
  ctx.closePath();
}

function drawSparks(ctx: CanvasRenderingContext2D, now: number) {
  if (!sparks.length) return;
  sparks = sparks.filter((p) => now - p.born < p.life);
  for (const p of sparks) {
    const age = now - p.born;
    const t = age / p.life, sec = age / 1000;
    ctx.globalAlpha = (1 - t) * (0.6 + 0.4 * Math.sin(age / 75));
    ctx.fillStyle = p.color;
    starPath(ctx, p.x + p.vx * sec * (1 - t * 0.4), p.y + p.vy * sec + 40 * sec * sec, p.r * (1 - t * 0.5), age / 160);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

/** A soft diagonal band of light crossing a rect left to right as `t` runs 0 to 1. */
function sheen(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, t: number, color: string) {
  if (REDUCED || w < 4) return;
  const bw = Math.max(10, w * 0.35);
  const bx = x - bw + (w + bw) * t;
  const x0 = Math.max(x, bx), x1 = Math.min(x + w, bx + bw);
  if (x1 <= x0) return;
  const g = ctx.createLinearGradient(bx, 0, bx + bw, 0);
  g.addColorStop(0, 'rgba(255,255,255,0)');
  g.addColorStop(0.5, color);
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(x0, y, x1 - x0, h);
}

/** An idle glint that crosses a bar for the first part of every `period`. */
function glintOn(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, now: number, period: number) {
  const t = (now % period) / period;
  if (t < 0.32) sheen(ctx, x, y, w, h, t / 0.32, 'rgba(255,255,255,0.85)');
}

/** What the vitals plate remembers between frames so its numbers roll and its cues fire once. */
const vfx = {
  id: -1, at: -1e9, hp: 0, shownHp: 0, trail: 1, hold: 0, hurtAt: -1e9, healAt: -1e9,
  ammo: 0, ammoAt: -1e9, level: 0, levelAt: -1e9, shownFrac: 0, shownScore: 0, streak: 0, streakAt: -1e9, abilitySpark: -1, levelBurst: false,
};

function stepVitals({ dt, now }: Hud, me: PlayerView, self: SelfView, displayLevel: number, frac: number) {
  const hpFrac = me.hp / me.maxHp;
  const fresh = vfx.id !== me.id || now - vfx.at > 400;
  vfx.id = me.id;
  vfx.at = now;
  if (fresh) {
    Object.assign(vfx, { hp: me.hp, shownHp: me.hp, trail: hpFrac, ammo: self.ammo, level: displayLevel, shownFrac: frac, shownScore: me.score, streak: self.streak, hurtAt: -1e9, healAt: -1e9 });
    sparks = [];
    return;
  }
  if (me.hp < vfx.hp - 0.5) { vfx.hurtAt = now; vfx.hold = now + 360; vfx.trail = Math.max(vfx.trail, vfx.hp / me.maxHp); }
  else if (me.hp > vfx.hp + 0.5) vfx.healAt = now;
  vfx.hp = me.hp;
  if (hpFrac > vfx.trail) vfx.trail = hpFrac;
  else if (now > vfx.hold) vfx.trail = Math.max(hpFrac, vfx.trail - dt * 0.0007);
  const ease = REDUCED ? 1 : 1 - Math.exp(-dt / 90);
  vfx.shownHp += (me.hp - vfx.shownHp) * ease;
  if (Math.abs(vfx.shownHp - me.hp) < 0.5) vfx.shownHp = me.hp;
  if (self.ammo !== vfx.ammo) vfx.ammoAt = now;
  vfx.ammo = self.ammo;
  if (displayLevel > vfx.level) { vfx.levelAt = now; vfx.shownFrac = 0; vfx.levelBurst = true; }
  vfx.level = displayLevel;
  vfx.shownFrac += (frac - vfx.shownFrac) * (REDUCED ? 1 : 1 - Math.exp(-dt / 140));
  vfx.shownScore += (me.score - vfx.shownScore) * (REDUCED ? 1 : 1 - Math.exp(-dt / 160));
  if (Math.abs(vfx.shownScore - me.score) < 0.6) vfx.shownScore = me.score;
  if (self.streak > vfx.streak) vfx.streakAt = now;
  vfx.streak = self.streak;
}

/** The health bar: the fill, a pale chunk behind it that holds then drains after a hit, a white flash on the hit, and a green shimmer on a heal. */
function drawHealthBar(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, frac: number, fill: CanvasGradient, track: string, now: number) {
  bar(ctx, x, y, w, h, frac, fill, track);
  if (vfx.trail > frac + 0.004) {
    const x0 = x + Math.max(h, w * frac), x1 = x + Math.max(h, w * vfx.trail);
    ctx.fillStyle = now < vfx.hold || REDUCED ? '#fff1d2' : '#f2c27a';
    ctx.fillRect(x0 - 1, y, Math.max(0, x1 - x0 + 1), h);
  }
  const hurt = popOf(now - vfx.hurtAt, 260);
  if (hurt > 0) {
    ctx.globalAlpha = hurt * 0.75;
    ctx.fillStyle = '#fff1d2';
    ctx.fillRect(x, y, Math.max(h, w * frac), h);
    ctx.globalAlpha = 1;
  }
  const heal = (now - vfx.healAt) / 750;
  if (heal >= 0 && heal < 1) sheen(ctx, x, y, Math.max(h, w * frac), h, heal, 'rgba(143,240,196,0.95)');
}

/** The vitals plate: its bar widths, inner padding, row step and full height (the touch minimap sits just below it). */
const VITALS = { bar: 200, compactBar: 140, barH: 8, row: 30, pad: 12, height: 126 } as const;

function drawAmmoGlyph(ctx: CanvasRenderingContext2D, x: number, y: number, color: string) {
  ctx.fillStyle = color;
  ctx.beginPath();
  for (let i = 0; i < 4; i++) {
    const bx = x + i * 6;
    ctx.moveTo(bx, y + 7);
    ctx.lineTo(bx, y - 4);
    ctx.lineTo(bx + 2, y - 8);
    ctx.lineTo(bx + 4, y - 4);
    ctx.lineTo(bx + 4, y + 7);
    ctx.closePath();
  }
  ctx.fill();
}

/** Health, ammo, gun and level, and the ability and perks, on one plate in the top left, sized to what it holds. */
function drawVitals(hud: Hud, compact: boolean) {
  const { ctx, snap, me, w, now } = hud;
  if (!me) return;
  const on = ON_PANEL;
  const self = snap.self;
  const x = EDGE + VITALS.pad;
  let y = EDGE + VITALS.pad + 6;
  const bw = compact ? VITALS.compactBar : Math.min(VITALS.bar, w * 0.22);
  const hpFrac = me.hp / me.maxHp;
  const hpText = `${Math.ceil(vfx.shownHp)} / ${me.maxHp}`;
  const gun = GUNS[me.gun];
  const gunName = gun.name.toUpperCase();
  const lp = levelProgress(me.level, me.score);
  stepVitals(hud, me, self, lp.displayLevel, lp.frac);
  const owned = ([1, 2, 3] as Tier[]).flatMap((t) => (self.perks[t] && t !== ABILITY_TIER ? [self.perks[t]!] : []));
  setFont(ctx, 600, TYPE.body);
  const hpRow = bw + 10 + ctx.measureText(hpText).width + (me.hunted ? huntedBadgeWidth(ctx) + 10 : 0) + (self.streak >= 2 ? streakBadgeWidth(ctx, self.streak) + 10 : 0);
  setFont(ctx, 700, TYPE.label);
  const gunRow = ctx.measureText(gunName).width + gun.stage * 9 + 148;
  const abilityRow = abilityWidth(ctx, self) + 14 + owned.length * 22;
  panel(ctx, EDGE, EDGE, Math.max(hpRow, gunRow, abilityRow) + VITALS.pad * 2 + 4, VITALS.height);
  const fill = ctx.createLinearGradient(x, 0, x + bw, 0);
  fill.addColorStop(0, HP_FILL[0]);
  fill.addColorStop(1, HP_FILL[1]);
  drawHealthBar(ctx, x, y - VITALS.barH / 2, bw, VITALS.barH, hpFrac, fill, on.track, now);
  const lowHp = hpFrac <= 0.35;
  const hurtPop = popOf(now - vfx.hurtAt, 220);
  const hpPulse = lowHp && !REDUCED ? 0.5 + 0.5 * Math.sin(now / (hpFrac <= 0.15 ? 90 : 160)) : 0;
  text(ctx, hpText, x + bw + 10, y + 1, TYPE.body, lowHp ? mixHex(PALETTE.hpBad, '#ffd0d0', hpPulse * 0.6) : popOf(now - vfx.healAt, 420) > 0 ? HEAL : on.ink, 'left', 600 + Math.round(hurtPop * 100));
  setFont(ctx, 600, TYPE.body);
  let bx = x + bw + 20 + ctx.measureText(hpText).width;
  if (me.hunted) bx += drawHuntedBadge(ctx, bx, y) + 10;
  if (self.streak >= 2) drawStreakBadge(ctx, bx, y, self.streak, now);
  y += VITALS.row;
  drawAmmoGlyph(ctx, x, y, on.glyph);
  if (self.reloading) {
    text(ctx, 'RELOADING', x + 34, y + 1, TYPE.body, PALETTE.gold, 'left', 800);
    bar(ctx, x + 112, y - 2, 60, 4, self.reloadFrac, PALETTE.gold, on.track);
    glintOn(ctx, x + 112, y - 2, 60 * self.reloadFrac, 4, now, 700);
  } else {
    const empty = self.ammo === 0;
    const low = self.ammo <= Math.max(1, Math.round(self.mag * 0.25));
    const throb = low && !REDUCED ? 0.5 + 0.5 * Math.sin(now / (empty ? 80 : 150)) : 0;
    const pop = popOf(now - vfx.ammoAt, 190);
    ctx.translate(x + 34, y + 1);
    const sc = 1 + 0.38 * pop * pop;
    ctx.scale(sc, sc);
    text(ctx, `${self.ammo}`, 0, 0, TYPE.figure, low ? mixHex(PALETTE.hpBad, '#ffffff', empty ? 0.1 + throb * 0.35 : throb * 0.4) : on.ink, 'left', 800);
    ctx.scale(1 / sc, 1 / sc);
    ctx.translate(-(x + 34), -(y + 1));
    setFont(ctx, 800, TYPE.figure);
    text(ctx, `/ ${self.mag}`, x + 38 + ctx.measureText(`${self.ammo}`).width, y + 3, TYPE.body, on.muted, 'left', 600);
    if (low && !REDUCED) {
      ctx.globalAlpha = 0.18 + throb * 0.3;
      ctx.strokeStyle = PALETTE.hpBad;
      ctx.lineWidth = 1.5;
      ctx.strokeRect(x - 4, y - 14, 112, 28);
      ctx.globalAlpha = 1;
    }
  }
  y += 26;
  text(ctx, gunName, x, y, TYPE.label, gun.stage ? glow(gun.look.accent, 0.74) : on.ink, 'left', 700);
  setFont(ctx, 700, TYPE.label);
  let lx = x + ctx.measureText(gunName).width + 6;
  if (gun.stage) { drawStagePips(ctx, me.gun, lx, y); lx += gun.stage * 9 + 4; }
  const lvPop = popOf(now - vfx.levelAt, 380);
  setFont(ctx, 700, TYPE.label);
  const lvW = ctx.measureText(`LV ${lp.displayLevel}`).width;
  ctx.translate(lx + 4 + lvW / 2, y);
  const lvS = 1 + 0.45 * lvPop;
  ctx.scale(lvS, lvS);
  text(ctx, `LV ${lp.displayLevel}`, -lvW / 2, 0, TYPE.label, lvPop > 0 ? mixHex(on.muted, PALETTE.gold, lvPop) : on.muted, 'left', 700);
  ctx.scale(1 / lvS, 1 / lvS);
  ctx.translate(-(lx + 4 + lvW / 2), -y);
  const barX = lx + 40;
  if (vfx.levelBurst) { vfx.levelBurst = false; burst(barX + 22, y, 18, PALETTE.gold, 80, now, 5.5); }
  bar(ctx, barX, y - 1.5, 44, 3, vfx.shownFrac, PALETTE.gold, on.track);
  glintOn(ctx, barX, y - 1.5, 44 * vfx.shownFrac, 3, now, 2600);
  text(ctx, String(Math.round(vfx.shownScore)), barX + 52, y, TYPE.label, PALETTE.gold, 'left', 700);
  y += 26;
  drawAbility(ctx, x, y, self, on);
  let px = x + abilityWidth(ctx, self) + 14;
  for (const perk of owned) {
    strokeIcon(ctx, PERK_ICONS[perk], px + 7, y, 14, on.glyph, 2.2);
    px += 22;
  }
  drawSparks(ctx, now);
}

type SelfView = Snapshot['self'];

const abilityLabel = (self: SelfView): string =>
  self.ability ? (self.abilityReadyIn > 0 ? `${(self.abilityReadyIn / 1000).toFixed(1)}s` : touchScreen ? 'READY' : 'READY · SPACE') : abilityHint(self.pending).join(' ');

function abilityWidth(ctx: CanvasRenderingContext2D, self: SelfView): number {
  setFont(ctx, 700, self.ability ? TYPE.body : TYPE.micro);
  return 30 + ctx.measureText(abilityLabel(self)).width;
}

function drawAbility(ctx: CanvasRenderingContext2D, x: number, y: number, self: SelfView, on: OnWorld) {
  const muted = touchScreen ? on.ink : on.muted;
  if (!self.ability) {
    worldText(ctx, on, abilityLabel(self), x, y, TYPE.micro, muted, 600);
    return;
  }
  const ready = self.abilityReadyIn <= 0;
  const left = Math.max(0, Math.min(1, self.abilityReadyIn / ABILITY_COOLDOWN_MS[self.ability]));
  const denied = !ready && performance.now() - abilityDeniedAt < ABILITY_CUE.deniedMs;
  const cx = x + 12 + deniedShake(performance.now());
  ctx.lineWidth = 3;
  ctx.strokeStyle = on.track;
  ctx.beginPath();
  ctx.arc(cx, y, 13, 0, TAU);
  ctx.stroke();
  ctx.strokeStyle = denied ? PALETTE.hpBad : PALETTE.gold;
  ctx.beginPath();
  ctx.arc(cx, y, 13, -Math.PI / 2, -Math.PI / 2 + (1 - left) * TAU);
  ctx.stroke();
  const pulse = (performance.now() - abilityBackAt) / ABILITY_CUE.readyPulseMs;
  if (ready && pulse >= 0 && pulse < 1) {
    if (!REDUCED && vfx.abilitySpark !== abilityBackAt) { vfx.abilitySpark = abilityBackAt; burst(cx, y, 9, PALETTE.gold, 34, performance.now(), 4.5); }
    ctx.globalAlpha = 1 - pulse;
    ctx.lineWidth = 3;
    ctx.strokeStyle = PALETTE.gold;
    ctx.beginPath();
    ctx.arc(cx, y, 13 + pulse * 14, 0, TAU);
    ctx.stroke();
    ctx.globalAlpha = 1;
  }
  strokeIcon(ctx, PERK_ICONS[self.ability], cx, y, 13, ready ? PALETTE.gold : denied ? PALETTE.hpBad : muted, 2.2);
  worldText(ctx, on, abilityLabel(self), x + 30, y + 1, TYPE.body, ready ? PALETTE.gold : denied ? PALETTE.hpBad : on.ink, 750);
}

function streakBadgeWidth(ctx: CanvasRenderingContext2D, streak: number): number {
  setFont(ctx, 850, TYPE.body);
  return ctx.measureText(`${streak}`).width + 26;
}

function huntedBadgeWidth(ctx: CanvasRenderingContext2D): number {
  setFont(ctx, 800, TYPE.micro);
  return ctx.measureText('HUNTED').width + 24;
}

/** Your kills this life, once there are two: a flame and the count, hotter-looking as it climbs. */
function drawStreakBadge(ctx: CanvasRenderingContext2D, x: number, y: number, streak: number, now: number) {
  const label = `${streak}`;
  const bw = streakBadgeWidth(ctx, streak);
  const heat = Math.min(1, (streak - 1) / 8);
  const pop = popOf(now - vfx.streakAt, 260);
  const grow = 1 + 0.05 * Math.min(8, streak - 2) + 0.42 * pop;
  const cx = x + bw / 2;
  ctx.translate(cx, y);
  ctx.scale(grow, grow);
  if (heat > 0.2 && !REDUCED) {
    ctx.globalAlpha = 0.25 + 0.2 * Math.sin(now / 120) + heat * 0.25;
    ctx.fillStyle = '#ffb347';
    ctx.beginPath();
    ctx.roundRect(-bw / 2 - 3, -13, bw + 6, 26, 7);
    ctx.fill();
    ctx.globalAlpha = 1;
  }
  ctx.beginPath();
  ctx.roundRect(-bw / 2, -10, bw, 20, 4);
  ctx.fillStyle = mixHex('#e8481a', '#ffa21f', heat);
  ctx.fill();
  const flick = REDUCED ? 1 : 1 + 0.12 * Math.sin(now / 70 + streak) * (0.4 + heat);
  ctx.translate(-bw / 2 + 10, -0.5);
  ctx.scale(1, flick);
  fillIcon(ctx, UI_ICONS.flame, 0, 0, 13 + heat * 3, '#fff4e0');
  ctx.scale(1, 1 / flick);
  ctx.translate(bw / 2 - 10, 0.5);
  text(ctx, label, -bw / 2 + 19, 0.5, TYPE.body, '#ffffff', 'left', 850);
  ctx.scale(1 / grow, 1 / grow);
  ctx.translate(-cx, -y);
}

function drawHuntedBadge(ctx: CanvasRenderingContext2D, x: number, y: number): number {
  setFont(ctx, 800, TYPE.micro);
  const bw = ctx.measureText('HUNTED').width + 24;
  ctx.beginPath();
  ctx.roundRect(x, y - 9, bw, 18, 4);
  ctx.fillStyle = PALETTE.hunted;
  ctx.fill();
  strokeIcon(ctx, UI_ICONS.target, x + 9, y, 10, '#ffffff', 2.2);
  text(ctx, 'HUNTED', x + 17, y + 0.5, TYPE.micro, '#ffffff', 'left', 800);
  return bw;
}

function drawStagePips(ctx: CanvasRenderingContext2D, gun: GunId, x: number, y: number) {
  const { stage, look } = GUNS[gun];
  ctx.fillStyle = look.accent;
  for (let i = 0; i < stage; i++) {
    const cx = x + 3.5 + i * 9;
    ctx.beginPath();
    ctx.moveTo(cx, y - 3.5);
    ctx.lineTo(cx + 3.5, y);
    ctx.lineTo(cx, y + 3.5);
    ctx.lineTo(cx - 3.5, y);
    ctx.closePath();
    ctx.fill();
  }
}

const ABILITY_TIER: Tier = 3;
export const ABILITY_SCORE = LEVELS.find((l) => l.pick?.k === 'perk' && l.pick.tier === ABILITY_TIER)?.score;

export const abilityHint = (pending: PendingPick | null): [string, string] =>
  pending?.k === 'perk' && pending.tier === ABILITY_TIER ? ['Pick an', 'ability'] : ['Ability', `at ${ABILITY_SCORE}`];
