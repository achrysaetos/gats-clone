/// <reference types="node" />
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addTrauma, decay, MAX_SHAKE_PX, offset, traumaFor } from '../src/client/shake.ts';
import type { SoundCue, SoundId } from '../src/client/sfx.ts';

const cue = (o: Partial<Extract<SoundCue, { id: Exclude<SoundId, 'hurt'> }>>): SoundCue => ({ id: 'hit', x: 0, y: 0, self: false, gain: 1, ...o });
const hurt = (damageFrac: number): SoundCue => ({ id: 'hurt', x: 0, y: 0, self: true, gain: 1, damageFrac });
const me = { x: 0, y: 0 };

test('trauma never exceeds 1 or drops below 0, and the shake never exceeds MAX_SHAKE_PX', () => {
  let t = 0;
  for (let i = 0; i < 20; i++) t = addTrauma(t, 0.4);
  assert.equal(t, 1);
  assert.equal(addTrauma(0.2, -5), 0);
  let worst = 0;
  for (let now = 0; now < 20000; now += 7) { const o = offset(1, now); worst = Math.max(worst, Math.hypot(o.x, o.y)); }
  assert.ok(worst <= MAX_SHAKE_PX && worst > MAX_SHAKE_PX * 0.5, `peak offset ${worst}px`);
});

test('trauma decays to exactly zero and then the camera is still', () => {
  let t = 1;
  for (let i = 0; i < 120; i++) t = decay(t, 16);
  assert.equal(t, 0);
  const o = offset(t, 1234);
  assert.equal(Math.hypot(o.x, o.y), 0);
  assert.ok(decay(0.5, 16) < 0.5, 'decays every frame');
});

test('bigger hits and closer booms shake harder; distant booms and other players\' shots do not', () => {
  assert.ok(traumaFor(hurt(0.8), me, 900) > traumaFor(hurt(0.1), me, 900));
  assert.ok(traumaFor(cue({ id: 'boom', x: 100 }), me, 900) > traumaFor(cue({ id: 'boom', x: 700 }), me, 900));
  assert.equal(traumaFor(cue({ id: 'boom', x: 1000 }), me, 900), 0, 'a boom off screen does not shake');
  assert.equal(traumaFor(cue({ id: 'shot:sniper', self: false }), me, 900), 0, 'someone else firing does not kick your camera');
  const kick = traumaFor(cue({ id: 'shot:pistol', self: true }), me, 900);
  assert.ok(kick > 0 && kick < traumaFor(hurt(0), me, 900), 'firing kicks, less than being hit');
});
