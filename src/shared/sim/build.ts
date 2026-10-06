import { BUILDINGS, ZOM, type BuildingKind } from '../defs.ts';
import type { BuildingView } from '../protocol.ts';
import { circleHitsRect, dist2, rectsOverlap, type Rect } from './movement.ts';
import type { Building } from './world.ts';

/** Why a building cannot go up, or null once it may. */
export type BuildRefusal = 'notDay' | 'farFromCore' | 'outOfReach' | 'cover' | 'core' | 'body' | 'taken' | 'scrap';

type Pose = { x: number; y: number };

/** Everything the building rules look at. The server fills it from the world and the client from its snapshot, so the build preview judges a cell exactly as the server will. */
export type BuildSite = {
  day: boolean;
  /** Null unless the builder is up. */
  builder: Pose | null;
  core: Rect;
  cover: readonly Rect[];
  /** Squad players not dead, downed included, and zombies. */
  bodies: readonly (Pose & { r: number })[];
  buildings: readonly BuildingView[];
  scrap: number;
};

export const cellRect = (cx: number, cy: number): Rect => ({ x: cx * ZOM.cell, y: cy * ZOM.cell, w: ZOM.cell, h: ZOM.cell });
export const cellOf = (x: number, y: number) => ({ cx: Math.floor(x / ZOM.cell), cy: Math.floor(y / ZOM.cell) });
export const coreRectAt = (center: Pose): Rect => ({ x: center.x - ZOM.coreHalf, y: center.y - ZOM.coreHalf, w: ZOM.coreHalf * 2, h: ZOM.coreHalf * 2 });

export function buildRefusal(site: BuildSite, kind: BuildingKind, cx: number, cy: number): BuildRefusal | null {
  if (!site.day || !site.builder) return 'notDay';
  const at = { x: (cx + 0.5) * ZOM.cell, y: (cy + 0.5) * ZOM.cell };
  const { core } = site;
  if (dist2(at.x, at.y, core.x + core.w / 2, core.y + core.h / 2) > ZOM.buildRadius ** 2) return 'farFromCore';
  if (dist2(at.x, at.y, site.builder.x, site.builder.y) > ZOM.reachPx ** 2) return 'outOfReach';
  // Before bodies, so a building with someone pressed against it still offers to come down.
  if (site.buildings.some((b) => b.cx === cx && b.cy === cy)) return 'taken';
  const cell = cellRect(cx, cy);
  if (site.cover.some((r) => rectsOverlap(r, cell))) return 'cover';
  if (rectsOverlap(core, cell)) return 'core';
  if (site.bodies.some((b) => circleHitsRect(b.x, b.y, b.r, cell))) return 'body';
  if (site.scrap < BUILDINGS[kind].cost) return 'scrap';
  return null;
}

/** Tenths of whole, 1 to 10, where 10 means whole: anything short of whole reads 9 or less, so a rule judging tenths judges what the server holds. */
export const tenths = (v: number, max: number) => (v >= max ? 10 : Math.min(9, Math.max(1, Math.ceil((v / max) * 10))));
/** A turret's load in tenths, 10 when full and 0 once it cannot fire. */
const loadTenths = (ammo: number, max: number) => (Math.floor(ammo) < 1 ? 0 : tenths(Math.floor(ammo), max));

export function buildingView(b: Building): BuildingView {
  const at = { cx: b.cx, cy: b.cy, hp: tenths(b.hp, BUILDINGS[b.kind].hp) };
  return b.kind === 'wall' ? { ...at, kind: b.kind } : { ...at, kind: b.kind, ammo: loadTenths(b.ammo, BUILDINGS[b.kind].turret.ammo) };
}

/** Repair costs a share of what the building cost new for the share of it that is worn, so mending always beats tearing down and building again. */
export const repairScrapPerHp = (kind: BuildingKind) => (BUILDINGS[kind].cost / BUILDINGS[kind].hp) * ZOM.repairShare;
/** Taking a building down pays back part of its cost for what is left of it, by the tenths everyone sees. */
export const refundFor = (b: Pick<BuildingView, 'kind' | 'hp'>) => Math.floor(BUILDINGS[b.kind].cost * ZOM.demolishRefund * (b.hp / 10));

export type CoreView = Pose & { hp: number; maxHp: number };
export type ServiceJob<B> = { job: 'repair' | 'reload'; on: B | 'core' };

/**
 * What holding use at `at` tends: the nearest worn building or worn core in reach, or the nearest turret short of a full load, a worn turret mended before it is reloaded.
 * The server tends by it and the client's hint names it, both from the same views.
 */
export function serviceTarget<B extends BuildingView>(at: Pose, core: CoreView, buildings: readonly B[]): ServiceJob<B> | null {
  let on: B | 'core' | null = null, bestD = ZOM.reachPx ** 2;
  const coreD = dist2(at.x, at.y, core.x, core.y);
  if (core.hp < core.maxHp && coreD <= bestD) { on = 'core'; bestD = coreD; }
  for (const b of buildings) {
    if (b.hp >= 10 && (b.kind === 'wall' || b.ammo >= 10)) continue;
    const d = dist2(at.x, at.y, (b.cx + 0.5) * ZOM.cell, (b.cy + 0.5) * ZOM.cell);
    if (d <= bestD) { on = b; bestD = d; }
  }
  return on && { on, job: on !== 'core' && on.hp >= 10 ? 'reload' : 'repair' };
}
