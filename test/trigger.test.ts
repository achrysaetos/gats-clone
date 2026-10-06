/// <reference types="node" />
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GUNS, PRESS_BUFFER_MS } from '../src/shared/defs.ts';
import { parseClientMsg } from '../src/shared/protocol.ts';
import { respawn, step } from '../src/shared/sim.ts';
import { emptyWorld, equip, press, run, spawnAt, TICK_MS } from './helpers.ts';

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

test('a press during the cooldown is held and fires once the weapon is ready; a second one adds nothing', () => {
  const w = emptyWorld();
  const p = spawnAt(w, 500, 500);
  const start = ammoOf(p);
  press(w, p, { shots: 1 });
  step(w, TICK_MS);
  press(w, p, { shots: 2 });
  run(w, 2 * TICK_MS);
  press(w, p, { shots: 3 });
  run(w, GUNS.pistol.fireMs);
  assert.equal(start - ammoOf(p), 2, 'the first press and one held press');
  run(w, 1000);
  assert.equal(start - ammoOf(p), 2, 'the held press fired once');
});

test('a press just before a reload ends fires on the fresh magazine; one made long before does nothing', () => {
  const early = emptyWorld();
  const a = spawnAt(early, 500, 500);
  if (a.life.k === 'alive') a.life.ammo = 0;
  run(early, GUNS.pistol.reloadMs / 2);
  assert.ok(a.life.k === 'alive' && a.life.reloadUntil !== null, 'reloading');
  press(early, a, { shots: 1 });
  run(early, GUNS.pistol.reloadMs / 2 + 1000);
  assert.equal(ammoOf(a), GUNS.pistol.mag, 'a click half a reload early is not saved for later');

  const late = emptyWorld();
  const b = spawnAt(late, 500, 500);
  if (b.life.k === 'alive') b.life.ammo = 0;
  run(late, GUNS.pistol.reloadMs - PRESS_BUFFER_MS / 2);
  assert.ok(b.life.k === 'alive' && b.life.reloadUntil !== null, 'still reloading');
  press(late, b, { shots: 1 });
  run(late, PRESS_BUFFER_MS + GUNS.pistol.fireMs);
  assert.equal(ammoOf(b), GUNS.pistol.mag - 1, 'a click just before the reload ends fires the first fresh round');
});

test('a sniper click long before the bolt is ready is dropped, not fired later on its own', () => {
  const w = emptyWorld();
  const p = spawnAt(w, 500, 500, { loadout: { weapon: 'sniper' } });
  const start = ammoOf(p);
  press(w, p, { shots: 1 });
  step(w, TICK_MS);
  run(w, 300);
  press(w, p, { shots: 2 });
  run(w, GUNS.sniper.fireMs + 500);
  assert.equal(start - ammoOf(p), 1, 'only the first shot fired; the early click did not fire after the cooldown');
});

test('a sniper click just before the bolt is ready fires as soon as it is', () => {
  const w = emptyWorld();
  const p = spawnAt(w, 500, 500, { loadout: { weapon: 'sniper' } });
  const start = ammoOf(p);
  press(w, p, { shots: 1 });
  step(w, TICK_MS);
  run(w, GUNS.sniper.fireMs - PRESS_BUFFER_MS / 2);
  press(w, p, { shots: 2 });
  run(w, PRESS_BUFFER_MS);
  assert.equal(start - ammoOf(p), 2);
});

test('a press early in a burst does not queue the next burst', () => {
  const w = emptyWorld();
  const p = spawnAt(w, 500, 500);
  equip(p, 'machinePistol');
  const start = ammoOf(p);
  press(w, p, { shots: 1 });
  step(w, TICK_MS);
  press(w, p, { shots: 2 });
  run(w, 2 * GUNS.machinePistol.fireMs);
  assert.equal(start - ammoOf(p), GUNS.machinePistol.burst!.count, 'one burst; the click during it was too early to keep');
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

test('a held automatic fires at its own rate, not rounded up to the tick', () => {
  const w = emptyWorld();
  const p = spawnAt(w, 500, 500, { loadout: { weapon: 'lmg' } });
  assert.notEqual(GUNS.lmg.fireMs % TICK_MS, 0, 'the interval falls between ticks');
  const start = ammoOf(p);
  press(w, p, { fire: true, shots: 1 });
  run(w, 3000);
  assert.ok(Math.abs(start - ammoOf(p) - 3000 / GUNS.lmg.fireMs) <= 1, `${start - ammoOf(p)} shots in 3s at ${GUNS.lmg.fireMs}ms`);
});
