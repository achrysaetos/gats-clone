/// <reference types="node" />
import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Accounts } from '../src/server/accounts.ts';
import { LIMITS } from '../src/server/limits.ts';
import { MAX_CATCH_UP, MAX_LATE_MS, planTicks } from '../src/server/clock.ts';
import { createRoom } from '../src/server/room.ts';
import { fakeSocket, PISTOL } from './helpers.ts';

const accounts = { stats: () => null, credit: () => {} } as unknown as Accounts;
const TICK = 1000 / 30;

/** A joined client whose socket reports a backlog we control, and which records terminate() like a real close. */
function slowClient(room: ReturnType<typeof createRoom>, name: string) {
  const ws = fakeSocket();
  const raw = ws.socket as unknown as { bufferedAmount: number; terminate: () => void };
  raw.bufferedAmount = 0;
  let terminated = 0;
  raw.terminate = () => { terminated++; ws.close(); };
  room.connect(ws.socket);
  ws.send({ t: 'join', name, loadout: PISTOL, aspect: 1.5 });
  return { ws, raw, snaps: () => ws.sent.filter((m) => m.t === 'snap'), terminated: () => terminated };
}

test('a socket whose backlog is over the cap is skipped, not queued to, and gets the latest snapshot once it drains', () => {
  const room = createRoom('ffa', 'FFA', 11, accounts, 1, { ...LIMITS, minPlayers: 2 });
  const c = slowClient(room, 'Slow');
  room.tick();
  assert.equal(c.snaps().length, 1, 'a healthy socket is sent every tick');
  c.raw.bufferedAmount = LIMITS.maxBufferedBytes + 1;
  for (let i = 0; i < 20; i++) room.tick();
  assert.equal(c.snaps().length, 1, 'twenty ticks of backlog queue nothing');
  c.raw.bufferedAmount = 0;
  room.tick();
  const snaps = c.snaps() as { t: 'snap'; tick: number; crates?: unknown; leaderboard?: unknown }[];
  assert.equal(snaps.length, 2);
  assert.equal(snaps[1]!.tick, room.world.tick, 'what resumes is the current tick, not a stale one');
  assert.ok(snaps[1]!.tick - snaps[0]!.tick >= 21);
});

test('skipped snapshots do not advance the delta encoder: a resumed client still gets every sticky field it was owed', () => {
  const room = createRoom('ffa', 'FFA', 12, accounts, 1, { ...LIMITS, minPlayers: 2 });
  const c = slowClient(room, 'Sticky');
  c.raw.bufferedAmount = LIMITS.maxBufferedBytes + 1;
  for (let i = 0; i < 5; i++) room.tick();
  assert.equal(c.snaps().length, 0);
  c.raw.bufferedAmount = 0;
  room.tick();
  const first = c.snaps()[0] as Record<string, unknown>;
  assert.ok(first.crates && first.leaderboard && first.zones && first.match, 'the first snapshot the client sees is complete');
});

test('a socket stuck over the cap for stallMs is closed and its player removed; a brief spike is forgiven', (t) => {
  // The stall clock is the wall clock; mocked, so a loaded machine cannot stretch a short wait past stallMs.
  t.mock.timers.enable({ apis: ['Date'], now: 1_000_000 });
  const room = createRoom('ffa', 'FFA', 13, accounts, 1, { ...LIMITS, minPlayers: 2, stallMs: 120 });
  const spiky = slowClient(room, 'Spiky');
  const stuck = slowClient(room, 'Stuck');
  room.tick();
  assert.equal(room.info().humans, 2);
  const over = LIMITS.maxBufferedBytes + 1;
  spiky.raw.bufferedAmount = over; stuck.raw.bufferedAmount = over;
  room.tick();
  spiky.raw.bufferedAmount = 0; // drains in time
  t.mock.timers.tick(40);
  room.tick();
  assert.equal(spiky.terminated(), 0);
  stuck.raw.bufferedAmount = over;
  t.mock.timers.tick(120);
  room.tick();
  assert.equal(stuck.terminated(), 1, 'the stalled socket is terminated');
  assert.equal(room.info().humans, 1, 'and its player no longer holds a slot');
  assert.equal([...room.world.players.values()].some((p) => p.name === 'Stuck'), false, 'or a body in the world');
  spiky.raw.bufferedAmount = over;
  room.tick();
  t.mock.timers.tick(60);
  spiky.raw.bufferedAmount = 0;
  room.tick();
  spiky.raw.bufferedAmount = over;
  t.mock.timers.tick(90);
  room.tick();
  assert.equal(spiky.terminated(), 0, 'the clock restarts each time the backlog drains');
});

test('catch-up is clamped: a late timer runs a few ticks and forgets the rest, never a spiral', () => {
  assert.deepEqual(planTicks(1000, 1000, TICK), { ticks: 1, nextAt: 1000 + TICK }, 'on time: one tick');
  assert.deepEqual(planTicks(990, 1000, TICK), { ticks: 0, nextAt: 1000 }, 'early: none');
  const two = planTicks(1000 + TICK + 1, 1000, TICK);
  assert.equal(two.ticks, 2);
  assert.ok(Math.abs(two.nextAt - (1000 + 2 * TICK)) < 1e-9, 'a small lag is paid back exactly, keeping game time on the wall clock');
  const lateBy = 7 * TICK; // under MAX_LATE_MS, over MAX_CATCH_UP ticks
  assert.ok(lateBy < MAX_LATE_MS && lateBy > MAX_CATCH_UP * TICK);
  const late = planTicks(1000 + lateBy, 1000, TICK);
  assert.equal(late.ticks, MAX_CATCH_UP, 'a long stall is capped');
  assert.ok(late.nextAt >= 1000 + lateBy, 'and the remaining debt is dropped, not carried');
  const gone = planTicks(1000 + MAX_LATE_MS + 1, 1000, TICK);
  assert.equal(gone.ticks, 1, 'after a very long freeze the schedule restarts');
  // Simulate an overloaded server: every callback costs 3 ticks of wall time. The batch size must stay bounded.
  let now = 0, next = 0, worst = 0;
  for (let i = 0; i < 500; i++) {
    const plan = planTicks(now, next, TICK);
    worst = Math.max(worst, plan.ticks);
    next = plan.nextAt;
    now += Math.max(1, plan.ticks * 3 * TICK, next - now);
  }
  assert.ok(worst <= MAX_CATCH_UP);
});
