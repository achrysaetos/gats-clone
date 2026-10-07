import { shade } from '../palette.ts';
import type { Solid } from '../tilt.ts';
import { C, CEL, cornerRadii, hash, isBasin, isShell, openSides, roundedPath, type Open } from './parkkit.ts';

/**
 * The Park's solids, each painted whole into its sprite: a front face hanging below the south edge, a top face with its two
 * cel steps, and the ink outline on the sides that face open air (neighbours of the same stuff run together unbroken).
 */
type G = CanvasRenderingContext2D;
type Rect = { x: number; y: number; w: number; h: number };

/** Faces' heights; tilt.ts reads these for the shadow and the sprite bounds. */
export const PARK_FACE = { hedge: 18, pond: 8, parkstone: 16, trunk: 14, bench: 9, play: 13 } as const;

const rects = (g: G, list: readonly Rect[]) => { g.beginPath(); for (const r of list) g.rect(r.x, r.y, r.w, r.h); };

/** Strips just inside each open side of a rect, `t` thick, as rects. */
function strips(s: Rect, o: Open, t: number): Record<'n' | 'e' | 's' | 'w', Rect[]> {
  return {
    n: o.spans.n.map(([a, b]) => ({ x: s.x + a, y: s.y, w: b - a, h: t })),
    s: o.spans.s.map(([a, b]) => ({ x: s.x + a, y: s.y + s.h - t, w: b - a, h: t })),
    w: o.spans.w.map(([a, b]) => ({ x: s.x, y: s.y + a, w: t, h: b - a })),
    e: o.spans.e.map(([a, b]) => ({ x: s.x + s.w - t, y: s.y + a, w: t, h: b - a })),
  };
}

/** The ink line round a top face, only where it meets open air, with the corners rounded where two open sides meet. */
function outline(g: G, s: Rect, o: Open, r: number, width = 2) {
  g.save();
  g.beginPath();
  const reach = r + 3;
  for (const [side, list] of Object.entries(strips({ x: s.x - 3, y: s.y - 3, w: s.w + 6, h: s.h + 6 }, o, 6)) as ['n' | 'e' | 's' | 'w', Rect[]][]) {
    void side;
    for (const q of list) g.rect(q.x, q.y, q.w, q.h);
  }
  if (o.n && o.w) g.rect(s.x - 3, s.y - 3, reach, reach);
  if (o.n && o.e) g.rect(s.x + s.w - reach + 3, s.y - 3, reach, reach);
  if (o.s && o.e) g.rect(s.x + s.w - reach + 3, s.y + s.h - reach + 3, reach, reach);
  if (o.s && o.w) g.rect(s.x - 3, s.y + s.h - reach + 3, reach, reach);
  g.clip();
  g.beginPath();
  roundedPath(g, s.x, s.y, s.w, s.h, cornerRadii(o, r));
  g.strokeStyle = C.ink;
  g.lineWidth = width;
  g.lineJoin = 'round';
  g.stroke();
  g.restore();
}

/** Light on the north and west open edges, shade on the south and east: the two hard steps every top face wears. */
function celBands(g: G, s: Rect, o: Open, e = 4) {
  const st = strips(s, o, e);
  g.fillStyle = CEL.light;
  rects(g, [...st.n, ...st.w]);
  g.fill();
  g.fillStyle = CEL.dark;
  rects(g, [...st.s, ...st.e]);
  g.fill();
}

/** A front-face rect over each open stretch of the south edge. */
function southFace(g: G, s: Rect, o: Open, fh: number, fill: string, low: string) {
  const list = o.spans.s.map(([a, b]) => ({ x: s.x + a, y: s.y + s.h, w: b - a, h: fh }));
  g.fillStyle = fill;
  rects(g, list);
  g.fill();
  g.fillStyle = 'rgba(255, 252, 230, 0.12)';
  rects(g, list.map((q) => ({ ...q, h: 2 })));
  g.fill();
  g.fillStyle = low;
  rects(g, list.map((q) => ({ ...q, y: q.y + fh * 0.66, h: fh * 0.34 })));
  g.fill();
  g.strokeStyle = C.ink;
  g.lineWidth = 2;
  g.lineJoin = 'miter';
  g.beginPath();
  for (const q of list) {
    g.moveTo(q.x, q.y); g.lineTo(q.x, q.y + fh); g.lineTo(q.x + q.w, q.y + fh); g.lineTo(q.x + q.w, q.y);
  }
  g.stroke();
  return list;
}

/* ---------------------------------------------------------------- hedge */

function hedge(g: G, s: Solid) {
  const o = openSides('hedge', s), fh = PARK_FACE.hedge, r = 10;
  const { x, y, w, h } = s;
  // The front: a thick leafy skirt with a scalloped hem, drawn open so a neighbour's side shows no seam.
  const bot = y + h + fh;
  g.beginPath();
  g.moveTo(x, y + h - 6);
  g.lineTo(x, bot - 8);
  const n = Math.max(1, Math.round(w / 14));
  for (let i = 0; i < n; i++) {
    const a = x + (w * i) / n, b = x + (w * (i + 1)) / n;
    g.quadraticCurveTo((a + b) / 2, bot + 4, b, bot - 8);
  }
  g.lineTo(x + w, y + h - 6);
  g.closePath();
  g.fillStyle = C.hedgeFront;
  g.fill();
  g.save();
  g.clip();
  g.fillStyle = C.hedgeFrontLo;
  g.fillRect(x, y + h + fh * 0.55, w, fh);
  // Leaf clumps down the front, lit on the upper left.
  for (let i = 0; i < n * 2; i++) {
    const cx = x + (w * (i + 0.5)) / (n * 2), cy = y + h + 5 + hash(x + i, y, 3) * (fh - 9);
    g.fillStyle = C.hedgeLo;
    g.beginPath(); g.arc(cx + 1, cy + 1, 5, 0, 6.3); g.fill();
    g.fillStyle = C.hedge;
    g.beginPath(); g.arc(cx, cy, 4.5, 0, 6.3); g.fill();
  }
  g.restore();
  g.strokeStyle = C.ink;
  g.lineWidth = 2;
  g.lineJoin = 'round';
  g.beginPath();
  if (o.w) { g.moveTo(x, y + h); g.lineTo(x, bot - 8); } else g.moveTo(x, bot - 8);
  for (let i = 0; i < n; i++) {
    const a = x + (w * i) / n, b = x + (w * (i + 1)) / n;
    g.quadraticCurveTo((a + b) / 2, bot + 4, b, bot - 8);
  }
  if (o.e) g.lineTo(x + w, y + h);
  g.stroke();

  // The top: a rounded block of clipped leaf clumps.
  g.save();
  g.beginPath();
  roundedPath(g, x, y, w, h, cornerRadii(o, r));
  g.clip();
  g.fillStyle = C.hedge;
  g.fillRect(x, y, w, h);
  const step = 13;
  const blobs: [number, number, number][] = [];
  for (let gy = y - 4; gy < y + h + 8; gy += step) {
    for (let gx = x - 4; gx < x + w + 8; gx += step) {
      const k = hash(gx, gy, 11);
      blobs.push([gx + (hash(gx, gy, 5) - 0.5) * 8 + (((gy - y) / step) % 2) * 5, gy + (hash(gx, gy, 6) - 0.5) * 8, 7 + k * 4]);
    }
  }
  for (const [bx, by, br] of blobs) {
    g.fillStyle = C.hedgeLo;
    g.beginPath(); g.arc(bx + 2.2, by + 3, br, 0, 6.3); g.fill();
    g.fillStyle = C.hedge;
    g.beginPath(); g.arc(bx, by, br, 0, 6.3); g.fill();
  }
  for (const [bx, by, br] of blobs) {
    if (hash(bx, by, 9) > 0.62) continue;
    g.fillStyle = C.hedgeHi;
    g.beginPath(); g.arc(bx - 2.2, by - 3, br * 0.52, 0, 6.3); g.fill();
  }
  // A few pale blossoms, a hedge that someone looks after.
  g.fillStyle = C.cream;
  for (const [bx, by] of blobs) if (hash(bx, by, 21) > 0.97) { g.fillRect(bx - 1, by - 1, 2.4, 2.4); }
  celBands(g, s, o, 4);
  g.restore();
  outline(g, s, o, r);
}

/* ----------------------------------------------------------------- pond */

/** Water in a stone-edged basin: shared by the ponds and the fountain's ring. */
function basin(g: G, s: Solid, material: 'pond' | 'parkstone', cope: number, fh: number) {
  const o = openSides(material, s);
  const { x, y, w, h } = s;
  if (o.s) {
    const list = southFace(g, s, o, fh, C.stoneFront, 'rgba(10, 14, 18, 0.3)');
    // Blocks in the stone face.
    g.strokeStyle = 'rgba(30, 30, 28, 0.45)';
    g.lineWidth = 1;
    g.beginPath();
    for (const q of list) for (let bx = q.x + 25; bx < q.x + q.w - 4; bx += 25) { g.moveTo(bx + 0.5, q.y + 2); g.lineTo(bx + 0.5, q.y + q.h - 1); }
    g.stroke();
  }
  g.fillStyle = C.water;
  g.fillRect(x, y, w, h);
  // The shallows ring the edge, a lighter band the water's own animation sits on top of.
  const sh = strips(s, o, cope + 7);
  g.fillStyle = C.shallow;
  rects(g, [...sh.n, ...sh.e, ...sh.s, ...sh.w]);
  g.fill();
  // Stone coping with a cel step.
  const st = strips(s, o, cope);
  g.fillStyle = C.stone;
  rects(g, [...st.n, ...st.e, ...st.s, ...st.w]);
  g.fill();
  g.fillStyle = C.stoneHi;
  rects(g, [...st.n, ...st.w].map((q) => ({ ...q, h: q.h > q.w ? q.h : q.h * 0.5, w: q.h > q.w ? q.w * 0.5 : q.w })));
  g.fill();
  g.fillStyle = 'rgba(8, 12, 18, 0.22)';
  rects(g, [...st.s, ...st.e].map((q) => ({ x: q.x + (q.h > q.w ? q.w * 0.5 : 0), y: q.y + (q.h > q.w ? 0 : q.h * 0.5), w: q.h > q.w ? q.w * 0.5 : q.w, h: q.h > q.w ? q.h : q.h * 0.5 })));
  g.fill();
  // Joints in the coping.
  g.strokeStyle = 'rgba(40, 38, 32, 0.5)';
  g.lineWidth = 1;
  g.beginPath();
  for (const q of [...st.n, ...st.s]) for (let bx = Math.ceil(q.x / 25) * 25; bx < q.x + q.w - 2; bx += 25) { g.moveTo(bx + 0.5, q.y); g.lineTo(bx + 0.5, q.y + q.h); }
  for (const q of [...st.w, ...st.e]) for (let by = Math.ceil(q.y / 25) * 25; by < q.y + q.h - 2; by += 25) { g.moveTo(q.x, by + 0.5); g.lineTo(q.x + q.w, by + 0.5); }
  g.stroke();
  // Ink where the water meets the coping, and round the outside.
  g.strokeStyle = C.ink;
  g.lineWidth = 1.5;
  g.beginPath();
  if (o.n) for (const [a, b] of o.spans.n) { g.moveTo(x + a, y + cope); g.lineTo(x + b, y + cope); }
  if (o.s) for (const [a, b] of o.spans.s) { g.moveTo(x + a, y + h - cope); g.lineTo(x + b, y + h - cope); }
  if (o.w) for (const [a, b] of o.spans.w) { g.moveTo(x + cope, y + a); g.lineTo(x + cope, y + b); }
  if (o.e) for (const [a, b] of o.spans.e) { g.moveTo(x + w - cope, y + a); g.lineTo(x + w - cope, y + b); }
  g.stroke();
  outline(g, s, o, 0);
}

/* ---------------------------------------------------------------- stone */

function stoneWork(g: G, s: Solid) {
  const { x, y, w, h } = s;
  if (isBasin(s)) { basin(g, s, 'parkstone', 12, PARK_FACE.parkstone); return; }
  const o = openSides('parkstone', s);
  if (w >= 300 && h >= 150) { roof(g, s, o); return; }
  if (w <= 50 && h <= 50 && Math.abs(y + h / 2 - 3000) < 220) { pillar(g, s, o); return; }
  if (w === 100 && h === 100 && !isShell(s)) { planterBed(g, s, o); return; }
  const shell = isShell(s);
  const fh = shell ? 18 : 11;
  const list = southFace(g, s, o, fh, C.stoneFront, 'rgba(10, 14, 18, 0.3)');
  // Fluted columns on a shell's face, plain blocks on a rim.
  g.strokeStyle = 'rgba(30, 30, 28, 0.5)';
  g.lineWidth = shell ? 2 : 1;
  g.beginPath();
  for (const q of list) for (let bx = q.x + (shell ? 12 : 25); bx < q.x + q.w - 3; bx += shell ? 25 : 50) { g.moveTo(bx, q.y + 3); g.lineTo(bx, q.y + q.h - 2); }
  g.stroke();
  g.fillStyle = C.stone;
  g.fillRect(x, y, w, h);
  // Ashlar courses on the top, each block a touch different.
  const bw = 50, bh = 25;
  for (let by = y; by < y + h; by += bh) {
    for (let bx = x - (((by - y) / bh) % 2) * 25; bx < x + w; bx += bw) {
      const k = hash(bx, by, 41);
      const x0 = Math.max(x, bx), x1 = Math.min(x + w, bx + bw);
      if (x1 <= x0) continue;
      g.fillStyle = k > 0.66 ? C.stoneHi : k < 0.25 ? C.stoneLo : C.stone;
      g.globalAlpha = 0.5;
      g.fillRect(x0 + 1, by + 1, x1 - x0 - 2, Math.min(bh, y + h - by) - 2);
      g.globalAlpha = 1;
      if (hash(bx, by, 43) > 0.9) { g.fillStyle = C.moss; g.fillRect(x0 + 3, by + Math.min(bh, y + h - by) - 6, 9, 4); }
    }
  }
  g.strokeStyle = 'rgba(50, 46, 38, 0.55)';
  g.lineWidth = 1;
  g.beginPath();
  for (let by = y + bh; by < y + h - 1; by += bh) { g.moveTo(x, by + 0.5); g.lineTo(x + w, by + 0.5); }
  for (let by = y, row = 0; by < y + h; by += bh, row++) for (let bx = x + (row % 2 ? 25 : 50); bx < x + w - 1; bx += bw) { g.moveTo(bx + 0.5, by); g.lineTo(bx + 0.5, Math.min(by + bh, y + h)); }
  g.stroke();
  celBands(g, s, o, 4);
  outline(g, s, o, 2);
}

/** The stone planter at the heart of the rose garden: a rim round a bed of roses with a sundial stump. */
function planterBed(g: G, s: Solid, o: Open) {
  const { x, y, w, h } = s, cx = x + w / 2, cy = y + h / 2;
  southFace(g, s, o, 14, C.stoneFront, 'rgba(10, 14, 18, 0.3)');
  g.fillStyle = C.stone; g.fillRect(x, y, w, h);
  g.fillStyle = C.stoneHi; g.fillRect(x, y, w, 5); g.fillRect(x, y, 5, h);
  g.fillStyle = C.stoneLo; g.fillRect(x + w - 6, y + 5, 6, h - 5); g.fillRect(x + 5, y + h - 6, w - 5, 6);
  g.fillStyle = '#3b2e22'; g.fillRect(x + 12, y + 12, w - 24, h - 24);
  g.strokeStyle = C.ink; g.lineWidth = 2; g.strokeRect(x + 12, y + 12, w - 24, h - 24);
  for (let i = 0; i < 9; i++) {
    const rx = x + 20 + hash(i, 1, 99) * (w - 40), ry = y + 20 + hash(i, 2, 99) * (h - 40);
    g.fillStyle = '#35552f'; g.beginPath(); g.arc(rx, ry, 7, 0, 6.3); g.fill();
    g.fillStyle = [C.rose, '#e6b2b6', C.cream][i % 3]!; g.beginPath(); g.arc(rx - 1, ry - 1, 3.4, 0, 6.3); g.fill(); g.strokeStyle = 'rgba(28,31,38,0.6)'; g.lineWidth = 1; g.stroke();
  }
  g.fillStyle = C.stoneHi; g.beginPath(); g.arc(cx, cy, 9, 0, 6.3); g.fill(); g.strokeStyle = C.ink; g.lineWidth = 2; g.stroke();
  g.strokeStyle = C.ink; g.lineWidth = 1.6; g.beginPath(); g.moveTo(cx, cy); g.lineTo(cx + 5, cy - 6); g.stroke();
  outline(g, s, o, 3);
}

/** A pale column on a plinth: the posts the rose-garden pergola stands on. */
function pillar(g: G, s: Solid, o: Open) {
  const { x, y, w, h } = s, cx = x + w / 2;
  southFace(g, s, o, 22, '#8a8470', 'rgba(10, 14, 18, 0.3)');
  g.strokeStyle = 'rgba(30, 30, 28, 0.5)'; g.lineWidth = 2;
  g.beginPath(); for (const dx of [-8, 0, 8]) { g.moveTo(cx + dx, y + h + 3); g.lineTo(cx + dx, y + h + 20); } g.stroke();
  g.fillStyle = C.stone; g.fillRect(x + 3, y + 3, w - 6, h - 6);
  g.fillStyle = C.stoneHi; g.fillRect(x + 3, y + 3, w - 6, 5); g.fillRect(x + 3, y + 3, 5, h - 6);
  g.fillStyle = C.stoneLo; g.fillRect(x + w - 10, y + 8, 7, h - 11);
  g.strokeStyle = C.ink; g.lineWidth = 2; g.strokeRect(x + 3, y + 3, w - 6, h - 6);
  g.fillStyle = '#d9d2bd'; g.beginPath(); g.arc(cx, y + h / 2, 9, 0, 6.3); g.fill(); g.stroke();
}

/** The groundsman's shed: terracotta tiles in courses over a plain stone wall. */
function roof(g: G, s: Solid, o: Open) {
  const { x, y, w, h } = s;
  southFace(g, s, o, 20, '#6f6a5a', 'rgba(10, 14, 18, 0.3)');
  g.fillStyle = '#6d8190';
  // A small high window in the wall.
  g.fillStyle = '#26304a';
  g.fillRect(x + w * 0.5 - 14, y + h + 5, 28, 9);
  g.strokeStyle = C.ink; g.lineWidth = 1.5; g.strokeRect(x + w * 0.5 - 14, y + h + 5, 28, 9);
  g.fillStyle = C.rust;
  g.fillRect(x, y, w, h);
  const course = 14;
  for (let ty = y, row = 0; ty < y + h; ty += course, row++) {
    g.fillStyle = row % 2 ? '#b25e34' : '#9d4d2a';
    g.fillRect(x, ty, w, Math.min(course, y + h - ty) - 1);
    g.fillStyle = 'rgba(30, 14, 8, 0.4)';
    g.fillRect(x, ty + Math.min(course, y + h - ty) - 2, w, 2);
    g.strokeStyle = 'rgba(30, 14, 8, 0.35)';
    g.lineWidth = 1;
    g.beginPath();
    for (let tx = x + (row % 2 ? 9 : 0); tx < x + w; tx += 18) { g.moveTo(tx + 0.5, ty); g.lineTo(tx + 0.5, ty + course - 1); }
    g.stroke();
  }
  // The ridge cap along the middle.
  g.fillStyle = '#7a3c22';
  g.fillRect(x, y + h / 2 - 5, w, 10);
  g.fillStyle = 'rgba(255, 240, 210, 0.22)';
  g.fillRect(x, y + h / 2 - 5, w, 3);
  celBands(g, s, o, 5);
  outline(g, s, o, 3);
}

/* ---------------------------------------------------------------- trunk */

function trunk(g: G, s: Solid) {
  const cx = s.x + s.w / 2, cy = s.y + s.h / 2, r = Math.min(s.w, s.h) / 2 - 1, fh = PARK_FACE.trunk;
  // Roots flare over the floor behind the trunk.
  g.fillStyle = C.barkLo;
  for (let i = 0; i < 5; i++) {
    const a = 0.3 + i * 1.25 + hash(s.x, s.y, i) * 0.4;
    g.beginPath();
    g.ellipse(cx + Math.cos(a) * (r + 2), cy + fh * 0.5 + Math.sin(a) * (r * 0.7 + 2), 6 + hash(s.x, i, 8) * 3, 4, a, 0, 6.3);
    g.fill();
  }
  // The side of the trunk, a cylinder lit from the left.
  g.fillStyle = C.bark;
  g.beginPath();
  g.rect(cx - r, cy, r * 2, fh);
  g.ellipse(cx, cy + fh, r, r * 0.55, 0, 0, Math.PI);
  g.fill();
  g.save();
  g.clip();
  g.fillStyle = C.barkLo;
  g.fillRect(cx + r * 0.25, cy, r, fh + r);
  g.fillStyle = C.barkHi;
  g.fillRect(cx - r, cy, r * 0.28, fh + r);
  g.strokeStyle = 'rgba(30, 20, 12, 0.5)';
  g.lineWidth = 1.5;
  g.beginPath();
  for (let i = 0; i < 4; i++) { const bx = cx - r * 0.55 + i * r * 0.4; g.moveTo(bx, cy + 2); g.lineTo(bx + 1, cy + fh + 3); }
  g.stroke();
  g.restore();
  g.strokeStyle = C.ink;
  g.lineWidth = 2;
  g.beginPath();
  g.moveTo(cx - r, cy); g.lineTo(cx - r, cy + fh);
  g.ellipse(cx, cy + fh, r, r * 0.55, 0, Math.PI, 0, true);
  g.lineTo(cx + r, cy);
  g.stroke();
  // The top: bark with a worn crown and the stubs of limbs round its rim.
  g.fillStyle = C.barkHi;
  g.beginPath(); g.arc(cx, cy, r, 0, 6.3); g.fill();
  g.fillStyle = C.bark;
  g.beginPath(); g.arc(cx + 2, cy + 3, r * 0.78, 0, 6.3); g.fill();
  g.fillStyle = C.barkLo;
  g.beginPath(); g.arc(cx + 3, cy + 4, r * 0.34, 0, 6.3); g.fill();
  g.fillStyle = C.barkHi;
  g.beginPath(); g.arc(cx - r * 0.3, cy - r * 0.4, r * 0.18, 0, 6.3); g.fill();
  g.fillStyle = CEL.dark;
  g.beginPath(); g.arc(cx, cy, r, -0.3, 2.4); g.arc(cx, cy, r - 5, 2.4, -0.3, true); g.closePath(); g.fill();
  g.strokeStyle = C.ink;
  g.lineWidth = 2;
  g.beginPath(); g.arc(cx, cy, r, 0, 6.3); g.stroke();
  g.fillStyle = '#d9c9a4';
  g.beginPath(); g.arc(cx - r * 0.38, cy - r * 0.42, 1.6, 0, 6.3); g.fill();
  // Two small secrets on the bark. One tree carries a heart and initials, another a fairy door.
  if (s.x === 500 && s.y === 4100) {
    g.fillStyle = '#2a1c10';
    g.beginPath(); g.moveTo(cx, cy + 11); g.bezierCurveTo(cx - 9, cy + 4, cx - 5, cy - 1, cx, cy + 3); g.bezierCurveTo(cx + 5, cy - 1, cx + 9, cy + 4, cx, cy + 11); g.fill();
    g.font = 'bold 7px sans-serif'; g.textAlign = 'center'; g.fillText('M+J', cx, cy + 20);
  }
  if (s.x === 1400 && s.y === 2600) {
    g.fillStyle = '#c0522e'; g.beginPath(); g.moveTo(cx - 5, cy + 18); g.lineTo(cx - 5, cy + 8); g.quadraticCurveTo(cx, cy + 1, cx + 5, cy + 8); g.lineTo(cx + 5, cy + 18); g.closePath(); g.fill();
    g.strokeStyle = C.ink; g.lineWidth = 1.4; g.stroke();
    g.fillStyle = '#ffe08a'; g.fillRect(cx + 2, cy + 13, 1.6, 1.6);
  }
}

/* ---------------------------------------------------------------- bench */

function bench(g: G, s: Solid) {
  const o = openSides('bench', s), fh = PARK_FACE.bench;
  const { x, y, w, h } = s;
  if (w >= 120 && h >= 80) { picnicTable(g, s, o); return; }
  const long = w >= h;
  southFace(g, s, o, fh, C.woodLo, 'rgba(10, 14, 18, 0.3)');
  // Iron legs under the front edge.
  g.fillStyle = C.iron;
  const legs = long ? [x + 9, x + w - 15] : [x + 6, x + w - 12];
  const along = long ? legs.map((lx) => [lx, y + h, 6, fh]) : [[x + 6, y + h, 6, fh], [x + w - 12, y + h, 6, fh]];
  for (const [lx, ly, lw, lh] of along) g.fillRect(lx!, ly!, lw!, lh!);
  g.fillStyle = C.wood;
  g.fillRect(x, y, w, h);
  // Slats run the long way, with the gaps dark.
  const n = long ? 4 : 4;
  g.fillStyle = C.woodHi;
  for (let i = 0; i < n; i++) {
    const t = ((i + 0.5) / n);
    if (long) g.fillRect(x + 2, y + 2 + (h - 4) * (i / n), w - 4, (h - 4) / n - 2);
    else g.fillRect(x + 2 + (w - 4) * (i / n), y + 2, (w - 4) / n - 2, h - 4);
    void t;
  }
  g.fillStyle = 'rgba(8, 10, 14, 0.4)';
  for (let i = 1; i < n; i++) {
    if (long) g.fillRect(x + 1, y + 2 + (h - 4) * (i / n) - 2, w - 2, 2);
    else g.fillRect(x + 2 + (w - 4) * (i / n) - 2, y + 1, 2, h - 2);
  }
  // Iron end frames over the slats.
  g.fillStyle = C.iron;
  if (long) { g.fillRect(x + 5, y, 6, h); g.fillRect(x + w - 11, y, 6, h); } else { g.fillRect(x, y + 5, w, 6); g.fillRect(x, y + h - 11, w, 6); }
  celBands(g, s, o, 3);
  outline(g, s, o, 2);
}

/** A picnic table: a checked cloth down the middle, a plank bench along each long side. */
function picnicTable(g: G, s: Solid, o: Open) {
  const { x, y, w, h } = s, fh = PARK_FACE.bench + 3;
  southFace(g, s, o, fh, C.woodLo, 'rgba(10, 14, 18, 0.3)');
  g.fillStyle = C.iron;
  for (const lx of [x + 14, x + w - 22]) g.fillRect(lx, y + h, 8, fh);
  g.fillStyle = C.wood; g.fillRect(x, y, w, h);
  for (const by of [y, y + h - 20]) { g.fillStyle = C.woodHi; g.fillRect(x + 2, by + 2, w - 4, 16); g.strokeStyle = C.ink; g.lineWidth = 1.8; g.strokeRect(x + 2, by + 2, w - 4, 16); }
  g.fillStyle = '#e2dccb'; g.fillRect(x + 8, y + 22, w - 16, h - 44);
  g.fillStyle = 'rgba(180, 82, 74, 0.7)';
  for (let j = 0; j < 2; j++) for (let i = 0; i < Math.floor((w - 16) / 12); i++) if ((i + j) % 2 === 0) g.fillRect(x + 8 + i * 12, y + 22 + j * 12, 12, 12);
  g.strokeStyle = C.ink; g.lineWidth = 1.8; g.strokeRect(x + 8, y + 22, w - 16, h - 44);
  // A jam jar and a plate of something, left standing.
  g.fillStyle = '#b0372e'; g.beginPath(); g.arc(x + w * 0.3, y + h / 2, 4.5, 0, 6.3); g.fill(); g.stroke();
  g.fillStyle = '#f2eee0'; g.beginPath(); g.arc(x + w * 0.62, y + h / 2, 6.5, 0, 6.3); g.fill(); g.stroke();
  celBands(g, s, o, 3);
  outline(g, s, o, 3);
}

/* ----------------------------------------------------------- playground */

function play(g: G, s: Solid) {
  const o = openSides('play', s), fh = PARK_FACE.play;
  const { x, y, w, h } = s;
  if (w >= h * 4) { swingFrame(g, s, o, fh); return; }
  if (h >= w * 2.5 && w >= 80) { slide(g, s, o, fh); return; }
  seesaw(g, s, o, fh);
}

function swingFrame(g: G, s: Solid, o: Open, fh: number) {
  const { x, y, w, h } = s;
  southFace(g, s, o, fh, '#2f5c59', 'rgba(10, 14, 18, 0.3)');
  // X-braces on the A-frame legs at each end.
  g.strokeStyle = 'rgba(14, 22, 26, 0.7)';
  g.lineWidth = 2;
  g.beginPath();
  for (const lx of [x + 4, x + w - 32]) { g.moveTo(lx, y + h + 1); g.lineTo(lx + 28, y + h + fh - 1); g.moveTo(lx + 28, y + h + 1); g.lineTo(lx, y + h + fh - 1); }
  g.stroke();
  g.fillStyle = C.teal;
  g.fillRect(x, y, w, h);
  g.fillStyle = 'rgba(255, 252, 230, 0.2)';
  g.fillRect(x, y + 5, w, 8);
  // Eyebolts where the chains hang.
  g.fillStyle = C.iron;
  for (let i = 0; i < 3; i++) { const cx = x + w * (0.22 + i * 0.28); g.beginPath(); g.arc(cx, y + h / 2, 3.2, 0, 6.3); g.fill(); }
  g.fillStyle = C.cream;
  g.fillRect(x + 6, y + h / 2 - 2, 14, 4);
  g.fillRect(x + w - 20, y + h / 2 - 2, 14, 4);
  celBands(g, s, o, 4);
  outline(g, s, o, 3);
}

function slide(g: G, s: Solid, o: Open, fh: number) {
  const { x, y, w, h } = s;
  southFace(g, s, o, fh, '#8a6f2a', 'rgba(10, 14, 18, 0.3)');
  g.fillStyle = C.wood;
  g.fillRect(x, y, w, h);
  // The chute: a long yellow trough with raised rails, down the middle.
  const cx = x + w / 2;
  g.fillStyle = C.mustard;
  g.fillRect(cx - 24, y + 52, 48, h - 52);
  g.fillStyle = '#e8c868';
  g.fillRect(cx - 14, y + 56, 10, h - 62);
  g.fillStyle = C.rust;
  g.fillRect(cx - 30, y + 52, 6, h - 52);
  g.fillRect(cx + 24, y + 52, 6, h - 52);
  // The deck at the top with its ladder rungs beside it.
  g.fillStyle = C.woodHi;
  g.fillRect(x + 4, y + 4, w - 8, 44);
  g.strokeStyle = 'rgba(8, 10, 14, 0.45)';
  g.lineWidth = 1;
  g.beginPath();
  for (let i = 1; i < 4; i++) { g.moveTo(x + 4, y + 4 + i * 11 + 0.5); g.lineTo(x + w - 4, y + 4 + i * 11 + 0.5); }
  g.stroke();
  g.fillStyle = C.iron;
  for (const [px, py] of [[x + 8, y + 8], [x + w - 8, y + 8], [x + 8, y + 44], [x + w - 8, y + 44]]) { g.beginPath(); g.arc(px!, py!, 3.4, 0, 6.3); g.fill(); }
  celBands(g, s, o, 4);
  outline(g, s, o, 4);
}

function seesaw(g: G, s: Solid, o: Open, fh: number) {
  const { x, y, w, h } = s;
  const long = h >= w;
  southFace(g, s, o, fh, '#8a6f2a', 'rgba(10, 14, 18, 0.3)');
  g.fillStyle = C.mustard;
  g.fillRect(x, y, w, h);
  g.fillStyle = '#e8c868';
  if (long) g.fillRect(x + 6, y + 4, 8, h - 8); else g.fillRect(x + 4, y + 6, w - 8, 8);
  g.fillStyle = C.rust;
  const px = x + w / 2, py = y + h / 2;
  g.beginPath(); g.arc(px, py, 11, 0, 6.3); g.fill();
  g.strokeStyle = C.ink; g.lineWidth = 2; g.stroke();
  g.fillStyle = C.iron;
  if (long) { g.fillRect(x + 6, y + 6, w - 12, 5); g.fillRect(x + 6, y + h - 11, w - 12, 5); } else { g.fillRect(x + 6, y + 6, 5, h - 12); g.fillRect(x + w - 11, y + 6, 5, h - 12); }
  celBands(g, s, o, 3);
  outline(g, s, o, 3);
}

export const PARK_WALLS = {
  hedge: (g: G, s: Solid) => hedge(g, s),
  pond: (g: G, s: Solid) => basin(g, s, 'pond', 9, PARK_FACE.pond),
  parkstone: (g: G, s: Solid) => stoneWork(g, s),
  trunk: (g: G, s: Solid) => trunk(g, s),
  bench: (g: G, s: Solid) => bench(g, s),
  play: (g: G, s: Solid) => play(g, s),
} as const;

void shade;
