import { Assets, Container, Graphics, Sprite, Texture, TilingSprite } from 'pixi.js';
import type { WallView } from '../../shared/protocol.ts';
import { ASSET_ROOT, type Art, type LightLayer } from './assets.ts';
import { ART } from './art.ts';
import type { View } from './scene.ts';

/**
 * The floor: the map's light layer (floor colour, paint, sun shadows, contact darkening, lamp pools) with a tiling detail
 * texture multiplied over it, so the floor stays sharp at any zoom while the layer stays small. Until the light layer
 * arrives, or for a layout with none, the map is drawn flat from its walls.
 */

/** How long a light layer that failed to load waits before it is asked for again, by failures so far; past the last it is given up on until the layout changes. */
export const LIGHT_RETRY_MS = [1000, 4000, 15_000, 60_000] as const;
export type LoadFailure = { tries: number; retryAt: number };

export function failLoad(prev: LoadFailure | undefined, now: number): LoadFailure {
  const tries = (prev?.tries ?? 0) + 1;
  return { tries, retryAt: now + (LIGHT_RETRY_MS[tries - 1] ?? Infinity) };
}

/** Game units one repeat of the water texture covers. */
const WATER_REPEAT = 256;
const FLOOR = 0xa7aaaf;
const TOPS: Record<string, number> = { concrete: 0xa3abba, sandstone: 0xd1b89f, planter: 0x5b6e45, curb: 0xb4b9c2 };

/** The map drawn flat from its walls: tops on their rects and south faces below them. */
function plainGround(walls: readonly WallView[], size: number): Graphics {
  const m = ART.light.margin;
  const g = new Graphics();
  g.rect(-m, -m, size + m * 2, size + m * 2).fill(FLOOR);
  for (const w of walls) {
    if (w.built) continue;
    g.rect(w.x, w.y + w.h, w.w, ART.heights[w.material] * ART.camera.shear).fill(0x5d626c);
    g.rect(w.x, w.y, w.w, w.h).fill(TOPS[w.material] ?? FLOOR);
  }
  return g;
}

type Shown = { layer: LightLayer; url: string };

export function createGround(art: Art, layer: Container, waterLayer: Container) {
  const water = new TilingSprite({ texture: undefined, width: 1, height: 1 });
  water.tint = 0x2c5f7c;
  waterLayer.addChild(water);
  const lit = new Sprite();
  const detail = new TilingSprite({ texture: Texture.WHITE, width: 1, height: 1 });
  detail.blendMode = 'multiply';
  detail.visible = false;
  layer.addChild(lit, detail);

  let layout = '';
  let plain: Graphics | null = null;
  let shown: Shown | null = null;
  let loading = false;
  let failure: LoadFailure | undefined;

  function setLayout(next: string, walls: readonly WallView[], size: number) {
    if (next === layout) return;
    layout = next;
    if (shown) void Assets.unload(shown.url);
    shown = null;
    failure = undefined;
    lit.visible = false;
    plain?.destroy();
    plain = plainGround(walls, size);
    layer.addChildAt(plain, 0);
    const m = ART.light.margin;
    detail.position.set(-m, -m);
    detail.width = detail.height = size + m * 2;
  }

  async function fetchLayer(path: string): Promise<{ layer: LightLayer; url: string; tex: Texture }> {
    const res = await fetch(ASSET_ROOT + path);
    if (!res.ok) throw new Error(`${path}: ${res.status}`);
    const layer = (await res.json()) as LightLayer;
    const url = ASSET_ROOT + path.slice(0, path.lastIndexOf('/') + 1) + layer.image;
    return { layer, url, tex: await Assets.load<Texture>(url) };
  }

  function stream(now: number) {
    const entry = art.manifest.maps[layout];
    if (!entry || shown || loading || now < (failure?.retryAt ?? 0)) return;
    loading = true;
    const forLayout = layout;
    fetchLayer(entry.light).then(({ layer: l, url, tex }) => {
      loading = false;
      if (forLayout !== layout) { void Assets.unload(url); return; }
      shown = { layer: l, url };
      lit.texture = tex;
      lit.position.set(l.origin, l.origin);
      lit.scale.set(l.span / tex.width);
      lit.visible = true;
      if (plain) plain.visible = false;
    }, () => {
      loading = false;
      if (forLayout === layout) failure = failLoad(failure, performance.now());
    });
  }

  /** The detail texture over the floor: the light layer's choice once it is in, concrete before. */
  function dress() {
    const tex = art.floors[shown?.layer.detail ?? 'concrete'];
    if (!tex) return;
    if (detail.texture !== tex) detail.texture = tex;
    detail.tileScale.set(ART.detail.repeat / tex.width);
    detail.visible = true;
  }

  return {
    /** Shows `layout`'s floor, and places the water under the whole screen in step with the world. */
    draw(next: string, walls: readonly WallView[], size: number, _view: View, screen: { w: number; h: number; x: number; y: number; scale: number }, now: number) {
      setLayout(next, walls, size);
      stream(performance.now());
      dress();
      if (art.water && water.texture !== art.water) { water.texture = art.water; water.tint = 0xffffff; }
      water.width = screen.w;
      water.height = screen.h;
      water.tileScale.set((screen.scale * WATER_REPEAT) / water.texture.width);
      water.tilePosition.set(screen.x + ((now / 90) % WATER_REPEAT) * screen.scale, screen.y + ((now / 140) % WATER_REPEAT) * screen.scale);
    },
    /** For the dev probe: the light layer on the GPU counts as one tile, and one that is failing as one failed tile. */
    loadedTiles: () => (shown ? 1 : 0),
    failedTiles: () => (failure && !shown ? 1 : 0),
  };
}
