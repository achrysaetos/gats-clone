import type { DamageKind, Loadout, Team, WallView } from '../shared/protocol.ts';
import type { Feedback } from './feedback.ts';
import type { SnapBuffer } from './interp.ts';
import type { PendingEffect } from './eventclock.ts';
import type { ParticlePool } from './particles.ts';
import type { Prediction } from './predict.ts';
import type { Retry } from './reconnect.ts';

export type Effect =
  | { kind: 'impact'; surface: 'wall' | DamageKind; x: number; y: number; victim: number | null; born: number }
  | { kind: 'death'; x: number; y: number; victim: number; born: number }
  | { kind: 'boom'; x: number; y: number; r: number; born: number }
  | { kind: 'flash'; x: number; y: number; angle: number; born: number }
  | { kind: 'slash'; x: number; y: number; angle: number; born: number };

export const EFFECT_LIFE_MS: Record<Effect['kind'], number> = { impact: 240, death: 650, boom: 650, flash: 70, slash: 200 };

export type FeedLine = { killer: string; victim: string; killerId: number | null; victimId: number; weapon: string; at: number };
export type ChatLine = { from: string; text: string; team: Team; at: number };
export type TrailPoint = { x: number; y: number; at: number };

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
  feed: FeedLine[];
  chat: ChatLine[];
  trails: Map<number, TrailPoint[]>;
  perkSentFor: number | null;
  particles: ParticlePool;
};

export type MenuStatus =
  | { kind: 'idle' }
  | { kind: 'connecting'; ws: WebSocket; rejoin: Rejoin }
  | { kind: 'error'; message: string };

export type ClientState =
  | { phase: 'menu'; status: MenuStatus }
  | { phase: 'playing'; s: Session }
  | { phase: 'dead'; s: Session; killer: string | null }
  | { phase: 'reconnecting'; s: Session; rejoin: Rejoin; retry: Retry; dial: WebSocket | null };
