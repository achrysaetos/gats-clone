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
    shadow: [-0.6, 0.8] as const,
    elevation: 24,
    strength: 4.2,
    softness: 1.2,
    color: [1.0, 0.95, 0.86] as const,
  },
  sky: { color: [0.55, 0.66, 0.85] as const, strength: 0.55 },
  floor: { slab: 100, a: [0.52, 0.52, 0.51] as const, b: [0.58, 0.58, 0.565] as const, seam: [0.3, 0.3, 0.3] as const },
  render: { samples: 24, exposure: 0.15, look: 'AgX - Medium High Contrast' },
  heights: { concrete: 46, sandstone: 46, planter: 26, curb: 20, crate: 30, slate: 36 },
} as const;

/** How far a shadow reaches along the floor per unit of height. */
export const SHADOW_PER_HEIGHT = 1 / Math.tan((ART.sun.elevation * Math.PI) / 180);
