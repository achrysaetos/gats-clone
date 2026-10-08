/// <reference types="node" />
import sharp from 'sharp';
import { ART, type FloorDetail } from '../../src/client/world/art.ts';

/**
 * The tiling floor detail the client multiplies under each map's light layer: grey, seamless, with its mean at
 * `ART.detail.mean` so the light layer (divided by that mean) keeps its brightness. `concrete` is poured slabs with photo
 * grain, joints at half the repeat, hairline cracks and scuffs; `asphalt` is dense gravel with wider cracks.
 */
const N = ART.detail.px;

function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Value noise on a `cells` lattice that wraps at the texture's edge, so it tiles. */
function periodicNoise(cells: number, seed: number): Float32Array {
  const r = rng(seed);
  const lattice = Float32Array.from({ length: cells * cells }, r);
  const out = new Float32Array(N * N);
  const ease = (t: number) => t * t * (3 - 2 * t);
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const fx = (x / N) * cells, fy = (y / N) * cells;
    const x0 = Math.floor(fx), y0 = Math.floor(fy), tx = ease(fx - x0), ty = ease(fy - y0);
    const at = (i: number, j: number) => lattice[((j % cells) * cells) + (i % cells)]!;
    const top = at(x0, y0) + (at(x0 + 1, y0) - at(x0, y0)) * tx;
    const bot = at(x0, y0 + 1) + (at(x0 + 1, y0 + 1) - at(x0, y0 + 1)) * tx;
    out[y * N + x] = top + (bot - top) * ty;
  }
  return out;
}

function fbm(octaves: [cells: number, weight: number][], seed: number): Float32Array {
  const out = new Float32Array(N * N);
  let total = 0;
  for (const [i, [cells, w]] of octaves.entries()) {
    const n = periodicNoise(cells, seed + i * 977);
    for (let k = 0; k < out.length; k++) out[k]! += (n[k]! - 0.5) * w;
    total += w;
  }
  for (let k = 0; k < out.length; k++) out[k]! /= total;
  return out;
}

/** A greyscale source texture, already seamless, resampled to N and centred on 0. */
async function photo(path: string): Promise<Float32Array> {
  const { data } = await sharp(path).greyscale().resize(N, N, { kernel: 'lanczos3' }).raw().toBuffer({ resolveWithObject: true });
  const out = Float32Array.from(data, (v) => v / 255);
  const mean = out.reduce((a, b) => a + b, 0) / out.length;
  for (let k = 0; k < out.length; k++) out[k]! -= mean;
  return out;
}

const wrap = (v: number) => ((v % N) + N) % N;

/** Darkens a soft dot of radius r at (x, y), wrapping across the edges. */
function dab(img: Float32Array, x: number, y: number, r: number, k: number) {
  for (let dy = -Math.ceil(r); dy <= Math.ceil(r); dy++) for (let dx = -Math.ceil(r); dx <= Math.ceil(r); dx++) {
    const d = Math.hypot(dx, dy) / r;
    if (d >= 1) continue;
    const i = wrap(Math.round(y) + dy) * N + wrap(Math.round(x) + dx);
    img[i] = img[i]! * (1 - k * (1 - d * d));
  }
}

/** A wandering stroke of dabs: a scuff or a hairline crack. */
function stroke(img: Float32Array, r: () => number, length: number, width: number, k: number) {
  let x = r() * N, y = r() * N, a = r() * Math.PI * 2;
  for (let s = 0; s < length; s++) {
    dab(img, x, y, width, k);
    a += (r() - 0.5) * 0.5;
    x += Math.cos(a);
    y += Math.sin(a);
  }
}

async function concrete(): Promise<Float32Array> {
  const grain = await photo('art/textures/floor.jpg');
  const cracks = await photo('art/textures/cracks.png');
  const mask = periodicNoise(4, 11);
  const tone = fbm([[16, 1], [32, 0.6], [64, 0.4]], 5);
  const img = new Float32Array(N * N);
  for (let k = 0; k < img.length; k++) {
    const crack = Math.max(0, cracks[k]!) * Math.max(0, Math.min(1, (mask[k]! - 0.72) * 6));
    img[k] = (1 + grain[k]! * 0.3 + tone[k]! * 0.1) * (1 - crack * 0.25);
  }
  const r = rng(7);
  for (let i = 0; i < 26; i++) stroke(img, r, 20 + r() * 60, 0.8 + r() * 1.2, 0.05 + r() * 0.06);
  for (let i = 0; i < 400; i++) dab(img, r() * N, r() * N, 0.7 + r() * 1.1, 0.12 + r() * 0.2);
  // Saw-cut joints between slabs, half a repeat apart: a dark groove with a lighter worn lip on one side.
  const half = N / 2;
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const dx = Math.min(x % half, half - (x % half)), dy = Math.min(y % half, half - (y % half));
    const d = Math.min(dx, dy);
    const i = y * N + x;
    if (d < 1) img[i] = img[i]! * 0.78;
    else if (d < 2) img[i] = img[i]! * 0.93;
    else if (d < 3) img[i] = img[i]! * 1.03;
  }
  return img;
}

async function asphalt(): Promise<Float32Array> {
  const cracks = await photo('art/textures/cracks.png');
  const tone = fbm([[8, 1], [24, 0.7], [96, 0.5], [256, 0.6]], 23);
  const img = new Float32Array(N * N);
  for (let k = 0; k < img.length; k++) img[k] = (1 + tone[k]! * 0.5) * (1 - Math.max(0, cracks[k]!) * 0.22);
  const r = rng(29);
  for (let i = 0; i < 5000; i++) {
    const x = r() * N, y = r() * N, s = 0.6 + r() * 1.4;
    if (r() < 0.5) dab(img, x, y, s, 0.25 + r() * 0.3);
    else for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (Math.hypot(dx, dy) <= s) { const j = wrap(Math.round(y) + dy) * N + wrap(Math.round(x) + dx); img[j] = img[j]! * (1.12 + r() * 0.12); }
  }
  for (let i = 0; i < 18; i++) stroke(img, r, 30 + r() * 80, 1.4 + r() * 1.6, 0.08);
  return img;
}

const MAKERS: Record<FloorDetail, () => Promise<Float32Array>> = { concrete, asphalt };

/** The detail texture as WebP, scaled so its mean sits at `ART.detail.mean`. */
export async function makeFloorDetail(kind: FloorDetail): Promise<Buffer> {
  const img = await MAKERS[kind]();
  const mean = img.reduce((a, b) => a + b, 0) / img.length;
  const px = Buffer.alloc(N * N * 3);
  for (let k = 0; k < img.length; k++) {
    const v = Math.round(Math.max(0, Math.min(1, (img[k]! / mean) * ART.detail.mean)) * 255);
    px[k * 3] = px[k * 3 + 1] = px[k * 3 + 2] = v;
  }
  return sharp(px, { raw: { width: N, height: N, channels: 3 } }).webp({ quality: 88 }).toBuffer();
}
