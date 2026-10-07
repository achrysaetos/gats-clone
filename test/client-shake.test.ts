/// <reference types="node" />
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addKick, addTrauma, decay, heftOf, MAX_SHAKE_PX, offset, RECOIL_KICK, settleKick, traumaFor } from '../src/client/shake.ts';
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
  assert.ok(traumaFor(cue({ id: 'shot:shotgun', self: true }), me, 900) > traumaFor(cue({ id: 'shot:pistol', self: true }), me, 900), 'a heavier gun kicks harder');
});

test('a grenade shakes harder the closer it lands, and a big blast harder than a small pop', () => {
  const boom = (x: number, r: number) => traumaFor(cue({ id: 'boom', x, r }), me, 900);
  assert.ok(boom(30, 160) > boom(250, 160) && boom(250, 160) > boom(600, 160), 'closer shakes harder');
  assert.ok(boom(30, 160) - boom(250, 160) > boom(250, 160) - boom(450, 160), 'and climbs steeply near you');
  assert.ok(boom(200, 160) > boom(200, 90) && boom(200, 90) > boom(200, 40), 'a grenade over a frag over a crate');
  assert.ok(boom(700, 160) > 0, 'a grenade across the screen still nudges slightly');
  assert.equal(boom(900, 160), 0, 'one past the edge of the view does not');
});

test('big guns recoil: the camera shoves back along the aim, more for heavier guns, and settles', () => {
  assert.ok(heftOf('sniper') > heftOf('handCannon') && heftOf('handCannon') > heftOf('pistol'));
  assert.ok(heftOf('shotgun') > heftOf('smg') && heftOf('juggernaut') > heftOf('assault'));
  const rightward = addKick({ x: 0, y: 0 }, 'sniper', 0);
  assert.ok(rightward.x < 0 && Math.abs(rightward.y) < 1e-9, 'firing right shoves the camera left');
  assert.ok(Math.abs(addKick({ x: 0, y: 0 }, 'smg', 0).x) < 1, 'an SMG barely kicks');
  let k = { x: 0, y: 0 };
  for (let i = 0; i < 50; i++) k = addKick(k, 'minigun', 0);
  assert.ok(Math.hypot(k.x, k.y) <= RECOIL_KICK.maxPx + 1e-9, 'a held trigger never shoves past the cap');
  for (let i = 0; i < 60; i++) k = settleKick(k, 16);
  assert.deepEqual(k, { x: 0, y: 0 }, 'and it settles back');
});

test('a held minigun rumbles but never pins the shake at full', () => {
  let t = 0;
  for (let i = 0; i < 60; i++) t = decay(addTrauma(t, traumaFor(cue({ id: 'shot:minigun', self: true }), me, 900)), 33);
  assert.ok(t > 0 && t < 0.5, `trauma ${t}`);
});
