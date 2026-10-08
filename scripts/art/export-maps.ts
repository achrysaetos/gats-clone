/// <reference types="node" />
// Usage: node scripts/art/export-maps.ts <out.json>
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { MAP_IDS, MAPS, ZONE_RADIUS } from '../../src/shared/maps.ts';
import { placed } from '../../src/shared/kit.ts';
import { layoutKey } from '../../src/client/world/layout.ts';
import { ART } from '../../src/client/world/art.ts';

const out = process.argv[2];
if (!out) { console.error('usage: node scripts/art/export-maps.ts <out.json>'); process.exit(2); }

const maps = MAP_IDS.map((id) => {
  const m = MAPS[id];
  return {
    id, name: m.name, size: m.size, key: layoutKey(m.walls),
    walls: m.walls.map(({ x, y, w, h, material }) => ({ x, y, w, h, material })),
    zones: m.zones.map((z) => ({ ...z, r: ZONE_RADIUS })),
    spawns: m.spawns,
    crates: m.breakables.map((at) => { const { x, y, w } = placed(at).foot; return { x, y, size: w }; }),
    core: m.siege?.core ?? null,
  };
});
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, JSON.stringify({ ...ART, maps }, null, 1));
console.log(`wrote ${maps.length} maps to ${out}`);
