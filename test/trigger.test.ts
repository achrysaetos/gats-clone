/// <reference types="node" />
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GUNS } from '../src/shared/defs.ts';
import { parseClientMsg } from '../src/shared/protocol.ts';
import { respawn, step } from '../src/shared/sim.ts';
import { emptyWorld, press, run, spawnAt, TICK_MS } from './helpers.ts';

const ammoOf = (p: { life: { k: string; ammo?: number } }) => (p.life.k === 'alive' ? p.life.ammo! : -1);

test('presses released before the next input sample still fire on a semi-auto weapon', () => {
  const w = emptyWorld();
  const p = spawnAt(w, 500, 500);
  const start = ammoOf(p);
  for (let i = 1; i <= 6; i++) {
    press(w, p, { fire: false, shots: i });
    run(w, GUNS.pistol.fireMs + 20);
  }
  assert.equal(start - ammoOf(p), 6, 'every tap spaced past the cooldown fires');
});

test('six presses inside one sample on a ready semi-auto fire exactly the one shot the cooldown allows', () => {
  const w = emptyWorld();
  const p = spawnAt(w, 500, 500);
  const start = ammoOf(p);
  press(w, p, { fire: false, shots: 6 });
  run(w, GUNS.pistol.fireMs - 10);
  assert.equal(start - ammoOf(p), 1);
  run(w, 1000);
  assert.equal(start - ammoOf(p), 1, 'stale presses do not fire later on their own');
});

test('a press landing just before the cooldown ends fires as soon as the weapon is ready', () => {
  const w = emptyWorld();
  const p = spawnAt(w, 500, 500);
  const start = ammoOf(p);
  press(w, p, { shots: 1 });
  step(w, TICK_MS);
  run(w, GUNS.pistol.fireMs - 2 * TICK_MS);
  press(w, p, { shots: 2 });
  run(w, 3 * TICK_MS);
  assert.equal(start - ammoOf(p), 2);
});

test('a tap on an automatic weapon fires one shot; holding keeps firing', () => {
  const w = emptyWorld();
  const p = spawnAt(w, 500, 500, { loadout: { weapon: 'smg' } });
  const start = ammoOf(p);
  press(w, p, { fire: false, shots: 1 });
  run(w, 300);
  assert.equal(start - ammoOf(p), 1);
  press(w, p, { fire: true, shots: 2 });
  run(w, 10 * GUNS.smg.fireMs);
  assert.ok(start - ammoOf(p) >= 9, `held fire kept shooting (${start - ammoOf(p)} shots)`);
});

test('presses counted while dead do not fire after respawn', () => {
  const w = emptyWorld();
  const p = spawnAt(w, 500, 500);
  p.life = { k: 'dead', respawnAt: 0 };
  press(w, p, { shots: 3 });
  step(w, TICK_MS);
  assert.ok(respawn(w, p.id, p.loadout));
  const start = ammoOf(p);
  run(w, 500);
  assert.equal(ammoOf(p), start);
});

test('input parser keeps shots as a non-negative integer and defaults it when absent', () => {
  const input = { up: false, down: false, left: false, right: false, angle: 0, fire: false, reload: false, ability: false, aimDist: 0 };
  const parsed = (extra: object) => {
    const m = parseClientMsg(JSON.stringify({ t: 'input', seq: 1, input: { ...input, ...extra } }));
    return m?.t === 'input' ? m.input.shots : null;
  };
  assert.equal(parsed({ shots: 7 }), 7);
  assert.equal(parsed({ shots: 7.9 }), 7);
  assert.equal(parsed({ shots: -3 }), 0);
  assert.equal(parsed({}), 0);
  assert.equal(parsed({ shots: 'many' }), null);
});
