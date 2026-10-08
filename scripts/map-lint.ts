/// <reference types="node" />
// Usage: node scripts/map-lint.ts
import { GUN_IDS, GUNS, WORLD } from '../src/shared/defs.ts';
import { MAP_IDS, MAPS, modesOn, type Center, type MapDef } from '../src/shared/maps.ts';
import { lintMap } from '../src/shared/maplint.ts';

const where = (p: Center) => `(${Math.round(p.x)}, ${Math.round(p.y)})`;

function sightlines(def: MapDef): { from: Center; to: Center; length: number }[] {
  const step = 50, lines: { from: Center; to: Center; length: number }[] = [];
  const inside = (p: Center) => p.x > 0 && p.y > 0 && p.x < def.size && p.y < def.size;
  const blocked = (p: Center) => def.walls.some((w) => p.x >= w.x && p.x <= w.x + w.w && p.y >= w.y && p.y <= w.y + w.h);
  const starts: { p: Center; d: Center }[] = [];
  for (let v = step / 2; v < def.size; v += step) {
    starts.push({ p: { x: 0.5, y: v }, d: { x: 1, y: 0 } }, { p: { x: v, y: 0.5 }, d: { x: 0, y: 1 } });
    starts.push({ p: { x: v, y: 0.5 }, d: { x: 1, y: 1 } }, { p: { x: 0.5, y: v }, d: { x: 1, y: 1 } });
    starts.push({ p: { x: v, y: 0.5 }, d: { x: -1, y: 1 } }, { p: { x: def.size - 0.5, y: v }, d: { x: -1, y: 1 } });
  }
  for (const { p, d } of starts) {
    const unit = step / Math.hypot(d.x, d.y) / Math.SQRT2;
    let from: Center | null = null, last = p;
    for (let q = p; inside(q); q = { x: q.x + d.x * unit, y: q.y + d.y * unit }) {
      if (blocked(q)) { if (from) lines.push({ from, to: last, length: Math.hypot(last.x - from.x, last.y - from.y) }); from = null; } else from ??= q;
      last = q;
    }
    if (from) lines.push({ from, to: last, length: Math.hypot(last.x - from.x, last.y - from.y) });
  }
  return lines;
}

const reach = Math.max(...GUN_IDS.map((g) => GUNS[g].range));
for (const id of MAP_IDS) {
  const problems = lintMap(MAPS[id], modesOn(id)).map((p) => p.text);
  console.log(problems.length ? `${id}: ${problems.length} problem(s)\n${problems.map((p) => `  ${p}`).join('\n')}` : `${id}: ok`);
  const lines = sightlines(MAPS[id]).sort((a, b) => b.length - a.length);
  const over = (min: number) => lines.filter((l) => l.length > min).length;
  const top = lines[0];
  if (top) console.log(`  longest sightline ${Math.round(top.length)}px ${where(top.from)} to ${where(top.to)}; ${over(reach)} lines past the longest gun (${reach}px), ${over(reach + WORLD.viewRadius)} past it plus the view (${reach + WORLD.viewRadius}px)`);
}
