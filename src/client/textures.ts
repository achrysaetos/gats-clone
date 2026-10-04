import { WORLD } from '../shared/defs.ts';
import { INK, PALETTE, shade } from './palette.ts';

export const SLAB = 100;
const SHADOW_OFFSET = { x: 5, y: 7 };

/** Deterministic PRNG, so the floor and crate grain look the same on every load. */
function seededRandom(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function slabLevels(seed: number, count: number, tones: number, plainShare: number): number[] {
  const rand = seededRandom(seed);
  return Array.from({ length: count }, () => (rand() < plainShare ? 0 : 1 + Math.floor(rand() * (tones - 1))));
}

type CrateDamage = 0 | 1 | 2;
export const crateDamage = (hpFrac: number): CrateDamage => (hpFrac > 0.67 ? 0 : hpFrac > 0.34 ? 1 : 2);

function canvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = Math.ceil(w);
  c.height = Math.ceil(h);
  return [c, c.getContext('2d')!];
}

const CRATE_PAD = Math.max(SHADOW_OFFSET.x, SHADOW_OFFSET.y) + 2;

function paintCrate(size: number, damage: CrateDamage, pxPerUnit: number): HTMLCanvasElement {
  const pad = CRATE_PAD;
  const [c, g] = canvas((size + pad * 2) * pxPerUnit, (size + pad * 2) * pxPerUnit);
  g.scale(pxPerUnit, pxPerUnit);
  g.translate(pad, pad);
  const rand = seededRandom(size * 31 + damage);
  const dim = [1, 0.9, 0.8][damage]!;
  g.fillStyle = PALETTE.shadow;
  g.beginPath();
  g.roundRect(SHADOW_OFFSET.x, SHADOW_OFFSET.y, size, size, 3);
  g.fill();
  g.fillStyle = shade(PALETTE.crate, dim);
  g.beginPath();
  g.roundRect(0, 0, size, size, 3);
  g.fill();
  const planks = 4;
  const ph = size / planks;
  for (let i = 0; i < planks; i++) {
    g.fillStyle = shade(PALETTE.crate, dim * (0.92 + rand() * 0.14));
    g.fillRect(0, i * ph, size, ph);
    g.strokeStyle = shade(PALETTE.crateDark, dim);
    g.globalAlpha = 0.35;
    g.lineWidth = 0.8;
    g.beginPath();
    for (let k = 0; k < 2; k++) {
      const y = i * ph + ph * (0.3 + rand() * 0.4);
      g.moveTo(0, y);
      g.bezierCurveTo(size * 0.3, y + (rand() - 0.5) * 3, size * 0.7, y + (rand() - 0.5) * 3, size, y);
    }
    g.stroke();
    g.globalAlpha = 1;
  }
  const rim = size * 0.14;
  g.strokeStyle = shade(PALETTE.crateDark, dim);
  g.lineWidth = rim;
  g.strokeRect(rim / 2, rim / 2, size - rim, size - rim);
  g.lineWidth = rim * 0.8;
  g.beginPath();
  g.moveTo(rim, rim); g.lineTo(size - rim, size - rim);
  g.stroke();
  g.strokeStyle = shade(PALETTE.crateLight, dim);
  g.lineWidth = 1.2;
  g.beginPath();
  g.moveTo(1.5, size - 1.5); g.lineTo(1.5, 1.5); g.lineTo(size - 1.5, 1.5);
  g.stroke();
  if (damage > 0) {
    g.strokeStyle = INK;
    g.lineWidth = 1.6;
    g.lineJoin = 'round';
    g.beginPath();
    g.moveTo(size * 0.18, 0); g.lineTo(size * 0.38, size * 0.32); g.lineTo(size * 0.28, size * 0.55);
    if (damage > 1) {
      g.moveTo(size, size * 0.58); g.lineTo(size * 0.66, size * 0.7); g.lineTo(size * 0.72, size);
      g.moveTo(size * 0.38, size * 0.32); g.lineTo(size * 0.55, size * 0.4);
    }
    g.stroke();
  }
  g.strokeStyle = INK;
  g.lineWidth = 2.5;
  g.beginPath();
  g.roundRect(0, 0, size, size, 3);
  g.stroke();
  return c;
}

const crates = new Map<string, HTMLCanvasElement>();
let cratesScale = 0;

/** A crate pre-drawn at the current screen scale, so drawing it each frame is a 1:1 pixel copy rather than a resample. */
export function crateSprite(size: number, damage: CrateDamage, pxPerUnit: number) {
  if (pxPerUnit !== cratesScale) { crates.clear(); cratesScale = pxPerUnit; }
  const key = `${size}|${damage}`;
  let image = crates.get(key);
  if (!image) crates.set(key, (image = paintCrate(size, damage, pxPerUnit)));
  return { image, pad: CRATE_PAD };
}

export function floorCracks(seed: number, worldSize: number, count: number): number[][] {
  const rand = seededRandom(seed);
  return Array.from({ length: count }, () => {
    let x = rand() * worldSize, y = rand() * worldSize;
    const line = [x, y];
    for (let s = 0; s < 4; s++) {
      x = Math.min(worldSize, Math.max(0, x + (rand() - 0.5) * 60));
      y = Math.min(worldSize, Math.max(0, y + (rand() - 0.5) * 60));
      line.push(x, y);
    }
    return line;
  });
}

export const WALL_SHADOW = SHADOW_OFFSET;
export const PLAYER_SHADOW = { x: 4, y: 6, r: WORLD.playerRadius * 1.02 };
