/// <reference types="node" />
// Usage: [BLENDER=<binary>] [ART_GPU=1] npm run art [-- --only maps|sprites|kit|floors|water|sounds] [--maps warehouse,vault]
// ART_GPU=1 renders on the GPU when Blender finds one.
// Rebuilds every baked asset the client loads and rewrites public/assets/manifest.json: each map's light layer, the sprite
// atlas, the kit atlas (map pieces and the train, on pages of their own), the floor detail textures, the water and the
// sounds. Each bake is keyed by a hash of everything it reads, so an unchanged map or sprite set is reused from art/build.
// Needs Blender 4.5 or later for maps, sprites and kit (BLENDER, else `blender` on PATH, else the macOS app bundle), and
// ffmpeg on PATH plus network access for sounds, which downloads each source once into art/build/sfx-cache.
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, readFileSync, rmdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, relative } from 'node:path';
import sharp from 'sharp';
import { MAP_IDS, MAPS, type MapId } from '../../src/shared/maps.ts';
import type { LightLayer, Manifest } from '../../src/client/world/assets.ts';
import { ART, FLOOR_DETAILS, MAP_FLOOR } from '../../src/client/world/art.ts';
import { frameKey, layerFrames, SPRITES, type Layer } from '../../src/client/world/catalog.ts';
import { layoutKey } from '../../src/client/world/layout.ts';
import { makeFloorDetail } from './floor.ts';
import { packFrames, type Frame } from './pack.ts';
import { makeWater } from './water.ts';

const BUILD = 'art/build';
const OUT = 'public/assets';
const STEPS = ['maps', 'sprites', 'kit', 'floors', 'water', 'sounds'] as const;
type Step = (typeof STEPS)[number];
const args = process.argv.slice(2);
const only = args.includes('--only') ? args[args.indexOf('--only') + 1] : null;
const pickedMaps = args.includes('--maps') ? (args[args.indexOf('--maps') + 1]!.split(',') as MapId[]) : [...MAP_IDS];
const runs = (step: Step) => !only || only === step;

const fail = (message: string): never => { console.error(`npm run art: ${message}`); process.exit(1); };
if (only && !(STEPS as readonly string[]).includes(only)) fail(`--only takes one of ${STEPS.join(', ')}`);
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
const BLENDER = runs('maps') || runs('sprites') || runs('kit') ? findBlender() : '';
if (runs('sounds') && !answers('ffmpeg', '-version')) fail('ffmpeg not found on PATH; the sounds step encodes with it. Install ffmpeg, or pass --only with another step.');

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
/** Writes `data` as `<dir>/<name>.<hash10>.<ext>` and returns its path under public/assets. */
function emit(dir: string, name: string, ext: string, data: Buffer): string {
  const file = join(OUT, dir, `${name}.${sha(data).slice(0, 10)}.${ext}`);
  mkdirSync(dirname(file), { recursive: true });
  if (!existsSync(file)) writeFileSync(file, data);
  return relative(OUT, file);
}
const kb = (n: number) => `${(n / 1024).toFixed(0)} KB`;

/** The manifest as last written, keeping only what this build still makes: light layers of current maps. */
function previousManifest(): Manifest {
  const empty: Manifest = { atlases: [], kit: [], maps: {}, floors: {}, water: null };
  if (!existsSync(join(OUT, 'manifest.json'))) return empty;
  const old = JSON.parse(readFileSync(join(OUT, 'manifest.json'), 'utf8')) as Partial<Manifest>;
  const maps = Object.fromEntries(Object.entries(old.maps ?? {}).filter(([, m]) => 'light' in m && (MAP_IDS as readonly string[]).includes(m.id)));
  return { ...empty, ...old, maps };
}
const manifest = previousManifest();

run('node', ['scripts/art/export-maps.ts', join(BUILD, 'spec.json')]);
run('node', ['scripts/art/export-sprites.ts', join(BUILD, 'sprites-spec.json')]);
const spec = JSON.parse(readFileSync(join(BUILD, 'spec.json'), 'utf8')) as { maps: { id: string }[] };

async function bakeLight(id: MapId) {
  const { maps: _, ...shared } = spec as Record<string, unknown>;
  const scripts = files('art/blender').filter((f) => /(bake_light|scene|device)\.py$/.test(f));
  const inputs = sha(JSON.stringify(shared), JSON.stringify(spec.maps.find((m) => m.id === id)), hashFiles(scripts)).slice(0, 16);
  const png = join(BUILD, 'light', id, inputs, 'light.png');
  if (!existsSync(png)) {
    mkdirSync(dirname(png), { recursive: true });
    console.log(`baked ${id} light layer in ${run(BLENDER, ['-b', '-P', 'art/blender/bake_light.py', '--', join(BUILD, 'spec.json'), id, png]).toFixed(0)}s`);
  } else console.log(`${id}: light layer current (${inputs})`);
  // The client multiplies the floor detail over this layer, so it is lifted by the detail's mean to keep its brightness.
  const webp = await sharp(png).removeAlpha().linear(1 / ART.detail.mean, 0).webp({ quality: 82, effort: 5 }).toBuffer();
  const image = emit(join('maps', id), 'light', 'webp', webp);
  const span = MAPS[id].size + 2 * ART.light.margin;
  const layer: LightLayer = { image: basename(image), pxPerUnit: ART.light.pxPerUnit, origin: -ART.light.margin, span, detail: MAP_FLOOR[id] ?? 'concrete' };
  const json = emit(join('maps', id), 'light', 'json', Buffer.from(JSON.stringify(layer)));
  const key = layoutKey(MAPS[id].walls);
  for (const [k, m] of Object.entries(manifest.maps)) if (m.id === id && k !== key) delete manifest.maps[k];
  manifest.maps[key] = { id, light: json };
  const { width, height } = await sharp(webp).metadata();
  console.log(`${id}: light layer ${width}x${height}, ${kb(webp.length)}`);
}

/** The sprite groups baked, checked and packed apart: the kit loads with the maps, the rest with the menu. */
const GROUPS = {
  sprites: { names: (n: string) => !/^(kit|train)\./.test(n), scripts: (f: string) => !/\/kit\.py$/.test(f), page: 'atlas' },
  kit: { names: (n: string) => /^(kit|train)\./.test(n), scripts: (f: string) => !/\/(soldier|rig|zombies|guns|fx)\.py$/.test(f), page: 'kit' },
} as const;

async function bakeSprites(group: keyof typeof GROUPS): Promise<string[]> {
  const g = GROUPS[group];
  const full = JSON.parse(readFileSync(join(BUILD, 'sprites-spec.json'), 'utf8')) as { sprites: Record<string, unknown> };
  const groupSpec = join(BUILD, `sprites-spec.${group}.json`);
  writeFileSync(groupSpec, JSON.stringify({ ...full, sprites: Object.fromEntries(Object.entries(full.sprites).filter(([n]) => g.names(n))) }, null, 1));
  const scripts = files('art/blender').filter((f) => /(bake_sprites|device|\/sprites\/\w+)\.py$/.test(f)).filter(g.scripts);
  const inputs = sha(readFileSync(groupSpec), hashFiles([...scripts, ...files('art/sprite-sources')])).slice(0, 16);
  const dir = join(BUILD, group, inputs);
  if (!existsSync(join(dir, '.done'))) {
    console.log(`baked ${group} in ${run(BLENDER, ['-b', '-P', 'art/blender/bake_sprites.py', '--', groupSpec, dir]).toFixed(0)}s`);
    writeFileSync(join(dir, '.done'), '');
  } else console.log(`${group}: current (${inputs})`);
  run('node', ['scripts/art/check-sprites.ts', groupSpec, dir]);
  const frames: Frame[] = [];
  for (const [name, s] of Object.entries(SPRITES)) {
    if (!g.names(name)) continue;
    for (const layer of s.layers as Layer[]) for (let d = 0; d < s.dirs; d++) for (let f = 0; f < layerFrames(s, layer); f++) {
      const png = join(dir, name, layer, `${d}_${f}.png`);
      if (existsSync(png)) frames.push({ key: frameKey(name, layer, d, f), file: png });
    }
  }
  const pages = await packFrames(frames);
  const out: string[] = [];
  for (const [i, page] of pages.entries()) {
    const webp = await sharp(page.image, { raw: page.raw }).webp({ quality: 90, alphaQuality: 95, effort: 5 }).toBuffer();
    const image = emit('sprites', `${g.page}-${i}`, 'webp', webp);
    const json = Buffer.from(JSON.stringify({ frames: page.frames, meta: { image: basename(image), size: { w: page.raw.width, h: page.raw.height }, scale: '1' } }));
    out.push(emit('sprites', `${g.page}-${i}`, 'json', json));
    console.log(`${group} page ${i}: ${page.raw.width}x${page.raw.height}, ${Object.keys(page.frames).length} frames, ${kb(webp.length)} WebP, ${kb(json.length)} JSON`);
  }
  return out;
}

if (runs('maps')) for (const id of pickedMaps) await bakeLight(id);
if (runs('sprites')) manifest.atlases = await bakeSprites('sprites');
if (runs('kit')) manifest.kit = await bakeSprites('kit');
if (runs('floors')) for (const kind of FLOOR_DETAILS) manifest.floors[kind] = emit('floors', kind, 'webp', await makeFloorDetail(kind));
if (runs('water')) manifest.water = emit('', 'water', 'webp', await makeWater());
if (runs('sounds')) run('node', ['scripts/art/sounds.ts']);

writeFileSync(join(OUT, 'manifest.json'), JSON.stringify(manifest, null, 1) + '\n');
const sheetImage = (json: string) => join(dirname(json), JSON.parse(readFileSync(join(OUT, json), 'utf8')).meta.image);
const lightImage = (json: string) => join(dirname(json), (JSON.parse(readFileSync(join(OUT, json), 'utf8')) as LightLayer).image);
const live = new Set([
  ...manifest.atlases, ...manifest.atlases.map(sheetImage), ...manifest.kit, ...manifest.kit.map(sheetImage),
  ...Object.values(manifest.maps).flatMap((m) => [m.light, lightImage(m.light)]), ...Object.values(manifest.floors), ...(manifest.water ? [manifest.water] : []),
]);
for (const f of files(OUT)) {
  const rel = relative(OUT, f);
  if (/\.[0-9a-f]{10}\.(webp|json)$/.test(rel) && !rel.startsWith('sfx/') && !live.has(rel)) rmSync(f);
}
if (existsSync(join(OUT, 'maps'))) for (const d of readdirSync(join(OUT, 'maps'), { withFileTypes: true })) if (d.isDirectory() && !readdirSync(join(OUT, 'maps', d.name)).length) rmdirSync(join(OUT, 'maps', d.name));
const total = files(OUT).reduce((n, f) => n + statSync(f).size, 0);
console.log(`public/assets: ${(total / 1024 / 1024).toFixed(1)} MB`);
