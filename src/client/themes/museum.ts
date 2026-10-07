import type { MapDef } from '../../shared/maps.ts';
import { BEAMS, DISTRICTS, EXITS, SIGNS, districtAt, type MuseumSign } from '../../shared/maps/museum.ts';
import { setLight } from '../lighting.ts';
import { INK } from '../palette.ts';
import { paintMuseumFloor } from './museumfloor.ts';
import { MUSEUM_WALLS, torchSpots } from './museumart.ts';
import { registerTheme, type ThemeView } from './registry.ts';

/**
 * The Museum, after dark: registers the theme. Floors live in museumfloor.ts, walls in museumart.ts and hand-placed
 * dressing in museumdecor.ts. This file is the living part, every piece of it slow (nothing above 1 Hz but the LEDs, nowhere
 * near the 4 Hz limit) and every glow tied to a fixture: torches, case lights, exit signs, the chandelier, the guard's
 * monitors, the security cameras, the treasury's alarm beacon. Under `prefers-reduced-motion` all of it holds still.
 */

const TAU = Math.PI * 2;
const calm = (() => { try { return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches; } catch { return false; } })();
const clock = (now: number) => (calm ? 4000 : now);

type Source = { key: string; x: number; y: number; radius: number; color: string; intensity: number; flicker?: number; cone?: { angle: number; half: number }; size?: number; shadows?: boolean };
type Mote = { x: number; y: number; r: number; sp: number; ph: number };
type Camera = { x: number; y: number; angle: number; dead?: true };
type Cache = { sources: Source[]; motes: Mote[] };
const caches = new Map<string, Cache>();

/** Security cameras in the corners of the big rooms; the treasury's has been turned to the wall and its LED is dark. */
const CAMERAS: readonly Camera[] = [
  { x: 2090, y: 520, angle: Math.PI * 0.62 }, { x: 3910, y: 5480, angle: -Math.PI * 0.38, dead: true },
  { x: 2540, y: 440, angle: Math.PI * 0.5 }, { x: 3460, y: 5560, angle: -Math.PI * 0.5 },
  { x: 640, y: 2540, angle: Math.PI * 0.1 }, { x: 5360, y: 3460, angle: Math.PI * 1.1 },
  { x: 1450, y: 4090, angle: Math.PI * 0.5 }, { x: 4550, y: 1910, angle: -Math.PI * 0.5 },
];
/** Lit placards beside the skeletons: they flicker, slowly, as an old tube does. */
const LABELS = [{ x: 2525, y: 2905, w: 56 }, { x: 3475, y: 3120, w: 56 }] as const;
const DESK = { x: 5640, y: 2580 };
const BEACON = { x: 3720, y: 4990 };

function cacheOf(map: MapDef): Cache {
  let c = caches.get(map.name);
  if (c) return c;
  const sources: Source[] = [];
  const motes: Mote[] = [];
  let seed = 0x6d7573;
  const rand = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
  const pool = (x: number, y: number, r: number, n: number) => { for (let i = 0; i < n; i++) { const a = rand() * TAU, d = Math.sqrt(rand()) * r; motes.push({ x: x + Math.cos(a) * d, y: y + Math.sin(a) * d, r: 1.2 + rand() * 1.2, sp: 0.5 + rand(), ph: rand() * 100 }); } };
  let n = 0;
  for (const w of map.walls) {
    const cx = w.x + w.w / 2, cy = w.y + w.h / 2, d = districtAt(cx, cy);
    if (w.material === 'plinth') {
      sources.push({ key: `mus:p${n++}`, x: cx, y: cy, radius: 460, color: '#ffd9a0', intensity: 0.7, size: 40 });
      const north = cy < 3000;
      sources.push({ key: `mus:s${n++}`, x: cx, y: north ? w.y - 190 : w.y + w.h + 190, radius: 360, color: '#fff0cf', intensity: 0.8, cone: { angle: north ? Math.PI / 2 : -Math.PI / 2, half: 0.5 }, size: 10 });
      pool(cx, cy, 240, 12);
    } else if (w.material === 'vitrine' && w.w * w.h >= 20000) {
      sources.push({ key: `mus:v${n++}`, x: cx, y: cy, radius: Math.max(w.w, w.h) / 2 + 150, color: d.light, intensity: d.id === 'gems' ? 0.7 : 0.5, flicker: d.id === 'gems' ? 0.04 : 0.1, size: 30 });
      pool(cx, cy, Math.max(w.w, w.h) / 2 + 70, d.id === 'gems' ? 8 : 5);
    } else if (w.material === 'marble' && w.w * w.h >= 25000) {
      sources.push({ key: `mus:m${n++}`, x: cx, y: cy, radius: 300, color: d.light, intensity: 0.55, size: 30 });
      pool(cx, cy, 160, 6);
    } else if (w.material === 'marble' && w.w * w.h <= 22500 && (d.id === 'modern' || d.id === 'space' || d.id === 'armour' || d.id === 'cafe')) {
      sources.push({ key: `mus:c${n++}`, x: cx, y: cy, radius: 210, color: d.light, intensity: 0.4, size: 20, shadows: false });
    } else if (w.material === 'counter' && w.w > 400) {
      sources.push({ key: `mus:k${n++}`, x: cx, y: cy + 90, radius: 340, color: d.light, intensity: 0.55, flicker: 0.08, size: 30 });
    } else if (w.material === 'gallery') {
      for (const t of torchSpots(w)) sources.push({ key: `mus:t${n++}`, x: t.x, y: t.y + 8, radius: 190, color: '#ff9a4a', intensity: 0.55, flicker: 0.35, size: 8, shadows: false });
    }
  }
  sources.push({ key: 'mus:chandelier', x: 3000, y: 3000, radius: 640, color: '#ffd9a0', intensity: 0.7, flicker: 0.06, size: 60 });
  pool(3000, 3000, 360, 22);
  for (const [i, e] of EXITS.entries()) sources.push({ key: `mus:x${i}`, x: e.x, y: e.y, radius: 150, color: '#46e08a', intensity: 0.5, size: 12 });
  for (const [i, v] of [{ x: 2225, y: 840 }, { x: 3775, y: 5160 }].entries()) sources.push({ key: `mus:r${i}`, x: v.x, y: v.y, radius: 170, color: i === 0 ? '#ff4a40' : '#ffa040', intensity: i === 0 ? 0.3 : 0.15, size: 20 });
  sources.push({ key: 'mus:beacon', x: BEACON.x, y: BEACON.y, radius: 210, color: '#ff3b30', intensity: 0.5, size: 12, shadows: false });
  sources.push({ key: 'mus:lantern', x: 720, y: 2250, radius: 200, color: '#ffb347', intensity: 0.6, flicker: 0.3, size: 8, shadows: false });
  sources.push({ key: 'mus:desk', x: DESK.x + 100, y: DESK.y - 30, radius: 170, color: '#7fe8b0', intensity: 0.35, flicker: 0.2, size: 12, shadows: false });
  for (const d of DISTRICTS) if (d.id === 'space' || d.id === 'oceans' || d.id === 'iceage' || d.id === 'lab' || d.id === 'kids' || d.id === 'egypt' || d.id === 'modern') pool(d.x + d.w / 2, d.y + d.h / 2, Math.min(d.w, d.h) * 0.35, 4);
  c = { sources, motes };
  caches.set(map.name, c);
  return c;
}

const inView = (v: ThemeView, x: number, y: number, r: number) => x + r >= v.x0 && x - r <= v.x1 && y + r >= v.y0 && y - r <= v.y1;

function museumUnder(ctx: CanvasRenderingContext2D, now: number, view: ThemeView, map: MapDef) {
  const t = clock(now);
  const { sources } = cacheOf(map);
  for (const s of sources) {
    if (!inView(view, s.x, s.y, s.radius + 120)) continue;
    const pulse = s.key === 'mus:beacon' ? 0.5 + 0.5 * Math.sin(t * 0.004) : 1;
    setLight(s.key, { x: s.x, y: s.y, radius: s.radius, color: s.color, intensity: s.intensity * pulse, ...(s.flicker !== undefined && !calm && { flicker: s.flicker }), ...(s.cone && { cone: s.cone }), ...(s.size !== undefined && { size: s.size }), shadows: s.shadows ?? (s.cone !== undefined || s.radius > 400) });
  }
  // Security beams: harmless red light that breathes slowly. The treasury's are cut, and flicker like a dying tube.
  const pulse = 0.72 + 0.28 * Math.sin(t * 0.0031);
  ctx.save();
  ctx.lineCap = 'round';
  for (const b of BEAMS) {
    if (!inView(view, (b.x1 + b.x2) / 2, (b.y1 + b.y2) / 2, Math.hypot(b.x2 - b.x1, b.y2 - b.y1) / 2 + 20)) continue;
    const k = b.dead ? 0.18 : pulse;
    if (b.dead) ctx.setLineDash([26, 40, 14, 60]);
    ctx.strokeStyle = `rgba(255, 70, 60, ${(0.16 * k).toFixed(3)})`; ctx.lineWidth = 9;
    ctx.beginPath(); ctx.moveTo(b.x1, b.y1); ctx.lineTo(b.x2, b.y2); ctx.stroke();
    ctx.strokeStyle = `rgba(255, 96, 84, ${(0.62 * k).toFixed(3)})`; ctx.lineWidth = 2.4;
    ctx.beginPath(); ctx.moveTo(b.x1, b.y1); ctx.lineTo(b.x2, b.y2); ctx.stroke();
    ctx.setLineDash([]);
    for (const [px, py] of [[b.x1, b.y1], [b.x2, b.y2]] as const) {
      ctx.fillStyle = '#2f343c'; ctx.beginPath(); ctx.arc(px, py, 6, 0, TAU); ctx.fill();
      ctx.strokeStyle = INK; ctx.lineWidth = 1.5; ctx.stroke();
      ctx.fillStyle = b.dead ? '#4a2a2a' : '#ff5a50'; ctx.beginPath(); ctx.arc(px, py, 2.2, 0, TAU); ctx.fill();
    }
  }
  // The guard's monitors still glow a cold green.
  if (inView(view, DESK.x, DESK.y, 200)) {
    const f = 0.8 + 0.2 * Math.sin(t * 0.0023 + 1) * Math.sin(t * 0.0011);
    const g = ctx.createRadialGradient(DESK.x + 100, DESK.y - 34, 4, DESK.x + 100, DESK.y - 34, 80);
    g.addColorStop(0, `rgba(120, 255, 190, ${(0.2 * f).toFixed(3)})`); g.addColorStop(1, 'rgba(120, 255, 190, 0)');
    ctx.fillStyle = g; ctx.fillRect(DESK.x + 20, DESK.y - 114, 160, 160);
  }
  ctx.restore();
}

/* -- signs ------------------------------------------------------------------------------------------------------ */

const signSprites = new Map<string, HTMLCanvasElement>();
function signSprite(s: MuseumSign): HTMLCanvasElement {
  const key = `${s.text}|${s.small ? 1 : 0}`;
  let c = signSprites.get(key);
  if (c) return c;
  const size = s.small ? 15 : 19, padX = 14, h = size + 14;
  c = document.createElement('canvas');
  const g = c.getContext('2d')!;
  const font = `700 ${size}px "Barlow Condensed", "Arial Narrow", sans-serif`;
  g.font = font;
  (g as unknown as { letterSpacing: string }).letterSpacing = '2px';
  const w = Math.ceil(g.measureText(s.text).width) + padX * 2;
  c.width = w + 8; c.height = h + 22;
  g.font = font;
  (g as unknown as { letterSpacing: string }).letterSpacing = '2px';
  // Two chains from the lintel, a gunmetal plate edged in brass, bone lettering.
  g.strokeStyle = INK; g.lineWidth = 3; g.beginPath(); g.moveTo(14, 0); g.lineTo(14, 14); g.moveTo(w - 6, 0); g.lineTo(w - 6, 14); g.stroke();
  g.strokeStyle = '#b79a4a'; g.lineWidth = 1.4; g.stroke();
  g.fillStyle = 'rgba(20, 24, 32, 0.3)'; g.fillRect(7, 17, w, h);
  g.fillStyle = '#2f343c'; g.fillRect(4, 14, w, h);
  g.strokeStyle = '#b79a4a'; g.lineWidth = 2.4; g.strokeRect(7, 17, w - 6, h - 6);
  g.strokeStyle = INK; g.lineWidth = 2; g.strokeRect(4, 14, w, h);
  g.fillStyle = 'rgba(255, 255, 255, 0.12)'; g.fillRect(4, 14, w, 3);
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillStyle = '#ece6d6'; g.fillText(s.text, 4 + w / 2, 14 + h / 2 + 1);
  signSprites.set(key, c);
  return c;
}

function cameraDraw(ctx: CanvasRenderingContext2D, c: Camera, t: number) {
  const a = c.angle + (c.dead || calm ? 0 : Math.sin(t * 0.00042 + c.x) * 0.6);
  ctx.save();
  ctx.translate(c.x, c.y);
  ctx.rotate(a);
  if (!c.dead) {
    const g = ctx.createRadialGradient(0, 0, 10, 0, 0, 240);
    g.addColorStop(0, 'rgba(255, 250, 220, 0.09)'); g.addColorStop(1, 'rgba(255, 250, 220, 0)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(0, 0); ctx.arc(0, 0, 240, -0.34, 0.34); ctx.closePath(); ctx.fill();
  }
  ctx.fillStyle = 'rgba(20, 24, 32, 0.3)'; ctx.fillRect(-6, -3, 22, 11);
  ctx.fillStyle = '#8a8f98'; ctx.fillRect(-8, -6, 20, 11); ctx.fillStyle = '#3d4450'; ctx.fillRect(8, -5, 7, 9);
  ctx.strokeStyle = INK; ctx.lineWidth = 2; ctx.strokeRect(-8, -6, 20, 11);
  ctx.fillStyle = 'rgba(255,255,255,0.3)'; ctx.fillRect(-8, -6, 20, 2);
  ctx.restore();
  // The LED blinks about once a second: never faster.
  const on = !c.dead && (calm || Math.floor(t / 520) % 2 === 0);
  ctx.fillStyle = on ? '#ff3b30' : '#4a2420'; ctx.beginPath(); ctx.arc(c.x - 3, c.y - 8, 2.4, 0, TAU); ctx.fill();
  if (on) { const g = ctx.createRadialGradient(c.x - 3, c.y - 8, 1, c.x - 3, c.y - 8, 14); g.addColorStop(0, 'rgba(255,60,48,0.5)'); g.addColorStop(1, 'rgba(255,60,48,0)'); ctx.fillStyle = g; ctx.fillRect(c.x - 17, c.y - 22, 28, 28); }
}

function exitSign(ctx: CanvasRenderingContext2D, x: number, y: number, vertical: boolean, glow: number) {
  ctx.save();
  ctx.translate(x, y);
  if (vertical) ctx.rotate(-Math.PI / 2);
  const g = ctx.createRadialGradient(0, 0, 4, 0, 0, 52);
  g.addColorStop(0, `rgba(80, 255, 150, ${(0.3 * glow).toFixed(3)})`); g.addColorStop(1, 'rgba(80, 255, 150, 0)');
  ctx.fillStyle = g; ctx.fillRect(-52, -52, 104, 104);
  ctx.fillStyle = 'rgba(20, 24, 32, 0.3)'; ctx.fillRect(-18, -5, 40, 17);
  ctx.fillStyle = '#1f9a56'; ctx.fillRect(-20, -9, 40, 17);
  ctx.fillStyle = `rgba(190, 255, 215, ${(0.4 + 0.3 * glow).toFixed(3)})`; ctx.fillRect(-20, -9, 40, 4);
  ctx.strokeStyle = INK; ctx.lineWidth = 2; ctx.strokeRect(-20, -9, 40, 17);
  ctx.fillStyle = '#f4fff8'; ctx.strokeStyle = '#f4fff8'; ctx.lineWidth = 2; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.arc(-9, -4, 2, 0, TAU); ctx.fill();
  ctx.beginPath(); ctx.moveTo(-9, -1); ctx.lineTo(-11, 4); ctx.moveTo(-9, -1); ctx.lineTo(-5, 1); ctx.moveTo(-9, 0); ctx.lineTo(-6, 5); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(2, 0); ctx.lineTo(14, 0); ctx.moveTo(10, -4); ctx.lineTo(14, 0); ctx.lineTo(10, 4); ctx.stroke();
  ctx.restore();
}

function museumOver(ctx: CanvasRenderingContext2D, now: number, view: ThemeView, map: MapDef) {
  const t = clock(now);
  const glow = 0.78 + 0.22 * Math.sin(t * 0.0021);
  for (const e of EXITS) if (inView(view, e.x, e.y, 60)) exitSign(ctx, e.x, e.y, e.vertical, glow);
  // Signs over every door: you always know which wing you are walking into.
  for (const s of SIGNS) {
    if (!inView(view, s.x, s.y, 140)) continue;
    const img = signSprite(s);
    ctx.save();
    ctx.translate(s.x, s.y);
    if (s.vertical) ctx.rotate(-Math.PI / 2);
    ctx.drawImage(img, -img.width / 2, -14);
    ctx.restore();
  }
  for (const c of CAMERAS) if (inView(view, c.x, c.y, 260)) cameraDraw(ctx, c, t);
  // The treasury's alarm beacon, still turning in its cage.
  if (inView(view, BEACON.x, BEACON.y, 80)) {
    const k = 0.5 + 0.5 * Math.sin(t * 0.004);
    const g = ctx.createRadialGradient(BEACON.x, BEACON.y, 2, BEACON.x, BEACON.y, 60);
    g.addColorStop(0, `rgba(255, 60, 48, ${(0.5 * k).toFixed(3)})`); g.addColorStop(1, 'rgba(255, 60, 48, 0)');
    ctx.fillStyle = g; ctx.fillRect(BEACON.x - 60, BEACON.y - 60, 120, 120);
    ctx.fillStyle = 'rgba(20, 24, 32, 0.3)'; ctx.beginPath(); ctx.ellipse(BEACON.x + 3, BEACON.y + 4, 9, 6, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = '#2f343c'; ctx.beginPath(); ctx.arc(BEACON.x, BEACON.y, 8, 0, TAU); ctx.fill(); ctx.strokeStyle = INK; ctx.lineWidth = 2; ctx.stroke();
    ctx.fillStyle = k > 0.5 ? '#ff5a50' : '#8a2e2a'; ctx.beginPath(); ctx.arc(BEACON.x, BEACON.y, 4.6, 0, TAU); ctx.fill();
  }
  // Lit placards by the skeletons flicker as an old tube does.
  for (const l of LABELS) {
    if (!inView(view, l.x, l.y, 60)) continue;
    const f = calm ? 1 : 0.62 + 0.38 * Math.max(0, Math.sin(t * 0.0013 + l.x) * Math.sin(t * 0.00037 + l.y) + 0.35);
    ctx.fillStyle = `rgba(255, 244, 200, ${(0.1 * f).toFixed(3)})`; ctx.fillRect(l.x - l.w, l.y - 26, l.w * 2, 50);
    ctx.fillStyle = '#1c1f26'; ctx.fillRect(l.x - l.w / 2, l.y - 7, l.w, 15);
    ctx.fillStyle = `rgba(255, 244, 214, ${(0.85 * f).toFixed(3)})`; ctx.fillRect(l.x - l.w / 2 + 3, l.y - 4, l.w - 6, 9);
    ctx.fillStyle = 'rgba(28, 31, 38, 0.7)'; ctx.fillRect(l.x - l.w / 2 + 6, l.y - 2, l.w - 20, 1.6); ctx.fillRect(l.x - l.w / 2 + 6, l.y + 2, l.w - 28, 1.6);
    ctx.strokeStyle = INK; ctx.lineWidth = 2; ctx.strokeRect(l.x - l.w / 2, l.y - 7, l.w, 15);
  }
  // Dust drifts up slowly through the spotlights and shows only inside them.
  const { motes } = cacheOf(map);
  ctx.save();
  for (const m of motes) {
    if (!inView(view, m.x, m.y, 40)) continue;
    const u = t * 0.001 * m.sp + m.ph;
    const px = m.x + Math.sin(u * 0.7) * 14, py = m.y - ((u * 9) % 60) + 30;
    ctx.fillStyle = `rgba(255, 238, 200, ${(0.22 + 0.2 * Math.sin(u * 1.3 + m.ph)).toFixed(3)})`;
    ctx.beginPath(); ctx.arc(px, py, m.r, 0, TAU); ctx.fill();
  }
  ctx.restore();
}

registerTheme('museum', {
  floor: paintMuseumFloor,
  walls: MUSEUM_WALLS,
  under: museumUnder,
  over: museumOver,
});
