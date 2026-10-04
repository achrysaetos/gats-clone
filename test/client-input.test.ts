/// <reference types="node" />
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { actionForKey, assembleInput, MAX_AIM_DIST, perkSlotForKey, type Action } from '../src/client/input.ts';
import { makeCamera, screenToWorld, worldToScreen } from '../src/client/camera.ts';
import { deathText, feedMentions, killOf, levelProgress, objectiveFor } from '../src/client/derive.ts';
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
  assert.deepEqual(parsed, { t: 'input', seq: 7, input, viewAt: null });
});

test('aim from screen space converts to world units through the camera', () => {
  const cam = makeCamera({ x: 500, y: 500 }, 1800, 1012.5, 900);
  assert.equal(cam.scale, 1, 'a 16:9 screen 1800 px wide shows exactly the 1800-unit view width');
  assert.deepEqual(worldToScreen(cam, { x: 500, y: 500 }), { x: 900, y: 506.25 });
  const zoomed = makeCamera({ x: 0, y: 0 }, 900, 506.25, 900);
  assert.equal(screenToWorld(zoomed, { x: 450 + 100, y: 253 }).x, 200, 'half the pixels per unit doubles the world offset');
});

test('the camera shows the view radius across and only the height the screen shape allows', () => {
  const R = WORLD.viewRadius;
  const shown = (w: number, h: number) => {
    const cam = makeCamera({ x: 0, y: 0 }, w, h, R);
    const corner = screenToWorld(cam, { x: w, y: h });
    return { screen: [Math.round(corner.x), Math.round(corner.y)], world: [Math.round(cam.viewHalfW), Math.round(cam.viewHalfH)] };
  };
  assert.deepEqual(shown(1280, 800), { screen: [R, 563], world: [R, 563] }, '16:10 fills the screen with no bars at the original zoom');
  assert.deepEqual(shown(1920, 1080), { screen: [R, 506], world: [R, 506] }, '16:9 fills the screen with no bars');
  assert.deepEqual(shown(2560, 1080), { screen: [1200, 506], world: [R, 506] }, 'ultrawide is letterboxed to 16:9 at the sides');
  assert.deepEqual(shown(800, 1280), { screen: [R, 1440], world: [R, R] }, 'portrait fits the width and letterboxes top and bottom');
});

test('level progress tracks thresholds and caps at max level', () => {
  assert.deepEqual(levelProgress(0, 0), { displayLevel: 1, frac: 0, nextAt: 100 });
  assert.deepEqual(levelProgress(1, 150), { displayLevel: 2, frac: 0.5, nextAt: 200 });
  assert.deepEqual(levelProgress(5, 5000), { displayLevel: 6, frac: 1, nextAt: null });
});


test('killer lookup and kill-feed highlight go by player id, so same-named players never get confused', () => {
  const kill = (killer: string, killerId: number | null, victim: string, victimId: number): Extract<GameEvent, { e: 'kill' }> =>
    ({ e: 'kill', killer, killerId, victim, victimId, weapon: 'SMG', bounty: false, assisters: [] });
  const events = [kill('Ann', 5, 'Alex', 2), kill('Bo', 6, 'Alex', 3)];
  assert.equal(killOf(events, 3)?.killer, 'Bo', 'the second Alex was killed by Bo, not Ann');
  assert.equal(killOf(events, 2)?.killer, 'Ann');
  assert.equal(killOf(events, 9), null);
  assert.equal(deathText(killOf([kill('', null, 'Alex', 3)], 3), null).title, 'You were eliminated', 'an environmental death names no killer');
  assert.equal(feedMentions(events[0]!, 3), false, 'a kill of a different Alex is not highlighted for me');
  assert.equal(feedMentions(events[1]!, 3), true);
  assert.equal(feedMentions(events[1]!, 6), true, 'my own kills are highlighted');
});

test('the objective names the mode, your team and the win condition from WORLD', () => {
  assert.equal(objectiveFor('FFA', null).banner, `Free for all: first to ${WORLD.ffaWinKills} kills`);
  assert.equal(objectiveFor('TDM', 'red').banner, `Team Deathmatch: you are RED, first to ${WORLD.tdmWinScore} kills`);
  assert.equal(objectiveFor('DOM', 'blue').banner, `Domination: you are BLUE, hold A B C, first to ${WORLD.domWinScore}`);
  assert.equal(objectiveFor('TDM', 'blue').line, `TDM · Blue team · first to ${WORLD.tdmWinScore} kills`);
  assert.equal(objectiveFor('DOM', 'red').line, `DOM · Red team · hold A B C · first to ${WORLD.domWinScore}`);
});
