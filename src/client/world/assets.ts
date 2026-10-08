import { Assets, Spritesheet, Texture, type SpritesheetData } from 'pixi.js';
import { WORLD } from '../../shared/defs.ts';
import { INK } from '../palette.ts';
import { GUN_PARTS } from '../sprites.ts';
import { frameKey, PX_PER_UNIT, SPRITES, type Layer } from './catalog.ts';
import { ART, type FloorDetail } from './art.ts';
import { KIT, type Material, type PieceId } from '../../shared/kit.ts';

/**
 * What `npm run art` wrote, all under /assets/: the sprite atlas pages, the kit's pages (map pieces and the train), each map
 * layout's light layer (keyed by `layoutKey` of its walls), the floor detail textures and the water.
 */
export type Manifest = {
  atlases: string[];
  kit: string[];
  maps: Record<string, { id: string; light: string }>;
  floors: Partial<Record<FloorDetail, string>>;
  water: string | null;
};

/** A map's light layer, as its JSON beside the image says: one image covering [origin, origin + span) on both axes. */
export type LightLayer = { image: string; pxPerUnit: number; origin: number; span: number; detail: FloorDetail };

export const ASSET_ROOT = 'assets/';
const EMPTY: Manifest = { atlases: [], kit: [], maps: {}, floors: {}, water: null };

export type Art = {
  /** Empty until the manifest arrives. */
  manifest: Manifest;
  /** The baked frame, or a plain stand-in until the atlas holding it arrives, or when it lacks it. */
  frame: (name: string, layer: Layer, dir?: number, frame?: number) => Texture;
  has: (name: string, layer: Layer) => boolean;
  water: Texture | null;
  /** The floor detail textures, each set to repeat; absent until it loads. */
  floors: Partial<Record<FloorDetail, Texture>>;
  /** Bytes of the atlases, kit, floors and water received over their total, 0 to 1. */
  progress(): number;
  /** Settles once every atlas, the kit, the floors and the water have loaded or failed; failures leave stand-ins. */
  ready: Promise<void>;
  loaded(): boolean;
};

/** Fetches `url` whole, counting bytes as they arrive, so a progress bar moves within a big file. */
async function fetchCounted(url: string, onBytes: (n: number, total: number) => void): Promise<Blob | null> {
  const res = await fetch(url).catch(() => null);
  if (!res?.ok || !res.body) return null;
  const total = Number(res.headers.get('content-length')) || 0;
  onBytes(0, total);
  const chunks: Uint8Array<ArrayBuffer>[] = [];
  const reader = res.body.getReader();
  for (;;) {
    const { done, value } = await reader.read().catch(() => ({ done: true, value: undefined }));
    if (done || !value) break;
    chunks.push(value);
    onBytes(value.length, 0);
  }
  return new Blob(chunks, { type: res.headers.get('content-type') ?? '' });
}

async function textureFrom(blob: Blob | null): Promise<Texture | null> {
  if (!blob) return null;
  const url = URL.createObjectURL(blob);
  try { return await Assets.load<Texture>({ src: url, parser: 'loadTextures' }); } catch { return null; } finally { URL.revokeObjectURL(url); }
}

/** Starts loading the art and returns at once; frames read as stand-ins until their atlas lands. */
export function loadArt(): Art {
  const frames = new Map<string, Texture>();
  const standIns = new Map<string, Texture>();
  let received = 0, total = 0, files = 0, started = 0, done = false;
  const count = (n: number, size: number) => { received += n; total += size; if (size) started++; };
  const art: Art = {
    manifest: EMPTY, water: null, floors: {},
    progress: () => (done ? 1 : files === 0 || started < files || total === 0 ? 0 : Math.min(1, received / total)),
    loaded: () => done,
    ready: Promise.resolve(),
    has: (name, layer) => frames.has(frameKey(name, layer)),
    frame(name, layer, dir = 0, f = 0) {
      const key = frameKey(name, layer, dir, f);
      const baked = frames.get(key);
      if (baked) return baked;
      let tex = standIns.get(key);
      if (!tex) standIns.set(key, (tex = standIn(name, layer, dir)));
      return tex;
    },
  };
  const json = (url: string) => fetch(url).then((r) => (r.ok ? r.json() : null)).catch(() => null);
  async function sheet(path: string) {
    const data = (await json(ASSET_ROOT + path)) as SpritesheetData | null;
    if (!data?.meta.image) return;
    const image = path.slice(0, path.lastIndexOf('/') + 1) + data.meta.image;
    const tex = await textureFrom(await fetchCounted(ASSET_ROOT + image, count));
    if (!tex) return;
    const parsed = await new Spritesheet(tex, data).parse();
    for (const [key, t] of Object.entries(parsed)) frames.set(key, t);
  }
  async function tiling(path: string) {
    const tex = await textureFrom(await fetchCounted(ASSET_ROOT + path, count));
    if (tex) tex.source.addressMode = 'repeat';
    return tex;
  }
  art.ready = (async () => {
    art.manifest = { ...EMPTY, ...((await json(`${ASSET_ROOT}manifest.json`)) as Partial<Manifest> | null) };
    const { atlases, kit, floors, water } = art.manifest;
    const floorPaths = Object.entries(floors) as [FloorDetail, string][];
    files = atlases.length + kit.length + floorPaths.length + (water ? 1 : 0);
    await Promise.all([
      ...[...atlases, ...kit].map(sheet),
      ...floorPaths.map(async ([kind, path]) => { const tex = await tiling(path); if (tex) art.floors[kind] = tex; }),
      ...(water ? [tiling(water).then((tex) => { art.water = tex; })] : []),
    ]);
    done = true;
  })();
  return art;
}

const R = WORLD.playerRadius;
const KIT_TOPS: Record<Material, string> = { concrete: '#a3abba', metal: '#6f7f99', wood: '#a07a4a', planter: '#5b6e45', sandbag: '#b9a77c' };

/** A flat shape in the sprite's box, so a frame missing from the atlas still shows where and how big the thing is. */
function standIn(name: string, layer: Layer, dir: number): Texture {
  const spec = SPRITES[name];
  if (!spec) return Texture.EMPTY;
  const px = PX_PER_UNIT * (spec.scale ?? 1);
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(spec.box.w * px));
  c.height = Math.max(1, Math.round(spec.box.h * px));
  const g = c.getContext('2d')!;
  g.scale(px, px);
  g.translate(-spec.box.x, -spec.box.y);
  g.rotate((dir / spec.dirs) * Math.PI * 2);
  const family = name.split('.')[0];
  const disc = (r: number, color: string) => { g.fillStyle = color; g.beginPath(); g.arc(0, 0, r, 0, Math.PI * 2); g.fill(); };
  if (family === 'soldier' || family === 'zombie') {
    const r = family === 'soldier' ? R : spec.box.w / 3.8;
    if (layer === 'shadow') disc(r, 'rgba(0,0,0,0.3)');
    else if (layer === 'base') disc(r, INK);
    else if (layer === 'team') disc(r - 2, '#fff');
    else if (layer.startsWith('armor')) { g.strokeStyle = INK; g.lineWidth = layer === 'armorLight' ? 1.6 : layer === 'armorMedium' ? 3.2 : 4.8; g.beginPath(); g.arc(0, 0, r - g.lineWidth / 2, 0, Math.PI * 2); g.stroke(); }
  } else if (family === 'gun') {
    g.fillStyle = INK;
    for (const p of GUN_PARTS[name.slice(4) as keyof typeof GUN_PARTS] ?? []) g.fillRect(p.x * R, p.y * R, p.w * R, p.h * R);
  } else if (layer === 'base' && (family === 'crate' || family === 'engineer' || family === 'siege' || family === 'core')) {
    g.fillStyle = family === 'crate' ? '#8a6a43' : '#7f8999';
    g.fillRect(0, 0, spec.box.w + spec.box.x * 2, spec.box.h - 18 + spec.box.x * 2);
  } else if (layer === 'base' && family === 'kit') {
    const [, id, turn] = name.match(/^kit\.(.+)\.(\d)\.\d$/) ?? [];
    const def = KIT[id as PieceId];
    if (def && def.height > 0 && !('overhead' in def)) {
      const [w, h] = Number(turn) % 2 ? [def.h, def.w] : [def.w, def.h];
      g.fillStyle = '#5d626c';
      g.fillRect(0, h, w, def.height * ART.camera.shear);
      g.fillStyle = KIT_TOPS[def.material];
      g.fillRect(0, 0, w, h);
    }
  } else if (layer === 'glow' || family === 'thrown' || family === 'turret') {
    disc(Math.min(spec.box.w, spec.box.h) / 4, layer === 'glow' ? '#ffd56a' : '#3a3f48');
  }
  return Texture.from(c);
}
