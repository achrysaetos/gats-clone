import type { MapDef } from '../shared/maps.ts';

/**
 * Ambient life registry (docs/maps/AMBIENT.md). This file is only types and a map: no canvas, no engine, so a map or theme file
 * can `registerAmbient('mymap', {...})` without importing the engine (ambient.ts), and the engine reads configs back with `ambientFor`.
 */
export type CritterKind =
  | 'pigeon' | 'crow' | 'gull' | 'sparrow' | 'duck'
  | 'rat' | 'mouse' | 'cat' | 'dog' | 'fox'
  | 'bat' | 'moth' | 'butterfly' | 'firefly'
  | 'fish'
  | 'tumbleweed' | 'leaf' | 'paper' | 'snow' | 'dustdevil'
  | 'steam' | 'horn' | 'aircraft';

export type AmbientPt = { x: number; y: number };
export type AmbientRect = { x: number; y: number; w: number; h: number };

export type AmbientGroup = {
  kind: CritterKind;
  /** How many. The engine caps this per kind and per view. */
  count?: number;
  /** Explicit anchors: perch spots (birds), homes or burrows (ground critters), lamps (moth, butterfly, firefly), vents or funnels (steam, horn), pond centres (duck). */
  at?: readonly AmbientPt[];
  /** Rectangles to place anchors in, deterministically. Default: the whole map minus a margin. */
  in?: readonly AmbientRect[];
  /** Where auto-placement looks. Default per kind: `wall` for birds and bats, `ground` for ground critters and drifters, `water` for fish, `air` for flyers and aircraft. */
  on?: 'wall' | 'ground' | 'water' | 'air';
  /** `on: 'wall'` and `on: 'water'`: only walls of these materials (water defaults to `water` and `pond`). */
  materials?: readonly string[];
  /** Extra rects auto-placement must keep clear of. */
  avoid?: readonly AmbientRect[];
  /** Shown by day, by night or always (default). Bats and aircraft default to night. */
  when?: 'day' | 'night' | 'any';
  /** Aircraft and horn only: the line crossed, and the time one crossing (or one puff cycle) takes. */
  path?: readonly [AmbientPt, AmbientPt];
  periodMs?: number;
  /** Sprite scale, default 1. */
  scale?: number;
  /** Ground critters: wander radius around home, default 180. */
  roam?: number;
};

export type AmbientConfig = {
  /** px/s drifting things lean this way (default: a light breeze). */
  wind?: AmbientPt;
  groups: readonly AmbientGroup[];
};

type Entry = AmbientConfig | ((map: MapDef) => AmbientConfig);
const registry = new Map<string, Entry>();

/** Registers (or replaces) the config for a map id or a theme id. */
export function registerAmbient(key: string, config: Entry): void { registry.set(key, config); }

/** The default yard: a few sparrows on the walls and litter on the wind. */
export const DEFAULT_AMBIENT: AmbientConfig = {
  groups: [
    { kind: 'sparrow', count: 4, on: 'wall' },
    { kind: 'pigeon', count: 3, on: 'wall' },
    { kind: 'paper', count: 3 },
    { kind: 'leaf', count: 4 },
  ],
};

/** The config for a map: its own id first, then its theme id, then the default yard. */
export function ambientFor(mapId: string, map?: MapDef): AmbientConfig {
  const entry = registry.get(mapId) ?? (map?.theme ? registry.get(map.theme) : undefined);
  if (!entry) return DEFAULT_AMBIENT;
  return typeof entry === 'function' ? (map ? entry(map) : DEFAULT_AMBIENT) : entry;
}
