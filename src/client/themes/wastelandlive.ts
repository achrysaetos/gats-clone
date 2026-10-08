import type { MapDef } from '../../shared/maps.ts';
import { setLight } from '../lighting.ts';
import { C, SIZE, TAU, hash } from './wastelandkit.ts';
import type { ThemeView } from './registry.ts';

/**
 * Everything in the Wasteland that glows or moves, each slow (nothing above 1 Hz but fire flicker, nowhere near the 4 Hz
 * limit) and each tied to a fixture: fire barrels, the station's price sign that creaks on its chain, the scrap wind-pump's fan,
 * a flapping tarp at the red camp, the crater's breathing glow, a radio that plays to nobody, the market's bulbs, the bunker's
 * alarm beacon, the church's candles. Under `prefers-reduced-motion` all of it holds still.
 */
type G = CanvasRenderingContext2D;
const calm = (() => { try { return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches; } catch { return false; } })();
const clock = (now: number) => (calm ? 4000 : now);
const inView = (v: ThemeView, x: number, y: number, r: number) => x + r >= v.x0 && x - r <= v.x1 && y + r >= v.y0 && y - r <= v.y1;
const turn = (p: { x: number; y: number }) => ({ x: SIZE - p.x, y: SIZE - p.y });

type Src = { key: string; x: number; y: number; radius: number; color: string; intensity: number; flicker?: number; size?: number; shadows?: boolean };
const WEST: readonly (Omit<Src, 'key'> & { twin?: { color: string; radius?: number; intensity?: number } })[] = [
  { x: 2950, y: 960, radius: 420, color: '#d9e68a', intensity: 0.55, flicker: 0.25, size: 40, twin: { color: '#ffd070', intensity: 0.7 } },   // canopy tubes / market bulbs
  { x: 2400, y: 900, radius: 260, color: '#f0f2c0', intensity: 0.5, flicker: 0.3, size: 20, twin: { color: '#ffb347', intensity: 0.5 } },    // store
  { x: 3720, y: 925, radius: 200, color: '#9ad0e0', intensity: 0.4, size: 14, twin: { color: '#ffd070', intensity: 0.45 } },                 // wash / alley
  { x: 2155, y: 1200, radius: 230, color: '#ff4a3a', intensity: 0.35, flicker: 0.4, size: 12, twin: { color: '#ffd070', intensity: 0.5 } },  // price sign / mast flags
  { x: 1050, y: 2720, radius: 360, color: '#7fd6c8', intensity: 0.55, size: 50, twin: { color: '#ffcf8a', intensity: 0.6 } },               // pool skylight / candles
  { x: 1250, y: 1500, radius: 300, color: '#ffb15e', intensity: 0.45, size: 30, twin: { color: '#ff5a3a', intensity: 0.55 } },              // under the span / flares
  { x: 4900, y: 900, radius: 380, color: '#ff9a4a', intensity: 0.6, flicker: 0.5, size: 20, twin: { color: '#ff3b30', intensity: 0.4 } },    // plaza fire / bunker beacon
  { x: 4500, y: 450, radius: 220, color: '#ffb347', intensity: 0.45, flicker: 0.3, size: 12, twin: { color: '#8fb8e0', intensity: 0.4 } },
  { x: 5400, y: 450, radius: 220, color: '#ffb347', intensity: 0.45, flicker: 0.3, size: 12, twin: { color: '#8fb8e0', intensity: 0.4 } },
  { x: 4550, y: 1450, radius: 220, color: '#ffb347', intensity: 0.4, flicker: 0.3, size: 12, twin: { color: '#8fb8e0', intensity: 0.4 } },
];
const lightCache = new Map<string, Src[]>();
function sources(map: MapDef): Src[] {
  let list = lightCache.get(map.name);
  if (list) return list;
  list = [];
  WEST.forEach((s, i) => {
    list!.push({ ...s, key: `wl:${i}` });
    const t = turn(s);
    list!.push({ ...s, ...t, key: `wl:${i}~`, color: s.twin?.color ?? s.color, radius: s.twin?.radius ?? s.radius, intensity: s.twin?.intensity ?? s.intensity });
  });
  list.push({ key: 'wl:crater', x: 3000, y: 3000, radius: 620, color: '#7fe88a', intensity: 0.5, size: 60 });
  for (const p of map.polys ?? []) {
    if (p.material !== 'barrel') continue;
    let cx = 0, cy = 0;
    for (const q of p.points) { cx += q.x; cy += q.y; }
    list.push({ key: `wl:fb:${p.id}`, x: cx / p.points.length, y: cy / p.points.length, radius: 300, color: '#ff9a3c', intensity: 0.75, flicker: 0.55, size: 14, shadows: false });
  }
  lightCache.set(map.name, list);
  return list;
}

function fire(g: G, x: number, y: number, t: number, seed: number) {
  // a fire barrel's flames: three tongues, quick but small
  const f = calm ? 1 : 0.8 + 0.2 * Math.sin(t * 0.013 + seed) * Math.sin(t * 0.007 + seed * 2);
  const gl = g.createRadialGradient(x, y - 6, 3, x, y - 6, 54 * f);
  gl.addColorStop(0, 'rgba(255, 190, 90, 0.45)'); gl.addColorStop(1, 'rgba(255, 140, 50, 0)');
  g.fillStyle = gl; g.fillRect(x - 60, y - 66, 120, 120);
  for (const [dx, h, col] of [[-5, 20, '#d9541f'], [5, 24, '#ff9a3c'], [0, 30, '#ff9a3c'], [0, 16, '#ffe08a']] as const) {
    const hh = h * (calm ? 1 : 0.8 + 0.3 * Math.sin(t * 0.011 + seed + dx));
    g.fillStyle = col; g.beginPath(); g.moveTo(x + dx - 7, y); g.quadraticCurveTo(x + dx - 6, y - hh * 0.6, x + dx, y - hh); g.quadraticCurveTo(x + dx + 6, y - hh * 0.6, x + dx + 7, y); g.closePath(); g.fill();
  }
}

export function wastelandUnder(g: G, now: number, view: ThemeView, map: MapDef): void {
  const t = clock(now);
  for (const s of sources(map)) {
    if (!inView(view, s.x, s.y, s.radius + 120)) continue;
    const breathe = s.key === 'wl:crater' ? 0.8 + 0.2 * Math.sin(t * 0.0012) : s.key.startsWith('wl:') && s.key.endsWith('~') && s.color === '#ff3b30' ? 0.5 + 0.5 * Math.sin(t * 0.004) : 1;
    setLight(s.key, { x: s.x, y: s.y, radius: s.radius, color: s.color, intensity: s.intensity * breathe, ...(s.flicker !== undefined && !calm && { flicker: s.flicker }), ...(s.size !== undefined && { size: s.size }), shadows: s.shadows ?? s.radius > 300 });
  }
  // God rays: the low orange sun comes in from the west through the dust, in long slow shafts across the town.
  for (let i = 0; i < 4; i++) {
    const x = -300, y = 900 + i * 1400, a = 0.28 + i * 0.07 + (calm ? 0 : Math.sin(t * 0.00012 + i * 2) * 0.04);
    if (!inView(view, x + Math.cos(a) * 1500, y + Math.sin(a) * 1500, 1700)) continue;
    setLight(`wl:ray${i}`, { x, y, radius: 3200, color: '#ff9a4a', intensity: 0.55, size: 80, cone: { angle: a, half: 0.1 }, beam: 0.9, shadows: false });
  }
  for (const p of map.polys ?? []) {
    if (p.material !== 'barrel') continue;
    let cx = 0, cy = 0;
    for (const q of p.points) { cx += q.x; cy += q.y; }
    cx /= p.points.length; cy /= p.points.length;
    if (inView(view, cx, cy, 80)) fire(g, cx, cy - 12, t, hash(Math.round(cx), Math.round(cy)) * 9);
  }
  // the crater breathes: a faint green haze that swells and settles
  if (inView(view, 3000, 3000, 700)) {
    const k = 0.7 + 0.3 * Math.sin(t * 0.0012);
    g.save(); g.globalCompositeOperation = 'lighter';
    const gr = g.createRadialGradient(3000, 3000, 20, 3000, 3000, 520);
    gr.addColorStop(0, `rgba(110, 255, 150, ${(0.17 * k).toFixed(3)})`); gr.addColorStop(1, 'rgba(110, 255, 150, 0)');
    g.fillStyle = gr; g.fillRect(2460, 2460, 1080, 1080);
    g.restore();
  }
  // the radio in the vestry plays to nobody: a blinking LED and sound rings that swell and fade
  const rx = 1180, ry = 2430;
  if (inView(view, rx, ry, 80)) {
    g.fillStyle = 'rgba(20,24,32,0.35)'; g.fillRect(rx - 12, ry - 6, 28, 18);
    g.fillStyle = '#8a5a34'; g.fillRect(rx - 14, ry - 10, 28, 18); g.strokeStyle = C.ink; g.lineWidth = 2; g.strokeRect(rx - 14, ry - 10, 28, 18);
    g.fillStyle = '#d9c28a'; g.fillRect(rx - 10, ry - 6, 11, 10); g.fillStyle = '#26282e'; g.beginPath(); g.arc(rx + 7, ry - 1, 4, 0, TAU); g.fill();
    g.strokeStyle = C.ink; g.lineWidth = 2; g.beginPath(); g.moveTo(rx + 10, ry - 10); g.lineTo(rx + 20, ry - 30); g.stroke();
    const on = calm || Math.floor(t / 600) % 2 === 0;
    g.fillStyle = on ? '#ff5a3a' : '#5a2a22'; g.beginPath(); g.arc(rx - 9, ry + 5, 2, 0, TAU); g.fill();
    if (!calm) for (let i = 0; i < 3; i++) { const u = ((t * 0.0004 + i / 3) % 1); g.strokeStyle = `rgba(230, 220, 190, ${(0.35 * (1 - u)).toFixed(3)})`; g.lineWidth = 2; g.beginPath(); g.arc(rx - 2, ry - 30, 8 + u * 36, -2.4, -0.8); g.stroke(); }
  }
}

/* ---------------------------------------------------------------- hung signs */

type Plate = { text: string; x: number; y: number; w?: number; kind?: 'green' | 'board' | 'warn' | 'plate' };
const PLATES: readonly Plate[] = [
  { text: 'THE OVERPASS', x: 700, y: 1255, kind: 'green' }, { text: 'CRASH SITE', x: 5300, y: 4745, kind: 'plate' },
  { text: 'GAS STATION', x: 2950, y: 690, kind: 'plate' }, { text: 'SCRAP MARKET', x: 3050, y: 5310, kind: 'board' },
  { text: 'SHANTY TOWN', x: 4950, y: 330, kind: 'board' }, { text: 'BUNKER No. 4', x: 1050, y: 5670, kind: 'plate' },
  { text: 'DRY POOL', x: 1050, y: 2690, kind: 'plate' }, { text: 'OLD CHURCH', x: 4950, y: 3310, kind: 'board' },
  { text: 'DANGER  RADIATION', x: 3000, y: 2290, kind: 'warn' }, { text: 'DANGER  RADIATION', x: 3000, y: 3710, kind: 'warn' },
  { text: 'WATER 2 CANS', x: 4900, y: 1180, kind: 'board' }, { text: 'WATER 2 CANS', x: 1100, y: 4820, kind: 'board' },
  { text: 'NO DIVING', x: 1650, y: 3330, kind: 'plate' }, { text: 'PRAY FOR RAIN', x: 4350, y: 2670, kind: 'board' },
];
const plateSprites = new Map<string, HTMLCanvasElement>();
function plateSprite(p: Plate): HTMLCanvasElement {
  const key = `${p.text}|${p.kind}`;
  let c = plateSprites.get(key);
  if (c) return c;
  const size = 19, padX = 14, h = size + 14;
  c = document.createElement('canvas');
  const g = c.getContext('2d')!;
  const font = `800 ${size}px "Barlow Condensed", "Arial Narrow", sans-serif`;
  g.font = font; (g as unknown as { letterSpacing: string }).letterSpacing = '2px';
  const w = Math.ceil(g.measureText(p.text).width) + padX * 2;
  c.width = w + 8; c.height = h + 22;
  g.font = font; (g as unknown as { letterSpacing: string }).letterSpacing = '2px';
  const fill = p.kind === 'green' ? '#2f6a4a' : p.kind === 'warn' ? '#c9a23c' : p.kind === 'board' ? '#7a5a38' : '#4a525c';
  const ink = p.kind === 'warn' ? '#1c1f26' : '#e8e0c8';
  g.strokeStyle = C.ink; g.lineWidth = 3; g.beginPath(); g.moveTo(14, 0); g.lineTo(14, 14); g.moveTo(w - 6, 0); g.lineTo(w - 6, 14); g.stroke();
  g.fillStyle = 'rgba(20, 24, 32, 0.3)'; g.fillRect(7, 17, w, h);
  g.fillStyle = fill; g.fillRect(4, 14, w, h);
  g.fillStyle = 'rgba(255,255,255,0.14)'; g.fillRect(4, 14, w, 3);
  if (p.kind === 'board') { g.strokeStyle = 'rgba(30,18,8,0.5)'; g.lineWidth = 1.6; g.beginPath(); g.moveTo(4, 14 + h / 2); g.lineTo(4 + w, 14 + h / 2); g.stroke(); }
  g.strokeStyle = C.ink; g.lineWidth = 2; g.strokeRect(4, 14, w, h);
  g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = ink; g.fillText(p.text, 4 + w / 2, 14 + h / 2 + 1);
  plateSprites.set(key, c);
  return c;
}

/** The scrap wind-pump: four sheet-metal blades on a post, turning slowly with the wind. */
function fan(g: G, x: number, y: number, t: number) {
  g.fillStyle = 'rgba(20,24,32,0.3)'; g.beginPath(); g.ellipse(x + 8, y + 40, 22, 8, 0, 0, TAU); g.fill();
  g.strokeStyle = C.ink; g.lineWidth = 7; g.lineCap = 'round'; g.beginPath(); g.moveTo(x, y + 36); g.lineTo(x, y); g.stroke();
  g.strokeStyle = C.steelLo; g.lineWidth = 3.4; g.beginPath(); g.moveTo(x, y + 36); g.lineTo(x, y); g.stroke();
  const a = calm ? 0.4 : t * 0.0016;
  for (let i = 0; i < 4; i++) {
    g.save(); g.translate(x, y); g.rotate(a + (i * TAU) / 4);
    g.fillStyle = [C.rust, C.scrapB, C.scrapC, C.scrapD][i]!; g.beginPath(); g.moveTo(4, -5); g.lineTo(40, -9); g.lineTo(40, 9); g.lineTo(4, 5); g.closePath(); g.fill();
    g.strokeStyle = C.ink; g.lineWidth = 2; g.stroke();
    g.restore();
  }
  g.fillStyle = C.steel; g.beginPath(); g.arc(x, y, 6, 0, TAU); g.fill(); g.stroke();
}

function tarpFlap(g: G, x: number, y: number, t: number) {
  const k = calm ? 0 : Math.sin(t * 0.0021) * 0.5 + Math.sin(t * 0.0053) * 0.2;
  g.fillStyle = C.tarpOrange; g.strokeStyle = C.ink; g.lineWidth = 2;
  g.beginPath(); g.moveTo(x, y); g.quadraticCurveTo(x + 30, y + 6 + k * 14, x + 62, y + 14 + k * 22); g.lineTo(x + 64, y + 52 + k * 20); g.quadraticCurveTo(x + 30, y + 44 + k * 10, x, y + 40); g.closePath(); g.fill(); g.stroke();
  g.fillStyle = 'rgba(255,255,255,0.14)'; g.fillRect(x + 2, y + 2, 28, 5);
}

export function wastelandOver(g: G, now: number, view: ThemeView, map: MapDef): void {
  void map;
  const t = clock(now);
  for (const p of PLATES) {
    if (!inView(view, p.x, p.y, 160)) continue;
    const img = plateSprite(p);
    g.drawImage(img, p.x - img.width / 2, p.y - 14);
  }
  // the price sign on its chain: it creaks to and fro
  const sx = 2155, sy = 1170;
  if (inView(view, sx, sy, 140)) {
    const swing = calm ? 0 : Math.sin(t * 0.0013) * 0.1;
    g.save(); g.translate(sx, sy); g.rotate(swing);
    g.fillStyle = 'rgba(20,24,32,0.3)'; g.fillRect(-34, -14, 76, 40);
    g.fillStyle = '#d9d2b8'; g.fillRect(-38, -20, 76, 40); g.fillStyle = C.paintRed; g.fillRect(-38, -20, 76, 11);
    g.fillStyle = '#26282e'; g.font = '800 18px "Barlow Condensed", "Arial Narrow", sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('GAS $0.00', 0, 8);
    g.strokeStyle = C.ink; g.lineWidth = 2.4; g.strokeRect(-38, -20, 76, 40);
    g.restore();
    const on = calm || Math.sin(t * 0.0009) > -0.8;
    if (on) { g.fillStyle = 'rgba(255, 80, 60, 0.2)'; g.beginPath(); g.arc(sx, sy, 30, 0, TAU); g.fill(); }
  }
  if (inView(view, 4020, 1880, 90)) fan(g, 4020, 1840, t);
  if (inView(view, 1980, 4160, 90)) fan(g, 1980, 4120, t + 900);
  if (inView(view, 460, 170, 90)) tarpFlap(g, 456, 160, t);
}
