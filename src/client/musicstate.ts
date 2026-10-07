import { isBoss, ZOMBIE_KINDS } from '../shared/defs.ts';
import type { Snapshot } from '../shared/protocol.ts';
import { selfOf } from './derive.ts';
import { TICK_MS } from './interp.ts';
import { IDLE_INPUT, stepHeat, type MusicInput } from './musictheory.ts';

/** Moments the score answers with a sting, a duck or a cadence. */
export type MusicCue =
  | { kind: 'kill'; streak: number; bounty: boolean }
  | { kind: 'zkill' }
  | { kind: 'boom'; r: number }
  | { kind: 'win' }
  | { kind: 'loss' };

/** What the score remembers between snapshots. */
export type MusicTracker = {
  heat: number;
  /** Server tick last read, so each snapshot's events sound once. */
  tick: number;
  /** performance.now of the last observation. */
  at: number;
  hp: number;
  multiUntil: number;
  huntedUntil: number;
  killTimes: readonly number[];
  /** A round or run's end has already played its cadence. */
  ended: boolean;
  input: MusicInput;
};
export const NO_TRACKER: MusicTracker = { heat: 0, tick: -1, at: 0, hp: 0, multiUntil: 0, huntedUntil: 0, killTimes: [], ended: false, input: IDLE_INPUT };

export const FINALE_MS = 60_000;
const NEAR_VIEW = 0.8;
const MULTI_WINDOW_MS = 3000;
const MULTI_HOLD_MS = 4000;
const HUNTED_HOLD_MS = 6000;
export const HORDE_FULL = 50;

/** Whether the round or run that just ended was yours, null if nothing ended. */
export function outcomeOf(snap: Snapshot): 'win' | 'loss' | null {
  const me = selfOf(snap);
  const w = snap.match.winner;
  if (snap.run?.phase === 'over' && snap.run.report) return snap.run.report.won ? 'win' : 'loss';
  if (snap.royale?.result) return snap.royale.result.place === 1 ? 'win' : 'loss';
  if (!w || snap.run || snap.royale) return null;
  if (w.id !== null) return w.id === snap.self.id ? 'win' : 'loss';
  const { red, blue } = snap.match.teamScore;
  const mine = me?.team === 'red' ? red : me?.team === 'blue' ? blue : null;
  if (mine === null) return 'loss';
  return mine >= (me?.team === 'red' ? blue : red) ? 'win' : 'loss';
}

/** The seconds-left finale: the last minute of a clocked round, or a boss walking the field. */
export function finaleOf(snap: Snapshot): boolean {
  if (snap.zombies?.some((z) => isBoss(ZOMBIE_KINDS[z[1]]!))) return true;
  const end = snap.match.roundEndsAt;
  if (end === null || snap.match.winner) return false;
  const left = end - snap.tick * TICK_MS;
  return left > 0 && left <= FINALE_MS;
}

/** Reads one snapshot (once per tick) into the layer inputs and the cues it sounds. `phase` is the client's, `firing` whether the trigger is held. */
export function observe(tr: MusicTracker, snap: Snapshot | null, phase: MusicInput['phase'], now: number, firing: boolean): { tracker: MusicTracker; cues: MusicCue[] } {
  if (!snap || phase === 'menu') return { tracker: { ...NO_TRACKER, at: now, input: { ...IDLE_INPUT } }, cues: [] };
  const dt = Math.min(0.25, Math.max(0, (now - tr.at) / 1000));
  const me = selfOf(snap);
  const cues: MusicCue[] = [];
  const fresh = snap.tick !== tr.tick;
  let { multiUntil, huntedUntil, killTimes, ended } = tr;
  let dealt = false;
  if (fresh) {
    for (const ev of snap.events) {
      if (ev.e === 'kill' && ev.killerId === snap.self.id && ev.victimId !== snap.self.id) {
        cues.push({ kind: 'kill', streak: snap.self.streak, bounty: ev.bounty });
        killTimes = [...killTimes.filter((t) => now - t < MULTI_WINDOW_MS), now];
        if (killTimes.length >= 2) multiUntil = now + MULTI_HOLD_MS;
      } else if (ev.e === 'zkill' && ev.by === snap.self.id) cues.push({ kind: 'zkill' });
      else if (ev.e === 'boom') cues.push({ kind: 'boom', r: ev.r });
      else if (ev.e === 'hunted') huntedUntil = now + HUNTED_HOLD_MS;
      else if (ev.e === 'dmg' && ev.attacker === snap.self.id && ev.victim !== snap.self.id && (ev.kind === 'player' || ev.kind === 'zombie')) dealt = true;
    }
  }
  const outcome = outcomeOf(snap);
  if (!outcome) ended = false;
  else if (!ended) { ended = true; cues.push({ kind: outcome }); }

  const radius = (snap.self.viewRadius || 600) * NEAR_VIEW;
  let near = 0;
  if (me) {
    for (const p of snap.players) if (p.id !== me.id && p.alive && (p.team === null || p.team !== me.team) && Math.hypot(p.x - me.x, p.y - me.y) < radius) near++;
    for (const z of snap.zombies ?? []) if (Math.hypot(z[2] - me.x, z[3] - me.y) < radius * 0.75) near++;
  }
  const hurt = !!me && tr.hp > 0 && me.hp < tr.hp && fresh;
  const heat = stepHeat(tr.heat, dt, { near: Math.min(1, near / 3), firing, hurt, dealt });
  const run = snap.run;
  const input: MusicInput = {
    phase,
    mode: run ? 'zombies' : 'arena',
    day: run?.phase === 'day',
    night: run?.phase === 'night',
    horde: run ? Math.min(1, Math.max(run.aliveZombies, snap.zombies?.length ?? 0) / HORDE_FULL) : 0,
    heat,
    streak: snap.self.streak,
    multi: now < multiUntil,
    hunted: (me?.hunted ?? false) || now < huntedUntil || snap.players.some((p) => p.id !== snap.self.id && p.alive && p.hunted),
    finale: finaleOf(snap),
  };
  return { tracker: { heat, tick: snap.tick, at: now, hp: me?.hp ?? 0, multiUntil, huntedUntil, killTimes, ended, input }, cues };
}
