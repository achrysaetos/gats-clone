/// <reference types="node" />
// Usage: node scripts/art/export-maps.ts <out.json>
// Writes what the light-layer bake reads: the shared look, and for every map its placed pieces (turned footprints, heights,
// whether each is overhead or breaks), its floor paint, and the lights it bakes (those that do not pulse).
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { MAP_IDS, MAPS } from '../../src/shared/maps.ts';
import { KIT, placed } from '../../src/shared/kit.ts';
import { layoutKey } from '../../src/client/world/layout.ts';
import { ART, MAP_FLOOR } from '../../src/client/world/art.ts';

const out = process.argv[2];
if (!out) { console.error('usage: node scripts/art/export-maps.ts <out.json>'); process.exit(2); }

const maps = MAP_IDS.map((id) => {
  const m = MAPS[id];
  return {
    id, name: m.name, size: m.size, light: m.light, floor: MAP_FLOOR[id] ?? 'concrete', key: layoutKey(m.walls),
    pieces: m.pieces.map((at) => {
      const def = KIT[at.p];
      return { p: at.p, r: at.r, w: def.w, h: def.h, foot: placed(at).foot, height: def.height, overhead: 'overhead' in def, breaks: 'breaks' in def };
    }),
    marks: m.marks,
    lights: m.lights.filter((l) => l.pulseMs === undefined),
  };
});
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, JSON.stringify({ ...ART, maps }, null, 1));
console.log(`wrote ${maps.length} maps to ${out}`);
