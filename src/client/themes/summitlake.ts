import { blotch, seeded } from '../grain.ts';
import { C, SIZE, TAU, curve, ell, hexA, rr, type G } from './summitkit.ts';

/**
 * The frozen lake that fills the middle of the map, and the hockey rink laid on it. The shore is a ring of radii with period
 * one half turn, so the lake is its own twin. Ice reads in three tones: the grey-green of old lake ice, the pale blue of the
 * resurfaced rink, and the black of the open pools (drawn live by summitwater.ts). All of it is lower in value than the snow.
 */
const CX = SIZE / 2, CY = SIZE / 2;

/** The shore, as a point loop: radii are the same a half turn round, so the loop is symmetric about the centre. */
export function shore(): [number, number][] {
  const n = 44, pts: [number, number][] = [];
  const rnd = seeded(77);
  const jitter = Array.from({ length: n / 2 }, () => rnd());
  for (let i = 0; i < n; i++) {
    const a = (i / n) * TAU, k = i % (n / 2);
    const wob = 1 + 0.1 * Math.sin(2 * a + 0.7) + 0.07 * Math.sin(4 * a + 2.1) + 0.05 * Math.sin(6 * a + 4) + (jitter[k]! - 0.5) * 0.12;
    pts.push([CX + Math.cos(a) * 1040 * wob, CY + Math.sin(a) * 1330 * wob]);
  }
  return pts;
}

/** The four open pools, west half then the turn: centres and radii. */
export const POOLS: readonly { x: number; y: number; r: number }[] = [
  { x: 2600, y: 2050, r: 250 }, { x: 3400, y: 3950, r: 250 }, { x: 2500, y: 3750, r: 220 }, { x: 3500, y: 2250, r: 220 },
];

export function paintLake(g: G, size: number, seed: number) {
  const rand = seeded(seed ^ 0x1ce);
  const loop = shore();
  const closed = [...loop, loop[0]!, loop[1]!];
  // Snow drifted up the shore: a pale halo, then the ice.
  g.lineJoin = 'round';
  g.fillStyle = hexA(C.snowCap, 0.22);
  g.save(); g.translate(0, 0);
  curve(g, closed.map(([x, y]) => [CX + (x - CX) * 1.07, CY + (y - CY) * 1.07] as [number, number])); g.fill();
  g.restore();
  curve(g, closed);
  g.fillStyle = '#5f8fa4'; g.fill();
  g.save();
  curve(g, closed); g.clip();
  // Old ice: mottled, with white bubble clouds and long hairline-free cracks drawn as chunky chips.
  for (let i = 0; i < 90; i++) blotch(g, CX + (rand() - 0.5) * 2200, CY + (rand() - 0.5) * 2700, 90 + rand() * 220, rand() < 0.5 ? '170, 215, 230' : '20, 60, 84', 0.06 + rand() * 0.06);
  g.lineCap = 'round'; g.lineJoin = 'round';
  for (let i = 0; i < 46; i++) {
    let x = CX + (rand() - 0.5) * 2000, y = CY + (rand() - 0.5) * 2500, a = rand() * TAU;
    g.beginPath(); g.moveTo(x, y);
    const segs = 4 + Math.floor(rand() * 4);
    for (let k = 0; k < segs; k++) { a += (rand() - 0.5) * 1.1; x += Math.cos(a) * (30 + rand() * 60); y += Math.sin(a) * (30 + rand() * 60); g.lineTo(x, y); }
    g.strokeStyle = 'rgba(14, 44, 64, 0.34)'; g.lineWidth = 3.2; g.stroke();
    g.strokeStyle = 'rgba(205, 232, 242, 0.34)'; g.lineWidth = 1.6; g.translate(-1.4, -1.4); g.stroke(); g.translate(1.4, 1.4);
  }
  // Snow blown across the ice in streaks, and frost ferns near the shore.
  for (let i = 0; i < 160; i++) {
    const x = CX + (rand() - 0.5) * 2200, y = CY + (rand() - 0.5) * 2700, len = 40 + rand() * 120;
    g.strokeStyle = hexA(C.snowCap, 0.1 + rand() * 0.08); g.lineWidth = 4 + rand() * 6;
    g.beginPath(); g.moveTo(x, y); g.quadraticCurveTo(x + len * 0.5, y + len * 0.25 - 6, x + len, y + len * 0.5); g.stroke();
  }
  // Dark halos where the pools thin the ice.
  for (const p of POOLS) { blotch(g, p.x, p.y, p.r * 1.9, '10, 36, 54', 0.34); blotch(g, p.x, p.y, p.r * 1.35, '8, 28, 44', 0.36); }
  g.restore();
  // The shore line: a dark lip of ice-ride under the snow bank.
  curve(g, closed); g.strokeStyle = 'rgba(20, 44, 64, 0.5)'; g.lineWidth = 7; g.stroke();
  curve(g, closed); g.strokeStyle = hexA(C.snowCap, 0.4); g.lineWidth = 2.6; g.translate(-2, -2); g.stroke(); g.translate(2, 2);

  rink(g, rand);
}

/** The rink: resurfaced ice with the lines of the game painted under it, skate scrapes over the lot. */
function rink(g: G, rand: () => number) {
  const hx = 700, hy = 400, rc = 170;
  g.save();
  rr(g, CX - hx, CY - hy, hx * 2, hy * 2, rc); g.clip();
  g.fillStyle = C.rinkIce; g.fillRect(CX - hx, CY - hy, hx * 2, hy * 2);
  const sheen = g.createLinearGradient(CX - hx, CY - hy, CX + hx, CY + hy);
  sheen.addColorStop(0, 'rgba(230, 245, 250, 0.2)'); sheen.addColorStop(0.5, 'rgba(230, 245, 250, 0)'); sheen.addColorStop(1, 'rgba(20, 50, 80, 0.18)');
  g.fillStyle = sheen; g.fillRect(CX - hx, CY - hy, hx * 2, hy * 2);
  // Skate scrapes: long overlapping arcs, lighter where the blade bit and darker where it dragged.
  g.lineCap = 'round';
  for (let i = 0; i < 160; i++) {
    const x = CX + (rand() - 0.5) * hx * 2, y = CY + (rand() - 0.5) * hy * 2, r = 60 + rand() * 320, a = rand() * TAU, span = 0.4 + rand() * 0.9;
    g.strokeStyle = rand() < 0.5 ? 'rgba(235, 248, 252, 0.2)' : 'rgba(40, 80, 110, 0.14)'; g.lineWidth = 1.4 + rand();
    g.beginPath(); g.arc(x, y, r, a, a + span); g.stroke();
  }
  // Painted lines: red centre, blue lines, red goal lines, the faceoff circles.
  g.fillStyle = 'rgba(176, 56, 44, 0.62)'; g.fillRect(CX - 3, CY - hy, 6, hy * 2);
  for (const dx of [-620, 620]) g.fillRect(CX + dx - 1.5, CY - hy, 3, hy * 2);
  g.fillStyle = 'rgba(52, 88, 176, 0.62)';
  for (const dx of [-230, 230]) g.fillRect(CX + dx - 4, CY - hy, 8, hy * 2);
  g.lineWidth = 4;
  g.strokeStyle = 'rgba(52, 88, 176, 0.5)'; g.beginPath(); g.arc(CX, CY, 92, 0, TAU); g.stroke();
  g.strokeStyle = 'rgba(176, 56, 44, 0.5)'; g.lineWidth = 3;
  for (const [dx, dy] of [[-440, -190], [-440, 190], [440, -190], [440, 190]] as const) {
    g.beginPath(); g.arc(CX + dx, CY + dy, 74, 0, TAU); g.stroke();
    g.fillStyle = 'rgba(176, 56, 44, 0.55)'; g.beginPath(); g.arc(CX + dx, CY + dy, 9, 0, TAU); g.fill();
    for (const [sx, sy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]] as const) { g.fillRect(CX + dx + sx * 90 - (sx > 0 ? 0 : 14), CY + dy + sy * 24 - (sy > 0 ? 0 : 3), 14, 3); }
  }
  g.fillStyle = 'rgba(52, 88, 176, 0.18)';
  for (const side of [-1, 1]) { g.beginPath(); g.arc(CX + side * 620, CY, 70, side < 0 ? -Math.PI / 2 : Math.PI / 2, side < 0 ? Math.PI / 2 : Math.PI * 1.5); g.closePath(); g.fill(); }
  // The club's name in the middle circle: painted, then scuffed.
  g.save(); g.translate(CX, CY - 150); g.fillStyle = 'rgba(176, 56, 44, 0.32)'; g.font = '700 54px "Barlow Condensed", "Arial Narrow", sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  (g as unknown as { letterSpacing: string }).letterSpacing = '8px';
  g.fillText('SUMMIT', 0, 0);
  g.restore();
  g.restore();
  // A rim of scuffed ice in the corners where the pucks live.
  g.strokeStyle = 'rgba(20, 50, 80, 0.35)'; g.lineWidth = 8; rr(g, CX - hx + 4, CY - hy + 4, hx * 2 - 8, hy * 2 - 8, rc - 4); g.stroke();
  void ell;
}
