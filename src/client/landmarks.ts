import { seeded } from './grain.ts';
import { INK } from './palette.ts';
import type { Landmark, LandmarkKind } from './decor.ts';

/**
 * Each district's set-piece (decor.ts `REGIONS`), painted once onto a sprite the size of the wall block it rides on, then drawn
 * with one drawImage per frame. They are rooftops seen in the art bible's three-quarter view: a lit top, a hard shade step,
 * a short front face, an ink outline on every shape. Nothing here moves, so nothing here needs a frame budget.
 */

const TAU = Math.PI * 2;
const RUST = '#a8552e', OLIVE = '#6c7356', GUN = '#4f5560', GUN_D = '#3d4450', KHAKI = '#b4a07a', KHAKI_D = '#978562', BONE = '#cfc7b3', STEEL = '#8b929c', ORANGE = '#c9602a';
const HIGHLIGHT = 'rgba(255, 255, 255, 0.24)', SHADE = 'rgba(10, 12, 16, 0.3)';

const stroke = (g: CanvasRenderingContext2D, w = 1.8) => { g.lineWidth = w; g.lineJoin = 'round'; g.strokeStyle = INK; g.stroke(); };

/** A toy block: top face with a lit top-left band and a shaded bottom-right band, a front face below, ink around all of it. */
function block(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, fill: string, face = 5, step = 3) {
  g.fillStyle = 'rgba(20, 24, 32, 0.3)';
  g.fillRect(x + 3, y + 4, w, h + face);
  g.fillStyle = fill;
  g.fillRect(x, y, w, h);
  g.fillStyle = HIGHLIGHT;
  g.fillRect(x, y, w, step);
  g.fillRect(x, y, step, h);
  g.fillStyle = SHADE;
  g.fillRect(x, y + h - step, w, step);
  g.fillRect(x + w - step, y, step, h);
  g.fillStyle = 'rgba(10, 12, 16, 0.42)';
  g.fillRect(x, y + h, w, face);
  g.beginPath(); g.rect(x, y, w, h + face);
  stroke(g);
  g.beginPath(); g.moveTo(x, y + h); g.lineTo(x + w, y + h);
  stroke(g, 1.4);
}

function disc(g: CanvasRenderingContext2D, x: number, y: number, r: number, fill: string, w = 1.8) {
  g.beginPath(); g.arc(x, y, r, 0, TAU);
  g.fillStyle = fill; g.fill();
  stroke(g, w);
}

/** Corrugation on a roof: evenly spaced darker ribs with a lit edge, never hairlines. */
function ribs(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, vertical: boolean, gap = 7) {
  g.fillStyle = 'rgba(10, 12, 16, 0.2)';
  for (let t = gap; t < (vertical ? w : h) - 2; t += gap) {
    if (vertical) { g.fillRect(x + t, y + 2, 2, h - 4); } else { g.fillRect(x + 2, y + t, w - 4, 2); }
  }
  g.fillStyle = 'rgba(255, 255, 255, 0.12)';
  for (let t = gap; t < (vertical ? w : h) - 2; t += gap) {
    if (vertical) { g.fillRect(x + t - 1.5, y + 2, 1.5, h - 4); } else { g.fillRect(x + 2, y + t - 1.5, w - 4, 1.5); }
  }
}

const PAD = 14;

function containers(g: CanvasRenderingContext2D, W: number, H: number, rand: () => number) {
  const horiz = W >= H, cols = [RUST, OLIVE, GUN, KHAKI_D, ORANGE, '#5c6b6e'];
  const len = 66, thick = 26, gap = 4;
  const nAlong = Math.max(1, Math.floor(((horiz ? W : H) - PAD * 2 + gap) / (len + gap)));
  const nAcross = Math.max(1, Math.floor(((horiz ? H : W) - PAD * 2 + gap) / (thick + gap)));
  const along = nAlong * (len + gap) - gap, across = nAcross * (thick + gap) - gap;
  const ox = (W - (horiz ? along : across)) / 2, oy = (H - (horiz ? across : along)) / 2;
  for (let b = 0; b < nAcross; b++) {
    for (let a = 0; a < nAlong; a++) {
      const c = cols[Math.floor(rand() * cols.length)]!;
      const x = horiz ? ox + a * (len + gap) : ox + b * (thick + gap), y = horiz ? oy + b * (thick + gap) : oy + a * (len + gap);
      const w = horiz ? len : thick, h = horiz ? thick : len;
      block(g, x, y, w, h, c, 5, 3);
      ribs(g, x + 3, y + 3, w - 6, h - 6, horiz, 7);
      // A door end with its locking bars, and a stencilled box number block.
      g.fillStyle = 'rgba(10, 12, 16, 0.3)';
      if (horiz) g.fillRect(x + w - 8, y + 4, 6, h - 8); else g.fillRect(x + 4, y + h - 8, w - 8, 6);
      g.fillStyle = 'rgba(236, 230, 214, 0.7)';
      if (horiz) g.fillRect(x + 9, y + h / 2 - 2, 14, 4); else g.fillRect(x + w / 2 - 2, y + 9, 4, 14);
    }
  }
}

function tanks(g: CanvasRenderingContext2D, W: number, H: number) {
  const n = Math.max(1, Math.min(3, Math.floor(Math.max(W, H) / 120)));
  const horiz = W >= H;
  const r = Math.min((horiz ? H : W) / 2 - PAD * 0.5, ((horiz ? W : H) / n) / 2 - 6, 52);
  const lift = 10;
  // A pipe manifold behind the tanks, then each tank: a cylinder side, a lid with a hatch and a hazard band.
  for (let i = 0; i < n; i++) {
    const c = ((i + 0.5) * (horiz ? W : H)) / n;
    const x = horiz ? c : W / 2, y = horiz ? H / 2 : c;
    if (i > 0) {
      const px = horiz ? c - (horiz ? W : H) / n / 2 : x, py = horiz ? y : c - (horiz ? W : H) / n / 2;
      g.fillStyle = GUN; g.fillRect(px - (horiz ? 14 : 4), py - (horiz ? 4 : 14), horiz ? 28 : 8, horiz ? 8 : 28);
      g.beginPath(); g.rect(px - (horiz ? 14 : 4), py - (horiz ? 4 : 14), horiz ? 28 : 8, horiz ? 8 : 28); stroke(g, 1.6);
    }
    g.fillStyle = 'rgba(20, 24, 32, 0.3)'; g.beginPath(); g.ellipse(x + 4, y + lift + 4, r + 2, r * 0.9, 0, 0, TAU); g.fill();
    g.beginPath(); g.moveTo(x - r, y); g.lineTo(x - r, y + lift); g.arc(x, y + lift, r, Math.PI, 0, true); g.lineTo(x + r, y); g.arc(x, y, r, 0, Math.PI, true); g.closePath();
    g.fillStyle = '#6f757e'; g.fill(); stroke(g, 1.8);
    g.fillStyle = HIGHLIGHT; g.fillRect(x - r, y, r * 0.5, lift + 1);
    g.fillStyle = SHADE; g.fillRect(x + r * 0.45, y, r * 0.55, lift + 1);
    disc(g, x, y, r, '#a3a8af', 2);
    g.save(); g.beginPath(); g.arc(x, y, r, 0, TAU); g.clip();
    g.fillStyle = HIGHLIGHT; g.beginPath(); g.moveTo(x - r, y - r); g.lineTo(x + r * 0.2, y - r); g.lineTo(x - r, y + r * 0.2); g.fill();
    g.fillStyle = SHADE; g.beginPath(); g.moveTo(x + r, y + r); g.lineTo(x - r * 0.2, y + r); g.lineTo(x + r, y - r * 0.2); g.fill();
    g.restore();
    // Hazard ring: orange dashes around the rim.
    g.strokeStyle = '#d9541f'; g.lineWidth = 4; g.setLineDash([9, 7]);
    g.beginPath(); g.arc(x, y, r - 7, 0, TAU); g.stroke(); g.setLineDash([]);
    disc(g, x, y, r * 0.3, GUN_D, 1.8);
    g.fillStyle = '#d9541f'; g.fillRect(x - 1.6, y - r * 0.22, 3.2, r * 0.44); g.fillRect(x - r * 0.22, y - 1.6, r * 0.44, 3.2);
    g.beginPath(); g.arc(x - r * 0.55, y - r * 0.55, 2.2, 0, TAU); g.fillStyle = 'rgba(255, 255, 255, 0.85)'; g.fill();
  }
}

function trailers(g: CanvasRenderingContext2D, W: number, H: number, rand: () => number) {
  const horiz = W >= H, cols = [BONE, KHAKI_D, '#8e9a86', '#b9b4a6'];
  const thick = 36, gap = 6, trailerLen = 168;
  const nAlong = Math.max(1, Math.floor(((horiz ? W : H) - PAD * 2 + gap) / (trailerLen + gap)));
  const len = Math.min(trailerLen, ((horiz ? W : H) - PAD * 2 - gap * (nAlong - 1)) / nAlong);
  const n = Math.max(1, Math.floor(((horiz ? H : W) - PAD * 2 + gap) / (thick + gap)));
  const total = n * (thick + gap) - gap, alongTotal = nAlong * (len + gap) - gap;
  for (let a = 0; a < nAlong; a++) for (let i = 0; i < n; i++) {
    if (rand() < 0.12) continue; // an empty bay
    const w = horiz ? len : thick, h = horiz ? thick : len;
    const x = horiz ? (W - alongTotal) / 2 + a * (len + gap) : (W - total) / 2 + i * (thick + gap), y = horiz ? (H - total) / 2 + i * (thick + gap) : (H - alongTotal) / 2 + a * (len + gap);
    const cab = 24;
    block(g, x, y, w, h, cols[Math.floor(rand() * cols.length)]!, 6, 3);
    ribs(g, x + 3, y + 3, horiz ? w - cab - 8 : w - 6, horiz ? h - 6 : h - cab - 8, horiz, 7);
    // The tractor cab at the front: a darker box with a windscreen strip.
    const cx = horiz ? x + w - cab : x, cy = horiz ? y : y + h - cab;
    block(g, cx, cy, horiz ? cab : w, horiz ? h : cab, GUN, 5, 3);
    g.fillStyle = '#9fc4d6'; if (horiz) g.fillRect(cx + cab - 6, cy + 5, 3.5, h - 10); else g.fillRect(cx + 5, cy + cab - 6, w - 10, 3.5);
    g.fillStyle = '#d9541f'; if (horiz) g.fillRect(x + 2, y + 2, 3, h - 4); else g.fillRect(x + 2, y + 2, w - 4, 3);
  }
}

function office(g: CanvasRenderingContext2D, W: number, H: number, rand: () => number, label = 'OFFICE') {
  block(g, 8, 8, W - 16, H - 16, '#6a707a', 5, 3);
  // A parapet: an inner kerb all round, then the roof inside it.
  g.beginPath(); g.rect(14, 14, W - 28, H - 28); g.fillStyle = '#5b616b'; g.fill(); stroke(g, 1.6);
  const unit = (x: number, y: number, s: number) => {
    block(g, x, y, s, s, GUN, 4, 3);
    disc(g, x + s / 2, y + s / 2, s * 0.34, GUN_D, 1.6);
    g.strokeStyle = STEEL; g.lineWidth = 2.2;
    for (let i = 0; i < 3; i++) { const a = (i * TAU) / 3 + rand(); g.beginPath(); g.moveTo(x + s / 2, y + s / 2); g.lineTo(x + s / 2 + Math.cos(a) * s * 0.3, y + s / 2 + Math.sin(a) * s * 0.3); g.stroke(); }
    disc(g, x + s / 2, y + s / 2, 2.4, STEEL, 1.4);
  };
  // HVAC units along the north and south parapets.
  const u = 26;
  for (let x = 26; x + u < W - 22; x += 62) { if (rand() < 0.8) unit(x, 24, u); if (rand() < 0.8) unit(x + 14, H - 24 - u, u); }
  // Skylights in a grid across the middle: blue-grey glass in a frame, crossed by ink bars.
  const cols = Math.max(1, Math.floor((W - 80) / 70)), rows = Math.max(1, Math.floor((H - 160) / 70));
  for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) {
    const sx = (W - (cols * 70 - 30)) / 2 + i * 70, sy = (H - (rows * 70 - 46)) / 2 + j * 70;
    block(g, sx, sy, 40, 24, '#7fa0b4', 3, 2);
    g.beginPath(); g.moveTo(sx + 20, sy); g.lineTo(sx + 20, sy + 24); g.moveTo(sx, sy + 12); g.lineTo(sx + 40, sy + 12); stroke(g, 1.4);
  }
  // A stair box in one corner, a water tank in another, a mast with an amber lamp, and the building's name lettered on the roof.
  block(g, W - 22 - 40, 24 + u + 12, 40, 30, '#7d838d', 6, 3);
  g.fillStyle = 'rgba(10, 12, 16, 0.4)'; g.fillRect(W - 22 - 32, 24 + u + 24, 24, 14);
  disc(g, 40, H / 2 - 30, 16, '#8f959e', 2); disc(g, 40, H / 2 - 30, 7, GUN_D, 1.4);
  disc(g, W - 22, 22, 4, '#d9541f', 1.6);
  g.save(); g.translate(W / 2, H - 60); g.fillStyle = 'rgba(236, 230, 214, 0.5)';
  g.font = '800 34px "Barlow Condensed", "Arial Narrow", sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  (g as unknown as { letterSpacing: string }).letterSpacing = '8px';
  g.fillText(label, 0, 0); g.restore();
}

function motor(g: CanvasRenderingContext2D, W: number, H: number, rand: () => number) {
  const horiz = W >= H, n = Math.max(1, Math.min(3, Math.floor((horiz ? W : H) / 110)));
  const long = Math.min(96, ((horiz ? W : H) - PAD * 2) / n - 8), wide = Math.min(44, (horiz ? H : W) - PAD * 2);
  for (let i = 0; i < n; i++) {
    const c = ((i + 0.5) * (horiz ? W : H)) / n;
    const w = horiz ? long : wide, h = horiz ? wide : long, x = horiz ? c - w / 2 : (W - w) / 2, y = horiz ? (H - h) / 2 : c - h / 2;
    // A tarped truck: olive canvas over the bed with cel-shaded folds, a gunmetal cab at the front.
    const cab = 24;
    block(g, x, y, w, h, OLIVE, 6, 3);
    g.save(); g.beginPath(); g.rect(x, y, w, h); g.clip();
    g.fillStyle = 'rgba(255, 255, 255, 0.14)';
    for (let k = 0; k < 3; k++) { const o = 10 + k * 22 + rand() * 4; g.beginPath(); if (horiz) { g.moveTo(x + o, y); g.lineTo(x + o + 9, y); g.lineTo(x + o - 4, y + h); g.lineTo(x + o - 13, y + h); } else { g.moveTo(x, y + o); g.lineTo(x, y + o + 9); g.lineTo(x + w, y + o - 4); g.lineTo(x + w, y + o - 13); } g.closePath(); g.fill(); }
    g.restore();
    const cx = horiz ? x + w - cab : x, cy = horiz ? y : y + h - cab;
    block(g, cx, cy, horiz ? cab : w, horiz ? h : cab, GUN, 5, 3);
    g.fillStyle = '#9fc4d6'; if (horiz) g.fillRect(cx + cab - 7, cy + 4, 4, h - 8); else g.fillRect(cx + 4, cy + cab - 7, w - 8, 4);
    g.fillStyle = KHAKI; if (horiz) g.fillRect(x + 6, y + h / 2 - 3, 10, 6); else g.fillRect(x + w / 2 - 3, y + 6, 6, 10);
  }
}

function dish(g: CanvasRenderingContext2D, W: number, H: number) {
  block(g, 8, 8, W - 16, H - 16, '#5b616b', 5, 3);
  const r = Math.min(W, H) * 0.32, x = W / 2, y = H / 2 - 2;
  // A radar dish: a ringed bowl with a feed arm and a hub.
  g.fillStyle = 'rgba(20, 24, 32, 0.3)'; g.beginPath(); g.ellipse(x + 5, y + 8, r, r * 0.9, 0, 0, TAU); g.fill();
  disc(g, x, y, r, '#a7adb5', 2.2);
  g.save(); g.beginPath(); g.arc(x, y, r, 0, TAU); g.clip();
  g.fillStyle = HIGHLIGHT; g.beginPath(); g.moveTo(x - r, y - r); g.lineTo(x + r * 0.2, y - r); g.lineTo(x - r, y + r * 0.2); g.fill();
  g.fillStyle = SHADE; g.beginPath(); g.moveTo(x + r, y + r); g.lineTo(x - r * 0.2, y + r); g.lineTo(x + r, y - r * 0.2); g.fill();
  g.restore();
  g.beginPath(); g.arc(x, y, r * 0.62, 0, TAU); stroke(g, 1.4);
  g.beginPath(); g.moveTo(x, y); g.lineTo(x + r * 0.9, y - r * 0.6); stroke(g, 3.4);
  g.strokeStyle = STEEL; g.lineWidth = 1.6; g.stroke();
  disc(g, x, y, 4, '#d9541f', 1.6);
  disc(g, x + r * 0.9, y - r * 0.6, 3, '#ece6d6', 1.4);
}

function scrap(g: CanvasRenderingContext2D, W: number, H: number, rand: () => number) {
  const cols = ['#6a645a', '#7d776a', RUST, '#58544c', '#8a5a38', GUN];
  const s = 34, cx = Math.max(1, Math.floor((W - PAD) / (s + 4))), cy = Math.max(1, Math.floor((H - PAD) / (s + 4)));
  for (let j = 0; j < cy; j++) {
    for (let i = 0; i < cx; i++) {
      const x = (W - (cx * (s + 4) - 4)) / 2 + i * (s + 4), y = (H - (cy * (s + 4) - 4)) / 2 + j * (s + 4);
      g.save();
      g.translate(x + s / 2, y + s / 2);
      g.rotate((rand() - 0.5) * 0.28);
      block(g, -s / 2, -s / 2, s, s, cols[Math.floor(rand() * cols.length)]!, 6, 3);
      // Crushed-car creases: dark gouges and a bright window scrap.
      g.fillStyle = 'rgba(10, 12, 16, 0.35)'; g.fillRect(-s / 2 + 5, -s / 2 + 9 + rand() * 8, s - 10, 3);
      g.fillStyle = '#9fc4d6'; g.fillRect(-s / 2 + 4 + rand() * 14, -s / 2 + 4, 7, 3);
      g.restore();
    }
  }
}

function warehouse(g: CanvasRenderingContext2D, W: number, H: number) {
  block(g, 6, 6, W - 12, H - 12, '#8a8f98', 6, 3);
  ribs(g, 8, 8, W - 16, H - 16, W < H, 9);
  const n = Math.max(1, Math.floor(Math.max(W, H) / 110));
  for (let i = 0; i < n; i++) {
    const c = ((i + 0.5) * Math.max(W, H)) / n;
    const x = W >= H ? c - 18 : W / 2 - 14, y = W >= H ? H / 2 - 12 : c - 18;
    block(g, x, y, W >= H ? 36 : 28, W >= H ? 24 : 36, '#7fa0b4', 3, 2);
  }
  g.fillStyle = '#d9541f'; g.fillRect(14, 14, 18, 6); g.fillStyle = 'rgba(236, 230, 214, 0.8)'; g.fillRect(16, 16, 14, 2);
}

function tents(g: CanvasRenderingContext2D, W: number, H: number, rand: () => number) {
  const horiz = W >= H, n = Math.max(1, Math.min(3, Math.floor((horiz ? W : H) / 110)));
  const long = Math.min(84, ((horiz ? W : H) - PAD * 2) / n - 8), wide = Math.min(56, (horiz ? H : W) - PAD * 2);
  for (let i = 0; i < n; i++) {
    const c = ((i + 0.5) * (horiz ? W : H)) / n;
    const w = horiz ? long : wide, h = horiz ? wide : long, x = horiz ? c - w / 2 : (W - w) / 2, y = horiz ? (H - h) / 2 : c - h / 2;
    const col = rand() < 0.5 ? KHAKI : '#a8946a';
    g.fillStyle = 'rgba(20, 24, 32, 0.3)'; g.fillRect(x + 4, y + 5, w, h + 6);
    // A canvas tent from above: ridge down the middle, the lit slope bright, the far slope shaded.
    g.fillStyle = col; g.fillRect(x, y, w, h);
    g.fillStyle = HIGHLIGHT; if (horiz) g.fillRect(x, y, w, h / 2); else g.fillRect(x, y, w / 2, h);
    g.fillStyle = SHADE; if (horiz) g.fillRect(x, y + h / 2, w, h / 2); else g.fillRect(x + w / 2, y, w / 2, h);
    g.fillStyle = 'rgba(10, 12, 16, 0.42)'; g.fillRect(x, y + h, w, 6);
    g.beginPath(); g.rect(x, y, w, h + 6); stroke(g);
    g.beginPath(); if (horiz) { g.moveTo(x, y + h / 2); g.lineTo(x + w, y + h / 2); } else { g.moveTo(x + w / 2, y); g.lineTo(x + w / 2, y + h); } stroke(g, 2.4);
    g.fillStyle = 'rgba(10, 12, 16, 0.28)'; if (horiz) { g.fillRect(x + w - 14, y + 5, 8, h - 10); } else { g.fillRect(x + 5, y + h - 14, w - 10, 8); }
  }
}


const tri = (g: CanvasRenderingContext2D, pts: readonly (readonly [number, number])[], fill: string) => {
  g.beginPath(); g.moveTo(pts[0]![0], pts[0]![1]); for (const q of pts.slice(1)) g.lineTo(q[0], q[1]); g.closePath(); g.fillStyle = fill; g.fill(); stroke(g, 1.6);
};

function busdepot(g: CanvasRenderingContext2D, W: number, H: number, rand: () => number) {
  const horiz = W >= H, cols = ['#9a4a42', '#b79a4a', '#4a6c94', '#7a8a6a'];
  const thick = 38, gap = 7, long = Math.min(190, (horiz ? W : H) - PAD * 2);
  const n = Math.max(1, Math.floor(((horiz ? H : W) - PAD * 2 + gap) / (thick + gap)));
  const total = n * (thick + gap) - gap;
  for (let i = 0; i < n; i++) {
    const w = horiz ? long : thick, h = horiz ? thick : long;
    const x = horiz ? (W - long) / 2 : (W - total) / 2 + i * (thick + gap), y = horiz ? (H - total) / 2 + i * (thick + gap) : (H - long) / 2;
    block(g, x, y, w, h, cols[Math.floor(rand() * cols.length)]!, 6, 3);
    // Roof hatches and an aircon pod, a bone stripe down the roof, and the windscreen at the nose.
    g.fillStyle = 'rgba(236, 230, 214, 0.55)'; if (horiz) g.fillRect(x + 8, y + h / 2 - 1.5, w - 30, 3); else g.fillRect(x + w / 2 - 1.5, y + 8, 3, h - 30);
    for (const o of [0.3, 0.55]) { const hx = horiz ? x + w * o : x + w / 2 - 6, hy = horiz ? y + h / 2 - 6 : y + h * o; block(g, hx, hy, 12, 12, '#d9d2bd', 2, 2); }
    g.fillStyle = '#9fc4d6'; if (horiz) g.fillRect(x + w - 6, y + 5, 3.5, h - 10); else g.fillRect(x + 5, y + h - 6, w - 10, 3.5);
  }
}

function markethall(g: CanvasRenderingContext2D, W: number, H: number, rand: () => number) {
  // A pitched tile roof from above: two slopes either side of a ridge, tile courses, skylights and a little weathervane.
  const horiz = W >= H, c = '#a8644a';
  g.fillStyle = 'rgba(20, 24, 32, 0.3)'; g.fillRect(12, 14, W - 16, H - 8);
  g.fillStyle = c; g.fillRect(8, 8, W - 16, H - 16);
  g.fillStyle = HIGHLIGHT; if (horiz) g.fillRect(8, 8, W - 16, (H - 16) / 2); else g.fillRect(8, 8, (W - 16) / 2, H - 16);
  g.fillStyle = SHADE; if (horiz) g.fillRect(8, H / 2, W - 16, (H - 16) / 2); else g.fillRect(W / 2, 8, (W - 16) / 2, H - 16);
  g.fillStyle = 'rgba(10, 12, 16, 0.22)';
  for (let t = 14; t < (horiz ? H : W) - 8; t += 9) { if (horiz) g.fillRect(10, 8 + t - 6, W - 20, 2); else g.fillRect(8 + t - 6, 10, 2, H - 20); }
  g.beginPath(); g.rect(8, 8, W - 16, H - 16); stroke(g);
  g.beginPath(); if (horiz) { g.moveTo(8, H / 2); g.lineTo(W - 8, H / 2); } else { g.moveTo(W / 2, 8); g.lineTo(W / 2, H - 8); } stroke(g, 3);
  const n = Math.max(1, Math.floor(Math.max(W, H) / 120));
  for (let i = 0; i < n; i++) { const t = ((i + 0.5) * Math.max(W, H)) / n; const sx = horiz ? t - 15 : W * 0.25 - 12, sy = horiz ? H * 0.25 - 9 : t - 15; block(g, sx, sy, horiz ? 30 : 24, horiz ? 18 : 30, '#7fa0b4', 3, 2); }
  disc(g, W - 24, 24, 4, '#d9541f', 1.6); void rand;
}

function townhall(g: CanvasRenderingContext2D, W: number, H: number) {
  block(g, 6, 6, W - 12, H - 12, '#7a7e86', 5, 3);
  // Four hipped slopes meeting at the clock tower, lit and shaded in hard steps.
  const x0 = 16, y0 = 16, x1 = W - 16, y1 = H - 22, mx = W / 2, my = (y0 + y1) / 2, k = Math.min(W, H) * 0.2;
  tri(g, [[x0, y0], [x1, y0], [mx + k, my - k], [mx - k, my - k]], '#5d6672');
  tri(g, [[x0, y0], [mx - k, my - k], [mx - k, my + k], [x0, y1]], '#6d7683');
  tri(g, [[x1, y0], [x1, y1], [mx + k, my + k], [mx + k, my - k]], '#4a525d');
  tri(g, [[x0, y1], [mx - k, my + k], [mx + k, my + k], [x1, y1]], '#555d69');
  block(g, mx - k, my - k, k * 2, k * 2, '#8d939c', 5, 3);
  disc(g, mx, my, k * 0.7, '#ece6d6', 2);
  g.strokeStyle = INK; g.lineWidth = 2.2; g.beginPath(); g.moveTo(mx, my); g.lineTo(mx, my - k * 0.5); g.moveTo(mx, my); g.lineTo(mx + k * 0.35, my + k * 0.1); g.stroke();
  // The steps: a flight of risers across the south front.
  for (let i = 0; i < 4; i++) { g.fillStyle = i % 2 ? '#a3a8af' : '#8d939c'; g.fillRect(24 + i * 6, H - 20 + i * 3.5 - 6, W - 48 - i * 12, 3.4); }
}

function fountain(g: CanvasRenderingContext2D, W: number, H: number) {
  const x = W / 2, y = H / 2 - 4, r = Math.min(W, H) * 0.42;
  g.fillStyle = 'rgba(20, 24, 32, 0.3)'; g.beginPath(); g.ellipse(x + 5, y + 9, r, r * 0.92, 0, 0, TAU); g.fill();
  disc(g, x, y, r, '#a3a8af', 2.4);
  disc(g, x, y, r - 9, '#5f8fb0', 1.8);
  g.strokeStyle = 'rgba(255,255,255,0.35)'; g.lineWidth = 1.6; for (const f of [0.78, 0.55]) { g.beginPath(); g.arc(x, y, (r - 9) * f, 0.4, 2.4); g.stroke(); }
  disc(g, x, y, r * 0.32, '#8d939c', 2); disc(g, x, y, r * 0.18, '#d9d2bd', 1.6); disc(g, x, y, r * 0.07, '#9fd0ea', 1.2);
  g.fillStyle = 'rgba(255,255,255,0.7)'; for (let i = 0; i < 8; i++) { const a = (i * TAU) / 8; g.beginPath(); g.arc(x + Math.cos(a) * r * 0.42, y + Math.sin(a) * r * 0.42, 1.8, 0, TAU); g.fill(); }
  g.save(); g.beginPath(); g.arc(x, y, r, 0, TAU); g.clip(); g.fillStyle = HIGHLIGHT; g.beginPath(); g.moveTo(x - r, y - r); g.lineTo(x + r * 0.2, y - r); g.lineTo(x - r, y + r * 0.2); g.fill(); g.restore();
}

function bandstand(g: CanvasRenderingContext2D, W: number, H: number) {
  const x = W / 2, y = H / 2 - 4, r = Math.min(W, H) * 0.4;
  g.fillStyle = 'rgba(20, 24, 32, 0.3)'; g.beginPath(); g.ellipse(x + 5, y + 9, r, r * 0.92, 0, 0, TAU); g.fill();
  // A round canopy in eight awning wedges, red and bone, with a finial.
  for (let i = 0; i < 8; i++) { g.beginPath(); g.moveTo(x, y); g.arc(x, y, r, (i * TAU) / 8, ((i + 1) * TAU) / 8); g.closePath(); g.fillStyle = i % 2 ? '#ece6d6' : '#9a4a42'; g.fill(); }
  g.save(); g.beginPath(); g.arc(x, y, r, 0, TAU); g.clip();
  g.fillStyle = HIGHLIGHT; g.beginPath(); g.moveTo(x - r, y - r); g.lineTo(x + r * 0.2, y - r); g.lineTo(x - r, y + r * 0.2); g.fill();
  g.fillStyle = SHADE; g.beginPath(); g.moveTo(x + r, y + r); g.lineTo(x - r * 0.2, y + r); g.lineTo(x + r, y - r * 0.2); g.fill(); g.restore();
  g.beginPath(); g.arc(x, y, r, 0, TAU); stroke(g, 2.2);
  for (let i = 0; i < 8; i++) { g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos((i * TAU) / 8) * r, y + Math.sin((i * TAU) / 8) * r); stroke(g, 1.2); }
  disc(g, x, y, 5, '#d9541f', 1.6); disc(g, x - 1.6, y - 1.8, 1.2, '#fff', 0.1);
}

function bakery(g: CanvasRenderingContext2D, W: number, H: number, rand: () => number) {
  block(g, 6, 6, W - 12, H - 12, '#a86a50', 5, 3);
  g.fillStyle = 'rgba(10, 12, 16, 0.22)'; for (let t = 16; t < H - 12; t += 9) g.fillRect(10, t, W - 20, 2);
  for (let t = 14; t < H - 14; t += 18) for (let u = (t / 18) % 2 ? 22 : 12; u < W - 14; u += 24) { g.fillStyle = 'rgba(255,255,255,0.1)'; g.fillRect(u, t - 3, 10, 2); }
  // A brick chimney with a pale curl of smoke, a skylight, and a vent cowl.
  block(g, W - 44, 18, 22, 22, '#8a4a38', 4, 3);
  g.fillStyle = 'rgba(236, 230, 214, 0.55)'; for (const [dx, dy, r] of [[8, -2, 7], [14, -10, 6], [8, -17, 5]] as const) { g.beginPath(); g.arc(W - 44 + dx + 4, 18 + dy, r, 0, TAU); g.fill(); }
  block(g, 24, H - 50, 34, 22, '#7fa0b4', 3, 2); disc(g, W / 2, H / 2, 8, GUN, 1.6); void rand;
}

function church(g: CanvasRenderingContext2D, W: number, H: number) {
  g.fillStyle = 'rgba(20, 24, 32, 0.3)'; g.fillRect(14, 14, W - 20, H - 8);
  // A cross-shaped slate roof: the nave the long way, the transept across, a bell tower at the west end carrying a cross.
  const nw = Math.min(W, H) * 0.34, cx = W / 2, cy = H / 2;
  const slope = (x: number, y: number, w: number, h: number, vertical: boolean) => {
    g.fillStyle = '#566170'; g.fillRect(x, y, w, h);
    g.fillStyle = HIGHLIGHT; if (vertical) g.fillRect(x, y, w / 2, h); else g.fillRect(x, y, w, h / 2);
    g.fillStyle = SHADE; if (vertical) g.fillRect(x + w / 2, y, w / 2, h); else g.fillRect(x, y + h / 2, w, h / 2);
    g.fillStyle = 'rgba(10,12,16,0.2)'; for (let t = 8; t < (vertical ? h : w); t += 9) { if (vertical) g.fillRect(x, y + t, w, 2); else g.fillRect(x + t, y, 2, h); }
    g.beginPath(); g.rect(x, y, w, h); stroke(g);
    g.beginPath(); if (vertical) { g.moveTo(x + w / 2, y); g.lineTo(x + w / 2, y + h); } else { g.moveTo(x, y + h / 2); g.lineTo(x + w, y + h / 2); } stroke(g, 2.6);
  };
  const long = W >= H;
  if (long) { slope(16, cy - nw / 2, W - 32, nw, false); slope(cx - nw * 0.9, 14, nw * 1.1, H - 28, true); } else { slope(cx - nw / 2, 16, nw, H - 32, true); slope(14, cy - nw * 0.9, W - 28, nw * 1.1, false); }
  const tx = long ? 20 : cx - 16, ty = long ? cy - 16 : H - 52;
  block(g, tx, ty, 32, 32, '#7d838d', 5, 3);
  g.fillStyle = '#ece6d6'; g.fillRect(tx + 14, ty + 6, 4, 20); g.fillRect(tx + 8, ty + 11, 16, 4);
}

function laundry(g: CanvasRenderingContext2D, W: number, H: number, rand: () => number) {
  block(g, 6, 6, W - 12, H - 12, '#6a5f55', 5, 3);
  g.fillStyle = 'rgba(10,12,16,0.2)'; for (let t = 20; t < W - 12; t += 22) g.fillRect(t, 10, 2, H - 20);
  // Washing lines strung between posts, hung with shirts, sheets and socks.
  const cols = ['#ece6d6', '#9a4a42', '#4a6c94', '#c9a23c', '#7a8a6a', '#d9d2bd'];
  const lines = Math.max(2, Math.floor((H - 30) / 46));
  for (let j = 0; j < lines; j++) {
    const y = 28 + j * ((H - 56) / Math.max(1, lines - 1));
    disc(g, 18, y, 3.4, GUN_D, 1.4); disc(g, W - 18, y, 3.4, GUN_D, 1.4);
    g.beginPath(); g.moveTo(18, y); g.lineTo(W - 18, y); stroke(g, 1.5);
    for (let x = 34; x < W - 40; x += 16 + rand() * 18) { const w = 9 + rand() * 9, h = 10 + rand() * 12; g.fillStyle = cols[Math.floor(rand() * cols.length)]!; g.fillRect(x, y + 1, w, h); g.fillStyle = SHADE; g.fillRect(x + w * 0.6, y + 1, w * 0.4, h); g.beginPath(); g.rect(x, y + 1, w, h); stroke(g, 1.2); }
  }
}

function well(g: CanvasRenderingContext2D, W: number, H: number) {
  const x = W / 2, y = H / 2 - 4, r = Math.min(W, H) * 0.3;
  g.fillStyle = 'rgba(20, 24, 32, 0.3)'; g.beginPath(); g.ellipse(x + 5, y + 10, r + 6, r * 0.95, 0, 0, TAU); g.fill();
  disc(g, x, y, r, '#9a9a90', 2.4); disc(g, x, y, r - 8, '#26303a', 1.8); disc(g, x, y, r - 14, '#3c5a70', 1.2);
  for (let i = 0; i < 10; i++) { const a = (i * TAU) / 10; g.beginPath(); g.moveTo(x + Math.cos(a) * (r - 8), y + Math.sin(a) * (r - 8)); g.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r); stroke(g, 1.2); }
  // A little gabled roof on two posts, its crank and bucket.
  g.fillStyle = '#7a5a3a'; g.fillRect(x - r - 4, y - 3, 8, 6); g.fillRect(x + r - 4, y - 3, 8, 6);
  block(g, x - r - 8, y - 14, r * 2 + 16, 28, '#8a4a38', 4, 3); g.beginPath(); g.moveTo(x - r - 8, y); g.lineTo(x + r + 8, y); stroke(g, 2.2);
  disc(g, x + r + 10, y + 18, 3, '#6a5a3a', 1.4);
}

function crusher(g: CanvasRenderingContext2D, W: number, H: number, rand: () => number) {
  const horiz = W >= H;
  // A jaw crusher: a hopper funnel in hazard stripes, a flywheel, the motor housing, and a heap of crushed rock under the chute.
  const hx = horiz ? W * 0.28 : W / 2, hy = horiz ? H / 2 : H * 0.26, hr = Math.min(W, H) * 0.3;
  block(g, hx - hr, hy - hr, hr * 2, hr * 2, '#8a5a30', 6, 3);
  tri(g, [[hx - hr + 6, hy - hr + 6], [hx + hr - 6, hy - hr + 6], [hx + hr * 0.4, hy + hr * 0.5], [hx - hr * 0.4, hy + hr * 0.5]], '#3a3f48');
  g.fillStyle = '#c9a23c'; for (let i = 0; i < 4; i++) { g.fillRect(hx - hr + 6 + i * (hr * 0.5), hy - hr + 6, hr * 0.25, 7); }
  const fx = horiz ? W * 0.58 : W / 2, fy = horiz ? H / 2 : H * 0.6;
  disc(g, fx, fy, hr * 0.8, '#6f757e', 2.2); disc(g, fx, fy, hr * 0.5, '#4f5560', 1.8); disc(g, fx, fy, 4, '#d9541f', 1.4);
  block(g, horiz ? W * 0.72 : W / 2 - 22, horiz ? H / 2 - 22 : H * 0.74, 44, 44, GUN, 5, 3);
  for (let i = 0; i < 26; i++) { g.fillStyle = rand() < 0.5 ? '#6a655b' : '#8d8372'; const a = rand() * TAU, d = rand() * hr * 0.9; g.beginPath(); g.arc((horiz ? W * 0.9 : W * 0.78) + Math.cos(a) * d * 0.7, (horiz ? H * 0.72 : H * 0.9) + Math.sin(a) * d * 0.5, 2.5 + rand() * 4, 0, TAU); g.fill(); stroke(g, 1); }
}

function conveyor(g: CanvasRenderingContext2D, W: number, H: number, rand: () => number) {
  const horiz = W >= H, n = Math.max(1, Math.floor(((horiz ? H : W) - PAD * 2) / 44));
  const total = n * 44 - 10;
  for (let i = 0; i < n; i++) {
    const off = ((horiz ? H : W) - total) / 2 + i * 44;
    const x = horiz ? 14 : off, y = horiz ? off : 14, w = horiz ? W - 28 : 34, h = horiz ? 34 : H - 28;
    block(g, x, y, w, h, '#2f3238', 5, 3);
    g.fillStyle = '#4a4f58'; if (horiz) g.fillRect(x + 4, y + 7, w - 8, h - 14); else g.fillRect(x + 7, y + 4, w - 14, h - 8);
    g.fillStyle = 'rgba(255,255,255,0.14)'; for (let t = 8; t < (horiz ? w : h) - 6; t += 12) { if (horiz) g.fillRect(x + t, y + 7, 2, h - 14); else g.fillRect(x + 7, y + t, w - 14, 2); }
    for (let k = 0; k < (horiz ? w : h) / 38; k++) { g.fillStyle = rand() < 0.5 ? '#6a655b' : '#8d8372'; g.beginPath(); g.arc(horiz ? x + 14 + k * 38 + rand() * 10 : x + w / 2 + (rand() - 0.5) * 8, horiz ? y + h / 2 + (rand() - 0.5) * 8 : y + 14 + k * 38 + rand() * 10, 3 + rand() * 3, 0, TAU); g.fill(); stroke(g, 1); }
    g.fillStyle = '#d9541f'; if (horiz) { g.fillRect(x, y + h - 3, 10, 3); g.fillRect(x + w - 10, y + h - 3, 10, 3); } else { g.fillRect(x + w - 3, y, 3, 10); g.fillRect(x + w - 3, y + h - 10, 3, 10); }
  }
}

function dynamite(g: CanvasRenderingContext2D, W: number, H: number, rand: () => number) {
  // A squat blast shack: a sloped plank roof, the red crates of explosives stacked by the door, a lightning rod and a warning triangle.
  const sx = 16, sy = 16, sw = Math.min(W - 32, 150), sh = H - 32;
  block(g, sx, sy, sw, sh, '#6a4a3a', 6, 3);
  g.fillStyle = 'rgba(10,12,16,0.25)'; for (let t = 10; t < sw - 4; t += 11) g.fillRect(sx + t, sy + 3, 2, sh - 6);
  g.fillStyle = '#d9541f'; g.fillRect(sx, sy + sh / 2 - 6, sw, 12); g.fillStyle = '#2b2e34'; for (let t = 0; t < sw; t += 20) g.fillRect(sx + t, sy + sh / 2 - 6, 10, 12);
  g.beginPath(); g.rect(sx, sy + sh / 2 - 6, sw, 12); stroke(g, 1.4);
  const cx = sx + sw + 14;
  if (cx + 52 < W) for (let i = 0; i < 6; i++) block(g, cx + (i % 3) * 17, sy + 6 + Math.floor(i / 3) * 17 + (i % 2) * 2, 15, 15, '#a8493f', 3, 2);
  disc(g, sx + sw - 12, sy + 12, 3, '#ece6d6', 1.4);
  tri(g, [[sx + 10, sy + sh - 12], [sx + 28, sy + sh - 12], [sx + 19, sy + sh - 28]], '#c9a23c'); void rand;
}

function gravel(g: CanvasRenderingContext2D, W: number, H: number, rand: () => number) {
  const n = Math.max(1, Math.min(4, Math.floor(Math.max(W, H) / 130))), horiz = W >= H;
  const tones = [['#7d776a', '#9a9384'], ['#8a7a5a', '#a89570'], ['#6a6e72', '#8a8f94'], ['#8a6a50', '#a88a6a']];
  for (let i = 0; i < n; i++) {
    const c = ((i + 0.5) * (horiz ? W : H)) / n, x = horiz ? c : W / 2 + (rand() - 0.5) * 20, y = horiz ? H / 2 + (rand() - 0.5) * 20 : c;
    const r = Math.min((horiz ? W : H) / n / 2 - 6, (horiz ? H : W) / 2 - 12, 62);
    g.fillStyle = 'rgba(20,24,32,0.3)'; g.beginPath(); g.ellipse(x + 5, y + 7, r, r * 0.88, 0, 0, TAU); g.fill();
    const t = tones[i % tones.length]!;
    for (const [f, col] of [[1, t[0]!], [0.72, t[1]!], [0.44, t[0]!], [0.2, t[1]!]] as const) { g.beginPath(); g.ellipse(x - (1 - f) * 5, y - (1 - f) * 6, r * f, r * f * 0.88, 0, 0, TAU); g.fillStyle = col; g.fill(); if (f === 1) stroke(g, 1.8); }
    for (let k = 0; k < r * 1.6; k++) { const a = rand() * TAU, d = Math.sqrt(rand()) * r * 0.92; g.fillStyle = rand() < 0.5 ? 'rgba(255,255,255,0.28)' : 'rgba(10,12,16,0.35)'; g.fillRect(x + Math.cos(a) * d - 1, y + Math.sin(a) * d * 0.88 - 1, 2.2, 2); }
  }
}

const PAINT: Record<LandmarkKind, (g: CanvasRenderingContext2D, W: number, H: number, rand: () => number, label: string) => void> = {
  trailer: trailers, containers, office, motor, dish, tanks, scrap, warehouse, tents,
  busdepot, markethall, townhall, fountain, bandstand, bakery, church, laundry, well, crusher, conveyor, dynamite, gravel,
};

const sprites = new Map<string, HTMLCanvasElement>();

/** The painted sprite for a landmark, made once: the wall block's own size, transparent where the wall shows through. */
/** The rooftop surface under each set-piece, so it reads as built on the block rather than laid over its pattern. */
const BASE: Partial<Record<LandmarkKind, string>> = { containers: '#4d5058', tanks: '#6a665c', trailer: '#4d5058', motor: '#5d6350', scrap: '#4a443c', tents: '#9a8a64', busdepot: '#4d5058', fountain: '#7b7a72', bandstand: '#6f6a60', laundry: '#4f463e', well: '#6a665c', crusher: '#4a4640', conveyor: '#4d5058', dynamite: '#5a4a3c', gravel: '#6a6458', church: '#5a5f68' };

export function landmarkSprite(lm: Landmark): HTMLCanvasElement {
  const key = `${lm.kind}${lm.label}${lm.x},${lm.y},${lm.w},${lm.h}`;
  let c = sprites.get(key);
  if (!c) {
    c = document.createElement('canvas');
    c.width = Math.ceil(lm.w);
    c.height = Math.ceil(lm.h) + 8;
    const g = c.getContext('2d')!;
    const base = BASE[lm.kind];
    if (base) { g.fillStyle = base; g.fillRect(4, 4, lm.w - 8, lm.h - 8); g.beginPath(); g.rect(4, 4, lm.w - 8, lm.h - 8); stroke(g, 1.6); }
    PAINT[lm.kind](g, lm.w, lm.h, seeded(lm.x * 31 + lm.y * 17 + lm.w), lm.label);
    sprites.set(key, c);
  }
  return c;
}
