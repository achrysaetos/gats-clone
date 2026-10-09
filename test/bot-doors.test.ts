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

/** geo-test's room-3 held wide open into the hall's corridor: its leaf then stands from the hinge (3600, 525) up to y 375, across the corridor's south half. */
function leafAcrossCorridor() {
  const w = geoWorld();
  const s = w.doors.find((d) => d.id === 'room-3')!;
  s.sign = -1; s.target = 255; s.closeAt = Infinity;
  run(w, 1500);
  assert.equal(s.open, 255, 'the leaf stands wide open');
  const leaf = () => w.walls.filter((l) => l.door === 'room-3');
  return { w, s, leaf };
}

test('a bot whose way runs along a wall through an open swing leaf goes round the leaf, not into it', () => {
  const { w, s, leaf } = leafAcrossCorridor();
  const r = () => rand(w);
  const goal = { x: 3850, y: 465 };
  const bot = spawnAt(w, 3350, 465, { kind: 'bot', name: 'walker' });
  assert.ok(leaf().some((l) => l.x < 3610 && l.x + l.w > 3590 && l.y < 465 && l.y + l.h > 465), 'the leaf stands across the line from the bot to its goal');
  const bots = new Map<number, BotMemory>([[bot.id, { ...newBotMemory(r), intent: { k: 'search', at: goal, giveUpAt: Infinity, since: 0, holdUntil: Infinity } }]]);
  let rubbing = 0, worst = 0, arrived = -1;
  for (let t = 0; t < 5000 / TICK_MS && arrived < 0; t++) {
    thinkBots(w, bots, r, { respawn: false });
    step(w, TICK_MS);
    rubbing = leaf().some((l) => circleHitsRect(bot.x, bot.y, R + 2, l)) ? rubbing + 1 : 0;
    worst = Math.max(worst, rubbing);
    if (Math.hypot(bot.x - goal.x, bot.y - goal.y) < 30) arrived = t;
  }
  assert.ok(arrived >= 0, `got past the leaf to its goal (at ${bot.x.toFixed(0)},${bot.y.toFixed(0)})`);
  assert.ok(worst <= 3, `brushed the leaf at most in passing (${worst} ticks in a row against it)`);
  assert.equal(s.open, 255, 'and never held the leaf up');
});

test('a bot never shuffles against a swing leaf standing open across a corridor, whichever way it crosses it', () => {
  // A bot sent back and forth along the corridor past the leaf, between spots all round it, is never pressed against the leaf for long.
  const { w, leaf } = leafAcrossCorridor();
  const r = () => rand(w);
  // Spots out of the leaf's sweep (a bot is never sent into one, see `clearOfSwings`), on both sides of it, the straight way between each two through the leaf.
  const spots = [{ x: 3400, y: 470 }, { x: 3800, y: 470 }, { x: 3420, y: 420 }, { x: 3780, y: 440 }, { x: 3500, y: 300 }, { x: 3410, y: 480 }, { x: 3790, y: 410 }, { x: 3700, y: 300 }];
  const bots = new Map<number, BotMemory>();
  const legs = new Map<number, number>();
  const p = spawnAt(w, spots[0]!.x, spots[0]!.y, { kind: 'bot', name: 'walker' });
  bots.set(p.id, newBotMemory(r));
  legs.set(p.id, 1);
  let visits = 0;
  const against = new Map<number, number>();
  let worst = 0;
  for (let t = 0; t < 12_000 / TICK_MS; t++) {
    for (const [id, mem] of bots) {
      const p = w.players.get(id)!, at = spots[legs.get(id)! % spots.length]!;
      if (Math.hypot(p.x - at.x, p.y - at.y) < 30) { legs.set(id, legs.get(id)! + 1); visits++; }
      const to = spots[legs.get(id)! % spots.length]!;
      if (mem.intent?.k !== 'search' || mem.intent.at !== to) bots.set(id, { ...mem, intent: { k: 'search', at: to, giveUpAt: Infinity, since: 0, holdUntil: Infinity } });
    }
    thinkBots(w, bots, r, { respawn: false });
    step(w, TICK_MS);
    for (const id of bots.keys()) {
      const p = w.players.get(id)!;
      const n = leaf().some((l) => circleHitsRect(p.x, p.y, R + 2, l)) && (p.input.up || p.input.down || p.input.left || p.input.right) ? (against.get(id) ?? 0) + 1 : 0;
      against.set(id, n);
      worst = Math.max(worst, n);
    }
  }
  assert.ok(worst < 20, `pressed against the leaf for ${worst} ticks in a row`);
  assert.ok(visits >= spots.length, `went round the spots (${visits} reached)`);
});

test('two bots crossing at a shut swing door get through both ways: the one the leaf swings toward backs out of its way', () => {
  // Mates, so neither stops to fight the other.
  const w = createWorld('TDM', 1, 'geo-test');
  w.crates = []; w.barrels = []; w.props = []; w.airdrops = { due: [], flight: null };
  const r = () => rand(w);
  const search = (at: { x: number; y: number }) => ({ k: 'search' as const, at, giveUpAt: Infinity, since: 0, holdUntil: Infinity });
  // One comes up out of room-3 into the corridor, the other goes down from the corridor into the room, both by the door.
  const up = spawnAt(w, 3580, 700, { kind: 'bot', name: 'up', team: 'red' }), down = spawnAt(w, 3580, 380, { kind: 'bot', name: 'down', team: 'red' });
  const upTo = { x: 3300, y: 330 }, downTo = { x: 3420, y: 850 };
  const bots = new Map<number, BotMemory>([[up.id, { ...newBotMemory(r), intent: search(upTo) }], [down.id, { ...newBotMemory(r), intent: search(downTo) }]]);
  const d = w.doors.find((s) => s.id === 'room-3')!;
  let stalled = 0, worst = 0;
  const done = () => Math.hypot(up.x - upTo.x, up.y - upTo.y) < 40 && Math.hypot(down.x - downTo.x, down.y - downTo.y) < 40;
  for (let t = 0; t < 8000 / TICK_MS && !done(); t++) {
    thinkBots(w, bots, r, { respawn: false });
    step(w, TICK_MS);
    stalled = d.open > 0 && d.open < 255 && d.target === 255 ? stalled + 1 : 0;
    worst = Math.max(worst, stalled);
  }
  assert.ok(done(), `both got through (up at ${up.x.toFixed(0)},${up.y.toFixed(0)}, down at ${down.x.toFixed(0)},${down.y.toFixed(0)})`);
  assert.ok(worst < 40, `the leaf was held part open on someone for ${worst} ticks`);
});
