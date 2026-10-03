/// <reference types="node" />
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { actionForKey, assembleInput, MAX_AIM_DIST, perkSlotForKey, type Action } from '../src/client/input.ts';
import { makeCamera, screenToWorld, worldToScreen } from '../src/client/camera.ts';
import { armorTier, feedMentions, killerOf, levelProgress, objectiveFor } from '../src/client/derive.ts';
import { WORLD } from '../src/shared/defs.ts';
import { parseClientMsg, type GameEvent } from '../src/shared/protocol.ts';

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
  const input = assembleInput(held, true, { dx: 0, dy: 300 });
  assert.deepEqual(input, {
    up: true, down: false, left: false, right: true,
    angle: Math.PI / 2, aimDist: 300, fire: true, reload: true, ability: false,
  });
});

test('assembled input survives the server parser unchanged, even with far aim', () => {
  const input = assembleInput(new Set<Action>(['ability']), false, { dx: -5000, dy: 0 });
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
});

test('killer lookup and kill-feed highlight go by player id, so same-named players never get confused', () => {
  const kill = (killer: string, killerId: number | null, victim: string, victimId: number): Extract<GameEvent, { e: 'kill' }> =>
    ({ e: 'kill', killer, killerId, victim, victimId, weapon: 'SMG' });
  const events = [kill('Ann', 5, 'Alex', 2), kill('Bo', 6, 'Alex', 3)];
  assert.equal(killerOf(events, 3), 'Bo', 'the second Alex was killed by Bo, not Ann');
  assert.equal(killerOf(events, 2), 'Ann');
  assert.equal(killerOf(events, 9), null);
  assert.equal(killerOf([kill('', null, 'Alex', 3)], 3), null, 'an environmental death has no killer name');
  assert.equal(feedMentions(events[0]!, 3), false, 'a kill of a different Alex is not highlighted for me');
  assert.equal(feedMentions(events[1]!, 3), true);
  assert.equal(feedMentions(events[1]!, 6), true, 'my own kills are highlighted');
});

// Defect: new players are not told their team or what wins, or the text drifts from the real win scores.
test('the objective names the mode, your team and the win condition from WORLD', () => {
  assert.equal(objectiveFor('FFA', null).banner, 'Free for all: most points wins');
  assert.equal(objectiveFor('TDM', 'red').banner, `Team Deathmatch: you are RED, first to ${WORLD.tdmWinScore} kills`);
  assert.equal(objectiveFor('DOM', 'blue').banner, `Domination: you are BLUE, hold A B C, first to ${WORLD.domWinScore}`);
  assert.equal(objectiveFor('TDM', 'blue').line, `TDM · Blue team · first to ${WORLD.tdmWinScore} kills`);
  assert.equal(objectiveFor('DOM', 'red').line, `DOM · Red team · hold A B C · first to ${WORLD.domWinScore}`);
});
