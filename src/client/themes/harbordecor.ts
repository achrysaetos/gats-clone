import { SIZE } from '../../shared/maps/causewaydata.ts';
import { INK } from '../palette.ts';
import { C, TAU, calm, clock, hash2, hexA, inView, painted, sprite, stamp } from './harborkit.ts';
import type { ThemeView } from './registry.ts';

/**
 * The small stories of the harbour, hand-placed: a fisherman's chair and bucket and an abandoned rod at the end of the pier, the
 * Good Forklift found at last in the salvage yard, a tin of confiscated rubber ducks in customs, paint cans round the hull on blocks,
 * a lighthouse keeper's bench, a toy sailor on a bollard, a rubber duck adrift in the pond and a bottle with a note in the sea.
 * The west half is the working port and the east half the fishing side: same walls, different belongings. Everything sits in the margins
 * (the test checks none stands on a solid), is drawn flat on the ground, and moves slowly or not at all.
 */

type G = CanvasRenderingContext2D;
export type Item = { k: string; x: number; y: number; rot?: number; text?: string; w?: number };

export const WEST_ITEMS: readonly Item[] = [
  // The end of the pier: somebody's afternoon, left exactly as it was.
  { k: 'chair', x: 372, y: 5330, rot: Math.PI },
  { k: 'bucket', x: 352, y: 5396 },
  { k: 'rod', x: 372, y: 5292, rot: Math.PI },
  { k: 'thermos', x: 396, y: 5360 },
  // The lighthouse: the keeper's bench and logbook, the light's motto in paint, a toy sailor on watch.
  { k: 'bench', x: 700, y: 905, rot: 0 },
  { k: 'logbook', x: 700, y: 893 },
  { k: 'toy', x: 640, y: 690 },
  { k: 'motto', x: 660, y: 800, text: 'KEEP THE LIGHT', rot: -Math.PI / 2 },
  // Dry dock: the shipwrights' things.
  { k: 'toolchest', x: 2030, y: 430 },
  { k: 'paint', x: 2058, y: 520 },
  { k: 'paint', x: 2036, y: 546 },
  { k: 'wetpaint', x: 2020, y: 640 },
  { k: 'tarp', x: 2040, y: 760 },
  { k: 'lifebuoy', x: 2495, y: 1090 },
  // The Good Forklift, found.
  { k: 'forklift', x: 2610, y: 1520, rot: 0.3 },
  { k: 'note', x: 2650, y: 1590, text: 'FOUND IT. THE UNION' },
  // Customs.
  { k: 'ducks', x: 1990, y: 5330 },
  { k: 'stamp', x: 2380, y: 5112 },
  // Fish shed and net loft.
  { k: 'bowl', x: 1384, y: 4300 },
  { k: 'nets', x: 2470, y: 4200 },
  { k: 'ropecoil', x: 2490, y: 4330 },
  // Quay: a lunchbox and a radio between the crane's legs; chalk tally on the stone.
  { k: 'radio', x: 1060, y: 2910 },
  { k: 'lunch', x: 1090, y: 2940 },
  { k: 'tally', x: 1300, y: 1700, text: '0 DAYS WITHOUT AN INCIDENT' },
  { k: 'tally', x: 1235, y: 3985, text: 'NIGHT SHIFT. LOCK UP BY 10' },
  { k: 'heart', x: 760, y: 5300 },
  { k: 'kilroy', x: 2020, y: 2528 },
  // Decks.
  { k: 'chair', x: 360, y: 3670, rot: -1.2 },
  { k: 'mug', x: 340, y: 3700 },
  { k: 'bucket', x: 660, y: 4170 },
  { k: 'mop', x: 640, y: 4130, rot: 0.6 },
];

export const EAST_ITEMS: readonly Item[] = [
  { k: 'bike', x: 5200, y: 760, rot: 0.2 },
  { k: 'chair', x: 5640, y: 670, rot: 0 },
  { k: 'newspaper', x: 5600, y: 640 },
  { k: 'bench', x: 5300, y: 5095, rot: Math.PI },
  { k: 'logbook', x: 5300, y: 5107 },
  { k: 'toy', x: 5360, y: 5310 },
  { k: 'motto', x: 5340, y: 5200, text: 'THE LIGHT STAYS ON', rot: Math.PI / 2 },
  { k: 'toolchest', x: 3970, y: 5570 },
  { k: 'paint', x: 3942, y: 5480 },
  { k: 'lifebuoy', x: 3505, y: 4910 },
  { k: 'nets', x: 3530, y: 1800 },
  { k: 'ropecoil', x: 3510, y: 1670 },
  { k: 'bowl', x: 4616, y: 1700 },
  { k: 'radio', x: 4940, y: 3090 },
  { k: 'lunch', x: 4910, y: 3060 },
  { k: 'tally', x: 4700, y: 4300, text: 'ICE IS NOT A TOY' },
  { k: 'tally', x: 4770, y: 2240, text: 'MIND THE GAP. IT BITES' },
  { k: 'pallet', x: 4010, y: 790 },
  { k: 'pallet', x: 3960, y: 830 },
  { k: 'heart', x: 5240, y: 700 },
];

const SIZEOF: Record<string, number> = { forklift: 160, nets: 150, bike: 90, motto: 380, tally: 420, note: 240 };

/* -- the pieces -------------------------------------------------------------------------------------------------- */

const shadow = (g: G, x: number, y: number, rx: number, ry: number) => { g.fillStyle = 'rgba(10,12,16,0.32)'; g.beginPath(); g.ellipse(x + 3, y + 5, rx, ry, 0, 0, TAU); g.fill(); };
const ink = (g: G, w = 2) => { g.strokeStyle = INK; g.lineWidth = w; g.lineJoin = 'round'; };
function box(g: G, x: number, y: number, w: number, h: number, ht: number, top: string, front: string) {
  g.fillStyle = front; g.fillRect(x, y + h, w, ht); ink(g); g.strokeRect(x, y + h, w, ht);
  g.fillStyle = top; g.fillRect(x, y, w, h); g.strokeRect(x, y, w, h);
}

const PAINT: Record<string, (g: G, it: Item) => void> = {
  chair(g) { shadow(g, 0, 0, 22, 14); g.fillStyle = '#4f7fbf'; g.fillRect(-18, -16, 36, 32); ink(g); g.strokeRect(-18, -16, 36, 32); g.fillStyle = '#e8e0c8'; for (let i = -12; i < 14; i += 8) g.fillRect(-16, i - 2, 32, 4); g.fillStyle = '#3a5f94'; g.fillRect(-18, -16, 5, 32); g.fillRect(13, -16, 5, 32); },
  bucket(g) { shadow(g, 0, 0, 14, 9); g.fillStyle = '#a8442e'; g.beginPath(); g.arc(0, 0, 12, 0, TAU); g.fill(); ink(g); g.stroke(); g.fillStyle = '#6a2a1c'; g.beginPath(); g.arc(0, 0, 8.5, 0, TAU); g.fill(); g.fillStyle = '#9ec6d0'; g.beginPath(); g.ellipse(-2, 1, 5, 2.4, 0.4, 0, TAU); g.fill(); g.beginPath(); g.moveTo(3, 1); g.lineTo(7, -1); g.lineTo(7, 3); g.fill(); },
  thermos(g) { shadow(g, 0, 0, 7, 5); g.fillStyle = '#3f7d78'; g.beginPath(); g.arc(0, 0, 6, 0, TAU); g.fill(); ink(g); g.stroke(); g.fillStyle = '#e4dcc8'; g.beginPath(); g.arc(0, 0, 3.4, 0, TAU); g.fill(); },
  rod(g) { g.strokeStyle = INK; g.lineWidth = 4; g.lineCap = 'round'; g.beginPath(); g.moveTo(0, 0); g.lineTo(-86, 4); g.stroke(); g.strokeStyle = '#8d6b44'; g.lineWidth = 2; g.stroke(); g.fillStyle = '#2f343c'; g.beginPath(); g.arc(-6, 0, 5, 0, TAU); g.fill(); ink(g, 1.4); g.stroke(); },
  bench(g) { shadow(g, 0, 4, 52, 10); g.fillStyle = '#664a2d'; g.fillRect(-48, -4, 96, 22); ink(g); g.strokeRect(-48, -4, 96, 22); g.fillStyle = '#8d6b44'; g.fillRect(-48, -14, 96, 14); g.strokeRect(-48, -14, 96, 14); g.strokeStyle = 'rgba(40,26,14,0.55)'; for (let x = -32; x < 48; x += 32) { g.beginPath(); g.moveTo(x, -14); g.lineTo(x, 0); g.stroke(); } },
  logbook(g) { g.fillStyle = '#2a3a52'; g.fillRect(-9, -7, 18, 14); ink(g, 1.6); g.strokeRect(-9, -7, 18, 14); g.fillStyle = '#e8e0c8'; g.fillRect(-7, -5, 7, 10); g.fillRect(1, -5, 6, 10); },
  toy(g) { shadow(g, 0, 0, 9, 6); g.fillStyle = '#3f6b3a'; g.beginPath(); g.ellipse(0, 0, 7, 9, 0, 0, TAU); g.fill(); ink(g, 1.6); g.stroke(); g.fillStyle = '#4a7a42'; g.beginPath(); g.arc(0, -8, 5, 0, TAU); g.fill(); g.stroke(); g.strokeStyle = '#2a2a2a'; g.lineWidth = 2; g.beginPath(); g.moveTo(5, -2); g.lineTo(13, -10); g.stroke(); },
  motto(g, it) { painted(g, it.text ?? '', 0, 0, 30, hexA('#f2ecd8', 0.5), 0, 0.2); },
  toolchest(g) { shadow(g, 0, 0, 34, 14); box(g, -28, -16, 56, 28, 10, '#a8442e', '#6e2c1e'); g.fillStyle = '#d6c14a'; g.fillRect(-4, -8, 8, 8); g.strokeStyle = 'rgba(0,0,0,0.3)'; g.beginPath(); g.moveTo(-28, -2); g.lineTo(28, -2); g.stroke(); },
  paint(g) { shadow(g, 0, 0, 12, 8); g.fillStyle = '#c8c4b4'; g.beginPath(); g.arc(0, 0, 10, 0, TAU); g.fill(); ink(g); g.stroke(); g.fillStyle = '#a8442e'; g.beginPath(); g.arc(0, 0, 6.5, 0, TAU); g.fill(); g.fillStyle = '#a8442e'; g.beginPath(); g.ellipse(13, 6, 5, 3, 0.4, 0, TAU); g.fill(); },
  wetpaint(g) { shadow(g, 0, 0, 16, 7); g.fillStyle = '#e8c040'; g.beginPath(); g.moveTo(0, -22); g.lineTo(18, 8); g.lineTo(-18, 8); g.closePath(); g.fill(); ink(g); g.stroke(); g.fillStyle = INK; g.font = '800 7px "Barlow Condensed", sans-serif'; g.textAlign = 'center'; g.fillText('WET', 0, 0); g.fillText('PAINT', 0, 7); },
  tarp(g) { g.fillStyle = 'rgba(10,12,16,0.3)'; g.beginPath(); g.moveTo(-32, -22); g.lineTo(30, -26); g.lineTo(38, 20); g.lineTo(-28, 26); g.closePath(); g.fill(); g.fillStyle = '#3f6b8c'; g.beginPath(); g.moveTo(-34, -26); g.lineTo(28, -30); g.lineTo(36, 16); g.lineTo(-30, 22); g.closePath(); g.fill(); ink(g); g.stroke(); g.strokeStyle = 'rgba(0,0,0,0.3)'; g.beginPath(); g.moveTo(-12, -28); g.lineTo(-6, 20); g.moveTo(10, -28); g.lineTo(18, 18); g.stroke(); g.fillStyle = '#b09468'; g.beginPath(); g.arc(-34, -26, 3, 0, TAU); g.arc(36, 16, 3, 0, TAU); g.fill(); },
  lifebuoy(g) { shadow(g, 0, 0, 20, 12); g.fillStyle = '#f2ead6'; g.beginPath(); g.arc(0, 0, 17, 0, TAU); g.fill(); ink(g); g.stroke(); g.fillStyle = '#b4442e'; for (let k = 0; k < 4; k++) { g.beginPath(); g.arc(0, 0, 17, (k * TAU) / 4 - 0.4, (k * TAU) / 4 + 0.4); g.arc(0, 0, 8, (k * TAU) / 4 + 0.4, (k * TAU) / 4 - 0.4, true); g.closePath(); g.fill(); } g.fillStyle = '#4d5058'; g.beginPath(); g.arc(0, 0, 8, 0, TAU); g.fill(); g.stroke(); },
  forklift(g) { shadow(g, 0, 8, 62, 22); g.fillStyle = '#d6a324'; g.fillRect(-34, -22, 58, 44); ink(g); g.strokeRect(-34, -22, 58, 44); g.fillStyle = '#3a3f46'; g.fillRect(-40, -26, 10, 12); g.fillRect(-40, 14, 10, 12); g.fillRect(14, -26, 12, 12); g.fillRect(14, 14, 12, 12); g.fillStyle = '#6a727a'; g.fillRect(26, -16, 40, 6); g.fillRect(26, 10, 40, 6); g.strokeStyle = INK; g.strokeRect(26, -16, 40, 6); g.strokeRect(26, 10, 40, 6); g.fillStyle = '#2f343c'; g.fillRect(-20, -10, 24, 20); g.fillStyle = '#e4dcc8'; g.fillRect(-14, -6, 8, 12); g.strokeStyle = '#2f343c'; g.lineWidth = 3; g.strokeRect(-26, -18, 36, 36); },
  note(g, it) { g.fillStyle = '#f2ead6'; g.save(); g.rotate(-0.06); g.fillRect(-60, -16, 120, 32); ink(g, 1.4); g.strokeRect(-60, -16, 120, 32); g.fillStyle = '#2a2a2a'; g.font = '700 11px "Barlow Condensed", sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(it.text ?? '', 0, 1); g.restore(); },
  ducks(g) { shadow(g, 0, 0, 30, 18); box(g, -24, -14, 48, 28, 8, '#a8844e', '#6e5430'); for (const [x, y] of [[-12, -4], [2, 4], [12, -6], [-2, -8]] as const) { g.fillStyle = '#ffd34d'; g.beginPath(); g.arc(x, y, 5, 0, TAU); g.fill(); ink(g, 1.2); g.stroke(); g.fillStyle = '#e07a30'; g.fillRect(x + 4, y - 1, 4, 2.4); } },
  stamp(g) { g.fillStyle = '#2f343c'; g.fillRect(-9, -7, 18, 14); ink(g, 1.4); g.strokeRect(-9, -7, 18, 14); g.fillStyle = '#c24a38'; g.fillRect(-6, -4, 12, 8); },
  bowl(g) { shadow(g, 0, 0, 10, 6); g.fillStyle = '#d8d0bc'; g.beginPath(); g.arc(0, 0, 8, 0, TAU); g.fill(); ink(g); g.stroke(); g.fillStyle = '#8a6a46'; g.beginPath(); g.arc(0, 0, 5, 0, TAU); g.fill(); g.fillStyle = '#9ec6d0'; g.beginPath(); g.ellipse(-1, 0, 3, 1.4, 0, 0, TAU); g.fill(); },
  nets(g) { g.strokeStyle = INK; g.lineWidth = 5; g.beginPath(); g.moveTo(-6, -64); g.lineTo(-6, 64); g.moveTo(54, -64); g.lineTo(54, 64); g.stroke(); g.strokeStyle = '#8d6b44'; g.lineWidth = 3; g.stroke(); g.fillStyle = hexA('#6a8a74', 0.55); g.beginPath(); g.moveTo(-6, -60); g.quadraticCurveTo(24, -30, 54, -60); g.lineTo(54, 58); g.quadraticCurveTo(24, 78, -6, 58); g.closePath(); g.fill(); g.strokeStyle = 'rgba(30,50,40,0.6)'; g.lineWidth = 1; for (let i = 0; i < 12; i++) { g.beginPath(); g.moveTo(-6, -60 + i * 10); g.lineTo(54, -60 + i * 10); g.stroke(); } for (let i = 0; i < 6; i++) { g.beginPath(); g.moveTo(-6 + i * 12, -60); g.lineTo(-6 + i * 12, 62); g.stroke(); } g.fillStyle = '#e07a30'; for (let i = 0; i < 5; i++) { g.beginPath(); g.arc(-4, -50 + i * 25, 4, 0, TAU); g.fill(); } },
  ropecoil(g) { shadow(g, 0, 0, 24, 14); for (let k = 0; k < 4; k++) { g.fillStyle = k % 2 ? '#b09468' : '#c9b080'; g.beginPath(); g.arc(0, 0, 20 - k * 4.5, 0, TAU); g.fill(); g.strokeStyle = 'rgba(40,30,15,0.5)'; g.lineWidth = 1.4; g.stroke(); } ink(g); g.beginPath(); g.arc(0, 0, 20, 0, TAU); g.stroke(); },
  radio(g) { shadow(g, 0, 0, 14, 8); box(g, -11, -8, 22, 12, 5, '#a8442e', '#6e2c1e'); g.fillStyle = '#e4dcc8'; g.beginPath(); g.arc(-4, -2, 3.4, 0, TAU); g.fill(); g.fillStyle = '#2f343c'; g.fillRect(2, -6, 7, 8); g.strokeStyle = INK; g.lineWidth = 1.6; g.beginPath(); g.moveTo(8, -8); g.lineTo(14, -22); g.stroke(); },
  lunch(g) { shadow(g, 0, 0, 12, 7); box(g, -10, -6, 20, 10, 5, '#4d7a52', '#2e4a32'); g.fillStyle = '#d6c14a'; g.fillRect(-2, -6, 4, 5); },
  tally(g, it) { painted(g, it.text ?? '', 0, 0, 20, hexA('#e8e2d0', 0.42), 0, 0.12); },
  heart(g) { g.fillStyle = hexA('#d8605a', 0.8); g.beginPath(); g.moveTo(0, 8); g.bezierCurveTo(-14, -2, -9, -14, 0, -6); g.bezierCurveTo(9, -14, 14, -2, 0, 8); g.fill(); g.strokeStyle = hexA(INK, 0.6); g.lineWidth = 1.4; g.stroke(); painted(g, 'J + M', 0, 16, 8, hexA('#2a1a10', 0.6), 0, 0.1); },
  kilroy(g) { g.strokeStyle = hexA('#f2ecd8', 0.75); g.lineWidth = 2.4; g.lineCap = 'round'; g.beginPath(); g.moveTo(-26, 4); g.lineTo(26, 4); g.stroke(); g.beginPath(); g.arc(0, 4, 14, Math.PI, 0); g.stroke(); g.fillStyle = hexA('#f2ecd8', 0.75); g.beginPath(); g.arc(-5, -2, 2.2, 0, TAU); g.arc(5, -2, 2.2, 0, TAU); g.fill(); g.beginPath(); g.moveTo(0, -2); g.lineTo(0, 12); g.stroke(); g.lineWidth = 3; g.beginPath(); g.moveTo(-30, 4); g.lineTo(-22, 4); g.moveTo(22, 4); g.lineTo(30, 4); g.stroke(); },
  mug(g) { shadow(g, 0, 0, 7, 5); g.fillStyle = '#f2ead6'; g.beginPath(); g.arc(0, 0, 6, 0, TAU); g.fill(); ink(g, 1.6); g.stroke(); g.fillStyle = '#4a3020'; g.beginPath(); g.arc(0, 0, 4, 0, TAU); g.fill(); },
  mop(g) { g.strokeStyle = INK; g.lineWidth = 4; g.lineCap = 'round'; g.beginPath(); g.moveTo(0, 0); g.lineTo(56, 0); g.stroke(); g.strokeStyle = '#a8844e'; g.lineWidth = 2; g.stroke(); g.fillStyle = '#d8d0bc'; g.beginPath(); g.ellipse(-4, 0, 9, 6, 0, 0, TAU); g.fill(); ink(g, 1.4); g.stroke(); },
  bike(g) { shadow(g, 0, 4, 40, 12); g.strokeStyle = INK; g.lineWidth = 3; for (const x of [-26, 26]) { g.beginPath(); g.arc(x, 0, 14, 0, TAU); g.stroke(); } g.strokeStyle = '#3f7d78'; g.lineWidth = 3.4; g.beginPath(); g.moveTo(-26, 0); g.lineTo(-4, -10); g.lineTo(18, -8); g.lineTo(26, 0); g.moveTo(-4, -10); g.lineTo(2, 0); g.lineTo(-26, 0); g.stroke(); g.fillStyle = '#8d6b44'; g.fillRect(16, -22, 14, 10); ink(g, 1.6); g.strokeRect(16, -22, 14, 10); g.strokeStyle = INK; g.lineWidth = 3; g.beginPath(); g.moveTo(22, -8); g.lineTo(24, -16); g.stroke(); },
  newspaper(g) { g.save(); g.rotate(0.2); g.fillStyle = '#e8e2d0'; g.fillRect(-10, -7, 22, 14); ink(g, 1.2); g.strokeRect(-10, -7, 22, 14); g.fillStyle = '#7a7a72'; for (let y = -4; y < 6; y += 3) g.fillRect(-8, y, 18, 1.2); g.fillStyle = '#d8b878'; g.beginPath(); g.ellipse(2, 0, 4, 2.4, 0.5, 0, TAU); g.fill(); g.restore(); },
  pallet(g) { shadow(g, 0, 0, 34, 14); box(g, -28, -16, 56, 30, 6, '#a8844e', '#6e5430'); g.strokeStyle = 'rgba(40,26,10,0.5)'; g.lineWidth = 2; for (let x = -18; x < 28; x += 14) { g.beginPath(); g.moveTo(x, -16); g.lineTo(x, 14); g.stroke(); } g.fillStyle = '#d8d0bc'; g.fillRect(-10, -6, 20, 10); g.fillStyle = INK; g.font = '800 6px sans-serif'; g.textAlign = 'center'; g.fillText('FRAGILE', 0, 1); },
};

const spriteOf = (it: Item): { s: ReturnType<typeof sprite>; w: number } => {
  const half = SIZEOF[it.k] ?? 56;
  const key = `deco:${it.k}:${it.text ?? ''}`;
  const s = sprite(key, half * 2, half * 2, 4, (g) => { g.translate(half, half); PAINT[it.k]?.(g, it); });
  return { s, w: half };
};

function drawItems(g: G, view: ThemeView, items: readonly Item[]): void {
  for (const it of items) {
    if (!inView(view, it.x, it.y, 260)) continue;
    const { s, w } = spriteOf(it);
    g.save();
    g.translate(it.x, it.y);
    if (it.rot) g.rotate(it.rot);
    g.drawImage(s.canvas, -w + s.ox, -w + s.oy, s.w, s.h);
    g.restore();
  }
}

/** The floor-level belongings, drawn right over the walls' feet and under the bodies. */
export function drawHarborDecor(g: G, now: number, view: ThemeView): void {
  drawItems(g, view, WEST_ITEMS);
  drawItems(g, view, EAST_ITEMS);
  // A float bobs where the abandoned line meets the water.
  const t = clock(now) * 0.001;
  for (const [x, y] of [[286, 5296], [SIZE - 286, SIZE - 5296]] as const) {
    if (!inView(view, x, y, 40)) continue;
    const dy = calm ? 0 : Math.sin(t * 1.3) * 2.2;
    g.strokeStyle = 'rgba(230,236,226,0.55)'; g.lineWidth = 1.4; g.beginPath(); g.moveTo(x + 8, y - 4); g.lineTo(x, y + dy); g.stroke();
    g.fillStyle = '#f2ead6'; g.beginPath(); g.arc(x, y + dy, 5, 0, TAU); g.fill(); g.strokeStyle = INK; g.lineWidth = 1.6; g.stroke();
    g.fillStyle = '#c24a38'; g.beginPath(); g.arc(x, y + dy - 2, 3, Math.PI, 0); g.fill();
  }
}

/** Things on the water: a rubber duck adrift in the pond, a bottle with a note, a tied rowing boat, a lifebuoy, driftwood. */
export function drawHarborDecorGround(g: G, now: number, view: ThemeView): void {
  const t = clock(now) * 0.001;
  const bob = (ph: number, a = 1.6) => (calm ? 0 : Math.sin(t * 0.9 + ph) * a);
  // The duck: it circles the south pond once in about four minutes, riding the ripples.
  {
    const a = calm ? 0.8 : t * 0.026;
    const cx = 2820, cy = 3470, x = cx + Math.cos(a) * 110, y = cy + Math.sin(a) * 120 + bob(0.4);
    if (inView(view, x, y, 40)) {
      g.fillStyle = 'rgba(8,24,32,0.3)'; g.beginPath(); g.ellipse(x + 3, y + 6, 14, 9, 0, 0, TAU); g.fill();
      g.fillStyle = '#ffd34d'; g.beginPath(); g.ellipse(x, y, 13, 10, 0, 0, TAU); g.fill(); ink(g); g.stroke();
      g.beginPath(); g.arc(x + 8, y - 8, 7, 0, TAU); g.fill(); g.stroke();
      g.fillStyle = '#e07a30'; g.beginPath(); g.moveTo(x + 14, y - 9); g.lineTo(x + 22, y - 7); g.lineTo(x + 14, y - 5); g.closePath(); g.fill(); g.stroke();
      g.fillStyle = INK; g.beginPath(); g.arc(x + 10, y - 10, 1.4, 0, TAU); g.fill();
      g.strokeStyle = 'rgba(230,240,236,0.5)'; g.lineWidth = 1.6; g.beginPath(); g.ellipse(x, y + 3, 20 + bob(1, 2), 13, 0, 0, TAU); g.stroke();
    }
  }
  // The bottle, drifting along the mole on the swell, with a rolled note in it.
  {
    const x = 640 + (calm ? 0 : Math.sin(t * 0.05) * 90) , y = 1128 + bob(2, 2.4);
    if (inView(view, x, y, 40)) {
      g.save(); g.translate(x, y); g.rotate(-0.5 + bob(3, 0.1));
      g.fillStyle = 'rgba(8,24,32,0.3)'; g.beginPath(); g.ellipse(3, 5, 17, 5, 0, 0, TAU); g.fill();
      g.fillStyle = '#9fd6b0'; g.beginPath(); g.ellipse(0, 0, 15, 5, 0, 0, TAU); g.fill(); ink(g, 1.6); g.stroke();
      g.fillStyle = '#c9b080'; g.fillRect(-7, -2, 12, 4); g.fillStyle = '#6a4a2a'; g.fillRect(15, -2.4, 4, 4.8);
      g.restore();
    }
  }
  // The rowing boat tied up at the pier's elbow.
  {
    const x = 232, y = 5120 + bob(1.2, 2);
    if (inView(view, x, y, 90)) {
      g.save(); g.translate(x, y); g.rotate(0.1);
      g.fillStyle = 'rgba(8,24,32,0.32)'; g.beginPath(); g.ellipse(5, 8, 60, 22, 0, 0, TAU); g.fill();
      g.fillStyle = '#d8d0bc'; g.beginPath(); g.moveTo(-58, 0); g.quadraticCurveTo(-30, -26, 52, -20); g.quadraticCurveTo(70, 0, 52, 20); g.quadraticCurveTo(-30, 26, -58, 0); g.fill(); ink(g); g.stroke();
      g.fillStyle = '#8d6b44'; g.beginPath(); g.moveTo(-50, 0); g.quadraticCurveTo(-26, -17, 44, -13); g.quadraticCurveTo(58, 0, 44, 13); g.quadraticCurveTo(-26, 17, -50, 0); g.fill();
      g.fillStyle = '#a8844e'; g.fillRect(-10, -16, 8, 32); g.fillRect(22, -14, 8, 28); g.strokeStyle = INK; g.lineWidth = 1.6; g.strokeRect(-10, -16, 8, 32); g.strokeRect(22, -14, 8, 28);
      g.strokeStyle = '#c4aa78'; g.lineWidth = 2; g.beginPath(); g.moveTo(66, -4); g.quadraticCurveTo(100, 10, 128, 0); g.stroke();
      g.restore();
    }
  }
  // Lifebuoys adrift off the ships, and driftwood.
  for (const [i, [x, y]] of ([[700, 1830], [4100, 2200], [560, 3980], [3980, 5790]] as const).entries()) {
    if (!inView(view, x, y, 40)) continue;
    const yy = y + bob(i * 2.1, 2);
    g.fillStyle = 'rgba(8,24,32,0.3)'; g.beginPath(); g.ellipse(x + 3, yy + 5, 18, 10, 0, 0, TAU); g.fill();
    g.fillStyle = '#f2ead6'; g.beginPath(); g.arc(x, yy, 15, 0, TAU); g.fill(); ink(g); g.stroke();
    g.fillStyle = '#b4442e'; for (let k = 0; k < 4; k++) { g.beginPath(); g.arc(x, yy, 15, (k * TAU) / 4 - 0.4, (k * TAU) / 4 + 0.4); g.arc(x, yy, 7, (k * TAU) / 4 + 0.4, (k * TAU) / 4 - 0.4, true); g.closePath(); g.fill(); }
    g.fillStyle = C.deep; g.beginPath(); g.arc(x, yy, 7, 0, TAU); g.fill(); g.stroke();
  }
  void hash2;
}

/** Hung over the players: laundry on a line between the trawler's A-frame legs, bunting along the pier. */
export function drawHarborDecorOver(g: G, now: number, view: ThemeView): void {
  const t = clock(now) * 0.001;
  const sway = (ph: number) => (calm ? 0 : Math.sin(t * 1.1 + ph) * 3);
  const laundry = (ax: number, ay: number, bx: number, by: number, seed: number) => {
    if (!inView(view, (ax + bx) / 2, (ay + by) / 2, 200)) return;
    g.strokeStyle = INK; g.lineWidth = 3; g.beginPath(); g.moveTo(ax, ay); g.quadraticCurveTo((ax + bx) / 2, (ay + by) / 2 + 22, bx, by); g.stroke();
    g.strokeStyle = '#c4aa78'; g.lineWidth = 1.6; g.stroke();
    const cols = ['#c24a38', '#e8e4d0', '#3f6b8c', '#e8c040', '#7a9a6a'];
    for (let i = 0; i < 5; i++) {
      const u = (i + 0.7) / 5.6, x = ax + (bx - ax) * u, y = ay + (by - ay) * u + Math.sin(u * Math.PI) * 18;
      g.fillStyle = cols[(i + seed) % cols.length]!;
      g.beginPath(); g.moveTo(x - 9, y); g.lineTo(x + 9, y); g.lineTo(x + 8 + sway(i + seed) * 0.4, y + 22 + (i % 2) * 8); g.lineTo(x - 8 + sway(i + seed) * 0.4, y + 22 + (i % 2) * 8); g.closePath(); g.fill();
      g.strokeStyle = INK; g.lineWidth = 1.6; g.stroke();
    }
  };
  // West trawler: between the two A-frame posts at u 810 (x 900 - v), y 4000 + 810; east is the half-turn.
  laundry(900 - 70, 4810 - 70, 900 - 310, 4810 - 70, 0);
  laundry(SIZE - 900 + 70, SIZE - 4810 - 70, SIZE - 900 + 310, SIZE - 4810 - 70, 2);
  // Bunting across the pier's terrace and the east boardwalk.
  for (const [ax, ay, bx, by] of [[740, 5120, 900, 5160], [740, 5440, 900, 5400], [SIZE - 740, SIZE - 5440, SIZE - 900, SIZE - 5400], [SIZE - 740, SIZE - 5120, SIZE - 900, SIZE - 5160]] as const) {
    if (!inView(view, (ax + bx) / 2, (ay + by) / 2, 140)) continue;
    g.strokeStyle = INK; g.lineWidth = 2.4; g.beginPath(); g.moveTo(ax, ay - 30); g.quadraticCurveTo((ax + bx) / 2, (ay + by) / 2 - 12, bx, by - 30); g.stroke();
    const cols = ['#c24a38', '#e8e4d0', '#3f6b8c', '#e8c040'];
    for (let i = 0; i < 8; i++) {
      const u = (i + 0.5) / 8, x = ax + (bx - ax) * u, y = ay - 30 + (by - ay) * u + Math.sin(u * Math.PI) * 14;
      g.fillStyle = cols[i % cols.length]!; const f = sway(i) * 0.3;
      g.beginPath(); g.moveTo(x - 8, y); g.lineTo(x + 8, y); g.lineTo(x + f, y + 15); g.closePath(); g.fill(); g.strokeStyle = INK; g.lineWidth = 1.4; g.stroke();
    }
  }
  void stamp;
}
