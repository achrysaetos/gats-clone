import type { BuildingKind, TurretKind, ZombieKind } from '../shared/defs.ts';
import type { DamageKind, GameEvent, Loadout, Team, WallView } from '../shared/protocol.ts';
import type { KillEvent, Loss } from './derive.ts';
import type { Feedback } from './feedback.ts';
import type { Moments } from './moments.ts';
import type { SnapBuffer } from './interp.ts';
import type { PendingEffect } from './eventclock.ts';
import type { ParticlePool } from './particles.ts';
import type { Prediction } from './predict.ts';
import type { Retry } from './reconnect.ts';
import type { TurretAim } from './siege.ts';

export type Effect =
  | { kind: 'impact'; surface: 'wall' | DamageKind; x: number; y: number; victim: number | null; born: number }
  | { kind: 'death'; x: number; y: number; victim: number; born: number }
  | { kind: 'boom'; x: number; y: number; r: number; born: number }
  | { kind: 'flash'; x: number; y: number; angle: number; born: number }
  | { kind: 'slash'; x: number; y: number; angle: number; born: number }
  | { kind: 'splat'; x: number; y: number; zombie: ZombieKind; born: number }
  /** A turret's round from its muzzle at (`x`, `y`), flying `reach` px before it stops. */
  | { kind: 'tracer'; turret: TurretKind; x: number; y: number; angle: number; reach: number; born: number };

export const EFFECT_LIFE_MS: Record<Effect['kind'], number> = { impact: 240, death: 650, boom: 650, flash: 70, slash: 200, splat: 420, tracer: 240 };

type FeedLine = Extract<GameEvent, { e: 'kill' | 'hunted' | 'life' }> & { at: number };
export type ChatLine = { from: string; text: string; team: Team; at: number };
type TrailPoint = { x: number; y: number; at: number };

/** Everything needed to join the same room again as the same player. */
export type Rejoin = { room: string; name: string; loadout: Loadout; token: string | undefined };

export type Session = {
  ws: WebSocket;
  rejoin: Rejoin;
  myId: number;
  worldSize: number;
  walls: WallView[];
  snaps: SnapBuffer;
  seq: number;
  shots: number;
  predict: Prediction;
  lastSelf: { x: number; y: number };
  effects: Effect[];
  pendingFx: PendingEffect[];
  feedback: Feedback;
  moments: Moments;
  feed: FeedLine[];
  chat: ChatLine[];
  trails: Map<number, TrailPoint[]>;
  /** The level whose pick was sent and not yet confirmed by a snapshot. */
  pickSentFor: number | null;
  particles: ParticlePool;
  /** Zombies: the time the core last lost health, each zombie's last heading, whether build mode is on and what it puts up. */
  coreHitAt: number;
  zombieFaces: Map<number, { x: number; y: number; a: number }>;
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
