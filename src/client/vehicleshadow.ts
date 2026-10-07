import type { MapPoly } from '../shared/geom.ts';

/**
 * The map polygons a vehicle-kit model stands on. The model bakes its own contact shadow, so the generic drop shadow that
 * geoart.ts lays under every polygon is skipped for these (from the frame after the model is first drawn).
 */
const owned = new WeakSet<MapPoly>();
export const claimShadows = (polys: readonly MapPoly[]): void => { for (const p of polys) owned.add(p); };
export const kitShadowed = (p: MapPoly): boolean => owned.has(p);
