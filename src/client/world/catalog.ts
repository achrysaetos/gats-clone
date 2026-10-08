import { CRATE_TIERS, GUN_IDS, TURRET_KINDS, WORLD, ZOM, ZOMBIE_KINDS, ZOMBIES, type CrateTier, type GunId } from '../../shared/defs.ts';
import { GUN_PARTS } from '../sprites.ts';

/**
 * Every baked sprite the world draws, as one table both sides read: `npm run art` bakes and packs a frame for each entry,
 * and the painter looks frames up by the same keys. A frame covers `box` (game units around the sprite's origin) at
 * `PX_PER_UNIT`, so the painter anchors and scales every frame of a sprite the same way.
 */
export const PX_PER_UNIT = 2;

/** Game units around the origin a frame covers. y points south. */
export type Box = { x: number; y: number; w: number; h: number };

export type SpriteSpec = {
  box: Box;
  /** Facings baked: frame `d` faces d / dirs of a turn clockwise from east. 1 means one east-facing frame the painter rotates. */
  dirs: number;
  /** Animation frames, played in order. */
  frames: number;
  /** Layers baked over the same box: `base` is drawn as is, `team` is a white mask the painter tints, `glow` is drawn additively and blooms. */
  layers: readonly Layer[];
  /** What the bake should build, in words a script can branch on. */
  model: string;
  /** Pixels per game unit relative to PX_PER_UNIT, for soft things that need fewer. */
  scale?: number;
};

export type Layer = 'base' | 'team' | 'glow' | 'shadow' | 'armorLight' | 'armorMedium' | 'armorHeavy';

const R = WORLD.playerRadius;
/** Room south of a footprint for the faces the oblique camera shows. */
const FACE = 18;

const square = (half: number, south = FACE): Box => ({ x: -half, y: -half, w: half * 2, h: half * 2 + south });

/** Gun frames share their origin with the body that holds them: x along the barrel, y across it. */
function gunBox(gun: GunId): Box {
  const parts = GUN_PARTS[gun];
  const pad = 2;
  const x0 = Math.min(0, ...parts.map((p) => p.x)) * R - pad, x1 = Math.max(...parts.map((p) => p.x + p.w)) * R + pad;
  const half = Math.max(...parts.map((p) => Math.max(-p.y, p.y + p.h))) * R + pad;
  return { x: x0, y: -half, w: x1 - x0, h: half * 2 };
}

/** A footprint's frame: origin at the footprint's top-left corner, with room for the south face and a little spill. */
const footprint = (w: number, h: number, pad = 6): Box => ({ x: -pad, y: -pad, w: w + pad * 2, h: h + pad * 2 + FACE });

export const CRATE_STAGES = 3;
export const WALL_STAGES = 3;

const entries: [string, SpriteSpec][] = [
  ['soldier', { box: square(R * 1.5, FACE), dirs: 32, frames: 1, layers: ['base', 'team', 'armorLight', 'armorMedium', 'armorHeavy'], model: 'soldier' }],
  ['soldier.shadow', { box: { x: -R * 4, y: -R * 4, w: R * 8, h: R * 8 }, dirs: 16, frames: 1, layers: ['shadow'], model: 'soldier', scale: 0.5 }],
  ['soldier.downed', { box: square(R * 1.8, FACE), dirs: 1, frames: 1, layers: ['base', 'team'], model: 'soldier-downed' }],
  ...GUN_IDS.map((gun): [string, SpriteSpec] => [`gun.${gun}`, { box: gunBox(gun), dirs: 1, frames: 1, layers: ['base'], model: `gun:${gun}` }]),
  ...ZOMBIE_KINDS.map((kind): [string, SpriteSpec] => [`zombie.${kind}`, { box: square(ZOMBIES[kind].radius * 1.9, FACE), dirs: 16, frames: 1, layers: ['base'], model: `zombie:${kind}`, scale: ZOMBIES[kind].radius > 30 ? 0.75 : 1 }]),
  ...(['plain', ...Object.keys(CRATE_TIERS)] as const).flatMap((tier) => {
    const size = tier === 'plain' ? CRATE_TIERS.loot.size : CRATE_TIERS[tier as CrateTier].size;
    return Array.from({ length: CRATE_STAGES }, (_, stage): [string, SpriteSpec] => [`crate.${tier}.${stage}`, { box: footprint(size, size), dirs: 1, frames: 1, layers: ['base'], model: `crate:${tier}:${stage}` }]);
  }),
  ['engineer.wall.h', { box: footprint(140, 24), dirs: 1, frames: 1, layers: ['base'], model: 'engineer-wall' }],
  ['engineer.wall.v', { box: footprint(24, 140), dirs: 1, frames: 1, layers: ['base'], model: 'engineer-wall' }],
  ...Array.from({ length: WALL_STAGES }, (_, stage): [string, SpriteSpec] => [`siege.wall.${stage}`, { box: footprint(ZOM.cell, ZOM.cell), dirs: 1, frames: 1, layers: ['base'], model: `siege-wall:${stage}` }]),
  ['siege.pad', { box: footprint(ZOM.cell, ZOM.cell), dirs: 1, frames: 1, layers: ['base'], model: 'turret-pad' }],
  ...TURRET_KINDS.map((kind): [string, SpriteSpec] => [`turret.${kind}`, { box: { x: -20, y: -20, w: 60, h: 40 }, dirs: 1, frames: 1, layers: ['base', 'glow'], model: `turret:${kind}` }]),
  ['core', { box: footprint(ZOM.coreHalf * 2, ZOM.coreHalf * 2), dirs: 1, frames: 1, layers: ['base', 'glow'], model: 'core' }],
  ...(['grenade', 'fragGrenade', 'gasGrenade', 'landMine'] as const).map((kind): [string, SpriteSpec] => [`thrown.${kind}`, { box: square(16, 4), dirs: 1, frames: 1, layers: ['base', 'glow'], model: `thrown:${kind}` }]),
  ['fx.muzzle', { box: { x: -6, y: -16, w: 56, h: 32 }, dirs: 1, frames: 4, layers: ['glow'], model: 'muzzle-flash' }],
  ['fx.explosion', { box: square(110, 0), dirs: 1, frames: 16, layers: ['base', 'glow'], model: 'explosion', scale: 0.5 }],
  ['fx.smoke', { box: square(32, 0), dirs: 1, frames: 4, layers: ['base'], model: 'smoke-puff', scale: 0.75 }],
  ['decal.scorch', { box: square(70, 0), dirs: 1, frames: 2, layers: ['base'], model: 'scorch', scale: 0.5 }],
  ['decal.blood', { box: square(26, 0), dirs: 1, frames: 4, layers: ['base'], model: 'blood' }],
  ['decal.ichor', { box: square(26, 0), dirs: 1, frames: 4, layers: ['base'], model: 'ichor' }],
];

export const SPRITES: Readonly<Record<string, SpriteSpec>> = Object.fromEntries(entries);

export const frameKey = (name: string, layer: Layer, dir = 0, frame = 0) => `${name}/${layer}/${dir}/${frame}`;

/** The baked facing nearest `angle`, and the turn left over for the painter to apply. */
export function facing(angle: number, dirs: number): { dir: number; rest: number } {
  const step = (Math.PI * 2) / dirs;
  const dir = ((Math.round(angle / step) % dirs) + dirs) % dirs;
  return { dir, rest: angle - Math.round(angle / step) * step };
}

export const crateSprite = (tier: CrateTier | undefined, wear: number) => `crate.${tier ?? 'plain'}.${Math.min(CRATE_STAGES - 1, Math.floor(wear * CRATE_STAGES))}`;
export const siegeWallSprite = (wear: number) => `siege.wall.${Math.min(WALL_STAGES - 1, Math.floor(wear * WALL_STAGES))}`;
