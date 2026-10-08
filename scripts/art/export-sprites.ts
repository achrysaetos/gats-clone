/// <reference types="node" />
// Usage: node scripts/art/export-sprites.ts <out.json>   Writes what the sprite bake needs: the catalog, the light, and the game's own shapes and colors.
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { COLORS, GUN_IDS, GUNS, WORLD, ZOMBIE_KINDS, ZOMBIES } from '../../src/shared/defs.ts';
import { ART } from '../../src/client/world/art.ts';
import { PX_PER_UNIT, SPRITES, TRAIN } from '../../src/client/world/catalog.ts';
import { KIT } from '../../src/shared/kit.ts';
import { ZOMBIE_LOOK } from '../../src/client/palette.ts';
import { TURRET_LOOK } from '../../src/client/siege.ts';
import { GUN_ATTACHMENTS, GUN_PARTS } from '../../src/client/sprites.ts';
import { cycleOf } from '../../src/client/reload.ts';

const out = process.argv[2];
if (!out) { console.error('usage: node scripts/art/export-sprites.ts <out.json>'); process.exit(2); }

const spec = {
  camera: ART.camera, sun: ART.sun, sky: ART.sky, render: ART.render, heights: ART.heights,
  pxPerUnit: PX_PER_UNIT,
  playerRadius: WORLD.playerRadius,
  teamColors: COLORS,
  sprites: SPRITES,
  guns: Object.fromEntries(GUN_IDS.map((id) => [id, { base: GUNS[id].base, stage: GUNS[id].stage, accent: GUNS[id].look.accent, hands: GUNS[id].look.hands ?? 1, cycle: cycleOf(id)?.kind ?? null, attachments: GUN_ATTACHMENTS[id], parts: GUN_PARTS[id] }])),
  zombies: Object.fromEntries(ZOMBIE_KINDS.map((k) => [k, { radius: ZOMBIES[k].radius, ...ZOMBIE_LOOK[k] }])),
  turrets: TURRET_LOOK,
  kit: Object.fromEntries(Object.entries(KIT).map(([id, d]) => [id, { w: d.w, h: d.h, height: d.height, overhead: !!('overhead' in d && d.overhead) }])),
  train: TRAIN,
};
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, JSON.stringify(spec, null, 1));
console.log(`wrote ${Object.keys(SPRITES).length} sprites to ${out}`);
