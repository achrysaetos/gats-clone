import type { MapDef } from '../../shared/maps.ts';
import { SUMMIT_DOORS } from '../../shared/maps/summitgeo.ts';
import { setLight } from '../lighting.ts';
import { INK } from '../palette.ts';
import { penguin } from './summitegg.ts';
import { paintSummitFloor } from './summitfloor.ts';
import { C, SIZE, TAU, calm, clock, ell, font, hash, hexA, type G } from './summitkit.ts';
import { summitLiving } from './summitlife.ts';
import { POOLS } from './summitlake.ts';
import { drawSummitDoor, drawSummitGroup, drawSummitPoly, drawSummitRoof } from './summitpolys.ts';
import { registerTheme, type ThemeView } from './registry.ts';
import { SUMMIT_WALLS, windowSpots } from './summitwalls.ts';

/**
 * Summit, the night a blizzard closed the mountain. Registers the theme: the floor is summitfloor.ts, the walls summitwalls.ts,
 * the polygons, doors and roofs summitpolys.ts, the movers summitlife.ts. This file is the light: every glow has a fixture
 * (the hearth, the windows, the tubs, the rink's floodlights, the lift's beacon, the garage's sodium lamp, the elder pine's
 * strings, the observatory's open slit), and the signs hung over the doors that name where you are.
 */
type Source = { key: string; x: number; y: number; radius: number; color: string; intensity: number; flicker?: number; size?: number; shadows?: boolean };
const turn = (s: Source): Source => ({ ...s, key: `${s.key}~`, x: SIZE - s.x, y: SIZE - s.y });

/** Fixtures on the west half; each has its twin across the half turn, in another colour where the twin is another place. */
const WEST: Source[] = [
  { key: 'hearth', x: 1130, y: 3025, radius: 460, color: '#ff9a3c', intensity: 0.8, flicker: 0.35, size: 30 },
  { key: 'hall', x: 1500, y: 2900, radius: 520, color: '#ffc470', intensity: 0.5, size: 40 },
  { key: 'bar', x: 1500, y: 2330, radius: 380, color: '#ffb347', intensity: 0.55, flicker: 0.1, size: 30 },
  { key: 'shop', x: 1500, y: 3680, radius: 300, color: '#ffe0a0', intensity: 0.5, size: 24 },
  { key: 'wing', x: 650, y: 3000, radius: 340, color: '#ffb347', intensity: 0.4, size: 24 },
  { key: 'tubs', x: 1000, y: 1790, radius: 420, color: '#6fe0d4', intensity: 0.55, size: 40 },
  { key: 'strings', x: 1050, y: 1560, radius: 420, color: '#ffc470', intensity: 0.4, flicker: 0.12, size: 30 },
  { key: 'beacon', x: 2830, y: 470, radius: 260, color: '#ff3b30', intensity: 0.4, size: 10, shadows: false },
  { key: 'gate', x: 2425, y: 985, radius: 340, color: '#ffd9a0', intensity: 0.6, flicker: 0.05, size: 14 },
  { key: 'cabin', x: 650, y: 790, radius: 280, color: '#ffb347', intensity: 0.6, flicker: 0.3, size: 14 },
  { key: 'elder', x: 1000, y: 1250, radius: 460, color: '#ffd08a', intensity: 0.6, flicker: 0.1, size: 60 },
  { key: 'garage', x: 780, y: 5250, radius: 460, color: '#ffcf7a', intensity: 0.6, size: 40 },
  { key: 'doors', x: 1000, y: 5780, radius: 300, color: '#ffd9a0', intensity: 0.5, size: 20 },
  { key: 'hut', x: 2520, y: 4240, radius: 260, color: '#ffb347', intensity: 0.5, flicker: 0.2, size: 12 },
  { key: 'dome', x: 2300, y: 5300, radius: 380, color: '#ffa04a', intensity: 0.4, size: 40 },
  { key: 'staging', x: 225, y: 4875, radius: 380, color: '#ffd08a', intensity: 0.45, flicker: 0.05, size: 10 },
  { key: 'lot', x: 1250, y: 4400, radius: 520, color: '#ffd08a', intensity: 0.4, size: 60 },
  { key: 'rink-a', x: 2330, y: 2570, radius: 640, color: '#dcefff', intensity: 0.55, size: 20 },
  { key: 'rink-b', x: 2330, y: 3430, radius: 640, color: '#dcefff', intensity: 0.55, size: 20 },
];
/** The east half is not a copy: its lights are the other place's colours. */
const EAST_COLOR: Record<string, string> = { hearth: '#ffb27a', hall: '#a8f0e0', bar: '#9fe8c0', shop: '#d8f4f0', wing: '#a8f0e0', tubs: '#8fd8ff', strings: '#ff9a62', beacon: '#8fd8ff', gate: '#9fe0ff', cabin: '#ffc470', elder: '#ff8a7a', garage: '#d6ecff', doors: '#d6ecff', hut: '#e8f2ff', dome: '#bcd0ff', lot: '#cfe6ff', staging: '#cfe6ff' };
/** Lamps under a roof: the roof hangs over the lit hot-spot, so keep it a pin-prick rather than a white orb floating on the shingles. */
const UNDER_ROOF = new Set(['hearth', 'hall', 'bar', 'shop', 'wing', 'cabin', 'garage', 'dome']);
const SOURCES: Source[] = WEST.flatMap((s) => (UNDER_ROOF.has(s.key) ? { ...s, size: 3 } : s)).flatMap((s) => [s, { ...turn(s), color: EAST_COLOR[s.key] ?? s.color }]);
/** The spa's own warm lamps, each tied to a paper lantern painted on the floor (summitspa.ts `lantern`), in east-half coordinates. */
const SPA_LANTERNS: readonly [string, number, number, number][] = [
  ['hot-a', 5032, 3040, 300], ['hot-b', 5032, 2590, 300],
  ['hall-a', 4900, 3340, 250], ['hall-b', 4100, 3340, 250], ['hall-c', 4100, 2610, 250],
  ...[2150, 2500, 2850, 3200, 3550].map((ry, i) => [`room-${i}`, SIZE - 522, SIZE - (ry + 270), 200] as [string, number, number, number]),
];
for (const [k, x, y, radius] of SPA_LANTERNS) SOURCES.push({ key: `spa-${k}`, x, y, radius, color: '#ffc27a', intensity: 0.42, flicker: 0.08, size: 3, shadows: false });

const inView = (v: ThemeView, x: number, y: number, r: number) => x + r >= v.x0 && x - r <= v.x1 && y + r >= v.y0 && y - r <= v.y1;

/** Window spots from every lit wall: a pane's warm spill on the snow in front of it, tied to the pane painted on the wall. */
const windowCache = new Map<string, { x: number; y: number; color: string }[]>();
function windows(map: MapDef) {
  let w = windowCache.get(map.name);
  if (w) return w;
  w = [];
  for (const wall of map.walls) {
    if (wall.material !== 'timber') continue;
    const cx = wall.x + wall.w / 2, cy = wall.y + wall.h / 2;
    const lit = (cx < 2050 && cy > 2050 && cy < 3950) || (cx > 3950 && cy > 2050 && cy < 3950);
    if (!lit) continue;
    for (const x of windowSpots(wall)) w.push({ x: x + 15, y: wall.y + wall.h + 12, color: cx > 3000 ? '#a8f0e0' : '#ffc470' });
  }
  windowCache.set(map.name, w);
  return w;
}

function summitUnder(g: G, now: number, view: ThemeView, map: MapDef) {
  const t = clock(now);
  for (const s of SOURCES) {
    if (!inView(view, s.x, s.y, s.radius + 120)) continue;
    const pulse = s.key.startsWith('beacon') ? 0.4 + 0.6 * Math.max(0, Math.sin(t * 0.0035)) : 1;
    setLight(`sum:${s.key}`, { x: s.x, y: s.y, radius: s.radius, color: s.color, intensity: s.intensity * pulse, ...(s.flicker !== undefined && !calm && { flicker: s.flicker }), ...(s.size !== undefined && { size: s.size }), shadows: s.shadows ?? s.radius > 400 });
  }
  // Light spilling from the windows onto the snow: warm panes of it, hard-edged at the sill and fading south.
  g.save(); g.globalCompositeOperation = 'lighter';
  for (const w of windows(map)) {
    if (!inView(view, w.x, w.y, 90)) continue;
    const gr = g.createLinearGradient(0, w.y, 0, w.y + 70);
    gr.addColorStop(0, hexA(w.color, 0.17)); gr.addColorStop(1, hexA(w.color, 0));
    g.fillStyle = gr; g.beginPath(); g.moveTo(w.x - 15, w.y); g.lineTo(w.x + 15, w.y); g.lineTo(w.x + 36, w.y + 70); g.lineTo(w.x - 36, w.y + 70); g.closePath(); g.fill();
  }
  g.restore();
  // Open water: slow rings spreading from nowhere, and a glint.
  for (const p of POOLS) {
    if (!inView(view, p.x, p.y, p.r + 40)) continue;
    g.save(); g.beginPath(); g.arc(p.x, p.y, p.r * 0.92, 0, TAU); g.clip();
    for (let i = 0; i < 3; i++) {
      const u = (t * 0.00018 + i / 3 + hash(p.x, i)) % 1, rx = p.x + (hash(p.y, i) - 0.5) * p.r * 0.8, ry = p.y + (hash(p.x, i + 3) - 0.5) * p.r * 0.8;
      g.strokeStyle = `rgba(150, 205, 230, ${(0.34 * (1 - u)).toFixed(3)})`; g.lineWidth = 2; ell(g, rx, ry, 8 + u * 70, 6 + u * 52); g.stroke();
    }
    g.restore();
  }
}

/* -- signs ------------------------------------------------------------------------------------------------------------------ */

type Sign = { x: number; y: number; west: string; east: string; small?: boolean };
const SIGNS: Sign[] = [
  { x: 2105, y: 2840, west: 'SUMMIT LODGE', east: 'ALPINE SPA' },
  { x: 1000, y: 1535, west: 'HOT TUBS', east: 'SAUNA YARD' },
  { x: 2425, y: 1030, west: 'LIFT STATION', east: 'ICE GARDEN' },
  { x: 700, y: 340, west: 'PINE WOODS', east: 'TREE FARM' },
  { x: 800, y: 4960, west: 'SNOWCAT GARAGE', east: 'CABLE CARS' },
  { x: 2300, y: 4960, west: 'FUEL DEPOT', east: 'OBSERVATORY' },
  { x: 1260, y: 4040, west: 'LODGE LOT', east: 'SHUTTLE LOOP' },
  { x: 2525, y: 4020, west: 'FISHING HUT', east: 'ZAMBONI', small: true },
  { x: 2600, y: 2330, west: 'THIN ICE', east: 'THIN ICE', small: true },
];
const signSprites = new Map<string, HTMLCanvasElement>();
function signSprite(text: string, small: boolean, red: boolean): HTMLCanvasElement {
  const key = `${text}|${small}|${red}`;
  let c = signSprites.get(key);
  if (c) return c;
  const size = small ? 15 : 20, padX = 14, h = size + 14;
  c = document.createElement('canvas');
  const g = c.getContext('2d')!;
  const fnt = `700 ${size}px "Barlow Condensed", "Arial Narrow", sans-serif`;
  g.font = fnt; (g as unknown as { letterSpacing: string }).letterSpacing = '2px';
  const w = Math.ceil(g.measureText(text).width) + padX * 2;
  c.width = w + 8; c.height = h + 24;
  g.font = fnt; (g as unknown as { letterSpacing: string }).letterSpacing = '2px';
  g.strokeStyle = INK; g.lineWidth = 3.4; g.beginPath(); g.moveTo(14, 0); g.lineTo(14, 14); g.moveTo(w - 6, 0); g.lineTo(w - 6, 14); g.stroke();
  g.strokeStyle = C.brass; g.lineWidth = 1.4; g.stroke();
  g.fillStyle = 'rgba(14, 18, 34, 0.32)'; g.fillRect(7, 17, w, h);
  g.fillStyle = red ? '#8a2e22' : '#3a2a1c'; g.fillRect(4, 14, w, h);
  g.strokeStyle = red ? '#e2dccb' : C.brass; g.lineWidth = 2.4; g.strokeRect(7, 17, w - 6, h - 6);
  g.strokeStyle = INK; g.lineWidth = 2; g.strokeRect(4, 14, w, h);
  g.fillStyle = 'rgba(214, 228, 248, 0.7)'; g.fillRect(2, 11, w + 4, 5);
  g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = '#ece6d6'; g.fillText(text, 4 + w / 2, 14 + h / 2 + 1);
  signSprites.set(key, c);
  return c;
}

function summitOver(g: G, now: number, view: ThemeView, _map: MapDef) {
  for (const s of SIGNS) {
    for (const [x, y, text] of [[s.x, s.y, s.west], [SIZE - s.x, SIZE - s.y, s.east]] as const) {
      if (!inView(view, x, y, 160)) continue;
      const img = signSprite(text, !!s.small, false);
      g.drawImage(img, x - img.width / 2, y - 14);
    }
  }
  // LIFTS CLOSED, hung on the gate's chain (and the ice garden's twin is closed too).
  for (const [x, y, text] of [[2425, 922, 'LIFTS CLOSED'], [SIZE - 2425, SIZE - 922, 'GARDEN CLOSED']] as const) {
    if (!inView(view, x, y, 140)) continue;
    const img = signSprite(text, false, true);
    g.save(); g.translate(x, y); g.rotate(calm ? 0 : Math.sin(clock(now) * 0.0013) * 0.025); g.drawImage(img, -img.width / 2, -14); g.restore();
  }
  summitLiving(g, now, view);
  penguin(g, now, view);
}

registerTheme('summit', {
  floor: paintSummitFloor,
  walls: SUMMIT_WALLS,
  under: summitUnder,
  over: summitOver,
  drawPoly: drawSummitPoly,
  drawSetPiece: drawSummitGroup,
  door: drawSummitDoor,
  roof: drawSummitRoof,
  dusk: 0.55,
});
void SUMMIT_DOORS; void font;
