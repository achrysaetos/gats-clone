import type { DamageKind, Team, WallView } from '../shared/protocol.ts';
import type { Feedback } from './feedback.ts';
import type { SnapBuffer } from './interp.ts';
import type { Prediction } from './predict.ts';

export type Effect =
  | { kind: 'impact'; surface: 'wall' | DamageKind; x: number; y: number; born: number }
  | { kind: 'boom'; x: number; y: number; r: number; born: number }
  | { kind: 'flash'; x: number; y: number; angle: number; born: number };

export const EFFECT_LIFE_MS: Record<Effect['kind'], number> = { impact: 240, boom: 550, flash: 70 };

export type FeedLine = { killer: string; victim: string; killerId: number | null; victimId: number; weapon: string; at: number };
export type ChatLine = { from: string; text: string; team: Team; at: number };
export type TrailPoint = { x: number; y: number; at: number };

/** Everything that lives exactly as long as one websocket connection to a room. */
export type Session = {
  ws: WebSocket;
  myId: number;
  worldSize: number;
  walls: WallView[];
  snaps: SnapBuffer;
  seq: number;
  /** Trigger presses latched per mousedown; sent whole every input so presses between samples are never lost. */
  shots: number;
  predict: Prediction;
  lastSelf: { x: number; y: number };
  effects: Effect[];
  feedback: Feedback;
  feed: FeedLine[];
  chat: ChatLine[];
  trails: Map<number, TrailPoint[]>;
  perkSentFor: number | null;
};

export type MenuStatus =
  | { kind: 'idle' }
  | { kind: 'connecting'; ws: WebSocket }
  | { kind: 'error'; message: string };

export type ClientState =
  | { phase: 'menu'; status: MenuStatus }
  | { phase: 'playing'; s: Session }
  | { phase: 'dead'; s: Session; killer: string | null };
