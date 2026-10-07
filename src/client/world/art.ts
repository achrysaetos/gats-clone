/**
 * The look every baked image shares: the camera, the sun and the bake resolution.
 * The Blender scripts read these through `art/build/spec.json`, so a change here reaches every bake after `npm run art`.
 */
export const ART = {
  camera: {
    /** Game units a point moves north per unit of height, so a solid's south face shows below its top. */
    shear: 0.3,
  },
  bake: {
    /** Pixels per game unit in map tiles. */
    pxPerUnit: 1.6,
    tilePx: 1024,
    /** Baked floor past each map edge, in game units: the quay. Water beyond it is drawn live. */
    margin: 64,
  },
  sun: {
    /** The way shadows fall on the floor, in game coordinates (x east, y south). */
    shadow: [-0.62, 0.78] as const,
    elevation: 26,
    strength: 6.0,
    softness: 2.2,
    color: [1.0, 0.86, 0.68] as const,
  },
  sky: { color: [0.7, 0.75, 0.86] as const, strength: 0.5 },
  floor: {
    slab: 120,
    a: [0.47, 0.45, 0.42] as const,
    b: [0.56, 0.535, 0.5] as const,
    seam: [0.2, 0.19, 0.18] as const,
    /** What collects where walls meet the floor. */
    grime: [0.45, 0.4, 0.34] as const,
    /** The quay outside the map edge. */
    quay: [0.4, 0.39, 0.37] as const,
  },
  render: { samples: 16, exposure: 0.35, look: 'AgX - High Contrast' },
  heights: { concrete: 46, sandstone: 46, planter: 26, curb: 20, crate: 30, slate: 36 },
} as const;

/** How far a shadow reaches along the floor per unit of height. */
export const SHADOW_PER_HEIGHT = 1 / Math.tan((ART.sun.elevation * Math.PI) / 180);
