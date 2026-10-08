/// <reference types="node" />
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MAPS } from '../src/shared/maps.ts';
import type { InputState } from '../src/shared/protocol.ts';
import { setInput, step } from '../src/shared/sim.ts';
import { effectiveStats } from '../src/shared/sim/stats.ts';
import { snapshotFor } from '../src/shared/sim/snapshot.ts';
import { IDLE_INPUT } from '../src/shared/sim/world.ts';
import { NO_FIRING, settle, stepTrigger } from '../src/client/fire.ts';
import { NO_PREDICTION, predictAbility, predictInput, reconcile, selfMotion, type Prediction } from '../src/client/predict.ts';
import { emptyWorld, equip, grantPerks, spawnAt, TICK_MS } from './helpers.ts';

/**
 * The sim keeps no sprint while a dash runs (`life.dash === null && sprintWanted`), so a dash out of a sprint ends the sprint
 * at its first tick and starts the raise there. The page's trigger must see the same, or it holds back a shot the server fires.
 */
test('a dash out of a sprint starts the raise where the sim does, so the page fires on the same input', () => {
  const w = emptyWorld();
  const p = spawnAt(w, 500, 500);
  grantPerks(w, p, ['extended', 'thickSkin', 'dash']);
  equip(p, 'pistol');
  const { mag, reloadMs } = effectiveStats(p);
  let t = settle(NO_FIRING, { gun: 'pistol', mag, reloadMs, ammo: mag, reloading: false, reloadFrac: 0, alive: true, armed: true }, 0, 0, []).firing.trigger;
  const first = snapshotFor(w, p.id);
  let pred: Prediction = reconcile(NO_PREDICTION, selfMotion(first).at, 0, [], selfMotion(first).speed, MAPS[w.map].size);
  // Sprint, dash out of it, let go of Shift mid-dash, then press the trigger while the gun is still coming up.
  const run: Partial<InputState>[] = [
    ...Array(10).fill({ right: true, sprint: true }),
    { right: true, sprint: true, ability: true },
    ...Array(2).fill({ right: true, sprint: true }),
    ...Array(16).fill({ right: true }),
    ...Array(20).fill({ right: true, shots: 1 }),
  ];
  const sim: number[] = [], page: number[] = [];
  run.forEach((partial, i) => {
    const seq = i + 1;
    const input = { ...IDLE_INPUT, ...partial };
    const latest = snapshotFor(w, p.id);
    pred = predictInput(pred, { seq, input, dtMs: TICK_MS, ability: predictAbility(pred, input, latest) }, [], selfMotion(latest).speed, seq * TICK_MS, MAPS[w.map].size);
    // The prediction notes on each pending input whether a dash ran as it was taken; the page's trigger reads that.
    const dashing = !!pred.pending.at(-1)!.dashing;
    setInput(w, p.id, seq, input);
    step(w, TICK_MS);
    if (w.events.some((e) => e.e === 'shot' && e.owner === p.id)) sim.push(seq);
    const pulled = stepTrigger(t, { ...input, dashing }, w.now);
    t = pulled.t;
    if (pulled.fired) page.push(seq);
    if (p.life.k === 'alive') assert.equal(t.sprint, p.life.sprint, `sprint after input ${seq}`);
  });
  assert.equal(sim.length, 1, 'the sim fired the press once the gun was up');
  assert.deepEqual(page, sim);
});

test('a reconcile notes again which pending inputs a dash runs through, from the server\'s motion', () => {
  const input = { ...IDLE_INPUT, right: true, sprint: true };
  const pending = [1, 2, 3, 4, 5, 6, 7, 8, 9].map((seq) => ({ seq, input, dtMs: TICK_MS, ability: null, dashing: false }));
  const pred: Prediction = { ...NO_PREDICTION, pending, afterNewest: { x: 500, y: 500, dash: null }, beforeNewest: { x: 500, y: 500 } };
  // The server has a dash with 100 ms to run as of input 2: inputs 3 to 5 are taken while it runs, 6 on are not.
  const r = reconcile(pred, { x: 500, y: 500, dash: { dirX: 1, dirY: 0, leftMs: 100 } }, 2, [], 300, MAPS.plaza.size);
  assert.deepEqual(r.pending.map((p) => [p.seq, p.dashing]), [[3, true], [4, true], [5, true], [6, false], [7, false], [8, false], [9, false]]);
});
