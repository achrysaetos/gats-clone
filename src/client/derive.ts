import { LEVEL_SCORES, WORLD, type ModeId } from '../shared/defs.ts';
import type { GameEvent, PlayerView, Snapshot, Team } from '../shared/protocol.ts';

export type LevelProgress = { level: number; frac: number; nextAt: number | null };

export function levelProgress(level: number, score: number): LevelProgress {
  const from = LEVEL_SCORES[level] ?? 0;
  const to = LEVEL_SCORES[level + 1];
  if (to === undefined) return { level: level + 1, frac: 1, nextAt: null };
  return { level: level + 1, frac: Math.min(1, Math.max(0, (score - from) / (to - from))), nextAt: to };
}

export function killerOf(events: readonly GameEvent[], victimId: number): string | null {
  for (const ev of events) if (ev.e === 'kill' && ev.victimId === victimId) return ev.killer || null;
  return null;
}

export const feedMentions = (kill: { killerId: number | null; victimId: number }, myId: number): boolean =>
  kill.killerId === myId || kill.victimId === myId;

export const selfOf = (snap: Snapshot): PlayerView | undefined => snap.players.find((p) => p.id === snap.self.id);

export function isDead(snap: Snapshot): boolean {
  const me = selfOf(snap);
  return me ? !me.alive : snap.self.respawnIn > 0;
}

export function objectiveFor(mode: ModeId, team: Team): { banner: string; line: string } {
  const side = team ?? 'no';
  const Side = side[0]!.toUpperCase() + side.slice(1);
  switch (mode) {
    case 'FFA':
      return { banner: 'Free for all: most points wins', line: 'FFA · most points wins' };
    case 'TDM':
      return {
        banner: `Team Deathmatch: you are ${side.toUpperCase()}, first to ${WORLD.tdmWinScore} kills`,
        line: `TDM · ${Side} team · first to ${WORLD.tdmWinScore} kills`,
      };
    case 'DOM':
      return {
        banner: `Domination: you are ${side.toUpperCase()}, hold A B C, first to ${WORLD.domWinScore}`,
        line: `DOM · ${Side} team · hold A B C · first to ${WORLD.domWinScore}`,
      };
  }
}

export const seconds = (ms: number) => Math.max(0, Math.ceil(ms / 1000));
