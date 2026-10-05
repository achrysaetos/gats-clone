/// <reference types="node" />
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { COLORS } from '../src/shared/defs.ts';
import { TEAM_COLORS } from '../src/client/palette.ts';
import { bodyColor, mapWallsKey } from '../src/client/render.ts';
import type { WallView } from '../src/shared/protocol.ts';

test('team modes draw bodies in the team color, whatever color was picked', () => {
  assert.equal(bodyColor({ color: 'blue', team: 'red' }), TEAM_COLORS.red);
  assert.equal(bodyColor({ color: 'red', team: 'blue' }), TEAM_COLORS.blue);
});

test('free for all keeps the picked color', () => {
  assert.equal(bodyColor({ color: 'purple', team: null }), COLORS.purple);
});

test("the ground is keyed by the map's own walls, so an engineer's wall coming or going never rebakes it", () => {
  const long: WallView = { x: 0, y: 0, w: 100, h: 50, built: false, material: 'concrete' };
  const block: WallView = { x: 300, y: 0, w: 50, h: 50, built: false, material: 'sandstone' };
  const map = [long, block];
  const built: WallView = { x: 500, y: 500, w: 120, h: 40, built: true };
  const withBuilt: WallView[] = [...map, built];
  assert.equal(mapWallsKey(withBuilt), mapWallsKey([...map]));
  assert.notEqual(mapWallsKey([long, { ...block, material: 'planter' }]), mapWallsKey(map), 'a map wall changing rebakes');
  assert.notEqual(mapWallsKey([long]), mapWallsKey(map), 'a map wall going rebakes');
});
