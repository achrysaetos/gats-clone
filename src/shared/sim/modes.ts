import { WORLD, type ModeId } from '../defs.ts';
import type { Team } from '../protocol.ts';
import { dist2 } from './movement.ts';
import { resetProgress } from './stats.ts';
import { nextMap } from '../maps.ts';
import { loadMap, spawnPoint, type Player, type World } from './world.ts';

const ZONE_CAPTURE_MS = 3000;
const ZONE_POINTS_PER_SEC = 5;

export type ModeRules = {
  assignTeam(w: World): Team;
  onKill(w: World, killer: Player, victim: Player): void;
  tick(w: World, dtMs: number): void;
  winner(w: World): string | null;
};

const TEAM_NAME = { red: 'Red team', blue: 'Blue team' } as const;

function smallerTeam(w: World): Team {
  let red = 0, blue = 0;
  for (const p of w.players.values()) { if (p.team === 'red') red++; else if (p.team === 'blue') blue++; }
  return red <= blue ? 'red' : 'blue';
}

function teamAtLeast(w: World, target: number): string | null {
  if (w.teamScore.red >= target) return TEAM_NAME.red;
  if (w.teamScore.blue >= target) return TEAM_NAME.blue;
  return null;
}

function tickZones(w: World, dtMs: number) {
  for (const z of w.zones) {
    let red = 0, blue = 0;
    for (const p of w.players.values()) {
      if (p.life.k !== 'alive' || dist2(p.x, p.y, z.x, z.y) > z.r * z.r) continue;
      if (p.team === 'red') red++; else if (p.team === 'blue') blue++;
    }
    const present: Team = red > 0 && blue === 0 ? 'red' : blue > 0 && red === 0 ? 'blue' : null;
    if (present && present !== z.owner) {
      if (z.capturing !== present) { z.capturing = present; z.progress = 0; }
      z.progress += dtMs / ZONE_CAPTURE_MS;
      if (z.progress >= 1) { z.owner = present; z.capturing = null; z.progress = 0; }
    } else if (!present && red + blue === 0) {
      z.progress = Math.max(0, z.progress - dtMs / ZONE_CAPTURE_MS);
      if (z.progress === 0) z.capturing = null;
    }
    if (z.owner) w.teamScore[z.owner] += (ZONE_POINTS_PER_SEC * dtMs) / 1000;
  }
}

export const MODES: Record<ModeId, ModeRules> = {
  FFA: {
    assignTeam: () => null,
    onKill: () => {},
    tick: () => {},
    winner: () => null,
  },
  TDM: {
    assignTeam: smallerTeam,
    onKill: (w, killer) => { if (killer.team) w.teamScore[killer.team] += 1; },
    tick: () => {},
    winner: (w) => teamAtLeast(w, WORLD.tdmWinScore),
  },
  DOM: {
    assignTeam: smallerTeam,
    onKill: () => {},
    tick: tickZones,
    winner: (w) => teamAtLeast(w, WORLD.domWinScore),
  },
};

function changeMap(w: World) {
  loadMap(w, nextMap(w.mode, w.map));
  for (const p of w.players.values()) {
    if (p.life.k !== 'alive') continue;
    const at = spawnPoint(w, p.team);
    p.x = at.x;
    p.y = at.y;
    p.life.dash = null;
  }
}

export function tickMatch(w: World, dtMs: number) {
  const rules = MODES[w.mode];
  if (w.now >= w.mapChangeAt) changeMap(w);
  if (w.match.k === 'over') {
    if (w.now < w.match.restartAt) return;
    w.match = { k: 'playing' };
    w.teamScore = { red: 0, blue: 0 };
    for (const z of w.zones) { z.owner = null; z.capturing = null; z.progress = 0; }
    for (const p of w.players.values()) { resetProgress(p); p.kills = 0; p.deaths = 0; }
    return;
  }
  rules.tick(w, dtMs);
  const winner = rules.winner(w);
  if (winner) {
    w.match = { k: 'over', winner, restartAt: w.now + WORLD.roundRestartMs };
    w.mapChangeAt = w.match.restartAt;
  }
}
