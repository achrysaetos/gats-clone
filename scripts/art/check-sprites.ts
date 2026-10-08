/// <reference types="node" />
// Usage: node scripts/art/check-sprites.ts <sprites-spec.json> <bakeDir>
// Checks a sprite bake against the catalog: every frame of every layer exists as an RGBA PNG of exactly
// round(box.w*px) x round(box.h*px), nothing is cut off at a frame's edge, and each gun's barrel ends where the game
// spawns its bullets.
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import sharp from 'sharp';

type Box = { x: number; y: number; w: number; h: number };
type Entry = { box: Box; dirs: number; frames: number; layers: string[]; still?: string[]; scale?: number };
type Spec = { pxPerUnit: number; playerRadius: number; sprites: Record<string, Entry>; guns: Record<string, { parts: { x: number; w: number }[] }> };

const [specPath, bakeDir] = process.argv.slice(2);
if (!specPath || !bakeDir) { console.error('usage: node scripts/art/check-sprites.ts <spec.json> <bakeDir>'); process.exit(2); }
const spec = JSON.parse(readFileSync(specPath, 'utf8')) as Spec;

/** How far a muzzle may sit from its barrel's last opaque pixel, allowing for the outline and antialiasing. */
const MUZZLE_SLACK_PX = 1.5;
/** Alpha (0-255) above which a pixel on a frame's border counts as art cut off by the box. */
const EDGE_ALPHA = 64;

const problems: string[] = [];
let frames = 0;
for (const [name, e] of Object.entries(spec.sprites)) {
  const px = spec.pxPerUnit * (e.scale ?? 1);
  const w = Math.round(e.box.w * px), h = Math.round(e.box.h * px);
  for (const layer of e.layers) for (let d = 0; d < e.dirs; d++) for (let f = 0; f < (e.still?.includes(layer) ? 1 : e.frames); f++) {
    const path = join(bakeDir, name, layer, `${d}_${f}.png`);
    if (!existsSync(path)) { problems.push(`missing ${path}`); continue; }
    const meta = await sharp(path).metadata();
    if (meta.format !== 'png' || meta.channels !== 4) problems.push(`${path}: ${meta.format} with ${meta.channels} channels, want RGBA png`);
    if (meta.width !== w || meta.height !== h) problems.push(`${path}: ${meta.width}x${meta.height}, want ${w}x${h}`);
    const { data, info } = await sharp(path).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    const alpha = (x: number, y: number) => data[(y * info.width + x) * 4 + 3]!;
    let edge = 0;
    for (let x = 0; x < info.width; x++) edge = Math.max(edge, alpha(x, 0), alpha(x, info.height - 1));
    for (let y = 0; y < info.height; y++) edge = Math.max(edge, alpha(0, y), alpha(info.width - 1, y));
    if (edge > EDGE_ALPHA) problems.push(`${path}: art reaches the frame edge (alpha ${edge})`);
    frames++;
  }
  if (name.startsWith('gun.') && existsSync(join(bakeDir, name, 'base', '0_0.png'))) {
    const muzzle = Math.max(...spec.guns[name.slice(4)]!.parts.map((p) => p.x + p.w)) * spec.playerRadius;
    const { data, info } = await sharp(join(bakeDir, name, 'base', '0_0.png')).raw().toBuffer({ resolveWithObject: true });
    let last = -1;
    for (let y = 0; y < info.height; y++) for (let x = 0; x < info.width; x++) if (data[(y * info.width + x) * 4 + 3]! > 127 && x > last) last = x;
    const want = (muzzle - e.box.x) * px;
    if (Math.abs(last + 1 - want) > MUZZLE_SLACK_PX) problems.push(`${name}: barrel ends at pixel ${last + 1}, muzzle is at ${want.toFixed(1)}`);
  }
}
for (const p of problems) console.error(p);
console.log(`${frames} frames checked, ${problems.length} problems`);
process.exit(problems.length ? 1 : 0);
