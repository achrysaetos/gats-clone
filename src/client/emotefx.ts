import { EMOTES, type EmoteId } from '../shared/emotes.ts';
import type { PlayerView } from '../shared/protocol.ts';
import { GEAR } from './bodies.ts';
import { INK, NIGHT, PALETTE, shade } from './palette.ts';

/**
 * Emote bubbles, the small body gestures that go with them, and the rare friendly idle touches (a helmet tip, a stretch, a party hat).
 * All of it is local to the drawing client; the simulation never hears of it. Style follows docs/art/STYLE.md: gunmetal plates with
 * clipped corners and an orange bracket, ink outlines of 2 px, anticipation then snap then settle, nothing looping above 4 Hz.
 */

const R = 24;
const TAU = Math.PI * 2;
const BONE = '#ece6d6';
const PLATE = '#3d4450';
const PLATE_LIT = '#4f5560';
const ORANGE = '#ff5a1f';
const FONT = '800 15px "Barlow Condensed", "Arial Narrow", system-ui, sans-serif';

export const EMOTE_SHOW_MS = 2400;
const EMOTE_FADE_MS = 360;
const POP_MS = 220;
export const IDLE_AFTER_MS = 5000;
const IDLE_ANIM_MS = 1800;

const active = new Map<number, { id: EmoteId; at: number }>();
export const noteEmote = (pid: number, id: EmoteId, now: number) => { active.set(pid, { id, at: now }); };
export const emoteOf = (pid: number, now: number): EmoteId | null => {
  const a = active.get(pid);
  return a && now - a.at < EMOTE_SHOW_MS ? a.id : null;
};

const easeOut = (t: number) => 1 - (1 - Math.min(1, Math.max(0, t))) ** 3;

/** Anticipation (a squash), a snap past full size, then a settle: the bubble's pop. */
export function popScale(ms: number): number {
  if (ms < 0) return 0;
  if (ms < POP_MS * 0.45) return 0.55 * easeOut(ms / (POP_MS * 0.45)) + 0.0;
  if (ms < POP_MS * 0.8) return 0.55 + 0.6 * easeOut((ms - POP_MS * 0.45) / (POP_MS * 0.35));
  if (ms < POP_MS) return 1.15 - 0.15 * easeOut((ms - POP_MS * 0.8) / (POP_MS * 0.2));
  return 1;
}

export const bubbleAlpha = (ms: number): number => (ms < EMOTE_SHOW_MS - EMOTE_FADE_MS ? 1 : Math.max(0, (EMOTE_SHOW_MS - ms) / EMOTE_FADE_MS));

const LABEL: Partial<Record<EmoteId, string>> = { laugh: 'HA HA', gg: 'GG', nice: 'NICE SHOT!', help: 'HELP!' };

export function clipped(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, cut: number) {
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(x + w - cut, y);
  ctx.lineTo(x + w, y + cut);
  ctx.lineTo(x + w, y + h);
  ctx.lineTo(x + cut, y + h);
  ctx.lineTo(x, y + h - cut);
  ctx.closePath();
}

export function outlined(ctx: CanvasRenderingContext2D, fill: string, width = 2) {
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.lineWidth = width;
  ctx.strokeStyle = INK;
  ctx.stroke();
  ctx.fillStyle = fill;
  ctx.fill();
}

/** An emote's glyph, 2 px ink outlines on toy-chunky shapes, centred on (cx, cy) and about `s` px across. */
export function drawEmoteIcon(ctx: CanvasRenderingContext2D, id: EmoteId, cx: number, cy: number, s: number) {
  const u = s / 24;
  ctx.save();
  ctx.translate(cx, cy);
  ctx.scale(u, u);
  const face = (tongue: boolean, open: boolean) => {
    ctx.beginPath();
    ctx.arc(0, 0, 10, 0, TAU);
    outlined(ctx, GEAR.glove);
    ctx.strokeStyle = INK;
    ctx.lineWidth = 2;
    ctx.beginPath();
    if (open) { ctx.moveTo(-6, -3); ctx.quadraticCurveTo(-4, -6, -2, -3); ctx.moveTo(2, -3); ctx.quadraticCurveTo(4, -6, 6, -3); }
    else { ctx.moveTo(-6, -3); ctx.lineTo(-2, -3); ctx.moveTo(2, -3); ctx.lineTo(6, -3); }
    ctx.stroke();
    ctx.beginPath();
    ctx.ellipse(0, 4, 5, open ? 4 : 2.2, 0, 0, TAU);
    outlined(ctx, INK, 1.5);
    if (tongue) { ctx.beginPath(); ctx.ellipse(0, 7, 2.6, 3.2, 0, 0, TAU); outlined(ctx, '#d9541f', 1.5); }
  };
  switch (id) {
    case 'salute':
      ctx.beginPath(); ctx.arc(-1, 3, 9, Math.PI, TAU); ctx.lineTo(10, 3); ctx.lineTo(-12, 3); ctx.closePath(); outlined(ctx, '#7d8693');
      ctx.beginPath(); ctx.moveTo(1, -9); ctx.lineTo(13, -4); ctx.lineTo(11, 0); ctx.lineTo(-1, -5); ctx.closePath(); outlined(ctx, GEAR.glove, 2);
      break;
    case 'wave':
      ctx.beginPath(); ctx.arc(0, 2, 7, 0, TAU); outlined(ctx, GEAR.glove);
      ctx.strokeStyle = BONE; ctx.lineWidth = 2;
      for (const k of [1, 2]) { ctx.beginPath(); ctx.arc(0, 2, 7 + k * 4, -2.5, -0.65); ctx.stroke(); }
      break;
    case 'laugh': face(false, true); break;
    case 'taunt': face(true, false); break;
    case 'gg':
      ctx.beginPath(); ctx.moveTo(-8, 11); ctx.lineTo(-8, -11); ctx.lineWidth = 3; ctx.strokeStyle = INK; ctx.stroke();
      ctx.beginPath(); ctx.moveTo(-8, -10); ctx.lineTo(11, -5); ctx.lineTo(-8, 1); ctx.closePath(); outlined(ctx, ORANGE);
      break;
    case 'thumbs':
      ctx.beginPath(); ctx.roundRect(-9, -1, 15, 11, 3); outlined(ctx, GEAR.glove);
      ctx.beginPath(); ctx.roundRect(-4, -11, 6, 12, 3); outlined(ctx, GEAR.glove);
      break;
    case 'nice':
      ctx.beginPath(); ctx.arc(0, 0, 8, 0, TAU); ctx.lineWidth = 3; ctx.strokeStyle = INK; ctx.stroke();
      ctx.lineWidth = 1.6; ctx.strokeStyle = ORANGE; ctx.stroke();
      ctx.beginPath(); ctx.moveTo(-12, 0); ctx.lineTo(-4, 0); ctx.moveTo(4, 0); ctx.lineTo(12, 0); ctx.moveTo(0, -12); ctx.lineTo(0, -4); ctx.moveTo(0, 4); ctx.lineTo(0, 12);
      ctx.lineWidth = 3.4; ctx.strokeStyle = INK; ctx.stroke(); ctx.lineWidth = 1.8; ctx.strokeStyle = ORANGE; ctx.stroke();
      ctx.beginPath(); ctx.arc(0, 0, 1.6, 0, TAU); ctx.fillStyle = ORANGE; ctx.fill();
      break;
    case 'help':
      ctx.beginPath(); ctx.moveTo(0, -11); ctx.lineTo(11, 9); ctx.lineTo(-11, 9); ctx.closePath(); outlined(ctx, ORANGE);
      ctx.fillStyle = INK; ctx.fillRect(-1.5, -4, 3, 8); ctx.beginPath(); ctx.arc(0, 6.6, 1.7, 0, TAU); ctx.fill();
      break;
  }
  ctx.restore();
}

/** A field-kit plate with an icon (and a label for the wordy ones): clipped top-right and bottom-left, an orange bracket top left. */
function drawBubble(ctx: CanvasRenderingContext2D, id: EmoteId, x: number, y: number, scale: number, alpha: number, dark: number) {
  const label = LABEL[id];
  ctx.save();
  ctx.font = FONT;
  const tw = label ? ctx.measureText(label).width : 0;
  const w = 38 + (label ? tw + 8 : 0), h = 34, cut = 8;
  ctx.translate(x, y);
  ctx.scale(scale, scale);
  ctx.globalAlpha = alpha;
  // The tail points down at the head; the contact shadow keeps the plate in the key light's direction.
  ctx.fillStyle = 'rgba(20, 24, 32, 0.3)';
  clipped(ctx, -w / 2 + 3, -h + 3, w, h, cut);
  ctx.fill();
  ctx.beginPath(); ctx.moveTo(-6, -2); ctx.lineTo(0, 7); ctx.lineTo(6, -2); ctx.closePath(); outlined(ctx, PLATE);
  clipped(ctx, -w / 2, -h, w, h, cut);
  outlined(ctx, PLATE);
  // Cel step: a lit band along the top.
  ctx.save();
  clipped(ctx, -w / 2, -h, w, h, cut); ctx.clip();
  ctx.fillStyle = PLATE_LIT; ctx.fillRect(-w / 2, -h, w, 8);
  ctx.restore();
  ctx.beginPath(); ctx.moveTo(-w / 2 + 3, -h + 11); ctx.lineTo(-w / 2 + 3, -h + 3); ctx.lineTo(-w / 2 + 11, -h + 3);
  ctx.lineWidth = 2.5; ctx.strokeStyle = ORANGE; ctx.lineCap = 'butt'; ctx.stroke();
  drawEmoteIcon(ctx, id, -w / 2 + 21, -h / 2 + 1, 24);
  if (label) {
    ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    ctx.fillStyle = dark > 0.5 ? NIGHT.label : BONE;
    ctx.fillText(label, -w / 2 + 36, -h / 2 + 2);
  }
  ctx.restore();
}

export function drawEmoteBubbles(ctx: CanvasRenderingContext2D, players: readonly PlayerView[], now: number, dark: number) {
  for (const p of players) {
    const a = active.get(p.id);
    if (!a || p.hidden) continue;
    const ms = now - a.at;
    if (ms >= EMOTE_SHOW_MS) { active.delete(p.id); continue; }
    drawBubble(ctx, a.id, p.x, p.y - R * 2.35, popScale(ms) * 1.3, bubbleAlpha(ms), dark);
  }
}

type Arm = { sx: number; sy: number; gx: number; gy: number; thumb?: boolean };
const lerp = (a: number, b: number, k: number) => a + (b - a) * k;
const RS = { sx: R * 0.62, sy: -R * 0.12 }, LS = { sx: -R * 0.62, sy: -R * 0.12 };

/** The raised arms (screen-aligned offsets from the body centre) for an emote or idle gesture `ms` into it; at most 3 Hz of motion. */
export function gestureArms(id: EmoteId, ms: number): Arm[] {
  const t = ms / 1000, snap = easeOut(ms / 160);
  const w = Math.sin(t * 18.8);
  switch (id) {
    case 'salute': return [{ ...RS, gx: lerp(R * 0.85, R * 0.32, snap), gy: lerp(-R * 0.3, -R * 0.98, snap) }];
    case 'wave': return [{ ...RS, gx: R * 1.0 + w * R * 0.3, gy: -R * 1.2 * snap }];
    case 'thumbs': return [{ ...RS, gx: R * 0.95, gy: lerp(-R * 0.2, -R * 1.0, snap), thumb: true }];
    case 'gg': return [{ ...RS, gx: R * 0.95, gy: -R * 0.9 - Math.abs(Math.sin(t * 9.4)) * R * 0.35 * snap }];
    case 'nice': return [{ ...RS, gx: lerp(R * 0.5, R * 1.35, snap), gy: R * 0.15 + Math.sin(t * 6) * R * 0.04 }];
    case 'taunt': return [{ ...RS, gx: R * 0.95, gy: -R * 0.85 + Math.sin(t * 18) * R * 0.1 }, { ...LS, gx: -R * 0.95, gy: -R * 0.85 - Math.sin(t * 18) * R * 0.1 }];
    case 'help': return [{ ...RS, gx: R * 0.95, gy: -R * 1.3 + w * R * 0.18 }, { ...LS, gx: -R * 0.95, gy: -R * 1.3 - w * R * 0.18 }];
    case 'laugh': return [];
  }
}

function glove(ctx: CanvasRenderingContext2D, color: string, a: Arm) {
  ctx.lineCap = 'round';
  for (const [width, style] of [[R * 0.19 * 2 + 4, INK], [R * 0.19 * 2, shade(color, 0.86)]] as const) {
    ctx.lineWidth = width; ctx.strokeStyle = style;
    ctx.beginPath(); ctx.moveTo(a.sx, a.sy); ctx.quadraticCurveTo((a.sx + a.gx) / 2 + Math.sign(a.sx) * R * 0.18, (a.sy + a.gy) / 2, a.gx, a.gy); ctx.stroke();
  }
  if (a.thumb) { ctx.beginPath(); ctx.ellipse(a.gx - 1, a.gy - R * 0.3, R * 0.1, R * 0.17, 0, 0, TAU); outlined(ctx, GEAR.glove, 2); }
  ctx.beginPath(); ctx.arc(a.gx, a.gy, R * 0.2, 0, TAU); outlined(ctx, GEAR.glove, 2);
  ctx.fillStyle = 'rgba(255,255,255,0.35)'; ctx.beginPath(); ctx.arc(a.gx - R * 0.06, a.gy - R * 0.06, R * 0.06, 0, TAU); ctx.fill();
}

/** Tears of laughter: two ink-outlined drops thrown off the head, once. */
function drawTears(ctx: CanvasRenderingContext2D, ms: number) {
  const k = easeOut(ms / 500);
  if (ms > 700) return;
  ctx.globalAlpha = 1 - Math.max(0, (ms - 450) / 250);
  for (const side of [-1, 1]) {
    ctx.beginPath(); ctx.ellipse(side * (R * 0.55 + k * R * 0.5), -R * 0.8 - k * R * 0.2 + k * k * R * 0.5, R * 0.1, R * 0.15, side * 0.4, 0, TAU);
    outlined(ctx, '#9cd0ea', 1.5);
  }
  ctx.globalAlpha = 1;
}

/** A toy party hat: a cone in signal orange with bone bands, a cel highlight and a gold pom, tipped a little. */
export function drawPartyHat(ctx: CanvasRenderingContext2D, x: number, y: number, sway: number) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(0.22 + sway * 0.03);
  ctx.beginPath(); ctx.moveTo(-R * 0.32, 0); ctx.lineTo(0, -R * 0.95); ctx.lineTo(R * 0.32, 0); ctx.closePath();
  outlined(ctx, ORANGE);
  ctx.save();
  ctx.clip();
  ctx.fillStyle = 'rgba(255,255,255,0.24)'; ctx.beginPath(); ctx.moveTo(-R * 0.32, 0); ctx.lineTo(0, -R * 0.95); ctx.lineTo(-R * 0.1, 0); ctx.fill();
  ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.beginPath(); ctx.moveTo(R * 0.32, 0); ctx.lineTo(0, -R * 0.95); ctx.lineTo(R * 0.12, 0); ctx.fill();
  ctx.fillStyle = BONE;
  for (const b of [0.28, 0.58]) { ctx.beginPath(); ctx.moveTo(-R * 0.4, -R * b); ctx.lineTo(R * 0.4, -R * (b - 0.12)); ctx.lineTo(R * 0.4, -R * (b - 0.2)); ctx.lineTo(-R * 0.4, -R * (b + 0.08)); ctx.fill(); }
  ctx.restore();
  ctx.beginPath(); ctx.moveTo(-R * 0.32, 0); ctx.lineTo(0, -R * 0.95); ctx.lineTo(R * 0.32, 0); ctx.closePath(); ctx.lineWidth = 2; ctx.strokeStyle = INK; ctx.stroke();
  ctx.beginPath(); ctx.arc(0, -R * 0.97, R * 0.13, 0, TAU); outlined(ctx, PALETTE.gold, 2);
  ctx.restore();
}

type Idle = { x: number; y: number; angle: number; since: number; seen: number };
const idle = new Map<number, Idle>();
let idlePrunedAt = 0;
let party = false;
/** Whether your own body wears the anniversary party hat. */
export const setParty = (on: boolean) => { party = on; };
export const partyOn = () => party;
export const resetEmotes = () => { active.clear(); idle.clear(); };

const hash = (n: number): number => { let h = (Math.imul(n | 0, 0x9e3779b1) ^ 0x85ebca6b) >>> 0; h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d) >>> 0; return (h ^ (h >>> 12)) >>> 0; };

/** Which idle touch, if any, a body standing still since `since` is doing: rare (about one rest in three), charming, never for the first 5 s. */
export function idleTouch(id: number, since: number, now: number): { kind: 'tip' | 'stretch'; ms: number } | null {
  const ms = now - since - IDLE_AFTER_MS;
  if (ms < 0 || ms > IDLE_ANIM_MS) return null;
  const h = hash(id * 7919 + Math.floor(since / 1000));
  if (h % 100 >= 34) return null;
  return { kind: (h >> 8) % 2 === 0 ? 'tip' : 'stretch', ms };
}

/** Gestures, idle touches and the party hat, drawn over the soldiers. `partyFor` is the id of the body wearing the anniversary hat. */
export function drawEmoteGestures(ctx: CanvasRenderingContext2D, players: readonly PlayerView[], colorOf: (p: PlayerView) => string, now: number, partyFor: number | null, reduced: boolean) {
  for (const p of players) {
    if (p.hidden) continue;
    let st = idle.get(p.id);
    if (!st || Math.hypot(p.x - st.x, p.y - st.y) > 0.6 || Math.abs(Math.atan2(Math.sin(p.angle - st.angle), Math.cos(p.angle - st.angle))) > 0.04) st = { x: p.x, y: p.y, angle: p.angle, since: now, seen: now };
    st.seen = now;
    idle.set(p.id, st);
    const a = active.get(p.id);
    const emoteMs = a && now - a.at < EMOTE_SHOW_MS ? now - a.at : -1;
    let arms: Arm[] = [];
    let tears = -1;
    if (emoteMs >= 0 && emoteMs < 1500) {
      arms = gestureArms(a!.id, emoteMs);
      if (a!.id === 'laugh') tears = emoteMs;
    } else if (!reduced) {
      const touch = idleTouch(p.id, st.since, now);
      if (touch?.kind === 'tip') {
        const k = Math.sin(Math.min(1, touch.ms / IDLE_ANIM_MS) * Math.PI);
        arms = [{ ...RS, gx: lerp(R * 0.85, R * 0.3, easeOut(k * 1.4)), gy: lerp(-R * 0.2, -R * 0.92, easeOut(k * 1.4)) - Math.max(0, Math.sin(touch.ms / 140)) * R * 0.05 * k }];
      } else if (touch) {
        const k = Math.sin(Math.min(1, touch.ms / IDLE_ANIM_MS) * Math.PI);
        arms = [{ ...RS, gx: R * 0.8, gy: lerp(-R * 0.1, -R * 1.45, easeOut(k * 1.3)) }, { ...LS, gx: -R * 0.8, gy: lerp(-R * 0.1, -R * 1.45, easeOut(k * 1.3)) }];
      }
    }
    if (!arms.length && tears < 0 && p.id !== partyFor) continue;
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.globalAlpha = 1;
    const color = colorOf(p);
    for (const arm of arms) glove(ctx, color, arm);
    if (tears >= 0) drawTears(ctx, tears);
    if (p.id === partyFor) drawPartyHat(ctx, R * 0.08, -R * 0.78, reduced ? 0 : Math.sin(now / 700));
    ctx.restore();
  }
  if (now - idlePrunedAt > 4000) {
    idlePrunedAt = now;
    for (const [id, st] of idle) if (now - st.seen > 4000) idle.delete(id);
  }
}

export const emoteLabel = (id: EmoteId) => EMOTES[id].label;
