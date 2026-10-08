import type { MapDef } from '../../shared/maps.ts';
import { ATRIUM, FOUNTAIN } from '../../shared/maps/embassy.ts';
import { setLight } from '../lighting.ts';
import { INK } from '../palette.ts';
import { drawEmbassyDoor, drawEmbassyPoly, drawEmbassyRoof } from './embassygeo.ts';
import { paintEmbassyFloor } from './embassyfloor.ts';
import { BRASS, BRASS_HI, TAU, clock, flag, hash, hexA, reduced, seal } from './embassykit.ts';
import { EMBASSY_WALLS, isServerRack } from './embassywalls.ts';
import { registerTheme, type ThemeView } from './registry.ts';
import './embassyambient.ts';

/**
 * The Embassy after hours: registers the theme. Floors live in embassyfloor.ts, walls in embassywalls.ts, set pieces, doors and
 * roofs in embassygeo.ts, dressing in embassydecor.ts. This file is the living part, every piece of it slow (the fastest
 * thing is a status LED at about 2 Hz, nowhere near the 4 Hz limit) and every glow tied to a fixture: strip lights, lamps, the
 * chandeliers, racks, camera LEDs, exit signs, the fountain's underwater lamps. Under `prefers-reduced-motion` it all holds still.
 */

type Src = { key: string; x: number; y: number; radius: number; color: string; intensity: number; flicker?: number; size?: number; shadows?: boolean };
const COOL = '#cfe4ff', WARM = '#ffc880';
const turn = (x: number, y: number) => ({ x: 6000 - x, y: 6000 - y });

/** [x, y, radius, colour, intensity, flicker]: west list, then its half turn in the warm Residence. */
const LIGHTS: readonly (readonly [number, number, number, string, number, number?])[] = [
  // Spine and corridors: strip lights.
  ...[300, 800, 1300, 1800, 2300].map((y) => [1950, y, 320, COOL, 0.45] as const),
  ...[1100, 1650, 2250].flatMap((x) => [[x, 850, 300, COOL, 0.4], [x, 1850, 300, COOL, 0.4]] as const),
  // Rooms.
  [1330, 470, 300, '#ffd9a0', 0.55, 0.04], [1700, 330, 200, '#ffd9a0', 0.4],           // ambassador's desk lamp, the anteroom
  [2500, 400, 420, '#dff0ff', 0.55], [1325, 1325, 520, COOL, 0.5],                    // conference pendant, open plan
  [2300, 1300, 300, COOL, 0.4], [2720, 1300, 260, COOL, 0.35],                        // comms and print
  [1200, 2250, 420, '#56b8ff', 0.6], [1700, 2300, 200, '#56b8ff', 0.4],               // the server room
  [2500, 2250, 400, '#eaf2dc', 0.5],                                                   // cafeteria
  [1700, 3500, 520, '#fff0cf', 0.55], [1700, 4050, 480, COOL, 0.5], [950, 3500, 220, '#fff0cf', 0.4], [2400, 3500, 220, '#fff0cf', 0.4], // lobby, checkpoint
  [1100, 2850, 360, '#fff0cf', 0.45], [1750, 2850, 360, '#fff0cf', 0.45], [2350, 2850, 300, '#fff0cf', 0.45], // flag gallery
  [FOUNTAIN.x, FOUNTAIN.y, 320, '#7fe0ff', 0.55],                                     // the fountain's underwater lamps
  [1300, 4180, 220, '#bfe4ff', 0.4], [2100, 4180, 220, '#bfe4ff', 0.4],               // the glass front
  [330, 5500, 260, '#ffb347', 0.5],                                                    // the staging yard's work lamp
  [300, 700, 200, '#c8f0a0', 0.3], [300, 1700, 200, '#c8f0a0', 0.3], [300, 2300, 200, '#c8f0a0', 0.3], // garden lanterns
];
const TWIN_WARM: readonly string[] = [];
void TWIN_WARM;

type Cache = { sources: Src[]; racks: { x: number; y: number; w: number; h: number }[] };
const caches = new Map<string, Cache>();
function cacheOf(map: MapDef): Cache {
  let c = caches.get(map.name);
  if (c) return c;
  const sources: Src[] = [];
  let n = 0;
  for (const [x, y, r, col, i, f] of LIGHTS) {
    sources.push({ key: `emb:w${n}`, x, y, radius: r, color: col, intensity: i, ...(f !== undefined && { flicker: f }), size: 24, shadows: r > 380 });
    // The Residence: the same fixtures as lamps, a warm gold.
    const t = turn(x, y);
    const warm = col === COOL || col === '#dff0ff' || col === '#eaf2dc' || col === '#bfe4ff' ? WARM : col === '#56b8ff' ? '#a8e0b0' : col;
    sources.push({ key: `emb:e${n}`, x: t.x, y: t.y, radius: r, color: warm, intensity: i * 0.95, flicker: 0.05, size: 24, shadows: r > 380 });
    n++;
  }
  sources.push({ key: 'emb:atrium', x: ATRIUM.x, y: ATRIUM.y, radius: 720, color: '#ffe9bb', intensity: 0.7, flicker: 0.04, size: 70, shadows: false });
  const racks = map.walls.filter((w) => w.material === 'embrack' && isServerRack(w)).map(({ x, y, w, h }) => ({ x, y, w, h }));
  c = { sources, racks };
  caches.set(map.name, c);
  return c;
}

const inView = (v: ThemeView, x: number, y: number, r: number) => x + r >= v.x0 && x - r <= v.x1 && y + r >= v.y0 && y - r <= v.y1;

/** Security cameras at corridor ends (west-local; the Residence's get the half turn and a dead LED). */
const CAMERAS: readonly { x: number; y: number; a: number }[] = [
  { x: 1870, y: 130, a: Math.PI / 2 }, { x: 2030, y: 2490, a: -Math.PI / 2 }, { x: 870, y: 800, a: 0 }, { x: 2930, y: 1900, a: Math.PI }, { x: 870, y: 2650, a: 0 },
  { x: 1300, y: 4260, a: -Math.PI / 2 }, { x: 2400, y: 3150, a: Math.PI },
];

type Sign = { x: number; y: number; here: string; there: string; vertical?: boolean };
const SIGNS: readonly Sign[] = [
  { x: 2450, y: 712, here: 'CONFERENCE', there: 'BALLROOM' }, { x: 1150, y: 712, here: 'AMBASSADOR', there: 'LIBRARY' },
  { x: 1200, y: 1912, here: 'SERVER ROOM', there: 'ARCHIVES' }, { x: 1300, y: 4212, here: 'VISITORS', there: 'DELIVERIES' }, { x: 2100, y: 4212, here: 'VISITORS', there: 'DELIVERIES' },
  { x: 1700, y: 3862, here: 'DIPLOMATIC LANE', there: 'KITCHEN PASS' }, { x: 1650, y: 3112, here: 'FLAG GALLERY', there: 'PORTRAITS' }, { x: 1950, y: 2562, here: 'OFFICE WING', there: 'RESIDENCE' },
  { x: 1350, y: 962, here: 'OPEN PLAN', there: 'STAIRCASE' }, { x: 2250, y: 962, here: 'COMMS', there: 'DINING' }, { x: 2750, y: 962, here: 'PRINT', there: 'PANTRY' }, { x: 2450, y: 1912, here: 'CAFETERIA', there: 'CONSERVATORY' },
  { x: 2610, y: 3000, here: 'ATRIUM', there: 'ATRIUM', vertical: true },
];

const signSprites = new Map<string, HTMLCanvasElement>();
function signSprite(text: string, warm: boolean): HTMLCanvasElement {
  const key = `${text}|${warm ? 1 : 0}`;
  let c = signSprites.get(key);
  if (c) return c;
  const size = 17, padX = 13, h = size + 12;
  c = document.createElement('canvas');
  const g = c.getContext('2d')!;
  const font = `700 ${size}px "Barlow Condensed", "Arial Narrow", sans-serif`;
  g.font = font; (g as unknown as { letterSpacing: string }).letterSpacing = '2px';
  const w = Math.ceil(g.measureText(text).width) + padX * 2;
  c.width = w + 8; c.height = h + 22;
  g.font = font; (g as unknown as { letterSpacing: string }).letterSpacing = '2px';
  g.strokeStyle = INK; g.lineWidth = 3; g.beginPath(); g.moveTo(14, 0); g.lineTo(14, 14); g.moveTo(w - 6, 0); g.lineTo(w - 6, 14); g.stroke(); g.strokeStyle = BRASS; g.lineWidth = 1.4; g.stroke();
  g.fillStyle = 'rgba(20, 24, 32, 0.3)'; g.fillRect(7, 17, w, h);
  g.fillStyle = warm ? '#3a1c22' : '#26324e'; g.fillRect(4, 14, w, h);
  g.strokeStyle = BRASS; g.lineWidth = 2.2; g.strokeRect(7, 17, w - 6, h - 6);
  g.strokeStyle = INK; g.lineWidth = 2; g.strokeRect(4, 14, w, h);
  g.fillStyle = 'rgba(255,255,255,0.12)'; g.fillRect(4, 14, w, 3);
  g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = '#ece6d6'; g.fillText(text, 4 + w / 2, 14 + h / 2 + 1);
  signSprites.set(key, c);
  return c;
}

function embassyUnder(ctx: CanvasRenderingContext2D, now: number, view: ThemeView, map: MapDef) {
  const t = clock(now);
  const { sources, racks } = cacheOf(map);
  for (const s of sources) {
    if (!inView(view, s.x, s.y, s.radius + 120)) continue;
    setLight(s.key, { x: s.x, y: s.y, radius: s.radius, color: s.color, intensity: s.intensity, ...(s.flicker !== undefined && !reduced && { flicker: s.flicker }), ...(s.size !== undefined && { size: s.size }), shadows: s.shadows ?? false });
  }
  // Searchlights over the grounds: two white beams sweeping the lawns and the facade, slow enough to read as a gala's.
  for (const [i, sl] of [{ x: 700, y: 5500, a: -0.9 }, { x: 5300, y: 500, a: Math.PI - 0.9 }].entries()) {
    const a = sl.a + (reduced ? 0 : Math.sin(t * 0.00027 + i * 2.4) * 0.7);
    if (inView(view, sl.x + Math.cos(a) * 900, sl.y + Math.sin(a) * 900, 1600)) setLight(`emb:search${i}`, { x: sl.x, y: sl.y, radius: 1700, color: '#f4f0ff', intensity: 1.1, size: 20, cone: { angle: a, half: 0.1 }, beam: 1.2, shadows: false });
  }
  // Server racks: rows of status LEDs, a few blinking, never faster than about 2 Hz.
  for (const r of racks) {
    if (!inView(view, r.x + r.w / 2, r.y + r.h / 2, 120)) continue;
    const horizontal = r.w >= r.h;
    const bays = Math.floor((horizontal ? r.w : r.h) / 50);
    for (let b = 0; b < bays; b++) {
      for (let k = 0; k < 4; k++) {
        const seed = hash(r.x + b * 50, r.y + k * 7);
        const on = reduced ? seed % 3 !== 0 : Math.floor(t / (480 + (seed % 5) * 160) + seed) % 3 !== 0;
        const px = horizontal ? r.x + b * 50 + 12 + k * 7 : r.x + r.w - 7, py = horizontal ? r.y + r.h + 6 : r.y + b * 50 + 12 + k * 7;
        ctx.fillStyle = on ? (seed % 7 === 0 ? '#ffb347' : '#46e08a') : '#1f3a2a';
        ctx.fillRect(px, py, 2.4, 2.4);
      }
    }
  }
  // The fountain: a ring of foam round the plinth and a slow glitter on the water.
  if (inView(view, FOUNTAIN.x, FOUNTAIN.y, 220)) {
    ctx.save();
    for (let k = 0; k < 6; k++) { const a = t * 0.0006 + k * 1.05, rad = 80 + Math.sin(t * 0.0013 + k) * 14; ctx.fillStyle = `rgba(235, 250, 255, ${0.35 + 0.25 * Math.sin(t * 0.002 + k * 2)})`; ctx.fillRect(FOUNTAIN.x + Math.cos(a) * rad - 1.5, FOUNTAIN.y + Math.sin(a) * rad * 0.8 - 1.5, 3, 3); }
    ctx.restore();
  }
  // X-ray belts: luggage on the belts, a hard case and a briefcase; the third bag has something toy-sized in it.
  for (const [bx, by] of [[1100, 4000], [1900, 4000]] as const) {
    if (!inView(view, bx + 100, by + 50, 200)) continue;
    const slide = reduced ? 0 : ((t * 0.012) % 120);
    for (const [dx, col, w, h] of [[30, '#6a3a2a', 38, 22], [160, '#2f3a58', 30, 18]] as const) {
      const x = bx + ((dx + slide) % 330) + 8;
      ctx.fillStyle = 'rgba(14,16,22,0.3)'; ctx.fillRect(x + 3, by + 52, w, h);
      ctx.fillStyle = col; ctx.fillRect(x, by + 40, w, h); ctx.strokeStyle = INK; ctx.lineWidth = 1.8; ctx.strokeRect(x, by + 40, w, h);
      ctx.fillStyle = BRASS; ctx.fillRect(x + w / 2 - 3, by + 38, 6, 3);
    }
  }
  void BRASS_HI; void TAU; void flag; void hexA; void seal;
}

function camera(ctx: CanvasRenderingContext2D, x: number, y: number, a0: number, t: number, dead: boolean) {
  const a = a0 + (dead || reduced ? 0 : Math.sin(t * 0.00042 + x) * 0.6);
  ctx.save(); ctx.translate(x, y); ctx.rotate(a);
  if (!dead) {
    const g = ctx.createRadialGradient(0, 0, 10, 0, 0, 240);
    g.addColorStop(0, 'rgba(255, 250, 220, 0.09)'); g.addColorStop(1, 'rgba(255, 250, 220, 0)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(0, 0); ctx.arc(0, 0, 240, -0.34, 0.34); ctx.closePath(); ctx.fill();
  }
  ctx.fillStyle = 'rgba(20, 24, 32, 0.3)'; ctx.fillRect(-6, -3, 22, 11);
  ctx.fillStyle = '#8a8f98'; ctx.fillRect(-8, -6, 20, 11); ctx.fillStyle = '#3d4450'; ctx.fillRect(8, -5, 7, 9);
  ctx.strokeStyle = INK; ctx.lineWidth = 2; ctx.strokeRect(-8, -6, 20, 11);
  ctx.restore();
  const on = !dead && (reduced || Math.floor(t / 520) % 2 === 0);
  ctx.fillStyle = on ? '#ff3b30' : '#4a2420'; ctx.beginPath(); ctx.arc(x - 3, y - 8, 2.4, 0, TAU); ctx.fill();
}

function embassyOver(ctx: CanvasRenderingContext2D, now: number, view: ThemeView) {
  const t = clock(now);
  for (const s of SIGNS) {
    for (const west of [true, false]) {
      const p = west ? { x: s.x, y: s.y } : turn(s.x, s.y);
      if (!inView(view, p.x, p.y, 140)) continue;
      const img = signSprite(west ? s.here : s.there, !west);
      ctx.save(); ctx.translate(p.x, p.y); if (s.vertical) ctx.rotate(-Math.PI / 2); ctx.drawImage(img, -img.width / 2, -14); ctx.restore();
    }
  }
  CAMERAS.forEach((c, i) => {
    if (inView(view, c.x, c.y, 260)) camera(ctx, c.x, c.y, c.a, t, false);
    const p = turn(c.x, c.y);
    if (inView(view, p.x, p.y, 260)) camera(ctx, p.x, p.y, c.a + Math.PI, t, i === 2);
  });
  // The flag gallery: the republic's flags and its friends' hang from the wall in a row, rippling slowly. The Portrait Gallery: gilt frames.
  for (let i = 0; i < 9; i++) {
    const x = 940 + i * 190, y = 2634;
    if (inView(view, x, y, 60)) { ctx.fillStyle = INK; ctx.fillRect(x - 2, y - 4, 4, 8); flag(ctx, x - 22, y + 2, 44, 28, (['republic', 'navy', 'crimson', 'green', 'stripe', 'republic', 'gold', 'navy', 'crimson'] as const)[i]!, 2.4, t); }
    const p = turn(x, y + 2);
    if (inView(view, p.x, p.y, 60)) {
      const soldier = i === 4;
      ctx.save(); ctx.translate(p.x, p.y);
      ctx.fillStyle = 'rgba(20,24,32,0.3)'; ctx.fillRect(-18, -2, 44, 38);
      ctx.fillStyle = '#6a4a1a'; ctx.fillRect(-20, -8, 40, 40); ctx.fillStyle = BRASS_HI; ctx.fillRect(-20, -8, 40, 3);
      ctx.fillStyle = soldier ? '#5a6a3a' : ['#3a2a3a', '#2f4a5a', '#5a3a2a', '#3a4a3a'][i % 4]!; ctx.fillRect(-16, -4, 32, 32);
      if (soldier) {
        // Our soldier, in oils: olive helmet, a stern face, a gilt star.
        ctx.fillStyle = '#d9b48a'; ctx.beginPath(); ctx.arc(0, 12, 6, 0, TAU); ctx.fill();
        ctx.fillStyle = '#6c7356'; ctx.beginPath(); ctx.arc(0, 8, 7.6, Math.PI, 0); ctx.fill(); ctx.fillStyle = '#4a5238'; ctx.fillRect(-9, 8, 18, 2);
        ctx.fillStyle = '#3a4228'; ctx.fillRect(-9, 18, 18, 8); ctx.fillStyle = '#d9b24a'; ctx.fillRect(-2, 20, 4, 4);
        ctx.fillStyle = BRASS; ctx.fillRect(-14, 36, 28, 7); ctx.fillStyle = '#26200a'; ctx.font = '700 5px sans-serif'; ctx.textAlign = 'center'; ctx.fillText('OUR MAN IN THE FIELD', 0, 41);
      } else { ctx.fillStyle = 'rgba(255,255,255,0.18)'; ctx.fillRect(-12, 0, 8, 14); ctx.fillStyle = '#d9b48a'; ctx.beginPath(); ctx.arc(2, 8, 5, 0, TAU); ctx.fill(); }
      ctx.strokeStyle = INK; ctx.lineWidth = 2; ctx.strokeRect(-20, -8, 40, 40);
      ctx.restore();
    }
  }
  // Four flagpoles round the atrium's emblem, standing at the diagonals.
  for (const [dx, dy] of [[-300, -300], [300, -300], [-300, 300], [300, 300]] as const) {
    const px = ATRIUM.x + dx, py = ATRIUM.y + dy;
    if (!inView(view, px, py, 70)) continue;
    ctx.fillStyle = 'rgba(14,16,22,0.3)'; ctx.beginPath(); ctx.ellipse(px + 4, py + 4, 9, 5, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = INK; ctx.beginPath(); ctx.arc(px, py, 6, 0, TAU); ctx.fill(); ctx.fillStyle = BRASS; ctx.beginPath(); ctx.arc(px, py, 4, 0, TAU); ctx.fill();
    ctx.strokeStyle = INK; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(px, py - 52); ctx.stroke(); ctx.strokeStyle = '#d8d2c0'; ctx.lineWidth = 2; ctx.stroke();
    flag(ctx, px + 2, py - 52, 34, 22, 'republic', 3, t + dx);
  }
  // Exit signs over the garden doors, and a gnome in the topiary (found it).
  for (const [x, y] of [[775, 2250], [775, 1850], [2975, 2250], [775, 1330]] as const) {
    if (!inView(view, x, y, 60)) continue;
    const glow = 0.78 + 0.22 * Math.sin(t * 0.0021);
    ctx.fillStyle = `rgba(80, 255, 150, ${(0.3 * glow).toFixed(3)})`; ctx.beginPath(); ctx.arc(x, y, 26, 0, TAU); ctx.fill();
    ctx.fillStyle = '#1f9a56'; ctx.fillRect(x - 16, y - 6, 32, 12); ctx.strokeStyle = INK; ctx.lineWidth = 2; ctx.strokeRect(x - 16, y - 6, 32, 12);
    ctx.fillStyle = '#f4fff8'; ctx.fillRect(x - 10, y - 1, 20, 2); ctx.beginPath(); ctx.moveTo(x + 6, y - 4); ctx.lineTo(x + 12, y); ctx.lineTo(x + 6, y + 4); ctx.fill();
  }
  if (inView(view, 560, 2440, 40)) {
    ctx.fillStyle = 'rgba(14,16,22,0.3)'; ctx.beginPath(); ctx.ellipse(563, 2450, 9, 4, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = '#3a5a9a'; ctx.beginPath(); ctx.moveTo(552, 2446); ctx.lineTo(560, 2426); ctx.lineTo(568, 2446); ctx.closePath(); ctx.fill(); ctx.strokeStyle = INK; ctx.lineWidth = 1.5; ctx.stroke();
    ctx.fillStyle = '#e8c8a0'; ctx.beginPath(); ctx.arc(560, 2448, 5, 0, TAU); ctx.fill(); ctx.stroke(); ctx.fillStyle = '#f0ead8'; ctx.fillRect(555, 2449, 10, 5);
  }
}

registerTheme('embassy', {
  floor: paintEmbassyFloor,
  walls: EMBASSY_WALLS,
  under: embassyUnder,
  over: embassyOver,
  drawPoly: drawEmbassyPoly,
  door: drawEmbassyDoor,
  roof: drawEmbassyRoof,
  dusk: 0.28,
});
