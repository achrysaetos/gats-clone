import { INK } from '../palette.ts';
import type { Solid, SolidKind } from '../tilt.ts';
import { C, TAU, districtAt, ell, hash, hexA, rr, shade, type G } from './summitkit.ts';

/**
 * Summit's grid walls, each painted whole once per solid into the sprite cache. A wall changes its dress with the district it
 * stands in (the half-turn twins share their shape, never their look): a log lodge and a stone-and-cedar spa, a tin garage
 * and a glass terminal, a red lift shed and an ice pavilion, a hunter's cabin and a sawmill. Snow lies on every top face.
 */
const BEVEL = 4;

function shell(g: G, s: Solid, top: string, front: string, face: number, paintFront: () => void, paintTop: () => void) {
  const { x, y, w, h } = s, e = BEVEL;
  g.lineJoin = 'miter';
  g.fillStyle = front; g.fillRect(x, y + h, w, face);
  paintFront();
  g.fillStyle = 'rgba(255, 255, 255, 0.12)'; g.fillRect(x, y + h, w, 2);
  g.fillStyle = 'rgba(10, 12, 24, 0.34)'; g.fillRect(x, y + h + face - 4, w, 4);
  g.strokeStyle = INK; g.lineWidth = 2; g.strokeRect(x, y + h, w, face);
  g.fillStyle = top; g.fillRect(x, y, w, h);
  paintTop();
  g.fillStyle = 'rgba(255, 255, 255, 0.22)';
  g.beginPath(); g.moveTo(x, y); g.lineTo(x + w, y); g.lineTo(x + w - e, y + e); g.lineTo(x + e, y + e); g.lineTo(x + e, y + h - e); g.lineTo(x, y + h); g.closePath(); g.fill();
  g.fillStyle = 'rgba(10, 12, 24, 0.3)';
  g.beginPath(); g.moveTo(x + w, y); g.lineTo(x + w, y + h); g.lineTo(x, y + h); g.lineTo(x + e, y + h - e); g.lineTo(x + w - e, y + h - e); g.lineTo(x + w - e, y + e); g.closePath(); g.fill();
  g.strokeStyle = INK; g.lineWidth = 2; g.strokeRect(x, y, w, h);
}

/** Snow lying on a top face: a lumpy cap that leaves a rim of the wall's own material showing. */
function snowCap(g: G, s: Solid, inset = 6, a = 0.92) {
  const { x, y, w, h } = s;
  g.fillStyle = hexA(C.snowCap, a);
  g.beginPath();
  const n = Math.max(2, Math.round(Math.max(w, h) / 34));
  const horiz = w >= h;
  const x0 = x + inset, y0 = y + inset, x1 = x + w - inset, y1 = y + h - inset;
  g.moveTo(x0, y0 + 3);
  for (let i = 1; i <= n; i++) { const t = i / n; const lump = hash(x, y, i) * 4; if (horiz) g.quadraticCurveTo(x0 + (x1 - x0) * (t - 0.5 / n), y0 - lump, x0 + (x1 - x0) * t, y0 + 2); else g.lineTo(x1, y0 + (y1 - y0) * t); }
  g.lineTo(x1, y1 - 2);
  for (let i = n; i >= 1; i--) { const t = (i - 1) / n; const lump = hash(y, x, i) * 4; if (horiz) g.quadraticCurveTo(x0 + (x1 - x0) * (t + 0.5 / n), y1 + lump, x0 + (x1 - x0) * t, y1 - 2); else g.lineTo(x0, y0 + (y1 - y0) * t); }
  g.closePath(); g.fill();
  g.fillStyle = 'rgba(255, 255, 255, 0.28)'; g.fillRect(x0 + 2, y0 + 1, Math.max(0, x1 - x0 - 4), 2);
  g.fillStyle = 'rgba(40, 56, 90, 0.22)'; g.fillRect(x0 + 2, y1 - 3, Math.max(0, x1 - x0 - 4), 2);
}

/** Window spots on a wall's south face: amber panes with mullions and snow on the sill. */
export function windowSpots(s: { x: number; y: number; w: number; h: number }): number[] {
  const out: number[] = [];
  if (s.w < 150 || s.h > 60) return out;
  for (let x = s.x + 40 + (hash(s.x, s.y) * 40 | 0); x < s.x + s.w - 70; x += 120) out.push(x);
  return out;
}

function windowPane(g: G, x: number, y: number, w: number, h: number, lit: boolean, tint: string) {
  g.fillStyle = INK; g.fillRect(x - 2, y - 2, w + 4, h + 4);
  g.fillStyle = lit ? tint : '#2a3444'; g.fillRect(x, y, w, h);
  if (lit) { g.fillStyle = 'rgba(255, 244, 210, 0.5)'; g.fillRect(x, y, w, 3); g.fillStyle = 'rgba(180, 90, 40, 0.35)'; g.fillRect(x, y + h - 4, w, 4); }
  g.fillStyle = INK; g.fillRect(x + w / 2 - 1, y, 2, h); g.fillRect(x, y + h / 2 - 1, w, 2);
  g.fillStyle = hexA(C.snowCap, 0.95); g.fillRect(x - 3, y + h + 1, w + 6, 4);
}

/* -- timber ------------------------------------------------------------------------------------------------------------ */

function logs(g: G, s: Solid, face: number, base: string, hi: string, lo: string) {
  g.fillStyle = base; g.fillRect(s.x, s.y + s.h, s.w, face);
  for (let yy = 0; yy < face; yy += 6) {
    g.fillStyle = hash(s.x, s.y, yy) > 0.5 ? hi : base; g.fillRect(s.x, s.y + s.h + yy, s.w, 4);
    g.fillStyle = lo; g.fillRect(s.x, s.y + s.h + yy + 4, s.w, 2);
  }
  g.fillStyle = C.chink; g.globalAlpha = 0.35; for (let yy = 4; yy < face; yy += 6) g.fillRect(s.x, s.y + s.h + yy, s.w, 1); g.globalAlpha = 1;
  g.fillStyle = C.logEnd;
  for (let yy = 0; yy < face; yy += 6) { g.fillRect(s.x, s.y + s.h + yy, 4, 4); g.fillRect(s.x + s.w - 4, s.y + s.h + yy, 4, 4); }
}

function paintTimber(g: G, s: Solid) {
  const d = districtAt(s.x + s.w / 2, s.y + s.h / 2).id;
  const face = 18;
  if (d === 'garage' || d === 'zam') {
    // Corrugated tin, rust at the foot, a hazard flash on the corner post.
    shell(g, s, '#9aa6b2', C.tinLo, face, () => {
      g.fillStyle = C.tin; g.fillRect(s.x, s.y + s.h, s.w, face);
      for (let xx = s.x; xx < s.x + s.w; xx += 8) { g.fillStyle = C.tinHi; g.fillRect(xx, s.y + s.h + 1, 3, face - 1); g.fillStyle = C.tinLo; g.fillRect(xx + 4, s.y + s.h + 1, 2, face - 1); }
      g.fillStyle = 'rgba(138, 80, 48, 0.4)'; g.fillRect(s.x, s.y + s.h + face - 6, s.w, 6);
      if (s.w > 120) { windowPane(g, s.x + 30, s.y + s.h + 3, 36, 8, true, '#ffcf7a'); }
    }, () => snowCap(g, s));
  } else if (d === 'terminal') {
    shell(g, s, '#aab8c4', '#3a4a5a', face, () => {
      g.fillStyle = '#2f3f50'; g.fillRect(s.x, s.y + s.h, s.w, face);
      for (let xx = s.x + 4; xx < s.x + s.w - 6; xx += 30) { g.fillStyle = 'rgba(150, 205, 230, 0.8)'; g.fillRect(xx, s.y + s.h + 3, 24, face - 6); g.fillStyle = 'rgba(235, 248, 255, 0.4)'; g.fillRect(xx, s.y + s.h + 3, 24, 4); g.strokeStyle = INK; g.lineWidth = 1.5; g.strokeRect(xx, s.y + s.h + 3, 24, face - 6); }
    }, () => snowCap(g, s, 8, 0.85));
  } else if (d === 'iceg') {
    shell(g, s, '#9ccfe2', '#4d8aa4', face, () => {
      g.fillStyle = '#5a98b2'; g.fillRect(s.x, s.y + s.h, s.w, face);
      for (let xx = s.x; xx < s.x + s.w; xx += 40) { g.strokeStyle = 'rgba(210, 242, 252, 0.7)'; g.lineWidth = 2; g.strokeRect(xx + 1, s.y + s.h + 1, 38, face - 2); g.fillStyle = 'rgba(255, 255, 255, 0.28)'; g.beginPath(); g.moveTo(xx + 4, s.y + s.h + 4); g.lineTo(xx + 20, s.y + s.h + 4); g.lineTo(xx + 4, s.y + s.h + 14); g.closePath(); g.fill(); }
    }, () => { g.fillStyle = 'rgba(220, 245, 252, 0.45)'; g.fillRect(s.x + 3, s.y + 3, s.w - 6, s.h - 6); });
  } else if (d === 'lift') {
    shell(g, s, '#8a4a3a', '#6a2e22', face, () => {
      g.fillStyle = C.red; g.fillRect(s.x, s.y + s.h, s.w, face);
      for (let xx = s.x; xx < s.x + s.w; xx += 14) { g.fillStyle = C.redLo; g.fillRect(xx, s.y + s.h, 2, face); }
      g.fillStyle = C.redHi; g.fillRect(s.x, s.y + s.h + 2, s.w, 2);
      if (s.w >= 170) { g.fillStyle = '#e2dccb'; g.font = '700 11px "Barlow Condensed", sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('SUMMIT EXPRESS', s.x + s.w / 2, s.y + s.h + face / 2 + 1); }
    }, () => snowCap(g, s));
  } else if (d === 'spa') {
    shell(g, s, '#b0a07c', '#7a6a4a', face, () => {
      g.fillStyle = '#6a645a'; g.fillRect(s.x, s.y + s.h, s.w, 8);
      for (let xx = s.x; xx < s.x + s.w; xx += 22) { g.strokeStyle = 'rgba(20, 24, 34, 0.5)'; g.lineWidth = 1.4; g.strokeRect(xx + 0.5, s.y + s.h + 0.5, 21, 8); }
      for (let xx = s.x; xx < s.x + s.w; xx += 9) { g.fillStyle = (xx / 9) & 1 ? '#a8845a' : '#9a7a52'; g.fillRect(xx, s.y + s.h + 8, 8, face - 8); }
      for (const wx of windowSpots(s)) windowPane(g, wx, s.y + s.h + 9, 30, 8, true, '#a8f0e0');
    }, () => snowCap(g, s));
  } else if (d === 'farm' || d === 'hut') {
    shell(g, s, '#8a7a5a', '#5a4a32', face, () => {
      g.fillStyle = '#7a6a4a'; g.fillRect(s.x, s.y + s.h, s.w, face);
      for (let xx = s.x; xx < s.x + s.w; xx += 12) { g.fillStyle = (xx / 12) & 1 ? '#6a5a3c' : '#8a7a56'; g.fillRect(xx, s.y + s.h, 11, face); }
      g.fillStyle = 'rgba(30, 22, 10, 0.4)'; g.fillRect(s.x, s.y + s.h + face - 5, s.w, 5);
    }, () => snowCap(g, s));
  } else {
    // The lodge, the cabin and everything else of logs: round logs with notched ends, lit windows, snow on top.
    const rough = d === 'woods';
    shell(g, s, '#8a6a44', '#5a3e24', face, () => {
      logs(g, s, face, rough ? '#6a4a2c' : C.log, rough ? '#7a5a38' : C.logHi, C.logLo);
      for (const wx of windowSpots(s)) { windowPane(g, wx, s.y + s.h + 3, 30, 10, true, C.window); g.fillStyle = C.logLo; g.fillRect(wx - 6, s.y + s.h + 2, 4, 14); g.fillRect(wx + 32, s.y + s.h + 2, 4, 14); }
      if (rough && s.w >= 100) { g.fillStyle = '#3a2a1a'; g.fillRect(s.x + s.w - 24, s.y + s.h + 3, 6, 12); }
    }, () => snowCap(g, s));
  }
}

/* -- hearth ------------------------------------------------------------------------------------------------------------ */

function paintHearth(g: G, s: Solid) {
  const d = districtAt(s.x + s.w / 2, s.y + s.h / 2).id;
  const big = s.w * s.h > 5000, face = 16;
  shell(g, s, '#8a8474', C.stoneLo, face, () => {
    g.fillStyle = C.stone; g.fillRect(s.x, s.y + s.h, s.w, face);
    for (let yy = 0; yy < face; yy += 8) for (let xx = (yy / 8) % 2 ? -10 : 0; xx < s.w; xx += 20) { g.strokeStyle = 'rgba(20, 18, 14, 0.6)'; g.lineWidth = 1.5; g.strokeRect(s.x + xx + 0.5, s.y + s.h + yy + 0.5, 20, 8); }
    if (big) {
      // The fire in its arch, logs on the irons.
      const cx = s.x + s.w / 2;
      g.fillStyle = INK; g.beginPath(); g.moveTo(cx - 24, s.y + s.h + face); g.lineTo(cx - 24, s.y + s.h + 6); g.quadraticCurveTo(cx, s.y + s.h - 2, cx + 24, s.y + s.h + 6); g.lineTo(cx + 24, s.y + s.h + face); g.closePath(); g.fill();
      if (d === 'lodge') {
        const gr = g.createRadialGradient(cx, s.y + s.h + 12, 2, cx, s.y + s.h + 12, 22); gr.addColorStop(0, '#fff0b0'); gr.addColorStop(0.5, '#ff9a3c'); gr.addColorStop(1, 'rgba(217, 84, 31, 0)');
        g.fillStyle = gr; g.fillRect(cx - 24, s.y + s.h + 2, 48, face);
        g.fillStyle = '#4a2e18'; g.fillRect(cx - 18, s.y + s.h + face - 6, 36, 5);
      } else { g.fillStyle = '#6a3a24'; for (let i = 0; i < 6; i++) { ell(g, cx - 14 + i * 6, s.y + s.h + face - 6, 5, 4); g.fill(); } }
    }
  }, () => {
    g.fillStyle = hexA(C.snowCap, 0.5); g.fillRect(s.x + 3, s.y + 3, s.w - 6, 5);
    g.fillStyle = '#26221e'; const f = Math.min(24, s.w * 0.5); rr(g, s.x + s.w / 2 - f / 2, s.y + s.h / 2 - f / 2, f, f, 3); g.fill(); g.strokeStyle = INK; g.lineWidth = 2; g.stroke();
    if (d === 'lodge' && big) { g.fillStyle = 'rgba(255, 150, 60, 0.4)'; rr(g, s.x + s.w / 2 - 8, s.y + s.h / 2 - 8, 16, 16, 3); g.fill(); }
  });
}

/* -- counters, benches, beds, racks ------------------------------------------------------------------------------------------ */

function paintBartop(g: G, s: Solid) {
  const d = districtAt(s.x + s.w / 2, s.y + s.h / 2).id;
  const long = Math.max(s.w, s.h), thin = Math.min(s.w, s.h), face = 14;
  const felt = s.w === 100 && s.h === 100 && d === 'lodge';
  const bunk = d === 'woods' && thin <= 50 && long >= 150;
  const base = d === 'spa' ? '#a8845a' : '#8a5a34';
  shell(g, s, felt ? '#2f6a48' : bunk ? '#8a2e3c' : base, d === 'spa' ? '#6a4c2c' : '#55371f', face, () => {
    g.fillStyle = d === 'spa' ? '#8a6a44' : '#6a4426'; g.fillRect(s.x, s.y + s.h, s.w, face);
    if (long > 200 && s.w > s.h) for (let xx = s.x + 8; xx < s.x + s.w - 14; xx += 30) { g.strokeStyle = 'rgba(20, 10, 4, 0.55)'; g.lineWidth = 1.6; g.strokeRect(xx, s.y + s.h + 3, 24, face - 6); }
    g.fillStyle = C.brassHi; g.fillRect(s.x, s.y + s.h, s.w, 2);
  }, () => {
    if (felt) { g.strokeStyle = '#3a2412'; g.lineWidth = 6; g.strokeRect(s.x + 3, s.y + 3, s.w - 6, s.h - 6); ell(g, s.x + 30, s.y + 34, 6, 6); g.fillStyle = '#e8e0d0'; g.fill(); ell(g, s.x + 62, s.y + 60, 6, 6); g.fillStyle = '#a8402e'; g.fill(); return; }
    if (bunk) { g.fillStyle = '#e8e0d0'; g.fillRect(s.x + 4, s.y + 4, 18, 18); g.fillStyle = shade('#8a2e3c', 0.25); g.fillRect(s.x + 4, s.y + 24, s.w - 8, s.h - 28); return; }
    g.fillStyle = 'rgba(255, 244, 220, 0.18)'; g.fillRect(s.x + 3, s.y + 3, s.w - 6, 3);
    // Bottles and glasses along a long counter; a till on the shop's.
    if (long > 200) for (let k = 0; k < Math.floor(long / 60); k++) { const px = s.w > s.h ? s.x + 22 + k * 60 : s.x + s.w / 2, py = s.w > s.h ? s.y + s.h / 2 : s.y + 22 + k * 60; g.fillStyle = ['#3d6b52', '#a8402e', '#d8c9a0', '#2c4a6b'][k % 4]!; ell(g, px, py, 4.5, 4.5); g.fill(); g.strokeStyle = INK; g.lineWidth = 1.4; g.stroke(); }
    else if (thin >= 100) { g.fillStyle = C.steel; g.fillRect(s.x + 10, s.y + 10, s.w - 20, 14); }
  });
}

/* -- snow banks -------------------------------------------------------------------------------------------------------------- */

function paintDrift(g: G, s: Solid) {
  const { x, y, w, h } = s, face = 10;
  g.lineJoin = 'round';
  // A lumpy bank: the lit crown, a shaded foot, an ink edge round the lumps.
  const lump = (inset: number) => {
    g.beginPath();
    const n = Math.max(3, Math.round((w + h) / 36));
    const pts: [number, number][] = [];
    for (let i = 0; i < n * 2; i++) {
      const t = i / (n * 2), per = 2 * (w + h);
      let d = t * per, px: number, py: number;
      if (d < w) { px = x + d; py = y; } else if ((d -= w) < h) { px = x + w; py = y + d; } else if ((d -= h) < w) { px = x + w - d; py = y + h; } else { d -= w; px = x; py = y + h - d; }
      const k = (hash(px, py, 1) - 0.5) * 7;
      pts.push([Math.min(x + w, Math.max(x, px + (px > x + w / 2 ? -inset : inset) + k)), Math.min(y + h + face, Math.max(y - 4, py + (py > y + h / 2 ? -inset : inset) + k))]);
    }
    g.moveTo((pts[0]![0] + pts[pts.length - 1]![0]) / 2, (pts[0]![1] + pts[pts.length - 1]![1]) / 2);
    for (let i = 0; i < pts.length; i++) { const a = pts[i]!, b = pts[(i + 1) % pts.length]!; g.quadraticCurveTo(a[0], a[1], (a[0] + b[0]) / 2, (a[1] + b[1]) / 2); }
    g.closePath();
  };
  g.save(); g.translate(0, face - 2); lump(0); g.fillStyle = C.snowDeep; g.fill(); g.restore();
  lump(0); g.fillStyle = C.snowHi; g.fill(); g.strokeStyle = INK; g.lineWidth = 2; g.stroke();
  g.save(); lump(0); g.clip();
  g.fillStyle = 'rgba(255, 255, 255, 0.22)'; g.fillRect(x, y, w, Math.min(8, h / 2));
  g.fillStyle = 'rgba(50, 70, 112, 0.24)'; g.fillRect(x, y + h - Math.min(9, h / 2), w, Math.min(9, h / 2));
  for (let i = 0; i < w * h / 500; i++) { g.fillStyle = hash(x, y, i) > 0.5 ? 'rgba(220, 236, 252, 0.7)' : 'rgba(60, 84, 126, 0.3)'; g.fillRect(x + hash(i, x, 5) * w, y + hash(i, y, 6) * h, 2, 1.5); }
  g.restore();
}

/* -- machines ------------------------------------------------------------------------------------------------------------------ */

function paintMachine(g: G, s: Solid) {
  const d = districtAt(s.x + s.w / 2, s.y + s.h / 2).id;
  const face = 16;
  if (d === 'iceg') {
    // Carved ice: faceted blocks with a glint.
    shell(g, s, '#86c0d6', '#3f7a96', face, () => {
      g.fillStyle = '#4d8aa6'; g.fillRect(s.x, s.y + s.h, s.w, face);
      for (let xx = s.x; xx < s.x + s.w; xx += 28) { g.fillStyle = 'rgba(220, 244, 252, 0.4)'; g.beginPath(); g.moveTo(xx + 2, s.y + s.h + 3); g.lineTo(xx + 14, s.y + s.h + 3); g.lineTo(xx + 2, s.y + s.h + 13); g.closePath(); g.fill(); }
    }, () => { g.fillStyle = 'rgba(224, 246, 254, 0.5)'; g.beginPath(); g.moveTo(s.x + 6, s.y + 6); g.lineTo(s.x + s.w * 0.6, s.y + 6); g.lineTo(s.x + 6, s.y + s.h * 0.6); g.closePath(); g.fill(); g.strokeStyle = 'rgba(30, 80, 110, 0.5)'; g.lineWidth = 2; g.beginPath(); g.moveTo(s.x + s.w, s.y); g.lineTo(s.x, s.y + s.h); g.stroke(); });
    return;
  }
  const red = d === 'lift';
  shell(g, s, red ? '#8a4a3a' : '#7a8896', red ? '#5a2c22' : '#3b4651', face, () => {
    g.fillStyle = red ? C.red : C.steel; g.fillRect(s.x, s.y + s.h, s.w, face);
    for (let xx = s.x + 6; xx < s.x + s.w - 4; xx += 18) { g.fillStyle = 'rgba(0, 0, 0, 0.28)'; g.fillRect(xx, s.y + s.h + 3, 2, face - 6); }
    g.fillStyle = C.yellow; g.fillRect(s.x, s.y + s.h + face - 4, s.w, 4);
    g.fillStyle = INK; g.fillRect(s.x + 5, s.y + s.h + 3, 10, 4); g.fillStyle = '#ff5a1f'; g.fillRect(s.x + 7, s.y + s.h + 4, 3, 2);
  }, () => {
    g.fillStyle = 'rgba(255, 255, 255, 0.14)'; g.fillRect(s.x + 4, s.y + 4, s.w - 8, 5);
    g.fillStyle = red ? '#5a2c22' : C.steelLo; for (let xx = s.x + 10; xx < s.x + s.w - 8; xx += 24) g.fillRect(xx, s.y + 14, 14, 3);
    g.fillStyle = C.ink; ell(g, s.x + s.w - 16, s.y + s.h - 14, 7, 7); g.fill(); g.fillStyle = C.steelHi; ell(g, s.x + s.w - 17, s.y + s.h - 15, 4, 4); g.fill();
    snowCap(g, { ...s, h: Math.min(s.h, 20) }, 8, 0.6);
  });
}

export const SUMMIT_WALLS: Partial<Record<SolidKind, (ctx: G, s: Solid) => void>> = {
  timber: paintTimber, hearth: paintHearth, bartop: paintBartop, drift: paintDrift, machine: paintMachine,
};
void TAU;
