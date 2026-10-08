import { GUN_IDS, TURRET_KINDS, WEAPON_IDS, WORLD, ZOM, ZOMBIE_KINDS, ZOMBIES, type GunId, type WeaponId } from '../../shared/defs.ts';
import { GUN_PARTS } from '../sprites.ts';
import { KIT, PIECE_IDS, type PieceId } from '../../shared/kit.ts';
import { ART } from './art.ts';

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
  /** Layers baked at frame 0 only, which every frame shares (the soldier's armor rides the torso, which no frame moves). */
  still?: readonly Layer[];
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
const footprint = (w: number, h: number, pad = 6, south = FACE): Box => ({ x: -pad, y: -pad, w: w + pad * 2, h: h + pad * 2 + south });

/** Room below a footprint for the south face of something `height` tall, which the shear hangs that far below its top. */
const southOf = (height: number) => Math.max(FACE, Math.ceil(ART.camera.shear * height) + 4);

/** The baked look of a placed kit piece: its `bakedTurn` and its damage stage (0 for a piece that never breaks). */
export const kitSprite = (id: PieceId, turn: number, stage = 0) => `kit.${id}.${turn}.${stage}`;

/** The train's cars, baked travelling east (turn 0) and south (turn 1): `across` is the lane, the rest run along it. */
export const TRAIN = { across: 150, loco: 300, car: 250, height: 110 } as const;
export const trainSprite = (part: 'loco' | 'car', turn: 0 | 1) => `train.${part}.${turn}`;

const run = (start: number, n: number) => Array.from({ length: n }, (_, i) => start + i);

/**
 * The split soldier's frame layout, mirroring STRIPS in art/blender/sprites/soldier.py. `soldier` is the waist up with
 * the arms and gun hands, turned to the aim; `soldier.act` is the same waist up in the moves that take a hand off the
 * grip or snap the head, at half the facings since each lasts a moment; `soldier.legs` is the pelvis down, turned to
 * the way the legs walk. All share the body's origin and shear, so drawn at the same point, legs first, they join at
 * the belt. The gun is its own sprite drawn under the torso, and every frame that holds it keeps the hands on its grip.
 * Recoil frames match a gun drawn at full and half kick (`recoilHeavy`) or half and a quarter (`recoilLight`).
 */
export const SOLDIER = {
  torso: { frames: 6, aim: 0, breathe: 1, recoilLight: [2, 3], recoilHeavy: [4, 5] },
  act: {
    frames: 34,
    reload: { pistol: run(0, 6), mag: run(6, 6), pump: run(12, 6), box: run(18, 6) },
    flinchFront: [24, 25], flinchBack: [26, 27], throw: [28, 29, 30], knife: [31, 32, 33],
  },
  legs: { frames: 20, stand: 0, run: run(1, 8), strafe: run(9, 8), dash: [17, 18, 19] },
  downed: { frames: 8, crawl: run(0, 4), revive: run(4, 4) },
  /** Falls from standing, six frames each, ending in the body that stays; the painter turns them to the blow. */
  die: { frames: 18, forward: run(0, 6), back: run(6, 6), spin: run(12, 6) },
} as const;

/**
 * Each gun's frames, all over the same box so they stack at the gun's origin: the gun without its moving parts, then
 * the magazine (or ammo box) alone and the pump or bolt alone, which the painter slides, lifts out and hides through
 * shots and reloads. A gun without one of them bakes that frame empty. A dropped gun is the same three frames on the floor.
 */
export const GUN_FRAMES = { frames: 3, body: 0, mag: 1, action: 2 } as const;

export const WALL_STAGES = 3;
export const FIRE_FRAMES = 8;

/** Each class's muzzle flash frame, around the muzzle tip with the barrel along +x: long rifles throw long jets, a brake throws side flares. */
const MUZZLE: Record<WeaponId, Box> = {
  pistol: { x: -6, y: -14, w: 40, h: 28 },
  smg: { x: -6, y: -12, w: 38, h: 24 },
  assault: { x: -6, y: -18, w: 54, h: 36 },
  shotgun: { x: -6, y: -24, w: 50, h: 48 },
  sniper: { x: -6, y: -24, w: 68, h: 48 },
  lmg: { x: -6, y: -24, w: 58, h: 48 },
};

/** Casing frames in `fx.casing`, by what the class ejects. */
export const CASING: Record<WeaponId, number> = { pistol: 0, smg: 0, assault: 1, sniper: 1, lmg: 1, shotgun: 2 };

const entries: [string, SpriteSpec][] = [
  ['soldier', { box: square(R * 1.5, FACE), dirs: 32, frames: SOLDIER.torso.frames, layers: ['base', 'team', 'armorLight', 'armorMedium', 'armorHeavy'], still: ['armorLight', 'armorMedium', 'armorHeavy'], model: 'soldier:torso' }],
  ['soldier.act', { box: square(R * 1.5, FACE), dirs: 16, frames: SOLDIER.act.frames, layers: ['base', 'team'], model: 'soldier:act' }],
  ['soldier.legs', { box: square(R * 1.2, FACE), dirs: 16, frames: SOLDIER.legs.frames, layers: ['base', 'team'], model: 'soldier:legs' }],
  ['soldier.shadow', { box: { x: -R * 4, y: -R * 4, w: R * 8, h: R * 8 }, dirs: 16, frames: 1, layers: ['shadow'], model: 'soldier:full', scale: 0.5 }],
  ['soldier.downed', { box: square(R * 1.8, 4), dirs: 1, frames: SOLDIER.downed.frames, layers: ['base', 'team'], model: 'soldier:downed' }],
  ['soldier.die', { box: square(R * 1.9, 4), dirs: 1, frames: SOLDIER.die.frames, layers: ['base', 'team'], model: 'soldier:die' }],
  ...GUN_IDS.map((gun): [string, SpriteSpec] => [`gun.${gun}`, { box: gunBox(gun), dirs: 1, frames: GUN_FRAMES.frames, layers: ['base'], model: `gun:${gun}` }]),
  ...ZOMBIE_KINDS.map((kind): [string, SpriteSpec] => [`zombie.${kind}`, { box: square(ZOMBIES[kind].radius * 1.9, FACE), dirs: 16, frames: 1, layers: ['base'], model: `zombie:${kind}`, scale: ZOMBIES[kind].radius > 30 ? 0.75 : 1 }]),
  ['engineer.wall.h', { box: footprint(140, 24), dirs: 1, frames: 1, layers: ['base'], model: 'engineer-wall' }],
  ['engineer.wall.v', { box: footprint(24, 140), dirs: 1, frames: 1, layers: ['base'], model: 'engineer-wall' }],
  ...Array.from({ length: WALL_STAGES }, (_, stage): [string, SpriteSpec] => [`siege.wall.${stage}`, { box: footprint(ZOM.cell, ZOM.cell), dirs: 1, frames: 1, layers: ['base'], model: `siege-wall:${stage}` }]),
  ['siege.pad', { box: footprint(ZOM.cell, ZOM.cell), dirs: 1, frames: 1, layers: ['base'], model: 'turret-pad' }],
  ...TURRET_KINDS.map((kind): [string, SpriteSpec] => [`turret.${kind}`, { box: { x: -20, y: -20, w: 60, h: 40 }, dirs: 1, frames: 1, layers: ['base', 'glow'], model: `turret:${kind}` }]),
  ['core', { box: footprint(ZOM.coreHalf * 2, ZOM.coreHalf * 2), dirs: 1, frames: 1, layers: ['base', 'glow'], model: 'core' }],
  ...(['grenade', 'fragGrenade', 'gasGrenade', 'landMine'] as const).map((kind): [string, SpriteSpec] => [`thrown.${kind}`, { box: square(16, 4), dirs: 1, frames: 1, layers: ['base', 'glow'], model: `thrown:${kind}` }]),
  ...PIECE_IDS.flatMap((id) => {
    const def = KIT[id];
    return Array.from({ length: def.turns }, (_, turn) => Array.from({ length: def.breaks?.stages ?? 1 }, (_, stage): [string, SpriteSpec] => {
      const [w, h] = turn % 2 ? [def.h, def.w] : [def.w, def.h];
      return [kitSprite(id, turn, stage), { box: footprint(w, h, 6, southOf(def.height)), dirs: 1, frames: 1, layers: def.lights ? ['base', 'glow'] : ['base'], model: `kit:${id}:${turn}:${stage}` }];
    })).flat();
  }),
  ...(['loco', 'car'] as const).flatMap((part) => ([0, 1] as const).map((turn): [string, SpriteSpec] => {
    const long = TRAIN[part];
    const [w, h] = turn ? [TRAIN.across, long] : [long, TRAIN.across];
    return [trainSprite(part, turn), { box: footprint(w, h, 6, southOf(TRAIN.height)), dirs: 1, frames: 1, layers: ['base', 'glow'], model: `train:${part}:${turn}` }];
  })),
  ...WEAPON_IDS.map((kind): [string, SpriteSpec] => [`fx.muzzle.${kind}`, { box: MUZZLE[kind], dirs: 1, frames: 3, layers: ['glow'], model: `muzzle-flash:${kind}` }]),
  ['fx.explosion', { box: square(110, 0), dirs: 1, frames: 16, layers: ['base', 'glow'], model: 'explosion', scale: 0.5 }],
  ['fx.smoke', { box: square(32, 0), dirs: 1, frames: 4, layers: ['base'], model: 'smoke-puff', scale: 0.75 }],
  ['fx.fire', { box: { x: -26, y: -64, w: 52, h: 76 }, dirs: 1, frames: FIRE_FRAMES, layers: ['glow'], model: 'fire' }],
  ['fx.plank', { box: { x: -13, y: -5, w: 26, h: 10 }, dirs: 1, frames: 3, layers: ['base'], model: 'debris:plank' }],
  ['fx.chunk', { box: square(5, 0), dirs: 1, frames: 3, layers: ['base'], model: 'debris:chunk' }],
  ['fx.casing', { box: { x: -4, y: -2, w: 8, h: 4 }, dirs: 1, frames: 3, layers: ['base'], model: 'debris:casing', scale: 2 }],
  ['decal.scorch', { box: square(70, 0), dirs: 1, frames: 3, layers: ['base'], model: 'scorch', scale: 0.5 }],
  ['decal.planks', { box: square(40, 0), dirs: 1, frames: 3, layers: ['base'], model: 'pile:planks' }],
  ['decal.rubble', { box: square(36, 0), dirs: 1, frames: 3, layers: ['base'], model: 'pile:rubble' }],
  ['decal.scrap', { box: square(30, 0), dirs: 1, frames: 2, layers: ['base'], model: 'pile:scrap' }],
  ['decal.blood', { box: square(26, 0), dirs: 1, frames: 4, layers: ['base'], model: 'blood' }],
  ['decal.ichor', { box: square(26, 0), dirs: 1, frames: 4, layers: ['base'], model: 'ichor' }],
];

export const SPRITES: Readonly<Record<string, SpriteSpec>> = Object.fromEntries(entries);

/** How many frames a layer of a sprite has: still layers have one. */
export const layerFrames = (s: SpriteSpec, layer: Layer) => (s.still?.includes(layer) ? 1 : s.frames);

/** The atlas key of a frame; a still layer answers every frame with its one frame. */
export const frameKey = (name: string, layer: Layer, dir = 0, frame = 0) => `${name}/${layer}/${dir}/${SPRITES[name] && layerFrames(SPRITES[name]!, layer) === 1 ? 0 : frame}`;

/** The baked facing nearest `angle`, and the turn left over for the painter to apply. */
export function facing(angle: number, dirs: number): { dir: number; rest: number } {
  const step = (Math.PI * 2) / dirs;
  const dir = ((Math.round(angle / step) % dirs) + dirs) % dirs;
  return { dir, rest: angle - Math.round(angle / step) * step };
}

export const siegeWallSprite = (wear: number) => `siege.wall.${Math.min(WALL_STAGES - 1, Math.floor(wear * WALL_STAGES))}`;
