import { Assets, Container, Graphics, Sprite, TilingSprite, type Texture } from 'pixi.js';
import type { WallView } from '../../shared/protocol.ts';
import { ASSET_ROOT, type Art, type MapTiles } from './assets.ts';
import { ART } from './art.ts';
import type { View } from './scene.ts';

/** Tiles kept on the GPU at most; the farthest from view go first. A 1080p view touches about twelve. */
const KEEP = 30;
/** Tiles fetched past the edge of the view, so walking never shows an unloaded one. */
const PREFETCH = 1;

export type TileId = `${number}_${number}`;

/** The tiles covering `view` plus a ring around it, nearest first. */
export function tilesFor(view: View, map: Pick<MapTiles, 'span' | 'origin' | 'count'>, ring = PREFETCH): TileId[] {
  const cell = (v: number) => Math.floor((v - map.origin) / map.span);
  const clamp = (c: number) => Math.max(0, Math.min(map.count - 1, c));
  const x0 = clamp(cell(view.x0) - ring), x1 = clamp(cell(view.x1) + ring), y0 = clamp(cell(view.y0) - ring), y1 = clamp(cell(view.y1) + ring);
  const cx = cell((view.x0 + view.x1) / 2), cy = cell((view.y0 + view.y1) / 2);
  const out: [TileId, number][] = [];
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) out.push([`${x}_${y}`, Math.hypot(x - cx, y - cy)]);
  return out.sort((a, b) => a[1] - b[1]).map(([id]) => id);
}

/** Game units one repeat of the water texture covers. */
const WATER_REPEAT = 256;
const FLOOR = 0xa7aaaf;
const TOPS: Record<string, number> = { concrete: 0xa3abba, sandstone: 0xd1b89f, planter: 0x5b6e45, curb: 0xb4b9c2 };

/** The map drawn flat from its walls: under the tiles while they load, and the whole ground for a layout with no bake. */
function plainGround(walls: readonly WallView[], size: number): Graphics {
  const g = new Graphics();
  g.rect(-ART.bake.margin, -ART.bake.margin, size + ART.bake.margin * 2, size + ART.bake.margin * 2).fill(FLOOR);
  for (const w of walls) {
    if (w.built) continue;
    const h = ART.heights[w.material] * ART.camera.shear;
    g.rect(w.x, w.y + w.h, w.w, h).fill(0x5d626c);
    g.rect(w.x, w.y, w.w, w.h).fill(TOPS[w.material] ?? FLOOR);
  }
  return g;
}

export function createGround(art: Art, layer: Container, waterLayer: Container) {
  const water = new TilingSprite({ texture: art.water ?? undefined, width: 1, height: 1 });
  if (!art.water) water.tint = 0x2c5f7c;
  waterLayer.addChild(water);
  let layout = '';
  let plain: Graphics | null = null;
  const loaded = new Map<string, Texture>();
  const loading = new Set<string>();
  const shown = new Map<string, Sprite>();

  function setLayout(next: string, walls: readonly WallView[], size: number) {
    if (next === layout) return;
    layout = next;
    for (const s of shown.values()) s.destroy();
    shown.clear();
    for (const url of loaded.keys()) void Assets.unload(url);
    loaded.clear();
    plain?.destroy();
    plain = plainGround(walls, size);
    layer.addChildAt(plain, 0);
  }

  function stream(view: View) {
    const map = art.manifest.maps[layout];
    if (!map) return;
    const wanted = tilesFor(view, map).filter((id) => map.tiles[id]);
    for (const id of wanted) {
      const url = ASSET_ROOT + map.tiles[id]!;
      if (loaded.has(url) || loading.has(url)) continue;
      loading.add(url);
      const forLayout = layout;
      Assets.load<Texture>(url).then((tex) => {
        loading.delete(url);
        if (forLayout !== layout) { void Assets.unload(url); return; }
        loaded.set(url, tex);
        const [cx, cy] = id.split('_').map(Number) as [number, number];
        const s = new Sprite(tex);
        s.position.set(map.origin + cx * map.span, map.origin + cy * map.span);
        s.scale.set(map.span / tex.width);
        layer.addChild(s);
        shown.set(url, s);
      }, () => loading.delete(url));
    }
    if (loaded.size <= KEEP) return;
    const keep = new Set(wanted.map((id) => ASSET_ROOT + map.tiles[id]!));
    for (const url of [...loaded.keys()]) {
      if (keep.has(url) || loaded.size <= KEEP) continue;
      shown.get(url)?.destroy();
      shown.delete(url);
      loaded.delete(url);
      void Assets.unload(url);
    }
  }

  return {
    /** Shows `layout`'s ground for `view`, and places the water under the whole screen in step with the world. */
    draw(next: string, walls: readonly WallView[], size: number, view: View, screen: { w: number; h: number; x: number; y: number; scale: number }, now: number) {
      setLayout(next, walls, size);
      stream(view);
      water.width = screen.w;
      water.height = screen.h;
      water.tileScale.set((screen.scale * WATER_REPEAT) / water.texture.width);
      water.tilePosition.set(screen.x + ((now / 90) % WATER_REPEAT) * screen.scale, screen.y + ((now / 140) % WATER_REPEAT) * screen.scale);
    },
    /** How many tiles of the current layout are on the GPU, for the dev probe. */
    loadedTiles: () => loaded.size,
  };
}
