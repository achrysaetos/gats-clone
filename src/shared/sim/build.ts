import { BUILDINGS, ZOM, type BuildingKind } from '../defs.ts';
import { circleHitsRect, dist2, rectsOverlap, type Rect } from './movement.ts';

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
  buildings: readonly { kind: BuildingKind; cx: number; cy: number }[];
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
  const cell = cellRect(cx, cy);
  if (site.cover.some((r) => rectsOverlap(r, cell))) return 'cover';
  if (rectsOverlap(core, cell)) return 'core';
  if (site.bodies.some((b) => circleHitsRect(b.x, b.y, b.r, cell))) return 'body';
  if (site.buildings.some((b) => b.cx === cx && b.cy === cy)) return 'taken';
  if (site.scrap < BUILDINGS[kind].cost) return 'scrap';
  return null;
}
