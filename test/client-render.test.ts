/// <reference types="node" />
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { COLORS } from '../src/shared/defs.ts';
import { bodyColor, TEAM_COLORS } from '../src/client/render.ts';

// Defect: in TDM and DOM a red-team player who picked blue was drawn blue, reading as an enemy to teammates.
test('team modes draw bodies in the team color, whatever color was picked', () => {
  assert.equal(bodyColor({ color: 'blue', team: 'red' }), TEAM_COLORS.red);
  assert.equal(bodyColor({ color: 'red', team: 'blue' }), TEAM_COLORS.blue);
});

// Defect: forcing team colors everywhere would erase the loadout color in FFA.
test('free for all keeps the picked color', () => {
  assert.equal(bodyColor({ color: 'purple', team: null }), COLORS.purple);
});
