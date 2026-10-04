/// <reference types="node" />
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { COLORS } from '../src/shared/defs.ts';
import { TEAM_COLORS } from '../src/client/palette.ts';
import { bodyColor } from '../src/client/render.ts';

test('team modes draw bodies in the team color, whatever color was picked', () => {
  assert.equal(bodyColor({ color: 'blue', team: 'red' }), TEAM_COLORS.red);
  assert.equal(bodyColor({ color: 'red', team: 'blue' }), TEAM_COLORS.blue);
});

test('free for all keeps the picked color', () => {
  assert.equal(bodyColor({ color: 'purple', team: null }), COLORS.purple);
});
