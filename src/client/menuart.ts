import { WORLD, ZOMBIE_KINDS, type ArmorId, type GunId } from '../shared/defs.ts';
import type { ZombieView } from '../shared/protocol.ts';
import { drawSoldier, type Gait } from './bodies.ts';
import { celPart, ellipse, polygon, roundBox, TAU } from './cel.ts';
import { drawHeldGun, heldHands, muzzleTip } from './gunart.ts';
import { FLOOR, INK, shade, tint } from './palette.ts';
import { drawTargetProp } from './targetart.ts';
import { LIGHT } from './tilt.ts';
import { animateZombies, drawHorde, drawHordeEyes } from './zombieart.ts';

/**
 * The menu's painter kit: the game's own soldier, gun, zombie and target art, plus a few cel props (crate, barrel, sandbags, lamp,
 * core) and the lighting that ties a diorama together. Everything follows docs/art/STYLE.md: ink outlines, two hard cel steps, a key
 * light top left, shadows down and to the right, and lights that are always something's practical light (a lamp, a muzzle, the core).
 */
export { TAU };
export const R = WORLD.playerRadius;

/** A soldier on its feet, as the match draws it: the real `drawSoldier` with the held gun, at `scale` times the world's size. */
export type SoldierSpec = {
  x: number; y: number; scale: number; color: string; gun: GunId; aim: number; armor?: ArmorId; now: number;
  walk?: boolean; helmet?: string; camo?: string; skin?: string; breathe?: boolean; recoil?: number; flash?: number; sprint?: number;
};

export function paintSoldier(g: CanvasRenderingContext2D, k: number, s: SoldierSpec) {
  const hands = heldHands(s.gun, R, s.aim);
  const phase = s.walk ? s.now / 230 : 0;
  const gait: Gait | undefined = s.walk ? { x: 0, y: 0, t: s.now, phase, speed: 220, heading: s.aim } : undefined;
  g.save();
  g.translate(s.x, s.y);
  const breath = s.breathe === false ? 1 : 1 + 0.018 * Math.sin(s.now / 620 + s.x);
  g.scale(s.scale, s.scale * breath);
  const jump = s.recoil ?? 0;
  drawSoldier(g, s.color, 0, 0, R, {
    angle: s.aim, armor: s.armor ?? 'medium', hands: jump ? hands.map((h) => ({ x: h.x - Math.cos(s.aim) * jump, y: h.y - Math.sin(s.aim) * jump })) as unknown as typeof hands : hands, jump, flash: s.flash ?? 0,
    helmet: s.helmet, camo: s.camo, spin: s.now / 180, gait, sprint: s.sprint,
    gun: (c) => { if (jump) c.translate(-jump, 0); drawHeldGun(c, s.gun, R, s.aim, false, s.skin); },
  }, k * s.scale);
  g.restore();
}

/** Where a soldier's muzzle is on the canvas. */
export function muzzleOf(s: Pick<SoldierSpec, 'x' | 'y' | 'scale' | 'gun' | 'aim'>) {
  const m = muzzleTip(0, 0, s.aim, s.gun, R);
  return { x: s.x + m.x * s.scale, y: s.y + m.y * s.scale };
}

/** A warm pool of practical light on the floor (additive; the one place gradients are allowed). */
export function pool(g: CanvasRenderingContext2D, x: number, y: number, r: number, a: number, rgb = '255, 179, 71', squash = 0.62) {
  if (a <= 0 || r <= 0) return;
  g.save();
  g.globalCompositeOperation = 'lighter';
  g.translate(x, y);
  g.scale(1, squash);
  const gr = g.createRadialGradient(0, 0, 0, 0, 0, r);
  gr.addColorStop(0, `rgba(${rgb}, ${a})`);
  gr.addColorStop(0.45, `rgba(${rgb}, ${a * 0.45})`);
  gr.addColorStop(1, `rgba(${rgb}, 0)`);
  g.fillStyle = gr;
  g.beginPath();
  g.arc(0, 0, r, 0, TAU);
  g.fill();
  g.restore();
}

/** A muzzle flash: a hard white-hot star in the barrel's mouth and the pool it throws, as the match draws them. */
export function muzzleFlash(g: CanvasRenderingContext2D, x: number, y: number, aim: number, a: number, size = 1) {
  if (a <= 0.02) return;
  pool(g, x, y, 70 * size, 0.55 * a);
  g.save();
  g.translate(x, y);
  g.rotate(aim);
  g.lineJoin = 'round';
  g.fillStyle = '#ff9a3c';
  g.beginPath();
  g.moveTo(-2, 0);
  g.lineTo(8 * size * a, -5 * size);
  g.lineTo(22 * size * a, 0);
  g.lineTo(8 * size * a, 5 * size);
  g.closePath();
  g.fill();
  g.fillStyle = '#ffe08a';
  g.beginPath();
  g.moveTo(-1, 0);
  g.lineTo(6 * size * a, -2.6 * size);
  g.lineTo(14 * size * a, 0);
  g.lineTo(6 * size * a, 2.6 * size);
  g.closePath();
  g.fill();
  g.restore();
}

let shadeLayer: HTMLCanvasElement | null = null;

/**
 * The night's grade, drawn last over the painted world: the scene is multiplied by a steel-blue layer that each light opens up toward
 * warm white, so things near a lamp keep their own colours and things out in the dark sink to readable steel (never black).
 */
export function nightShade(g: CanvasRenderingContext2D, w: number, h: number, lights: readonly { x: number; y: number; r: number; k?: number }[], edge = '78, 92, 150') {
  const cw = g.canvas.width, ch = g.canvas.height;
  const layer = (shadeLayer ??= document.createElement('canvas'));
  if (layer.width !== cw || layer.height !== ch) { layer.width = cw; layer.height = ch; }
  const L = layer.getContext('2d')!;
  L.setTransform(1, 0, 0, 1, 0, 0);
  L.globalCompositeOperation = 'source-over';
  L.fillStyle = `rgb(${edge})`;
  L.fillRect(0, 0, cw, ch);
  L.setTransform(g.getTransform());
  L.globalCompositeOperation = 'lighter';
  for (const l of lights) {
    const a = l.k ?? 1;
    L.save();
    L.translate(l.x, l.y);
    L.scale(1, 0.72);
    const gr = L.createRadialGradient(0, 0, 0, 0, 0, l.r);
    gr.addColorStop(0, `rgba(255, 236, 205, ${Math.min(1, 0.95 * a)})`);
    gr.addColorStop(0.35, `rgba(255, 224, 182, ${0.62 * a})`);
    gr.addColorStop(0.7, `rgba(255, 210, 160, ${0.22 * a})`);
    gr.addColorStop(1, 'rgba(255, 200, 140, 0)');
    L.fillStyle = gr;
    L.beginPath();
    L.arc(0, 0, l.r, 0, TAU);
    L.fill();
    L.restore();
  }
  g.save();
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.globalCompositeOperation = 'multiply';
  g.drawImage(layer, 0, 0);
  g.restore();
  void w; void h;
}

/** The night-op concrete floor as slabs with seams, a lit patch of wear, and the grime of a yard. */
export function floor(g: CanvasRenderingContext2D, w: number, h: number, slab = 84, seed = 1, ox = 0, oy = 0) {
  g.fillStyle = FLOOR.base;
  g.fillRect(0, 0, w, h);
  let n = seed * 9301;
  const rnd = () => { n = (n * 9301 + 49297) % 233280; return n / 233280; };
  const cols = Math.ceil(w / slab) + 2, rows = Math.ceil(h / (slab * 0.8)) + 2;
  for (let j = -1; j < rows; j++) {
    for (let i = -1; i < cols; i++) {
      const x = ox + i * slab - (j & 1) * slab * 0.5, y = oy + j * slab * 0.8;
      g.fillStyle = (i + j) & 1 ? FLOOR.slabA : FLOOR.slabB;
      g.fillRect(x, y, slab, slab * 0.8);
      if (rnd() < 0.3) { g.fillStyle = 'rgba(46, 43, 39, 0.28)'; g.fillRect(x + rnd() * slab * 0.5, y + rnd() * slab * 0.4, slab * 0.35, slab * 0.22); }
    }
  }
  g.strokeStyle = FLOOR.seam;
  g.lineWidth = 2;
  g.beginPath();
  for (let j = -1; j < rows; j++) {
    const y = oy + j * slab * 0.8;
    g.moveTo(0, y); g.lineTo(w, y);
    for (let i = -1; i < cols; i++) { const x = ox + i * slab - (j & 1) * slab * 0.5; g.moveTo(x, y); g.lineTo(x, y + slab * 0.8); }
  }
  g.stroke();
}

/** A painted floor mark: ochre stencil paint, lighter than the floor. */
export function paintEllipse(g: CanvasRenderingContext2D, x: number, y: number, rx: number, ry: number, color: string, width: number, dash: number[] = [], offset = 0) {
  g.save();
  g.strokeStyle = color;
  g.lineWidth = width;
  g.setLineDash(dash);
  g.lineDashOffset = offset;
  g.beginPath();
  g.ellipse(x, y, rx, ry, 0, 0, TAU);
  g.stroke();
  g.restore();
}

const contact = (g: CanvasRenderingContext2D, x: number, y: number, rx: number, ry: number) => {
  g.fillStyle = 'rgba(10, 12, 18, 0.42)';
  g.beginPath();
  g.ellipse(x + LIGHT.x * rx * 0.2, y, rx, ry, 0, 0, TAU);
  g.fill();
};

/** A long shadow thrown down and to the right of something standing `h` tall. */
const cast = (g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number) => {
  g.fillStyle = 'rgba(10, 12, 18, 0.3)';
  g.beginPath();
  g.moveTo(x - w / 2, y); g.lineTo(x + w / 2, y);
  g.lineTo(x + w / 2 + h * LIGHT.x * 0.9, y + h * LIGHT.y * 0.34); g.lineTo(x - w / 2 + h * LIGHT.x * 0.9, y + h * LIGHT.y * 0.34);
  g.closePath();
  g.fill();
};

/** A crate standing with its feet at (x, y): lighter top face, darker front face, ink round it, planks on the lid. */
export function crate(g: CanvasRenderingContext2D, x: number, y: number, w = 38, base = '#6c7356', lip = 15) {
  cast(g, x, y, w, lip + 10);
  contact(g, x, y, w * 0.62, 5);
  g.save();
  g.translate(x, y - lip);
  celPart(g, roundBox(-w / 2, -w * 0.32, w / 2, w * 0.32, 3), base, 0, w * 0.5, 2, lip, 0);
  g.strokeStyle = shade(base, 0.62);
  g.lineWidth = 1.6;
  g.beginPath();
  g.moveTo(-w / 2 + 4, -w * 0.32 + 4); g.lineTo(w / 2 - 4, w * 0.32 - 4);
  g.moveTo(-w / 2 + 4, w * 0.32 - 4); g.lineTo(w / 2 - 4, -w * 0.32 + 4);
  g.stroke();
  g.restore();
}

/** A rust barrel: an ink-ringed top ellipse over a banded body with a specular dot on the lit side. */
export function barrel(g: CanvasRenderingContext2D, x: number, y: number, s = 1, base = '#a8552e') {
  const rx = 13 * s, h = 24 * s, ry = rx * 0.5;
  cast(g, x, y, rx * 1.7, h + 4);
  contact(g, x, y, rx * 1.05, ry * 0.9);
  g.save();
  g.translate(x, y);
  g.lineJoin = 'round';
  const body = () => { g.beginPath(); g.moveTo(-rx, -h); g.lineTo(-rx, 0); g.ellipse(0, 0, rx, ry, 0, Math.PI, 0, true); g.lineTo(rx, -h); g.closePath(); };
  g.lineWidth = 4; g.strokeStyle = INK; body(); g.stroke();
  g.fillStyle = shade(base, 0.74); body(); g.fill();
  g.save(); body(); g.clip();
  g.fillStyle = tint(base, 0.14);
  g.fillRect(-rx, -h, rx * 0.62, h + ry);
  g.fillStyle = shade(base, 0.56);
  for (const by of [-h * 0.72, -h * 0.28]) { g.fillRect(-rx, by - 2 * s, rx * 2, 4 * s); }
  g.restore();
  g.fillStyle = INK; g.beginPath(); g.ellipse(0, -h, rx + 1, ry + 1, 0, 0, TAU); g.fill();
  g.fillStyle = shade(base, 0.9); g.beginPath(); g.ellipse(0, -h, rx - 1.4, ry - 1.2, 0, 0, TAU); g.fill();
  g.fillStyle = tint(base, 0.3); g.beginPath(); g.ellipse(-rx * 0.28, -h - ry * 0.18, rx * 0.5, ry * 0.5, 0, 0, TAU); g.fill();
  g.fillStyle = INK; g.beginPath(); g.ellipse(rx * 0.1, -h, rx * 0.34, ry * 0.34, 0, 0, TAU); g.fill();
  g.fillStyle = 'rgba(255, 244, 214, 0.9)'; g.beginPath(); g.arc(-rx * 0.58, -h * 0.58, 1.8 * s, 0, TAU); g.fill();
  g.restore();
}

/** A stack of khaki sandbags `n` wide, `rows` high. */
export function sandbags(g: CanvasRenderingContext2D, x: number, y: number, n = 3, rows = 1) {
  const bw = 26, bh = 14;
  cast(g, x + (n * bw) / 2 - bw / 2, y, n * bw, rows * 12 + 6);
  for (let r = 0; r < rows; r++) {
    for (let i = 0; i < n - (r & 1); i++) {
      g.save();
      g.translate(x + i * (bw - 2) + (r & 1) * (bw / 2), y - r * 11);
      celPart(g, roundBox(-bw / 2, -bh / 2, bw / 2, bh / 2, 6), '#b4a07a', 0, 14, 1.8, 5, 0);
      g.restore();
    }
  }
}

/** A lamp post: an ink pole, a gunmetal hood and a warm bulb. The light it throws is `pool` and `nightShade`. */
export function lamp(g: CanvasRenderingContext2D, x: number, y: number, h = 62, glow = 1) {
  cast(g, x, y, 5, h * 0.9);
  contact(g, x, y, 10, 4);
  g.save();
  g.translate(x, y);
  g.lineJoin = 'round';
  celPart(g, roundBox(-7, -5, 7, 3, 3), '#4f5560', 0, 10, 1.8, 4, 0);
  g.fillStyle = INK; g.fillRect(-2.6, -h - 1, 5.2, h);
  g.fillStyle = '#6a7380'; g.fillRect(-1.2, -h, 2.4, h - 2);
  celPart(g, polygon([-12, -h], [12, -h], [8, -h - 9], [-8, -h - 9]), '#3d4450', 0, 14, 2);
  g.fillStyle = INK; g.beginPath(); g.ellipse(0, -h + 1, 8.4, 4.2, 0, 0, TAU); g.fill();
  g.fillStyle = `rgba(255, ${190 + 40 * glow | 0}, 110, 1)`; g.beginPath(); g.ellipse(0, -h + 1, 6, 2.8, 0, 0, TAU); g.fill();
  g.restore();
}

/** The Zombies core: a gunmetal pad and a cyan crystal that is its own light. */
export function core(g: CanvasRenderingContext2D, x: number, y: number, t: number, s = 1) {
  cast(g, x, y, 54 * s, 36 * s);
  contact(g, x, y, 34 * s, 10 * s);
  g.save();
  g.translate(x, y);
  g.scale(s, s);
  celPart(g, roundBox(-30, -13, 30, 13, 5), '#4f5560', 0, 30, 2.2, 9, 0);
  g.translate(0, -10);
  const bob = Math.sin(t / 700) * 1.6;
  g.translate(0, bob - 22);
  const gem = polygon([0, -26], [15, -8], [11, 16], [0, 24], [-11, 16], [-15, -8]);
  celPart(g, gem, '#4fd1e8', 0, 26, 2.2);
  g.fillStyle = 'rgba(255, 255, 255, 0.85)';
  g.beginPath(); g.moveTo(-6, -12); g.lineTo(-2, -16); g.lineTo(-1, -6); g.lineTo(-6, -2); g.closePath(); g.fill();
  g.restore();
}

/** A flag on a pole, for a held zone. */
export function flag(g: CanvasRenderingContext2D, x: number, y: number, color: string, t: number) {
  cast(g, x, y, 4, 40);
  g.save();
  g.translate(x, y);
  g.lineJoin = 'round';
  celPart(g, ellipse(0, -2, 9, 5), '#4f5560', 0, 9, 1.8, 4, 0);
  g.fillStyle = INK; g.fillRect(-2.2, -58, 4.4, 56);
  g.fillStyle = '#c9c4b4'; g.fillRect(-0.8, -57, 1.6, 54);
  const w = Math.sin(t / 380) * 2;
  g.beginPath();
  g.moveTo(1, -56); g.lineTo(26, -52 + w); g.lineTo(23, -43 - w * 0.5); g.lineTo(27, -34 + w); g.lineTo(1, -37); g.closePath();
  g.lineWidth = 3.6; g.strokeStyle = INK; g.stroke();
  g.fillStyle = color; g.fill();
  g.save(); g.clip();
  g.fillStyle = 'rgba(10, 12, 18, 0.28)'; g.fillRect(0, -44, 30, 12);
  g.restore();
  g.fillStyle = INK; g.beginPath(); g.arc(0, -59, 3.4, 0, TAU); g.fill();
  g.fillStyle = '#ffd34d'; g.beginPath(); g.arc(-0.6, -59.6, 1.6, 0, TAU); g.fill();
  g.restore();
}

/** A range target, from the range's own art. */
export function target(g: CanvasRenderingContext2D, x: number, y: number, kind: 'paper' | 'plank' | 'dummy' | 'rail', s = 0.7, rock = 0, holes = 0, flashA = 0) {
  g.save();
  g.translate(x, y);
  g.scale(s, s);
  g.rotate(rock);
  const hs: [number, number][] = [];
  for (let i = 0; i < holes; i++) hs.push([[3, -5, 6, -9, 0][i % 5]!, -32 + [1, -3, 6, 2, -6][i % 5]!]);
  drawTargetProp(g, kind, hs, flashA);
  g.restore();
}

/** An airdrop crate: orange bands over a supply-drab lid, a small parachute pack on top. */
export function supply(g: CanvasRenderingContext2D, x: number, y: number) {
  crate(g, x, y, 40, '#5f6a48', 17);
  g.save();
  g.translate(x, y - 17);
  g.fillStyle = '#ff5a1f';
  g.fillRect(-20, -4, 40, 3);
  g.strokeStyle = INK; g.lineWidth = 1.4; g.strokeRect(-20, -4, 40, 3);
  g.restore();
}

// ---- zombies

let zid = 7000;
/** Drives and draws a few of the horde's real zombies; `list` positions are driven each frame so they walk, turn and sway as in play. */
export type Shambler = { id: number; kind: ZombieView[1]; x: number; y: number };
export const shambler = (kind: (typeof ZOMBIE_KINDS)[number], x: number, y: number): Shambler => ({ id: zid++, kind: ZOMBIE_KINDS.indexOf(kind), x, y });
export function paintHorde(g: CanvasRenderingContext2D, k: number, list: readonly Shambler[], now: number, toward: { x: number; y: number }, scale: number) {
  const view: ZombieView[] = list.map((z) => [z.id, z.kind, z.x / scale, z.y / scale, 10]);
  animateZombies(view, now, { x: toward.x / scale, y: toward.y / scale }, () => null, () => {});
  g.save();
  g.scale(scale, scale);
  drawHorde(g, view, new Map(), now, k * scale);
  drawHordeEyes(g, 1);
  g.restore();
}
