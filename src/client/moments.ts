import { GUNS, WORLD } from '../shared/defs.ts';
import type { Snapshot } from '../shared/protocol.ts';
import { selfOf, type KillEvent } from './derive.ts';
import { PALETTE } from './palette.ts';

/** A centered announcement; `ring` also bursts a ring around your player. */
export type Callout = { title: string; line: string; color: string; ring: boolean; born: number };
/** Points you earned, floating up from where a victim fell. */
export type ScorePopup = { x: number; y: number; amount: number; born: number };
export type Moments = { callouts: Callout[]; popups: ScorePopup[] };

export const NO_MOMENTS: Moments = { callouts: [], popups: [] };
export const CALLOUT_MS = 2400;
export const RING_MS = 700;
export const POPUP_MS = 1100;

const HUNTED_LINE = `Every enemy sees you on the minimap. Your killer earns +${WORLD.bountyScore}.`;

/** Diffs two snapshots for the moments worth announcing, and drops the ones that have run their course. */
export function addMoments(m: Moments, prev: Snapshot | null, next: Snapshot, now: number): Moments {
  const callouts = m.callouts.filter((c) => now - c.born < CALLOUT_MS);
  const popups = m.popups.filter((p) => now - p.born < POPUP_MS);
  const me = selfOf(next);
  const was = prev && selfOf(prev);
  const sameLife = !!(me?.alive && was?.alive);
  if (sameLife && GUNS[me!.gun].stage > GUNS[was!.gun].stage) {
    const gun = GUNS[me!.gun];
    callouts.push({ title: gun.name, line: `Evolved · ${gun.desc}`, color: gun.look.accent, ring: true, born: now });
    if (gun.stage === 2) callouts.push({ title: 'You are HUNTED', line: HUNTED_LINE, color: PALETTE.hunted, ring: false, born: now });
  }
  const kills = next.events.filter((ev): ev is KillEvent => ev.e === 'kill' && ev.killerId === next.self.id && ev.victimId !== next.self.id);
  const earned = sameLife ? me!.score - was!.score : 0;
  for (const ev of kills) {
    if (ev.bounty) callouts.push({ title: `BOUNTY +${WORLD.bountyScore}`, line: `${ev.victim} was hunted`, color: PALETTE.gold, ring: false, born: now });
    const at = fallOf(prev, next, ev.victimId);
    if (at && earned > 0) popups.push({ ...at, amount: Math.round(earned / kills.length), born: now });
  }
  return { callouts, popups };
}

function fallOf(prev: Snapshot | null, next: Snapshot, victim: number): { x: number; y: number } | null {
  const blow = next.events.filter((ev) => ev.e === 'dmg' && ev.kind === 'player' && ev.victim === victim).at(-1);
  if (blow?.e === 'dmg') return { x: blow.x, y: blow.y };
  return prev?.players.find((p) => p.id === victim) ?? null;
}
