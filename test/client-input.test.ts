/// <reference types="node" />
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { actionForKey, assembleInput, MAX_AIM_DIST, perkSlotForKey, type Action } from '../src/client/input.ts';
import { makeCamera, screenToWorld, worldToScreen } from '../src/client/camera.ts';
import { armorTier, killerOf, levelProgress } from '../src/client/derive.ts';
import { parseClientMsg } from '../src/shared/protocol.ts';

test('WASD and arrows map to the same movement; unknown and prototype keys map to nothing', () => {
  assert.deepEqual(['KeyW', 'KeyA', 'KeyS', 'KeyD'].map(actionForKey), ['up', 'left', 'down', 'right']);
  assert.deepEqual(['ArrowUp', 'ArrowLeft', 'ArrowDown', 'ArrowRight'].map(actionForKey), ['up', 'left', 'down', 'right']);
  assert.equal(actionForKey('KeyR'), 'reload');
  assert.equal(actionForKey('Space'), 'ability');
  assert.equal(actionForKey('KeyQ'), null);
  assert.equal(actionForKey('toString'), null);
});

test('digit keys pick perk slots 0-9 with 0 as the tenth', () => {
  assert.equal(perkSlotForKey('Digit1'), 0);
  assert.equal(perkSlotForKey('Digit9'), 8);
  assert.equal(perkSlotForKey('Digit0'), 9);
  assert.equal(perkSlotForKey('KeyW'), null);
});

test('input carries held actions, fire, and aim angle/distance', () => {
  const held = new Set<Action>(['up', 'right', 'reload']);
  const input = assembleInput(held, true, 4, { dx: 0, dy: 300 });
  assert.deepEqual(input, {
    up: true, down: false, left: false, right: true,
    angle: Math.PI / 2, aimDist: 300, fire: true, shots: 4, reload: true, ability: false,
  });
});

test('assembled input survives the server parser unchanged, even with far aim', () => {
  const input = assembleInput(new Set<Action>(['ability']), false, 0, { dx: -5000, dy: 0 });
  assert.equal(input.aimDist, MAX_AIM_DIST);
  const parsed = parseClientMsg(JSON.stringify({ t: 'input', seq: 7, input }));
  assert.deepEqual(parsed, { t: 'input', seq: 7, input });
});

test('aim from screen space converts to world units through the camera', () => {
  const cam = makeCamera({ x: 500, y: 500 }, 1800, 900, 900);
  assert.equal(cam.scale, 1);
  const self = worldToScreen(cam, { x: 500, y: 500 });
  assert.deepEqual(self, { x: 900, y: 450 });
  const zoomed = makeCamera({ x: 0, y: 0 }, 900, 400, 900);
  const mouseWorld = screenToWorld(zoomed, { x: 450 + 100, y: 200 });
  assert.equal(mouseWorld.x, 200);
});

test('level progress tracks thresholds and caps at max level', () => {
  assert.deepEqual(levelProgress(0), { level: 1, frac: 0, nextAt: 100 });
  assert.deepEqual(levelProgress(200), { level: 2, frac: 0.5, nextAt: 300 });
  assert.deepEqual(levelProgress(5000), { level: 4, frac: 1, nextAt: null });
});

test('armor tier and killer derive from snapshot data', () => {
  assert.equal(armorTier(0), 'none');
  assert.equal(armorTier(60), 'medium');
  assert.equal(armorTier(90), 'heavy');
  const events = [{ e: 'hit' as const, x: 0, y: 0 }, { e: 'kill' as const, killer: 'Ann', victim: 'Bo', weapon: 'SMG' }];
  assert.equal(killerOf(events, 'Bo'), 'Ann');
  assert.equal(killerOf(events, 'Cy'), null);
});
