import { STICK_RADIUS, stickVector, type Sticks } from './touch.ts';
import { ABILITY_COOLDOWN_MS, LEVEL_SCORES, PERK_INFO, WEAPONS, WORLD, type Tier } from '../shared/defs.ts';
import type { PlayerView, Snapshot } from '../shared/protocol.ts';
import type { Point } from './camera.ts';
import { feedMentions, levelProgress, objectiveFor } from './derive.ts';
import { HITMARKER_MS, HURT_MS } from './feedback.ts';
import { PALETTE, TEAM_COLORS } from './palette.ts';
import type { Session } from './state.ts';

const FONT = 'system-ui, -apple-system, "Segoe UI", sans-serif';
const PANEL = 'rgba(22, 25, 31, 0.72)';
const INK = '#f2f3f5';
const MUTED = '#a3a9b5';
const FEED_MS = 6000;
const TAU = Math.PI * 2;

type Hud = { ctx: CanvasRenderingContext2D; w: number; h: number; snap: Snapshot; s: Session; me: PlayerView | null; now: number };

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

export function drawHud(ctx: CanvasRenderingContext2D, dpr: number, w: number, h: number, snap: Snapshot, s: Session, now: number, crosshair: Point) {
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const me = snap.players.find((p) => p.id === s.myId) ?? null;
  const hud: Hud = { ctx, w, h, snap, s, me, now };
  const compact = w < 640;
  drawHurtVignette(hud);
  drawKillFeed(hud, compact ? 74 : 18);
  drawLeaderboard(hud, compact);
  drawMinimap(hud, compact ? 110 : 170);
  drawScore(hud, compact);
  if (me?.alive) drawVitals(hud);
  drawHitmarker(hud, crosshair);
}

function drawHurtVignette({ ctx, w, h, s, now }: Hud) {
  const hurt = s.feedback.hurt;
  if (!hurt) return;
  const k = (now - hurt.born) / HURT_MS;
  if (k < 0 || k >= 1) return;
  const alpha = (0.25 + 0.5 * hurt.strength) * (1 - k);
  const g = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.3, w / 2, h / 2, Math.hypot(w, h) / 2);
  g.addColorStop(0, 'rgba(200, 20, 20, 0)');
  g.addColorStop(1, `rgba(200, 20, 20, ${alpha.toFixed(3)})`);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
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

function panel(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number) {
  ctx.fillStyle = PANEL;
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, 8);
  ctx.fill();
}

function bar(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, frac: number, color: string) {
  ctx.fillStyle = 'rgba(255,255,255,0.12)';
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

function text(ctx: CanvasRenderingContext2D, s: string, x: number, y: number, size: number, color = INK, align: CanvasTextAlign = 'left', weight = 600) {
  ctx.font = `${weight} ${size}px ${FONT}`;
  ctx.fillStyle = color;
  ctx.textAlign = align;
  ctx.textBaseline = 'middle';
  ctx.fillText(s, x, y);
}

function drawKillFeed({ ctx, s, now }: Hud, top: number) {
  const lines = s.feed.filter((f) => now - f.at < FEED_MS).slice(-5);
  lines.forEach((f, i) => {
    const y = top + i * 26;
    const msg = `${f.killer}  ⟶  ${f.victim}`;
    ctx.font = `600 13px ${FONT}`;
    const tw = ctx.measureText(msg).width + ctx.measureText(`  ${f.weapon}`).width;
    ctx.globalAlpha = Math.min(1, (FEED_MS - (now - f.at)) / 600);
    panel(ctx, 12, y - 11, tw + 20, 22);
    const mine = feedMentions(f, s.myId);
    text(ctx, msg, 22, y, 13, mine ? '#ffd34d' : INK);
    text(ctx, `  ${f.weapon}`, 22 + ctx.measureText(msg).width, y, 12, MUTED, 'left', 500);
    ctx.globalAlpha = 1;
  });
}

function drawLeaderboard({ ctx, w, snap, s }: Hud, compact: boolean) {
  const rows = [...snap.leaderboard].sort((a, b) => b.score - a.score).slice(0, compact ? 5 : 10);
  const teams = snap.match.mode !== 'FFA';
  const pw = compact ? 150 : 210;
  const x = w - pw - 12;
  const ph = 34 + rows.length * 20 + (teams ? 28 : 0);
  panel(ctx, x, 12, pw, ph);
  text(ctx, `Leaderboard · ${snap.match.mode}`, x + 12, 29, 13, INK, 'left', 700);
  let y = 50;
  if (teams) {
    const goal = snap.match.mode === 'TDM' ? WORLD.tdmWinScore : WORLD.domWinScore;
    const half = (pw - 24) / 2;
    bar(ctx, x + 12, y - 5, half - 4, 10, snap.match.teamScore.red / goal, TEAM_COLORS.red);
    bar(ctx, x + 16 + half, y - 5, half - 4, 10, snap.match.teamScore.blue / goal, TEAM_COLORS.blue);
    text(ctx, `Red ${snap.match.teamScore.red}`, x + 12, y + 13, 11, MUTED);
    text(ctx, `to ${goal}`, x + pw / 2, y + 13, 10, MUTED, 'center', 500);
    text(ctx, `${snap.match.teamScore.blue} Blue`, x + pw - 12, y + 13, 11, MUTED, 'right');
    y += 28;
  }
  rows.forEach((r, i) => {
    const mine = r.id === s.myId;
    if (r.team) {
      ctx.fillStyle = TEAM_COLORS[r.team];
      ctx.beginPath();
      ctx.arc(x + 16, y, 4, 0, TAU);
      ctx.fill();
    }
    text(ctx, `${i + 1}. ${r.name}`, x + 26, y, 12, mine ? '#ffd34d' : INK, 'left', mine ? 700 : 500);
    text(ctx, String(r.score), x + pw - 12, y, 12, mine ? '#ffd34d' : MUTED, 'right');
    y += 20;
  });
}

function drawMinimap({ ctx, w, h, snap, s, me }: Hud, size: number) {
  const x = w - size - 12;
  const y = h - size - 12;
  const k = size / s.worldSize;
  panel(ctx, x - 4, y - 4, size + 8, size + 8);
  ctx.fillStyle = 'rgba(233, 231, 224, 0.15)';
  ctx.fillRect(x, y, size, size);
  for (const wall of s.walls) {
    ctx.fillStyle = wall.built ? 'rgba(179,143,87,0.8)' : 'rgba(200,204,212,0.55)';
    ctx.fillRect(x + wall.x * k, y + wall.y * k, Math.max(1, wall.w * k), Math.max(1, wall.h * k));
  }
  for (const z of snap.zones) {
    ctx.beginPath();
    ctx.arc(x + z.x * k, y + z.y * k, Math.max(4, z.r * k), 0, TAU);
    ctx.fillStyle = z.owner ? TEAM_COLORS[z.owner] : PALETTE.neutral;
    ctx.globalAlpha = 0.5;
    ctx.fill();
    ctx.globalAlpha = 1;
  }
  for (const m of snap.minimap) {
    ctx.fillStyle = m.team ? TEAM_COLORS[m.team] : '#ff6b6b';
    ctx.beginPath();
    ctx.arc(x + m.x * k, y + m.y * k, 2.5, 0, TAU);
    ctx.fill();
  }
  const self = me ?? s.lastSelf;
  ctx.fillStyle = '#ffffff';
  ctx.strokeStyle = '#000';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.arc(x + self.x * k, y + self.y * k, 3.5, 0, TAU);
  ctx.fill();
  ctx.stroke();
}

function drawScore({ ctx, w, snap, me }: Hud, compact: boolean) {
  if (!me) return;
  const lp = levelProgress(me.level, me.score);
  const bw = compact ? w - 150 - 56 : 260;
  const x = compact ? 22 : (w - bw) / 2;
  panel(ctx, x - 10, 10, bw + 20, 44);
  text(ctx, `Level ${lp.displayLevel}`, x, 24, 13, INK, 'left', 700);
  text(ctx, lp.nextAt === null ? `${me.score} · max level` : `${me.score} / ${lp.nextAt}`, x + bw, 24, 12, MUTED, 'right');
  text(ctx, `K ${snap.self.kills} · D ${snap.self.deaths}`, x + bw / 2, 24, 12, MUTED, 'center', 500);
  bar(ctx, x, 38, bw, 7, lp.frac, '#ffd34d');
  const line = objectiveFor(snap.match.mode, me.team).line;
  ctx.font = `600 12px ${FONT}`;
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
  text(ctx, line, lx + 10 + dot, 69, 12, INK, 'left');
}

function drawVitals({ ctx, w, h, snap, s, me, now }: Hud) {
  if (!me) return;
  const self = snap.self;
  const pw = Math.min(340, w - 24 - (w < 640 ? 130 : 190));
  const x = 12;
  const y = h - 92;
  panel(ctx, x, y, pw, 80);
  const barW = pw - 110;
  text(ctx, `${Math.ceil(me.hp)}`, x + 12, y + 18, 13, INK, 'left', 700);
  bar(ctx, x + 44, y + 13, barW - 32, 10, me.hp / me.maxHp, me.hp / me.maxHp > 0.35 ? PALETTE.hpGood : PALETTE.hpBad);
  text(ctx, `${Math.ceil(me.armor)}`, x + 12, y + 36, 13, MUTED, 'left', 700);
  bar(ctx, x + 44, y + 31, barW - 32, 10, me.maxArmor ? me.armor / me.maxArmor : 0, '#5b8def');

  const reloading = self.reloading;
  text(ctx, WEAPONS[me.weapon].name, x + 12, y + 60, 12, MUTED, 'left', 500);
  if (reloading) {
    text(ctx, 'Reloading', x + 12 + barW - 32 + 32, y + 60, 13, '#ffd34d', 'right', 700);
    bar(ctx, x + 100, y + 56, barW - 120, 8, self.reloadFrac, '#ffd34d');
  } else {
    text(ctx, `${self.ammo} / ${self.mag}`, x + barW + 12, y + 60, 18, self.ammo === 0 ? PALETTE.hpBad : INK, 'right', 800);
  }

  const ax = x + pw - 46;
  const ay = y + 40;
  ctx.beginPath();
  ctx.arc(ax, ay, 28, 0, TAU);
  ctx.fillStyle = 'rgba(255,255,255,0.08)';
  ctx.fill();
  if (self.ability) {
    const total = ABILITY_COOLDOWN_MS[self.ability];
    const left = Math.max(0, Math.min(1, self.abilityReadyIn / total));
    ctx.beginPath();
    ctx.arc(ax, ay, 28, -Math.PI / 2, -Math.PI / 2 + (1 - left) * TAU);
    ctx.lineWidth = 4;
    ctx.strokeStyle = left === 0 ? '#ffd34d' : MUTED;
    ctx.stroke();
    const name = PERK_INFO[self.ability].name;
    text(ctx, left === 0 ? 'Space' : `${(self.abilityReadyIn / 1000).toFixed(1)}s`, ax, ay - 6, 11, left === 0 ? '#ffd34d' : INK, 'center', 700);
    text(ctx, name.length > 9 ? name.split(' ')[0]! : name, ax, ay + 9, 10, MUTED, 'center', 500);
  } else {
    const [top, bottom] = abilityHint(self.pendingTier);
    text(ctx, top, ax, ay - 6, 10, MUTED, 'center', 600);
    text(ctx, bottom, ax, ay + 8, 10, MUTED, 'center', 500);
  }

  const owned = ([1, 2, 3] as Tier[]).flatMap((t) => (self.perks[t] ? [PERK_INFO[self.perks[t]!].name] : []));
  let cx = x;
  for (const name of owned) {
    ctx.font = `600 11px ${FONT}`;
    const tw = ctx.measureText(name).width + 16;
    panel(ctx, cx, y - 28, tw, 22);
    text(ctx, name, cx + 8, y - 17, 11, INK);
    cx += tw + 6;
  }
}

const ABILITY_TIER: Tier = 3;

export const abilityHint = (pendingTier: Tier | null): [string, string] =>
  pendingTier === ABILITY_TIER ? ['Pick an', 'ability'] : ['Unlocks', `at ${LEVEL_SCORES[ABILITY_TIER]}`];
