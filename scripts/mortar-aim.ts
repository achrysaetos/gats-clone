/// <reference types="node" />
// Usage: node scripts/mortar-aim.ts
// A mortar beside the core shells one zombie at a time marching in on the core from every side and range, and prints the share of shells
// whose blast caught the zombie it was fired at and the mean share of the blast's full damage it took.
import { BUILDINGS, ZOM, type ZombieKind } from '../src/shared/defs.ts';
import { MAPS } from '../src/shared/maps.ts';
import { step } from '../src/shared/sim.ts';
import { createWorld, newId } from '../src/shared/sim/world.ts';

const TICK_MS = 1000 / 30;
const core = MAPS.outpost.siege!.core;
const mortar = BUILDINGS.mortar.turret;

for (const kind of ['walker', 'plated', 'runner', 'brute'] as const satisfies readonly ZombieKind[]) {
  let shells = 0, hits = 0, share = 0;
  for (let i = 0; i < 16; i++) {
    const w = createWorld('ZOM', i + 1, 'outpost');
    w.run!.phase = { k: 'night', toSpawn: [], nextSpawnAt: Infinity, dawnAt: Infinity };
    w.run!.core.hp = 1e9;
    w.run!.bastionFireAt = Infinity;
    const cx = Math.floor(core.x / ZOM.cell) + 2, cy = Math.floor(core.y / ZOM.cell);
    w.buildings.push({ id: newId(w), kind: 'mortar', cx, cy, hp: 1e9, owner: -1, ammo: 1e9, nextFireAt: 0 });
    w.buildingsVersion++;
    const a = (i / 16) * 2 * Math.PI;
    const z = { id: newId(w), kind, x: core.x + Math.cos(a) * 900, y: core.y + Math.sin(a) * 900, hp: 1e9, attackAt: 0, vx: 0, vy: 0 };
    w.zombies.push(z);
    for (let t = 0; t < 30_000; t += TICK_MS) {
      const before = z.hp;
      const fired = w.bullets.filter((b) => b.turret === 'mortar').length;
      step(w, TICK_MS);
      if (w.bullets.filter((b) => b.turret === 'mortar').length > fired) shells++;
      const dealt = before - z.hp;
      if (dealt > 0) { hits++; share += dealt / mortar.lobbed!.damage; }
      if (Math.hypot(z.x - core.x, z.y - core.y) < ZOM.coreHalf + 60) break;
    }
  }
  console.log(`${kind}: ${shells} shells, ${(100 * hits / shells).toFixed(0)}% caught their target, mean ${(100 * share / shells).toFixed(0)}% of full blast per shell`);
}
