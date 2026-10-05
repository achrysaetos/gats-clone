import { BUILDING_KINDS, BUILDINGS, TURRET_KINDS, WORLD, ZOM, ZOMBIE_KINDS, ZOMBIES, type BuildingKind } from '../shared/defs.ts';
import type { PlayerView, RunReport, RunView, Snapshot, WallView } from '../shared/protocol.ts';
import { buildRefusal, cellOf, coreRectAt, type BuildRefusal, type BuildSite } from '../shared/sim/build.ts';
import { clock } from './derive.ts';

type Pose = { x: number; y: number };

export function phaseLine(run: Pick<RunView, 'phase' | 'night' | 'phaseEndsAt' | 'waveLeft'>, serverNow: number | null): string {
  const left = run.phaseEndsAt === null || serverNow === null ? null : run.phaseEndsAt - serverNow;
  switch (run.phase) {
    case 'day': return `Day ${run.night}${left === null ? '' : ` · night in ${clock(left)}`}`;
    case 'night': return `Night ${run.night} · ${run.waveLeft} left`;
    case 'over': return `Core fell${left === null ? '' : ` · next run in ${clock(left)}`}`;
  }
}

export function downedLine(down: NonNullable<PlayerView['downed']>, serverNow: number | null): string {
  if (down.revive > 0) return `Being revived · ${Math.round(down.revive * 100)}%`;
  return `Crawl to a squadmate${serverNow === null ? '' : ` · ${clock(down.bleedOutAt - serverNow)}`}`;
}

const nameOf = (kind: BuildingKind) => BUILDINGS[kind].name.toLowerCase();

/** What holding E would do right now, by the same rules the server follows: revive first, else mend the nearest worn building or core in reach, or reload the nearest turret short of ammo; a worn turret is mended first. */
export function useHint(snap: Snapshot, at: Pose): string | null {
  const run = snap.run;
  if (!run || !snap.self.alive) return null;
  const down = snap.players.find((p) => p.id !== snap.self.id && p.downed && Math.hypot(p.x - at.x, p.y - at.y) <= ZOM.reviveRange);
  if (down) return `Hold E to revive ${down.name}`;
  if (run.scrap <= 0) return null;
  const jobs = [
    ...(snap.buildings ?? []).flatMap((b) => {
      const job = b.hp < 10 ? `repair the ${nameOf(b.kind)}` : b.kind !== 'wall' && b.ammo < 10 ? `reload the ${nameOf(b.kind)}` : null;
      return job ? [{ job, d: Math.hypot((b.cx + 0.5) * ZOM.cell - at.x, (b.cy + 0.5) * ZOM.cell - at.y) }] : [];
    }),
    ...(run.core.hp < run.core.maxHp ? [{ job: 'repair the core', d: Math.hypot(run.core.x - at.x, run.core.y - at.y) }] : []),
  ].filter((m) => m.d <= ZOM.reachPx);
  const nearest = jobs.reduce<(typeof jobs)[number] | null>((a, b) => (a && a.d <= b.d ? a : b), null);
  return nearest && `Hold E to ${nearest.job}`;
}

export type RunCallout = { title: string; line: string; tone: 'night' | 'dawn' | 'warn' };
const NIGHT_WARNING_MS = 10_000;

/** The run's turning points between two snapshots; the fall has the report instead, timed on the server's clock (`prevAt`, `nextAt`). */
export function runCallouts(prev: RunView | undefined, next: RunView | undefined, prevAt: number, nextAt: number): RunCallout[] {
  if (!prev || !next) return [];
  const out: RunCallout[] = [];
  if (prev.phase === 'day' && next.phase === 'day' && prev.phaseEndsAt !== null && next.phaseEndsAt !== null
    && prev.phaseEndsAt - prevAt > NIGHT_WARNING_MS && next.phaseEndsAt - nextAt <= NIGHT_WARNING_MS) {
    out.push({ title: `Night falls in ${NIGHT_WARNING_MS / 1000}`, line: 'Finish your walls and get by the core', tone: 'warn' });
  }
  if (prev.phase === 'day' && next.phase === 'night') out.push({ title: `Night ${next.night}`, line: `${next.waveLeft} zombies are coming · hold the core`, tone: 'night' });
  if (prev.phase === 'night' && next.phase === 'day') {
    const core = Math.round((100 * next.core.hp) / next.core.maxHp);
    out.push({ title: 'Dawn', line: `Night ${prev.night} held · core ${core}% · ${next.scrap} scrap to build with`, tone: 'dawn' });
  }
  return out;
}

type ReportRow = { name: string; kills: number; revives: number; built: number; you: boolean };

/** The report's table: most kills first, then most revives, so the squad's carry tops it. */
export const reportRows = (report: RunReport, selfName: string | undefined): ReportRow[] =>
  [...report.players].sort((a, b) => b.kills - a.kills || b.revives - a.revives || b.built - a.built).map((p) => ({ ...p, you: p.name === selfName }));

export const reportTitle = (report: RunReport) => `The core fell on night ${report.night}`;

/** The squad's turrets' kills, or null when they killed none. */
export function turretLine(report: RunReport): string | null {
  const kills = TURRET_KINDS.filter((t) => report.turretKills[t] > 0).map((t) => `${BUILDINGS[t].name} ${report.turretKills[t]}`);
  return kills.length ? `Turret kills · ${kills.join(' · ')}` : null;
}

/** The card for a squad player out of the fight until dawn: bled out, or joined while the night was under way. */
export function outTillDawnText(run: Pick<RunView, 'phase' | 'waveLeft'>, bledOut: boolean): { title: string; sub: string } {
  return {
    title: bledOut ? 'You bled out' : 'The night is under way',
    sub: run.phase === 'night' ? `Back at dawn · ${run.waveLeft} zombies left tonight` : 'Back at dawn',
  };
}

/** The wall rules' view of the world from one snapshot, with the builder where the client draws them. */
export function buildSiteOf(snap: Snapshot, walls: readonly WallView[], builder: Pose): BuildSite | null {
  const run = snap.run;
  if (!run) return null;
  const me = snap.players.find((p) => p.id === snap.self.id);
  const bodies = [
    ...snap.players.filter((p) => p.alive || p.downed).map((p) => ({ x: p.id === snap.self.id ? builder.x : p.x, y: p.id === snap.self.id ? builder.y : p.y, r: WORLD.playerRadius })),
    ...(snap.zombies ?? []).map(([, kind, x, y]) => ({ x, y, r: ZOMBIES[ZOMBIE_KINDS[kind]].radius })),
  ];
  return {
    day: run.phase === 'day',
    builder: me?.alive ? builder : null,
    core: coreRectAt(run.core),
    cover: [...walls, ...snap.crates.map((c) => ({ x: c.x, y: c.y, w: c.size, h: c.size }))],
    bodies,
    buildings: snap.buildings ?? [],
    scrap: run.scrap,
  };
}

export const refundOf = (kind: BuildingKind) => Math.floor(BUILDINGS[kind].cost * ZOM.demolishRefund);

/** `taken` names what stands on the cell, since that decides the refund. */
function refusalText(refusal: BuildRefusal, kind: BuildingKind, taken: BuildingKind | undefined): string {
  switch (refusal) {
    case 'notDay': return 'Build by day';
    case 'farFromCore': return 'Too far from the core';
    case 'outOfReach': return 'Out of reach';
    case 'cover': return 'Blocked';
    case 'core': return 'That is the core';
    case 'body': return 'Someone is in the way';
    case 'taken': return `Right click to take down the ${nameOf(taken ?? 'wall')} · +${refundOf(taken ?? 'wall')}`;
    case 'scrap': return `${BUILDINGS[kind].name} needs ${BUILDINGS[kind].cost} scrap`;
  }
}

/** `kind` is what build mode would put up. */
export type Ghost = { kind: BuildingKind; cx: number; cy: number; refusal: BuildRefusal | null; label: string };

const GRID = WORLD.size / ZOM.cell;

export function ghostAt(site: BuildSite, kind: BuildingKind, at: Pose): Ghost {
  const cell = cellOf(at.x, at.y);
  const cx = Math.min(GRID - 1, Math.max(0, cell.cx)), cy = Math.min(GRID - 1, Math.max(0, cell.cy));
  const refusal = buildRefusal(site, kind, cx, cy);
  const taken = site.buildings.find((b) => b.cx === cx && b.cy === cy)?.kind;
  return { kind, cx, cy, refusal, label: refusal ? refusalText(refusal, kind, taken) : `${BUILDINGS[kind].name} · ${BUILDINGS[kind].cost} scrap` };
}

/** Build mode's hint bar: a chip per kind, which its number key or a click on it selects, then the clicks. */
export const BUILD_HINTS: readonly { key: string; what: string; pick?: BuildingKind }[] = [
  ...BUILDING_KINDS.map((kind, i) => ({ key: `${i + 1}`, what: `${BUILDINGS[kind].name} ${BUILDINGS[kind].cost}`, pick: kind })),
  { key: 'Left click', what: 'build' },
  { key: 'Right click', what: 'take down' },
  { key: 'B', what: 'done' },
];

/** In build mode the number keys pick what to put up, in BUILDING_KINDS order from 1. */
export const buildKindForKey = (code: string): BuildingKind | null => BUILDING_KINDS.find((_, i) => code === `Digit${i + 1}`) ?? null;

const SQUAD_CODE = /^z-[a-z2-7]{6}$/;

/** A squad code from an invite link, or null when there is none; `bad` when the link carries a code that cannot exist. */
export function squadFromSearch(search: string): string | null | 'bad' {
  const code = new URLSearchParams(search).get('squad');
  if (code === null) return null;
  return SQUAD_CODE.test(code) ? code : 'bad';
}

export function withSquad(href: string, code: string | null): string {
  const url = new URL(href);
  if (code === null) url.searchParams.delete('squad');
  else url.searchParams.set('squad', code);
  return url.toString();
}

export const inviteLink = (href: string, code: string): string => {
  const url = new URL(href);
  return `${url.origin}${url.pathname}?squad=${code}`;
};
