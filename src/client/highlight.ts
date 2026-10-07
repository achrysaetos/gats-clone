import { MEDALS, type MedalId } from '../shared/defs.ts';
import type { Snapshot } from '../shared/protocol.ts';
import type { Point } from './camera.ts';
import { clipOf, serverMs, type ReplayBuffer } from './replaybuf.ts';

/**
 * Your best moment of the round. Kills and medals you earn within `windowMs` of each other make one moment; its score is the
 * medals' own score plus a bonus per kill, for each extra kill of a chain and for a kill on low health. The best one's clip is
 * copied out of the replay ring (so the ring can go on forgetting) and replayed at the round's end.
 */
export const HIGHLIGHT = { windowMs: 4000, leadMs: 1500, tailMs: 1000, maxClipMs: 5500, killScore: 40, chainScore: 80, lowHpScore: 60, lowHp: 0.25, minScore: 80 } as const;

export type Stamp = { medal: MedalId; at: number };
export type Cluster = { first: number; last: number; kills: number; low: number; medals: Stamp[]; focus: Point | null };
export type Want = { score: number; from: number; at: number; stamps: Stamp[]; kills: number; focus: Point | null };
export type Best = { score: number; clip: Snapshot[]; from: number; to: number; stamps: Stamp[]; kills: number; focus: Point | null };
export type Highlight = { cluster: Cluster | null; want: Want | null; best: Best | null; bestScore: number };

export const NO_HIGHLIGHT: Highlight = { cluster: null, want: null, best: null, bestScore: 0 };

export function clusterScore(c: Cluster): number {
  const medals = c.medals.reduce((sum, m) => sum + MEDALS[m.medal].score, 0);
  return medals + c.kills * HIGHLIGHT.killScore + Math.max(0, c.kills - 1) * HIGHLIGHT.chainScore + c.low * HIGHLIGHT.lowHpScore;
}

/** Folds what you did in this snapshot into the moment in progress, or starts a new one when the last is more than the window ago. */
export function foldEvents(cluster: Cluster | null, snap: Snapshot): Cluster | null {
  const me = snap.self.id;
  const at = serverMs(snap);
  const kills = snap.events.filter((e) => e.e === 'kill' && e.killerId === me && e.victimId !== me).length;
  const medals = snap.events.flatMap((e) => (e.e === 'medal' && e.id === me ? [{ medal: e.medal, at }] : []));
  if (!kills && !medals.length) return cluster;
  const mine = snap.players.find((p) => p.id === me);
  const low = kills && mine && mine.maxHp > 0 && mine.hp / mine.maxHp <= HIGHLIGHT.lowHp ? 1 : 0;
  const base = cluster && at - cluster.last <= HIGHLIGHT.windowMs ? cluster : { first: at, last: at, kills: 0, low: 0, medals: [], focus: null };
  const fell = snap.events.filter((e) => e.e === 'dmg' && e.kind === 'player' && e.attacker === me).at(-1);
  return {
    ...base, last: at, kills: base.kills + kills, low: base.low + low, medals: [...base.medals, ...medals],
    focus: fell?.e === 'dmg' ? { x: fell.x, y: fell.y } : base.focus,
  };
}

/** Takes in a snapshot: updates the moment in progress, and copies a clip out of the ring once a better moment has had its tail recorded. */
export function observeHighlight(h: Highlight, snap: Snapshot, buf: ReplayBuffer, roundOver = false): Highlight {
  const cluster = foldEvents(h.cluster, snap);
  let { want, best, bestScore } = h;
  if (cluster && cluster !== h.cluster) {
    const score = clusterScore(cluster);
    if (score >= HIGHLIGHT.minScore && score > bestScore) {
      bestScore = score;
      want = { score, from: Math.max(cluster.first - HIGHLIGHT.leadMs, cluster.last - (HIGHLIGHT.maxClipMs - HIGHLIGHT.tailMs)), at: cluster.last, stamps: cluster.medals, kills: cluster.kills, focus: cluster.focus };
    }
  }
  if (want && (roundOver || serverMs(snap) >= want.at + HIGHLIGHT.tailMs)) {
    const to = want.at + HIGHLIGHT.tailMs;
    const clip = clipOf(buf, want.from, to);
    if (clip.length > 4) best = { score: want.score, clip, from: want.from, to, stamps: want.stamps, kills: want.kills, focus: want.focus };
    else if (best) bestScore = best.score;
    want = null;
  }
  return { cluster, want, best, bestScore };
}

/** The medals stamped so far when the clip has played `at` ms of server time. */
export const stampsAt = (best: Best, at: number): Stamp[] => best.stamps.filter((s) => s.at <= at);
