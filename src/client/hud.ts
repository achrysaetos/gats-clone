import { STICK_RADIUS, stickVector, type Sticks } from './touch.ts';
import { ABILITY_COOLDOWN_MS, GUN_IDS, GUNS, LEVELS, PERK_INFO, WORLD, ZOM, ZOMBIE_KINDS, ZOMBIES, type BuildingKind, type GunId, type PendingPick, type PerkId, type Tier } from '../shared/defs.ts';
import { MAP_MS } from '../shared/maps.ts';
import type { PlayerView, Snapshot } from '../shared/protocol.ts';
import { worldToScreen, type Camera, type Point } from './camera.ts';
import { clearOfRects, clock, edgePoint, feedMentions, levelProgress, mapNotice, mostKillsText, objectiveFor, roundTimeLeft, topScorers, type Rect } from './derive.ts';
import { ASSIST_MS, HITMARKER_MS, HURT_ARC_MS, HURT_MS } from './feedback.ts';
import { serverNow } from './interp.ts';
import { PERK_ICONS, strokeIcon, UI_ICONS } from './icons.ts';
import { CALLOUT_MS, POPUP_MS, RING_MS } from './moments.ts';
import { PALETTE, TEAM_COLORS, ZOMBIE_LOOK } from './palette.ts';
import { CORE_ALERT_MS } from './siege.ts';
import { BUILD_HINTS, downedLine, phaseLine, useHint } from './zombies.ts';
import { drawGunGlyph } from './sprites.ts';
import type { Session } from './state.ts';

const HUD_FONT = 'system-ui, -apple-system, "Segoe UI", sans-serif';
const TYPE = { micro: 10, label: 11, body: 13, title: 15, figure: 22 } as const;
const SPACE = { sm: 8, md: 12, lg: 16 } as const;
const HUD_INK = '#f2f3f5';
const MUTED = '#9ba2ae';
const PANEL_FILL = 'rgba(28, 32, 40, 0.82)';
const PANEL_RADIUS = 10;
const EDGE = 12;
const FEED_ROW = 30;
const ROW_GAP = 8;
const FEED_MS = 6000;
const TAU = Math.PI * 2;
const HURT_BANDS = 12;

type Hud = { ctx: CanvasRenderingContext2D; w: number; h: number; snap: Snapshot; s: Session; me: PlayerView | null; now: number; dt: number; cam: Camera; selfAt: Point };

const GUN_BY_NAME = new Map<string, GunId>(GUN_IDS.map((id) => [GUNS[id].name, id]));
const PERK_BY_NAME = new Map<string, PerkId>(Object.entries(PERK_INFO).map(([id, info]) => [info.name, id as PerkId]));

export function drawSticks(ctx: CanvasRenderingContext2D, sticks: Sticks) {
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
export function drawHud(ctx: CanvasRenderingContext2D, dpr: number, cam: Camera, snap: Snapshot, s: Session, now: number, crosshair: Point, spread: number | null) {
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  hudFont = '';
  const { w, h } = cam;
  const me = snap.players.find((p) => p.id === s.myId) ?? null;
  const hud: Hud = { ctx, w, h, snap, s, me, now, dt: Math.min(100, Math.max(0, now - lastHudAt)), cam, selfAt: worldToScreen(cam, s.lastSelf) };
  lastHudAt = now;
  panels = [];
  buildChips = [];
  const compact = w < 640;
  const feedRows = compact ? 3 : 5;
  drawHurtVignette(hud);
  drawHurtArcs(hud);
  drawMinimap(hud, EDGE, EDGE + (snap.run ? SQUAD_CHIP_H : 0), compact ? 96 : 170);
  drawKillFeed(hud, feedRows);
  drawLeaderboard(hud, EDGE + feedRows * FEED_ROW + ROW_GAP, compact);
  const below = drawPill(hud, compact);
  ctx.globalAlpha = 1;
  const siegeTop = drawObjectiveLine(hud, below, compact);
  if (me?.alive) { drawVitals(hud, compact); drawWeapon(hud, compact); }
  if (snap.run) drawSiege(hud, snap.run, siegeTop, compact);
  drawHuntedArrows(hud);
  drawScorePopups(hud);
  drawCallouts(hud);
  if (spread !== null) drawReticle(hud, crosshair, spread);
  drawHitmarker(hud, crosshair);
  drawAssist(hud, crosshair);
}

/** Stacked translucent edge bands instead of a full-screen radial gradient, which costs several milliseconds to rasterize. */
function drawHurtVignette({ ctx, w, h, s, now }: Hud) {
  const hurt = s.feedback.hurt;
  if (!hurt) return;
  const k = (now - hurt.born) / HURT_MS;
  if (k < 0 || k >= 1) return;
  const depth = Math.min(w, h) * 0.2;
  const step = depth / HURT_BANDS;
  ctx.fillStyle = 'rgb(200, 20, 20)';
  ctx.globalAlpha = ((0.15 + 0.3 * hurt.strength) * (1 - k)) / HURT_BANDS;
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

function drawHuntedArrows({ ctx, w, h, snap, now, cam, selfAt }: Hud) {
  const pulse = 0.5 + 0.5 * Math.sin(now / 140);
  for (const m of snap.minimap) {
    if (m.pingAge === null) continue;
    const at = edgePoint(selfAt, worldToScreen(cam, m), w, h, EDGE_INSET);
    if (!at) continue;
    const clear = clearOfRects(selfAt, at, panels, ARROW_CLEARANCE);
    ctx.save();
    ctx.translate(clear.x, clear.y);
    ctx.rotate(at.angle);
    ctx.scale(1 + 0.15 * pulse, 1 + 0.15 * pulse);
    ctx.globalAlpha = 0.65 + 0.35 * pulse;
    ctx.beginPath();
    ctx.moveTo(14, 0);
    ctx.lineTo(-8, -12);
    ctx.lineTo(-3, 0);
    ctx.lineTo(-8, 12);
    ctx.closePath();
    ctx.fillStyle = PALETTE.hunted;
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.lineJoin = 'round';
    ctx.strokeStyle = '#000';
    ctx.stroke();
    ctx.restore();
  }
  ctx.globalAlpha = 1;
}

const ARC = { radius: 62, half: 0.55 } as const;

function drawHurtArcs({ ctx, s, now, selfAt }: Hud) {
  ctx.lineCap = 'round';
  for (const arc of s.feedback.arcs) {
    const k = (now - arc.born) / HURT_ARC_MS;
    if (k < 0 || k >= 1) continue;
    const r = ARC.radius + 8 * k;
    for (const [width, color, alpha] of [[11, 'rgba(0,0,0,0.5)', 0.6], [6, PALETTE.hunted, 1]] as const) {
      ctx.globalAlpha = alpha * (1 - k * k) * (0.55 + 0.45 * arc.strength);
      ctx.lineWidth = width;
      ctx.strokeStyle = color;
      ctx.beginPath();
      ctx.arc(selfAt.x, selfAt.y, r, arc.angle - ARC.half, arc.angle + ARC.half);
      ctx.stroke();
    }
  }
  ctx.globalAlpha = 1;
}

function drawAssist({ ctx, s, now }: Hud, at: Point) {
  const assist = s.feedback.assist;
  if (!assist) return;
  const k = (now - assist.born) / ASSIST_MS;
  if (k < 0 || k >= 1) return;
  ctx.globalAlpha = 1 - k * k;
  outlined(ctx, `+${WORLD.assistScore} assist`, at.x, at.y - 34 - 18 * k, 17, PALETTE.gold, 850);
  ctx.globalAlpha = 1;
}

function drawScorePopups({ ctx, s, now, cam }: Hud) {
  for (const p of s.moments.popups) {
    const k = (now - p.born) / POPUP_MS;
    if (k < 0 || k >= 1) continue;
    const at = worldToScreen(cam, p);
    ctx.globalAlpha = 1 - k * k * k;
    outlined(ctx, `+${p.amount}`, at.x, at.y - 40 - 50 * k, Math.round(22 + 6 * Math.max(0, 1 - k * 5)), PALETTE.gold, 900);
  }
  ctx.globalAlpha = 1;
}

const CALLOUT_GAP = 54;

function drawCallouts({ ctx, w, h, s, now, selfAt }: Hud) {
  let row = 0;
  for (const c of s.moments.callouts) {
    const age = now - c.born;
    if (age < 0 || age >= CALLOUT_MS) continue;
    if (c.ring && age < RING_MS) drawRingBurst(ctx, selfAt, c.color, age);
    const pop = 1 + 0.35 * Math.max(0, 1 - age / 160);
    ctx.globalAlpha = Math.min(1, age / 90, (CALLOUT_MS - age) / 450);
    const y = h * 0.26 + row * CALLOUT_GAP;
    outlined(ctx, c.title, w / 2, y, Math.round(30 * pop), c.color, 900);
    outlined(ctx, c.line, w / 2, y + 24, TYPE.body + 1, HUD_INK, 650);
    row++;
  }
  ctx.globalAlpha = 1;
}

function drawRingBurst(ctx: CanvasRenderingContext2D, at: Point, color: string, age: number) {
  for (const lag of [0, 140]) {
    const k = (age - lag) / (RING_MS - lag);
    if (k <= 0 || k >= 1) continue;
    ctx.globalAlpha = 1 - k;
    ctx.lineWidth = 7 * (1 - k) + 1;
    ctx.strokeStyle = color;
    ctx.beginPath();
    ctx.arc(at.x, at.y, 24 + 130 * (1 - (1 - k) ** 3), 0, TAU);
    ctx.stroke();
  }
}

const RETICLE = { minGap: 5, maxGap: 90, tick: 8 } as const;

/** Ticks sit where the spread cone crosses the cursor's distance, so the reticle opens up with spread and closes with Grip or a planted Bipod. */
export const reticleGap = (spread: number, distPx: number): number =>
  Math.min(RETICLE.maxGap, Math.max(RETICLE.minGap, Math.tan(spread) * distPx));

function drawReticle({ ctx, snap, selfAt }: Hud, at: Point, spread: number) {
  const gap = reticleGap(spread, Math.hypot(at.x - selfAt.x, at.y - selfAt.y));
  ctx.lineCap = 'round';
  for (const [width, color] of [[4.5, 'rgba(0,0,0,0.55)'], [2, '#ffffff']] as const) {
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
  if (!snap.self.reloading) return;
  const r = gap + RETICLE.tick + 6;
  ctx.lineWidth = 3;
  ctx.strokeStyle = 'rgba(0,0,0,0.45)';
  ctx.beginPath();
  ctx.arc(at.x, at.y, r, 0, TAU);
  ctx.stroke();
  ctx.strokeStyle = PALETTE.gold;
  ctx.beginPath();
  ctx.arc(at.x, at.y, r, -Math.PI / 2, -Math.PI / 2 + snap.self.reloadFrac * TAU);
  ctx.stroke();
}

function drawHitmarker({ ctx, s, now }: Hud, at: Point) {
  const hm = s.feedback.hitmarker;
  if (!hm) return;
  const k = (now - hm.born) / HITMARKER_MS[hm.kill ? 'kill' : 'hit'];
  if (k < 0 || k >= 1) return;
  const [inner, outer] = hm.kill ? [7, 17] : [5, 11];
  const pop = 1 + (1 - k) * 0.25;
  ctx.globalAlpha = 1 - k * k;
  ctx.lineCap = 'round';
  for (const [width, color] of [[5, 'rgba(0,0,0,0.6)'], [hm.kill ? 3 : 2.5, hm.kill ? '#ff4d4f' : '#ffffff']] as const) {
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

const MINIMAP_BUILDING: Record<BuildingKind, string> = { wall: 'rgba(205, 182, 138, 0.9)', sentry: '#f5c400', cannon: '#ff6b3d' };

/** Panels drawn this frame, so edge markers drawn after them can stay clear. */
let panels: Rect[] = [];

function panel(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, accent?: string, radius: number | number[] = PANEL_RADIUS) {
  panels.push({ x, y, w, h });
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, radius);
  ctx.fillStyle = PANEL_FILL;
  ctx.fill();
  if (!accent) return;
  ctx.fillStyle = accent;
  ctx.fillRect(x + PANEL_RADIUS, y, w - PANEL_RADIUS * 2, 2);
}

function bar(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, frac: number, color: string) {
  ctx.fillStyle = 'rgba(255,255,255,0.1)';
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, h / 2);
  ctx.fill();
  const f = Math.max(0, Math.min(1, frac));
  if (f <= 0) return;
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.roundRect(x, y, Math.max(h, w * f), h, h / 2);
  ctx.fill();
}

/** Assigning ctx.font reparses the string every time, so skip the assignment when the HUD's last font is still set. */
let hudFont = '';
let lastHudAt = 0;
const fonts = new Map<number, string>();
function setFont(ctx: CanvasRenderingContext2D, weight: number, size: number) {
  const key = weight * 1000 + size;
  let font = fonts.get(key);
  if (!font) fonts.set(key, (font = `${weight} ${size}px ${HUD_FONT}`));
  if (font !== hudFont) { ctx.font = font; hudFont = font; }
}

function text(ctx: CanvasRenderingContext2D, s: string, x: number, y: number, size: number, color = HUD_INK, align: CanvasTextAlign = 'left', weight = 600) {
  setFont(ctx, weight, size);
  ctx.fillStyle = color;
  ctx.textAlign = align;
  ctx.textBaseline = 'middle';
  ctx.fillText(s, x, y);
}

function outlined(ctx: CanvasRenderingContext2D, s: string, x: number, y: number, size: number, color: string, weight: number) {
  setFont(ctx, weight, size);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round';
  ctx.lineWidth = Math.max(3, size / 5);
  ctx.strokeStyle = 'rgba(10, 11, 14, 0.85)';
  ctx.strokeText(s, x, y);
  ctx.fillStyle = color;
  ctx.fillText(s, x, y);
}

function caps(ctx: CanvasRenderingContext2D, s: string, x: number, y: number, color = MUTED, align: CanvasTextAlign = 'left') {
  text(ctx, s.toUpperCase(), x, y, TYPE.micro, color, align, 750);
}

const FEED_ICON_W = 40;
const BOUNTY_TAG = `+${WORLD.bountyScore} BOUNTY`;

/** Class guns read as their icon; an evolved gun is spelled out in its accent color, since its silhouette is easy to mistake. */
function feedWeapon(ctx: CanvasRenderingContext2D, label: string): { width: number; draw(x: number, y: number): void } {
  const gun = GUN_BY_NAME.get(label);
  if (gun && GUNS[gun].stage === 0) {
    return { width: FEED_ICON_W, draw: (x, y) => drawGunGlyph(ctx, gun, x, y, FEED_ICON_W - SPACE.sm, 12, HUD_INK) };
  }
  const perk = PERK_BY_NAME.get(label);
  if (perk) return { width: 22, draw: (x, y) => strokeIcon(ctx, PERK_ICONS[perk], x + 9, y, 15, HUD_INK, 2.4) };
  const [color, weight] = gun ? [GUNS[gun].look.accent, 800] : [MUTED, 500];
  setFont(ctx, weight, TYPE.label);
  return { width: ctx.measureText(label).width + SPACE.sm, draw: (x, y) => text(ctx, label, x, y, TYPE.label, color, 'left', weight) };
}

/** Rows hang from the top-right corner, each sized to its line and right-aligned, killer and victim either side of a white weapon glyph. */
function drawKillFeed(hud: Hud, rows: number) {
  const { ctx, w, s, now } = hud;
  const lines = s.feed.filter((f) => now - f.at < FEED_MS).slice(-rows);
  const right = w - EDGE;
  lines.forEach((f, i) => {
    const y = EDGE + i * FEED_ROW + 13;
    ctx.globalAlpha = Math.min(1, (FEED_MS - (now - f.at)) / 600);
    setFont(ctx, 700, TYPE.body);
    if (f.e === 'life') {
      const by = f.by === null ? null : hud.snap.players.find((p) => p.id === f.by)?.name ?? hud.snap.leaderboard.find((r) => r.id === f.by)?.name;
      const [line, color] = f.k === 'downed' ? [`${f.name} is down`, PALETTE.hunted] : f.k === 'revived' ? [by ? `${by} revived ${f.name}` : `${f.name} is back up`, PALETTE.hpGood] : [`${f.name} bled out`, MUTED];
      const pw = ctx.measureText(line).width + SPACE.md * 2;
      panel(ctx, right - pw, y - 13, pw, 26, color, 7);
      text(ctx, line, right - pw + SPACE.md, y, TYPE.body, f.id === s.myId ? PALETTE.gold : HUD_INK, 'left', 700);
      ctx.globalAlpha = 1;
      return;
    }
    if (f.e === 'hunted') {
      const line = `${f.name} is hunted`;
      const pw = ctx.measureText(line).width + 22 + SPACE.md * 2;
      panel(ctx, right - pw, y - 13, pw, 26, PALETTE.hunted, 7);
      strokeIcon(ctx, UI_ICONS.target, right - pw + SPACE.md + 7, y, 14, PALETTE.hunted, 2.4);
      text(ctx, line, right - pw + SPACE.md + 20, y, TYPE.body, f.id === s.myId ? PALETTE.gold : HUD_INK, 'left', 700);
      ctx.globalAlpha = 1;
      return;
    }
    const kw = f.killer ? ctx.measureText(f.killer).width : 0;
    const vw = ctx.measureText(f.victim).width;
    const weapon = feedWeapon(ctx, f.weapon);
    setFont(ctx, 800, TYPE.micro);
    const bw = f.bounty ? ctx.measureText(BOUNTY_TAG).width + SPACE.sm : 0;
    const mine = feedMentions(f, s.myId);
    const pw = kw + vw + weapon.width + bw + SPACE.md * 2 + (f.killer ? SPACE.sm : 0);
    let x = right - pw;
    panel(ctx, x, y - 13, pw, 26, mine ? PALETTE.gold : f.bounty ? PALETTE.hunted : undefined, 7);
    x += SPACE.md;
    if (f.killer) { text(ctx, f.killer, x, y, TYPE.body, nameColor(hud, f.killerId), 'left', 700); x += kw + SPACE.sm; }
    weapon.draw(x, y);
    x += weapon.width;
    text(ctx, f.victim, x, y, TYPE.body, nameColor(hud, f.victimId), 'left', 700);
    if (f.bounty) text(ctx, BOUNTY_TAG, x + vw + SPACE.sm, y, TYPE.micro, PALETTE.hunted, 'left', 800);
    ctx.globalAlpha = 1;
  });
}

const FEED_TEAM = { red: '#ff7b7f', blue: '#7b9bff' } as const;

/** You read gold; in team modes everyone else reads in their team's color, so the feed shows who traded with whom. */
function nameColor({ s, snap }: Hud, id: number | null): string {
  if (id === s.myId) return PALETTE.gold;
  const team = id === null ? null : snap.leaderboard.find((r) => r.id === id)?.team ?? null;
  return team && !snap.run ? FEED_TEAM[team] : HUD_INK;
}

const timeLeft = ({ snap, s, now }: Hud) => roundTimeLeft(snap.match, serverNow(s.snaps, now));

function drawLeaderboard(hud: Hud, top: number, compact: boolean) {
  const { ctx, w, h, snap, s } = hud;
  const rows = topScorers(snap.leaderboard, compact || h < 760 ? 5 : 10);
  const teams = snap.match.mode === 'TDM' || snap.match.mode === 'DOM';
  const squad = !!snap.run;
  const pw = compact ? 150 : 200;
  const x = w - pw - EDGE;
  const rowH = 20;
  const ph = 34 + rows.length * rowH + (squad ? 0 : 16);
  fadePanel(hud, 'board', x, top, pw, ph);
  panel(ctx, x, top, pw, ph);
  caps(ctx, squad ? 'Squad kills' : 'Leaderboard', x + SPACE.md, top + 16);
  text(ctx, snap.match.mode, x + pw - SPACE.md, top + 16, TYPE.label, PALETTE.gold, 'right', 800);
  let y = top + 36;
  if (!squad) {
    const goal = teams ? `First to ${snap.match.mode === 'TDM' ? WORLD.tdmWinScore : WORLD.domWinScore}` : mostKillsText(timeLeft(hud));
    text(ctx, goal[0]!.toUpperCase() + goal.slice(1), x + SPACE.md, y - 4, TYPE.micro, MUTED, 'left', 500);
    y += 16;
  }
  rows.forEach((r, i) => {
    const mine = r.id === s.myId;
    if (mine) {
      ctx.fillStyle = 'rgba(255, 211, 77, 0.14)';
      ctx.beginPath();
      ctx.roundRect(x + 6, y - rowH / 2, pw - 12, rowH, 5);
      ctx.fill();
    }
    if (r.team && teams) {
      ctx.fillStyle = TEAM_COLORS[r.team];
      ctx.beginPath();
      ctx.arc(x + SPACE.md + 4, y, 4, 0, TAU);
      ctx.fill();
    }
    text(ctx, `${i + 1}  ${r.name}`, x + SPACE.md + (r.team && teams ? 14 : 0), y, TYPE.body - 1, mine ? PALETTE.gold : HUD_INK, 'left', mine ? 750 : 550);
    text(ctx, String(r.kills), x + pw - SPACE.md, y, TYPE.body - 1, mine ? PALETTE.gold : MUTED, 'right', 650);
    y += rowH;
  });
}

export const PANEL_ALPHA = { rest: 0.85, covering: 0.3 } as const;
const PANEL_FADE_MS = 180;

export function approachAlpha(alpha: number, covering: boolean, dtMs: number): number {
  const target = covering ? PANEL_ALPHA.covering : PANEL_ALPHA.rest;
  const step = (dtMs / PANEL_FADE_MS) * (PANEL_ALPHA.rest - PANEL_ALPHA.covering);
  return alpha < target ? Math.min(target, alpha + step) : Math.max(target, alpha - step);
}

type PanelId = 'score' | 'board' | 'minimap';
const panelAlpha: Record<PanelId, number> = { score: PANEL_ALPHA.rest, board: PANEL_ALPHA.rest, minimap: PANEL_ALPHA.rest };
const fadeRects: Partial<Record<PanelId, Rect>> = {};

/** Where each panel that fades over a body was last drawn, in CSS px, so a driver can tell when a player is under one. */
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
const DIAMOND_R = 6;

function drawMinimap(hud: Hud, x: number, y: number, size: number) {
  const { ctx, snap, s, me, cam } = hud;
  const k = size / s.worldSize;
  const pad = 6;
  const base = fadePanel(hud, 'minimap', x, y, size + pad * 2, size + pad * 2);
  panel(ctx, x, y, size + pad * 2, size + pad * 2);
  x += pad;
  y += pad;
  ctx.fillStyle = 'rgba(255, 255, 255, 0.04)';
  ctx.fillRect(x, y, size, size);
  for (const wall of s.walls) {
    ctx.fillStyle = wall.built ? 'rgba(94, 143, 214, 0.9)' : 'rgba(255, 255, 255, 0.2)';
    ctx.fillRect(x + wall.x * k, y + wall.y * k, Math.max(1.5, wall.w * k), Math.max(1.5, wall.h * k));
  }
  for (const z of snap.zones) {
    ctx.beginPath();
    ctx.arc(x + z.x * k, y + z.y * k, Math.max(4, z.r * k), 0, TAU);
    ctx.fillStyle = z.owner ? TEAM_COLORS[z.owner] : PALETTE.neutral;
    ctx.globalAlpha = base * 0.5;
    ctx.fill();
    ctx.globalAlpha = base;
  }
  for (const m of snap.minimap) {
    if (m.pingAge !== null) continue;
    ctx.fillStyle = m.team ? TEAM_COLORS[m.team] : '#ff6b6b';
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
      ctx.arc(mx, my, 5 + 14 * wave, 0, TAU);
      ctx.lineWidth = 2;
      ctx.strokeStyle = PALETTE.hunted;
      ctx.stroke();
      ctx.restore();
    }
    ctx.beginPath();
    ctx.moveTo(mx, my - 5);
    ctx.lineTo(mx + 5, my);
    ctx.lineTo(mx, my + 5);
    ctx.lineTo(mx - 5, my);
    ctx.closePath();
    ctx.fillStyle = PALETTE.hunted;
    ctx.fill();
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = '#000';
    ctx.stroke();
  }
  if (snap.run) {
    for (const b of snap.buildings ?? []) {
      ctx.fillStyle = MINIMAP_BUILDING[b.kind];
      const bp = b.kind === 'wall' ? 0 : 1;
      ctx.fillRect(x + b.cx * ZOM.cell * k - bp, y + b.cy * ZOM.cell * k - bp, Math.max(1.5, ZOM.cell * k) + 2 * bp, Math.max(1.5, ZOM.cell * k) + 2 * bp);
    }
    for (const kind of ZOMBIE_KINDS) {
      const r = kind === 'brute' ? 2.4 : 1.6;
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
  const self = me ?? s.lastSelf;
  const vx0 = Math.max(0, (self.x - cam.viewHalfW) * k), vy0 = Math.max(0, (self.y - cam.viewHalfH) * k);
  const vx1 = Math.min(size, (self.x + cam.viewHalfW) * k), vy1 = Math.min(size, (self.y + cam.viewHalfH) * k);
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
  ctx.lineWidth = 1;
  if (vx1 > vx0 && vy1 > vy0) ctx.strokeRect(x + vx0 + 0.5, y + vy0 + 0.5, vx1 - vx0 - 1, vy1 - vy0 - 1);
  ctx.save();
  ctx.translate(x + self.x * k, y + self.y * k);
  ctx.rotate((me?.angle ?? -Math.PI / 2) + Math.PI / 2);
  ctx.beginPath();
  ctx.moveTo(0, -7); ctx.lineTo(5.5, 5.5); ctx.lineTo(0, 2.5); ctx.lineTo(-5.5, 5.5);
  ctx.closePath();
  ctx.fillStyle = '#ffffff';
  ctx.fill();
  ctx.restore();
}

/** The score pill at the top center: red and blue scores either side of the clock in team modes, the run's phase in zombies, the clock in FFA. Returns its bottom edge. */
function drawPill(hud: Hud, compact: boolean): number {
  const { ctx, w, snap, me, s, now } = hud;
  const ph = compact ? 30 : 38, y = EDGE;
  const side = compact ? 50 : 66, mid = compact ? 64 : 84;
  const big = compact ? 17 : 22;
  const left = timeLeft(hud);
  const cy = y + ph / 2;
  if (snap.match.mode === 'TDM' || snap.match.mode === 'DOM') {
    const x = w / 2 - side - mid / 2;
    fadePanel(hud, 'score', x, y, side * 2 + mid, ph);
    for (const [team, bx, corners] of [['red', x, [10, 0, 0, 10]], ['blue', x + side + mid, [0, 10, 10, 0]]] as const) {
      ctx.fillStyle = TEAM_COLORS[team];
      ctx.beginPath();
      ctx.roundRect(bx, y, side, ph, corners);
      ctx.fill();
      text(ctx, String(snap.match.teamScore[team]), bx + side / 2, cy + 1, big, '#ffffff', 'center', 800);
      if (me?.team === team) {
        ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
        ctx.fillRect(bx + side / 2 - 10, y + ph - 5, 20, 2.5);
      }
    }
    panel(ctx, x + side, y, mid, ph, undefined, 0);
    const center = snap.match.mode === 'DOM' ? `to ${WORLD.domWinScore}` : left === null ? `to ${WORLD.tdmWinScore}` : clock(left);
    text(ctx, center, x + side + mid / 2, cy + 1, snap.match.mode === 'DOM' ? TYPE.body : big - 4, HUD_INK, 'center', 700);
    return y + ph;
  }
  if (snap.run) {
    const run = snap.run;
    const [label, color] = run.phase === 'day' ? [`DAY ${run.night}`, PALETTE.gold] : run.phase === 'night' ? [`NIGHT ${run.night}`, '#8f7cff'] : ['FALLEN', PALETTE.hunted];
    const until = run.phaseEndsAt === null ? null : run.phaseEndsAt - (serverNow(s.snaps, now) ?? run.phaseEndsAt);
    const center = run.phase === 'night' ? `${run.waveLeft} left` : until === null ? '' : clock(until);
    const lw = compact ? 76 : 96;
    const x = w / 2 - (lw + mid) / 2;
    fadePanel(hud, 'score', x, y, lw + mid, ph);
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.roundRect(x, y, lw, ph, [10, 0, 0, 10]);
    ctx.fill();
    text(ctx, label, x + lw / 2, cy + 1, TYPE.body + 1, run.phase === 'day' ? '#1d1a0b' : '#ffffff', 'center', 850);
    panel(ctx, x + lw, y, mid, ph, undefined, [0, 10, 10, 0]);
    text(ctx, center, x + lw + mid / 2, cy + 1, big - 4, HUD_INK, 'center', 700);
    return y + ph;
  }
  const kills = snap.self.kills;
  const top = Math.max(0, ...snap.leaderboard.filter((r) => r.id !== s.myId).map((r) => r.kills));
  const x = w / 2 - side - mid / 2;
  fadePanel(hud, 'score', x, y, side * 2 + mid, ph);
  panel(ctx, x, y, side * 2 + mid, ph);
  text(ctx, String(kills), x + side / 2, cy - 3, big - 2, PALETTE.gold, 'center', 800);
  caps(ctx, 'you', x + side / 2, cy + 11, MUTED, 'center');
  text(ctx, left === null ? clock(MAP_MS.FFA) : clock(left), x + side + mid / 2, cy + 1, big - 2, HUD_INK, 'center', 700);
  text(ctx, String(top), x + side + mid + side / 2, cy - 3, big - 2, HUD_INK, 'center', 800);
  caps(ctx, 'best', x + side + mid + side / 2, cy + 11, MUTED, 'center');
  return y + ph;
}

/** The map and objective in one line under the pill, then the next-map notice. Returns the bottom edge of what it drew. */
function drawObjectiveLine(hud: Hud, top: number, compact: boolean): number {
  const { ctx, w, snap, me } = hud;
  ctx.globalAlpha = 1;
  if (!me) return top;
  const line = snap.run ? `${snap.match.map} · ${phaseLine(snap.run, serverNow(hud.s.snaps, hud.now))}` : `${snap.match.map} · ${objectiveFor(snap.match.mode, me.team, timeLeft(hud)).line}`;
  setFont(ctx, 600, TYPE.label + 1);
  const dot = me.team && !snap.run ? 14 : 0;
  const lw = ctx.measureText(line).width + 20 + dot;
  const lx = compact ? EDGE + 120 : w / 2 - lw / 2;
  const y = top + 6;
  panel(ctx, lx, y, lw, 22, undefined, 7);
  if (me.team && dot) {
    ctx.fillStyle = TEAM_COLORS[me.team];
    ctx.beginPath();
    ctx.arc(lx + 14, y + 11, 4.5, 0, TAU);
    ctx.fill();
  }
  text(ctx, line, lx + 10 + dot, y + 11, TYPE.label + 1, HUD_INK, 'left');
  const notice = mapNotice(snap.match);
  if (!notice) return y + 22;
  setFont(ctx, 700, TYPE.label + 1);
  const nw = ctx.measureText(notice).width + 20;
  const nx = compact ? lx : w / 2 - nw / 2;
  panel(ctx, nx, y + 26, nw, 22, undefined, 7);
  text(ctx, notice, nx + 10, y + 37, TYPE.label + 1, PALETTE.gold, 'left', 700);
  return y + 48;
}

const SQUAD_CHIP_H = 52;

function drawSiege(hud: Hud, run: NonNullable<Snapshot['run']>, top: number, compact: boolean) {
  const { ctx, w, h, s, me, now } = hud;
  const bw = compact ? Math.min(240, w - 260) : 260;
  const x = compact ? EDGE + 130 : (w - bw) / 2;
  const y = top + 4;
  panel(ctx, x - 10, y, bw + 20, 26, undefined, 7);
  strokeIcon(ctx, UI_ICONS.scrap, x + 6, y + 13, 14, PALETTE.gold, 2.4);
  text(ctx, `${run.scrap}`, x + 18, y + 13, TYPE.body, PALETTE.gold, 'left', 800);
  setFont(ctx, 800, TYPE.body);
  const sx = x + 22 + ctx.measureText(`${run.scrap}`).width;
  caps(ctx, 'scrap', sx, y + 13);
  const frac = run.core.hp / run.core.maxHp;
  const alert = now - s.coreHitAt < CORE_ALERT_MS;
  const coreColor = alert && Math.floor(now / 200) % 2 ? PALETTE.hunted : frac > 0.5 ? PALETTE.hpGood : frac > 0.25 ? PALETTE.gold : PALETTE.hpBad;
  const barX = x + bw - 110;
  setFont(ctx, 750, TYPE.micro);
  const labelW = ctx.measureText('CORE').width;
  caps(ctx, 'core', barX - labelW - 8, y + 13);
  strokeIcon(ctx, UI_ICONS.core, barX - labelW - 20, y + 13, 13, coreColor, 2.4);
  bar(ctx, barX, y + 9, 110, 8, frac, coreColor);
  if (alert) drawCoreAlert(hud, run.core, y + 40);
  if (run.phase === 'over') return;
  if (me?.downed) {
    const k = 0.5 + 0.5 * Math.sin(now / 260);
    outlined(ctx, "You're down", w / 2, h * 0.64, 30, PALETTE.hunted, 900);
    outlined(ctx, downedLine(me.downed, serverNow(s.snaps, now)), w / 2, h * 0.64 + 30, TYPE.title + 1, HUD_INK, 700);
    ctx.globalAlpha = 0.6 + 0.4 * k;
    bar(ctx, w / 2 - 110, h * 0.64 + 50, 220, 8, me.downed.revive, PALETTE.hpGood);
    ctx.globalAlpha = 1;
    return;
  }
  if (!me?.alive) return;
  const use = useHint(hud.snap, s.lastSelf);
  const row = h - (compact ? 150 : 28);
  if (use) outlined(ctx, use, w / 2, h * 0.64, TYPE.title + 1, PALETTE.gold, 800);
  if (s.building) {
    hintBar(ctx, s, BUILD_HINTS.filter((p) => p.pick), w / 2, row - 36, null);
    hintBar(ctx, s, BUILD_HINTS.filter((p) => !p.pick), w / 2, row, 'BUILD');
  } else if (run.phase === 'day') hintBar(ctx, s, [{ key: 'B', what: 'build walls and turrets' }], w / 2, row, null);
}

/** A row of key chips centered on `cx`; `label` leads a build-mode bar, which wears the gold edge. A chip with `pick` lights up when its kind is picked and takes a click. */
function hintBar(ctx: CanvasRenderingContext2D, s: Session, hints: readonly { key: string; what: string; pick?: BuildingKind }[], cx: number, row: number, label: string | null) {
  setFont(ctx, 700, TYPE.label);
  const parts = hints.map((p) => ({ ...p, kw: ctx.measureText(p.key).width + 12, ww: ctx.measureText(p.what).width }));
  const total = parts.reduce((t, p) => t + p.kw + p.ww + 26, label ? 70 : 0) + 8;
  let hx = cx - total / 2;
  panel(ctx, hx, row - 14, total, 28, s.building ? PALETTE.gold : undefined);
  hx += 12;
  if (label) {
    text(ctx, label, hx, row, TYPE.label, PALETTE.gold, 'left', 900);
    hx += 58;
  }
  for (const p of parts) {
    const picked = p.pick !== undefined && p.pick === s.buildKind;
    ctx.fillStyle = picked ? PALETTE.gold : 'rgba(255,255,255,0.12)';
    ctx.beginPath();
    ctx.roundRect(hx, row - 10, p.kw, 20, 4);
    ctx.fill();
    text(ctx, p.key, hx + 6, row, TYPE.label, picked ? '#16181d' : HUD_INK, 'left', 800);
    text(ctx, p.what, hx + p.kw + 6, row, TYPE.label, picked ? PALETTE.gold : MUTED, 'left', picked ? 800 : 600);
    if (p.pick) buildChips.push({ kind: p.pick, x: hx - 4, y: row - 14, w: p.kw + p.ww + 14, h: 28 });
    hx += p.kw + p.ww + 26;
  }
}

/** The build bar's kind chips as last drawn, in CSS px, so a click on one picks its kind. */
let buildChips: (Rect & { kind: BuildingKind })[] = [];
export const drawnBuildChips = (): readonly (Rect & { kind: BuildingKind })[] => buildChips;
export const buildChipAt = (x: number, y: number): BuildingKind | null =>
  buildChips.find((c) => x >= c.x && x <= c.x + c.w && y >= c.y && y <= c.y + c.h)?.kind ?? null;

function drawCoreAlert({ ctx, w, h, now, cam, selfAt }: Hud, core: { x: number; y: number }, y: number) {
  const pulse = 0.5 + 0.5 * Math.sin(now / 110);
  ctx.globalAlpha = 0.7 + 0.3 * pulse;
  outlined(ctx, 'CORE UNDER ATTACK', w / 2, y, 18, PALETTE.hunted, 900);
  ctx.globalAlpha = 1;
  const at = edgePoint(selfAt, worldToScreen(cam, core), w, h, EDGE_INSET + 10);
  if (!at) return;
  const clear = clearOfRects(selfAt, at, panels, ARROW_CLEARANCE);
  ctx.save();
  ctx.translate(clear.x, clear.y);
  ctx.rotate(at.angle);
  ctx.scale(1.3 + 0.2 * pulse, 1.3 + 0.2 * pulse);
  ctx.beginPath();
  ctx.moveTo(14, 0);
  ctx.lineTo(-8, -12);
  ctx.lineTo(-3, 0);
  ctx.lineTo(-8, 12);
  ctx.closePath();
  ctx.fillStyle = PALETTE.hunted;
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.lineJoin = 'round';
  ctx.strokeStyle = '#000';
  ctx.stroke();
  ctx.restore();
  strokeIcon(ctx, UI_ICONS.core, clear.x - Math.cos(at.angle) * 26, clear.y - Math.sin(at.angle) * 26, 16, PALETTE.hunted, 2.6);
}

const VITALS_H = 86;

/** Bottom left: level and score to the next pick, then health and armor; owned perks ride above it, with the HUNTED badge. */
function drawVitals({ ctx, w, h, snap, me }: Hud, compact: boolean) {
  if (!me) return;
  const pw = compact ? Math.min(240, w / 2 - EDGE * 2) : 300;
  const x = EDGE;
  const y = h - EDGE - VITALS_H;
  panel(ctx, x, y, pw, VITALS_H);
  const lp = levelProgress(me.level, me.score);
  ctx.beginPath();
  ctx.arc(x + 22, y + 18, 10, 0, TAU);
  ctx.fillStyle = PALETTE.gold;
  ctx.fill();
  text(ctx, String(lp.displayLevel), x + 22, y + 19, TYPE.body, '#1d1a0b', 'center', 850);
  caps(ctx, 'Level', x + 38, y + 18);
  if (!compact) text(ctx, `K ${snap.self.kills}  D ${snap.self.deaths}`, x + pw / 2 + 14, y + 18, TYPE.label, MUTED, 'center', 600);
  text(ctx, lp.nextAt === null ? `${me.score} · max` : `${me.score} / ${lp.nextAt}`, x + pw - 14, y + 18, TYPE.label, HUD_INK, 'right', 700);
  bar(ctx, x + 14, y + 32, pw - 28, 4, lp.frac, PALETTE.gold);

  const hpFrac = me.hp / me.maxHp;
  const low = hpFrac <= 0.35;
  strokeIcon(ctx, UI_ICONS.heart, x + 22, y + 55, 15, low ? PALETTE.hpBad : '#ffffff', 2.6);
  setFont(ctx, 800, TYPE.figure - 4);
  const hpText = `${Math.ceil(me.hp)}`;
  const hw = ctx.measureText(hpText).width;
  text(ctx, hpText, x + 36, y + 55, TYPE.figure - 4, low ? PALETTE.hpBad : HUD_INK, 'left', 800);
  text(ctx, `/ ${me.maxHp}`, x + 40 + hw, y + 56, TYPE.label, MUTED, 'left', 500);
  if (me.maxArmor > 0 || me.armor > 0) {
    text(ctx, `${Math.ceil(me.armor)}`, x + pw - 14, y + 55, TYPE.body, PALETTE.armor, 'right', 800);
    setFont(ctx, 800, TYPE.body);
    strokeIcon(ctx, UI_ICONS.armor, x + pw - 24 - ctx.measureText(`${Math.ceil(me.armor)}`).width, y + 55, 13, PALETTE.armor, 2.4);
  }
  bar(ctx, x + 14, y + 68, pw - 28, 6, hpFrac, low ? PALETTE.hpBad : '#ffffff');
  if (me.maxArmor > 0) bar(ctx, x + 14, y + 77, pw - 28, 3, me.armor / me.maxArmor, PALETTE.armor);

  const owned = ([1, 2, 3] as Tier[]).flatMap((t) => (snap.self.perks[t] ? [snap.self.perks[t]!] : []));
  let cx = x;
  for (const perk of owned) {
    const name = PERK_INFO[perk].name;
    setFont(ctx, 600, TYPE.label);
    const tw = ctx.measureText(name).width + 34;
    panel(ctx, cx, y - 30, tw, 24, undefined, 7);
    strokeIcon(ctx, PERK_ICONS[perk], cx + 14, y - 18, 14, PALETTE.gold, 2.4);
    text(ctx, name, cx + 26, y - 18, TYPE.label, HUD_INK);
    cx += tw + SPACE.sm - 2;
  }
  if (me.hunted) drawHuntedBadge(ctx, x + pw, cx > x + pw - HUNTED_BADGE_W ? y - 58 : y - 30);
}

const SLOT = 58;

/** Bottom right: the gun's white glyph, name and ammo, then the ability as a square slot that fills as it cools down. */
function drawWeapon({ ctx, w, h, snap, me }: Hud, compact: boolean) {
  if (!me) return;
  const self = snap.self;
  const sx = w - EDGE - SLOT, y = h - EDGE - SLOT;
  const pw = compact ? 150 : 230;
  const x = sx - SPACE.sm - pw;
  panel(ctx, x, y, pw, SLOT);
  drawGunGlyph(ctx, me.gun, x + 14, y + 22, compact ? 52 : 90, compact ? 18 : 26, HUD_INK);
  caps(ctx, GUNS[me.gun].name, x + 14, y + 45);
  setFont(ctx, 750, TYPE.micro);
  drawStagePips(ctx, me.gun, x + 14 + ctx.measureText(GUNS[me.gun].name.toUpperCase()).width + SPACE.sm, y + 45);
  const right = x + pw - 14;
  if (self.reloading) {
    text(ctx, 'Reloading', right, y + 22, TYPE.label, PALETTE.gold, 'right', 800);
    bar(ctx, right - 70, y + 36, 70, 5, self.reloadFrac, PALETTE.gold);
  } else {
    setFont(ctx, 500, TYPE.body);
    const magW = ctx.measureText(` / ${self.mag}`).width;
    text(ctx, ` / ${self.mag}`, right, y + 31, TYPE.body, MUTED, 'right', 500);
    text(ctx, String(self.ammo), right - magW, y + 29, TYPE.figure + 2, self.ammo === 0 ? PALETTE.hpBad : HUD_INK, 'right', 850);
  }

  panel(ctx, sx, y, SLOT, SLOT);
  const cx = sx + SLOT / 2;
  if (self.ability) {
    const total = ABILITY_COOLDOWN_MS[self.ability];
    const left = Math.max(0, Math.min(1, self.abilityReadyIn / total));
    const ready = left === 0;
    if (!ready) {
      ctx.save();
      ctx.beginPath();
      ctx.roundRect(sx, y, SLOT, SLOT, PANEL_RADIUS);
      ctx.clip();
      ctx.fillStyle = 'rgba(255, 255, 255, 0.08)';
      ctx.fillRect(sx, y + SLOT * left, SLOT, SLOT * (1 - left));
      ctx.restore();
    } else {
      ctx.beginPath();
      ctx.roundRect(sx + 1, y + 1, SLOT - 2, SLOT - 2, PANEL_RADIUS - 1);
      ctx.lineWidth = 2;
      ctx.strokeStyle = PALETTE.gold;
      ctx.stroke();
    }
    strokeIcon(ctx, PERK_ICONS[self.ability], cx, y + 23, 20, ready ? PALETTE.gold : MUTED, 2.2);
    text(ctx, ready ? 'SPACE' : `${(self.abilityReadyIn / 1000).toFixed(1)}s`, cx, y + 46, TYPE.micro, ready ? PALETTE.gold : HUD_INK, 'center', 800);
  } else {
    const [top, bottom] = abilityHint(self.pending);
    text(ctx, top, cx, y + 23, TYPE.micro, MUTED, 'center', 600);
    text(ctx, bottom, cx, y + 37, TYPE.micro, MUTED, 'center', 600);
  }
}

const HUNTED_BADGE_W = 84;

function drawHuntedBadge(ctx: CanvasRenderingContext2D, right: number, top: number) {
  const x = right - HUNTED_BADGE_W;
  ctx.beginPath();
  ctx.roundRect(x, top, HUNTED_BADGE_W, 24, PANEL_RADIUS);
  ctx.fillStyle = PALETTE.hunted;
  ctx.fill();
  strokeIcon(ctx, UI_ICONS.target, x + 14, top + 12, 14, '#ffffff', 2.4);
  text(ctx, 'HUNTED', x + 26, top + 12, TYPE.label, '#ffffff', 'left', 850);
}

function drawStagePips(ctx: CanvasRenderingContext2D, gun: GunId, x: number, y: number) {
  const { stage, look } = GUNS[gun];
  ctx.fillStyle = look.accent;
  for (let i = 0; i < stage; i++) {
    const cx = x + 3.5 + i * 9;
    ctx.beginPath();
    ctx.moveTo(cx, y - 4);
    ctx.lineTo(cx + 3.5, y);
    ctx.lineTo(cx, y + 4);
    ctx.lineTo(cx - 3.5, y);
    ctx.closePath();
    ctx.fill();
  }
}

const ABILITY_TIER: Tier = 3;
const ABILITY_SCORE = LEVELS.find((l) => l.pick?.k === 'perk' && l.pick.tier === ABILITY_TIER)?.score;

export const abilityHint = (pending: PendingPick | null): [string, string] =>
  pending?.k === 'perk' && pending.tier === ABILITY_TIER ? ['Pick an', 'ability'] : ['Unlocks', `at ${ABILITY_SCORE}`];
