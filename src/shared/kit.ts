import { FEEL, type Blast } from './defs.ts';
import type { Rect } from './sim/movement.ts';

/**
 * The kit of parts every map is built from. A map places pieces; collision, cover and destruction come from the pieces it places,
 * so the art and the collision can never drift apart. The sim reads `solids` and `breaks`; the client reads everything.
 * Sizes are game units with the piece unturned: `w` east, `h` south, origin at the footprint's top-left. A piece's top face is its solid.
 */

export type Material = 'concrete' | 'metal' | 'wood' | 'planter' | 'sandbag';

/** `all` stops bodies and rounds; `move` stops bodies only, as a railing does. */
export type Solid = Rect & { blocks: 'all' | 'move' };

/** A light the piece throws: live and additive when `pulseMs` is set, else baked into the map's light layer. `color` is 0xRRGGBB. */
export type Light = { x: number; y: number; r: number; color: number; strength: number; pulseMs?: number };

/**
 * A piece players can wear down. It shows one of `stages` looks by the health it has lost and is gone at 0, leaving its debris.
 * `blast` bursts where it breaks and chains through the blast code; `fire` leaves a burning patch hurting whoever stands in it.
 * `cover` marks low cover rather than a prize: breaking it scores nothing, holds no loot, and no bot shoots it for its own sake.
 */
export type Breaks = {
  hp: number;
  stages: number;
  debris: 'wood' | 'metal' | 'concrete';
  respawnMs: number;
  score: number;
  blast?: Blast;
  fire?: { radius: number; dps: number; ms: number };
  cover?: true;
};

export type PieceDef = {
  name: string;
  w: number;
  h: number;
  /** The top's height over the floor: it sets the shadow's length and how much south face shows. 0 is paint on the floor, baked into the map's light layer. */
  height: number;
  material: Material;
  solids: readonly Solid[];
  /** Drawn over players, fading to show who walks under it; never collides. */
  overhead?: true;
  breaks?: Breaks;
  lights?: readonly Light[];
  /** How many quarter turns look different, so the bake renders only those: 1 for a piece that looks the same every way round. */
  turns: 1 | 2 | 4;
};

type Spec = Omit<PieceDef, 'solids' | 'turns'> & { solids?: readonly Solid[] | 'none'; turns?: 1 | 2 | 4 };

function piece(s: Spec): PieceDef {
  const solids = s.solids === 'none' ? [] : s.solids ?? [{ x: 0, y: 0, w: s.w, h: s.h, blocks: 'all' as const }];
  return { ...s, solids, turns: s.turns ?? 4 };
}

const box = (x: number, y: number, w: number, h: number, blocks: Solid['blocks'] = 'all'): Solid => ({ x, y, w, h, blocks });

const CRATE: Omit<Breaks, 'hp'> = { stages: 3, debris: 'wood', respawnMs: 45_000, score: 10 };
const cover = (hp: number): Breaks => ({ hp, stages: FEEL.cover.stages, debris: 'concrete', respawnMs: FEEL.cover.respawnMs, score: 0, cover: true });
const WARM = 0xffd29a;
const RED = 0xff3a2e;

export const KIT = {
  'wall': piece({ name: 'Wall', w: 100, h: 25, height: 64, material: 'concrete', turns: 2 }),
  'wall.long': piece({ name: 'Long wall', w: 200, h: 25, height: 64, material: 'concrete', turns: 2 }),
  'wall.short': piece({ name: 'Short wall', w: 50, h: 25, height: 64, material: 'concrete', turns: 2 }),
  'wall.post': piece({ name: 'Pillar', w: 25, h: 25, height: 70, material: 'concrete', turns: 1 }),
  'wall.thick': piece({ name: 'Thick wall', w: 100, h: 50, height: 64, material: 'concrete', turns: 2 }),
  'wall.broken': piece({ name: 'Broken wall', w: 100, h: 25, height: 36, material: 'concrete', breaks: cover(FEEL.cover.hp['wall.broken']) }),
  'lowwall': piece({ name: 'Barrier', w: 100, h: 25, height: 32, material: 'concrete', breaks: cover(FEEL.cover.hp.lowwall), turns: 2 }),
  'sandbags': piece({ name: 'Sandbags', w: 100, h: 25, height: 28, material: 'sandbag', breaks: cover(FEEL.cover.hp.sandbags), turns: 2 }),
  'railing': piece({ name: 'Railing', w: 100, h: 10, height: 30, material: 'metal', solids: [box(0, 0, 100, 10, 'move')], turns: 2 }),
  'container.blue': piece({ name: 'Container (blue)', w: 100, h: 250, height: 92, material: 'metal' }),
  'container.rust': piece({ name: 'Container (rust)', w: 100, h: 250, height: 92, material: 'metal' }),
  'container.grey': piece({ name: 'Container (grey)', w: 100, h: 250, height: 92, material: 'metal' }),
  'crate': piece({ name: 'Crate', w: 50, h: 50, height: 40, material: 'wood', breaks: { ...CRATE, hp: 60 }, turns: 1 }),
  'crate.big': piece({ name: 'Big crate', w: 75, h: 75, height: 56, material: 'wood', breaks: { ...CRATE, hp: 110, score: 15 }, turns: 1 }),
  'crate.drop': piece({ name: 'Supply drop', w: 75, h: 75, height: 50, material: 'metal', breaks: { hp: 300, stages: 3, debris: 'metal', respawnMs: Infinity, score: 25 }, turns: 1, lights: [{ x: 37.5, y: 37.5, r: 140, color: 0xffd34d, strength: 0.7, pulseMs: 700 }] }),
  'crate.stack': piece({ name: 'Crate stack', w: 100, h: 100, height: 84, material: 'wood' }),
  'crate.metal': piece({ name: 'Metal crate', w: 50, h: 50, height: 44, material: 'metal', turns: 1 }),
  'pallet': piece({ name: 'Pallet', w: 50, h: 50, height: 6, material: 'wood', solids: 'none', turns: 2 }),
  'barrel': piece({ name: 'Barrel', w: 30, h: 30, height: 42, material: 'metal', turns: 1 }),
  'barrel.red': piece({
    name: 'Fuel barrel', w: 30, h: 30, height: 42, material: 'metal', turns: 1,
    breaks: { hp: 35, stages: 2, debris: 'metal', respawnMs: 60_000, score: 5, blast: { radius: 140, damage: 95 }, fire: { radius: 60, dps: 22, ms: 7000 } },
  }),
  'barrel.fire': piece({ name: 'Burning barrel', w: 30, h: 30, height: 42, material: 'metal', turns: 1, lights: [{ x: 15, y: 15, r: 170, color: 0xff9a40, strength: 0.9, pulseMs: 230 }] }),
  'planter': piece({ name: 'Planter', w: 100, h: 100, height: 30, material: 'planter', turns: 1 }),
  'planter.long': piece({ name: 'Long planter', w: 200, h: 50, height: 30, material: 'planter', turns: 2 }),
  'forklift': piece({ name: 'Forklift', w: 75, h: 125, height: 72, material: 'metal' }),
  'ac': piece({ name: 'AC unit', w: 75, h: 50, height: 40, material: 'metal' }),
  'generator': piece({ name: 'Generator', w: 100, h: 75, height: 52, material: 'metal' }),
  'gantry': piece({ name: 'Gantry beam', w: 600, h: 50, height: 170, material: 'metal', solids: 'none', overhead: true, turns: 2 }),
  'gantry.post': piece({ name: 'Gantry post', w: 50, h: 50, height: 170, material: 'metal', turns: 1 }),
  'pipes': piece({ name: 'Overhead pipes', w: 400, h: 25, height: 120, material: 'metal', solids: 'none', overhead: true, turns: 2 }),
  'roof': piece({ name: 'Roof', w: 200, h: 200, height: 96, material: 'metal', solids: 'none', overhead: true, turns: 1 }),
  'roof.s': piece({ name: 'Roof (small)', w: 100, h: 100, height: 96, material: 'metal', solids: 'none', overhead: true, turns: 1 }),
  'roof.wide': piece({ name: 'Wide roof', w: 300, h: 200, height: 96, material: 'metal', solids: 'none', overhead: true, turns: 2 }),
  'lamp': piece({ name: 'Lamp', w: 25, h: 25, height: 0, material: 'metal', solids: 'none', turns: 1, lights: [{ x: 12.5, y: 12.5, r: 200, color: WARM, strength: 1 }] }),
  'alarm': piece({ name: 'Warning light', w: 25, h: 25, height: 0, material: 'metal', solids: 'none', turns: 1, lights: [{ x: 12.5, y: 12.5, r: 150, color: RED, strength: 1, pulseMs: 900 }] }),
  'signal': piece({ name: 'Signal post', w: 25, h: 25, height: 72, material: 'metal', turns: 1, lights: [{ x: 12.5, y: 12.5, r: 120, color: RED, strength: 1, pulseMs: 600 }] }),
  'terminal': piece({ name: 'Terminal', w: 75, h: 50, height: 46, material: 'metal', lights: [{ x: 37.5, y: 25, r: 160, color: 0x4fd1e8, strength: 0.8 }] }),
  'vent': piece({ name: 'Vent', w: 50, h: 50, height: 0, material: 'metal', solids: 'none', turns: 2 }),
  'grate': piece({ name: 'Grate', w: 50, h: 50, height: 0, material: 'metal', solids: 'none', turns: 1 }),
  'drain': piece({ name: 'Drain', w: 50, h: 25, height: 0, material: 'metal', solids: 'none', turns: 2 }),
  'helipad': piece({ name: 'Helipad', w: 300, h: 300, height: 0, material: 'concrete', solids: 'none', turns: 1 }),
  'track': piece({ name: 'Track', w: 100, h: 150, height: 0, material: 'metal', solids: 'none', turns: 2 }),
  'buffer': piece({ name: 'Track buffer', w: 50, h: 150, height: 40, material: 'metal' }),
  'rubble': piece({ name: 'Rubble', w: 100, h: 75, height: 0, material: 'concrete', solids: 'none' }),
} as const satisfies Record<string, PieceDef>;

export type PieceId = keyof typeof KIT;
export const PIECE_IDS = Object.keys(KIT) as PieceId[];
export const pieceOf = (id: PieceId): PieceDef => KIT[id];

/** A quarter turn clockwise, in y-down game space, of a rect inside a box `boxH` tall. */
export const turnRect = <T extends Rect>(r: T, boxH: number): T => ({ ...r, x: boxH - r.y - r.h, y: r.x, w: r.h, h: r.w });

/** A placed piece: `x`, `y` is the top-left of its footprint after `r` quarter turns clockwise. */
export type Placement = { p: PieceId; x: number; y: number; r: 0 | 1 | 2 | 3 };

/** The footprint, solids and lights of a placement, in map space. */
export function placed(at: Placement): { foot: Rect; solids: Solid[]; lights: Light[] } {
  const def = KIT[at.p];
  let w = def.w, h = def.h;
  let solids: Solid[] = [...def.solids];
  let lights: Light[] = [...(def.lights ?? [])];
  for (let i = 0; i < at.r; i++) {
    solids = solids.map((s) => turnRect(s, h));
    lights = lights.map((l) => ({ ...l, x: h - l.y, y: l.x }));
    [w, h] = [h, w];
  }
  return {
    foot: { x: at.x, y: at.y, w, h },
    solids: solids.map((s) => ({ ...s, x: s.x + at.x, y: s.y + at.y })),
    lights: lights.map((l) => ({ ...l, x: l.x + at.x, y: l.y + at.y })),
  };
}

/** The look a placement is drawn with: the baked turn and, when the piece looks the same every other turn, the turn it borrows. */
export const bakedTurn = (at: Placement): number => at.r % KIT[at.p].turns;
