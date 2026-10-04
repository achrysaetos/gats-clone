import { PERK_TIERS, WORLD, type Blast, type GunId, type ModeId, type PlayerKind, type Tier } from '../defs.ts';
import type { Dash, GameEvent, InputState, Loadout, Team } from '../protocol.ts';
import { CRATE_SIZE, MAP_MS, MAPS, ZONE_RADIUS, type MapId } from '../maps.ts';
import { circleHitsRect, dist2, type Rect } from './movement.ts';

export type Wall = Rect & { built: boolean; expiresAt: number };

export type Life =
  | {
    k: 'alive';
    hp: number;
    armor: number;
    ammo: number;
    reloadUntil: number | null;
    nextFireAt: number;
    /** Rounds still to come from the burst in progress. */
    burstLeft: number;
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
  /** The class gun from the loadout until it evolves; back to the class gun every life. */
  gun: GunId;
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
  /** Where enemy minimaps last placed this player while hunted; refreshed on a timer and by unsilenced fire. */
  huntedPing: (Pose & { at: number }) | null;
  abilityReadyAt: number;
};

export type PerkOfTier<T extends Tier> = (typeof PERK_TIERS)[T][number];
export type ChosenPerks = { [T in Tier]?: PerkOfTier<T> };

export type Bullet = {
  id: number; owner: number; x: number; y: number; vx: number; vy: number;
  left: number; damage: number; piercing: boolean; label: string;
  gun: GunId | null;
  /** Players it can still pass through, and the ones it already has. */
  penetrate: number; passed: number[];
  blast: Blast | null;
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
  map: MapId;
  mapChangeAt: number;
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
  /** Events raised between ticks, such as by a pick; the next step ships them. */
  queuedEvents: GameEvent[];
  lifeRecords: LifeRecord[];
  /** Recent player positions, oldest first, so a shot can be judged against the world its shooter saw. */
  history: PoseFrame[];
};

export const IDLE_INPUT: InputState = {
  up: false, down: false, left: false, right: false, angle: 0, fire: false, shots: 0, reload: false, ability: false, aimDist: 0,
};

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

export function createWorld(mode: ModeId, seed: number, map: MapId): World {
  const w: World = {
    mode, map, mapChangeAt: Infinity, now: 0, tick: 0, rng: seed | 0, nextId: 1,
    players: new Map(), bullets: [], crates: [], walls: [], wallsVersion: 0, thrown: [],
    zones: [], teamScore: { red: 0, blue: 0 }, match: { k: 'playing' }, events: [], queuedEvents: [], lifeRecords: [], history: [],
  };
  loadMap(w, map);
  return w;
}

/** Replaces the layout and everything in flight; players stay where they are. */
export function loadMap(w: World, map: MapId) {
  const def = MAPS[map];
  w.map = map;
  w.mapChangeAt = w.now + MAP_MS[w.mode];
  w.walls = def.walls.map((r) => ({ ...r, built: false, expiresAt: Infinity }));
  w.wallsVersion++;
  w.crates = def.crates.map((c) => ({ id: newId(w), x: c.x - CRATE_SIZE / 2, y: c.y - CRATE_SIZE / 2, size: CRATE_SIZE, hp: WORLD.crateHp, respawnAt: null }));
  w.zones = w.mode === 'DOM' ? def.zones.map((z, id) => ({ id, x: z.x, y: z.y, r: ZONE_RADIUS, owner: null, capturing: null, progress: 0 })) : [];
  w.bullets = [];
  w.thrown = [];
  w.history = [];
}

export const crateRect = (c: Crate): Rect => ({ x: c.x, y: c.y, w: c.size, h: c.size });
export const solidRects = (w: World): Rect[] => [...w.walls, ...w.crates.filter((c) => c.respawnAt === null).map(crateRect)];

const SPAWN_CLEARANCE = 10;
const SPAWN_ENEMY_DIST = 400;

export function spawnPoint(w: World, team: Team): Pose {
  const regions = MAPS[w.map].spawns[team ?? 'ffa'];
  const solids = solidRects(w);
  for (let i = 0; i < 200; i++) {
    const r = regions[Math.floor(rand(w) * regions.length)];
    const x = r.x + rand(w) * r.w, y = r.y + rand(w) * r.h;
    if (solids.some((b) => circleHitsRect(x, y, WORLD.playerRadius + SPAWN_CLEARANCE, b))) continue;
    const tooClose = [...w.players.values()].some((p) => p.life.k === 'alive' && (team === null || p.team !== team) && dist2(p.x, p.y, x, y) < SPAWN_ENEMY_DIST ** 2);
    if (tooClose && i < 150) continue;
    return { x, y };
  }
  const fallback = regions[0];
  return { x: fallback.x + fallback.w / 2, y: fallback.y + fallback.h / 2 };
}
