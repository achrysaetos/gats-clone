import { GUNS, STREAK, WORLD, ZOMBIES } from '../shared/defs.ts';
import type { Snapshot } from '../shared/protocol.ts';
import { selfOf, type KillEvent } from './derive.ts';
import { TICK_MS } from './interp.ts';
import { PALETTE } from './palette.ts';
import { royaleCallouts } from './royale.ts';
import { runCallouts, squadShare, type RunCallout } from './zombies.ts';

const TONE: Record<RunCallout['tone'], string> = { night: '#a08cff', dawn: PALETTE.gold, warn: '#ff9f43' };

/** A centered announcement; `ring` also bursts a ring around your player. */
export type Callout = { title: string; line: string; color: string; ring: boolean; born: number };
/** A number floating up off the world: score in gold by default, or `text` in `color`, such as the health a kill gave back, which rides with you (`onSelf`). */
export type ScorePopup = { x: number; y: number; amount: number; born: number; text?: string; color?: string; onSelf?: boolean };
/** `chain` counts your kills landed within `MULTI_KILL_MS` of the one before; `best` is the streak record already beaten this life. */
export type Moments = { callouts: Callout[]; popups: ScorePopup[]; chain: { count: number; at: number }; best: boolean };

export const NO_MOMENTS: Moments = { callouts: [], popups: [], chain: { count: 0, at: -Infinity }, best: false };

/** Kills this close together chain into a multi-kill. */
export const MULTI_KILL_MS = 4000;
const MULTI_NAMES = ['', '', 'DOUBLE KILL', 'TRIPLE KILL', 'QUAD KILL'];
const MULTI_MAX = 'MASSACRE';
/** Streak milestones within one life, each announced as it is reached. */
export const STREAK_NAMES: readonly (readonly [number, string])[] = [[3, 'ON FIRE'], [5, 'RAMPAGE'], [8, 'UNSTOPPABLE'], [12, 'UNTOUCHABLE'], [20, 'LEGENDARY']];
export const MOMENT_COLORS = { multi: '#ff8a3d', streak: '#ff5a1f', shutdown: '#ffd23f', revenge: '#ff4d6d', best: '#5ee0a0', heal: '#5ee0a0' } as const;
export const CALLOUT_MS = 2400;
export const RING_MS = 700;
export const POPUP_MS = 1100;
/** Moments that land together queue this far apart, so at most two callouts share the screen and none reaches the player. */
export const CALLOUT_STAGGER_MS = 1200;

const HUNTED_LINE = `Every enemy sees you on the minimap. Your killer earns +${WORLD.bountyScore}.`;

/** `bestStreak` is the most kills you have ever made in one life, from this browser's records. */
export function addMoments(m: Moments, prev: Snapshot | null, next: Snapshot, now: number, bestStreak = Infinity): Moments {
  const callouts = m.callouts.filter((c) => now - c.born < CALLOUT_MS);
  const announce = (c: Omit<Callout, 'born'>) => callouts.push({ ...c, born: Math.max(now, (callouts.at(-1)?.born ?? -Infinity) + CALLOUT_STAGGER_MS) });
  const popups = m.popups.filter((p) => now - p.born < POPUP_MS);
  const me = selfOf(next);
  // The report card holds the screen once the core falls.
  if ((!me?.alive && !me?.downed) || next.run?.phase === 'over') return { callouts: [], popups, chain: m.chain, best: false };
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
  let chain = m.chain;
  const beats: Beat[] = [];
  for (const ev of kills) {
    chain = now - chain.at <= MULTI_KILL_MS ? { count: chain.count + 1, at: now } : { count: 1, at: now };
    if (ev.revenge) beats.push({ rank: 5, title: 'REVENGE', line: `${ev.victim} paid up · +${STREAK.revengeScore}`, color: MOMENT_COLORS.revenge });
    if (ev.ended >= STREAK.shutdownAt) beats.push({ rank: 4, title: 'SHUTDOWN', line: `Ended ${ev.victim}'s ${ev.ended}-kill streak · +${STREAK.shutdownScore}`, color: MOMENT_COLORS.shutdown });
    if (ev.bounty) beats.push({ rank: 4, title: `BOUNTY +${WORLD.bountyScore}`, line: `${ev.victim} was hunted`, color: PALETTE.gold });
    const at = fallOf(prev, next, ev.victimId);
    if (at && earned > 0) popups.push({ ...at, amount: Math.round(earned / kills.length), born: now });
  }
  if (kills.length && chain.count >= 2) {
    beats.push({ rank: 3, title: MULTI_NAMES[chain.count] ?? MULTI_MAX, line: `${chain.count} kills in a row`, color: MOMENT_COLORS.multi });
  }
  const streak = next.self.streak, before = prev?.self.streak ?? 0;
  const milestone = STREAK_NAMES.filter(([n]) => before < n && streak >= n).at(-1);
  if (milestone) beats.push({ rank: 2, title: milestone[1], line: `${streak} kills without dying`, color: MOMENT_COLORS.streak });
  let best = streak === 0 ? false : m.best;
  if (!best && streak > bestStreak && bestStreak >= STREAK.showAt) {
    best = true;
    beats.push({ rank: 1, title: 'NEW BEST', line: `${streak} kills in one life`, color: MOMENT_COLORS.best });
  }
  // Everything one snapshot earns shares one callout: the biggest beat leads, and the rest ride along on its line.
  if (beats.length) {
    beats.sort((a, b) => b.rank - a.rank);
    const [lead, ...rest] = beats;
    announce({ title: lead!.title, line: [lead!.line, ...rest.map((b) => b.title)].join(' · '), color: lead!.color, ring: lead!.rank >= 3 });
  }
  if (kills.length && life && life.me.hp > life.was.hp) {
    popups.push({ x: life.me.x, y: life.me.y, amount: 0, text: `+${Math.round(life.me.hp - life.was.hp)} HP`, color: MOMENT_COLORS.heal, born: now, onSelf: true });
  }
  return { callouts, popups, chain, best };
}

type Beat = { rank: number; title: string; line: string; color: string };

function fallOf(prev: Snapshot | null, next: Snapshot, victim: number): { x: number; y: number } | null {
  const blow = next.events.filter((ev) => ev.e === 'dmg' && ev.kind === 'player' && ev.victim === victim).at(-1);
  if (blow?.e === 'dmg') return { x: blow.x, y: blow.y };
  return prev?.players.find((p) => p.id === victim) ?? null;
}
