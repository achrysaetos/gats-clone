/**
 * Roof surfaces for `MapRoof.material` (docs/maps/GEOMETRY.md): slate, vault steel, clay tile, corrugated sheet, tar and gravel, wood
 * shingle, standing-seam metal. A roof is drawn above the players, so it reads as the building's real roof from outside and fades to a
 * ghost while you are under it (the caller has already set globalAlpha). Used by the themes' `roof` hooks and by the generic fallback.
 */
import type { MapRoof, Pt } from '../shared/geom.ts';
import { boundsOf, noise, outline, type G } from './themes/geokit.ts';
import { drawExtruded, type GeoInfo, type PolyLook } from './geoart.ts';
import { INK } from './palette.ts';

type Box = { x: number; y: number; w: number; h: number };
type Roofing = { top: string; lit: string; shade: string; front: string; face: number; paint: (g: G, b: Box, seed: number, long: boolean) => void };

const rows = (g: G, b: Box, step: number, color: string, w = 2) => {
  g.strokeStyle = color; g.lineWidth = w; g.beginPath();
  for (let y = Math.ceil(b.y / step) * step; y < b.y + b.h; y += step) { g.moveTo(b.x, y); g.lineTo(b.x + b.w, y); }
  g.stroke();
};
const cols = (g: G, b: Box, step: number, color: string, w = 2) => {
  g.strokeStyle = color; g.lineWidth = w; g.beginPath();
  for (let x = Math.ceil(b.x / step) * step; x < b.x + b.w; x += step) { g.moveTo(x, b.y); g.lineTo(x, b.y + b.h); }
  g.stroke();
};
const dots = (g: G, pts: [number, number][], r: number, color: string) => { g.fillStyle = color; for (const [x, y] of pts) { g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill(); } };

/** A skylight: a pane with a frame and a pale glint, set into the roof. */
function skylight(g: G, x: number, y: number, w: number, h: number) {
  g.fillStyle = '#26394a'; g.fillRect(x, y, w, h);
  g.fillStyle = 'rgba(150, 205, 225, 0.8)'; g.fillRect(x + 4, y + 4, w - 8, h - 8);
  g.fillStyle = 'rgba(255, 255, 255, 0.35)'; g.beginPath(); g.moveTo(x + 6, y + h - 6); g.lineTo(x + w * 0.4, y + 6); g.lineTo(x + w * 0.55, y + 6); g.lineTo(x + 20, y + h - 6); g.closePath(); g.fill();
  g.strokeStyle = '#6b7480'; g.lineWidth = 3; g.strokeRect(x + 1.5, y + 1.5, w - 3, h - 3);
  g.lineWidth = 2; g.beginPath(); g.moveTo(x + w / 2, y); g.lineTo(x + w / 2, y + h); g.stroke();
  g.strokeStyle = INK; g.lineWidth = 2; g.strokeRect(x, y, w, h);
}

const ROOFINGS: Record<string, Roofing> = {
  // Slate tiles in staggered courses, a copper ridge down the long axis and skylights along it.
  slate: {
    top: '#4f5866', lit: '#6f7a8a', shade: '#343b46', front: '#2c323c', face: 12,
    paint(g, b, seed, long) {
      rows(g, b, 24, 'rgba(18, 22, 30, 0.5)');
      for (let y = Math.ceil(b.y / 24) * 24, k = 0; y < b.y + b.h; y += 24, k++) { g.strokeStyle = 'rgba(18, 22, 30, 0.35)'; g.lineWidth = 1.5; g.beginPath(); for (let x = b.x + (k % 2) * 20; x < b.x + b.w; x += 40) { g.moveTo(x, y); g.lineTo(x, y + 24); } g.stroke(); }
      for (let i = 0; i < b.w * b.h / 9000; i++) { g.fillStyle = noise(seed, i) > 0.5 ? 'rgba(130, 145, 165, 0.22)' : 'rgba(10, 14, 20, 0.2)'; g.fillRect(b.x + noise(seed, i, 1) * b.w, b.y + noise(seed, i, 2) * b.h, 36, 22); }
      const mid = long ? b.y + b.h / 2 : b.x + b.w / 2;
      g.fillStyle = '#b87a4a';
      if (long) { g.fillRect(b.x, mid - 7, b.w, 14); g.fillStyle = '#7fb9a0'; for (let x = b.x + 30; x < b.x + b.w; x += 90) g.fillRect(x, mid - 7, 20 + noise(seed, x) * 30, 14); } else { g.fillRect(mid - 7, b.y, 14, b.h); g.fillStyle = '#7fb9a0'; for (let y = b.y + 30; y < b.y + b.h; y += 90) g.fillRect(mid - 7, y, 14, 20 + noise(seed, y) * 30); }
      g.strokeStyle = INK; g.lineWidth = 1.5;
      if (long) {
        g.strokeRect(b.x, mid - 7, b.w, 14);
        for (let x = b.x + 150, k = 0; x < b.x + b.w - 150; x += 300, k++) skylight(g, x, k % 2 ? mid - 110 : mid + 24, 120, 86);
      } else {
        g.strokeRect(mid - 7, b.y, 14, b.h);
        for (let y = b.y + 150, k = 0; y < b.y + b.h - 150; y += 300, k++) skylight(g, k % 2 ? mid - 140 : mid + 24, y, 120, 86);
      }
    },
  },
  // Welded steel plate with a hatch, vents and a rivet line.
  vault: {
    top: '#7d8794', lit: '#a2acba', shade: '#555e6a', front: '#3c434d', face: 12,
    paint(g, b, seed) {
      rows(g, b, 60, 'rgba(20, 26, 34, 0.55)', 3); cols(g, b, 100, 'rgba(20, 26, 34, 0.4)', 2);
      for (let y = Math.ceil(b.y / 60) * 60; y < b.y + b.h; y += 60) dots(g, Array.from({ length: Math.floor(b.w / 25) }, (_, i) => [b.x + 14 + i * 25, y + 8] as [number, number]), 1.8, 'rgba(210, 218, 228, 0.55)');
      const cx = b.x + b.w * 0.5, cy = b.y + b.h * 0.5;
      g.fillStyle = '#5b6470'; g.fillRect(cx - 50, cy - 50, 100, 100); g.strokeStyle = INK; g.lineWidth = 2.5; g.strokeRect(cx - 50, cy - 50, 100, 100);
      g.fillStyle = '#b38b3c'; g.beginPath(); g.arc(cx, cy, 20, 0, Math.PI * 2); g.fill(); g.stroke();
      g.strokeStyle = INK; g.lineWidth = 3; g.beginPath(); g.moveTo(cx - 14, cy); g.lineTo(cx + 14, cy); g.moveTo(cx, cy - 14); g.lineTo(cx, cy + 14); g.stroke();
      for (const [vx, vy] of [[b.x + 30, b.y + 30], [b.x + b.w - 80, b.y + b.h - 70]] as const) { g.fillStyle = '#3f4650'; g.fillRect(vx, vy, 50, 38); g.strokeStyle = INK; g.lineWidth = 2; g.strokeRect(vx, vy, 50, 38); g.strokeStyle = 'rgba(200,210,220,0.5)'; g.beginPath(); for (let k = 8; k < 38; k += 8) { g.moveTo(vx + 5, vy + k); g.lineTo(vx + 45, vy + k); } g.stroke(); }
      void seed;
    },
  },
  // Clay pantiles in half-round courses.
  tile: {
    top: '#a4553a', lit: '#c46f4c', shade: '#76392a', front: '#4f261c', face: 12,
    paint(g, b, seed) {
      cols(g, b, 22, 'rgba(60, 22, 14, 0.5)', 2.5); cols(g, { ...b, x: b.x + 11 }, 22, 'rgba(255, 200, 160, 0.16)', 3);
      rows(g, b, 44, 'rgba(60, 22, 14, 0.35)', 2);
      for (let i = 0; i < b.w * b.h / 8000; i++) { g.fillStyle = noise(seed, i) > 0.5 ? 'rgba(210, 120, 80, 0.22)' : 'rgba(40, 14, 10, 0.2)'; g.fillRect(b.x + noise(seed, i, 1) * b.w, b.y + noise(seed, i, 2) * b.h, 24, 30); }
      g.fillStyle = '#7e3a28'; g.fillRect(b.x, b.y + b.h / 2 - 5, b.w, 10); g.strokeStyle = INK; g.lineWidth = 1.5; g.strokeRect(b.x, b.y + b.h / 2 - 5, b.w, 10);
    },
  },
  // Corrugated sheet: long ribs, overlapping panels, rust bleeding from the fixings.
  corrugated: {
    top: '#8d949b', lit: '#b3bac1', shade: '#5f666d', front: '#3d434a', face: 12,
    paint(g, b, seed) {
      for (let x = Math.ceil(b.x / 16) * 16, k = 0; x < b.x + b.w; x += 16, k++) { g.fillStyle = k % 2 ? 'rgba(255,255,255,0.18)' : 'rgba(10,14,20,0.2)'; g.fillRect(x, b.y, 8, b.h); }
      rows(g, b, 140, 'rgba(10, 14, 20, 0.45)', 3);
      for (let y = Math.ceil(b.y / 140) * 140; y < b.y + b.h; y += 140) dots(g, Array.from({ length: Math.floor(b.w / 48) }, (_, i) => [b.x + 10 + i * 48, y + 9] as [number, number]), 2, 'rgba(60, 40, 30, 0.7)');
      for (let i = 0; i < b.w * b.h / 12000; i++) { g.fillStyle = 'rgba(168, 85, 46, 0.3)'; g.fillRect(b.x + noise(seed, i, 3) * b.w, b.y + noise(seed, i, 4) * b.h, 10 + noise(seed, i) * 24, 30 + noise(seed, i, 5) * 60); }
    },
  },
  // Tar and gravel flat roof with a parapet lip.
  tar: {
    top: '#55575c', lit: '#767a82', shade: '#37393e', front: '#2a2c30', face: 10,
    paint(g, b, seed) {
      for (let i = 0; i < b.w * b.h / 500; i++) { g.fillStyle = noise(seed, i) > 0.5 ? 'rgba(170,170,165,0.2)' : 'rgba(10,10,12,0.25)'; g.fillRect(b.x + noise(seed, i, 1) * b.w, b.y + noise(seed, i, 2) * b.h, 3, 3); }
      g.strokeStyle = 'rgba(190, 190, 185, 0.45)'; g.lineWidth = 6; g.strokeRect(b.x + 8, b.y + 8, b.w - 16, b.h - 16);
      g.fillStyle = '#7a7d84'; g.fillRect(b.x + b.w - 90, b.y + 24, 56, 44); g.strokeStyle = INK; g.lineWidth = 2; g.strokeRect(b.x + b.w - 90, b.y + 24, 56, 44);
      g.fillStyle = '#4a4d54'; g.beginPath(); g.arc(b.x + b.w - 62, b.y + 46, 14, 0, Math.PI * 2); g.fill(); g.stroke();
    },
  },
  // Wood shingles in shaved courses, a ridge cap.
  shingle: {
    top: '#85623f', lit: '#a58059', shade: '#5c4129', front: '#3a2918', face: 12,
    paint(g, b, seed, long) {
      rows(g, b, 16, 'rgba(30, 18, 8, 0.5)', 2);
      for (let y = Math.ceil(b.y / 16) * 16, k = 0; y < b.y + b.h; y += 16, k++) { g.strokeStyle = 'rgba(30, 18, 8, 0.35)'; g.lineWidth = 1.5; g.beginPath(); for (let x = b.x + ((k * 7) % 14); x < b.x + b.w; x += 14 + noise(seed, k, x) * 4) { g.moveTo(x, y); g.lineTo(x, y + 16); } g.stroke(); }
      for (let i = 0; i < b.w * b.h / 3000; i++) { g.fillStyle = noise(seed, i) > 0.5 ? 'rgba(210, 170, 110, 0.18)' : 'rgba(20, 10, 4, 0.2)'; g.fillRect(b.x + noise(seed, i, 1) * b.w, b.y + noise(seed, i, 2) * b.h, 14, 16); }
      g.fillStyle = '#6a4a2c'; if (long) g.fillRect(b.x, b.y + b.h / 2 - 5, b.w, 10); else g.fillRect(b.x + b.w / 2 - 5, b.y, 10, b.h);
      g.strokeStyle = INK; g.lineWidth = 1.5; if (long) g.strokeRect(b.x, b.y + b.h / 2 - 5, b.w, 10); else g.strokeRect(b.x + b.w / 2 - 5, b.y, 10, b.h);
    },
  },
  // Verdigris copper: seams radiating from the middle to a brass finial (an octagonal roof reads as a cone).
  copper: {
    top: '#4f8f80', lit: '#7fc0aa', shade: '#2f5f56', front: '#244a43', face: 12,
    paint(g, b, seed) {
      const cx = b.x + b.w / 2, cy = b.y + b.h / 2;
      g.strokeStyle = 'rgba(14, 40, 36, 0.55)'; g.lineWidth = 2.5; g.beginPath();
      for (let k = 0; k < 16; k++) { const a = (k / 16) * Math.PI * 2; g.moveTo(cx, cy); g.lineTo(cx + Math.cos(a) * b.w, cy + Math.sin(a) * b.h); }
      g.stroke();
      g.strokeStyle = 'rgba(170, 225, 205, 0.25)'; g.lineWidth = 3; g.beginPath();
      for (let k = 0; k < 16; k++) { const a = ((k + 0.5) / 16) * Math.PI * 2; g.moveTo(cx, cy); g.lineTo(cx + Math.cos(a) * b.w, cy + Math.sin(a) * b.h); }
      g.stroke();
      for (let i = 0; i < 18; i++) { g.fillStyle = 'rgba(190, 235, 215, 0.18)'; g.fillRect(b.x + noise(seed, i) * b.w, b.y + noise(seed, i, 1) * b.h, 22, 14); }
      g.fillStyle = '#c9a24a'; g.beginPath(); g.arc(cx, cy, 11, 0, Math.PI * 2); g.fill(); g.strokeStyle = INK; g.lineWidth = 2; g.stroke();
      g.fillStyle = 'rgba(255,255,255,0.6)'; g.beginPath(); g.arc(cx - 3, cy - 3, 3, 0, Math.PI * 2); g.fill();
    },
  },
  // Standing-seam metal panels with a roof hatch and vents.
  metal: {
    top: '#6d7883', lit: '#96a3af', shade: '#47515b', front: '#333b44', face: 12,
    paint(g, b, seed) {
      cols(g, b, 36, 'rgba(14, 20, 28, 0.5)', 3); cols(g, { ...b, x: b.x + 3 }, 36, 'rgba(255,255,255,0.22)', 2);
      rows(g, b, 180, 'rgba(14, 20, 28, 0.35)', 2);
      const hx = b.x + b.w * (0.3 + 0.4 * noise(seed, 1)), hy = b.y + b.h * (0.3 + 0.3 * noise(seed, 2));
      g.fillStyle = '#556069'; g.beginPath(); g.arc(hx, hy, 34, 0, Math.PI * 2); g.fill(); g.strokeStyle = INK; g.lineWidth = 2.5; g.stroke();
      g.strokeStyle = '#a8552e'; g.lineWidth = 5; g.beginPath(); g.arc(hx, hy, 18, 0, Math.PI * 2); g.stroke(); g.beginPath(); g.moveTo(hx - 18, hy); g.lineTo(hx + 18, hy); g.moveTo(hx, hy - 18); g.lineTo(hx, hy + 18); g.stroke();
      for (const [vx, vy] of [[b.x + 24, b.y + 20], [b.x + b.w - 70, b.y + b.h - 56]] as const) { g.fillStyle = '#414a53'; g.fillRect(vx, vy, 46, 34); g.strokeStyle = INK; g.lineWidth = 2; g.strokeRect(vx, vy, 46, 34); g.strokeStyle = 'rgba(200,210,220,0.45)'; g.beginPath(); for (let k = 7; k < 34; k += 7) { g.moveTo(vx + 4, vy + k); g.lineTo(vx + 42, vy + k); } g.stroke(); }
    },
  },
};


const seedOf = (id: string) => [...id].reduce((s, c) => (s * 31 + c.charCodeAt(0)) | 0, 7) & 0xffff;

/** Paints `roof` in its material (or `fallback`); `info.dark` shades it at night. Returns false for a material this file does not know. */
export function paintRoofMaterial(g: G, roof: MapRoof, info: GeoInfo, fallback?: string): boolean {
  const spec = ROOFINGS[roof.material ?? fallback ?? ''];
  if (!spec) return false;
  const pts = [...roof.points] as Pt[];
  const look: PolyLook = { top: spec.top, front: spec.front, lit: spec.lit, shade: spec.shade };
  drawExtruded(g, pts, spec.face, look);
  const b = boundsOf(pts);
  g.save();
  g.beginPath();
  pts.forEach((p, i) => (i ? g.lineTo(p.x, p.y) : g.moveTo(p.x, p.y)));
  g.closePath();
  g.clip();
  spec.paint(g, b, seedOf(roof.id), b.w >= b.h);
  // The lit edge and the shade edge, as every solid has them.
  g.lineWidth = 8;
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i]!, q = pts[(i + 1) % pts.length]!;
    const len = Math.hypot(q.x - p.x, q.y - p.y);
    if (len < 1) continue;
    const area = pts.reduce((s, a, k) => s + (a.x * pts[(k + 1) % pts.length]!.y - pts[(k + 1) % pts.length]!.x * a.y), 0);
    const facing = (((q.y - p.y) * 0.62 - (q.x - p.x) * 0.78) / len) * (area < 0 ? -1 : 1);
    if (Math.abs(facing) < 0.35) continue;
    g.strokeStyle = facing < 0 ? spec.lit : spec.shade;
    g.globalAlpha *= 0.85;
    g.beginPath(); g.moveTo(p.x, p.y); g.lineTo(q.x, q.y); g.stroke();
    g.globalAlpha /= 0.85;
  }
  if (info.dark > 0) { g.fillStyle = `rgba(20, 28, 60, ${0.5 * info.dark})`; g.fillRect(b.x, b.y, b.w, b.h); }
  g.restore();
  outline(g, pts, 2.5);
  return true;
}
