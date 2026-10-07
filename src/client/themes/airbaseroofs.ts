import type { DoorLeaf } from '../../shared/sim/doors.ts';
import { unflat, type MapDoor, type MapRoof, type Pt } from '../../shared/geom.ts';
import { SIZE, TOWER } from '../../shared/maps/airbasedata.ts';
import { drawExtruded, type GeoInfo, type PolyLook } from '../geoart.ts';
import { setLight } from '../lighting.ts';
import { INK } from '../palette.ts';
import { mix } from './airbasekit.ts';

/**
 * Doors and roofs. Hangar and bay doors are corrugated sliders with hazard leading edges that run on a floor track; the
 * personnel doors are steel or board with a window and a kick plate; every open door leaks the light of its room. Roofs are
 * drawn over the bodies and fade as you step in: the hangars wear a barrel vault with skylights and their number, the barracks
 * tar-paper ridges, the mess a vent that steams, the comms shed a turning dish, and the tower a lit glass cab on a slim stalk.
 */
type G = CanvasRenderingContext2D;
const TAU = Math.PI * 2;
const look = (top: string): PolyLook => ({ top, front: mix(top, 0, 0.42), lit: mix(top, 255, 0.24), shade: mix(top, 0, 0.3) });
const calm = (() => { try { return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches; } catch { return false; } })();
const clock = (now: number) => (calm ? 4000 : now);
const trace = (g: G, pts: readonly Pt[]) => { g.beginPath(); pts.forEach((p, i) => (i ? g.lineTo(p.x, p.y) : g.moveTo(p.x, p.y))); g.closePath(); };
const leafPts = (l: DoorLeaf): Pt[] => (l.pts ? unflat(l.pts) : [{ x: l.x, y: l.y }, { x: l.x + l.w, y: l.y }, { x: l.x + l.w, y: l.y + l.h }, { x: l.x, y: l.y + l.h }]);

/* -- doors ------------------------------------------------------------------------------------------------------------ */

const DOOR_LOOK: Record<string, PolyLook> = { metal: look('#8a96a2'), wood: look('#9a7448'), glass: look('#8fb4b6') };

export function drawAirbaseDoor(g: G, d: MapDoor, leaves: readonly DoorLeaf[], open: number, info: GeoInfo): boolean {
  const h = d.axis === 'h';
  const x1 = d.x + (h ? d.w : 0), y1 = d.y + (h ? 0 : d.w);
  const slide = d.kind === 'slide' || d.kind === 'double-slide';
  const big = slide && d.w >= 200;
  if (d.glow && open > 0.05) {
    const cx = (d.x + x1) / 2, cy = (d.y + y1) / 2;
    setLight(`door:${d.id}`, { x: cx, y: cy, radius: big ? 280 : 190, color: d.glow, intensity: 0.6 * open, size: 14, inside: 60 });
    g.save(); g.globalCompositeOperation = 'lighter';
    const r = big ? 190 : 130, gr = g.createRadialGradient(cx, cy, 6, cx, cy, r);
    gr.addColorStop(0, d.glow); gr.addColorStop(1, 'rgba(0,0,0,0)');
    g.globalAlpha = 0.18 * open * (1 - 0.6 * info.dark); g.fillStyle = gr; g.fillRect(cx - r, cy - r, r * 2, r * 2);
    g.restore();
  }
  // The floor: a rail for a slider, a hazard sill for any door, and a scuffed arc where a swing leaf sweeps.
  g.save();
  g.lineCap = 'butt';
  if (slide) {
    g.strokeStyle = 'rgba(10,12,18,0.55)'; g.lineWidth = 5; g.beginPath(); g.moveTo(d.x - (h ? 30 : 0), d.y - (h ? 0 : 30)); g.lineTo(x1 + (h ? 30 : 0), y1 + (h ? 0 : 30)); g.stroke();
    g.strokeStyle = '#8a8f98'; g.lineWidth = 2; g.beginPath(); g.moveTo(d.x - (h ? 30 : 0), d.y - (h ? 0 : 30)); g.lineTo(x1 + (h ? 30 : 0), y1 + (h ? 0 : 30)); g.stroke();
  } else {
    g.strokeStyle = 'rgba(10,12,18,0.18)'; g.lineWidth = 2;
    g.beginPath(); if (h) { g.arc(d.x, d.y, d.kind === 'double-swing' ? d.w / 2 : d.w, 0, Math.PI); } else g.arc(d.x, d.y, d.kind === 'double-swing' ? d.w / 2 : d.w, -Math.PI / 2, Math.PI / 2); g.stroke();
  }
  g.fillStyle = 'rgba(183,154,74,0.55)';
  if (h) { g.fillRect(d.x, d.y - 5, d.w, 3); g.fillRect(d.x, d.y + 2, d.w, 3); } else { g.fillRect(d.x - 5, d.y, 3, d.w); g.fillRect(d.x + 2, d.y, 3, d.w); }
  g.restore();
  const l = DOOR_LOOK[d.material] ?? DOOR_LOOK.metal!;
  for (const leaf of leaves) {
    const pts = leafPts(leaf);
    drawExtruded(g, pts, big ? 30 : 22, l);
    // Panel dress on the leaf: corrugation on the big sliders, a window and kick plate on the others.
    g.save(); trace(g, pts); g.clip();
    if (big) {
      g.strokeStyle = 'rgba(20,26,32,0.4)'; g.lineWidth = 1.6;
      for (let t = 0; t < d.w; t += 10) { g.beginPath(); if (h) { g.moveTo(d.x + t, leaf.y); g.lineTo(d.x + t, leaf.y + leaf.h); } else { g.moveTo(leaf.x, d.y + t); g.lineTo(leaf.x + leaf.w, d.y + t); } g.stroke(); }
      g.fillStyle = '#c9a23c';
      if (h) { g.fillRect(leaf.x, leaf.y, 5, leaf.h); g.fillRect(leaf.x + leaf.w - 5, leaf.y, 5, leaf.h); } else { g.fillRect(leaf.x, leaf.y, leaf.w, 5); g.fillRect(leaf.x, leaf.y + leaf.h - 5, leaf.w, 5); }
    } else if (d.material !== 'glass') {
      const cx = leaf.x + leaf.w / 2, cy = leaf.y + leaf.h / 2;
      g.fillStyle = d.glow ? d.glow : '#26364a'; g.fillRect(cx - 5, cy - 3, 10, 6);
    }
    g.restore();
  }
  // Frame posts and the header's hinge pins.
  const t = (d.thick ?? 12) + 6;
  for (const [px, py] of [[d.x, d.y], [x1, y1]] as const) drawExtruded(g, [{ x: px - t / 2, y: py - t / 2 }, { x: px + t / 2, y: py - t / 2 }, { x: px + t / 2, y: py + t / 2 }, { x: px - t / 2, y: py + t / 2 }], big ? 34 : 26, look('#5b616c'));
  if (!slide) { g.fillStyle = INK; for (const [hx, hy] of (d.kind === 'double-swing' ? [[d.x, d.y], [x1, y1]] : (d.hinge ?? 'start') === 'start' ? [[d.x, d.y]] : [[x1, y1]]) as [number, number][]) { g.beginPath(); g.arc(hx, hy, 3.5, 0, TAU); g.fill(); } }
  return true;
}

/* -- roofs ------------------------------------------------------------------------------------------------------------- */

const ROOF: Record<string, { top: string; kind: 'vault' | 'tar' | 'flat' | 'plank' | 'cab' | 'mess' | 'shed' }> = {
  hangar1: { top: '#6d7882', kind: 'vault' },
  bay1: { top: '#6f7d70', kind: 'vault' },
  crib: { top: '#7a6648', kind: 'plank' },
  cage: { top: '#59606a', kind: 'flat' },
  comms: { top: '#62707a', kind: 'shed' },
  stairs: { top: '#7b7e84', kind: 'flat' },
  barracksA: { top: '#5c5f52', kind: 'tar' },
  barracksB: { top: '#6a5a46', kind: 'tar' },
  mess: { top: '#7a6a4e', kind: 'mess' },
  armoury: { top: '#575c52', kind: 'flat' },
  booth: { top: '#8a8d90', kind: 'flat' },
  tower: { top: '#a4a9ae', kind: 'cab' },
};

const FONT = (px: number) => `700 ${px}px "Barlow Condensed", "Arial Narrow", sans-serif`;
let textK = 1;
function say(g: G, s: string, x: number, y: number, px: number, fill: string, rot = 0) {
  if (textK <= 0) return;
  g.save(); g.globalAlpha *= textK; g.translate(x, y); g.rotate(rot); g.font = FONT(px); (g as unknown as { letterSpacing: string }).letterSpacing = `${Math.round(px / 8)}px`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = fill; g.fillText(s, 0, 0); g.restore();
}

/** Where the bodies of the last frame stood, so the tower's cab can fade off a fight beneath it. */
export const roofWatch: { bodies: readonly { x: number; y: number }[] } = { bodies: [] };

export function drawAirbaseRoof(g: G, r: MapRoof, alpha: number, info: GeoInfo): boolean {
  const twin = r.id.endsWith('~');
  const key = r.id.replace('~', '');
  const spec = ROOF[key];
  if (!spec) return false;
  const pts = [...r.points];
  const area = pts.reduce((s, p, i) => s + (p.x * pts[(i + 1) % pts.length]!.y - pts[(i + 1) % pts.length]!.x * p.y), 0);
  const ccw = area < 0 ? pts.reverse() : pts;
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const p of ccw) { x0 = Math.min(x0, p.x); y0 = Math.min(y0, p.y); x1 = Math.max(x1, p.x); y1 = Math.max(y1, p.y); }
  const w = x1 - x0, h = y1 - y0, cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
  const t = clock(info.now);
  // Lettering on a roof is for people outside: it is gone before the roof has faded to see through.
  textK = Math.max(0, Math.min(1, (alpha - 0.45) / 0.4));
  const top = twin && (key === 'hangar1' || key === 'bay1') ? mix(spec.top, 0, 0.0) : spec.top;
  const lip = key.startsWith('hangar') ? 16 : 10;
  // lip, top, ribs
  g.fillStyle = mix(top, 0, 0.45);
  for (let i = 0; i < ccw.length; i++) { const a = ccw[i]!, b = ccw[(i + 1) % ccw.length]!; if (b.x < a.x - 0.5) { g.beginPath(); g.moveTo(a.x, a.y); g.lineTo(b.x, b.y); g.lineTo(b.x, b.y + lip); g.lineTo(a.x, a.y + lip); g.closePath(); g.fill(); } }
  trace(g, ccw); g.fillStyle = top; g.fill();
  g.save(); trace(g, ccw); g.clip();
  const L = mix(top, 255, 0.2), S = mix(top, 0, 0.3);
  if (spec.kind === 'vault') {
    // barrel vault: long ribs and seams, a lit crown, skylight rows
    for (let x = x0; x < x1; x += 40) { g.fillStyle = (((x - x0) / 40) | 0) % 2 ? S : L; g.globalAlpha = alpha * 0.22; g.fillRect(x, y0, 20, h); }
    g.globalAlpha = alpha;
    g.fillStyle = 'rgba(255,255,255,0.1)'; g.fillRect(x0, cy - h * 0.12, w, h * 0.12); g.fillStyle = 'rgba(10,14,20,0.2)'; g.fillRect(x0, y1 - h * 0.28, w, h * 0.28);
    for (const fy of [y0 + h * 0.28, y0 + h * 0.7]) for (let sx = x0 + 120; sx < x1 - 200; sx += 380) {
      g.fillStyle = INK; g.fillRect(sx - 3, fy - 3, 226, 56);
      g.fillStyle = key === 'bay1' ? '#d9f0c4' : '#cfe3ff'; g.fillRect(sx, fy, 220, 50);
      g.fillStyle = 'rgba(255,255,255,0.5)'; g.fillRect(sx, fy, 220, 8);
      g.fillStyle = INK; for (let k = 55; k < 220; k += 55) g.fillRect(sx + k - 1.5, fy, 3, 50);
    }
    // the number, huge on the crown, and hazard chevrons along the south eave
    say(g, key === 'bay1' ? 'MAINTENANCE BAY' : twin ? 'HANGAR 2' : 'HANGAR 1', cx, cy + h * 0.02, key === 'bay1' ? 110 : 250, 'rgba(226,220,203,0.72)');
    say(g, key === 'bay1' ? (twin ? 'ENGINE SHOP' : 'JACKS UP') : 'KESTREL FIELD', cx, cy + h * (key === 'bay1' ? 0.17 : 0.15), key === 'bay1' ? 40 : 56, 'rgba(226,220,203,0.55)');
    g.fillStyle = '#b79a4a'; for (let x = x0; x < x1; x += 60) { g.beginPath(); g.moveTo(x, y1 - 14); g.lineTo(x + 20, y1 - 14); g.lineTo(x + 34, y1); g.lineTo(x + 14, y1); g.closePath(); g.fill(); }
  } else if (spec.kind === 'tar') {
    g.strokeStyle = S; g.lineWidth = 2; g.globalAlpha = alpha * 0.6;
    for (let y = y0 + 25; y < y1; y += 25) { g.beginPath(); g.moveTo(x0, y); g.lineTo(x1, y); g.stroke(); }
    g.globalAlpha = alpha; g.fillStyle = L; g.fillRect(x0, cy - 6, w, 12);
    g.fillStyle = 'rgba(10,12,16,0.28)'; g.fillRect(x0, cy + 6, w, h / 2 - 6);
    // vents, a stack, and the building's letter
    for (let vx = x0 + 120; vx < x1 - 60; vx += 240) { g.fillStyle = '#3d4450'; g.fillRect(vx, y0 + h * 0.22, 26, 26); g.strokeStyle = INK; g.lineWidth = 2; g.strokeRect(vx, y0 + h * 0.22, 26, 26); }
    say(g, key === 'barracksA' ? (twin ? 'OFFICERS' : 'A') : (twin ? 'ANNEX' : 'B'), cx, cy + h * 0.2, 90, 'rgba(226,220,203,0.4)');
    // a laundry line strung to the roof's lip and the pegged shirts blowing slowly
    const sway = calm ? 0 : Math.sin(t * 0.0013 + x0) * 3;
    g.strokeStyle = 'rgba(210,202,180,0.6)'; g.lineWidth = 1.5; g.beginPath(); g.moveTo(x0 + 80, y0 + 40); g.lineTo(x0 + 300, y0 + 44); g.stroke();
    for (let i = 0; i < 5; i++) { g.fillStyle = ['#e2dccb', '#6c7356', '#b4a07a', '#e2dccb', '#4f7fbf'][i]!; g.fillRect(x0 + 100 + i * 42 + sway * (i % 2 ? 1 : -1), y0 + 42, 22, 28); g.strokeStyle = INK; g.lineWidth = 1.4; g.strokeRect(x0 + 100 + i * 42 + sway * (i % 2 ? 1 : -1), y0 + 42, 22, 28); }
  } else if (spec.kind === 'mess') {
    g.strokeStyle = S; g.lineWidth = 2; g.globalAlpha = alpha * 0.5; for (let x = x0 + 30; x < x1; x += 30) { g.beginPath(); g.moveTo(x, y0); g.lineTo(x, y1); g.stroke(); }
    g.globalAlpha = alpha;
    // the extractor stack, steaming slowly
    const sx = x0 + w * 0.72, sy = y0 + h * 0.74;
    g.fillStyle = '#3d4450'; g.fillRect(sx - 30, sy - 30, 60, 60); g.strokeStyle = INK; g.lineWidth = 2; g.strokeRect(sx - 30, sy - 30, 60, 60);
    g.fillStyle = '#20252d'; g.beginPath(); g.arc(sx, sy, 18, 0, TAU); g.fill();
    say(g, 'MESS', cx, y0 + h * 0.3, 110, 'rgba(226,220,203,0.38)');
    for (let i = 0; i < 4; i++) { const u = calm ? i * 0.25 : ((t * 0.00025 + i * 0.25) % 1); g.fillStyle = `rgba(226,226,222,${(0.26 * (1 - u)).toFixed(3)})`; g.beginPath(); g.arc(sx + u * 26 + Math.sin(u * 5 + i) * 6, sy - u * 70, 12 + u * 22, 0, TAU); g.fill(); }
  } else if (spec.kind === 'shed') {
    g.fillStyle = L; g.fillRect(x0, y0, w, 6);
    // a dish on a mast, turning slowly, and the aircraft-warning lamp
    const a = calm ? 0.6 : t * 0.0004;
    g.save(); g.translate(cx, cy);
    g.fillStyle = 'rgba(10,12,18,0.3)'; g.beginPath(); g.ellipse(6, 8, 36, 22, a, 0, TAU); g.fill();
    g.fillStyle = '#c4cad2'; g.beginPath(); g.ellipse(0, 0, 36, 22 * Math.abs(Math.cos(a * 0.5)) + 8, a, 0, TAU); g.fill(); g.strokeStyle = INK; g.lineWidth = 2; g.stroke();
    g.fillStyle = '#2b2e34'; g.beginPath(); g.arc(0, 0, 6, 0, TAU); g.fill(); g.restore();
    const on = calm || Math.floor(t / 650) % 2 === 0;
    g.fillStyle = on ? '#ff4a40' : '#5a2420'; g.beginPath(); g.arc(x1 - 22, y0 + 22, 6, 0, TAU); g.fill(); g.strokeStyle = INK; g.lineWidth = 1.6; g.stroke();
    say(g, 'COMMS', cx, y1 - 36, 36, 'rgba(226,220,203,0.45)');
  } else if (spec.kind === 'plank') {
    g.strokeStyle = S; g.lineWidth = 2; for (let y = y0; y < y1; y += 18) { g.beginPath(); g.moveTo(x0, y); g.lineTo(x1, y); g.stroke(); }
    say(g, 'CRIB', cx, cy, 70, 'rgba(226,220,203,0.35)');
  } else if (spec.kind === 'flat') {
    g.strokeStyle = S; g.lineWidth = 2; g.globalAlpha = alpha * 0.6; g.strokeRect(x0 + 14, y0 + 14, w - 28, h - 28); g.globalAlpha = alpha;
    g.fillStyle = L; g.fillRect(x0, y0, w, 5);
    if (key === 'armoury') { g.fillStyle = '#a8552e'; g.fillRect(cx - 40, cy - 6, 80, 12); say(g, 'ARMS', cx, cy + 30, 34, 'rgba(226,220,203,0.5)'); }
    if (key === 'cage') say(g, 'PARTS', cx, cy, 52, 'rgba(226,220,203,0.35)');
    if (key === 'stairs') { g.fillStyle = '#3d4450'; g.fillRect(x0 + 20, y0 + 20, 36, 36); g.strokeStyle = INK; g.strokeRect(x0 + 20, y0 + 20, 36, 36); }
  }
  if (spec.kind === 'cab') drawCabBase(g, cx, cy, info);
  if (info.dark > 0) { g.fillStyle = `rgba(20,28,60,${0.5 * info.dark})`; g.fillRect(x0, y0, w, h); }
  g.restore();
  trace(g, ccw); g.strokeStyle = INK; g.lineWidth = 2; g.lineJoin = 'round'; g.stroke();
  if (spec.kind === 'cab') drawCab(g, alpha, info);
  return true;
}

/** The tower roof's own face: a deck with plant, a helipad-style ring and the stalk the cab stands on. */
function drawCabBase(g: G, cx: number, cy: number, info: GeoInfo) {
  void info;
  g.strokeStyle = 'rgba(30,34,40,0.4)'; g.lineWidth = 3;
  for (const r of [120, 220, 300]) { g.beginPath(); g.arc(cx, cy, r, 0, TAU); g.stroke(); }
  g.fillStyle = 'rgba(10,14,20,0.2)'; g.beginPath(); g.arc(cx + 70, cy + 80, 340, 0, TAU); g.arc(cx, cy, 340, 0, TAU, true); g.fill();
}

/** The glass cab on its stalk, raised up the screen; it thins out when anyone stands beneath it so no fight is hidden. */
function drawCab(g: G, alpha: number, info: GeoInfo) {
  const t = clock(info.now);
  const base = { x: TOWER.x, y: TOWER.y }, rise = 230, r = 190;
  const cab = { x: base.x, y: base.y - rise };
  const under = roofWatch.bodies.some((b) => Math.hypot(b.x - cab.x, (b.y - cab.y) * 1.1) < r + 30 || (Math.abs(b.x - cab.x) < 70 && b.y > cab.y && b.y < base.y + 40));
  g.save();
  g.globalAlpha = alpha * (under ? 0.35 : 1);
  // the stalk
  const stalk = [{ x: cab.x - 70, y: cab.y + 40 }, { x: cab.x + 70, y: cab.y + 40 }, { x: base.x + 90, y: base.y }, { x: base.x - 90, y: base.y }];
  g.fillStyle = '#7d848b'; trace(g, stalk); g.fill(); g.strokeStyle = INK; g.lineWidth = 2; g.stroke();
  g.fillStyle = 'rgba(10,12,16,0.25)'; trace(g, [stalk[1]!, { x: stalk[1]!.x + 8, y: stalk[1]!.y }, { x: stalk[2]!.x + 8, y: stalk[2]!.y }, stalk[2]!]); g.fill();
  // cab: an octagon, an overhanging roof and a glazing band that glows
  const oct = (rr: number, dy = 0) => Array.from({ length: 8 }, (_, i) => ({ x: cab.x + Math.cos(((i + 0.5) / 8) * TAU) * rr, y: cab.y + dy + Math.sin(((i + 0.5) / 8) * TAU) * rr * 0.9 }));
  const wallTop = oct(r * 0.78), wallBase = oct(r * 0.78, 52);
  g.fillStyle = '#2b3340'; trace(g, wallBase); g.fill();
  g.fillStyle = '#6a7380'; g.beginPath(); wallTop.forEach((p, i) => (i ? g.lineTo(p.x, p.y) : g.moveTo(p.x, p.y))); wallBase.slice().reverse().forEach((p) => g.lineTo(p.x, p.y)); g.closePath();
  // glazing, front four panels
  for (let i = 0; i < 8; i++) {
    const a = wallTop[i]!, b = wallTop[(i + 1) % 8]!, a2 = wallBase[i]!, b2 = wallBase[(i + 1) % 8]!;
    if ((a.y + b.y) / 2 < cab.y) continue;
    g.fillStyle = '#ffd68a'; g.beginPath(); g.moveTo(a.x, a.y + 10); g.lineTo(b.x, b.y + 10); g.lineTo(b2.x, b2.y - 8); g.lineTo(a2.x, a2.y - 8); g.closePath(); g.fill();
    g.strokeStyle = INK; g.lineWidth = 2; g.stroke();
    g.fillStyle = 'rgba(255,255,255,0.4)'; g.beginPath(); g.moveTo(a.x, a.y + 10); g.lineTo(b.x, b.y + 10); g.lineTo(b.x, b.y + 18); g.lineTo(a.x, a.y + 18); g.closePath(); g.fill();
  }
  // the coffee left on the console, steaming, seen through the glass
  g.fillStyle = '#e2dccb'; g.beginPath(); g.arc(cab.x + 40, cab.y + 56, 7, 0, TAU); g.fill(); g.strokeStyle = INK; g.lineWidth = 1.6; g.stroke();
  for (let i = 0; i < 3; i++) { const u = calm ? i / 3 : ((t * 0.0004 + i / 3) % 1); g.fillStyle = `rgba(240,240,236,${(0.4 * (1 - u)).toFixed(3)})`; g.beginPath(); g.arc(cab.x + 40 + Math.sin(u * 6) * 3, cab.y + 50 - u * 22, 3 + u * 5, 0, TAU); g.fill(); }
  // the overhanging roof, antennas, and the aircraft-warning lamp
  const roof = oct(r);
  g.fillStyle = 'rgba(10,12,18,0.28)'; trace(g, roof.map((p) => ({ x: p.x + 10, y: p.y + 40 }))); g.fill();
  trace(g, roof); g.fillStyle = '#b2b8be'; g.fill(); g.strokeStyle = INK; g.lineWidth = 2.4; g.stroke();
  g.fillStyle = 'rgba(255,255,255,0.3)'; g.beginPath(); g.arc(cab.x - 40, cab.y - 20, r * 0.5, Math.PI * 0.9, Math.PI * 1.7); g.lineTo(cab.x - 40, cab.y - 20); g.fill();
  g.strokeStyle = '#3d4450'; g.lineWidth = 3; for (const [dx, dy] of [[-60, -40], [70, -20], [10, 30]] as const) { g.beginPath(); g.moveTo(cab.x + dx, cab.y + dy); g.lineTo(cab.x + dx + 6, cab.y + dy - 46); g.stroke(); }
  const on = calm || Math.floor(t / 600) % 2 === 0;
  g.fillStyle = on ? '#ff4a40' : '#5a2420'; g.beginPath(); g.arc(cab.x + 76, cab.y - 66, 6, 0, TAU); g.fill(); g.strokeStyle = INK; g.lineWidth = 1.6; g.stroke();
  g.restore();
  void SIZE;
}
