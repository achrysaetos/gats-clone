import assert from 'node:assert/strict';
import { test } from 'node:test';
import { WORLD } from '../src/shared/defs.ts';
import { step } from '../src/shared/sim.ts';
import { DOOR_THICK, swingArcAt } from '../src/shared/sim/doors.ts';
import { circleHitsRect } from '../src/shared/sim/movement.ts';
import { createWorld, rand, type World } from '../src/shared/sim/world.ts';
import { MAPS } from '../src/shared/maps.ts';
import { newBotMemory, type BotMemory } from '../src/server/bots.ts';
import { thinkBots } from '../src/server/bot/tick.ts';
import { press, run, spawnAt, TICK_MS } from './helpers.ts';

const R = WORLD.playerRadius;
const geoWorld = (): World => {
  const w = createWorld('FFA', 1, 'geo-test');
  w.crates = []; w.barrels = []; w.props = []; w.airdrops = { due: [], flight: null };
  return w;
};
// geo-test's `room-3`: a single swing leaf hinged at (3600, 525) in the room's south wall, 150 px long; the room lies north of it.
const ROOM_3 = () => MAPS['geo-test'].doors!.find((d) => d.id === 'room-3')!;
const IN_SWEEP = { x: 3545, y: 440 };

/** Two bots set to search almost the same spot just past room-3: one already stands on it, the other comes up from the south. */
function scene() {
  const w = geoWorld();
  const r = () => rand(w);
  const bots = new Map<number, BotMemory>();
  const search = (at: { x: number; y: number }) => ({ k: 'search' as const, at, giveUpAt: Infinity, since: 0, holdUntil: Infinity });
  const parked = spawnAt(w, IN_SWEEP.x, IN_SWEEP.y, { kind: 'bot', name: 'parked' });
  const pusher = spawnAt(w, 3540, 640, { kind: 'bot', name: 'pusher' });
  bots.set(parked.id, { ...newBotMemory(r), intent: search(IN_SWEEP) });
  bots.set(pusher.id, { ...newBotMemory(r), intent: search({ x: IN_SWEEP.x + 6, y: IN_SWEEP.y - 4 }) });
  return { w, r, bots, parked, pusher };
}

test('the search spot of the bot standing still lies in the door sweep (the scene this file is about)', () => {
  assert.ok(swingArcAt(ROOM_3(), -1, IN_SWEEP, R));
  assert.equal(swingArcAt(ROOM_3(), 1, IN_SWEEP, R), null, 'not when the leaf swings the other way');
});

test('a bot parked in a swing door sweep steps out, so the door a second bot pushes opens all the way and he gets through', () => {
  const { w, r, bots, parked, pusher } = scene();
  let widest = 0, through = false, stalled = 0, lastOpen = -1;
  for (let t = 0; t < 6000 / TICK_MS; t++) {
    thinkBots(w, bots, r, { respawn: false });
    step(w, TICK_MS);
    const d = w.doors.find((s) => s.id === 'room-3')!;
    widest = Math.max(widest, d.open);
    if (pusher.life.k === 'alive' && pusher.y < 500) through = true;
    // Held part open with someone pushing: the deadlock this guards against.
    stalled = d.open > 0 && d.open < 255 && d.open === lastOpen && d.target === 255 ? stalled + 1 : 0;
    lastOpen = d.open;
    assert.ok(stalled < 30, `room-3 held at ${d.open}/255 for a second (parked at ${parked.x.toFixed(0)},${parked.y.toFixed(0)}, pusher at ${pusher.x.toFixed(0)},${pusher.y.toFixed(0)})`);
  }
  assert.equal(widest, 255, 'the door swung wide open');
  assert.ok(through, 'the pusher got into the room');
});

test('a swing leaf all but shut is pushed round away from whoever pushes it, not back open into him', () => {
  const w = geoWorld();
  const d = w.doors.find((s) => s.id === 'room-3')!;
  const p = spawnAt(w, 3525, 700);
  press(w, p, { up: true });
  run(w, 1500);
  press(w, p, {});
  assert.equal(d.sign, -1, 'pushed open to the north');
  // It swings shut on its own; just before it does he walks up against the leaf from the north and pushes it south. Left
  // swinging north it would open into him and stop on him, every tick, for as long as he pushed.
  for (let i = 0; i < 300 && !(d.target === 0 && d.open <= 12); i++) run(w, TICK_MS);
  p.x = 3525; p.y = 525 - DOOR_THICK / 2 - R - 20;
  while (!w.walls.some((l) => l.door === 'room-3' && circleHitsRect(p.x, p.y + 0.5, R, l))) p.y += 0.5;
  press(w, p, { down: true });
  run(w, 1500);
  assert.equal(d.sign, 1, 'swung round to open south, away from him');
  assert.equal(d.open, 255);
  assert.ok(p.y > 560, `got through (${p.y.toFixed(0)})`);
});
