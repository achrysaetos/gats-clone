/// <reference types="node" />
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { SOLDIER } from '../src/client/world/catalog.ts';
import { actionTravel, legsOf, magIn, reloadFrame, torsoOf, type TorsoInput } from '../src/client/world/pose.ts';
import { addRemains, fallOf, gunAt, liveRemains, remainsAlpha, REMAINS_CAP, REMAINS_LIFE_MS, type Remains } from '../src/client/remains.ts';

const torso = (over: Partial<TorsoInput>) => torsoOf({ gun: 'assault', now: 0, id: 1, reload: null, kick: 0, hit: null, move: null, moving: true, ...over });

test('a magazine reload changes frame on its beats: the magazine leaves on magOut and seats on magIn', () => {
  assert.equal(reloadFrame('mag', 0.13), SOLDIER.act.reload.mag[0]);
  assert.equal(reloadFrame('mag', 0.14), SOLDIER.act.reload.mag[1]);
  assert.equal(reloadFrame('mag', 0.99), SOLDIER.act.reload.mag[5]);
  assert.deepEqual([magIn('mag', 0.13), magIn('mag', 0.14), magIn('mag', 0.57), magIn('mag', 0.58), magIn('mag', null)], [true, false, false, true, true]);
  assert.equal(magIn('pump', 0.5), true, 'a shotgun keeps its tube');
});

test('a flinch shows over a reload, a reload over recoil, and the heavy guns use the heavy recoil frames', () => {
  assert.deepEqual(torso({ reload: 0.5, hit: { ms: 20, front: true } }), { sprite: 'soldier.act', frame: SOLDIER.act.flinchFront[0] });
  assert.deepEqual(torso({ reload: 0.5, hit: { ms: 150, front: false } }), { sprite: 'soldier.act', frame: SOLDIER.act.flinchBack[1] });
  assert.equal(torso({ reload: 0.5, kick: 1 }).sprite, 'soldier.act');
  assert.deepEqual(torso({ kick: 1, gun: 'shotgun' }), { sprite: 'soldier', frame: SOLDIER.torso.recoilHeavy[0] });
  assert.deepEqual(torso({ kick: 1, gun: 'smg' }), { sprite: 'soldier', frame: SOLDIER.torso.recoilLight[0] });
  assert.deepEqual(torso({}), { sprite: 'soldier', frame: SOLDIER.torso.aim });
  assert.deepEqual(torso({ move: { kind: 'knife', ms: 250 } }), { sprite: 'soldier.act', frame: SOLDIER.act.knife[2] });
});

test('side-stepping faces the aim and plays the strafe one way for left and the other for right', () => {
  const st = (heading: number, phase: number) => ({ x: 0, y: 0, at: 0, heading, phase, moving: true });
  const left = legsOf(st(-Math.PI / 2, 0.25), 0, null), right = legsOf(st(Math.PI / 2, 0.25), 0, null);
  assert.equal(left.heading, 0, 'faces the aim');
  assert.equal(left.frame, SOLDIER.legs.strafe[2]);
  assert.equal(right.frame, SOLDIER.legs.strafe[6], 'stepping right plays it backwards');
  assert.deepEqual(legsOf(st(0, 0), 0, 100), { heading: 0, frame: SOLDIER.legs.dash[1] }, 'a dash shows its own frames');
});

test('a pump is worked after each shotgun blast and on the reload pump beat; a rifle has no action to work', () => {
  assert.equal(actionTravel('shotgun', 0, null), 0);
  assert.equal(actionTravel('shotgun', 260, null), 5, 'fully back at the cycle time');
  assert.equal(actionTravel('shotgun', null, 0.86), 5, 'on the reload pump beat');
  assert.equal(actionTravel('sniper', 420, null), 3.5);
  assert.equal(actionTravel('assault', 260, 0.86), 0);
});

const remains = (id: number, born: number): Omit<Remains, 'ends'> => ({ id, x: 0, y: 0, turn: 0, fall: 'back', color: '#f00', armor: 'none', gun: 'smg', born, blow: 0, spin: 1 });

test('a blow from in front throws a body back, from behind folds it forward, and a blast spins it', () => {
  assert.deepEqual(fallOf(Math.PI, 0, false), { fall: 'back', turn: 2 * Math.PI });
  assert.equal(fallOf(0, 0, false).fall, 'forward');
  assert.equal(fallOf(0, 0, true).fall, 'spin');
});

test('bodies stay for their life, and past the cap the oldest fade out early', () => {
  let list: Remains[] = [];
  for (let i = 0; i < REMAINS_CAP + 3; i++) list = addRemains(list, remains(i, i * 10));
  const now = (REMAINS_CAP + 2) * 10;
  assert.equal(liveRemains(list, now + 3000).length, REMAINS_CAP, 'the three oldest are gone once their fade ends');
  assert.equal(remainsAlpha(list.at(-1)!, now + 3000), 1, 'the newest is whole');
  assert.equal(liveRemains(list, now + REMAINS_LIFE_MS + 1).length, 0, 'none outlives its life');
  const g = gunAt(list[0]!, 5000);
  assert.ok(!g.moving && g.x > 10, 'the gun skidded along the blow and came to rest');
});
