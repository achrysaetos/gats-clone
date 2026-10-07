/// <reference types="node" />
// Usage: node scripts/map-overview.ts <outDir> [mapId,...|all|none] [heat.json ...]
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { MAP_IDS, type MapId } from '../src/shared/maps.ts';
import { openPage } from '../.claude/skills/verify/scripts/lib/browser.ts';

const [OUT, which = 'all', ...heatFiles] = process.argv.slice(2);
if (!OUT) { console.error('usage: node scripts/map-overview.ts <outDir> [mapId,...|all|none] [heat.json ...]'); process.exit(2); }
const maps: MapId[] = which === 'all' ? [...MAP_IDS] : which === 'none' ? [] : (which.split(',') as MapId[]);
const PX = Number(process.env.PX ?? 2400);
mkdirSync(OUT, { recursive: true });

const PAGE = `
import { WORLD } from '../src/shared/defs.ts';
import { CRATE_SIZE, MAPS, ZONE_RADIUS } from '../src/shared/maps.ts';
import { createGroundCache, crateSolid, curbSolids, drawLooseShadows, drawGround, drawSolids, wallSolids } from '../src/client/tilt.ts';
import { PALETTE, TEAM_COLORS } from '../src/client/palette.ts';
import { drawRangeFloor, drawTargets } from '../src/client/targetart.ts';

const GRID = 80;
const BOX_RADIUS = 3, BOX_PASSES = 2;
const RAMP = [[255, 211, 77, 0], [255, 211, 77, 150], [247, 107, 21, 190], [229, 72, 77, 215], [130, 20, 40, 235]];
const ramp = (t) => {
  const f = Math.min(0.999, Math.max(0, t)) * (RAMP.length - 1), i = Math.floor(f), u = f - i;
  return RAMP[i].map((v, k) => v + (RAMP[i + 1][k] - v) * u);
};

function heatLayer(size, points) {
  const cell = 50, n = Math.ceil(size / cell), d = new Float32Array(n * n);
  for (let i = 0; i < points.length; i += 2) {
    const cx = Math.floor(points[i] / cell), cy = Math.floor(points[i + 1] / cell);
    if (cx >= 0 && cy >= 0 && cx < n && cy < n) d[cy * n + cx]++;
  }
  const approxGaussian = (src) => {
    let a = src;
    for (let pass = 0; pass < BOX_PASSES; pass++) for (const horizontal of [true, false]) {
      const b = new Float32Array(n * n);
      for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
        let s = 0, c = 0;
        for (let k = -BOX_RADIUS; k <= BOX_RADIUS; k++) {
          const xx = horizontal ? x + k : x, yy = horizontal ? y : y + k;
          if (xx < 0 || yy < 0 || xx >= n || yy >= n) continue;
          s += a[yy * n + xx]; c++;
        }
        b[y * n + x] = s / c;
      }
      a = b;
    }
    return a;
  };
  const h = approxGaussian(d);
  let max = 0;
  for (const v of h) max = Math.max(max, v);
  const c = document.createElement('canvas');
  c.width = c.height = n;
  const g = c.getContext('2d'), img = g.createImageData(n, n);
  for (let i = 0; i < n * n; i++) {
    const [r, gg, b, a] = ramp(Math.sqrt(h[i] / (max || 1)));
    img.data.set([r, gg, b, a], i * 4);
  }
  g.putImageData(img, 0, 0);
  return c;
}

window.renderMap = (id, px, heat) => {
  const m = MAPS[id], size = m.size, k = px / size;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = px;
  const ctx = canvas.getContext('2d');
  ctx.setTransform(k, 0, 0, k, 0, 0);
  const walls = wallSolids(m.walls.map((w) => ({ ...w, built: false })));
  const curbs = curbSolids(size);
  drawGround(ctx, createGroundCache().get(m, size, () => [...curbs, ...walls], 'static'), 0, 0, size, size);
  if (m.range) drawRangeFloor(ctx, m.range, size, { x0: 0, y0: 0, x1: size, y1: size });
  ctx.fillStyle = PALETTE.grid;
  for (let x = GRID; x < size; x += GRID) ctx.fillRect(x - 0.5 / k, 0, 1 / k, size);
  for (let y = GRID; y < size; y += GRID) ctx.fillRect(0, y - 0.5 / k, size, 1 / k);
  const team = (rects, color) => {
    ctx.fillStyle = color; ctx.globalAlpha = 0.12;
    for (const r of rects) ctx.fillRect(r.x, r.y, r.w, r.h);
    ctx.globalAlpha = 0.7; ctx.strokeStyle = color; ctx.lineWidth = 2 / k; ctx.setLineDash([8 / k, 6 / k]);
    for (const r of rects) ctx.strokeRect(r.x, r.y, r.w, r.h);
    ctx.setLineDash([]); ctx.globalAlpha = 1;
  };
  if (!m.siege) {
    team(m.spawns.ffa, '#4b5563');
    team(m.spawns.red, TEAM_COLORS.red);
    team(m.spawns.blue, TEAM_COLORS.blue);
  }
  for (const [i, z] of m.zones.entries()) {
    ctx.beginPath(); ctx.arc(z.x, z.y, ZONE_RADIUS, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(122, 128, 139, 0.12)'; ctx.fill();
    ctx.strokeStyle = 'rgba(42, 46, 54, 0.6)'; ctx.lineWidth = 3 / k; ctx.setLineDash([10 / k, 8 / k]); ctx.stroke(); ctx.setLineDash([]);
    ctx.fillStyle = 'rgba(42, 46, 54, 0.75)'; ctx.font = (28 / k) + 'px system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('ABC'[i], z.x, z.y);
  }
  if (heat) {
    ctx.imageSmoothingEnabled = true;
    ctx.globalAlpha = 0.8;
    ctx.drawImage(heatLayer(size, heat.dmg), 0, 0, size, size);
    ctx.globalAlpha = 1;
  }
  const crates = m.crates.map((c, i) => crateSolid({ id: i, x: c.x - CRATE_SIZE / 2, y: c.y - CRATE_SIZE / 2, size: CRATE_SIZE, hp: WORLD.crateHp }));
  drawLooseShadows(ctx, crates);
  drawSolids(ctx, [...curbs, ...walls, ...crates]);
  if (m.range) drawTargets(ctx, { targets: m.range.targets.map(() => 10), match: { map: m.name } }, 0, 1e9, { x0: 0, y0: 0, x1: size, y1: size });
  if (heat) {
    ctx.fillStyle = 'rgba(28, 31, 38, 0.55)';
    for (let i = 0; i < heat.death.length; i += 2) { ctx.beginPath(); ctx.arc(heat.death[i], heat.death[i + 1], 2.2 / k, 0, Math.PI * 2); ctx.fill(); }
  }
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  const label = heat ? m.name + '  ' + heat.mode + ': damage taken (heat), deaths (dots)' : m.name + '  ' + size + ' x ' + size;
  ctx.font = '600 26px system-ui, sans-serif'; ctx.textAlign = 'left'; ctx.textBaseline = 'top';
  ctx.fillStyle = 'rgba(28, 31, 38, 0.82)'; ctx.fillRect(16, 16, ctx.measureText(label).width + 28, 44);
  ctx.fillStyle = '#e6ebf5'; ctx.fillText(label, 30, 25);
  return canvas.toDataURL('image/png');
};
`;

const here = dirname(fileURLToPath(import.meta.url));
const bundle = await build({ stdin: { contents: PAGE, resolveDir: here, loader: 'ts' }, bundle: true, write: false, format: 'iife', logLevel: 'error' });
const script = bundle.outputFiles[0]!.text;

const page = await openPage({ profile: 'skirmish-overview-' });
const evaluate = async (expression: string): Promise<string> => {
  const { result, exceptionDetails: ex } = await page.cdp('Runtime.evaluate', { expression, returnByValue: true });
  if (ex) throw new Error(ex.exception?.description ?? ex.text);
  return result.value;
};
const save = (file: string, dataUrl: string) => { writeFileSync(file, Buffer.from(dataUrl.split(',')[1]!, 'base64')); console.log(`saved ${file}`); };

await evaluate(script);
for (const id of maps) save(join(OUT, `overview-${id}.png`), await evaluate(`renderMap(${JSON.stringify(id)}, ${PX}, null)`));
for (const file of heatFiles) {
  const heat = JSON.parse(readFileSync(file, 'utf8')) as { map: MapId; mode: string };
  save(join(OUT, `heat-${heat.map}-${heat.mode}.png`), await evaluate(`renderMap(${JSON.stringify(heat.map)}, ${PX}, ${JSON.stringify(heat)})`));
}
page.close();
