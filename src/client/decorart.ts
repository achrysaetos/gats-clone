import { blotch, canvas, seeded } from './grain.ts';
import { FLOOR, INK } from './palette.ts';
import type { DecorPlan, Mark } from './decor.ts';
import { paintVignettes } from './vignetteart.ts';
import { paintDistrict } from './districtart.ts';

/**
 * Bakes a map's floor marks (decor.ts) into the cached ground layer, so they cost nothing per frame: painted bays and hazard
 * stripes, cable runs, tyre marks, puddles, litter, sandbag remnants, pallets, rubble and wall-foot grime. Everything hugs a wall,
 * sits low in contrast against `FLOOR.base` and never touches a lane (docs/art/STYLE.md: busy floors that compete
 * with players are forbidden). Only the fixtures themselves are loud.
 */

const TAU = Math.PI * 2;
const GUNMETAL = '#4f5560', GUNMETAL_DARK = '#3d4450', KHAKI_DARK = '#978562', PLANK = '#7a5a3a', PLANK_FACE = '#4e3a26';
const CONTACT = 'rgba(20, 24, 32, 0.3)';

// Seven-segment stencil glyphs (the gaps between segments read as the bridges of a spray stencil). Same letters as the floor's.
const SEGS: Record<string, string> = {
  '0': 'abcdef', '1': 'bc', '2': 'abdeg', '3': 'abcdg', '4': 'bcfg', '5': 'acdfg', '6': 'acdefg', '7': 'abc', '8': 'abcdefg', '9': 'abcdfg',
  A: 'abcefg', C: 'adef', E: 'adefg', F: 'aefg', H: 'bcefg', L: 'def', P: 'abefg', U: 'bcdef', b: 'cdefg', d: 'bcdeg', J: 'bcde',
};
export const glyphWidth = (text: string, h: number): number => text.length * (h * 0.52 + h * 0.15 * 1.6);

/** Fills `text` as stencil glyphs with its top-left at (x, y), `h` tall; the caller sets the fill. */
export function stampGlyphs(g: CanvasRenderingContext2D, text: string, x: number, y: number, h: number): void {
  const w = h * 0.52, t = Math.max(1.1, h * 0.15), gap = t * 0.45, adv = w + t * 1.6;
  g.beginPath();
  for (const [i, ch] of [...text].entries()) {
    const ox = x + i * adv, segs = SEGS[ch] ?? '';
    const horiz = (yy: number) => g.rect(ox + gap, yy, w - gap * 2, t);
    const vert = (xx: number, y0: number) => g.rect(xx, y0 + gap, t, h / 2 - t - gap * 2 + t / 2);
    if (segs.includes('a')) horiz(y);
    if (segs.includes('g')) horiz(y + h / 2 - t / 2);
    if (segs.includes('d')) horiz(y + h - t);
    if (segs.includes('f')) vert(ox, y);
    if (segs.includes('b')) vert(ox + w - t, y);
    if (segs.includes('e')) vert(ox, y + h / 2 - t / 2);
    if (segs.includes('c')) vert(ox + w - t, y + h / 2 - t / 2);
  }
  g.fill();
}

let stripeTile: HTMLCanvasElement | null = null;
function stripes(g: CanvasRenderingContext2D): CanvasPattern {
  if (!stripeTile) {
    const [c, p] = canvas(20);
    stripeTile = c;
    p.fillStyle = '#8a7c48';
    p.fillRect(0, 0, 20, 20);
    p.fillStyle = '#2b2e34';
    p.beginPath();
    for (const o of [-20, 0, 20]) { p.moveTo(o, 20); p.lineTo(o + 10, 20); p.lineTo(o + 30, 0); p.lineTo(o + 20, 0); p.closePath(); }
    p.fill();
  }
  return g.createPattern(stripeTile, 'repeat')!;
}

function chunk(g: CanvasRenderingContext2D, rand: () => number, r: number) {
  const n = 5 + Math.floor(rand() * 2);
  g.beginPath();
  for (let i = 0; i < n; i++) {
    const a = (i / n) * TAU + rand() * 0.4, k = r * (0.6 + rand() * 0.5);
    if (i === 0) g.moveTo(Math.cos(a) * k, Math.sin(a) * k); else g.lineTo(Math.cos(a) * k, Math.sin(a) * k);
  }
  g.closePath();
}

function blob(g: CanvasRenderingContext2D, rand: () => number, x: number, y: number, r: number) {
  const n = 9, pts: [number, number][] = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * TAU, k = r * (0.62 + rand() * 0.5);
    pts.push([x + Math.cos(a) * k * 1.25, y + Math.sin(a) * k]);
  }
  g.beginPath();
  g.moveTo((pts[0]![0] + pts[n - 1]![0]) / 2, (pts[0]![1] + pts[n - 1]![1]) / 2);
  for (let i = 0; i < n; i++) {
    const p = pts[i]!, q = pts[(i + 1) % n]!;
    g.quadraticCurveTo(p[0], p[1], (p[0] + q[0]) / 2, (p[1] + q[1]) / 2);
  }
  g.closePath();
  g.fill();
}

const inkStroke = (g: CanvasRenderingContext2D, w: number) => { g.lineWidth = w; g.lineJoin = 'round'; g.strokeStyle = INK; g.stroke(); };

function bay(g: CanvasRenderingContext2D, m: Extract<Mark, { k: 'bay' }>, rand: () => number) {
  g.save();
  g.translate(m.x, m.y);
  g.rotate(m.rot);
  g.globalAlpha = 0.46;
  g.fillStyle = FLOOR.wear;
  const w = 78, h = 44, t = 3.4, arm = 16;
  for (const [cx, cy, sx, sy] of [[-w / 2, -h / 2, 1, 1], [w / 2, -h / 2, -1, 1], [-w / 2, h / 2, 1, -1], [w / 2, h / 2, -1, -1]] as const) {
    g.fillRect(Math.min(cx, cx + sx * arm), Math.min(cy, cy + sy * t), arm, t);
    g.fillRect(Math.min(cx, cx + sx * t), Math.min(cy, cy + sy * arm), t, arm);
  }
  const th = 20;
  stampGlyphs(g, m.text, -glyphWidth(m.text, th) / 2, -th / 2, th);
  // Boot wear: floor-coloured nicks out of the paint.
  g.globalAlpha = 0.9;
  g.fillStyle = FLOOR.base;
  for (let i = 0; i < 16; i++) g.fillRect((rand() - 0.5) * w, (rand() - 0.5) * h, 1 + rand() * 3, 1 + rand() * 1.5);
  g.restore();
}

function sandbag(g: CanvasRenderingContext2D, m: Extract<Mark, { k: 'sandbag' }>) {
  g.save();
  g.translate(m.x, m.y);
  g.rotate(m.rot);
  g.fillStyle = CONTACT;
  g.beginPath(); g.ellipse(4, 8, 28, 9, 0, 0, TAU); g.fill();
  for (const [x, y, s] of [[-12, 2, 1], [11, 3, 1], [0, -6, 0.9]] as const) {
    g.beginPath();
    g.ellipse(x, y, 11 * s, 6.5 * s, 0.08, 0, TAU);
    g.fillStyle = KHAKI_DARK;
    g.fill();
    g.beginPath();
    g.ellipse(x - 2.5, y - 1.8, 6 * s, 2.6 * s, 0.08, 0, TAU);
    g.fillStyle = 'rgba(255, 255, 255, 0.22)';
    g.fill();
    g.beginPath();
    g.ellipse(x, y, 11 * s, 6.5 * s, 0.08, 0, TAU);
    inkStroke(g, 1.6);
  }
  g.restore();
}

function pallet(g: CanvasRenderingContext2D, m: Extract<Mark, { k: 'pallet' }>) {
  g.save();
  g.translate(m.x, m.y);
  g.rotate(m.rot);
  const w = 46, h = 34, face = 5;
  g.fillStyle = CONTACT;
  g.fillRect(-w / 2 + 5, -h / 2 + 6, w, h + face);
  g.fillStyle = PLANK_FACE;
  g.fillRect(-w / 2, h / 2 - 2, w, face + 2);
  g.fillStyle = PLANK;
  const boards = 5, bw = (w - 4 * 1.5) / boards;
  for (let i = 0; i < boards; i++) {
    const x = -w / 2 + i * (bw + 1.5);
    g.fillStyle = PLANK;
    g.fillRect(x, -h / 2, bw, h);
    g.fillStyle = 'rgba(255, 255, 255, 0.16)';
    g.fillRect(x, -h / 2, bw, 3);
    g.fillStyle = 'rgba(10, 12, 16, 0.3)';
    g.fillRect(x + bw - 2.5, -h / 2, 2.5, h);
  }
  g.beginPath(); g.rect(-w / 2, -h / 2, w, h + face);
  inkStroke(g, 1.8);
  g.beginPath();
  for (let i = 1; i < boards; i++) { const x = -w / 2 + i * (bw + 1.5) - 0.75; g.moveTo(x, -h / 2); g.lineTo(x, h / 2); }
  inkStroke(g, 1.2);
  g.restore();
}

function debris(g: CanvasRenderingContext2D, m: Extract<Mark, { k: 'debris' }>, rand: () => number) {
  g.save();
  g.translate(m.x, m.y);
  g.rotate(m.rot);
  g.fillStyle = CONTACT;
  g.beginPath(); g.ellipse(2, 3, 12, 6, 0, 0, TAU); g.fill();
  for (const [x, y, r] of [[-5, 1, 5.5], [5, -2, 4.5], [2, 5, 3.8], [-1, -5, 3]] as const) {
    g.save();
    g.translate(x, y);
    g.rotate(rand() * TAU);
    chunk(g, rand, r);
    g.fillStyle = rand() < 0.5 ? '#5a554d' : '#75705f';
    g.fill();
    g.fillStyle = 'rgba(255, 255, 255, 0.2)';
    g.beginPath(); g.moveTo(-r * 0.6, -r * 0.2); g.lineTo(r * 0.1, -r * 0.7); g.lineTo(r * 0.3, -r * 0.2); g.closePath(); g.fill();
    chunk(g, rand, r);
    inkStroke(g, 1.2);
    g.restore();
  }
  g.restore();
}

function grate(g: CanvasRenderingContext2D, m: Extract<Mark, { k: 'grate' }>) {
  g.fillStyle = CONTACT;
  g.fillRect(m.x - 14, m.y - 7, 32, 20);
  g.fillStyle = '#26282d';
  g.fillRect(m.x - 15, m.y - 9, 30, 18);
  g.fillStyle = '#5c616b';
  for (let i = 0; i < 5; i++) g.fillRect(m.x - 12 + i * 6, m.y - 6, 3, 12);
  g.beginPath(); g.rect(m.x - 15, m.y - 9, 30, 18);
  inkStroke(g, 2);
}

function manhole(g: CanvasRenderingContext2D, m: Extract<Mark, { k: 'manhole' }>) {
  g.fillStyle = CONTACT; g.beginPath(); g.arc(m.x + 2, m.y + 3, 17, 0, TAU); g.fill();
  discAt2(g, m.x, m.y, 16, '#464a53', 2);
  g.strokeStyle = 'rgba(20, 22, 28, 0.55)'; g.lineWidth = 1.5;
  g.beginPath(); g.arc(m.x, m.y, 10, 0, TAU); g.moveTo(m.x - 10, m.y); g.lineTo(m.x + 10, m.y); g.moveTo(m.x, m.y - 10); g.lineTo(m.x, m.y + 10); g.stroke();
}
function discAt2(g: CanvasRenderingContext2D, x: number, y: number, r: number, fill: string, w: number) { g.beginPath(); g.arc(x, y, r, 0, TAU); g.fillStyle = fill; g.fill(); inkStroke(g, w); }

/** A run of lane arrows in worn paint: the same arrow `n` times along `rot`, `step` apart, chipped like the rest of the paint. */
function arrows(g: CanvasRenderingContext2D, m: Extract<Mark, { k: 'arrows' }>, rand: () => number) {
  g.save();
  g.translate(m.x, m.y);
  g.rotate(m.rot);
  g.globalAlpha = 0.5;
  g.fillStyle = FLOOR.wear;
  for (let i = 0; i < m.n; i++) {
    const o = i * m.step;
    g.beginPath();
    g.moveTo(o - 34, -7); g.lineTo(o + 6, -7); g.lineTo(o + 6, -17); g.lineTo(o + 38, 0); g.lineTo(o + 6, 17); g.lineTo(o + 6, 7); g.lineTo(o - 34, 7);
    g.closePath();
    g.fill();
  }
  g.globalAlpha = 0.9;
  g.fillStyle = FLOOR.base;
  for (let i = 0; i < m.n * 10; i++) g.fillRect(-36 + rand() * ((m.n - 1) * m.step + 76), (rand() - 0.5) * 30, 1 + rand() * 3, 1 + rand() * 1.6);
  g.restore();
}

function cable(g: CanvasRenderingContext2D, m: Extract<Mark, { k: 'cable' }>) {
  g.lineCap = 'round';
  g.lineJoin = 'round';
  const path = () => { g.beginPath(); g.moveTo(m.pts[0]![0], m.pts[0]![1]); for (let i = 1; i < m.pts.length; i++) g.lineTo(m.pts[i]![0], m.pts[i]![1]); };
  path(); g.strokeStyle = 'rgba(20, 22, 28, 0.9)'; g.lineWidth = 5; g.stroke();
  path(); g.strokeStyle = '#3a3e46'; g.lineWidth = 2.6; g.stroke();
  path(); g.strokeStyle = 'rgba(255, 255, 255, 0.14)'; g.lineWidth = 1; g.stroke();
  for (const [x, y] of m.boxes) {
    g.fillStyle = CONTACT;
    g.fillRect(x - 6, y - 3, 15, 12);
    g.fillStyle = GUNMETAL;
    g.fillRect(x - 7, y - 5, 14, 10);
    g.fillStyle = 'rgba(255, 255, 255, 0.22)';
    g.fillRect(x - 7, y - 5, 14, 2.4);
    g.fillStyle = GUNMETAL_DARK;
    g.fillRect(x - 7, y + 1.6, 14, 3.4);
    g.beginPath(); g.rect(x - 7, y - 5, 14, 10);
    inkStroke(g, 1.6);
  }
  g.lineCap = 'butt';
}

/** A district's name stencilled big on the floor, worn like the other paint. */
function zoneWord(g: CanvasRenderingContext2D, m: Extract<Mark, { k: 'zone' }>) {
  g.save();
  g.translate(m.x, m.y);
  g.rotate(m.rot);
  g.globalAlpha = 0.5;
  g.fillStyle = FLOOR.wear;
  g.font = '800 40px "Barlow Condensed", "Arial Narrow", sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  (g as unknown as { letterSpacing: string }).letterSpacing = '5px';
  g.fillText(m.text, 0, 0);
  // A painted bar under the word, broken by boot wear.
  g.fillRect(-g.measureText(m.text).width / 2, 26, g.measureText(m.text).width, 4);
  g.restore();
}

/** A row of parking stalls: painted dividers with a kerb stop in each. */
function stalls(g: CanvasRenderingContext2D, m: Extract<Mark, { k: 'stalls' }>, rand: () => number) {
  g.save();
  g.translate(m.x, m.y);
  g.rotate(m.rot);
  const sw = 26, sh = 52, total = m.n * sw;
  g.globalAlpha = 0.46;
  g.fillStyle = FLOOR.wear;
  for (let i = 0; i <= m.n; i++) g.fillRect(-total / 2 + i * sw - 1.5, -sh / 2, 3, sh);
  g.fillRect(-total / 2, -sh / 2 - 1.5, total, 3);
  g.globalAlpha = 0.6;
  for (let i = 0; i < m.n; i++) {
    g.fillStyle = '#4a4741';
    g.fillRect(-total / 2 + i * sw + 5, sh / 2 - 12, sw - 10, 5);
    g.fillStyle = 'rgba(255, 255, 255, 0.2)';
    g.fillRect(-total / 2 + i * sw + 5, sh / 2 - 12, sw - 10, 1.6);
  }
  g.globalAlpha = 0.9;
  g.fillStyle = FLOOR.base;
  for (let i = 0; i < 14; i++) g.fillRect((rand() - 0.5) * total, (rand() - 0.5) * sh, 1 + rand() * 3, 1 + rand() * 1.5);
  g.restore();
}

/** A patch of gravel: speckle in two stones tones, hard-edged, so the checkpoint's ground differs from concrete. */
function gravel(g: CanvasRenderingContext2D, m: Extract<Mark, { k: 'gravel' }>, rand: () => number) {
  g.fillStyle = 'rgba(70, 66, 58, 0.2)';
  g.beginPath(); g.ellipse(m.x, m.y, m.r * 1.2, m.r * 0.8, 0, 0, TAU); g.fill();
  for (let i = 0; i < m.r * 2.4; i++) {
    const a = rand() * TAU, d = Math.sqrt(rand());
    g.fillStyle = rand() < 0.5 ? 'rgba(150, 142, 126, 0.7)' : 'rgba(40, 38, 34, 0.6)';
    g.fillRect(m.x + Math.cos(a) * d * m.r * 1.15, m.y + Math.sin(a) * d * m.r * 0.75, 2 + rand() * 2, 1.5 + rand() * 1.5);
  }
}

/** Bakes the plan's floor marks. `g` is the ground layer's context in world units. */
export function paintDecor(g: CanvasRenderingContext2D, plan: DecorPlan): void {
  const rand = seeded(plan.size ^ 0x5eed);
  g.save();
  // Each district's floor treatment: a wide soft wash of its own tint, so the corners differ even before a mark is read.
  for (const t of plan.tints) blotch(g, t.x, t.y, t.r, t.rgb, t.a);
  // A lit fixture lights the floor around it even where the lighting pass is off: one faint, wide pool each.
  for (const f of plan.fixtures) {
    if (f.kind === 'lamp' || f.kind === 'work' || f.kind === 'window' || f.kind === 'tube' || f.kind === 'boothlamp' || f.kind === 'lanepost' || f.kind === 'uplight') {
      blotch(g, f.lx + Math.cos(f.angle) * 40, f.ly + Math.sin(f.angle) * 40, f.kind === 'work' ? 170 : 130, '255, 196, 120', 0.07);
    }
  }
  for (const m of plan.marks) {
    g.globalAlpha = 1;
    switch (m.k) {
      case 'grime': {
        g.fillStyle = 'rgba(46, 43, 39, 0.26)';
        g.beginPath();
        const n = 7;
        for (let i = 0; i <= n; i++) g.lineTo(m.x - m.w / 2 + (m.w * i) / n, m.y - m.h / 2 + rand() * m.h * 0.35);
        for (let i = n; i >= 0; i--) g.lineTo(m.x - m.w / 2 + (m.w * i) / n, m.y + m.h / 2 - rand() * m.h * 0.35);
        g.closePath();
        g.fill();
        break;
      }
      case 'bay': bay(g, m, rand); break;
      case 'stripe':
        g.globalAlpha = 0.5;
        g.fillStyle = stripes(g);
        g.fillRect(m.x, m.y, m.w, m.h);
        break;
      case 'cable': cable(g, m); break;
      case 'tire': {
        g.save();
        g.translate(m.x, m.y);
        g.rotate(m.rot);
        g.strokeStyle = 'rgba(30, 28, 26, 0.17)';
        g.lineWidth = 4.5;
        for (const off of [-7, 7]) {
          g.beginPath();
          g.moveTo(-m.len / 2, off);
          g.quadraticCurveTo(0, off + (off < 0 ? -9 : 9) * 0.7, m.len / 2, off);
          g.stroke();
        }
        g.restore();
        break;
      }
      case 'puddle': {
        g.fillStyle = 'rgba(22, 24, 30, 0.42)';
        blob(g, rand, m.x, m.y, m.r);
        g.fillStyle = 'rgba(150, 168, 190, 0.16)';
        blob(g, rand, m.x - m.r * 0.18, m.y - m.r * 0.2, m.r * 0.55);
        break;
      }
      case 'oil': {
        g.fillStyle = 'rgba(26, 24, 30, 0.14)';
        blob(g, rand, m.x, m.y, m.r * 1.3);
        g.fillStyle = 'rgba(20, 18, 24, 0.2)';
        blob(g, rand, m.x + 2, m.y, m.r * 0.8);
        break;
      }
      case 'paper': {
        g.save();
        g.translate(m.x, m.y);
        g.rotate(m.rot);
        g.fillStyle = 'rgba(214, 208, 190, 0.7)';
        g.fillRect(-4, -3, 9, 6);
        g.fillStyle = 'rgba(60, 56, 50, 0.3)';
        g.fillRect(-3, -0.5, 7, 1);
        g.restore();
        break;
      }
      case 'leaves': {
        g.save();
        g.translate(m.x, m.y);
        g.rotate(m.rot);
        const hues = ['#8a6a3a', '#6c7356', '#a8552e'];
        for (let i = 0; i < 4; i++) {
          g.fillStyle = hues[i % 3]!;
          g.globalAlpha = 0.6;
          g.beginPath(); g.ellipse((rand() - 0.5) * 16, (rand() - 0.5) * 10, 3.2, 1.8, rand() * TAU, 0, TAU); g.fill();
        }
        g.restore();
        break;
      }
      case 'sandbag': sandbag(g, m); break;
      case 'pallet': pallet(g, m); break;
      case 'debris': debris(g, m, rand); break;
      case 'grate': grate(g, m); break;
      case 'manhole': manhole(g, m); break;
      case 'arrows': arrows(g, m, rand); break;
      case 'zone': zoneWord(g, m); break;
      case 'district': paintDistrict(g, m.plan, m.label, m.x, m.y, m.rot, m.scale, rand); break;
      case 'stalls': stalls(g, m, rand); break;
      case 'gravel': gravel(g, m, rand); break;
    }
  }
  paintVignettes(g, plan.vignettes);
  g.restore();
}
