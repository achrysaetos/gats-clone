import { GUNS, WORLD, ZOMBIES } from '../shared/defs.ts';
import type { Snapshot } from '../shared/protocol.ts';
import { selfOf, type KillEvent } from './derive.ts';
import { TICK_MS } from './interp.ts';
import { PALETTE } from './palette.ts';
import { royaleCallouts } from './royale.ts';
import { runCallouts, squadShare, type RunCallout } from './zombies.ts';

const TONE: Record<RunCallout['tone'], string> = { night: '#a08cff', dawn: PALETTE.gold, warn: '#ff9f43' };

/** A centered announcement; `ring` also bursts a ring around your player. */
export type Callout = { title: string; line: string; color: string; ring: boolean; born: number };
export type ScorePopup = { x: number; y: number; amount: number; born: number };
export type Moments = { callouts: Callout[]; popups: ScorePopup[] };

export const NO_MOMENTS: Moments = { callouts: [], popups: [] };
export const CALLOUT_MS = 2400;
export const RING_MS = 700;
export const POPUP_MS = 1100;
/** Moments that land together queue this far apart, so at most two callouts share the screen and none reaches the player. */
export const CALLOUT_STAGGER_MS = 1200;

const HUNTED_LINE = `Every enemy sees you on the minimap. Your killer earns +${WORLD.bountyScore}.`;

export function addMoments(m: Moments, prev: Snapshot | null, next: Snapshot, now: number): Moments {
  const callouts = m.callouts.filter((c) => now - c.born < CALLOUT_MS);
  const announce = (c: Omit<Callout, 'born'>) => callouts.push({ ...c, born: Math.max(now, (callouts.at(-1)?.born ?? -Infinity) + CALLOUT_STAGGER_MS) });
  const popups = m.popups.filter((p) => now - p.born < POPUP_MS);
  const me = selfOf(next);
  // The report card holds the screen once the core falls.
  if ((!me?.alive && !me?.downed) || next.run?.phase === 'over') return { callouts: [], popups };
  for (const c of runCallouts(prev?.run, next.run, (prev?.tick ?? 0) * TICK_MS, next.tick * TICK_MS, squadShare(next.players))) {
    announce({ title: c.title, line: c.line, color: TONE[c.tone], ring: c.tone !== 'warn' });
  }
  for (const c of royaleCallouts(prev?.royale, next.royale, (prev?.tick ?? 0) * TICK_MS, next.tick * TICK_MS)) announce({ ...c, color: '#c9b3ff', ring: false });
  for (const ev of next.events) {
    if (ev.e === 'life' && ev.id === next.self.id && ev.k === 'revived') {
      const by = next.players.find((p) => p.id === ev.by)?.name;
      announce({ title: 'Back on your feet', line: by ? `${by} got you up` : 'Your squad got you up', color: PALETTE.hpGood, ring: true });
    }
    if (ev.e === 'zkill' && ev.by === next.self.id) popups.push({ x: ev.x, y: ev.y, amount: ZOMBIES[ev.kind].score, born: now });
  }
  const was = prev && selfOf(prev);
  const life = me?.alive && was?.alive ? { me, was } : null;
  if (life && GUNS[life.me.gun].stage > GUNS[life.was.gun].stage) {
    const gun = GUNS[life.me.gun];
    announce({ title: gun.name, line: `Evolved · ${gun.desc}`, color: gun.look.accent, ring: true });
    if (gun.stage === 2) announce({ title: 'You are HUNTED', line: HUNTED_LINE, color: PALETTE.hunted, ring: false });
  }
  const kills = next.events.filter((ev): ev is KillEvent => ev.e === 'kill' && ev.killerId === next.self.id && ev.victimId !== next.self.id);
  const earned = life ? life.me.score - life.was.score : 0;
  for (const ev of kills) {
    if (ev.bounty) announce({ title: `BOUNTY +${WORLD.bountyScore}`, line: `${ev.victim} was hunted`, color: PALETTE.gold, ring: false });
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
