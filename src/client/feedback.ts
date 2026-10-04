import type { DamageKind, GameEvent } from '../shared/protocol.ts';

/** `slot` lifts a number above the ones still floating over the same victim. */
export type DamageNumber = { victim: number; kind: DamageKind; x: number; y: number; amount: number; born: number; slot: number };

/** `angle` points from you toward where the damage came from. */
export type HurtArc = { angle: number; strength: number; born: number };

export type Feedback = {
  numbers: DamageNumber[];
  hitmarker: { born: number; kill: boolean } | null;
  hurt: { born: number; strength: number } | null;
  arcs: HurtArc[];
  assist: { born: number } | null;
};

export const NO_FEEDBACK: Feedback = { numbers: [], hitmarker: null, hurt: null, arcs: [], assist: null };

export const NUMBER_MS = 900;
export const HITMARKER_MS = { hit: 220, kill: 450 } as const;
export const HURT_MS = 650;
export const HURT_ARC_MS = 600;
export const ASSIST_MS = 1200;
const MERGE_MS = 300;
/** Hits from within this angle of a fresh arc refresh it, so a stream of bullets from one gun draws one arc. */
const ARC_MERGE_RAD = 0.45;

function freeSlot(numbers: readonly DamageNumber[], victim: number): number {
  const taken = new Set(numbers.filter((n) => n.victim === victim).map((n) => n.slot));
  let slot = 0;
  while (taken.has(slot)) slot++;
  return slot;
}

type Placed = { id: number; x: number; y: number };

const angleGap = (a: number, b: number) => Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b)));

function addArc(arcs: HurtArc[], angle: number, strength: number, now: number): HurtArc[] {
  const near = arcs.find((a) => angleGap(a.angle, angle) < ARC_MERGE_RAD);
  if (!near) return [...arcs, { angle, strength: Math.min(1, strength), born: now }];
  const left = near.strength * (1 - (now - near.born) / HURT_ARC_MS);
  return arcs.map((a) => (a === near ? { angle, strength: Math.min(1, left + strength), born: now } : a));
}

/** `players` are the snapshot's positions; an attacker missing from them is placed by where the hit landed on you. */
export function addFeedback(fb: Feedback, events: readonly GameEvent[], players: readonly Placed[], myId: number, myMaxHp: number, now: number): Feedback {
  let numbers = fb.numbers.filter((n) => now - n.born < NUMBER_MS);
  let { hitmarker, hurt, assist } = fb;
  let arcs = fb.arcs.filter((a) => now - a.born < HURT_ARC_MS);
  if (hitmarker && now - hitmarker.born >= HITMARKER_MS[hitmarker.kill ? 'kill' : 'hit']) hitmarker = null;
  if (hurt && now - hurt.born >= HURT_MS) hurt = null;
  if (assist && now - assist.born >= ASSIST_MS) assist = null;
  const me = players.find((p) => p.id === myId);
  for (const ev of events) {
    if (ev.e === 'dmg' && ev.attacker === myId && ev.victim !== myId) {
      const recent = numbers.find((n) => n.victim === ev.victim && now - n.born < MERGE_MS);
      numbers = recent
        ? numbers.map((n) => (n === recent ? { ...n, amount: n.amount + ev.amount, x: ev.x, y: ev.y, born: now } : n))
        : [...numbers, { victim: ev.victim, kind: ev.kind, x: ev.x, y: ev.y, amount: ev.amount, born: now, slot: freeSlot(numbers, ev.victim) }];
      if (ev.kind === 'player' && !hitmarker?.kill) hitmarker = { born: now, kill: false };
    } else if (ev.e === 'dmg' && ev.victim === myId && ev.kind === 'player') {
      const prior = hurt ? hurt.strength * (1 - (now - hurt.born) / HURT_MS) : 0;
      hurt = { born: now, strength: Math.min(1, prior + ev.amount / myMaxHp) };
      const from = players.find((p) => p.id === ev.attacker && p.id !== myId) ?? ev;
      if (me && (from.x !== me.x || from.y !== me.y)) arcs = addArc(arcs, Math.atan2(from.y - me.y, from.x - me.x), ev.amount / myMaxHp, now);
    } else if (ev.e === 'kill' && ev.killerId === myId && ev.victimId !== myId) {
      hitmarker = { born: now, kill: true };
    } else if (ev.e === 'kill' && ev.assisters.includes(myId)) {
      assist = { born: now };
    }
  }
  return { numbers, hitmarker, hurt, arcs, assist };
}
