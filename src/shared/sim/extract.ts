import { EXT } from '../defs.ts';
import { MAPS, type ExtractDef } from '../maps.ts';
import type { ExtTeam, ExtView, RoundWinner } from '../protocol.ts';
import { dist2 } from './movement.ts';
import { effectiveStats, freshLife } from './stats.ts';
import { moveTo, spawnPoint, type Player, type World } from './world.ts';

/**
 * Where the data case is: locked in the terminal while the hack runs, waiting at the terminal once it is done, in a carrier's hands
 * (`x`, `y` tracking them, so a carrier who leaves the game still drops it where they stood), or lying where its carrier fell.
 */
export type Case =
  | { k: 'hacking'; progress: number; contested: boolean }
  | { k: 'ready' }
  | { k: 'carried'; by: number; x: number; y: number }
  | { k: 'dropped'; x: number; y: number; returnAt: number };

/** A round is live until the case reaches the pad or its clock runs out, then holds a ceasefire until the next one starts. */
type Phase =
  | { k: 'live'; startedAt: number; endsAt: number }
  | { k: 'break'; winner: ExtTeam; why: 'extracted' | 'time'; nextAt: number };

export type Extract = { round: number; wins: Record<ExtTeam, number>; case: Case; phase: Phase };

const TEAM_NAME = { red: 'Red team', blue: 'Blue team' } as const;
const other = (team: ExtTeam): ExtTeam => (team === 'red' ? 'blue' : 'red');

/** Red attacks the odd rounds and blue the even ones. */
export const attackersOf = (x: Extract): ExtTeam => (x.round % 2 === 1 ? 'red' : 'blue');

const extractOf = (w: World): ExtractDef => MAPS[w.map].extract!;

export function newExtract(now: number): Extract {
  return { round: 1, wins: { red: 0, blue: 0 }, case: { k: 'hacking', progress: 0, contested: false }, phase: { k: 'live', startedAt: now, endsAt: now + EXT.roundMs } };
}

export const carrying = (w: World, p: Player): boolean => w.extract?.case.k === 'carried' && w.extract.case.by === p.id;

/** Between rounds nobody fires and nobody is hurt. */
export const ceasefire = (w: World): boolean => w.extract?.phase.k === 'break';

export const moveSpeed = (w: World, p: Player): number => effectiveStats(p).speed * (carrying(w, p) ? EXT.carrierSpeedMul : 1);

/** The spawn regions of `team`'s side this round. */
export function sideSpawns(w: World, x: Extract, team: ExtTeam) {
  const def = extractOf(w);
  return team === attackersOf(x) ? def.attack : def.defend;
}

/** The dead come back together on the next wave of the round. */
export function waveRespawnAt(w: World): number {
  const phase = w.extract?.phase;
  if (!phase) return w.now;
  if (phase.k === 'break') return phase.nextAt;
  return phase.startedAt + (Math.floor((w.now - phase.startedAt) / EXT.waveMs) + 1) * EXT.waveMs;
}

const isSide = (p: Player): p is Player & { team: ExtTeam } => p.team === 'red' || p.team === 'blue';

function endRound(w: World, x: Extract, winner: ExtTeam, why: 'extracted' | 'time') {
  x.wins[winner]++;
  x.phase = { k: 'break', winner, why, nextAt: w.now + EXT.breakMs };
}

/** Sides swap and everyone starts fresh on their new side, placed one by one so each spawn keeps clear of those already standing. */
function nextRound(w: World, x: Extract) {
  x.round++;
  x.case = { k: 'hacking', progress: 0, contested: false };
  x.phase = { k: 'live', startedAt: w.now, endsAt: w.now + EXT.roundMs };
  w.bullets = [];
  w.thrown = [];
  const sided = [...w.players.values()].filter(isSide);
  for (const p of sided) { p.x = -Infinity; p.y = -Infinity; p.life = { k: 'dead', respawnAt: Infinity }; }
  for (const p of sided) {
    moveTo(p, spawnPoint(w, p.team));
    p.life = freshLife(p, w.now);
  }
}

export function tickExtract(w: World, dtMs: number) {
  const x = w.extract;
  if (!x) return;
  const phase = x.phase;
  if (phase.k === 'break') {
    if (w.now >= phase.nextAt) nextRound(w, x);
    return;
  }
  const def = extractOf(w);
  const attackers = attackersOf(x);
  const standing = [...w.players.values()].filter((p) => p.life.k === 'alive' && isSide(p));
  const near = (at: { x: number; y: number }, r: number, team: ExtTeam) => standing.filter((p) => p.team === team && dist2(p.x, p.y, at.x, at.y) <= r * r);
  const c = x.case;
  switch (c.k) {
    case 'hacking': {
      const hackers = near(def.terminal, EXT.terminalR, attackers).length, guards = near(def.terminal, EXT.terminalR, other(attackers)).length;
      c.contested = hackers > 0 && guards > 0;
      if (hackers > 0 && guards === 0) c.progress = Math.min(1, c.progress + dtMs / EXT.hackMs);
      if (c.progress >= 1) x.case = { k: 'ready' };
      break;
    }
    case 'ready': {
      const taker = near(def.terminal, EXT.touchR, attackers)[0];
      if (taker) x.case = { k: 'carried', by: taker.id, x: taker.x, y: taker.y };
      break;
    }
    case 'carried': {
      const carrier = w.players.get(c.by);
      if (!carrier || carrier.life.k !== 'alive' || carrier.team !== attackers) {
        x.case = { k: 'dropped', x: c.x, y: c.y, returnAt: w.now + EXT.returnMs };
        break;
      }
      c.x = carrier.x;
      c.y = carrier.y;
      const pad = def.pad;
      if (c.x >= pad.x && c.x <= pad.x + pad.w && c.y >= pad.y && c.y <= pad.y + pad.h) endRound(w, x, attackers, 'extracted');
      break;
    }
    case 'dropped': {
      const taker = near(c, EXT.touchR, attackers)[0];
      if (near(c, EXT.touchR, other(attackers)).length > 0 || w.now >= c.returnAt) x.case = { k: 'ready' };
      else if (taker) x.case = { k: 'carried', by: taker.id, x: taker.x, y: taker.y };
      break;
    }
  }
  if (x.phase.k === 'live' && w.now >= x.phase.endsAt) endRound(w, x, other(attackers), 'time');
}

export function extractWinner(w: World): RoundWinner | null {
  const x = w.extract;
  if (!x) return null;
  const team = (['red', 'blue'] as const).find((t) => x.wins[t] >= EXT.roundsToWin);
  return team ? { name: TEAM_NAME[team], id: null, note: `Won ${x.wins[team]}–${x.wins[other(team)]}` } : null;
}

export function extractView(w: World, x: Extract): ExtView {
  const def = extractOf(w);
  const c = x.case;
  const phase = x.phase;
  return {
    round: x.round,
    attackers: attackersOf(x),
    wins: { ...x.wins },
    terminal: { ...def.terminal, r: EXT.terminalR },
    pad: { ...def.pad },
    case: c.k === 'hacking' ? { k: 'hacking', progress: Math.floor(c.progress * 100) / 100, contested: c.contested }
      : c.k === 'ready' ? { k: 'ready', x: def.terminal.x, y: def.terminal.y }
      : c.k === 'carried' ? { k: 'carried', by: c.by, x: Math.round(c.x), y: Math.round(c.y) }
      : { k: 'dropped', x: Math.round(c.x), y: Math.round(c.y), returnAt: c.returnAt },
    roundEndsAt: phase.k === 'live' ? phase.endsAt : null,
    between: phase.k === 'break' ? { winner: phase.winner, why: phase.why, nextAt: phase.nextAt } : null,
  };
}
