import type { MapId } from '../../shared/maps.ts';

export const FLOOR_DETAILS = ['concrete', 'asphalt'] as const;
export type FloorDetail = (typeof FLOOR_DETAILS)[number];
/** The detail texture each map's floor takes: poured concrete slabs unless named, asphalt and ballast for open yards. */
export const MAP_FLOOR: Partial<Record<MapId, FloorDetail>> = { outpost: 'asphalt' };

/**
 * The look every baked image shares: the camera, the sun and the bake resolution.
 * The Blender scripts read these through `art/build/spec.json`, so a change here reaches every bake after `npm run art`.
 */
export const ART = {
  camera: {
    /** Game units a point moves north per unit of height, so a solid's south face shows below its top. */
    shear: 0.3,
  },
  /**
   * Each map's light layer: one image of the floor's colour, paint, sun shadows, contact darkening and lamp pools, drawn under
   * the kit and multiplied by a tiling floor detail texture that keeps the floor sharp at any zoom.
   */
  light: {
    /** Pixels per game unit: the layer holds only soft things, so a 4000-unit map stays one 2064 px image. */
    pxPerUnit: 0.5,
    /** Baked floor past each map edge, in game units: the quay. Water beyond it is drawn live. */
    margin: 64,
    samples: 24,
    /** The largest light layer a GPU must hold in one texture. */
    maxPx: 4096,
  },
  /** The tiling floor detail: `px` square, one repeat covering `repeat` game units, with its encoded mean at `mean`. */
  detail: { px: 512, repeat: 256, mean: 0.86 },
  sun: {
    /** The way shadows fall on the floor, in game coordinates (x east, y south). */
    shadow: [-0.62, 0.78] as const,
    elevation: 26,
    strength: 6.0,
    softness: 2.2,
    color: [1.0, 0.9, 0.78] as const,
  },
  sky: { color: [0.7, 0.75, 0.86] as const, strength: 0.42 },
  floor: {
    slab: 120,
    a: [0.33, 0.335, 0.345] as const,
    b: [0.38, 0.385, 0.395] as const,
    seam: [0.2, 0.19, 0.18] as const,
    /** What collects where walls meet the floor. */
    grime: [0.36, 0.32, 0.27] as const,
    /** The quay outside the map edge. */
    quay: [0.28, 0.283, 0.29] as const,
    /** Asphalt maps' floor, in place of a and b. */
    asphalt: [0.2, 0.198, 0.192] as const,
  },
  render: { samples: 16, exposure: 0.3, view: 'Khronos PBR Neutral', look: 'None' },
  heights: { concrete: 46, sandstone: 46, planter: 26, curb: 20, crate: 30, slate: 36, metal: 60, wood: 40, sandbag: 28 },
} as const;

/** How far a shadow reaches along the floor per unit of height. */
export const SHADOW_PER_HEIGHT = 1 / Math.tan((ART.sun.elevation * Math.PI) / 180);
