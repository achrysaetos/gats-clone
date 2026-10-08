import type { MapDef } from '../../shared/maps.ts';
import { PIECES, SIGNS, SIZE, TOWER, twinOf, type AirSign } from '../../shared/maps/airbasedata.ts';
import { registerAmbient } from '../ambientreg.ts';
import { setLight } from '../lighting.ts';
import { INK } from '../palette.ts';
import { paintAirbaseFloor } from './airbasefloor.ts';
import { AIRBASE_WALLS } from './airbasekit.ts';
import { drawAirbasePoly, drawAirbaseSetPiece } from './airbasepieces.ts';
import { drawVignettes } from './airbasedecor.ts';
import { drawAirbaseDoor, drawAirbaseRoof, roofWatch } from './airbaseroofs.ts';
import { registerTheme, type ThemeView } from './registry.ts';
import { drawVehicleOver } from '../vehicleart.ts';

/**
 * Kestrel Field, after dark. Floors live in airbasefloor.ts, walls in airbasekit.ts, aircraft and vehicles in airbasepieces.ts,
 * doors and roofs in airbaseroofs.ts. This file is the living part, every piece of it slow (nothing above 2 Hz but the
 * aircraft warning lamps, none near the 4 Hz limit) and every glow tied to a fixture: floodlight masts, hangar skylights, window
 * lights, the helipad ring, the taxiway studs, the tower's rotating beacon. Under `prefers-reduced-motion` all of it holds still.
 */
const TAU = Math.PI * 2;
const calm = (() => { try { return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches; } catch { return false; } })();
const clock = (now: number) => (calm ? 4000 : now);
const inView = (v: ThemeView, x: number, y: number, r: number) => x + r >= v.x0 && x - r <= v.x1 && y + r >= v.y0 && y - r <= v.y1;
const turn = <T extends { x: number; y: number }>(p: T): T => ({ ...p, x: SIZE - p.x, y: SIZE - p.y });
const both = <T extends { x: number; y: number }>(list: readonly T[]): T[] => [...list, ...list.map(turn)];

type Source = { key: string; x: number; y: number; radius: number; color: string; intensity: number; flicker?: number; cone?: { angle: number; half: number }; size?: number; shadows?: boolean };

/** Floodlight masts on the apron and yards; each one is a pole with a lamp head and the light it throws. */
const MASTS = both([{ x: 2430, y: 650 }, { x: 2960, y: 1450 }, { x: 2450, y: 2300 }, { x: 700, y: 2900 }, { x: 350, y: 3850 }, { x: 2350, y: 5300 }, { x: 1400, y: 5000 }, { x: 1250, y: 3830 }, { x: 2950, y: 4000 }, { x: 2450, y: 5600 }]);

const SOURCES: Source[] = (() => {
  const s: Source[] = [];
  let n = 0;
  const add = (p: { x: number; y: number }, radius: number, color: string, intensity: number, extra: Partial<Source> = {}) => s.push({ key: `air:${n++}`, x: p.x, y: p.y, radius, color, intensity, ...extra });
  for (const m of MASTS) add({ x: m.x, y: m.y - 46 }, 560, '#ffe2b0', 0.72, { size: 10, shadows: false });
  // hangar tubes: two rows of cold light over the service bay, a warm one in the crib
  for (const t of [false, true]) {
    const P = (x: number, y: number) => (t ? { x: SIZE - x, y: SIZE - y } : { x, y });
    for (const [x, y] of [[700, 700], [1450, 450], [1450, 2000], [2200, 700], [2200, 1750], [1100, 1700]] as const) add(P(x, y), 520, '#cfe3ff', 0.62, { size: 40, shadows: false });
    add(P(525, 1225), 420, '#cfe3ff', 0.5, { size: 30, shadows: false });
    add(P(520, 450), 260, '#ffc977', 0.6, { flicker: 0.05, size: 20, shadows: false });
    for (const [x, y] of [[1200, 2800], [1950, 3200], [1600, 2650]] as const) add(P(x, y), 460, '#d6ffb0', 0.6, { size: 30, shadows: false });
    for (const [x, y] of [[450, 4150], [800, 4150], [1150, 4150], [450, 4650], [800, 4650], [1150, 4650]] as const) add(P(x, y), 240, '#ffd9a0', 0.45, { size: 16, shadows: false });
    add(P(1900, 4200), 440, '#ffc977', 0.62, { flicker: 0.04, size: 30, shadows: false });
    add(P(1900, 4600), 260, '#ffc977', 0.5, { size: 16, shadows: false });
    add(P(400, 2600), 200, '#8fe8ff', 0.6, { flicker: 0.08, size: 14, shadows: false });
    add(P(2100, 5550), 150, '#ff9a3c', 0.5, { size: 12, shadows: false });
    for (const tk of [{ x: 2440, y: 4350 }, { x: 2950, y: 4800 }, { x: 2450, y: 5300 }]) add(P(tk.x, tk.y), 340, '#ff9a3c', 0.55, { size: 16, shadows: false });
    add(P(2625, 5825), 160, '#ffb347', 0.45, { flicker: 0.12, size: 10, shadows: false });
    add(P(2700, 1300), 260, '#9fffd0', 0.45, { size: 30, shadows: false });
  }
  add({ x: TOWER.x, y: TOWER.y }, 520, '#ffe08a', 0.55, { size: 40, shadows: false });
  return s;
})();

/* -- signs ------------------------------------------------------------------------------------------------------------- */

const TONE: Record<NonNullable<AirSign['tone']>, string> = { amber: '#ffb347', green: '#7fe0a0', red: '#ff7a68', white: '#ece6d6' };
const sprites = new Map<string, HTMLCanvasElement>();
function signSprite(s: AirSign): HTMLCanvasElement {
  const key = `${s.text}|${s.sub ?? ''}|${s.tone ?? 'white'}`;
  let c = sprites.get(key);
  if (c) return c;
  const size = 19, padX = 14, h = size + 14 + (s.sub ? 12 : 0);
  c = document.createElement('canvas');
  const g = c.getContext('2d')!;
  const font = `700 ${size}px "Barlow Condensed", "Arial Narrow", sans-serif`;
  g.font = font;
  (g as unknown as { letterSpacing: string }).letterSpacing = '2px';
  const w = Math.ceil(g.measureText(s.text).width) + padX * 2;
  c.width = w + 8; c.height = h + 22;
  g.font = font;
  (g as unknown as { letterSpacing: string }).letterSpacing = '2px';
  g.strokeStyle = INK; g.lineWidth = 3; g.beginPath(); g.moveTo(14, 0); g.lineTo(14, 14); g.moveTo(w - 6, 0); g.lineTo(w - 6, 14); g.stroke();
  g.strokeStyle = '#8a8f98'; g.lineWidth = 1.4; g.stroke();
  g.fillStyle = 'rgba(20, 24, 32, 0.3)'; g.fillRect(7, 17, w, h);
  g.fillStyle = '#2f343c'; g.fillRect(4, 14, w, h);
  g.strokeStyle = TONE[s.tone ?? 'white']; g.lineWidth = 2.2; g.strokeRect(7, 17, w - 6, h - 6);
  g.strokeStyle = INK; g.lineWidth = 2; g.strokeRect(4, 14, w, h);
  g.fillStyle = 'rgba(255, 255, 255, 0.12)'; g.fillRect(4, 14, w, 3);
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillStyle = TONE[s.tone ?? 'white']; g.fillText(s.text, 4 + w / 2, 14 + 4 + size / 2 + 2);
  if (s.sub) { g.font = `700 11px "Barlow Condensed", "Arial Narrow", sans-serif`; (g as unknown as { letterSpacing: string }).letterSpacing = '2px'; g.fillStyle = 'rgba(236,230,214,0.75)'; g.fillText(s.sub, 4 + w / 2, 14 + h - 9); }
  sprites.set(key, c);
  return c;
}

const SIGN_LIST: readonly AirSign[] = [...SIGNS, ...SIGNS.map((s) => ({ ...turn(s), text: s.text === 'HANGAR 1' ? 'HANGAR 2' : s.text === 'BARRACKS A' ? 'OFFICERS' : s.text }))];

/* -- the living part ----------------------------------------------------------------------------------------------------- */


function airbaseUnder(ctx: CanvasRenderingContext2D, now: number, view: ThemeView, _map: MapDef) {
  const t = clock(now);
  for (const s of SOURCES) {
    if (!inView(view, s.x, s.y, s.radius + 100)) continue;
    setLight(s.key, { x: s.x, y: s.y, radius: s.radius, color: s.color, intensity: s.intensity, ...(s.flicker !== undefined && !calm && { flicker: s.flicker }), ...(s.size !== undefined && { size: s.size }), shadows: s.shadows ?? false });
  }
  // The tower's beacon: a slow white sweep, and the green/white alternating flash of the aerodrome light.
  const sweep = calm ? 0.8 : t * 0.0006;
  if (inView(view, TOWER.x, TOWER.y, 1300)) setLight('air:beacon', { x: TOWER.x, y: TOWER.y - 230, radius: 1500, color: '#fff4d0', intensity: 1.1, cone: { angle: sweep, half: 0.12 }, beam: 1.2, size: 10, shadows: false });
  // Taxiway studs breathe in a slow chase toward the plaza, and the pad rings pulse green.
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  for (const flip of [false, true]) {
    for (let y = 120; y < 2300; y += 150) {
      const x = flip ? SIZE - 2425 : 2425, yy = flip ? SIZE - y : y;
      if (!inView(view, x, yy, 40)) continue;
      const k = calm ? 0.8 : 0.55 + 0.45 * Math.sin(t * 0.003 - y * 0.007);
      const g = ctx.createRadialGradient(x, yy, 1, x, yy, 26);
      g.addColorStop(0, `rgba(90,160,255,${(0.55 * k).toFixed(3)})`); g.addColorStop(1, 'rgba(90,160,255,0)');
      ctx.fillStyle = g; ctx.fillRect(x - 26, yy - 26, 52, 52);
    }
    for (let a = 0; a < 48; a++) {
      const tt = (a / 48) * TAU, x = TOWER.x + Math.cos(tt) * 420, y = TOWER.y + Math.sin(tt) * 420;
      if (flip || !inView(view, x, y, 30)) continue;
      const k = calm ? 0.8 : 0.5 + 0.5 * Math.sin(t * 0.0024 - tt * 2);
      const g = ctx.createRadialGradient(x, y, 1, x, y, 22);
      g.addColorStop(0, `rgba(90,160,255,${(0.5 * k).toFixed(3)})`); g.addColorStop(1, 'rgba(90,160,255,0)');
      ctx.fillStyle = g; ctx.fillRect(x - 22, y - 22, 44, 44);
    }
    const pad = flip ? { x: SIZE - 2780, y: SIZE - 800 } : { x: 2780, y: 800 };
    if (inView(view, pad.x, pad.y, 320)) {
      for (let a = 0; a < 18; a++) {
        const tt = (a / 18) * TAU, x = pad.x + Math.cos(tt) * 276, y = pad.y + Math.sin(tt) * 276;
        const k = calm ? 0.8 : 0.5 + 0.5 * Math.sin(t * 0.0022 + a * 0.35);
        const g = ctx.createRadialGradient(x, y, 1, x, y, 24);
        g.addColorStop(0, `rgba(80,230,170,${(0.55 * k).toFixed(3)})`); g.addColorStop(1, 'rgba(80,230,170,0)');
        ctx.fillStyle = g; ctx.fillRect(x - 24, y - 24, 48, 48);
      }
    }
  }
  ctx.restore();
  drawVignettes(ctx, now, view);
  // Mast bases and the pools under the floodlights.
  for (const m of MASTS) {
    if (!inView(view, m.x, m.y, 60)) continue;
    ctx.fillStyle = 'rgba(10,12,18,0.35)'; ctx.beginPath(); ctx.ellipse(m.x + 4, m.y + 5, 16, 9, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = '#4a4f58'; ctx.beginPath(); ctx.arc(m.x, m.y, 11, 0, TAU); ctx.fill(); ctx.strokeStyle = INK; ctx.lineWidth = 2; ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.3)'; ctx.beginPath(); ctx.arc(m.x - 3, m.y - 3, 3, 0, TAU); ctx.fill();
  }
}

function windsock(ctx: CanvasRenderingContext2D, x: number, y: number, t: number) {
  const wind = calm ? 0.3 : 0.5 + 0.4 * Math.sin(t * 0.0004 + x) + 0.1 * Math.sin(t * 0.0021);
  ctx.save();
  ctx.fillStyle = 'rgba(10,12,18,0.3)'; ctx.beginPath(); ctx.ellipse(x + 5, y + 6, 8, 5, 0, 0, TAU); ctx.fill();
  ctx.fillStyle = '#8a8f98'; ctx.beginPath(); ctx.arc(x, y, 6, 0, TAU); ctx.fill(); ctx.strokeStyle = INK; ctx.lineWidth = 2; ctx.stroke();
  const len = 70, droop = 1 - wind;
  const ang = -0.3 + droop * 0.9;
  for (let i = 0; i < 5; i++) {
    const u = i / 5, v = (i + 1) / 5, r0 = 13 - u * 8, r1 = 13 - v * 8;
    const x0 = x + u * len * Math.cos(ang) , y0 = y - 70 + u * len * Math.sin(ang) * 0.6 + droop * u * u * 30, x1 = x + v * len * Math.cos(ang), y1 = y - 70 + v * len * Math.sin(ang) * 0.6 + droop * v * v * 30;
    ctx.fillStyle = i % 2 ? '#e2dccb' : '#d9541f'; ctx.beginPath(); ctx.moveTo(x0, y0 - r0); ctx.lineTo(x1, y1 - r1); ctx.lineTo(x1, y1 + r1); ctx.lineTo(x0, y0 + r0); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = INK; ctx.lineWidth = 1.6; ctx.stroke();
  }
  ctx.strokeStyle = '#8a8f98'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x, y - 70); ctx.stroke();
  ctx.restore();
}

function flag(ctx: CanvasRenderingContext2D, x: number, y: number, t: number, hue: string) {
  const w = calm ? 0 : Math.sin(t * 0.0017 + x) * 5;
  ctx.save();
  ctx.fillStyle = hue; ctx.beginPath(); ctx.moveTo(x, y - 82); ctx.quadraticCurveTo(x + 24, y - 82 + w, x + 52, y - 80 - w * 0.5); ctx.lineTo(x + 52, y - 54 - w * 0.5); ctx.quadraticCurveTo(x + 24, y - 55 + w, x, y - 56); ctx.closePath(); ctx.fill();
  ctx.strokeStyle = INK; ctx.lineWidth = 2; ctx.stroke();
  ctx.fillStyle = '#e2dccb'; ctx.fillRect(x + 4, y - 78, 14, 10);
  ctx.restore();
}

function airbaseOver(ctx: CanvasRenderingContext2D, now: number, view: ThemeView, _map: MapDef, bodies: readonly { x: number; y: number }[]) {
  const t = clock(now);
  roofWatch.bodies = bodies;
  // Rotors turn above everything: the pilot's heli on its pad, and the twin's, a little out of step.
  for (const [i, h] of [PIECES.heli, twinOf(PIECES.heli)].entries()) if (inView(view, h.x, h.y, 520)) drawVehicleOver(ctx, 'heli', { x: h.x, y: h.y, rot: h.rot, livery: i ? 'grey' : 'olive', t: calm ? 900 * i : t + i * 900 });
  // Mast heads, with the lamp glaring.
  for (const m of MASTS) {
    if (!inView(view, m.x, m.y, 90)) continue;
    ctx.fillStyle = '#3d4450'; ctx.fillRect(m.x - 3, m.y - 46, 6, 34);
    ctx.fillStyle = '#4a4f58'; ctx.fillRect(m.x - 14, m.y - 54, 28, 10); ctx.strokeStyle = INK; ctx.lineWidth = 2; ctx.strokeRect(m.x - 14, m.y - 54, 28, 10);
    ctx.fillStyle = '#fff0c8'; ctx.fillRect(m.x - 11, m.y - 51, 22, 4);
    const g = ctx.createRadialGradient(m.x, m.y - 48, 2, m.x, m.y - 48, 56);
    g.addColorStop(0, 'rgba(255,236,190,0.28)'); g.addColorStop(1, 'rgba(255,236,190,0)');
    ctx.fillStyle = g; ctx.fillRect(m.x - 56, m.y - 104, 112, 112);
  }
  for (const w of both([{ x: 2700, y: 2440 }])) if (inView(view, w.x, w.y, 120)) windsock(ctx, w.x, w.y, t);
  for (const [i, f] of [PIECES.heli].entries()) void f, void i;
  const pole = { x: 1875, y: 5320 };
  if (inView(view, pole.x, pole.y, 110)) flag(ctx, pole.x, pole.y, t, '#a8552e');
  const pole2 = turn(pole);
  if (inView(view, pole2.x, pole2.y, 110)) flag(ctx, pole2.x, pole2.y, t, '#4f7fbf');
  // The comms mast's red lamp, and the radar dome's: slow blinks, never faster than once a second.
  for (const m of both([{ x: 760, y: 2640 }, { x: 450, y: 3150 - 70 }])) {
    if (!inView(view, m.x, m.y, 40)) continue;
    const on = calm || Math.floor(t / 600 + m.x) % 2 === 0;
    ctx.fillStyle = on ? '#ff4a40' : '#5a2420'; ctx.beginPath(); ctx.arc(m.x, m.y - 80, 5, 0, TAU); ctx.fill(); ctx.strokeStyle = INK; ctx.lineWidth = 1.6; ctx.stroke();
    if (on) { const g = ctx.createRadialGradient(m.x, m.y - 80, 1, m.x, m.y - 80, 26); g.addColorStop(0, 'rgba(255,70,60,0.5)'); g.addColorStop(1, 'rgba(255,70,60,0)'); ctx.fillStyle = g; ctx.fillRect(m.x - 26, m.y - 106, 52, 52); }
  }
  // Plates hung over the doors.
  for (const s of SIGN_LIST) {
    if (!inView(view, s.x, s.y, 140)) continue;
    const img = signSprite(s);
    ctx.save();
    ctx.translate(s.x, s.y);
    if (s.vertical) ctx.rotate(-Math.PI / 2);
    ctx.drawImage(img, -img.width / 2, -14);
    ctx.restore();
  }
}

registerTheme('airbase', {
  floor: paintAirbaseFloor,
  walls: AIRBASE_WALLS,
  drawSetPiece: drawAirbaseSetPiece,
  drawPoly: drawAirbasePoly,
  door: drawAirbaseDoor,
  roof: drawAirbaseRoof,
  under: airbaseUnder,
  over: airbaseOver,
  night: 0.3,
});

/** Who lives on Kestrel Field: pigeons on the hangar walls, crows on the floodlight masts, rats round the fuel farm and bins,
 * Flaps the cat in the maintenance bay, moths round the lamps, tumbleweed blowing across the apron, a night flight passing high
 * over, and steam from the mess extractor. */
registerAmbient('airbase', {
  wind: { x: 18, y: 6 },
  groups: [
    { kind: 'pigeon', count: 6, on: 'wall', materials: ['hangar'] },
    { kind: 'crow', count: 4, at: both(MASTS.slice(0, 5).map((m) => ({ x: m.x, y: m.y - 50 }))).slice(0, 8) },
    { kind: 'rat', count: 3, in: [{ x: 1400, y: 5000, w: 900, h: 700 }, { x: 2420, y: 4100, w: 560, h: 1700 }] },
    { kind: 'cat', count: 1, at: [{ x: 2175, y: 3425 }], roam: 90 },
    { kind: 'moth', count: 6, at: MASTS.slice(0, 5).map((m) => ({ x: m.x, y: m.y - 46 })), when: 'night' },
    { kind: 'tumbleweed', count: 3, in: [{ x: 2420, y: 1500, w: 1160, h: 900 }] },
    { kind: 'aircraft', count: 1, path: [{ x: -300, y: 900 }, { x: 6300, y: 2400 }], periodMs: 120_000 },
    { kind: 'steam', at: both([{ x: 2098, y: 4566 }]) },
  ],
});
