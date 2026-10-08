/// <reference types="node" />
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { escapeAction, padIntent, takesInput, type EscapeContext } from '../src/client/pausegate.ts';

const ctx = (o: Partial<EscapeContext> = {}): EscapeContext => ({ inMatch: true, typing: false, pauseOpen: false, confirming: false, wheelOpen: false, rangeOpen: false, building: false, ...o });

test('input is taken only while playing, not typing, and not paused', () => {
  assert.equal(takesInput('playing', false, false), true);
  assert.equal(takesInput('playing', false, true), false);
  assert.equal(takesInput('playing', true, false), false);
  assert.equal(takesInput('dead', false, false), false);
  assert.equal(takesInput('menu', false, false), false);
  assert.equal(takesInput('reconnecting', false, false), false);
});

test('Escape with nothing open opens the pause menu; in the menu screens it does nothing here', () => {
  assert.equal(escapeAction(ctx()), 'open-pause');
  assert.equal(escapeAction(ctx({ inMatch: false })), 'none');
});

test('Escape closes the innermost thing first', () => {
  assert.equal(escapeAction(ctx({ typing: true, pauseOpen: true })), 'close-chat');
  assert.equal(escapeAction(ctx({ pauseOpen: true, confirming: true, wheelOpen: true })), 'cancel-leave');
  assert.equal(escapeAction(ctx({ pauseOpen: true, rangeOpen: true, building: true })), 'close-pause');
  assert.equal(escapeAction(ctx({ wheelOpen: true, rangeOpen: true, building: true })), 'close-wheel');
  assert.equal(escapeAction(ctx({ rangeOpen: true, building: true })), 'close-range');
  assert.equal(escapeAction(ctx({ building: true })), 'exit-build');
});

test('walking the whole stack out takes one Escape per layer, then the next opens the menu', () => {
  const c = ctx({ typing: false, pauseOpen: false, wheelOpen: true, rangeOpen: true, building: true });
  const seen: string[] = [];
  for (let i = 0; i < 6; i++) {
    const a = escapeAction(c);
    seen.push(a);
    if (a === 'close-wheel') c.wheelOpen = false;
    else if (a === 'close-range') c.rangeOpen = false;
    else if (a === 'exit-build') c.building = false;
    else if (a === 'open-pause') { c.pauseOpen = true; }
    else if (a === 'close-pause') c.pauseOpen = false;
  }
  assert.deepEqual(seen, ['close-wheel', 'close-range', 'exit-build', 'open-pause', 'close-pause', 'open-pause']);
});

test('gamepad: only fresh presses count, Start and B beat A, and the stick steps once per push', () => {
  const none = { buttons: Array(16).fill(false) as boolean[], x: 0, y: 0 };
  const press = (i: number) => ({ ...none, buttons: none.buttons.map((_, k) => k === i) });
  assert.equal(padIntent(none, press(0)), 'accept');
  assert.equal(padIntent(press(0), press(0)), null, 'a held button repeats nothing');
  assert.equal(padIntent(none, press(1)), 'back');
  assert.equal(padIntent(none, press(9)), 'start');
  assert.equal(padIntent(none, press(12)), 'up');
  assert.equal(padIntent(none, press(15)), 'right');
  assert.equal(padIntent(none, { ...none, y: 0.9 }), 'down');
  assert.equal(padIntent({ ...none, y: 0.9 }, { ...none, y: 0.95 }), null);
  assert.equal(padIntent(none, { ...none, x: -0.8 }), 'left');
  assert.equal(padIntent(null, none), null);
});
