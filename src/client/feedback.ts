import type { DamageKind, GameEvent } from '../shared/protocol.ts';

export type DamageNumber = { victim: number; kind: DamageKind; x: number; y: number; amount: number; born: number };

export type Feedback = {
  numbers: DamageNumber[];
  hitmarker: { born: number; kill: boolean } | null;
  hurt: { born: number; strength: number } | null;
};

export const NO_FEEDBACK: Feedback = { numbers: [], hitmarker: null, hurt: null };

export const NUMBER_MS = 900;
export const HITMARKER_MS = { hit: 220, kill: 450 } as const;
export const HURT_MS = 650;
/** Hits on one target this close together add up in one number, so SMG streams and shotgun pellets read as a total. */
const MERGE_MS = 300;

export function addFeedback(fb: Feedback, events: readonly GameEvent[], myId: number, myMaxHp: number, now: number): Feedback {
  let numbers = fb.numbers.filter((n) => now - n.born < NUMBER_MS);
  let { hitmarker, hurt } = fb;
  if (hitmarker && now - hitmarker.born >= HITMARKER_MS[hitmarker.kill ? 'kill' : 'hit']) hitmarker = null;
  if (hurt && now - hurt.born >= HURT_MS) hurt = null;
  for (const ev of events) {
    if (ev.e === 'dmg' && ev.attacker === myId && ev.victim !== myId) {
      const recent = numbers.find((n) => n.victim === ev.victim && n.kind === ev.kind && now - n.born < MERGE_MS);
      numbers = recent
        ? numbers.map((n) => (n === recent ? { ...n, amount: n.amount + ev.amount, x: ev.x, y: ev.y, born: now } : n))
        : [...numbers, { victim: ev.victim, kind: ev.kind, x: ev.x, y: ev.y, amount: ev.amount, born: now }];
      if (ev.kind === 'player' && !hitmarker?.kill) hitmarker = { born: now, kill: false };
    } else if (ev.e === 'dmg' && ev.victim === myId && ev.kind === 'player') {
      const prior = hurt ? hurt.strength * (1 - (now - hurt.born) / HURT_MS) : 0;
      hurt = { born: now, strength: Math.min(1, prior + ev.amount / myMaxHp) };
    } else if (ev.e === 'kill' && ev.killerId === myId && ev.victimId !== myId) {
      hitmarker = { born: now, kill: true };
    }
  }
  return { numbers, hitmarker, hurt };
}
