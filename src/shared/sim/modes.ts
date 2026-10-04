import { WORLD, type ModeId } from '../defs.ts';
import { byRank, type RoundWinner, type Team } from '../protocol.ts';
import { dist2 } from './movement.ts';
import { freshLife, resetProgress } from './stats.ts';
import { nextMap } from '../maps.ts';
import { loadMap, spawnPoint, type Player, type World, type Zone } from './world.ts';

const ZONE_CAPTURE_MS = 3000;
const ZONE_POINTS_PER_SEC = 5;

export type ModeRules = {
  assignTeam(w: World): Team;
  onKill(w: World, killer: Player, victim: Player): void;
  tick(w: World, dtMs: number): void;
  winner(w: World): RoundWinner | null;
};

const TEAM_NAME = { red: 'Red team', blue: 'Blue team' } as const;

function smallerTeam(w: World): Team {
  let red = 0, blue = 0;
  for (const p of w.players.values()) { if (p.team === 'red') red++; else if (p.team === 'blue') blue++; }
  return red <= blue ? 'red' : 'blue';
}

/** The first in leaderboard order among players with at least one kill. */
function topKiller(w: World, eligible: (p: Player) => boolean = () => true): Player | null {
  return [...w.players.values()].filter((p) => p.kills > 0 && eligible(p)).sort(byRank)[0] ?? null;
}

const teamWin = (team: 'red' | 'blue'): RoundWinner => ({ name: TEAM_NAME[team], id: null, note: null });

const teamKills = (w: World, team: Team) => [...w.players.values()].reduce((sum, p) => sum + (p.team === team ? p.kills : 0), 0);

/** The first team to the target, or once the map's time is up the team ahead, on kills if the score is level. A dead heat crowns nobody. */
function teamWinner(w: World, target: number): RoundWinner | null {
  if (w.teamScore.red >= target) return teamWin('red');
  if (w.teamScore.blue >= target) return teamWin('blue');
  if (w.now < w.mapChangeAt) return null;
  const lead = w.teamScore.red - w.teamScore.blue || teamKills(w, 'red') - teamKills(w, 'blue');
  return lead === 0 ? null : { ...teamWin(lead > 0 ? 'red' : 'blue'), note: 'Time ran out' };
}

/** `present` is the one team standing on the zone, or null when it is empty. Another team's partial capture drains before a capture
 * starts, and an enemy-owned zone turns neutral before it can be taken. */
function tickZone(z: Zone, present: Team, step: number) {
  if (!present || (z.capturing !== null && z.capturing !== present)) {
    z.progress = Math.max(0, z.progress - step);
    if (z.progress === 0) z.capturing = null;
    return;
  }
  if (present === z.owner) return;
  z.capturing = present;
  z.progress += step;
  if (z.progress < 1) return;
  z.progress = 0;
  z.owner = z.owner === null ? present : null;
  if (z.owner === present) z.capturing = null;
}

function tickZones(w: World, dtMs: number) {
  for (const z of w.zones) {
    let red = 0, blue = 0;
    for (const p of w.players.values()) {
      if (p.life.k !== 'alive' || dist2(p.x, p.y, z.x, z.y) > z.r * z.r) continue;
      if (p.team === 'red') red++; else if (p.team === 'blue') blue++;
    }
    const present: Team = red > 0 && blue === 0 ? 'red' : blue > 0 && red === 0 ? 'blue' : null;
    if (present || red + blue === 0) tickZone(z, present, dtMs / ZONE_CAPTURE_MS);
    if (z.owner) w.teamScore[z.owner] += (ZONE_POINTS_PER_SEC * dtMs) / 1000;
  }
}

export const MODES: Record<ModeId, ModeRules> = {
  FFA: {
    assignTeam: () => null,
    onKill: () => {},
    tick: () => {},
    // Bots out-kill humans, so a bot reaching the target would end most rounds before a person could; bots win only on the timer.
    winner: (w) => {
      const human = topKiller(w, (p) => p.kind === 'human');
      if (human && human.kills >= WORLD.ffaWinKills) {
        return { name: human.name, id: human.id, note: topKiller(w) === human ? null : `${human.name} reached ${WORLD.ffaWinKills} kills` };
      }
      const top = w.now >= w.mapChangeAt ? topKiller(w) : null;
      return top && { name: top.name, id: top.id, note: null };
    },
  },
  TDM: {
    assignTeam: smallerTeam,
    onKill: (w, killer) => { if (killer.team) w.teamScore[killer.team] += 1; },
    tick: () => {},
    winner: (w) => teamWinner(w, WORLD.tdmWinScore),
  },
  DOM: {
    assignTeam: smallerTeam,
    onKill: () => {},
    tick: tickZones,
    winner: (w) => teamWinner(w, WORLD.domWinScore),
  },
};

/** Everyone leaves the old map before anyone is placed, so each spawn keeps clear of the players already on the new map, not of where the rest stood on the old one. */
function changeMap(w: World) {
  loadMap(w, nextMap(w.mode, w.map));
  const alive = [...w.players.values()].filter((p) => p.life.k === 'alive');
  for (const p of alive) { p.x = -Infinity; p.y = -Infinity; }
  for (const p of alive) {
    const at = spawnPoint(w, p.team);
    p.x = at.x;
    p.y = at.y;
    if (p.life.k === 'alive') p.life.dash = null;
  }
}

export function tickMatch(w: World, dtMs: number) {
  const rules = MODES[w.mode];
  if (w.match.k === 'playing') {
    rules.tick(w, dtMs);
    const winner = rules.winner(w);
    if (winner) {
      w.match = { k: 'over', winner, restartAt: w.now + WORLD.roundRestartMs };
      w.mapChangeAt = w.match.restartAt;
    } else if (w.now >= w.mapChangeAt) {
      // The clock ran out with nobody to crown, so there is no banner to hold: the next round starts on the next map at once.
      startRound(w);
    }
  } else if (w.now >= w.match.restartAt) {
    startRound(w);
  }
  if (w.now >= w.mapChangeAt) changeMap(w);
}

function startRound(w: World) {
  w.match = { k: 'playing' };
  w.teamScore = { red: 0, blue: 0 };
  for (const z of w.zones) { z.owner = null; z.capturing = null; z.progress = 0; }
  for (const p of w.players.values()) {
    if (p.life.k === 'alive') w.lifeRecords.push({ id: p.id, name: p.name, kills: p.lifeKills, score: p.score, died: false });
    p.lifeKills = 0;
    resetProgress(p);
    p.kills = 0;
    p.deaths = 0;
    if (p.life.k === 'alive') p.life = freshLife(p, w.now);
  }
}
