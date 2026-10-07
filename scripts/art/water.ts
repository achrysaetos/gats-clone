/// <reference types="node" />
import sharp from 'sharp';

const SIZE = 512;

/** Harbour water that tiles seamlessly: whole-period waves crossing at several angles, brightened where they meet into caustic lines. */
export async function makeWater(): Promise<Buffer> {
  const waves = [[3, 1, 0.0], [-2, 3, 1.3], [5, -2, 2.1], [1, 6, 0.7], [-7, -3, 4.2], [9, 4, 3.3]] as const;
  const deep = [22, 58, 74], shallow = [44, 104, 118], crest = [168, 214, 214];
  const px = Buffer.alloc(SIZE * SIZE * 3);
  for (let y = 0; y < SIZE; y++) for (let x = 0; x < SIZE; x++) {
    const u = (x / SIZE) * Math.PI * 2, v = (y / SIZE) * Math.PI * 2;
    let h = 0;
    for (const [a, b, phase] of waves) h += Math.sin(a * u + b * v + phase) / Math.hypot(a, b);
    const n = h / 1.6;
    const lines = Math.pow(Math.max(0, 1 - Math.abs(Math.sin(n * 3.1))), 6);
    const mix = 0.5 + 0.5 * Math.tanh(n);
    for (let c = 0; c < 3; c++) px[(y * SIZE + x) * 3 + c] = Math.round(deep[c]! + (shallow[c]! - deep[c]!) * mix + (crest[c]! - shallow[c]!) * lines * 0.35);
  }
  return sharp(px, { raw: { width: SIZE, height: SIZE, channels: 3 } }).webp({ quality: 80 }).toBuffer();
}
