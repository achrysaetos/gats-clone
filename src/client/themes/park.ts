import { parkGeo } from './parkgeo.ts';
import type { FloorPlan } from '../floor.ts';
import { blotch, canvas, seeded, speckle } from '../grain.ts';
import { registerTheme } from './registry.ts';
import { C, CELL, DISTRICTS, MID, PARK, SIZE, districtBox, hash, wallsOf } from './parkkit.ts';
import { PARK_FACE, PARK_WALLS } from './parkwalls.ts';
import { parkLights, parkOver, parkUnder } from './parkdecor.ts';

/**
 * Park: a city park at dusk. The ground is a quiet mown lawn; gravel paths and a flagstone plaza carry the traffic; and
 * the nine districts of the 3 x 3 split each have their own floor treatment, light and set-pieces, so you always know
 * where you are. The whole of it is baked once into the ground layer; what moves lives in parkdecor.ts.
 */
type G = CanvasRenderingContext2D;
type Pt = readonly [number, number];
const TAU = Math.PI * 2;
const px = (c: number) => c * CELL;
const turn = (p: Pt): Pt => [120 - p[0], 120 - p[1]];

function hexA(hex: string, a: number): string {
  const v = parseInt(hex.slice(1), 16);
  return `rgba(${(v >> 16) & 255}, ${(v >> 8) & 255}, ${v & 255}, ${a.toFixed(3)})`;
}

/** Smooth path through cell points, scaled to px. */
function curve(g: G, pts: readonly Pt[]) {
  g.beginPath();
  g.moveTo(px(pts[0]![0]), px(pts[0]![1]));
  for (let i = 1; i < pts.length - 1; i++) {
    const [ax, ay] = pts[i]!, [bx, by] = pts[i + 1]!;
    g.quadraticCurveTo(px(ax), px(ay), px((ax + bx) / 2), px((ay + by) / 2));
  }
  const last = pts[pts.length - 1]!;
  g.lineTo(px(last[0]), px(last[1]));
}

/** A hand-placed loose paving tile pattern. */
function gravelTile(): CanvasPattern | null {
  const [c, p] = canvas(128);
  const r = seeded(91);
  p.fillStyle = C.gravel;
  p.fillRect(0, 0, 128, 128);
  for (let i = 0; i < 520; i++) {
    const k = r();
    p.fillStyle = k < 0.35 ? C.gravelHi : k < 0.7 ? C.gravelLo : '#b0a487';
    p.globalAlpha = 0.35 + r() * 0.4;
    const s = 1.2 + r() * 2.4;
    p.beginPath(); p.ellipse(r() * 128, r() * 128, s * 1.2, s, r() * 3, 0, TAU); p.fill();
  }
  p.globalAlpha = 1;
  return c.getContext('2d')!.createPattern(c, 'repeat');
}

function flagTile(): HTMLCanvasElement {
  const [c, p] = canvas(100);
  p.fillStyle = C.flag;
  p.fillRect(0, 0, 100, 100);
  const r = seeded(7);
  for (let j = 0; j < 2; j++) for (let i = 0; i < 2; i++) {
    const k = r();
    p.fillStyle = k > 0.5 ? 'rgba(255, 250, 225, 0.1)' : 'rgba(10, 14, 20, 0.12)';
    p.fillRect(i * 50 + 2, j * 50 + 2, 46, 46);
  }
  p.strokeStyle = C.flagSeam;
  p.lineWidth = 2;
  p.strokeRect(1, 1, 98, 98);
  p.beginPath(); p.moveTo(50, 0); p.lineTo(50, 100); p.moveTo(0, 50); p.lineTo(100, 50); p.stroke();
  return c;
}

/** Boards laid across a rect (a deck, a jetty, a boardwalk), with nail heads. */
export function planks(g: G, x: number, y: number, w: number, h: number, vertical: boolean, seed = 1) {
  const n = Math.round((vertical ? w : h) / 14);
  for (let i = 0; i < n; i++) {
    const k = hash(seed, i, 4);
    g.fillStyle = k > 0.66 ? C.woodHi : k < 0.25 ? C.woodLo : C.wood;
    if (vertical) g.fillRect(x + (w * i) / n, y, w / n - 1, h); else g.fillRect(x, y + (h * i) / n, w, h / n - 1);
  }
  g.fillStyle = 'rgba(10, 8, 6, 0.4)';
  for (let i = 1; i < n; i++) { if (vertical) g.fillRect(x + (w * i) / n - 1, y, 1.5, h); else g.fillRect(x, y + (h * i) / n - 1, w, 1.5); }
  g.strokeStyle = C.ink; g.lineWidth = 2; g.strokeRect(x, y, w, h);
}

function floor(g: G, size: number, seed: number, plan: FloorPlan) {
  const rand = seeded(seed ^ 0x9a2c);
  // Lawn: mown in broad bands, each a hair lighter or darker; quiet, so players pop.
  g.fillStyle = C.grass;
  g.fillRect(0, 0, size, size);
  for (let y = 0, i = 0; y < size; y += 150, i++) { g.fillStyle = i % 2 ? hexA(C.grassA, 0.5) : hexA(C.grassB, 0.5); g.fillRect(0, y, size, 150); }
  // The bandstand lawn is mown in a chequer instead, the picnic meadow left long and bright.
  const bs = districtBox(DISTRICTS[0]!);
  for (let y = bs.y0; y < bs.y1; y += 100) for (let x = bs.x0; x < bs.x1; x += 100) if (((x + y) / 100) % 2 === 0) { g.fillStyle = 'rgba(255, 252, 220, 0.03)'; g.fillRect(x, y, 100, 100); }
  for (const d of DISTRICTS) {
    const b = districtBox(d);
    blotch(g, (b.x0 + b.x1) / 2, (b.y0 + b.y1) / 2, 1500, d.tint.slice(5, d.tint.lastIndexOf(',')), parseFloat(d.tint.slice(d.tint.lastIndexOf(',') + 1)) * 1.4);
  }
  const area = (size * size) / 1_000_000;
  for (let i = 0; i < 70 * area; i++) blotch(g, rand() * size, rand() * size, 90 + rand() * 220, rand() < 0.5 ? '20, 40, 20' : '120, 120, 60', 0.05 + rand() * 0.05);
  speckle(g, rand, size, 3000 * area, '#243019', '#6f8a4e');
  // Grass tufts: small ink-dark chevrons that make the lawn read as grass and not as felt.
  g.strokeStyle = 'rgba(20, 32, 18, 0.35)';
  g.lineWidth = 1.4;
  g.beginPath();
  for (let i = 0; i < 2600 * area; i++) { const x = rand() * size, y = rand() * size; g.moveTo(x - 3, y + 2); g.lineTo(x, y - 2); g.lineTo(x + 3, y + 2); }
  g.stroke();

  walkedGround(g, rand);
  paths(g, rand);
  districtFloors(g, rand, seed);
  edging(g, size, rand);
}

/** Desire lines: trodden strips across the lawn where people actually cut the corner. */
function walkedGround(g: G, rand: () => number) {
  const trails: Pt[][] = [
    [[8, 16], [14, 26], [22, 42], [30, 52]], [[16, 10], [28, 12], [38, 20]], [[6, 62], [10, 72], [20, 76]],
    [[38, 66], [30, 76], [24, 84]], [[48, 36], [54, 44], [58, 54]], [[8, 36], [10, 44], [6, 52]], [[44, 100], [52, 108], [56, 112]],
  ];
  g.lineCap = 'round';
  g.lineJoin = 'round';
  for (const t of trails) for (const pts of [t, t.map(turn)]) {
    for (const [w, a] of [[46, 0.1], [26, 0.14]] as const) { g.strokeStyle = `rgba(122, 108, 64, ${a})`; g.lineWidth = w; curve(g, pts); g.stroke(); }
  }
  void rand;
}

/** The gravel network, with a kerb of stones and a ragged lawn edge, and the flagstone plaza at the heart. */
function paths(g: G, rand: () => number) {
  const tile = gravelTile();
  const lines: { pts: Pt[]; w: number }[] = [
    { pts: [[2, 60], [57, 60]], w: 6 }, { pts: [[60, 2], [60, 57]], w: 6 },
    { pts: [[12, 13], [18, 20], [20, 28], [23, 34]], w: 3 },
    { pts: [[27, 33], [31, 24], [35, 16], [45, 16]], w: 3 },
    { pts: [[45, 16], [54, 16], [58, 22], [60, 27]], w: 3 },
    { pts: [[14, 44], [14, 55]], w: 2.4 }, { pts: [[24, 71], [24, 76]], w: 3 }, { pts: [[24, 108], [24, 113], [36, 113]], w: 3 },
    { pts: [[32, 66], [46, 66], [55, 70]], w: 2.4 }, { pts: [[10, 104], [18, 112]], w: 2.4 },
  ];
  const all = lines.flatMap((l) => [l, { pts: l.pts.map(turn), w: l.w }]);
  g.lineCap = 'round';
  g.lineJoin = 'round';
  // Lawn blends into the gravel: a soft dark verge, then the kerb stones, then the gravel.
  for (const l of all) { g.strokeStyle = 'rgba(28, 36, 20, 0.28)'; g.lineWidth = px(l.w) + 34; curve(g, l.pts); g.stroke(); }
  for (const l of all) { g.strokeStyle = C.soil; g.lineWidth = px(l.w) + 14; curve(g, l.pts); g.stroke(); }
  for (const l of all) { g.strokeStyle = tile ?? C.gravel; g.lineWidth = px(l.w); curve(g, l.pts); g.stroke(); }
  // Worn middle where boots go, lighter and smoother.
  for (const l of all) { g.strokeStyle = 'rgba(210, 196, 150, 0.16)'; g.lineWidth = px(l.w) * 0.45; curve(g, l.pts); g.stroke(); }
  // Kerb stones along the long edges: alternating pale stones with an ink edge.
  g.lineWidth = 2;
  for (const l of all) {
    if (l.w < 5) continue;
    const [a, b] = [l.pts[0]!, l.pts[l.pts.length - 1]!];
    const horiz = Math.abs(a[1] - b[1]) < 1;
    for (const side of [-1, 1]) {
      const along = horiz ? [a[0], b[0]] : [a[1], b[1]];
      for (let t = Math.min(...along); t < Math.max(...along); t += 0.9) {
        const o = side * (l.w / 2 + 0.1);
        const x = px(horiz ? t : a[0] + o), y = px(horiz ? a[1] + o : t);
        g.fillStyle = hash(Math.round(t * 10), side, 3) > 0.5 ? '#b9b19b' : '#a39c88';
        g.beginPath(); g.ellipse(x, y, horiz ? 20 : 6, horiz ? 6 : 20, 0, 0, TAU); g.fill();
        g.strokeStyle = 'rgba(28, 31, 38, 0.7)'; g.stroke();
      }
    }
  }
  void rand;
  // The plaza round the fountain: flagstones, a ring of darker stones, and a compass rose in the paving.
  const flags = g.createPattern(flagTile(), 'repeat');
  g.fillStyle = C.soil;
  g.beginPath(); g.arc(MID, MID, 560, 0, TAU); g.fill();
  g.fillStyle = flags ?? C.flag;
  g.beginPath(); g.arc(MID, MID, 540, 0, TAU); g.fill();
  g.strokeStyle = C.ink; g.lineWidth = 3; g.stroke();
  g.strokeStyle = 'rgba(40, 36, 30, 0.45)';
  g.lineWidth = 12;
  for (const r of [470, 380]) { g.beginPath(); g.arc(MID, MID, r, 0, TAU); g.stroke(); }
  g.fillStyle = 'rgba(60, 56, 48, 0.5)';
  for (let i = 0; i < 8; i++) {
    const a = (i * TAU) / 8;
    g.save(); g.translate(MID, MID); g.rotate(a);
    g.beginPath(); g.moveTo(520, 0); g.lineTo(300, -16); g.lineTo(300, 16); g.closePath(); g.fill();
    g.restore();
  }
  // The inner pool's stone lip.
  g.fillStyle = '#c9c2ac';
  g.beginPath(); g.arc(MID, MID, 150, 0, TAU); g.fill();
  g.strokeStyle = C.ink; g.lineWidth = 3; g.stroke();
  g.fillStyle = C.waterDeep;
  g.beginPath(); g.arc(MID, MID, 128, 0, TAU); g.fill();
  g.stroke();
}

function pad(g: G, r: { x: number; y: number; w: number; h: number }, tint: string, seed: number) {
  // A slab of flagstone set into the lawn: a dark bedding, rounded corners, an inlaid border in the team's colour, a star at its heart.
  const rr = (x: number, y: number, w: number, h: number, k: number) => { g.beginPath(); g.moveTo(x + k, y); g.arcTo(x + w, y, x + w, y + h, k); g.arcTo(x + w, y + h, x, y + h, k); g.arcTo(x, y + h, x, y, k); g.arcTo(x, y, x + w, y, k); g.closePath(); };
  g.fillStyle = 'rgba(20, 28, 18, 0.5)'; rr(r.x - 12, r.y - 12, r.w + 24, r.h + 24, 22); g.fill();
  g.fillStyle = C.soil; rr(r.x - 6, r.y - 6, r.w + 12, r.h + 12, 18); g.fill();
  const flags = g.createPattern(flagTile(), 'repeat');
  g.fillStyle = flags ?? C.flag; rr(r.x, r.y, r.w, r.h, 14); g.fill();
  g.fillStyle = hexA(tint, 0.16); g.fill();
  g.strokeStyle = C.ink; g.lineWidth = 3; g.stroke();
  g.strokeStyle = hexA(tint, 0.85); g.lineWidth = 5; g.setLineDash([22, 10]); rr(r.x + 14, r.y + 14, r.w - 28, r.h - 28, 8); g.stroke(); g.setLineDash([]);
  const cx = r.x + r.w / 2, cy = r.y + r.h / 2, s = Math.min(r.w, r.h) * 0.16;
  g.fillStyle = hexA(tint, 0.9);
  g.beginPath(); for (let i = 0; i < 8; i++) { const a = (i * TAU) / 8 - Math.PI / 2, q = i % 2 ? s * 0.38 : s; g.lineTo(cx + Math.cos(a) * q, cy + Math.sin(a) * q); } g.closePath(); g.fill();
  g.strokeStyle = C.ink; g.lineWidth = 2; g.stroke();
  g.fillStyle = C.moss;
  for (const [mx, my] of [[r.x + 10, r.y + 10], [r.x + r.w - 10, r.y + r.h - 10]]) { g.beginPath(); g.arc(mx!, my!, 7, 0, TAU); g.fill(); }
  void seed;
}

function district(g: G, id: string, fn: (b: ReturnType<typeof districtBox>) => void) {
  const d = DISTRICTS.find((q) => q.id === id)!;
  fn(districtBox(d));
}

function districtFloors(g: G, rand: () => number, seed: number) {
  void rand;
  // Spawn pads.
  for (const r of PARK.spawns.red) pad(g, r, '#b4524a', seed);
  for (const r of PARK.spawns.blue) pad(g, r, '#4f7fbf', seed);
  for (const r of PARK.spawns.ffa) pad(g, r, '#a39c88', seed);

  // BANDSTAND GREEN: the stage deck inside each concert shell.
  for (const z of [PARK.zones[0]!, PARK.zones[2]!]) {
    g.save(); g.translate(z.x, z.y);
    g.beginPath();
    for (let i = 0; i < 8; i++) { const a = (i + 0.5) * TAU / 8; g.lineTo(Math.cos(a) * 262, Math.sin(a) * 262); }
    g.closePath(); g.clip();
    planks(g, -270, -270, 540, 540, false, Math.round(z.x));
    g.restore();
    g.strokeStyle = C.ink; g.lineWidth = 3;
    g.beginPath(); for (let i = 0; i < 8; i++) { const a = (i + 0.5) * TAU / 8; g.lineTo(z.x + Math.cos(a) * 262, z.y + Math.sin(a) * 262); } g.closePath(); g.stroke();
  }

  // PLAYGROUND: wood-chip mulch in the fence, sand in the pit, chalk on the path.
  for (const [x0, y0, x1, y1] of [[36, 9, 53, 30], ...[[36, 9, 53, 30]].map(([a, b, c, d]) => [120 - c!, 120 - d!, 120 - a!, 120 - b!])] as const) {
    g.fillStyle = '#6a5438'; g.fillRect(px(x0), px(y0), px(x1 - x0), px(y1 - y0));
    const r = seeded(x0 * 31 + y0);
    for (let i = 0; i < 900; i++) { g.fillStyle = r() < 0.5 ? '#7d6446' : '#54422c'; g.fillRect(px(x0) + r() * px(x1 - x0), px(y0) + r() * px(y1 - y0), 4 + r() * 4, 2); }
    g.strokeStyle = C.ink; g.lineWidth = 2; g.strokeRect(px(x0), px(y0), px(x1 - x0), px(y1 - y0));
  }
  for (const [x0, y0, x1, y1] of [[43, 24, 47, 28], [120 - 47, 120 - 28, 120 - 43, 120 - 24]] as const) {
    const r = seeded(x0 + 5);
    g.fillStyle = '#b8a47a'; g.fillRect(px(x0), px(y0), px(x1 - x0), px(y1 - y0));
    for (let i = 0; i < 160; i++) { g.fillStyle = r() < 0.5 ? '#cdb98c' : '#9c8a62'; g.fillRect(px(x0) + r() * px(x1 - x0), px(y0) + r() * px(y1 - y0), 3, 2); }
  }

  // ROSE GARDEN: formal beds of roses and a clipped lawn, and its mirror becomes the sports courts.
  const bed = (x0: number, y0: number, x1: number, y1: number, seed2: number) => {
    const r = seeded(seed2);
    g.fillStyle = '#3b2e22'; g.fillRect(px(x0), px(y0), px(x1 - x0), px(y1 - y0));
    g.strokeStyle = C.ink; g.lineWidth = 2; g.strokeRect(px(x0), px(y0), px(x1 - x0), px(y1 - y0));
    for (let i = 0; i < 60; i++) {
      const x = px(x0) + 14 + r() * (px(x1 - x0) - 28), y = px(y0) + 12 + r() * (px(y1 - y0) - 24);
      g.fillStyle = '#35552f'; g.beginPath(); g.arc(x, y, 9, 0, TAU); g.fill();
      g.fillStyle = [C.rose, '#e6b2b6', C.cream, '#d98f4e'][Math.floor(r() * 4)]!;
      g.beginPath(); g.arc(x - 2, y - 2, 4, 0, TAU); g.fill(); g.strokeStyle = 'rgba(28,31,38,0.6)'; g.lineWidth = 1.2; g.stroke();
    }
  };
  bed(7, 44, 12.4, 50.2, 11); bed(15.6, 44, 22, 50.2, 12);
  // Round bed at the heart of the garden (the stone planter stands on it).
  // COURTS: a clay tennis court in the hedged room, painted lines, and a blacktop with a key.
  const cx0 = px(97), cy0 = px(69), cw = px(16), ch = px(6.2);
  g.fillStyle = '#8a5a3e'; g.fillRect(cx0, cy0, cw, ch);
  const cr = seeded(77);
  for (let i = 0; i < 500; i++) { g.fillStyle = cr() < 0.5 ? '#9a6848' : '#76492f'; g.fillRect(cx0 + cr() * cw, cy0 + cr() * ch, 5, 2); }
  g.strokeStyle = 'rgba(240, 236, 220, 0.85)'; g.lineWidth = 4;
  g.strokeRect(cx0 + 20, cy0 + 22, cw - 40, ch - 44);
  g.beginPath(); g.moveTo(cx0 + cw / 2, cy0 + 22); g.lineTo(cx0 + cw / 2, cy0 + ch - 22);
  g.moveTo(cx0 + 20 + 150, cy0 + 22); g.lineTo(cx0 + 20 + 150, cy0 + ch - 22);
  g.moveTo(cx0 + cw - 20 - 150, cy0 + 22); g.lineTo(cx0 + cw - 20 - 150, cy0 + ch - 22);
  g.moveTo(cx0 + 20 + 150, cy0 + ch / 2); g.lineTo(cx0 + cw - 20 - 150, cy0 + ch / 2);
  g.stroke();
  g.strokeStyle = C.ink; g.lineWidth = 2; g.strokeRect(cx0, cy0, cw, ch);
  const bx = px(90), by = px(44);
  g.fillStyle = '#464a56'; g.fillRect(bx, by, px(15), px(11));
  const br = seeded(79);
  for (let i = 0; i < 500; i++) { g.fillStyle = br() < 0.5 ? '#50545f' : '#3c404a'; g.fillRect(bx + br() * px(15), by + br() * px(11), 4, 2); }
  g.strokeStyle = 'rgba(240, 236, 220, 0.8)'; g.lineWidth = 4;
  g.strokeRect(bx + 14, by + 14, px(15) - 28, px(11) - 28);
  g.beginPath(); g.arc(bx + px(7.5), by + px(11) - 14, 70, Math.PI, 0); g.stroke();
  g.strokeRect(bx + px(7.5) - 40, by + px(11) - 14 - 130, 80, 130);
  g.beginPath(); g.arc(bx + px(7.5), by + px(11) - 14 - 130, 40, 0, TAU); g.stroke();
  g.strokeStyle = C.ink; g.lineWidth = 2; g.strokeRect(bx, by, px(15), px(11));

  // LANTERN POND and BOATHOUSE POND: marsh ground and wet mud round the water, stepping stones, reed beds.
  const ponds = wallsOf('pond');
  for (const w of ponds) {
    blotchRect(g, w.x - 40, w.y - 40, w.w + 80, w.h + 80, 'rgba(24, 40, 28, 0.34)');
    blotchRect(g, w.x - 16, w.y - 16, w.w + 32, w.h + 32, 'rgba(22, 30, 22, 0.4)');
  }
  const rr = seeded(404);
  for (let i = 0; i < 160; i++) {
    const w = ponds[Math.floor(rr() * ponds.length)]!;
    const side = Math.floor(rr() * 4);
    let x = w.x + rr() * w.w, y = w.y + rr() * w.h;
    if (side === 0) y = w.y - 14 - rr() * 22; else if (side === 1) y = w.y + w.h + 8 + rr() * 22; else if (side === 2) x = w.x - 14 - rr() * 22; else x = w.x + w.w + 14 + rr() * 22;
    if (ponds.some((q) => x > q.x - 6 && x < q.x + q.w + 6 && y > q.y - 6 && y < q.y + q.h + 6)) continue;
    reed(g, x, y, rr);
  }
  // The boardwalk over the pond's narrows: planks laid across the gap, rope posts at the ends.
  for (const gap of [{ x: px(22), y: px(83), w: px(4), h: px(18) }, { x: px(94), y: px(19), w: px(4), h: px(18) }]) {
    g.fillStyle = C.waterDeep; g.fillRect(gap.x, gap.y, gap.w, gap.h);
    planks(g, gap.x + 8, gap.y + 4, gap.w - 16, gap.h - 8, false, gap.x);
  }

  // FOUNTAIN PLAZA / MEADOW / ORCHARD: ground cover by district.
  district(g, 'meadow', (b) => { scatter(g, b, 520, ['#f2eee0', '#e8c868', '#d98f4e', '#b4797f'], 801); });
  district(g, 'playground', (b) => { scatter(g, b, 260, ['#f2eee0', '#e8c868'], 802); });
  district(g, 'orchard', (b) => { scatter(g, b, 520, ['#c0702f', '#e8a443', '#7a4a1f'], 803, true); });
  district(g, 'lanterns', (b) => { scatter(g, b, 260, ['#8fc3a6', '#d9d2a4'], 804, true); });
  district(g, 'boathouse', (b) => { scatter(g, b, 260, ['#a3c487', '#d9d2a4'], 805, true); });
  district(g, 'bandstand', (b) => { scatter(g, b, 200, ['#f2eee0', '#e0a9a4'], 806); });
  // Wildflowers in drifts across the meadow, long grass beside the playground, mown rows in the orchard, moss at the ponds.
  district(g, 'meadow', (b) => {
    const r = seeded(811);
    for (let i = 0; i < 60; i++) {
      const cx = b.x0 + 80 + r() * (b.x1 - b.x0 - 160), cy = b.y0 + 80 + r() * (b.y1 - b.y0 - 160), col = ['#f2eee0', '#e8c868', '#d98f4e', '#c98aa6', '#9ab4d8'][Math.floor(r() * 5)]!;
      for (let j = 0; j < 12; j++) { const a = r() * TAU, d = r() * 46; g.fillStyle = col; g.globalAlpha = 0.85; g.beginPath(); g.arc(cx + Math.cos(a) * d, cy + Math.sin(a) * d, 2.6, 0, TAU); g.fill(); g.fillStyle = '#e8c868'; g.fillRect(cx + Math.cos(a) * d - 0.6, cy + Math.sin(a) * d - 0.6, 1.2, 1.2); }
    }
    g.globalAlpha = 1;
  });
  district(g, 'orchard', (b) => {
    g.fillStyle = 'rgba(20, 30, 14, 0.14)';
    for (let x = b.x0 + 40; x < b.x1; x += 170) g.fillRect(x, b.y0, 64, b.y1 - b.y0);
  });
  district(g, 'playground', (b) => {
    const r = seeded(812);
    for (let i = 0; i < 40; i++) blotch(g, b.x0 + r() * (b.x1 - b.x0), b.y0 + r() * (b.y1 - b.y0), 60 + r() * 80, '90, 120, 50', 0.12);
  });
  for (const id of ['lanterns', 'boathouse']) district(g, id, (b) => {
    const r = seeded(id.length * 77);
    for (let i = 0; i < 40; i++) blotch(g, b.x0 + r() * (b.x1 - b.x0), b.y0 + r() * (b.y1 - b.y0), 70 + r() * 90, '40, 110, 90', 0.12);
  });

  // The matches' own chalk and litter live in parkdecor (vignettes); the floor keeps only worn marks.
}

function blotchRect(g: G, x: number, y: number, w: number, h: number, fill: string) {
  g.fillStyle = fill;
  g.beginPath(); g.ellipse(x + w / 2, y + h / 2, w / 2, h / 2, 0, 0, TAU); g.fill();
}

function reed(g: G, x: number, y: number, r: () => number) {
  g.strokeStyle = '#2a3d22';
  g.lineWidth = 3;
  g.lineCap = 'round';
  g.beginPath();
  for (let i = 0; i < 4; i++) { const dx = (i - 1.5) * 4; g.moveTo(x + dx, y + 5); g.quadraticCurveTo(x + dx + (r() - 0.5) * 6, y - 8, x + dx * 1.6, y - 18 - r() * 8); }
  g.stroke();
  g.strokeStyle = '#5a7a3a'; g.lineWidth = 1.5; g.beginPath(); g.moveTo(x - 3, y + 4); g.quadraticCurveTo(x - 4, y - 8, x - 5, y - 20); g.stroke();
  g.fillStyle = '#6a4a30';
  g.beginPath(); g.ellipse(x + 3, y - 20, 2.2, 5, 0, 0, TAU); g.fill();
  g.lineCap = 'butt';
}

/** Dots of colour on a district's open ground: flowers, windfall, pebbles. Walls simply hide what lies under them. */
function scatter(g: G, b: ReturnType<typeof districtBox>, n: number, colors: readonly string[], seed: number, leaves = false) {
  const r = seeded(seed);
  for (let i = 0; i < n; i++) {
    const x = b.x0 + 60 + r() * (b.x1 - b.x0 - 120), y = b.y0 + 60 + r() * (b.y1 - b.y0 - 120);
    g.fillStyle = colors[Math.floor(r() * colors.length)]!;
    g.globalAlpha = 0.7;
    if (leaves) { g.save(); g.translate(x, y); g.rotate(r() * TAU); g.beginPath(); g.ellipse(0, 0, 4.5, 2.4, 0, 0, TAU); g.fill(); g.restore(); } else { g.beginPath(); g.arc(x, y, 2.2, 0, TAU); g.fill(); }
  }
  g.globalAlpha = 1;
}

/** The map's rim: the lawn darkens toward the hedge, and a mown verge runs along it. */
function edging(g: G, size: number, rand: () => number) {
  void rand;
  const rim = 220;
  for (const [x0, y0, x1, y1, rx, ry, rw, rh] of [
    [0, 0, 0, rim, 0, 0, size, rim], [0, size, 0, size - rim, 0, size - rim, size, rim],
    [0, 0, rim, 0, 0, 0, rim, size], [size, 0, size - rim, 0, size - rim, 0, rim, size],
  ] as const) {
    const grad = g.createLinearGradient(x0, y0, x1, y1);
    grad.addColorStop(0, 'rgba(10, 18, 10, 0.5)');
    grad.addColorStop(1, 'rgba(10, 18, 10, 0)');
    g.fillStyle = grad;
    g.fillRect(rx, ry, rw, rh);
  }
}

registerTheme('park', {
  ...parkGeo,
  floor,
  walls: PARK_WALLS,
  under: parkUnder,
  over: parkOver,
  dusk: 0.34,
});
void PARK_FACE; void SIZE; void parkLights;
