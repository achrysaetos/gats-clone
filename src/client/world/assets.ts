import { Assets, Texture, type Spritesheet } from 'pixi.js';
import { WORLD } from '../../shared/defs.ts';
import { INK } from '../palette.ts';
import { GUN_PARTS } from '../sprites.ts';
import { frameKey, PX_PER_UNIT, SPRITES, type Layer } from './catalog.ts';

/** What `npm run art` wrote: the packed sprite atlases and each map layout's baked ground tiles, all under /assets/. */
export type Manifest = {
  atlases: string[];
  maps: Record<string, MapTiles>;
  water: string | null;
};

/** Tile `cx_cy` covers [origin + cx * span, origin + (cx + 1) * span) on both axes, in game units. */
export type MapTiles = { id: string; span: number; origin: number; count: number; tiles: Record<string, string> };

export const ASSET_ROOT = 'assets/';
const EMPTY: Manifest = { atlases: [], maps: {}, water: null };

export type Art = {
  manifest: Manifest;
  /** The baked frame, or a plain stand-in when the atlas lacks it. */
  frame: (name: string, layer: Layer, dir?: number, frame?: number) => Texture;
  has: (name: string, layer: Layer) => boolean;
  water: Texture | null;
};

export async function loadArt(): Promise<Art> {
  const manifest = await fetch(`${ASSET_ROOT}manifest.json`).then((r) => (r.ok ? (r.json() as Promise<Manifest>) : EMPTY)).catch(() => EMPTY);
  const sheets = await Promise.all(manifest.atlases.map((a) => Assets.load<Spritesheet>(ASSET_ROOT + a).catch(() => null)));
  const frames = new Map<string, Texture>();
  for (const sheet of sheets) for (const [key, tex] of Object.entries(sheet?.textures ?? {})) frames.set(key, tex);
  const water = manifest.water ? await Assets.load<Texture>(ASSET_ROOT + manifest.water).catch(() => null) : null;
  if (water) water.source.addressMode = 'repeat';
  const standIns = new Map<string, Texture>();
  return {
    manifest, water,
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
}

const R = WORLD.playerRadius;

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
  } else if (layer === 'glow' || family === 'thrown' || family === 'turret') {
    disc(Math.min(spec.box.w, spec.box.h) / 4, layer === 'glow' ? '#ffd56a' : '#3a3f48');
  }
  return Texture.from(c);
}
