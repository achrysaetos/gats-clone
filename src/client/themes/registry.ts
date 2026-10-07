import { MAPS, type MapDef, type ThemeId } from '../../shared/maps.ts';
import type { MapDoor, MapPoly, MapRoof } from '../../shared/geom.ts';
import type { DoorLeaf } from '../../shared/sim/doors.ts';
import type { FloorPlan } from '../floor.ts';
import type { GeoInfo } from '../geoart.ts';
import type { Solid, SolidKind } from '../tilt.ts';

/**
 * Per-map themes: a map names a `theme` id and the client dresses it from here. A theme is a handful of optional hooks, all
 * of them called from one small place each (floor.ts paintFloor, tilt.ts paintSolids, render.ts drawWorld), so a map with no
 * theme costs nothing and the shared files stay free of per-map code. Themes register themselves from `themes/index.ts`.
 */
export type ThemeView = { x0: number; y0: number; x1: number; y1: number };
export type Theme = {
  /** How dark the map's own night is (0..1, the zombie night's shade at 1): a night map lights itself with lanterns and neon. */
  night?: number;
  /** Paints the whole baked floor (the ground layer): replaces the default slabs, markings and litter. */
  floor?: (g: CanvasRenderingContext2D, size: number, seed: number, plan: FloorPlan) => void;
  /** Wall kinds this theme owns, each painted whole (front face, top, details, outline) once per solid into the sprite cache. */
  walls?: Partial<Record<SolidKind, (ctx: CanvasRenderingContext2D, s: Solid) => void>>;
  /** Drawn every frame straight over the baked floor, under every wall, shadow and body: animated water, ship decks. */
  ground?: (ctx: CanvasRenderingContext2D, now: number, view: ThemeView, map: MapDef) => void;
  /** Drawn every frame right after the walls and before bodies: animated water, lamp pools, steam, drips. */
  under?: (ctx: CanvasRenderingContext2D, now: number, view: ThemeView, map: MapDef) => void;
  /** The least dusk (0..1) this map always wears, so its lamps and cool shade show by day too. */
  dusk?: number;
  /** Drawn every frame over bodies and effects, under the night shade: things hung above the players. */
  over?: (ctx: CanvasRenderingContext2D, now: number, view: ThemeView, map: MapDef, bodies: readonly { x: number; y: number }[]) => void;
  /** Map geometry (docs/maps/GEOMETRY.md). Each hook returns true when it drew the thing, false or nothing to get the generic extruded look. */
  /** Paints one polygon of `map.polys` (its footprint, and the front face hanging below its south edges). */
  drawPoly?: (ctx: CanvasRenderingContext2D, poly: MapPoly, info: GeoInfo) => boolean | void;
  /** Paints a whole group of polygons (a plane's fuselage, wings and tail) as one object. Runs before `drawPoly`. */
  drawSetPiece?: (ctx: CanvasRenderingContext2D, group: readonly MapPoly[], info: GeoInfo) => boolean | void;
  /** Paints a door: `leaves` are its solid pieces right now, `open` is 0 (shut) to 1. */
  door?: (ctx: CanvasRenderingContext2D, door: MapDoor, leaves: readonly DoorLeaf[], open: number, info: GeoInfo) => boolean | void;
  /** Paints a roof at `alpha` (already fading); the context's globalAlpha is set to it. */
  roof?: (ctx: CanvasRenderingContext2D, roof: MapRoof, alpha: number, info: GeoInfo) => boolean | void;
};

const themes = new Map<ThemeId, Theme>();
const painters = new Map<SolidKind, (ctx: CanvasRenderingContext2D, s: Solid) => void>();

export function registerTheme(id: ThemeId, theme: Theme): void {
  themes.set(id, theme);
  for (const [kind, paint] of Object.entries(theme.walls ?? {})) painters.set(kind as SolidKind, paint!);
}

export const themeOf = (id: ThemeId | undefined): Theme | undefined => (id ? themes.get(id) : undefined);

/** The map a snapshot names (by id or display name). */
export function mapOf(idOrName: string): MapDef | undefined {
  const maps = MAPS as Record<string, MapDef>;
  return maps[idOrName] ?? Object.values(maps).find((m) => m.name === idOrName);
}

export const themeOfMap = (idOrName: string): Theme | undefined => themeOf(mapOf(idOrName)?.theme);

/** Paints every solid whose kind a theme owns and returns the rest for the standard painter. */
export function paintThemedSolids(ctx: CanvasRenderingContext2D, solids: readonly Solid[]): readonly Solid[] {
  if (!painters.size) return solids;
  let rest: Solid[] | null = null;
  for (const [i, s] of solids.entries()) {
    const paint = painters.get(s.kind);
    if (!paint) { rest?.push(s); continue; }
    rest ??= solids.slice(0, i);
    paint(ctx, s);
  }
  return rest ?? solids;
}
