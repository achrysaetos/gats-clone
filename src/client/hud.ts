import { STICK_RADIUS, stickVector, type Sticks } from './touch.ts';
import { ABILITY_COOLDOWN_MS, GUN_IDS, GUNS, LEVELS, PERK_INFO, WORLD, type GunId, type PendingPick, type PerkId, type Tier } from '../shared/defs.ts';
import { rankValue, type PlayerView, type Snapshot } from '../shared/protocol.ts';
import { worldToScreen, type Camera, type Point } from './camera.ts';
import { edgePoint, feedMentions, levelProgress, mapNotice, objectiveFor, topScorers } from './derive.ts';
import { ASSIST_MS, HITMARKER_MS, HURT_ARC_MS, HURT_MS } from './feedback.ts';
import { PERK_ICONS, strokeIcon, UI_ICONS } from './icons.ts';
import { CALLOUT_MS, POPUP_MS, RING_MS } from './moments.ts';
import { PALETTE, TEAM_COLORS } from './palette.ts';
import { drawGun } from './sprites.ts';
import type { Session } from './state.ts';

const HUD_FONT = 'system-ui, -apple-system, "Segoe UI", sans-serif';
const TYPE = { micro: 10, label: 11, body: 13, title: 15, figure: 22 } as const;
const SPACE = { sm: 8, md: 12, lg: 16 } as const;
const HUD_INK = '#f2f3f5';
const MUTED = '#9ba2ae';
const PANEL_FILL = 'rgba(17, 19, 24, 0.8)';
const PANEL_EDGE = 'rgba(255, 255, 255, 0.08)';
const PANEL_RADIUS = 10;
const FEED_MS = 6000;
const TAU = Math.PI * 2;
const HURT_BANDS = 12;

/** `selfAt` is where your player is drawn on screen. */
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

export function drawHud(ctx: CanvasRenderingContext2D, dpr: number, cam: Camera, snap: Snapshot, s: Session, now: number, crosshair: Point) {
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  hudFont = '';
  const { w, h } = cam;
  const me = snap.players.find((p) => p.id === s.myId) ?? null;
  const hud: Hud = { ctx, w, h, snap, s, me, now, dt: Math.min(100, Math.max(0, now - lastHudAt)), cam, selfAt: worldToScreen(cam, s.lastSelf) };
  lastHudAt = now;
  const compact = w < 640;
  drawHurtVignette(hud);
  drawHurtArcs(hud);
  drawHuntedArrows(hud);
  drawKillFeed(hud, compact ? 74 : 18);
  drawLeaderboard(hud, compact);
  drawMinimap(hud, compact ? 110 : 170);
  drawScore(hud, compact);
  ctx.globalAlpha = 1;
  if (me?.alive) drawVitals(hud);
  drawScorePopups(hud);
  drawCallouts(hud);
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

function drawHuntedArrows({ ctx, w, h, snap, now, cam, selfAt }: Hud) {
  const pulse = 0.5 + 0.5 * Math.sin(now / 140);
  for (const m of snap.minimap) {
    if (m.pingAge === null) continue;
    const at = edgePoint(selfAt, worldToScreen(cam, m), w, h, EDGE_INSET);
    if (!at) continue;
    ctx.save();
    ctx.translate(at.x, at.y);
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

function panel(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, accent?: string) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, PANEL_RADIUS);
  ctx.fillStyle = PANEL_FILL;
  ctx.fill();
  ctx.lineWidth = 1;
  ctx.strokeStyle = PANEL_EDGE;
  ctx.stroke();
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
  ctx.fillStyle = 'rgba(255,255,255,0.22)';
  ctx.fillRect(x + h / 2, y + 1, Math.max(0, w * f - h), Math.max(1, h * 0.25));
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

const FEED_ICON_W = 34;
const BOUNTY_TAG = `+${WORLD.bountyScore} BOUNTY`;

function drawFeedWeapon(ctx: CanvasRenderingContext2D, label: string, x: number, y: number): number {
  const gun = GUN_BY_NAME.get(label);
  if (gun) {
    ctx.save();
    ctx.translate(x - 4, y);
    drawGun(ctx, gun, 10, MUTED);
    ctx.restore();
    return FEED_ICON_W;
  }
  const perk = PERK_BY_NAME.get(label);
  if (perk) {
    strokeIcon(ctx, PERK_ICONS[perk], x + 9, y, 15, MUTED, 2.4);
    return 22;
  }
  setFont(ctx, 500, TYPE.label);
  text(ctx, label, x, y, TYPE.label, MUTED, 'left', 500);
  return ctx.measureText(label).width + SPACE.sm;
}

function drawKillFeed({ ctx, s, now }: Hud, top: number) {
  const lines = s.feed.filter((f) => now - f.at < FEED_MS).slice(-5);
  lines.forEach((f, i) => {
    const y = top + i * 28;
    ctx.globalAlpha = Math.min(1, (FEED_MS - (now - f.at)) / 600);
    setFont(ctx, 700, TYPE.body);
    if (f.e === 'hunted') {
      const line = `${f.name} is hunted`;
      panel(ctx, 12, y - 12, ctx.measureText(line).width + 22 + SPACE.lg * 2, 24, PALETTE.hunted);
      strokeIcon(ctx, UI_ICONS.target, 12 + SPACE.md + 8, y, 15, PALETTE.hunted, 2.4);
      text(ctx, line, 12 + SPACE.md + 22, y, TYPE.body, f.id === s.myId ? PALETTE.gold : HUD_INK, 'left', 700);
      ctx.globalAlpha = 1;
      return;
    }
    const kw = f.killer ? ctx.measureText(f.killer).width : 0;
    const vw = ctx.measureText(f.victim).width;
    const ww = GUN_BY_NAME.has(f.weapon) ? FEED_ICON_W : 40;
    setFont(ctx, 800, TYPE.micro);
    const bw = f.bounty ? ctx.measureText(BOUNTY_TAG).width + SPACE.sm * 2 : 0;
    const mine = feedMentions(f, s.myId);
    panel(ctx, 12, y - 12, kw + vw + ww + bw + SPACE.lg * 2, 24, mine ? PALETTE.gold : f.bounty ? PALETTE.hunted : undefined);
    let x = 12 + SPACE.md;
    if (f.killer) { text(ctx, f.killer, x, y, TYPE.body, f.killerId === s.myId ? PALETTE.gold : HUD_INK, 'left', 700); x += kw + SPACE.sm; }
    x += drawFeedWeapon(ctx, f.weapon, x, y);
    text(ctx, f.victim, x, y, TYPE.body, f.victimId === s.myId ? PALETTE.gold : HUD_INK, 'left', 700);
    if (f.bounty) text(ctx, BOUNTY_TAG, x + vw + SPACE.sm, y, TYPE.micro, PALETTE.hunted, 'left', 800);
    ctx.globalAlpha = 1;
  });
}

function drawLeaderboard(hud: Hud, compact: boolean) {
  const { ctx, w, snap, s } = hud;
  const rows = topScorers(snap.match.mode, snap.leaderboard, compact ? 5 : 10);
  const teams = snap.match.mode !== 'FFA';
  const pw = compact ? 150 : 210;
  const x = w - pw - 12;
  const rowH = 20;
  const ph = 36 + rows.length * rowH + (teams ? 30 : 18);
  fadePanel(hud, 'board', x, 12, pw, ph);
  panel(ctx, x, 12, pw, ph);
  caps(ctx, 'Leaderboard', x + SPACE.md, 29);
  text(ctx, snap.match.mode, x + pw - SPACE.md, 29, TYPE.label, PALETTE.gold, 'right', 800);
  let y = 52;
  if (teams) {
    const goal = snap.match.mode === 'TDM' ? WORLD.tdmWinScore : WORLD.domWinScore;
    const half = (pw - SPACE.md * 2) / 2;
    bar(ctx, x + SPACE.md, y - 5, half - 4, 8, snap.match.teamScore.red / goal, TEAM_COLORS.red);
    bar(ctx, x + SPACE.md + 4 + half, y - 5, half - 4, 8, snap.match.teamScore.blue / goal, TEAM_COLORS.blue);
    text(ctx, `Red ${snap.match.teamScore.red}`, x + SPACE.md, y + 13, TYPE.label, HUD_INK, 'left', 700);
    text(ctx, `to ${goal}`, x + pw / 2, y + 13, TYPE.micro, MUTED, 'center', 500);
    text(ctx, `${snap.match.teamScore.blue} Blue`, x + pw - SPACE.md, y + 13, TYPE.label, HUD_INK, 'right', 700);
    y += 30;
  } else {
    text(ctx, `First to ${WORLD.ffaWinKills} kills`, x + SPACE.md, y - 2, TYPE.micro, MUTED, 'left', 500);
    y += 18;
  }
  rows.forEach((r, i) => {
    const mine = r.id === s.myId;
    if (mine) {
      ctx.fillStyle = 'rgba(255, 211, 77, 0.14)';
      ctx.beginPath();
      ctx.roundRect(x + 6, y - rowH / 2, pw - 12, rowH, 5);
      ctx.fill();
    }
    if (r.team) {
      ctx.fillStyle = TEAM_COLORS[r.team];
      ctx.beginPath();
      ctx.arc(x + SPACE.md + 4, y, 4, 0, TAU);
      ctx.fill();
    }
    text(ctx, `${i + 1}  ${r.name}`, x + SPACE.md + (r.team ? 14 : 0), y, TYPE.body - 1, mine ? PALETTE.gold : HUD_INK, 'left', mine ? 750 : 550);
    text(ctx, String(rankValue(snap.match.mode, r)), x + pw - SPACE.md, y, TYPE.body - 1, mine ? PALETTE.gold : MUTED, 'right', 650);
    y += rowH;
  });
}

export const PANEL_ALPHA = { rest: 0.85, covering: 0.3 } as const;
const PANEL_FADE_MS = 180;

/** Steps a panel's opacity toward see-through while a player is drawn under it, and back once they leave. */
export function approachAlpha(alpha: number, covering: boolean, dtMs: number): number {
  const target = covering ? PANEL_ALPHA.covering : PANEL_ALPHA.rest;
  const step = (dtMs / PANEL_FADE_MS) * (PANEL_ALPHA.rest - PANEL_ALPHA.covering);
  return alpha < target ? Math.min(target, alpha + step) : Math.max(target, alpha - step);
}

type PanelId = 'score' | 'board' | 'minimap';
const panelAlpha: Record<PanelId, number> = { score: PANEL_ALPHA.rest, board: PANEL_ALPHA.rest, minimap: PANEL_ALPHA.rest };

function fadePanel({ ctx, snap, cam, dt }: Hud, id: PanelId, x: number, y: number, w: number, h: number): number {
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

function drawMinimap(hud: Hud, size: number) {
  const { ctx, w, h, snap, s, me } = hud;
  const x = w - size - 12;
  const y = h - size - 12;
  const k = size / s.worldSize;
  const base = fadePanel(hud, 'minimap', x - 5, y - 5, size + 10, size + 10);
  panel(ctx, x - 5, y - 5, size + 10, size + 10);
  ctx.fillStyle = 'rgba(226, 221, 209, 0.12)';
  ctx.fillRect(x, y, size, size);
  ctx.strokeStyle = 'rgba(255,255,255,0.06)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let g = 1; g < 4; g++) {
    ctx.moveTo(x + (size * g) / 4, y); ctx.lineTo(x + (size * g) / 4, y + size);
    ctx.moveTo(x, y + (size * g) / 4); ctx.lineTo(x + size, y + (size * g) / 4);
  }
  ctx.stroke();
  for (const wall of s.walls) {
    ctx.fillStyle = wall.built ? 'rgba(210,171,115,0.85)' : 'rgba(205,210,220,0.6)';
    ctx.fillRect(x + wall.x * k, y + wall.y * k, Math.max(1, wall.w * k), Math.max(1, wall.h * k));
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
  const self = me ?? s.lastSelf;
  ctx.fillStyle = '#ffffff';
  ctx.strokeStyle = '#000';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(x + self.x * k, y + self.y * k, 4, 0, TAU);
  ctx.fill();
  ctx.stroke();
}

function drawScore(hud: Hud, compact: boolean) {
  const { ctx, w, snap, me } = hud;
  if (!me) return;
  const lp = levelProgress(me.level, me.score);
  const bw = compact ? w - 150 - 56 : 260;
  const x = compact ? 22 : (w - bw) / 2;
  fadePanel(hud, 'score', x - 10, 10, bw + 20, mapNotice(snap.match) ? 96 : 70);
  panel(ctx, x - 10, 10, bw + 20, 44);
  ctx.beginPath();
  ctx.arc(x + 9, 30, 13, 0, TAU);
  ctx.fillStyle = PALETTE.gold;
  ctx.fill();
  text(ctx, String(lp.displayLevel), x + 9, 31, TYPE.title, '#1d1a0b', 'center', 850);
  const bx = x + 30, barW = bw - 30;
  caps(ctx, 'Level', bx, 22);
  text(ctx, `K ${snap.self.kills}  D ${snap.self.deaths}`, bx + barW / 2, 22, TYPE.label, MUTED, 'center', 600);
  text(ctx, lp.nextAt === null ? `${me.score} · max` : `${me.score} / ${lp.nextAt}`, bx + barW, 22, TYPE.label, HUD_INK, 'right', 700);
  bar(ctx, bx, 34, barW, 8, lp.frac, PALETTE.gold);
  const line = `${snap.match.map} · ${objectiveFor(snap.match.mode, me.team).line}`;
  setFont(ctx, 600, TYPE.label + 1);
  const dot = me.team ? 14 : 0;
  const lw = ctx.measureText(line).width + 20 + dot;
  const lx = compact ? x - 10 : w / 2 - lw / 2;
  panel(ctx, lx, 58, lw, 22);
  if (me.team) {
    ctx.fillStyle = TEAM_COLORS[me.team];
    ctx.beginPath();
    ctx.arc(lx + 14, 69, 4.5, 0, TAU);
    ctx.fill();
  }
  text(ctx, line, lx + 10 + dot, 69, TYPE.label + 1, HUD_INK, 'left');
  const notice = mapNotice(snap.match);
  if (!notice) return;
  setFont(ctx, 700, TYPE.label + 1);
  const nw = ctx.measureText(notice).width + 20;
  const nx = compact ? x - 10 : w / 2 - nw / 2;
  panel(ctx, nx, 84, nw, 22);
  text(ctx, notice, nx + 10, 95, TYPE.label + 1, PALETTE.gold, 'left', 700);
}

function drawVitals({ ctx, w, h, snap, me }: Hud) {
  if (!me) return;
  const self = snap.self;
  const pw = Math.min(340, w - 24 - (w < 640 ? 130 : 190));
  const x = 12;
  const y = h - 92;
  panel(ctx, x, y, pw, 80);
  const barX = x + 58, barW = pw - 150;
  const hpFrac = me.hp / me.maxHp;
  const hpColor = hpFrac > 0.35 ? PALETTE.hpGood : PALETTE.hpBad;
  strokeIcon(ctx, UI_ICONS.heart, x + 18, y + 18, 14, hpColor, 2.6);
  text(ctx, `${Math.ceil(me.hp)}`, x + 30, y + 18, TYPE.body, HUD_INK, 'left', 800);
  bar(ctx, barX, y + 13, barW, 10, hpFrac, hpColor);
  strokeIcon(ctx, UI_ICONS.armor, x + 18, y + 37, 14, PALETTE.armor, 2.6);
  text(ctx, `${Math.ceil(me.armor)}`, x + 30, y + 37, TYPE.body, MUTED, 'left', 800);
  bar(ctx, barX, y + 32, barW, 10, me.maxArmor ? me.armor / me.maxArmor : 0, PALETTE.armor);

  ctx.save();
  ctx.translate(x + 10, y + 62);
  drawGun(ctx, me.gun, 11 / Math.max(1, GUNS[me.gun].look.length), MUTED);
  ctx.restore();
  caps(ctx, GUNS[me.gun].name, x + 46, y + 62);
  drawStagePips(ctx, me.gun, x + 46 + ctx.measureText(GUNS[me.gun].name.toUpperCase()).width + SPACE.sm, y + 62);
  const ammoRight = barX + barW;
  if (self.reloading) {
    text(ctx, 'Reloading', ammoRight, y + 56, TYPE.label, PALETTE.gold, 'right', 800);
    bar(ctx, ammoRight - 70, y + 66, 70, 5, self.reloadFrac, PALETTE.gold);
  } else {
    setFont(ctx, 500, TYPE.body);
    const magW = ctx.measureText(` / ${self.mag}`).width;
    text(ctx, ` / ${self.mag}`, ammoRight, y + 63, TYPE.body, MUTED, 'right', 500);
    text(ctx, String(self.ammo), ammoRight - magW, y + 61, TYPE.figure, self.ammo === 0 ? PALETTE.hpBad : HUD_INK, 'right', 850);
  }

  const ax = x + pw - 46;
  const ay = y + 40;
  ctx.beginPath();
  ctx.arc(ax, ay, 29, 0, TAU);
  ctx.fillStyle = 'rgba(255,255,255,0.06)';
  ctx.fill();
  if (self.ability) {
    const total = ABILITY_COOLDOWN_MS[self.ability];
    const left = Math.max(0, Math.min(1, self.abilityReadyIn / total));
    const ready = left === 0;
    ctx.beginPath();
    ctx.arc(ax, ay, 29, -Math.PI / 2, -Math.PI / 2 + (1 - left) * TAU);
    ctx.lineWidth = 4;
    ctx.lineCap = 'round';
    ctx.strokeStyle = ready ? PALETTE.gold : MUTED;
    ctx.stroke();
    strokeIcon(ctx, PERK_ICONS[self.ability], ax, ay - 6, 20, ready ? PALETTE.gold : MUTED, 2.2);
    text(ctx, ready ? 'SPACE' : `${(self.abilityReadyIn / 1000).toFixed(1)}s`, ax, ay + 14, TYPE.micro, ready ? PALETTE.gold : HUD_INK, 'center', 800);
  } else {
    const [top, bottom] = abilityHint(self.pending);
    text(ctx, top, ax, ay - 6, TYPE.micro, MUTED, 'center', 600);
    text(ctx, bottom, ax, ay + 8, TYPE.micro, MUTED, 'center', 600);
  }

  const owned = ([1, 2, 3] as Tier[]).flatMap((t) => (self.perks[t] ? [self.perks[t]!] : []));
  let cx = x;
  for (const perk of owned) {
    const name = PERK_INFO[perk].name;
    setFont(ctx, 600, TYPE.label);
    const tw = ctx.measureText(name).width + 34;
    panel(ctx, cx, y - 30, tw, 24);
    strokeIcon(ctx, PERK_ICONS[perk], cx + 14, y - 18, 14, PALETTE.gold, 2.4);
    text(ctx, name, cx + 26, y - 18, TYPE.label, HUD_INK);
    cx += tw + SPACE.sm - 2;
  }
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
