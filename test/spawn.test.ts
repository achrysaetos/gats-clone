/// <reference types="node" />
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { addPlayer, removePlayer } from '../src/shared/sim.ts';
import { PISTOL, emptyWorld, spawnAt } from './helpers.ts';

for (const mode of ['FFA', 'TDM'] as const) {
  test(`${mode}: a fresh spawn keeps clear of living enemies`, () => {
    const w = emptyWorld(mode);
    const enemy = spawnAt(w, 1500, 1500, { team: mode === 'TDM' ? 'red' : null });
    for (let i = 0; i < 60; i++) {
      const p = addPlayer(w, `s${i}`, PISTOL, { team: mode === 'TDM' ? 'blue' : undefined });
      const d = Math.hypot(p.x - enemy.x, p.y - enemy.y);
      assert.ok(d >= 400, `spawn ${i} landed ${d.toFixed(0)} from an enemy`);
      removePlayer(w, p.id);
    }
  });
}
