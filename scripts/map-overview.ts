/// <reference types="node" />
// Usage: node scripts/map-overview.ts <outDir> [mapId,...|all|none] [heat.json ...]
// Draws each map whole as a greybox from its pieces: tops, south faces, paint, overhead outlines and lights, with spawns and zones,
// and a bench's heat and deaths over it. Needs no browser.
import { mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import sharp, { type OverlayOptions } from 'sharp';
import { KIT, placed, type Material } from '../src/shared/kit.ts';
import { MAP_IDS, MAPS, ZONE_RADIUS, type MapId } from '../src/shared/maps.ts';
import { TEAM_COLORS } from '../src/client/palette.ts';
import { ART } from '../src/client/world/art.ts';

const [OUT, which = 'all', ...heatFiles] = process.argv.slice(2);
if (!OUT) { console.error('usage: node scripts/map-overview.ts <outDir> [mapId,...|all|none] [heat.json ...]'); process.exit(2); }
const maps: MapId[] = which === 'all' ? [...MAP_IDS] : which === 'none' ? [] : (which.split(',') as MapId[]);
const PX = Number(process.env.PX ?? 2400);
mkdirSync(OUT, { recursive: true });

const RAMP = [[255, 211, 77, 0], [255, 211, 77, 150], [247, 107, 21, 190], [229, 72, 77, 215], [130, 20, 40, 235]];
const ramp = (t: number) => {
  const f = Math.min(0.999, Math.max(0, t)) * (RAMP.length - 1), i = Math.floor(f), u = f - i;
  return RAMP[i]!.map((v, k) => v + (RAMP[i + 1]![k]! - v) * u);
};

const TOP: Record<Material, string> = { concrete: '#a3abba', metal: '#6f7f99', wood: '#a07a4a', planter: '#5b6e45', sandbag: '#b9a77c' };
const MARK: Record<string, string> = { line: '#d9b23a', hazard: '#e2b62a', chevron: '#d9b23a', box: '#d9b23a' };

/** The ground, PX square over [0, size]: the floor and its paint, each piece's top with its south face below it, overhead pieces as outlines and lights as glows. */
async function ground(id: MapId): Promise<Buffer> {
  const m = MAPS[id], k = PX / m.size, shear = ART.camera.shear;
  const out: string[] = [`<rect width="100%" height="100%" fill="#a7aaaf"/>`];
  for (const mk of m.marks) out.push(`<rect x="${mk.x * k}" y="${mk.y * k}" width="${mk.w * k}" height="${mk.h * k}" fill="${mk.k === 'box' ? 'none' : MARK[mk.k]}" stroke="${MARK[mk.k]}" stroke-width="${mk.k === 'box' ? 3 : 0}" fill-opacity="0.8"${mk.k === 'hazard' ? ' stroke-dasharray="6 6"' : ''}/>`);
  const order = [...m.pieces].sort((a, b) => Number(!!KIT[a.p].overhead) - Number(!!KIT[b.p].overhead) || placed(a).foot.y - placed(b).foot.y);
  for (const at of order) {
    const def = KIT[at.p], f = placed(at).foot;
    const rect = (y: number, h: number, fill: string, extra = '') => out.push(`<rect x="${f.x * k}" y="${y * k}" width="${f.w * k}" height="${h * k}" fill="${fill}" ${extra}/>`);
    if (def.overhead) { rect(f.y, f.h, TOP[def.material], 'fill-opacity="0.35" stroke="#1c1f26" stroke-dasharray="6 4" stroke-width="1.5"'); continue; }
    if (def.height === 0) { rect(f.y, f.h, '#7d8088', 'fill-opacity="0.6"'); continue; }
    rect(f.y + f.h - def.height * shear, def.height * shear, '#4a4f5a');
    rect(f.y - def.height * shear, f.h, def.breaks ? '#c79a5a' : TOP[def.material], 'stroke="#1c1f26" stroke-width="1"');
  }
  for (const l of m.lights) out.push(`<circle cx="${l.x * k}" cy="${l.y * k}" r="${Math.max(3, l.r * k * 0.25)}" fill="#${l.color.toString(16).padStart(6, '0')}" fill-opacity="0.7"/>`);
  return sharp(Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${PX}" height="${PX}">${out.join('')}</svg>`)).png().toBuffer();
}

/** Damage density on a 50-unit grid, softened by two box passes and mapped through the heat ramp. */
async function heatLayer(size: number, points: number[]): Promise<Buffer> {
  const cell = 50, n = Math.ceil(size / cell);
  let d: Float32Array = new Float32Array(n * n);
  for (let i = 0; i < points.length; i += 2) {
    const cx = Math.floor(points[i]! / cell), cy = Math.floor(points[i + 1]! / cell);
    if (cx >= 0 && cy >= 0 && cx < n && cy < n) d[cy * n + cx]!++;
  }
  for (let pass = 0; pass < 2; pass++) for (const horizontal of [true, false]) {
    const b = new Float32Array(n * n);
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
      let s = 0, c = 0;
      for (let k = -3; k <= 3; k++) {
        const xx = horizontal ? x + k : x, yy = horizontal ? y : y + k;
        if (xx < 0 || yy < 0 || xx >= n || yy >= n) continue;
        s += d[yy * n + xx]!; c++;
      }
      b[y * n + x] = s / c;
    }
    d = b;
  }
  const max = Math.max(...d) || 1;
  const rgba = Buffer.alloc(n * n * 4);
  for (let i = 0; i < n * n; i++) rgba.set(ramp(Math.sqrt(d[i]! / max)).map((v, k) => (k === 3 ? v * 0.8 : v)).map(Math.round), i * 4);
  return sharp(rgba, { raw: { width: n, height: n, channels: 4 } }).resize(PX, PX, { kernel: 'cubic' }).png().toBuffer();
}

function marks(id: MapId, heat: { mode: string; death: number[] } | null): Buffer {
  const m = MAPS[id], k = PX / m.size;
  const out: string[] = [];
  const team = (rects: readonly { x: number; y: number; w: number; h: number }[], color: string) => {
    for (const r of rects) out.push(`<rect x="${r.x * k}" y="${r.y * k}" width="${r.w * k}" height="${r.h * k}" fill="${color}" fill-opacity="0.12" stroke="${color}" stroke-opacity="0.7" stroke-width="2" stroke-dasharray="8 6"/>`);
  };
  if (!m.siege) {
    team(m.spawns.ffa, '#4b5563');
    team(m.spawns.red, TEAM_COLORS.red);
    team(m.spawns.blue, TEAM_COLORS.blue);
  }
  m.zones.forEach((z, i) => {
    out.push(`<circle cx="${z.x * k}" cy="${z.y * k}" r="${ZONE_RADIUS * k}" fill="rgb(122,128,139)" fill-opacity="0.12" stroke="rgb(42,46,54)" stroke-opacity="0.6" stroke-width="3" stroke-dasharray="10 8"/>`);
    out.push(`<text x="${z.x * k}" y="${z.y * k}" font-family="sans-serif" font-size="28" fill="rgb(42,46,54)" fill-opacity="0.75" text-anchor="middle" dominant-baseline="middle">${'ABC'[i]}</text>`);
  });
  for (let i = 0; heat && i < heat.death.length; i += 2) out.push(`<circle cx="${heat.death[i]! * k}" cy="${heat.death[i + 1]! * k}" r="2.2" fill="rgb(28,31,38)" fill-opacity="0.55"/>`);
  const label = heat ? `${m.name}  ${heat.mode}: damage taken (heat), deaths (dots)` : `${m.name}  ${m.size} x ${m.size}`;
  out.push(`<rect x="16" y="16" width="${label.length * 14 + 28}" height="44" fill="rgb(28,31,38)" fill-opacity="0.82"/><text x="30" y="47" font-family="sans-serif" font-weight="600" font-size="26" fill="#e6ebf5">${label}</text>`);
  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${PX}" height="${PX}">${out.join('')}</svg>`);
}

async function overview(id: MapId, heat: { mode: string; dmg: number[]; death: number[] } | null, file: string) {
  const layers: OverlayOptions[] = [];
  if (heat) layers.push({ input: await heatLayer(MAPS[id].size, heat.dmg) });
  layers.push({ input: marks(id, heat) });
  await sharp(await ground(id)).composite(layers).png().toFile(file);
  console.log(`saved ${file}`);
}

for (const id of maps) await overview(id, null, join(OUT, `overview-${id}.png`));
for (const file of heatFiles) {
  const heat = JSON.parse(readFileSync(file, 'utf8')) as { map: MapId; mode: string; dmg: number[]; death: number[] };
  await overview(heat.map, heat, join(OUT, `heat-${heat.map}-${heat.mode}.png`));
}
