/// <reference types="node" />
// Usage: [BLENDER=<binary>] [ART_GPU=1] npm run art [-- --only maps|sprites|water|sounds] [--maps plaza,oldtown]   ART_GPU=1 renders on the GPU when Blender finds one.
// Rebuilds every baked asset the client loads and rewrites public/assets/manifest.json. Each bake is keyed by a hash of
// everything it reads, so an unchanged map or sprite set is reused from art/build instead of rendered again.
// Needs Blender 4.5 or later for maps and sprites (BLENDER, else `blender` on PATH, else the macOS app bundle), and ffmpeg
// on PATH plus network access for sounds, which downloads each source once into art/build/sfx-cache.
// The maps step runs art/blender/check_map.py on each map first and stops on any geometry its collision rects miss.
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, relative } from 'node:path';
import sharp from 'sharp';
import { MAP_IDS, MAPS, type MapId } from '../../src/shared/maps.ts';
import type { Manifest, MapTiles } from '../../src/client/world/assets.ts';
import { ART } from '../../src/client/world/art.ts';
import { frameKey, layerFrames, SPRITES, type Layer } from '../../src/client/world/catalog.ts';
import { layoutKey } from '../../src/client/world/layout.ts';
import { packFrames, type Frame } from './pack.ts';
import { makeWater } from './water.ts';

const BUILD = 'art/build';
const OUT = 'public/assets';
const args = process.argv.slice(2);
const only = args.includes('--only') ? args[args.indexOf('--only') + 1] : null;
const pickedMaps = args.includes('--maps') ? (args[args.indexOf('--maps') + 1]!.split(',') as MapId[]) : [...MAP_IDS];
const runs = (step: 'maps' | 'sprites' | 'water' | 'sounds') => !only || only === step;

const fail = (message: string): never => { console.error(`npm run art: ${message}`); process.exit(1); };
const answers = (cmd: string, flag: string) => spawnSync(cmd, [flag], { stdio: 'ignore' }).status === 0;
const MAC_BLENDER = '/Applications/Blender.app/Contents/MacOS/Blender';
function findBlender(): string {
  if (process.env.BLENDER) {
    if (answers(process.env.BLENDER, '--version')) return process.env.BLENDER;
    fail(`BLENDER=${process.env.BLENDER} does not run. Point it at a Blender 4.5+ binary.`);
  }
  for (const cmd of ['blender', MAC_BLENDER]) if (answers(cmd, '--version')) return cmd;
  return fail(`Blender not found: tried \`blender\` on PATH and ${MAC_BLENDER}. Install Blender 4.5+ or set BLENDER to its binary.`);
}
const BLENDER = runs('maps') || runs('sprites') ? findBlender() : '';
if (runs('sounds') && !answers('ffmpeg', '-version')) fail('ffmpeg not found on PATH; the sounds step encodes with it. Install ffmpeg, or pass --only maps|sprites|water.');

const sha = (...parts: (string | Buffer)[]) => {
  const h = createHash('sha256');
  for (const p of parts) h.update(p);
  return h.digest('hex');
};
const files = (dir: string): string[] => (existsSync(dir) ? readdirSync(dir, { recursive: true, withFileTypes: true }).filter((d) => d.isFile()).map((d) => join(d.parentPath, d.name)).sort() : []);
const hashFiles = (paths: string[]) => sha(...paths.flatMap((p) => [p, readFileSync(p)]));
const run = (cmd: string, argv: string[]) => {
  const started = Date.now();
  const r = spawnSync(cmd, argv, { stdio: ['ignore', 'inherit', 'inherit'] });
  if (r.status !== 0) throw new Error(`${cmd} ${argv.join(' ')} exited ${r.status}`);
  return (Date.now() - started) / 1000;
};
/** Writes `data` as `<dir>/<name>.<hash8>.<ext>` and returns its path under public/assets. */
function emit(dir: string, name: string, ext: string, data: Buffer): string {
  const file = join(OUT, dir, `${name}.${sha(data).slice(0, 10)}.${ext}`);
  mkdirSync(dirname(file), { recursive: true });
  if (!existsSync(file)) writeFileSync(file, data);
  return relative(OUT, file);
}

const previous: Manifest = existsSync(join(OUT, 'manifest.json')) ? JSON.parse(readFileSync(join(OUT, 'manifest.json'), 'utf8')) : { atlases: [], maps: {}, water: null };
const manifest: Manifest = structuredClone(previous);

run('node', ['scripts/art/export-maps.ts', join(BUILD, 'spec.json')]);
run('node', ['scripts/art/export-sprites.ts', join(BUILD, 'sprites-spec.json')]);
const spec = JSON.parse(readFileSync(join(BUILD, 'spec.json'), 'utf8')) as { maps: { id: string }[] };
const mapScripts = [...files('art/blender').filter((f) => /bake_map\.py$|scene\.py$/.test(f)), ...files('art/textures')];

async function bakeMap(id: MapId) {
  const check = spawnSync(BLENDER, ['-b', '-P', 'art/blender/check_map.py', '--', join(BUILD, 'spec.json'), id], { stdio: ['ignore', 'pipe', 'inherit'], encoding: 'utf8' });
  const verdict = check.stdout.split('\n').filter((l) => /uncovered/.test(l));
  console.log(verdict.join('\n'));
  if (check.status !== 0) fail(`${id}: art/blender/check_map.py found geometry its collision rects do not cover (above). Fix the map or bake_map.py before baking.`);
  const key = layoutKey(MAPS[id].walls);
  const { maps: _, ...shared } = spec as Record<string, unknown>;
  const inputs = sha(JSON.stringify(shared), JSON.stringify(spec.maps.find((m) => m.id === id)), hashFiles(mapScripts)).slice(0, 16);
  const dir = join(BUILD, 'tiles', id, inputs);
  const span = ART.bake.tilePx / ART.bake.pxPerUnit;
  const count = Math.ceil((MAPS[id].size + 2 * ART.bake.margin) / span);
  if (files(dir).filter((f) => f.endsWith('.png')).length < count * count) {
    console.log(`baking ${id}: ${count * count} tiles into ${dir}`);
    console.log(`baked ${id} in ${run(BLENDER, ['-b', '-P', 'art/blender/bake_map.py', '--', join(BUILD, 'spec.json'), id, dir]).toFixed(0)}s`);
  } else console.log(`${id}: tiles current (${inputs})`);
  const tiles: Record<string, string> = {};
  let bytes = 0;
  for (let cy = 0; cy < count; cy++) for (let cx = 0; cx < count; cx++) {
    const png = join(dir, `${cx}_${cy}.png`);
    const { channels, isOpaque } = await sharp(png).stats();
    if (!isOpaque && channels[3]!.max === 0) continue;
    const webp = await sharp(png).webp({ quality: 80, alphaQuality: 90, effort: 5 }).toBuffer();
    bytes += webp.length;
    tiles[`${cx}_${cy}`] = emit(join('maps', id), `${cx}_${cy}`, 'webp', webp);
  }
  for (const [k, m] of Object.entries(manifest.maps)) if (m.id === id && k !== key) delete manifest.maps[k];
  manifest.maps[key] = { id, span, origin: -ART.bake.margin, count, tiles } satisfies MapTiles;
  console.log(`${id}: ${Object.keys(tiles).length} tiles, ${(bytes / 1024).toFixed(0)} KB`);
}

async function bakeSprites() {
  const scripts = files('art/blender').filter((f) => /bake_sprites\.py$|\/sprites\//.test(f));
  if (!scripts.length) { console.log('sprites: no bake script yet, keeping the current atlas'); return; }
  const inputs = sha(readFileSync(join(BUILD, 'sprites-spec.json')), hashFiles([...scripts, ...files('art/sprite-sources')])).slice(0, 16);
  const dir = join(BUILD, 'sprites', inputs);
  if (!existsSync(join(dir, '.done'))) {
    console.log(`baked sprites in ${run(BLENDER, ['-b', '-P', 'art/blender/bake_sprites.py', '--', join(BUILD, 'sprites-spec.json'), dir]).toFixed(0)}s`);
    writeFileSync(join(dir, '.done'), '');
  } else console.log(`sprites: current (${inputs})`);
  if (existsSync('scripts/art/check-sprites.ts')) run('node', ['scripts/art/check-sprites.ts', join(BUILD, 'sprites-spec.json'), dir]);
  const frames: Frame[] = [];
  for (const [name, s] of Object.entries(SPRITES)) for (const layer of s.layers as Layer[]) for (let d = 0; d < s.dirs; d++) for (let f = 0; f < layerFrames(s, layer); f++) {
    const png = join(dir, name, layer, `${d}_${f}.png`);
    if (existsSync(png)) frames.push({ key: frameKey(name, layer, d, f), file: png });
  }
  const pages = await packFrames(frames);
  manifest.atlases = [];
  let bytes = 0;
  for (const [i, page] of pages.entries()) {
    const webp = await sharp(page.image, { raw: page.raw }).webp({ quality: 90, alphaQuality: 95, effort: 5 }).toBuffer();
    bytes += webp.length;
    const image = emit('sprites', `atlas-${i}`, 'webp', webp);
    const json = Buffer.from(JSON.stringify({ frames: page.frames, meta: { image: basename(image), size: { w: page.raw.width, h: page.raw.height }, scale: '1' } }));
    manifest.atlases.push(emit('sprites', `atlas-${i}`, 'json', json));
  }
  console.log(`sprites: ${frames.length} frames on ${pages.length} pages, ${(bytes / 1024).toFixed(0)} KB`);
}

if (runs('maps')) for (const id of pickedMaps) await bakeMap(id);
if (runs('sprites')) await bakeSprites();
if (runs('water')) manifest.water = emit('', 'water', 'webp', await makeWater());
if (runs('sounds')) {
  const sounds = 'scripts/art/sounds.ts';
  if (existsSync(sounds)) run('node', [sounds]);
}

writeFileSync(join(OUT, 'manifest.json'), JSON.stringify(manifest, null, 1) + '\n');
const live = new Set([...manifest.atlases, ...manifest.atlases.map((a) => join(dirname(a), JSON.parse(readFileSync(join(OUT, a), 'utf8')).meta.image)), ...Object.values(manifest.maps).flatMap((m) => Object.values(m.tiles)), ...(manifest.water ? [manifest.water] : [])]);
for (const f of files(OUT)) {
  const rel = relative(OUT, f);
  if (/\.[0-9a-f]{10}\.(webp|json)$/.test(rel) && !rel.startsWith('sfx/') && !live.has(rel)) rmSync(f);
}
const total = files(OUT).reduce((n, f) => n + statSync(f).size, 0);
console.log(`public/assets: ${(total / 1024 / 1024).toFixed(1)} MB`);
