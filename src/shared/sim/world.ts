import { PERK_TIERS, WORLD, type ModeId, type PlayerKind, type Tier } from '../defs.ts';
import type { Dash, GameEvent, InputState, Loadout, Team } from '../protocol.ts';
import { rectsOverlap, type Rect } from './movement.ts';

export type Wall = Rect & { built: boolean; expiresAt: number };

export type Life =
  | {
    k: 'alive';
    hp: number;
    armor: number;
    ammo: number;
    reloadUntil: number | null;
    nextFireAt: number;
    lastDamageAt: number;
    lastMoveAt: number;
    dash: Dash | null;
    pressUntil: number;
  }
  | { k: 'dead'; respawnAt: number };

export type Player = {
  id: number;
  name: string;
  kind: PlayerKind;
  loadout: Loadout;
  team: Team;
  x: number;
  y: number;
  angle: number;
  input: InputState;
  seq: number;
  /** Server time of the world the client was drawing when it sampled `input`, or null when it never said. */
  viewAt: number | null;
  shotsSeen: number;
  life: Life;
  score: number;
  level: number;
  perks: ChosenPerks;
  kills: number;
  deaths: number;
  lifeKills: number;
  revealedUntil: number;
  abilityReadyAt: number;
};

export type PerkOfTier<T extends Tier> = (typeof PERK_TIERS)[T][number];
export type ChosenPerks = { [T in Tier]?: PerkOfTier<T> };

export type Bullet = {
  id: number; owner: number; x: number; y: number; vx: number; vy: number;
  left: number; damage: number; piercing: boolean; label: string;
};

export type Crate = { id: number; x: number; y: number; size: number; hp: number; respawnAt: number | null };

export type Thrown =
  | { id: number; kind: 'grenade' | 'fragGrenade' | 'gasGrenade'; owner: number; x: number; y: number; vx: number; vy: number; explodeAt: number }
  | { id: number; kind: 'landMine'; owner: number; x: number; y: number; armedAt: number; expiresAt: number }
  | { id: number; kind: 'gasCloud'; owner: number; x: number; y: number; expiresAt: number };

export type Zone = { id: number; x: number; y: number; r: number; owner: Team; capturing: Team; progress: number };

export type Match = { k: 'playing' } | { k: 'over'; winner: string; restartAt: number };

export type LifeRecord = { id: number; name: string; kills: number; score: number; died: boolean };

export type Pose = { x: number; y: number };
type PoseFrame = { at: number; poses: ReadonlyMap<number, Pose>; walls: readonly Wall[] };

export type World = {
  mode: ModeId;
  now: number;
  tick: number;
  rng: number;
  nextId: number;
  players: Map<number, Player>;
  bullets: Bullet[];
  crates: Crate[];
  walls: Wall[];
  wallsVersion: number;
  thrown: Thrown[];
  zones: Zone[];
  teamScore: { red: number; blue: number };
  match: Match;
  events: GameEvent[];
  lifeRecords: LifeRecord[];
  /** Recent player positions, oldest first, so a shot can be judged against the world its shooter saw. */
  history: PoseFrame[];
};

export const IDLE_INPUT: InputState = {
  up: false, down: false, left: false, right: false, angle: 0, fire: false, shots: 0, reload: false, ability: false, aimDist: 0,
};

const CRATE_SIZE = 44;
const ZONE_RADIUS = 180;

function mulberry32(state: number): number {
  let t = state;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

export function rand(w: World): number {
  w.rng = (w.rng + 0x6d2b79f5) | 0;
  return mulberry32(w.rng);
}

export const newId = (w: World) => w.nextId++;

export const sameTeam = (a: Player, b: Player) => a.team !== null && a.team === b.team;
export const isEnemy = (a: Player, b: Player) => a.id !== b.id && !sameTeam(a, b);

function zoneLayout(mode: ModeId): Zone[] {
  if (mode !== 'DOM') return [];
  const s = WORLD.size;
  return [[0.2, 0.5], [0.5, 0.5], [0.8, 0.5]].map(([fx, fy], id) => ({
    id, x: s * fx, y: s * fy, r: ZONE_RADIUS, owner: null, capturing: null, progress: 0,
  }));
}

export function createWorld(mode: ModeId, seed: number): World {
  const w: World = {
    mode, now: 0, tick: 0, rng: seed | 0, nextId: 1,
    players: new Map(), bullets: [], crates: [], walls: [], wallsVersion: 0, thrown: [],
    zones: zoneLayout(mode), teamScore: { red: 0, blue: 0 }, match: { k: 'playing' }, events: [], lifeRecords: [], history: [],
  };
  const s = WORLD.size;
  const keepClear: Rect[] = w.zones.map((z) => ({ x: z.x - z.r, y: z.y - z.r, w: z.r * 2, h: z.r * 2 }));
  for (let tries = 0; w.walls.length < 26 && tries < 2000; tries++) {
    const long = 160 + rand(w) * 340;
    const thick = 36 + rand(w) * 30;
    const horizontal = rand(w) < 0.5;
    const ww = horizontal ? long : thick;
    const hh = horizontal ? thick : long;
    const r: Rect = { x: 100 + rand(w) * (s - 200 - ww), y: 100 + rand(w) * (s - 200 - hh), w: ww, h: hh };
    if (w.walls.some((o) => rectsOverlap(o, r, 120)) || keepClear.some((o) => rectsOverlap(o, r))) continue;
    w.walls.push({ ...r, built: false, expiresAt: Infinity });
  }
  for (let tries = 0; w.crates.length < WORLD.crateCount && tries < 4000; tries++) {
    const r: Rect = { x: 60 + rand(w) * (s - 120 - CRATE_SIZE), y: 60 + rand(w) * (s - 120 - CRATE_SIZE), w: CRATE_SIZE, h: CRATE_SIZE };
    if (w.walls.some((o) => rectsOverlap(o, r, 60)) || w.crates.some((c) => rectsOverlap(crateRect(c), r, 40))) continue;
    w.crates.push({ id: newId(w), x: r.x, y: r.y, size: CRATE_SIZE, hp: WORLD.crateHp, respawnAt: null });
  }
  return w;
}

export const crateRect = (c: Crate): Rect => ({ x: c.x, y: c.y, w: c.size, h: c.size });
export const solidRects = (w: World): Rect[] => [...w.walls, ...w.crates.filter((c) => c.respawnAt === null).map(crateRect)];
