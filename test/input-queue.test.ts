import assert from 'node:assert/strict';
import { test, type TestContext } from 'node:test';
import type { Accounts } from '../src/server/accounts.ts';
import { LIMITS } from '../src/server/limits.ts';
import { DRAIN_WINDOW_TICKS, enqueueInput, INPUT_QUEUE_CAP, newInputQueue, takeInput, type QueuedInput } from '../src/server/inputs.ts';
import { WORLD } from '../src/shared/defs.ts';
import { MAX_REWIND_MS } from '../src/shared/sim/combat.ts';
import { createRoom } from '../src/server/room.ts';
import type { InputState, Snapshot } from '../src/shared/protocol.ts';
import { IDLE_INPUT } from '../src/shared/sim/world.ts';
import { fakeSocket } from './helpers.ts';

const accounts = { stats: () => null, nameForToken: () => null, credit: () => {} } as unknown as Accounts;

function joinAlone(t: TestContext, weapon: 'pistol' | 'smg' = 'pistol') {
  t.mock.timers.enable({ apis: ['setInterval', 'setTimeout'] });
  const room = createRoom('ffa', 'FFA', 1, accounts, 1, { ...LIMITS, minPlayers: 0 });
  const ws = fakeSocket();
  room.connect(ws.socket);
  ws.send({ t: 'join', name: 'Solo', loadout: { weapon, armor: 'none', color: 'red' }, aspect: 1.5 });
  const welcome = ws.sent.find((m) => m.t === 'welcome');
  assert.ok(welcome?.t === 'welcome');
  const me = room.world.players.get(welcome.id)!;
  const input = (seq: number, over: Partial<InputState> = {}) => ws.send({ t: 'input', seq, input: { ...IDLE_INPUT, ...over }, viewAt: null });
  const tick = () => {
    room.tick();
    const snap = ws.sent.at(-1) as Snapshot;
    return { ackSeq: snap.ackSeq, x: me.x, shots: room.world.events.filter((e) => e.e === 'shot' && e.owner === me.id).length };
  };
  return { room, me, input, tick };
}

test('two inputs that land in one tick are applied in order, one per tick, each acknowledged', (t) => {
  const { me, input, tick } = joinAlone(t);
  const x0 = me.x;
  input(1, { right: true });
  input(2, { right: false });
  const first = tick();
  assert.equal(first.ackSeq, 1);
  assert.ok(first.x > x0, `the first input's step moved the player right (${x0} -> ${first.x})`);
  const second = tick();
  assert.equal(second.ackSeq, 2);
  assert.equal(second.x, first.x, 'the second input stopped the player');
});

test('a held trigger released in the same tick still fires the shot it was held for', (t) => {
  const { input, tick } = joinAlone(t, 'smg');
  input(1, { fire: true });
  input(2, { fire: false });
  assert.equal(tick().shots + tick().shots, 1);
});

test('a tick with no waiting input keeps the last one held and acknowledges nothing new', (t) => {
  const { input, tick } = joinAlone(t);
  input(1, { right: true });
  const first = tick();
  const idle = tick();
  assert.equal(idle.ackSeq, 1);
  assert.ok(idle.x > first.x, `the held key kept moving the player (${first.x} -> ${idle.x})`);
});

test('a burst past the cap merges the oldest inputs: one step a tick, the newest seqs acknowledged, no press lost', (t) => {
  const { me, input, tick } = joinAlone(t, 'smg');
  const x0 = me.x;
  input(1, { right: true, fire: true });
  for (let seq = 2; seq <= 2 + INPUT_QUEUE_CAP; seq++) input(seq, { right: true });
  const ticks = Array.from({ length: INPUT_QUEUE_CAP + 1 }, tick);
  const last = 2 + INPUT_QUEUE_CAP;
  assert.deepEqual(ticks.map((s) => s.ackSeq), [...Array.from({ length: INPUT_QUEUE_CAP }, (_, i) => last - INPUT_QUEUE_CAP + 1 + i), last]);
  assert.equal(ticks.reduce((n, s) => n + s.shots, 0), 1, 'the held trigger of the merged-away first input fired once');
  const steps = ticks.map((s, i) => Math.round(s.x - (i === 0 ? x0 : ticks[i - 1]!.x)));
  assert.ok(steps.every((d) => d === steps[0] && d > 0), `one equal step a tick, never two (${steps})`);
});

const queued = (seq: number, input: Partial<InputState> = {}, arrivedTick = 0): QueuedInput =>
  ({ seq, input: { ...IDLE_INPUT, ...input }, viewAt: seq * 10, rewindCapMs: 100, arrivedTick });

test('a merge keeps the newer aim and movement and every held button of both', () => {
  const q = newInputQueue();
  enqueueInput(q, queued(1, { left: true, angle: 1, shots: 3, ability: true, reload: true }));
  for (let seq = 2; seq <= INPUT_QUEUE_CAP; seq++) enqueueInput(q, queued(seq));
  enqueueInput(q, queued(INPUT_QUEUE_CAP + 1, { right: true, angle: 2, shots: 4, use: true }));
  assert.equal(q.waiting.length, INPUT_QUEUE_CAP);
  assert.equal(q.waiting[0]!.seq, 2);
  assert.deepEqual(q.waiting[0]!.input, { ...IDLE_INPUT, shots: 3, ability: true, reload: true });
  assert.equal(q.waiting[0]!.viewAt, 20);
});

function standingBacklog(backlog: number, input: Partial<InputState>, deliveredWithNext: number[] = []): number {
  const q = newInputQueue();
  let seq = 0, owed = backlog;
  for (let tick = 0; tick < DRAIN_WINDOW_TICKS; tick++) {
    owed++;
    if (!deliveredWithNext.includes(tick)) for (; owed > 0; owed--) enqueueInput(q, queued(++seq, input, tick));
    takeInput(q, tick);
  }
  return q.waiting.length;
}

test('a backlog that never ran dry for a whole window drains by one merge', () => {
  assert.equal(standingBacklog(3, { right: true }), 2);
});

test('a backlog that ran dry in the window is jitter cushion and stays', () => {
  assert.equal(standingBacklog(3, { right: true }, [10, 11, 12]), 3);
});

test('a held trigger is never drained, since merging it would shorten the hold', () => {
  assert.equal(standingBacklog(3, { fire: true }), 3);
});

test('an input may rewind as much further as it waited in the queue, up to the rewind cap', () => {
  const q = newInputQueue();
  enqueueInput(q, queued(1, {}, 5));
  enqueueInput(q, { ...queued(2, {}, 5), rewindCapMs: MAX_REWIND_MS - 10 });
  assert.equal(takeInput(q, 5)!.rewindCapMs, 100);
  assert.equal(takeInput(q, 6)!.rewindCapMs, MAX_REWIND_MS);
  enqueueInput(q, queued(3, {}, 6));
  assert.equal(takeInput(q, 8)!.rewindCapMs, 100 + 2 * (1000 / WORLD.tickHz));
});
