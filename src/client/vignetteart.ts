import { seeded } from './grain.ts';
import { INK } from './palette.ts';
import { FLOOR_VIGNETTES, type Vignette } from './vignettes.ts';

/**
 * The art for the small stories (vignettes.ts). Floor pieces are baked into the ground layer; pieces on a wall's face or top
 * are drawn per frame, culled to the view, and the few that move do it slowly: a flag swaying under 1 Hz, a charger's LED
 * blinking at 0.6 Hz, a tiny TV changing its picture every ~0.8 s, a cat's tail. Reduced motion holds them all still.
 * Same kit as everything else: ink outline on every shape, a lit step and a shade step, a contact shadow under anything standing.
 */

const TAU = Math.PI * 2;
const GUN = '#4f5560', GUN_D = '#3d4450', STEEL = '#8b929c', BONE = '#ece6d6', MUSTARD = '#c9a23c', RED = '#a8493f', OLIVE = '#6c7356', RUST = '#a8552e', WOOD = '#7a5a3a';
const HIGHLIGHT = 'rgba(255, 255, 255, 0.24)', SHADE = 'rgba(10, 12, 16, 0.3)', CONTACT = 'rgba(20, 24, 32, 0.3)';

const ink = (g: CanvasRenderingContext2D, w = 1.8) => { g.lineWidth = w; g.lineJoin = 'round'; g.strokeStyle = INK; g.stroke(); };
const rectPath = (g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number) => { g.beginPath(); g.rect(x, y, w, h); };
const discAt = (g: CanvasRenderingContext2D, x: number, y: number, r: number, fill: string, w = 1.6) => { g.beginPath(); g.arc(x, y, r, 0, TAU); g.fillStyle = fill; g.fill(); ink(g, w); };

/** A toy slab: fill, lit top-left step, shaded bottom-right step, ink round it all. */
function slab(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, fill: string, step = 2.4) {
  g.fillStyle = fill; g.fillRect(x, y, w, h);
  g.fillStyle = HIGHLIGHT; g.fillRect(x, y, w, step); g.fillRect(x, y, step, h);
  g.fillStyle = SHADE; g.fillRect(x, y + h - step, w, step); g.fillRect(x + w - step, y, step, h);
  rectPath(g, x, y, w, h); ink(g);
}

function shadowOf(g: CanvasRenderingContext2D, x: number, y: number, rx: number, ry: number) {
  g.fillStyle = CONTACT; g.beginPath(); g.ellipse(x + 3, y + 4, rx, ry, 0, 0, TAU); g.fill();
}

function forklift(g: CanvasRenderingContext2D) {
  shadowOf(g, 0, 4, 34, 17);
  // Forks first (they stick out the front), then the chassis, the mast, the cab frame, the seat and the open door.
  for (const o of [-9, 9]) slab(g, 14, o - 2.5, 30, 5, GUN_D, 1.4);
  slab(g, -26, -15, 44, 30, MUSTARD);
  g.fillStyle = GUN; g.fillRect(-26, -4, 10, 8);
  slab(g, 16, -14, 7, 28, GUN);
  g.beginPath(); g.rect(-14, -11, 22, 22); g.strokeStyle = GUN_D; g.lineWidth = 3.4; g.stroke(); ink(g, 1.2);
  slab(g, -12, -8, 13, 16, '#5a3f2a', 1.6);
  // The door hangs open on the left side, swung out flat.
  g.save(); g.translate(-12, -15); g.rotate(-0.5); slab(g, -2, -15, 4, 18, MUSTARD, 1.2); g.restore();
  // A lunchbox on the seat: red tin, a bone latch and a handle.
  slab(g, -9, -4, 9, 6, RED, 1.2);
  g.fillStyle = BONE; g.fillRect(-5.2, -3.2, 1.8, 1.8);
  g.beginPath(); g.moveTo(-8, -4); g.lineTo(-7, -6.4); g.lineTo(-2, -6.4); g.lineTo(-1, -4); ink(g, 1.1);
  discAt(g, -22, 11, 2, '#c24', 1.2);
}

function cones(g: CanvasRenderingContext2D, rand: () => number) {
  for (const [x, y] of [[-12, 4], [4, -4], [18, 6]] as const) {
    shadowOf(g, x, y + 1, 6.5, 4);
    discAt(g, x, y, 6, '#d9541f', 1.6);
    g.beginPath(); g.arc(x, y, 3.6, 0, TAU); g.fillStyle = BONE; g.fill(); ink(g, 1.1);
    discAt(g, x, y, 1.8, '#d9541f', 1);
    if (rand() < 0.4) { g.beginPath(); g.arc(x - 2, y - 2, 0.9, 0, TAU); g.fillStyle = 'rgba(255,255,255,0.8)'; g.fill(); }
  }
}

function ashbin(g: CanvasRenderingContext2D, rand: () => number) {
  shadowOf(g, 0, 3, 10, 6);
  discAt(g, 0, 0, 8, GUN, 2);
  discAt(g, 0, 0, 5.4, '#8b8472', 1.4);
  g.fillStyle = '#e8e2d0';
  for (let i = 0; i < 6; i++) g.fillRect((rand() - 0.5) * 7, (rand() - 0.5) * 7, 1.5, 1.2);
  // Two butts on the floor beside it.
  g.fillStyle = BONE; g.fillRect(12, 4, 3, 1.4); g.fillRect(-15, 7, 3, 1.4);
}

function bike(g: CanvasRenderingContext2D) {
  shadowOf(g, 0, 3, 20, 5);
  for (const x of [-14, 14]) { g.beginPath(); g.arc(x, 0, 6.5, 0, TAU); g.strokeStyle = INK; g.lineWidth = 4.2; g.stroke(); g.strokeStyle = '#6b7079'; g.lineWidth = 1.6; g.stroke(); }
  g.beginPath(); g.moveTo(-14, 0); g.lineTo(-2, -2); g.lineTo(14, 0); g.moveTo(-2, -2); g.lineTo(4, 3); ink(g, 4); g.strokeStyle = RUST; g.lineWidth = 2; g.stroke();
  g.beginPath(); g.moveTo(14, -6); g.lineTo(14, 6); ink(g, 3.6); g.strokeStyle = STEEL; g.lineWidth = 1.5; g.stroke();
  slab(g, -6, -4, 7, 4, '#2b2e34', 1);
}

function camp(g: CanvasRenderingContext2D) {
  shadowOf(g, 0, 3, 24, 11);
  slab(g, -22, -9, 40, 18, OLIVE);
  slab(g, -22, -9, 9, 18, BONE, 1.4);
  g.fillStyle = 'rgba(10,12,16,0.25)'; for (let i = 0; i < 4; i++) g.fillRect(-10 + i * 8, -9, 2, 18);
  // A tin kettle on a flat stone, and a mug.
  discAt(g, 28, 4, 4.8, '#9aa0a8', 1.6); g.beginPath(); g.moveTo(32, 3); g.lineTo(37, 1); ink(g, 2);
  discAt(g, 28, -5, 2.6, BONE, 1.3);
}

function carcube(g: CanvasRenderingContext2D, rand: () => number) {
  shadowOf(g, 0, 4, 22, 14);
  g.save(); g.rotate((rand() - 0.5) * 0.3);
  slab(g, -17, -17, 34, 34, rand() < 0.5 ? '#7d776a' : RUST, 3);
  g.fillStyle = 'rgba(10,12,16,0.35)'; g.fillRect(-12, -4, 24, 3); g.fillRect(-12, 6, 18, 3);
  g.fillStyle = '#9fc4d6'; g.fillRect(-13, -13, 8, 3);
  g.fillStyle = 'rgba(10,12,16,0.3)'; g.fillRect(-17, 17, 34, 5); rectPath(g, -17, 17, 34, 5); ink(g, 1.4);
  g.restore();
}

function barrier(g: CanvasRenderingContext2D) {
  shadowOf(g, 0, 3, 12, 7);
  slab(g, -8, -6, 16, 14, GUN_D);
  // A boom raised on its pivot, seen from above: a short striped bar and its counterweight.
  g.save(); g.translate(0, -6); g.rotate(-0.7);
  for (let i = 0; i < 4; i++) { g.fillStyle = i % 2 ? '#d9541f' : BONE; g.fillRect(i * 8, -2.6, 8, 5.2); }
  rectPath(g, 0, -2.6, 32, 5.2); ink(g, 1.6);
  g.restore();
  discAt(g, 0, 0, 2.4, '#d9541f', 1.2);
}

function tires(g: CanvasRenderingContext2D) {
  shadowOf(g, 0, 3, 15, 10);
  for (const [x, y] of [[-5, 3], [5, -2], [-1, -6]] as const) {
    discAt(g, x, y, 9, '#2b2e34', 1.8);
    discAt(g, x, y, 4.6, '#6a655b', 1.4);
    g.beginPath(); g.arc(x - 3, y - 3.4, 1.3, 0, TAU); g.fillStyle = 'rgba(255,255,255,0.5)'; g.fill();
  }
}

function drums(g: CanvasRenderingContext2D) {
  shadowOf(g, 0, 4, 28, 8);
  [RUST, OLIVE, GUN].forEach((c, i) => {
    const x = -16 + i * 16;
    discAt(g, x, 0, 7.6, c, 1.8);
    discAt(g, x, 0, 4.6, 'rgba(0,0,0,0.25)', 1.2);
    g.beginPath(); g.arc(x - 3, -3, 1.4, 0, TAU); g.fillStyle = 'rgba(255,255,255,0.8)'; g.fill();
  });
  g.fillStyle = '#d9541f'; g.fillRect(-19, 9, 6, 2.2);
}

function toolchest(g: CanvasRenderingContext2D) {
  shadowOf(g, 0, 4, 18, 9);
  slab(g, -14, -8, 28, 16, RED);
  g.fillStyle = 'rgba(10,12,16,0.35)'; for (const y of [-2.5, 2.5]) g.fillRect(-12, y, 24, 1.6);
  g.fillStyle = STEEL; g.fillRect(-4, -5.2, 8, 1.8); g.fillRect(-4, 4, 8, 1.8);
  g.fillStyle = 'rgba(10,12,16,0.4)'; g.fillRect(-14, 8, 28, 4); rectPath(g, -14, 8, 28, 4); ink(g, 1.3);
}

function bench(g: CanvasRenderingContext2D) {
  shadowOf(g, 0, 4, 24, 7);
  slab(g, -22, -3, 44, 7, WOOD, 1.6);
  slab(g, -22, -11, 44, 6, WOOD, 1.6);
  g.fillStyle = 'rgba(10,12,16,0.4)'; g.fillRect(-18, 4, 4, 5); g.fillRect(14, 4, 4, 5);
}

function duck(g: CanvasRenderingContext2D) {
  g.fillStyle = CONTACT; g.beginPath(); g.ellipse(1.5, 2.5, 4.2, 2.6, 0, 0, TAU); g.fill();
  discAt(g, 0, 0, 3.6, '#ffd34d', 1.2);
  g.beginPath(); g.moveTo(3, -0.8); g.lineTo(6, 0.2); g.lineTo(3, 1.4); g.closePath(); g.fillStyle = '#ff5a1f'; g.fill(); ink(g, 0.9);
  g.beginPath(); g.arc(-1.2, -1.2, 0.8, 0, TAU); g.fillStyle = 'rgba(255,255,255,0.9)'; g.fill();
}

const FLOOR: Record<string, (g: CanvasRenderingContext2D, rand: () => number) => void> = {
  forklift, cones, ashbin, bike, camp, carcube, barrier, tires, drums, toolchest, bench, duck,
};

/** Bakes the floor vignettes into the ground layer. */
export function paintVignettes(g: CanvasRenderingContext2D, list: readonly Vignette[]): void {
  for (const v of list) {
    const paint = FLOOR_VIGNETTES.has(v.k) ? FLOOR[v.k] : undefined;
    if (!paint) continue;
    g.save();
    g.translate(v.x, v.y);
    // The duck is a secret: small, and never turned to face the camera.
    if (v.k !== 'duck') g.rotate(v.rot);
    paint(g, seeded(v.seed));
    g.restore();
  }
}

// ---------------------------------------------------------------------------------------------------------------- per frame

export type VState = { now: number; dark: number; reduced: boolean };
type View = { x0: number; y0: number; x1: number; y1: number };

const chalk = 'rgba(236, 230, 214, 0.7)';

function tally(g: CanvasRenderingContext2D, v: Vignette) {
  // Five-bar gates in chalk on a wall's front face: four strokes and a slash, a few gates of them.
  const top = v.y + 3, gates = 2 + (v.seed % 3);
  g.strokeStyle = chalk; g.lineWidth = 1.3; g.lineCap = 'round';
  g.beginPath();
  for (let n = 0; n < gates; n++) {
    const x0 = v.x - gates * 6 + n * 12;
    for (let i = 0; i < 4; i++) { g.moveTo(x0 + i * 2.2, top); g.lineTo(x0 + i * 2.2 + 0.4, top + 8); }
    if (n < gates - 1 || v.seed % 2) { g.moveTo(x0 - 1.4, top + 6.5); g.lineTo(x0 + 8.6, top + 1.6); }
  }
  g.stroke();
  g.lineCap = 'butt';
}

function dartboard(g: CanvasRenderingContext2D, v: Vignette) {
  const x = v.x, y = v.y + 8.4;
  g.fillStyle = CONTACT; g.beginPath(); g.ellipse(x + 1.5, y + 1.8, 6.6, 6, 0, 0, TAU); g.fill();
  discAt(g, x, y, 6.4, '#2b2e34', 1.6);
  discAt(g, x, y, 4.6, '#e9dfc3', 1);
  discAt(g, x, y, 2.6, '#a8493f', 0.9);
  discAt(g, x, y, 1, '#2f6b45', 0.6);
  // Three darts, one in the bull and two wide.
  g.strokeStyle = '#e8e2d0'; g.lineWidth = 1.2;
  g.beginPath(); g.moveTo(x, y); g.lineTo(x + 3.4, y - 3.2); g.moveTo(x + 3, y + 2); g.lineTo(x + 6, y + 4); g.moveTo(x - 3.6, y - 1); g.lineTo(x - 6.6, y - 3); g.stroke();
}

/** The game's soldier as a sprayed tag: an orange helmet dome with two dot eyes and a chin strap, high up on the wall. */
function tag(g: CanvasRenderingContext2D, v: Vignette) {
  const x = v.x, y = v.y + 8;
  g.globalAlpha = 0.85;
  g.beginPath(); g.arc(x, y, 5, Math.PI, 0); g.lineTo(x + 5, y + 1); g.lineTo(x - 5, y + 1); g.closePath();
  g.fillStyle = '#ff5a1f'; g.fill(); ink(g, 1);
  g.fillStyle = INK; g.fillRect(x - 3, y - 1.2, 1.8, 1.8); g.fillRect(x + 1.2, y - 1.2, 1.8, 1.8);
  g.fillStyle = '#ff5a1f'; g.fillRect(x - 5.6, y + 1, 11.2, 1.8);
  g.globalAlpha = 1;
}

function heart(g: CanvasRenderingContext2D, v: Vignette) {
  const x = v.x, y = v.y + 8;
  g.globalAlpha = 0.8;
  g.beginPath(); g.moveTo(x, y + 4.4); g.bezierCurveTo(x - 7, y - 1, x - 3.4, y - 5.4, x, y - 2); g.bezierCurveTo(x + 3.4, y - 5.4, x + 7, y - 1, x, y + 4.4);
  g.strokeStyle = chalk; g.lineWidth = 1.2; g.stroke();
  g.font = '800 4.6px "Barlow Condensed", sans-serif'; g.fillStyle = chalk; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText('K+M', x, y - 0.4);
  g.globalAlpha = 1;
}

/** Kilroy peeks over the sill: a dome head, two eyes, a long nose and four fingers, in chalk. */
function kilroy(g: CanvasRenderingContext2D, v: Vignette) {
  const x = v.x, y = v.y + 11;
  g.globalAlpha = 0.75;
  g.strokeStyle = chalk; g.lineWidth = 1.1;
  g.beginPath(); g.arc(x, y, 5, Math.PI, 0); g.moveTo(x - 5, y); g.lineTo(x + 5, y); g.moveTo(x - 2.4, y - 1.4); g.lineTo(x - 2.4, y - 1.4); g.moveTo(x - 0.4, y); g.lineTo(x - 0.4, y + 3.6); g.lineTo(x + 0.6, y + 3.6); g.lineTo(x + 0.6, y); g.stroke();
  g.fillStyle = chalk; g.fillRect(x - 3, y - 2.6, 1.4, 1.4); g.fillRect(x + 1.6, y - 2.6, 1.4, 1.4);
  for (const o of [-7, -4.6, 4.6, 7]) { g.beginPath(); g.moveTo(x + o, y); g.lineTo(x + o, y - 2.2); g.stroke(); }
  g.globalAlpha = 1;
}

/** A paper notice pinned to a wall's top face: a few lines of the yard's lore. */
function poster(g: CanvasRenderingContext2D, v: Vignette) {
  const lines = v.text ?? [], w = 46, h = 10 + lines.length * 9;
  const rot = ((v.seed % 7) - 3) * 0.025;
  g.save(); g.translate(v.x, v.y); g.rotate(rot);
  g.fillStyle = CONTACT; g.fillRect(-w / 2 + 2, -h / 2 + 3, w, h);
  g.fillStyle = '#e3dcc6'; g.fillRect(-w / 2, -h / 2, w, h);
  g.fillStyle = HIGHLIGHT; g.fillRect(-w / 2, -h / 2, w, 2);
  rectPath(g, -w / 2, -h / 2, w, h); ink(g, 1.6);
  g.fillStyle = INK; g.textAlign = 'center'; g.textBaseline = 'middle';
  lines.forEach((ln, i) => {
    g.font = `800 ${i === 0 ? 8 : 6.4}px "Barlow Condensed", "Arial Narrow", sans-serif`;
    let size = i === 0 ? 8 : 6.4;
    while (g.measureText(ln).width > w - 5 && size > 4) { size -= 0.4; g.font = `800 ${size}px "Barlow Condensed", "Arial Narrow", sans-serif`; }
    g.fillText(ln, 0, -h / 2 + 8 + i * 8.6);
  });
  discAt(g, -w / 2 + 3, -h / 2 + 3, 1.3, '#d9541f', 0.9);
  discAt(g, w / 2 - 3, -h / 2 + 3, 1.3, '#d9541f', 0.9);
  g.restore();
}

function flag(g: CanvasRenderingContext2D, v: Vignette, st: VState) {
  const sway = st.reduced ? 0.3 : Math.sin(st.now / 900 + v.seed) * 0.5 + 0.2;
  g.fillStyle = CONTACT; g.beginPath(); g.ellipse(v.x + 3, v.y + 3, 6, 3, 0, 0, TAU); g.fill();
  discAt(g, v.x, v.y, 3.6, GUN_D, 1.6);
  g.beginPath(); g.moveTo(v.x, v.y); g.lineTo(v.x, v.y - 30); ink(g, 4); g.strokeStyle = STEEL; g.lineWidth = 1.6; g.stroke();
  // The cloth: three rippling bands, olive over bone over orange, in the district's colours.
  const top = v.y - 29, cols = [OLIVE, BONE, '#d9541f'];
  cols.forEach((c, i) => {
    g.beginPath();
    const y0 = top + i * 4.2;
    g.moveTo(v.x + 1, y0); g.quadraticCurveTo(v.x + 9, y0 + sway * 3, v.x + 18, y0 + sway * 2 - sway); g.lineTo(v.x + 18, y0 + 4.2 + sway); g.quadraticCurveTo(v.x + 9, y0 + 4.2 + sway * 3, v.x + 1, y0 + 4.2);
    g.closePath(); g.fillStyle = c; g.fill();
  });
  g.beginPath(); g.moveTo(v.x + 1, top); g.quadraticCurveTo(v.x + 9, top + sway * 3, v.x + 18, top + sway); g.lineTo(v.x + 18, top + 12.6 + sway); g.quadraticCurveTo(v.x + 9, top + 12.6 + sway * 3, v.x + 1, top + 12.6); g.closePath(); ink(g, 1.5);
}

/** A guard booth standing on a wall: a roof, a front with a window, and a tiny TV changing its picture inside. */
function booth(g: CanvasRenderingContext2D, v: Vignette, st: VState) {
  const w = 38, h = 22, x = v.x - w / 2, y = v.y - h / 2 - 4, face = 14;
  g.fillStyle = CONTACT; g.fillRect(x + 3, y + 4, w, h + face);
  slab(g, x, y + h - 2, w, face, '#8a8f98', 1.6);
  const flick = st.reduced ? 0 : Math.floor(st.now / 800 + v.seed) % 3;
  const tv = ['#7fb6d6', '#d6c47f', '#9fd6a4'][flick]!;
  g.fillStyle = '#22262c'; g.fillRect(x + 6, y + h + 1, 26, 8);
  g.fillStyle = tv; g.fillRect(x + 21, y + h + 2.4, 9, 5.4);
  g.fillStyle = 'rgba(255,255,255,0.35)'; g.fillRect(x + 21, y + h + 2.4, 9, 1.4);
  g.fillStyle = BONE; g.fillRect(x + 8, y + h + 5, 5, 3);
  rectPath(g, x + 6, y + h + 1, 26, 8); ink(g, 1.3);
  slab(g, x - 2, y, w + 4, h, GUN, 2.4);
  g.fillStyle = '#d9541f'; g.fillRect(x + w / 2 - 6, y + h / 2 - 2, 12, 4);
  rectPath(g, x + w / 2 - 6, y + h / 2 - 2, 12, 4); ink(g, 1.1);
  if (!st.reduced || true) {
    g.save(); g.globalCompositeOperation = 'lighter'; g.globalAlpha = 0.18 + 0.1 * st.dark;
    g.fillStyle = tv; g.beginPath(); g.ellipse(x + 25, y + h + 12, 18, 7, 0, 0, TAU); g.fill();
    g.restore();
  }
}

/** A forklift charger: a grey box on the wall foot with a status LED that blinks green slowly (steady under reduced motion). */
function charger(g: CanvasRenderingContext2D, v: Vignette, st: VState) {
  g.save(); g.translate(v.x, v.y); g.rotate(v.rot);
  shadowOf(g, 0, 2, 14, 7);
  slab(g, -12, -7, 24, 14, GUN);
  g.fillStyle = '#22262c'; g.fillRect(-8, -3, 8, 6);
  const on = st.reduced || Math.floor(st.now / 800) % 2 === 0;
  discAt(g, 6, 0, 2.4, on ? '#5fe08a' : '#2f5a3e', 1);
  if (on) { g.globalCompositeOperation = 'lighter'; g.fillStyle = 'rgba(95, 224, 138, 0.25)'; g.beginPath(); g.arc(6, 0, 9, 0, TAU); g.fill(); }
  g.restore();
}

function cat(g: CanvasRenderingContext2D, v: Vignette, st: VState) {
  const x = v.x, y = v.y, tail = st.reduced ? 0 : Math.sin(st.now / 1300 + v.seed) * 3;
  g.fillStyle = CONTACT; g.beginPath(); g.ellipse(x + 2, y + 5, 9, 4, 0, 0, TAU); g.fill();
  g.beginPath(); g.moveTo(x - 6, y + 1); g.quadraticCurveTo(x - 15, y - 1 + tail, x - 13, y - 8 + tail); ink(g, 4); g.strokeStyle = '#d9822e'; g.lineWidth = 2; g.stroke();
  g.beginPath(); g.ellipse(x, y, 8, 5.4, 0, 0, TAU); g.fillStyle = '#d9822e'; g.fill(); ink(g, 1.6);
  g.fillStyle = HIGHLIGHT; g.beginPath(); g.ellipse(x - 2, y - 2, 4.4, 1.8, 0, 0, TAU); g.fill();
  g.fillStyle = 'rgba(120, 60, 20, 0.5)'; for (const o of [-1, 3]) g.fillRect(x + o, y - 4.6, 1.4, 3.6);
  g.beginPath(); g.arc(x + 8, y - 1.6, 4, 0, TAU); g.fillStyle = '#d9822e'; g.fill(); ink(g, 1.6);
  g.beginPath(); g.moveTo(x + 5.6, y - 4.6); g.lineTo(x + 6.4, y - 8.4); g.lineTo(x + 8.8, y - 5.4); g.moveTo(x + 8, y - 5.4); g.lineTo(x + 10.4, y - 8.2); g.lineTo(x + 11.2, y - 3.8); ink(g, 1.3);
  g.fillStyle = '#e8f08a'; g.fillRect(x + 7, y - 2.6, 1.2, 1.4); g.fillRect(x + 9.6, y - 2.6, 1.2, 1.4);
}

const inView = (v: View, x: number, y: number, pad: number) => x > v.x0 - pad && x < v.x1 + pad && y > v.y0 - pad && y < v.y1 + pad;

/** Draws the per-frame vignettes that touch the view. */
export function drawVignettes(g: CanvasRenderingContext2D, list: readonly Vignette[], view: View, st: VState): void {
  for (const v of list) {
    if (FLOOR_VIGNETTES.has(v.k) || !inView(view, v.x, v.y, 60)) continue;
    g.save();
    switch (v.k) {
      case 'tally': tally(g, v); break;
      case 'dartboard': dartboard(g, v); break;
      case 'tag': tag(g, v); break;
      case 'heart': heart(g, v); break;
      case 'kilroy': kilroy(g, v); break;
      case 'poster': poster(g, v); break;
      case 'flag': flag(g, v, st); break;
      case 'booth': booth(g, v, st); break;
      case 'charger': charger(g, v, st); break;
      case 'cat': cat(g, v, st); break;
    }
    g.restore();
  }
}

/** Moths at a lamp: two bone-white specks circling slowly (under 1 Hz), only at night and only near lit lamps. */
export function drawMoths(g: CanvasRenderingContext2D, lamps: readonly { x: number; y: number; id: number }[], st: VState): void {
  if (st.reduced || st.dark < 0.4) return;
  g.fillStyle = 'rgba(236, 230, 214, 0.85)';
  for (const l of lamps) {
    for (let i = 0; i < 2; i++) {
      const a = st.now / (1300 + i * 400) * (i ? -1 : 1) + l.id * 1.7, r = 8 + 3 * Math.sin(st.now / 2100 + l.id + i);
      g.fillRect(l.x + Math.cos(a) * r - 0.8, l.y + Math.sin(a) * r * 0.7 - 0.8 - 6, 1.6, 1.6);
    }
  }
}
