import type { PropKind } from './defs.ts';
import type { Center, MapDef, MapWall, WallMaterial } from './maps.ts';
import type { Rect } from './sim/movement.ts';

const MAP_CELL = 50;

type Layer = WallMaterial | 'red' | 'blue' | 'ffa';
type Cell = { layers: readonly Layer[]; crate: boolean; zone: boolean; barrel?: boolean; prop?: PropKind };

const FLOOR: Cell = { layers: [], crate: false, zone: false };
const LEGEND: Record<string, Cell> = {
  '.': FLOOR,
  '#': { ...FLOOR, layers: ['concrete'] },
  S: { ...FLOOR, layers: ['sandstone'] },
  P: { ...FLOOR, layers: ['planter'] },
  c: { ...FLOOR, crate: true },
  /** An explosive barrel. */
  b: { ...FLOOR, barrel: true },
  /** The other props: propane tank, gas canister, generator (electrical box), oil drum, streetlamp, medical cabinet, ammo crate, paint can. */
  p: { ...FLOOR, prop: 'propane' },
  g: { ...FLOOR, prop: 'gas' },
  e: { ...FLOOR, prop: 'generator' },
  o: { ...FLOOR, prop: 'oil' },
  l: { ...FLOOR, prop: 'lamp' },
  m: { ...FLOOR, prop: 'medic' },
  a: { ...FLOOR, prop: 'ammo' },
  i: { ...FLOOR, prop: 'paint' },
  R: { ...FLOOR, layers: ['red'] },
  F: { ...FLOOR, layers: ['ffa'] },
  X: { ...FLOOR, layers: ['red', 'ffa'] },
  A: { ...FLOOR, zone: true },
};
const turned = (l: Layer): Layer => (l === 'red' ? 'blue' : l);

function gridRows(text: string): string[] {
  const lines = text.split('\n').map((l) => l.trimEnd());
  while (lines.length && lines[0] === '') lines.shift();
  while (lines.length && lines.at(-1) === '') lines.pop();
  const indent = Math.min(...lines.filter((l) => l !== '').map((l) => l.length - l.trimStart().length));
  return lines.map((l) => l.slice(indent));
}

function mergeCells(on: readonly boolean[][]): Rect[] {
  const h = on.length, w = on[0]?.length ?? 0;
  const used = on.map((row) => row.map(() => false));
  const free = (x: number, y: number) => x >= 0 && x < w && on[y]![x]! && !used[y]![x]!;
  const rects: Rect[] = [];
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (!free(x, y)) continue;
      let x1 = x;
      while (free(x1 + 1, y)) x1++;
      let y1 = y;
      const sameRun = (row: number) => !free(x - 1, row) && !free(x1 + 1, row) && Array.from({ length: x1 - x + 1 }, (_, i) => free(x + i, row)).every(Boolean);
      while (y1 + 1 < h && sameRun(y1 + 1)) y1++;
      for (let yy = y; yy <= y1; yy++) for (let xx = x; xx <= x1; xx++) used[yy]![xx] = true;
      rects.push({ x: x * MAP_CELL, y: y * MAP_CELL, w: (x1 - x + 1) * MAP_CELL, h: (y1 - y + 1) * MAP_CELL });
    }
  }
  return rects;
}

export function gridMap(name: string, text: string): MapDef {
  const rows = gridRows(text);
  const cols = rows[0]?.length ?? 0;
  if (rows.some((r) => r.length !== cols)) throw new Error(`${name}: rows are not all ${cols} wide`);
  if (cols === 0 || rows.length !== 2 * cols) throw new Error(`${name}: the west half is ${cols}x${rows.length}; it must be twice as tall as it is wide`);
  const half = rows.map((row, r) => [...row].map((ch, c) => {
    const cell = LEGEND[ch];
    if (!cell) throw new Error(`${name}: unknown cell '${ch}' at column ${c}, row ${r}`);
    return cell;
  }));
  const zoneCells = half.flatMap((row, r) => row.flatMap((cell, c) => (cell.zone ? [{ c, r }] : [])));
  if (zoneCells.length !== 1) throw new Error(`${name}: needs exactly one A, found ${zoneCells.length}`);

  const width = 2 * cols, height = rows.length, size = height * MAP_CELL;
  const layerAt = (layer: Layer) => Array.from({ length: height }, (_, y) => Array.from({ length: width }, (_, x) =>
    x < cols ? half[y]![x]!.layers.includes(layer) : half[height - 1 - y]![width - 1 - x]!.layers.some((l) => turned(l) === layer)));
  const center = (c: number, r: number): Center => ({ x: (c + 0.5) * MAP_CELL, y: (r + 0.5) * MAP_CELL });
  const turn = (p: Center): Center => ({ x: size - p.x, y: size - p.y });
  const walls = (material: WallMaterial): MapWall[] => mergeCells(layerAt(material)).map((r) => ({ ...r, material }));
  const westCrates = half.flatMap((row, r) => row.flatMap((cell, c) => (cell.crate ? [center(c, r)] : [])));
  const westBarrels = half.flatMap((row, r) => row.flatMap((cell, c) => (cell.barrel ? [center(c, r)] : [])));
  const westProps = half.flatMap((row, r) => row.flatMap((cell, c) => (cell.prop ? [{ ...center(c, r), kind: cell.prop }] : [])));
  const zoneA = center(zoneCells[0]!.c, zoneCells[0]!.r);
  return {
    name,
    size,
    walls: [...walls('concrete'), ...walls('sandstone'), ...walls('planter')],
    zones: [zoneA, { x: size / 2, y: size / 2 }, turn(zoneA)],
    spawns: { red: mergeCells(layerAt('red')), blue: mergeCells(layerAt('blue')), ffa: mergeCells(layerAt('ffa')) },
    crates: [...westCrates, ...westCrates.map(turn)],
    barrels: [...westBarrels, ...westBarrels.map(turn)],
    props: [...westProps, ...westProps.map((p) => ({ ...turn(p), kind: p.kind }))],
  };
}
