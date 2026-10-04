import { GUNS, LEVELS, PERK_INFO, WORLD, type GunId, type ModeId, type PerkId, type Tier } from '../shared/defs.ts';
import { rankRows, type GameEvent, type LeaderRow, type MatchView, type PlayerView, type Snapshot, type Team } from '../shared/protocol.ts';
import type { ClientState } from './state.ts';

type LevelProgress = { displayLevel: number; frac: number; nextAt: number | null };

export function levelProgress(serverLevel: number, score: number): LevelProgress {
  const from = LEVELS[serverLevel]?.score ?? 0;
  const to = LEVELS[serverLevel + 1]?.score;
  const displayLevel = serverLevel + 1;
  if (to === undefined) return { displayLevel, frac: 1, nextAt: null };
  return { displayLevel, frac: Math.min(1, Math.max(0, (score - from) / (to - from))), nextAt: to };
}

export type KillEvent = Extract<GameEvent, { e: 'kill' }>;

export const killOf = (events: readonly GameEvent[], victimId: number): KillEvent | null =>
  events.find((ev): ev is KillEvent => ev.e === 'kill' && ev.victimId === victimId) ?? null;

/** What a death took away: the displayed level, the evolved gun (null for a class gun) and the perks, read from the last snapshot of the life. */
export type Loss = { level: number; gun: GunId | null; perks: PerkId[] };

const TIERS: readonly Tier[] = [1, 2, 3];

export function lossOf(snap: Snapshot): Loss | null {
  const me = selfOf(snap);
  if (!me?.alive) return null;
  const perks = TIERS.flatMap((t) => snap.self.perks[t] ?? []);
  return { level: me.level + 1, gun: GUNS[me.gun].stage > 0 ? me.gun : null, perks };
}

export function deathText(kill: KillEvent | null, loss: Loss | null): { title: string; cause: string; lost: string } {
  const title = kill?.killer ? `Eliminated by ${kill.killer}` : 'You were eliminated';
  const weapon = kill?.weapon ?? '';
  const cause = !weapon ? '' : `${kill?.killer ? `with ${weapon}` : weapon}${kill?.bounty ? ` · your bounty paid them ${WORLD.bountyScore}` : ''}`;
  const parts = loss ? [...(loss.level > 1 ? [`level ${loss.level}`] : []), ...(loss.gun ? [GUNS[loss.gun].name] : []), ...loss.perks.map((p) => PERK_INFO[p].name)] : [];
  return { title, cause, lost: parts.length ? `Lost ${parts.join(' · ')}` : '' };
}

export const feedMentions = (kill: { killerId: number | null; victimId: number }, myId: number): boolean =>
  kill.killerId === myId || kill.victimId === myId;

export const selfOf = (snap: Snapshot): PlayerView | undefined => snap.players.find((p) => p.id === snap.self.id);

export function objectiveFor(mode: ModeId, team: Team): { banner: string; line: string } {
  const side = team ?? 'no';
  const Side = side[0]!.toUpperCase() + side.slice(1);
  switch (mode) {
    case 'FFA':
      return { banner: `Free for all: first to ${WORLD.ffaWinKills} kills`, line: `FFA · first to ${WORLD.ffaWinKills} kills` };
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

export const OBJECTIVE_MS = 4000;

/** Long enough for a held or spammed trigger click to land before the death screen takes clicks, so it cannot repick the loadout. */
export const DEATH_ARM_MS = 700;
export const deathScreenArmed = (openedAt: number, now: number): boolean => now - openedAt >= DEATH_ARM_MS;

export const mapNotice = (match: Pick<MatchView, 'nextMap' | 'mapChangeIn'>): string | null =>
  match.mapChangeIn > 0 ? `Next map: ${match.nextMap} in ${seconds(match.mapChangeIn)}s` : null;

export const objectiveVisible = (phase: ClientState['phase'], match: Pick<MatchView, 'winner'>, msSincePlaying: number): boolean =>
  phase === 'playing' && match.winner === null && msSincePlaying < OBJECTIVE_MS;

export const topScorers = (mode: ModeId, rows: readonly LeaderRow[], count: number): LeaderRow[] => rankRows(mode, rows).slice(0, count);
