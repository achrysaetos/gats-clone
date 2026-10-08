/// <reference types="node" />
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { assembleInput } from '../src/client/input.ts';
import { NO_STICKS, dragStick, pressStick, releaseStick, touchAim, touchMoves } from '../src/client/touch.ts';
import { parseClientMsg } from '../src/shared/protocol.ts';

const W = 800;

test('left thumb moves, right thumb aims, and a second finger cannot steal a stick', () => {
  let s = pressStick(NO_STICKS, 1, 100, 400, W);
  s = pressStick(s, 2, 600, 400, W);
  s = pressStick(s, 3, 150, 300, W);
  assert.equal(s.move?.id, 1);
  assert.equal(s.aim?.id, 2);
  s = dragStick(s, 1, 160, 340);
  assert.deepEqual(touchMoves(s).sort(), ['right', 'up']);
});

test('aim stick fires only past the deadzone and points where it is pushed', () => {
  let s = pressStick(NO_STICKS, 7, 600, 400, W);
  s = dragStick(s, 7, 604, 400);
  assert.equal(touchAim(s), null, 'a resting thumb does not fire');
  s = dragStick(s, 7, 600, 460);
  const aim = touchAim(s)!;
  assert.ok(Math.abs(Math.atan2(aim.dy, aim.dx) - Math.PI / 2) < 1e-9, 'pushing down aims down');
  const msg = parseClientMsg(JSON.stringify({ t: 'input', seq: 1, input: assembleInput(new Set(touchMoves(s)), true, 1, aim) }));
  assert.equal(msg?.t, 'input', 'touch input survives the server parser');
});

test('lifting a finger releases only its own stick', () => {
  let s = pressStick(pressStick(NO_STICKS, 1, 100, 400, W), 2, 600, 400, W);
  s = releaseStick(s, 2);
  assert.equal(s.aim, null);
  assert.equal(s.move?.id, 1);
  assert.equal(releaseStick(s, 99), s, 'an unknown finger changes nothing');
});

test('a resting thumb on the move stick walks nowhere; a push past the deadzone walks', () => {
  let s = pressStick(NO_STICKS, 1, 100, 400, W);
  s = dragStick(s, 1, 103, 401);
  assert.deepEqual(touchMoves(s), [], 'a thumb that only settles is not a step');
  s = dragStick(s, 1, 160, 400);
  assert.deepEqual(touchMoves(s), ['right']);
});
