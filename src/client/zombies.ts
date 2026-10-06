import { BUILDING_KINDS, BUILDINGS, nightOf, SIDES, TURRET_KINDS, WORLD, ZOM, ZOMBIE_KINDS, ZOMBIES, type BuildingKind } from '../shared/defs.ts';
import type { BuildingView, PlayerView, RunReport, RunView, Snapshot, WallView } from '../shared/protocol.ts';
import { buildRefusal, cellOf, coreRectAt, refundFor, serviceTarget, type BuildRefusal, type BuildSite } from '../shared/sim/build.ts';
import { clock } from './derive.ts';

type Pose = { x: number; y: number };

export function phaseLine(run: Pick<RunView, 'phase' | 'night' | 'phaseEndsAt' | 'waveLeft' | 'report'>, serverNow: number | null): string {
  const left = run.phaseEndsAt === null || serverNow === null ? null : run.phaseEndsAt - serverNow;
  switch (run.phase) {
    case 'day': return `Day ${run.night}${left === null ? '' : ` · night in ${clock(left)}`}`;
    case 'night': return `Night ${run.night} · ${run.waveLeft} left`;
    case 'over': return `The Bastion ${run.report?.won ? 'held' : 'fell'}${left === null ? '' : ` · next run in ${clock(left)}`}`;
  }
}

const listOf = (xs: readonly string[]) => (xs.length < 2 ? xs.join('') : `${xs.slice(0, -1).join(', ')} and ${xs.at(-1)}`);

const sidesOf = (night: number) => {
  const from = nightOf(night).from;
  return from.length === SIDES.length ? 'every side' : `the ${listOf(from)}`;
};

/** What a night brings and from where, by the night table: the worst kinds first, so walkers come last. */
export function forecast(night: number): string {
  const def = nightOf(night);
  const kinds = listOf([...ZOMBIE_KINDS].reverse().filter((k) => def.horde[k]).map((k) => ZOMBIES[k].many));
  return `${kinds[0]!.toUpperCase()}${kinds.slice(1)} from ${sidesOf(night)}`;
}

/** The day's hint for N: how many of the squad's humans are ready for night, and whether you are. */
export function readyHint(run: Pick<RunView, 'ready'>, players: readonly Pick<PlayerView, 'id' | 'kind' | 'alive'>[], selfId: number): string {
  const humans = players.filter((p) => p.kind === 'human' && p.alive);
  const ready = humans.filter((p) => run.ready.includes(p.id)).length;
  if (!run.ready.includes(selfId)) return humans.length > 1 ? `ready for night · ${ready}/${humans.length}` : 'bring the night now';
  return `ready · ${ready}/${humans.length} · N to wait`;
}

export function downedLine(down: NonNullable<PlayerView['downed']>, serverNow: number | null): string {
  if (down.revive > 0) return `Being revived · ${Math.round(down.revive * 100)}%`;
  return `Crawl to a squadmate${serverNow === null ? '' : ` · ${clock(down.bleedOutAt - serverNow)}`}`;
}

const nameOf = (kind: BuildingKind) => BUILDINGS[kind].name.toLowerCase();

/** What holding E would do right now: revive first, else what `serviceTarget` names, the rule the server tends by. */
export function useHint(snap: Snapshot, at: Pose): string | null {
  const run = snap.run;
  if (!run || !snap.self.alive) return null;
  const down = snap.players.find((p) => p.id !== snap.self.id && p.downed && Math.hypot(p.x - at.x, p.y - at.y) <= ZOM.reviveRange);
  if (down) return `Hold E to revive ${down.name}`;
  if (run.scrap <= 0) return null;
  const target = serviceTarget(at, run.core, snap.buildings ?? []);
  return target && `Hold E to ${target.job} the ${target.on === 'core' ? 'Bastion' : nameOf(target.on.kind)}`;
}

export type RunCallout = { title: string; line: string; tone: 'night' | 'dawn' | 'warn' };
const NIGHT_WARNING_MS = 10_000;

/** The run's turning points between two snapshots; the fall has the report instead, timed on the server's clock (`prevAt`, `nextAt`). */
export function runCallouts(prev: RunView | undefined, next: RunView | undefined, prevAt: number, nextAt: number): RunCallout[] {
  if (!prev || !next) return [];
  const out: RunCallout[] = [];
  if (prev.phase === 'day' && next.phase === 'day' && prev.phaseEndsAt !== null && next.phaseEndsAt !== null
    && prev.phaseEndsAt - prevAt > NIGHT_WARNING_MS && next.phaseEndsAt - nextAt <= NIGHT_WARNING_MS) {
    out.push({ title: `Night falls in ${NIGHT_WARNING_MS / 1000}`, line: forecast(next.night), tone: 'warn' });
  }
  if (prev.phase === 'day' && next.phase === 'night') {
    out.push({ title: nightOf(next.night).name ?? `Night ${next.night}`, line: `${next.waveLeft} zombies from ${sidesOf(next.night)} · hold the Bastion`, tone: 'night' });
  }
  if (prev.phase === 'night' && next.phase === 'day') {
    const lost = next.lost ? `${next.lost} lost · ` : '';
    out.push({ title: 'Dawn', line: `Night ${prev.night} held · ${lost}${next.survivors} survivors · +${next.scrap - prev.scrap} scrap`, tone: 'dawn' });
    out.push({ title: 'Tonight', line: forecast(next.night), tone: 'warn' });
  }
  return out;
}

type ReportRow = { name: string; kills: number; revives: number; built: number; you: boolean };

/** The report's table: most kills first, then most revives, so the squad's carry tops it. */
export const reportRows = (report: RunReport, selfName: string | undefined): ReportRow[] =>
  [...report.players].sort((a, b) => b.kills - a.kills || b.revives - a.revives || b.built - a.built).map((p) => ({ ...p, you: p.name === selfName }));

export const reportTitle = (report: RunReport) =>
  report.won ? `The Bastion held. ${report.survivors} survivors saw the morning.` : `The Bastion fell on night ${report.night}`;

/** The kills of the squad's turrets and the Bastion's survivors, or null when they killed none. */
export function turretLine(report: RunReport): string | null {
  const kills = [...TURRET_KINDS.map((t) => [BUILDINGS[t].name, report.turretKills[t]] as const), ['Bastion', report.bastionKills] as const]
    .filter(([, n]) => n > 0).map(([name, n]) => `${name} ${n}`);
  return kills.length ? `Defense kills · ${kills.join(' · ')}` : null;
}

/** The card for a squad player out of the fight: bled out, back from the Bastion after `respawnIn` ms at the cost of survivors, or joined mid-night and back at dawn. */
export function outTillDawnText(run: Pick<RunView, 'phase' | 'waveLeft' | 'survivors'>, bledOut: boolean, respawnIn: number): { title: string; sub: string } {
  const sent = bledOut && run.phase === 'night' && run.survivors > ZOM.reinforce.survivors;
  return {
    title: bledOut ? 'You bled out' : 'The night is under way',
    sub: sent ? `The Bastion sends you back in ${Math.ceil(respawnIn / 1000)}s · ${ZOM.reinforce.survivors} survivors lost`
      : run.phase === 'night' ? `Back at dawn · ${run.waveLeft} zombies left tonight` : 'Back at dawn',
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

/** `taken` is what stands on the cell, since it decides the refund. */
function refusalText(refusal: BuildRefusal, kind: BuildingKind, taken: BuildingView | undefined): string {
  switch (refusal) {
    case 'notDay': return 'Build by day';
    case 'farFromCore': return 'Too far from the Bastion';
    case 'outOfReach': return 'Out of reach';
    case 'cover': return 'Blocked';
    case 'core': return 'That is the Bastion';
    case 'body': return 'Someone is in the way';
    case 'taken': return taken ? `Right click to take down the ${nameOf(taken.kind)} · +${refundFor(taken)}` : 'Blocked';
    case 'scrap': return `${BUILDINGS[kind].name} needs ${BUILDINGS[kind].cost} scrap`;
  }
}

/** `kind` is what build mode would put up. */
export type Ghost = { kind: BuildingKind; cx: number; cy: number; refusal: BuildRefusal | null; label: string };

export function ghostAt(site: BuildSite, kind: BuildingKind, at: Pose, worldSize: number): Ghost {
  const cell = cellOf(at.x, at.y), grid = worldSize / ZOM.cell;
  const cx = Math.min(grid - 1, Math.max(0, cell.cx)), cy = Math.min(grid - 1, Math.max(0, cell.cy));
  const refusal = buildRefusal(site, kind, cx, cy);
  const taken = site.buildings.find((b) => b.cx === cx && b.cy === cy);
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
