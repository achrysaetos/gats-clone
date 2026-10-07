import { blotch } from '../grain.ts';
import { C, SIZE, TAU, calm, clock, ell, hexA, rr, type G, type Pt } from './summitkit.ts';
import { both, label } from './summitdraw.ts';
import { INK } from '../palette.ts';

/**
 * The small stories and the secrets. Baked into the floor: skis that someone left standing in the snow when the lifts
 * closed, the half-built snowman's footprints coming and going, the trail of something very large that ends at a wall.
 * Live: a penguin at the edge of the pool who has not been told this is not Antarctica.
 */

function ski(g: G, x: number, y: number, rot: number, color: string, len = 84) {
  g.save(); g.translate(x, y); g.rotate(rot);
  g.fillStyle = 'rgba(14, 20, 40, 0.3)'; g.fillRect(-len / 2 + 3, -3, len, 7);
  g.fillStyle = color; g.fillRect(-len / 2, -4, len, 7);
  g.beginPath(); g.moveTo(len / 2, -4); g.quadraticCurveTo(len / 2 + 12, -8, len / 2 + 16, -10); g.lineTo(len / 2 + 14, -3); g.lineTo(len / 2, 3); g.closePath(); g.fill();
  g.fillStyle = 'rgba(255, 255, 255, 0.35)'; g.fillRect(-len / 2, -4, len, 2);
  g.fillStyle = '#26282c'; g.fillRect(-10, -5, 20, 9);
  g.strokeStyle = INK; g.lineWidth = 1.6; g.strokeRect(-len / 2, -4, len, 7);
  g.restore();
}

function pole(g: G, x: number, y: number, ang: number) {
  g.strokeStyle = 'rgba(14, 20, 40, 0.35)'; g.lineWidth = 4; g.beginPath(); g.moveTo(x + 3, y + 3); g.lineTo(x + Math.cos(ang) * 60 + 3, y + Math.sin(ang) * 60 + 3); g.stroke();
  g.strokeStyle = INK; g.lineWidth = 4; g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(ang) * 60, y + Math.sin(ang) * 60); g.stroke();
  g.strokeStyle = '#c8cdd6'; g.lineWidth = 1.8; g.stroke();
  g.strokeStyle = '#26282c'; g.lineWidth = 2.4; g.beginPath(); g.arc(x, y, 6, 0, TAU); g.stroke();
}

/** A pair of skis planted in a drift and their poles lying crossed on top. */
function abandoned(g: G, x: number, y: number, rot: number, a: string, b: string) {
  blotch(g, x, y + 6, 46, '210, 225, 245', 0.2);
  ski(g, x - 6, y - 4, rot, a); ski(g, x + 6, y + 6, rot + 0.1, b);
  pole(g, x - 30, y + 24, rot + 0.5); pole(g, x + 30, y - 24, rot - 2.6);
}

/** Boots and a mitten: the half-built snowman's builder went home. */
function builder(g: G, pts: readonly Pt[]) {
  g.fillStyle = 'rgba(40, 55, 85, 0.3)';
  pts.forEach(([x, y], i) => { ell(g, x + (i % 2 ? 7 : -7), y, 6, 3.2, 0.3); g.fill(); });
}

/** A prints trail of something 60 cm across, three toes and claw marks, ending at a wall. */
function yeti(g: G, from: Pt, to: Pt) {
  const [ax, ay] = from, [bx, by] = to, len = Math.hypot(bx - ax, by - ay), ang = Math.atan2(by - ay, bx - ax);
  let left = true;
  for (let d = 0; d < len; d += 78) {
    const x = ax + Math.cos(ang) * d, y = ay + Math.sin(ang) * d, s = left ? -1 : 1; left = !left;
    const px = x - Math.sin(ang) * s * 26, py = y + Math.cos(ang) * s * 26;
    g.save(); g.translate(px, py); g.rotate(ang);
    g.fillStyle = 'rgba(30, 46, 78, 0.38)'; ell(g, 0, 0, 26, 15); g.fill();
    for (const k of [-1, 0, 1]) { ell(g, 26, k * 11, 9, 5.5); g.fill(); g.strokeStyle = 'rgba(30, 46, 78, 0.38)'; g.lineWidth = 2; g.beginPath(); g.moveTo(32, k * 11); g.lineTo(42, k * 13); g.stroke(); }
    g.fillStyle = 'rgba(200, 216, 238, 0.22)'; ell(g, -3, -3, 20, 9); g.fill();
    g.restore();
  }
  // The last print is smeared against the wall: something leaned there.
  g.save(); g.translate(bx, by); g.rotate(ang); g.fillStyle = 'rgba(30, 46, 78, 0.3)'; ell(g, 0, 0, 34, 22); g.fill(); g.strokeStyle = 'rgba(30, 46, 78, 0.4)'; g.lineWidth = 3; for (const k of [-10, 0, 10]) { g.beginPath(); g.moveTo(14, k); g.lineTo(36, k + 2); g.stroke(); } g.restore();
}

/** Everything painted into the floor. */
export function paintVignettes(g: G) {
  both(g, (gg, v) => {
    abandoned(gg, 2300, 1060, 0.5, '#c8402e', '#2c4a6b');
    abandoned(gg, 2540, 1090, -0.3, '#d9a02a', '#3d6b52');
    abandoned(gg, 2140, 2800, 1.2, '#8a2e3c', '#d8dde6');
    abandoned(gg, 520, 1660, 0.2, '#2c4a6b', '#c8402e');
    abandoned(gg, 640, 1030, 1.4, '#3d6b52', '#d9a02a');
    // A snowboard stuck upright by the rental shutter, drawn lying down.
    gg.save(); gg.translate(1480, 3940); gg.rotate(0.4); gg.fillStyle = '#5a3a6a'; rr(gg, -42, -10, 84, 20, 9); gg.fill(); gg.strokeStyle = INK; gg.lineWidth = 2; gg.stroke(); gg.fillStyle = 'rgba(255,255,255,0.4)'; gg.fillRect(-30, -4, 60, 3); gg.restore();
    // The snowman's builder walks up from the lodge, stands, and walks back.
    builder(gg, [[2120, 2000], [2150, 1900], [2190, 1800], [2230, 1700], [2260, 1600], [2275, 1500], [2285, 1420], [2290, 1340], [2290, 1260], [2292, 1190]]);
    builder(gg, [[2330, 1180], [2350, 1250], [2370, 1330], [2400, 1400]]);
    gg.fillStyle = '#a8402e'; ell(gg, 2250, 1205, 8, 6, 0.4); gg.fill(); gg.strokeStyle = INK; gg.lineWidth = 1.5; gg.stroke();
    gg.fillStyle = '#e2dccb'; for (const [x, y] of [[2330, 1120], [2352, 1150], [2260, 1160]] as const) { ell(gg, x, y, 9, 9); gg.fill(); gg.strokeStyle = 'rgba(40, 56, 90, 0.5)'; gg.lineWidth = 1.5; gg.stroke(); }
    label(gg, v, v ? 'GARDEN CLOSED' : 'LIFTS CLOSED', 2420, 1400, 18, 'rgba(30, 46, 78, 0.25)', { spacing: 5 });
  });
  // The yeti: out of the woods, across the north slope, to the lodge's north wall, where it stops. Only the west half has it.
  yeti(g, [1560, 1330], [1900, 2072]);
}

/** A penguin at the pool's edge, turning its head now and then, with a bucket and a hand-lettered sign. */
export function penguin(g: G, now: number, view: { x0: number; y0: number; x1: number; y1: number }) {
  const x = 2880, y = 2210;
  if (x < view.x0 - 80 || x > view.x1 + 80 || y < view.y0 - 80 || y > view.y1 + 80) return;
  const t = clock(now) / 1000;
  const look = calm ? 0 : Math.sin(t * 0.35) > 0.82 ? 1 : Math.sin(t * 0.35) < -0.82 ? -1 : 0;
  const bob = calm ? 0 : Math.sin(t * 1.4) * 0.8;
  g.save(); g.translate(x, y + bob);
  g.fillStyle = 'rgba(10, 20, 36, 0.3)'; ell(g, 4, 18, 16, 6); g.fill();
  g.fillStyle = '#e8a33a'; ell(g, -6, 17, 6, 3); g.fill(); ell(g, 6, 17, 6, 3); g.fill();
  g.fillStyle = '#1c2230'; ell(g, 0, 4, 14, 20); g.fill(); g.strokeStyle = INK; g.lineWidth = 2; g.stroke();
  g.fillStyle = '#e8ecf2'; ell(g, 1, 7, 8, 14); g.fill();
  g.fillStyle = '#1c2230'; ell(g, look * 2, -14, 10, 9); g.fill(); g.stroke();
  g.fillStyle = '#e8a33a'; g.beginPath(); g.moveTo(look * 2 + 6, -14); g.lineTo(look * 2 + 14 + look * 3, -11); g.lineTo(look * 2 + 6, -9); g.closePath(); g.fill();
  g.fillStyle = '#fff'; ell(g, look * 2 + 3, -16, 2.4, 2.4); g.fill();
  g.fillStyle = '#1c2230'; g.fillRect(-1, -16, 0, 0);
  g.restore();
  // The bucket of fish, and the sign.
  g.fillStyle = '#8a96a4'; rr(g, x + 30, y + 6, 22, 18, 4); g.fill(); g.strokeStyle = INK; g.lineWidth = 2; g.stroke();
  g.fillStyle = '#c8cdd6'; for (let i = 0; i < 3; i++) { g.save(); g.translate(x + 36 + i * 6, y + 4); g.rotate(-0.5 + i * 0.5); g.fillRect(-1, -8, 3, 10); g.restore(); }
  g.strokeStyle = INK; g.lineWidth = 4; g.beginPath(); g.moveTo(x - 50, y + 26); g.lineTo(x - 50, y - 12); g.stroke();
  g.fillStyle = '#a47848'; g.fillRect(x - 78, y - 36, 56, 26); g.strokeStyle = INK; g.lineWidth = 2; g.strokeRect(x - 78, y - 36, 56, 26);
  g.fillStyle = '#2a1a0e'; g.font = '700 8px "Barlow Condensed", sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText('PLEASE DO NOT', x - 50, y - 29); g.fillText('FEED THE', x - 50, y - 22); g.fillText('PENGUIN', x - 50, y - 15);
  void SIZE; void C; void hexA;
}
