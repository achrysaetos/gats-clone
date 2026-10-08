import type { BuildingKind, GunId, TurretKind, ZombieKind } from '../shared/defs.ts';
import type { Material, PieceId } from '../shared/kit.ts';
import type { MapId } from '../shared/maps.ts';
import type { Stride } from './gait.ts';
import type { DamageKind, GameEvent, Loadout, Team, WallView } from '../shared/protocol.ts';
import type { KillEvent, Loss } from './derive.ts';
import type { Feedback } from './feedback.ts';
import type { Moments } from './moments.ts';
import type { SnapBuffer } from './interp.ts';
import type { PendingEffect } from './eventclock.ts';
import type { ParticlePool } from './particles.ts';
import type { Firing } from './fire.ts';
import type { Prediction } from './predict.ts';
import type { Retry } from './reconnect.ts';
import type { LocalRound, ShotEvent } from './rounds.ts';
import type { SoundCue } from './sfx.ts';
import type { TurretAim } from './siege.ts';
import type { TrailPoint } from './trails.ts';
import type { CrackPool } from './decals.ts';

export type Effect =
  /** (`x`, `y`) is where the round struck, and `dir` the way it flew, when the server knows. */
  /** `material` is what the round struck when it hit cover, found once the effect starts. */
  | { kind: 'impact'; surface: 'wall' | DamageKind; x: number; y: number; dir: number | null; victim: number | null; by: number | null; material?: Material; born: number }
  | { kind: 'death'; x: number; y: number; victim: number; by: number | null; born: number }
  | { kind: 'boom'; x: number; y: number; r: number; born: number }
  | { kind: 'flash'; x: number; y: number; angle: number; owner: number; gun: GunId; born: number }
  /** A breakable piece gone to pieces: its solid's rect, flinging its debris from the centre. */
  | { kind: 'broke'; piece: PieceId; x: number; y: number; w: number; h: number; born: number }
  | { kind: 'slash'; x: number; y: number; angle: number; born: number }
  | { kind: 'splat'; x: number; y: number; zombie: ZombieKind; born: number }
  /** A turret's round from its muzzle at (`x`, `y`), flying `reach` px before it stops. */
  | { kind: 'tracer'; turret: TurretKind; x: number; y: number; angle: number; reach: number; born: number };

export const EFFECT_LIFE_MS: Record<Effect['kind'], number> = { impact: 240, death: 650, boom: 650, flash: 70, broke: 900, slash: 200, splat: 420, tracer: 240 };

type FeedLine = Extract<GameEvent, { e: 'kill' | 'hunted' | 'life' | 'wiped' }> & { at: number };
export type ChatLine = { from: string; text: string; team: Team; at: number };

/** Everything needed to join the same room again as the same player. */
export type Rejoin = { room: string; name: string; loadout: Loadout; token: string | undefined };

export type Session = {
  /** When the last sent input walked, and whether the newest one does, read the way the server reads it. */
  walk: { now: boolean; at: number };
  ws: WebSocket;
  rejoin: Rejoin;
  myId: number;
  map: MapId;
  worldSize: number;
  walls: WallView[];
  snaps: SnapBuffer;
  seq: number;
  shots: number;
  predict: Prediction;
  firing: Firing;
  lastSelf: { x: number; y: number };
  effects: Effect[];
  rounds: LocalRound[];
  /** Whether each of the server's gun rounds in view is drawn locally instead, from `coverServerRounds`. */
  roundCover: Map<number, boolean>;
  pendingFx: PendingEffect[];
  /** Other players' shots, waiting for the render clock to reach their tick. */
  pendingShots: { at: number; shot: ShotEvent }[];
  /** Sounds of what others did, waiting for the render clock to reach their tick. */
  pendingSounds: { at: number; cue: SoundCue }[];
  /** The server time of each shooter's last shot event, for `recentShooters`. */
  lastShotAt: Map<number, number>;
  feedback: Feedback;
  moments: Moments;
  feed: FeedLine[];
  chat: ChatLine[];
  trails: Map<number, TrailPoint[]>;
  hurtAt: Map<number, number>;
  cracks: CrackPool;
  /** The level whose pick was sent and not yet confirmed by a snapshot. */
  pickSentFor: number | null;
  particles: ParticlePool;
  /** Zombies: the time the core last lost health, each zombie's last heading, whether build mode is on and what it puts up. */
  coreHitAt: number;
  zombieFaces: Map<number, { x: number; y: number; a: number }>;
  /** Each soldier's last drawn spot, the way its legs face and how far through the run cycle they are. */
  strides: Map<number, Stride>;
  /** Each soldier's stride when its footsteps were last checked, so each heel strike sounds once. */
  heardSteps: Map<number, Stride>;
  building: boolean;
  buildKind: BuildingKind;
  /** Each turret's aim by cell (`cx,cy`). */
  turretAims: Map<string, TurretAim>;
};

type MenuStatus =
  | { kind: 'idle' }
  | { kind: 'connecting'; ws: WebSocket; rejoin: Rejoin }
  | { kind: 'error'; message: string };

export type ClientState =
  | { phase: 'menu'; status: MenuStatus }
  | { phase: 'playing'; s: Session }
  | { phase: 'dead'; s: Session; kill: KillEvent | null; loss: Loss | null }
  | { phase: 'reconnecting'; s: Session; rejoin: Rejoin; retry: Retry; dial: WebSocket | null };
