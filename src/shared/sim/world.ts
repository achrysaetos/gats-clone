import { byTurret, PERK_TIERS, WORLD, ZOM, ZOMBIE_KINDS, type Blast, type GunId, type ModeId, type PlayerKind, type Side, type Tier, type TurretKind, type ZombieKind } from '../defs.ts';
import type { Dash, GameEvent, InputState, Loadout, RoundWinner, Team, WallView } from '../protocol.ts';
import { CRATE_SIZE, MAP_MS, MAPS, ZONE_RADIUS, type Center, type MapId } from '../maps.ts';
import { cellRect, coreRectAt } from './build.ts';
import { circleHitsRect, dist2, type Rect } from './movement.ts';

export type Wall = WallView & { expiresAt: number };

export type Life =
  | {
    k: 'alive';
    hp: number;
    ammo: number;
    reloadUntil: number | null;
    nextFireAt: number;
    /** Rounds still to come from the burst in progress. */
    burstLeft: number;
    spray: number;
    firedAt: number;
    spin: number;
    lastDamageAt: number;
    lastMoveAt: number;
    dash: Dash | null;
    pressUntil: number;
    /** Health each attacker took off this life and when, for assists and for who a self-inflicted death credits. */
    hits: { by: number; at: number; dealt: number }[];
  }
  /** Zombies only: out of the fight until a squadmate holds use beside them for `ZOM.reviveMs`, or dead at `bleedOutAt`. */
  | { k: 'downed'; bleedOutAt: number; reviveProgress: number }
  /** `respawnAt` is Infinity for a squad player who bled out; dawn brings them back. */
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
  /** The furthest back this player's shots may be judged, from their measured round trip. */
  rewindCapMs: number;
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
  /** `team` is the owner's at the time of firing, so the round still spares teammates after its owner leaves. */
  id: number; owner: number; team: Team; x: number; y: number; vx: number; vy: number;
  left: number; damage: number; piercing: boolean; label: string;
  gun: GunId | null;
  /** The turret or the Bastion's survivors that fired it, null for a player's own round. */
  turret: Shooter | null;
  /** A lobbed round flies over everything and bursts where it comes down. */
  lobbed: boolean;
  /** Players it can still pass through, and the ones it already has. */
  penetrate: number; passed: number[];
  blast: Blast | null;
};

/** What fires at the horde for the squad besides its players. */
export type Shooter = TurretKind | 'bastion';

export type Crate = { id: number; x: number; y: number; size: number; hp: number; respawnAt: number | null };

export type Thrown =
  | { id: number; kind: 'grenade' | 'fragGrenade' | 'gasGrenade'; owner: number; team: Team; x: number; y: number; vx: number; vy: number; explodeAt: number }
  | { id: number; kind: 'landMine'; owner: number; team: Team; x: number; y: number; armedAt: number; expiresAt: number }
  | { id: number; kind: 'gasCloud'; owner: number; team: Team; x: number; y: number; expiresAt: number };

export type Zone = { id: number; x: number; y: number; r: number; owner: Team; capturing: Team; progress: number };

export type Match = { k: 'playing' } | { k: 'over'; winner: RoundWinner; restartAt: number };

export type LifeRecord = { id: number; name: string; kills: number; score: number; died: boolean };

export type Zombie = { id: number; kind: ZombieKind; x: number; y: number; hp: number; attackAt: number };

type Cell = { id: number; cx: number; cy: number; hp: number };
/** A turret fires for `owner`, its builder, who gets the score for its kills. */
export type Turret = Cell & { kind: TurretKind; owner: number; ammo: number; nextFireAt: number };
export type Building = (Cell & { kind: 'wall' }) | Turret;

/** `n` zombies of one kind that walk in together from one side. */
export type HordeUnit = { kind: ZombieKind; side: Side; n: number };

type RunPhase =
  | { k: 'day'; endsAt: number }
  /** Ends once `toSpawn` is empty and every zombie is dead, or at `dawnAt`, a while after the last pack walks in, when the light burns what is left. */
  | { k: 'night'; toSpawn: HordeUnit[]; nextSpawnAt: number; dawnAt: number }
  | { k: 'over'; night: number; won: boolean; restartAt: number };

export type RunStats = { name: string; kills: number; revives: number; built: number };

/** The flow field: each grid cell's cost to reach the core, cached against the wall and building layouts it was built from. */
type Flow = { wallsVersion: number; buildingsVersion: number; cost: Uint16Array };

/** `survivors` never come back: mending the core shelters the rest but raises no one. `lost` counts tonight's, or last night's by day; `ready` holds the humans ready for night. */
export type Run = {
  core: { hp: number };
  survivors: number;
  lost: number;
  ready: Set<number>;
  scrap: number;
  night: number;
  phase: RunPhase;
  startedAt: number;
  flow: Flow | null;
  stats: Map<number, RunStats>;
  turretKills: Record<TurretKind, Record<ZombieKind, number>>;
  bastionKills: number;
  /** Tonight's horde share for the squad, which scales a boss's health. */
  share: number;
  /** When the Bastion's survivors next fire. */
  bastionFireAt: number;
};

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
  zombies: Zombie[];
  buildings: Building[];
  buildingsVersion: number;
  run: Run | null;
};

export const IDLE_INPUT: InputState = {
  up: false, down: false, left: false, right: false, angle: 0, fire: false, shots: 0, reload: false, ability: false, aimDist: 0, use: false,
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

export const friendly = (team: Team, p: Player) => team !== null && team === p.team;
export const sameTeam = (a: Player, b: Player) => friendly(a.team, b);
export const isEnemy = (a: Player, b: Player) => a.id !== b.id && !sameTeam(a, b);

export function createWorld(mode: ModeId, seed: number, map: MapId): World {
  const w: World = {
    mode, map, mapChangeAt: Infinity, now: 0, tick: 0, rng: seed | 0, nextId: 1,
    players: new Map(), bullets: [], crates: [], walls: [], wallsVersion: 0, thrown: [],
    zones: [], teamScore: { red: 0, blue: 0 }, match: { k: 'playing' }, events: [], queuedEvents: [], lifeRecords: [], history: [],
    zombies: [], buildings: [], buildingsVersion: 0, run: null,
  };
  loadMap(w, map);
  if (mode === 'ZOM') w.run = newRun(w.now);
  return w;
}

export function newRun(now: number): Run {
  return {
    core: { hp: ZOM.coreHp }, survivors: ZOM.survivors, lost: 0, ready: new Set(), scrap: ZOM.startScrap, night: 1, phase: { k: 'day', endsAt: now + ZOM.dayMs },
    startedAt: now, flow: null, stats: new Map(),
    turretKills: byTurret(() => Object.fromEntries(ZOMBIE_KINDS.map((k) => [k, 0])) as Record<ZombieKind, number>), bastionKills: 0, bastionFireAt: 0, share: 1,
  };
}

/** Replaces the layout and everything in flight; players stay where they are. */
export function loadMap(w: World, map: MapId) {
  const def = MAPS[map];
  w.map = map;
  w.mapChangeAt = w.now + MAP_MS[w.mode];
  w.walls = def.walls.map((r) => ({ ...r, built: false as const, expiresAt: Infinity }));
  w.wallsVersion++;
  w.crates = def.crates.map((c) => ({ id: newId(w), x: c.x - CRATE_SIZE / 2, y: c.y - CRATE_SIZE / 2, size: CRATE_SIZE, hp: WORLD.crateHp, respawnAt: null }));
  w.zones = w.mode === 'DOM' ? def.zones.map((z, id) => ({ id, x: z.x, y: z.y, r: ZONE_RADIUS, owner: null, capturing: null, progress: 0 })) : [];
  w.bullets = [];
  w.thrown = [];
  w.history = [];
  w.zombies = [];
  w.buildings = [];
  w.buildingsVersion++;
}

export const crateRect = (c: Crate): Rect => ({ x: c.x, y: c.y, w: c.size, h: c.size });
export function coreRect(w: World): Rect | null {
  const core = MAPS[w.map].siege?.core;
  return core ? coreRectAt(core) : null;
}

/** What stops grenades: walls and standing crates. The squad's own walls and core let them fly over. */
export const coverRects = (w: World): Rect[] => [...w.walls, ...w.crates.filter((c) => c.respawnAt === null).map(crateRect)];

/** What stops bodies: cover, plus the squad's walls and the core in a zombies run. */
export function solidRects(w: World): Rect[] {
  const solids = coverRects(w);
  for (const b of w.buildings) solids.push(cellRect(b.cx, b.cy));
  const core = w.run && coreRect(w);
  if (core) solids.push(core);
  return solids;
}

const SPAWN_CLEARANCE = 10;
const SPAWN_ENEMY_DIST = 400;

export function spawnPoint(w: World, team: Team): Pose {
  const { spawns, siege, size } = MAPS[w.map];
  const regions = spawns[team ?? 'ffa'];
  const solids = solidRects(w);
  const core = siege?.core;
  if (w.run && core) {
    const inside = defendedPoints(solids, core, size);
    if (inside.length) return inside[Math.floor(rand(w) * Math.min(inside.length, SQUAD_SPAWN_CHOICES))]!;
  }
  for (let i = 0; i < 200; i++) {
    const r = regions[Math.floor(rand(w) * regions.length)];
    const x = r.x + rand(w) * r.w, y = r.y + rand(w) * r.h;
    if (solids.some((b) => circleHitsRect(x, y, WORLD.playerRadius + SPAWN_CLEARANCE, b))) continue;
    const tooClose = [...w.players.values()].some((p) => p.life.k === 'alive' && (team === null || p.team !== team) && dist2(p.x, p.y, x, y) < SPAWN_ENEMY_DIST ** 2);
    if (tooClose && i < 150) continue;
    return { x, y };
  }
  const fallback = regions[0];
  return clearPointNear(solids, fallback.x + fallback.w / 2, fallback.y + fallback.h / 2, WORLD.playerRadius + SPAWN_CLEARANCE, size);
}

const SQUAD_SPAWN_CHOICES = 12;

/** Grid points a player can walk to from the core, nearest first, so a squad respawns on the defended side of its walls. */
function defendedPoints(solids: readonly Rect[], core: Center, size: number): Pose[] {
  const n = Math.floor(size / ZOM.cell);
  const center = (c: number) => c * ZOM.cell + ZOM.cell / 2;
  const open = (cx: number, cy: number, r: number) => !solids.some((b) => circleHitsRect(center(cx), center(cy), r, b));
  const seen = new Uint8Array(n * n);
  const x0 = Math.floor((core.x - ZOM.coreHalf) / ZOM.cell) - 1, x1 = Math.floor((core.x + ZOM.coreHalf - 1) / ZOM.cell) + 1;
  const y0 = Math.floor((core.y - ZOM.coreHalf) / ZOM.cell) - 1, y1 = Math.floor((core.y + ZOM.coreHalf - 1) / ZOM.cell) + 1;
  const queue: [number, number][] = [];
  for (let cx = x0; cx <= x1; cx++) for (let cy = y0; cy <= y1; cy++) {
    const border = cx === x0 || cx === x1 || cy === y0 || cy === y1;
    if (border && open(cx, cy, WORLD.playerRadius)) { seen[cy * n + cx] = 1; queue.push([cx, cy]); }
  }
  const points: Pose[] = [];
  const walkable: Pose[] = [];
  for (let i = 0; i < queue.length && points.length < SQUAD_SPAWN_CHOICES; i++) {
    const [cx, cy] = queue[i]!;
    if (walkable.length < SQUAD_SPAWN_CHOICES) walkable.push({ x: center(cx), y: center(cy) });
    if (open(cx, cy, WORLD.playerRadius + SPAWN_CLEARANCE)) points.push({ x: center(cx), y: center(cy) });
    for (const [nx, ny] of [[cx + 1, cy], [cx - 1, cy], [cx, cy + 1], [cx, cy - 1]] as const) {
      if (nx < 1 || ny < 1 || nx >= n - 1 || ny >= n - 1 || seen[ny * n + nx] || !open(nx, ny, WORLD.playerRadius)) continue;
      seen[ny * n + nx] = 1;
      queue.push([nx, ny]);
    }
  }
  // A ring built tight around the core leaves no fully clear cell inside; standing room inside still beats the far side of the wall.
  return points.length ? points : walkable;
}

/** The nearest point to (x, y), on a grid of ZOM.cell steps, where a circle of radius `r` stands clear of every solid, such as when a squad's walls cover its spawn strips. */
function clearPointNear(solids: readonly Rect[], x: number, y: number, r: number, size: number): Pose {
  const clear = (px: number, py: number) => px >= r && py >= r && px <= size - r && py <= size - r && !solids.some((b) => circleHitsRect(px, py, r, b));
  for (let ring = 0; ring * ZOM.cell < size; ring++) {
    const points: Pose[] = [];
    for (let i = -ring; i <= ring; i++) for (let j = -ring; j <= ring; j++) {
      if (Math.max(Math.abs(i), Math.abs(j)) === ring && clear(x + i * ZOM.cell, y + j * ZOM.cell)) points.push({ x: x + i * ZOM.cell, y: y + j * ZOM.cell });
    }
    if (points.length) return points.reduce((a, b) => (dist2(a.x, a.y, x, y) <= dist2(b.x, b.y, x, y) ? a : b));
  }
  return { x, y };
}
