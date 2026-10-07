/// <reference types="node" />
// Usage: node scripts/map-overview.ts <outDir> [mapId,...|all|none] [heat.json ...]
// Draws each map whole from its committed ground tiles (or flat from its walls when it has none), with spawns, zones and crates,
// and a bench's heat and deaths over it. Needs no browser.
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import sharp, { type OverlayOptions } from 'sharp';
import { CRATE_SIZE, MAP_IDS, MAPS, ZONE_RADIUS, type MapId } from '../src/shared/maps.ts';
import { TEAM_COLORS } from '../src/client/palette.ts';
import type { Manifest } from '../src/client/world/assets.ts';
import { ART } from '../src/client/world/art.ts';
import { layoutKey } from '../src/client/world/layout.ts';

const [OUT, which = 'all', ...heatFiles] = process.argv.slice(2);
if (!OUT) { console.error('usage: node scripts/map-overview.ts <outDir> [mapId,...|all|none] [heat.json ...]'); process.exit(2); }
const maps: MapId[] = which === 'all' ? [...MAP_IDS] : which === 'none' ? [] : (which.split(',') as MapId[]);
const PX = Number(process.env.PX ?? 2400);
const ASSETS = 'public/assets';
mkdirSync(OUT, { recursive: true });

const manifest: Manifest | null = existsSync(join(ASSETS, 'manifest.json')) ? JSON.parse(readFileSync(join(ASSETS, 'manifest.json'), 'utf8')) : null;
const RAMP = [[255, 211, 77, 0], [255, 211, 77, 150], [247, 107, 21, 190], [229, 72, 77, 215], [130, 20, 40, 235]];
const ramp = (t: number) => {
  const f = Math.min(0.999, Math.max(0, t)) * (RAMP.length - 1), i = Math.floor(f), u = f - i;
  return RAMP[i]!.map((v, k) => v + (RAMP[i + 1]![k]! - v) * u);
};

/** The ground, PX square over [0, size]: the baked tiles stitched, or each wall's top drawn flat when the layout has no bake. */
async function ground(id: MapId): Promise<Buffer> {
  const m = MAPS[id], k = PX / m.size;
  const tiles = manifest?.maps[layoutKey(m.walls)];
  if (!tiles) {
    const rects = m.walls.map((w) => `<rect x="${w.x * k}" y="${w.y * k}" width="${w.w * k}" height="${w.h * k}" fill="${w.material === 'planter' ? '#5b6e45' : w.material === 'sandstone' ? '#d1b89f' : '#a3abba'}" stroke="#1c1f26" stroke-width="1"/>`);
    return sharp(Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${PX}" height="${PX}"><rect width="100%" height="100%" fill="#a7aaaf"/>${rects.join('')}</svg>`)).png().toBuffer();
  }
  const side = Math.round(tiles.span * k);
  const layers = await Promise.all(Object.entries(tiles.tiles).map(async ([cell, file]) => {
    const [cx, cy] = cell.split('_').map(Number) as [number, number];
    return { input: await sharp(join(ASSETS, file)).resize(side, side).toBuffer(), left: Math.round((tiles.origin + cx * tiles.span) * k), top: Math.round((tiles.origin + cy * tiles.span) * k) };
  }));
  const pad = Math.ceil(ART.bake.margin * k) + side;
  const canvas = sharp({ create: { width: PX + pad * 2, height: PX + pad * 2, channels: 4, background: '#1d3a4c' } });
  const whole = await canvas.composite(layers.map((l) => ({ ...l, left: l.left + pad, top: l.top + pad }))).png().toBuffer();
  return sharp(whole).extract({ left: pad, top: pad, width: PX, height: PX }).png().toBuffer();
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
  for (const c of m.crates) out.push(`<rect x="${(c.x - CRATE_SIZE / 2) * k}" y="${(c.y - CRATE_SIZE / 2) * k}" width="${CRATE_SIZE * k}" height="${CRATE_SIZE * k}" fill="#8a6a43" stroke="#1c1f26" stroke-width="1"/>`);
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
