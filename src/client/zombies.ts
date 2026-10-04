import { WORLD, ZOMBIE_KINDS, ZOMBIES } from '../shared/defs.ts';
import type { Snapshot, WallView } from '../shared/protocol.ts';
import { coreRectAt, type BuildSite } from '../shared/sim/build.ts';

type Pose = { x: number; y: number };

/** The wall rules' view of the world from one snapshot, with the builder where the client draws them. */
export function buildSiteOf(snap: Snapshot, walls: readonly WallView[], builder: Pose): BuildSite | null {
  const run = snap.run;
  if (!run) return null;
  const me = snap.players.find((p) => p.id === snap.self.id);
  const bodies = [
    ...snap.players.filter((p) => p.alive || p.downed).map((p) => ({ x: p.id === snap.self.id ? builder.x : p.x, y: p.id === snap.self.id ? builder.y : p.y, r: WORLD.playerRadius })),
    ...(snap.zombies ?? []).map(([, kind, x, y]) => ({ x, y, r: ZOMBIES[ZOMBIE_KINDS[kind] ?? 'walker'].radius })),
  ];
  return {
    day: run.phase === 'day',
    builder: me?.alive ? builder : null,
    core: coreRectAt(run.core),
    cover: [...walls, ...snap.crates.map((c) => ({ x: c.x, y: c.y, w: c.size, h: c.size }))],
    bodies,
    walls: snap.buildings ?? [],
    scrap: run.scrap,
  };
}
