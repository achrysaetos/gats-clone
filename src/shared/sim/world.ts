import { byTurret, CRATE_TIERS, PERK_TIERS, WORLD, ZOM, ZOMBIE_KINDS, type Blast, type ColorId, type CrateTier, type GunId, type ModeId, type PlayerKind, type Side, type Tier, type TurretKind, type ZombieKind } from '../defs.ts';
import type { Circle, Dash, GameEvent, Shove, InputState, Loadout, RoundWinner, Team, WallView } from '../protocol.ts';
import { MAP_MS, MAPS, ZONE_RADIUS, type Center, type MapId } from '../maps.ts';
import { KIT, placed, type PieceId, type Placement } from '../kit.ts';
import { trainAt } from './train.ts';
import { cellRect, coreRectAt } from './build.ts';
import { circleHitsRect, dist2, type Rect } from './movement.ts';
import { newRoyale, farthestEdgeSlot } from './royale.ts';
import { newExtract, sideSpawns, type Extract } from './extract.ts';

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
    shieldUntil: number;
    dash: Dash | null;
    shove: Shove | null;
    staggerUntil: number;
    /** The rounds one attacker landed this tick, summed raw, so a shotgun's pellets count as one blast toward a stagger. */
    blow: { by: number; tick: number; damage: number } | null;
    flinchUntil: number;
    suppressedUntil: number;
    /** When this player was last sent a whizz. */
    whizzAt: number;
    pressUntil: number;
    /** Health each attacker took off this life and when, for assists and for who a self-inflicted death credits. */
    hits: { by: number; at: number; dealt: number }[];
  }
  /** Out of the fight until a squadmate holds use beside them for `ZOM.reviveMs`, or dead at `bleedOutAt`. */
  | { k: 'downed'; bleedOutAt: number; reviveProgress: number; hp: number }
  /** `respawnAt` is Infinity when the mode, not a timer, brings the player back: a zombies dawn or a Last Squad redeploy. */
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
  /** `range` is how far it flies in all and `left` how much of that is still to go. */
  range: number; left: number; damage: number; piercing: boolean; label: string;
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

/** A piece that wears down and breaks: a map's breakable kit piece, or a Last Squad loot crate (`tier`). `x`, `y`, `w`, `h` is its solid. */
export type Crate = { id: number; piece: PieceId; r: Placement['r']; x: number; y: number; w: number; h: number; hp: number; respawnAt: number | null; tier?: CrateTier };

export type Thrown =
  | { id: number; kind: 'grenade' | 'fragGrenade' | 'gasGrenade'; owner: number; team: Team; x: number; y: number; vx: number; vy: number; explodeAt: number }
  | { id: number; kind: 'landMine'; owner: number; team: Team; x: number; y: number; armedAt: number; expiresAt: number }
  | { id: number; kind: 'gasCloud'; owner: number; team: Team; x: number; y: number; expiresAt: number }
  /** A broken fuel barrel about to burst: a blast that breaks one sets it off a beat later, so a row of them goes up in turn. */
  | { id: number; kind: 'fuse'; owner: number; team: Team; x: number; y: number; explodeAt: number; piece: PieceId }
  /** Burning fuel: it hurts everyone standing in it, its lighter included, until it burns out. */
  | { id: number; kind: 'fire'; owner: number; team: Team; x: number; y: number; r: number; dps: number; expiresAt: number };

export type Zone = { id: number; x: number; y: number; r: number; owner: Team; capturing: Team; progress: number };

export type Match = { k: 'playing' } | { k: 'over'; winner: RoundWinner; restartAt: number };

export type LifeRecord = { id: number; name: string; kills: number; score: number; died: boolean };

/** `vx`, `vy` is how fast it moved last tick, in px a second. */
export type Zombie = { id: number; kind: ZombieKind; x: number; y: number; hp: number; attackAt: number; vx: number; vy: number };

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

/**
 * `survivors` never come back: mending the core shelters the rest but raises no one. `harm` is what the core has taken toward the next survivor lost.
 * `lost` counts tonight's, or last night's by day; `ready` holds the humans ready for night.
 */
export type Run = {
  core: { hp: number };
  harm: number;
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
  bastionFireAt: number;
};

export type Ring =
  | { k: 'waiting'; phase: number; circle: Circle; next: Circle; shrinkAt: number }
  | { k: 'shrinking'; phase: number; from: Circle; to: Circle; startAt: number; closeAt: number }
  | { k: 'closed'; circle: Circle; closedAt: number };

export type Drop = { x: number; y: number; landsAt: number };

export type RoyaleStats = { name: string; kills: number; knocks: number; revives: number };

/**
 * `squads` are those that have fielded a player this match and `out` the ones with nobody left standing, first out first.
 * `redeployAt` holds each dead player still coming back beside a squadmate, `regroupAt` each wiped squad coming back together; `killers` who took each player's life, so a wiped squad can watch them; `watching` whom each dead player's camera follows.
 */
export type Royale = {
  ring: Ring;
  squads: ColorId[];
  out: ColorId[];
  redeployAt: Map<number, number>;
  regroupAt: Map<ColorId, number>;
  drops: Drop[];
  stats: Map<number, RoyaleStats>;
  killers: Map<number, number>;
  watching: Map<number, number>;
  /** Turns the squads' starting bearings and the caches round the map's centre, fresh each match. */
  spin: number;
};

export type Pose = { x: number; y: number };
type Spot = Pose & { angle?: number };

export function moveTo(p: Player, at: Spot) {
  p.x = at.x;
  p.y = at.y;
  if (at.angle !== undefined) p.angle = at.angle;
}
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
  /** Railings: they stop bodies and let rounds and grenades through. */
  fences: Rect[];
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
  royale: Royale | null;
  extract: Extract | null;
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
    players: new Map(), bullets: [], crates: [], walls: [], fences: [], wallsVersion: 0, thrown: [],
    zones: [], teamScore: { red: 0, blue: 0 }, match: { k: 'playing' }, events: [], queuedEvents: [], lifeRecords: [], history: [],
    zombies: [], buildings: [], buildingsVersion: 0, run: null, royale: null, extract: null,
  };
  loadMap(w, map);
  if (mode === 'ZOM') w.run = newRun(w.now);
  return w;
}

export function newRun(now: number): Run {
  return {
    core: { hp: ZOM.coreHp }, harm: 0, survivors: ZOM.survivors, lost: 0, ready: new Set(), scrap: ZOM.startScrap, night: 1, phase: { k: 'day', endsAt: now + ZOM.dayMs },
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
  w.crates = def.breakables.map((at) => ({ id: newId(w), piece: at.p, r: at.r, ...placed(at).foot, hp: KIT[at.p].breaks!.hp, respawnAt: null }));
  w.fences = [...def.fences];
  w.zones = w.mode === 'DOM' ? def.zones.map((z, id) => ({ id, x: z.x, y: z.y, r: ZONE_RADIUS, owner: null, capturing: null, progress: 0 })) : [];
  w.bullets = [];
  w.thrown = [];
  w.history = [];
  w.zombies = [];
  w.buildings = [];
  w.buildingsVersion++;
  if (w.mode === 'BR') w.royale = newRoyale(w);
  if (w.mode === 'EXT') w.extract = newExtract(w.now);
}

export const crateHpMax = (c: Pick<Crate, 'piece' | 'tier'>): number => (c.tier ? CRATE_TIERS[c.tier].hp : KIT[c.piece].breaks?.hp ?? 1);
export const crateRect = (c: Crate): Rect => ({ x: c.x, y: c.y, w: c.w, h: c.h });
export function coreRect(w: World): Rect | null {
  const core = MAPS[w.map].siege?.core;
  return core ? coreRectAt(core) : null;
}

/** The passing train's body, or null while its lane is clear. */
export function trainBody(w: World): Rect | null {
  const train = MAPS[w.map].train;
  const at = train && trainAt(train, w.now);
  return at?.k === 'pass' ? at.body : null;
}

/** What stops grenades: walls, standing crates and a passing train. The squad's own walls and core let them fly over. */
export function coverRects(w: World): Rect[] {
  const cover: Rect[] = [...w.walls, ...w.crates.filter((c) => c.respawnAt === null).map(crateRect)];
  const train = trainBody(w);
  if (train) cover.push(train);
  return cover;
}

/** Ground nothing is put on, though it stops nobody: the train's lane, where a spawn, a drop or a crate would be run down. */
export function keepOff(w: World): Rect[] {
  const train = MAPS[w.map].train;
  return train ? [train.lane] : [];
}

/** What stops bodies: cover and railings, plus the squad's walls and the core in a zombies run. */
export function solidRects(w: World): Rect[] {
  const solids = [...coverRects(w), ...w.fences];
  for (const b of w.buildings) solids.push(cellRect(b.cx, b.cy));
  const core = w.run && coreRect(w);
  if (core) solids.push(core);
  return solids;
}

const SPAWN_CLEARANCE = 10;
/** Clear spots a spawn weighs, taking the one farthest from any enemy. */
const SPAWN_CANDIDATES = 12;
const SPAWN_EDGE = 100;

const SQUAD_GAP = { min: 70, max: 160 } as const;

function squadSpawn(w: World, team: Team, solids: readonly Rect[], size: number): Spot {
  const r = WORLD.playerRadius + SPAWN_CLEARANCE;
  const clear = (x: number, y: number) => x >= r && y >= r && x <= size - r && y <= size - r && !solids.some((b) => circleHitsRect(x, y, r, b));
  const mates = [...w.players.values()].filter((p) => p.team === team && p.life.k === 'alive' && Number.isFinite(p.x));
  const beside = (m: Player): Pose => {
    for (let i = 0; i < 20; i++) {
      const a = rand(w) * 2 * Math.PI, d = SQUAD_GAP.min + rand(w) * (SQUAD_GAP.max - SQUAD_GAP.min);
      const x = m.x + Math.cos(a) * d, y = m.y + Math.sin(a) * d;
      if (clear(x, y)) return { x, y };
    }
    return clearPointNear(solids, m.x, m.y, r, size);
  };
  const edge = farthestEdgeSlot(w, team);
  const at = mates.length ? beside(mates[Math.floor(rand(w) * mates.length)]!) : clearPointNear(solids, edge.x, edge.y, r, size);
  return { ...at, angle: Math.atan2(edge.centre.y - at.y, edge.centre.x - at.x) };
}

export function spawnPoint(w: World, team: Team): Spot {
  const { spawns, siege, size } = MAPS[w.map];
  const solids = [...solidRects(w), ...keepOff(w)];
  if (w.royale) return squadSpawn(w, team, solids, size);
  const sided = team === 'red' || team === 'blue' ? team : null;
  const regions = w.extract && sided ? sideSpawns(w, w.extract, sided) : spawns[sided ?? 'ffa'];
  const core = siege?.core;
  if (w.run && core) {
    const inside = defendedPoints(solids, core, size);
    if (inside.length) return inside[Math.floor(rand(w) * Math.min(inside.length, SQUAD_SPAWN_CHOICES))]!;
  }
  const enemies = [...w.players.values()].filter((p) => p.life.k === 'alive' && (team === null || p.team !== team));
  const safety = (x: number, y: number) => Math.min(Infinity, ...enemies.map((p) => dist2(p.x, p.y, x, y)));
  let best: (Pose & { safety: number }) | null = null;
  // A free-for-all has no sides to keep, so half its candidates come from anywhere open on the map and nobody starts on top of a rival.
  const anywhere: Rect = { x: SPAWN_EDGE, y: SPAWN_EDGE, w: size - 2 * SPAWN_EDGE, h: size - 2 * SPAWN_EDGE };
  for (let i = 0, found = 0; i < 200 && found < SPAWN_CANDIDATES; i++) {
    const r = team === null && i % 2 === 1 ? anywhere : regions[Math.floor(rand(w) * regions.length)];
    const x = r.x + rand(w) * r.w, y = r.y + rand(w) * r.h;
    if (solids.some((b) => circleHitsRect(x, y, WORLD.playerRadius + SPAWN_CLEARANCE, b))) continue;
    found++;
    const s = safety(x, y);
    if (!best || s > best.safety) best = { x, y, safety: s };
  }
  if (best) return { x: best.x, y: best.y };
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
export function clearPointNear(solids: readonly Rect[], x: number, y: number, r: number, size: number): Pose {
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
