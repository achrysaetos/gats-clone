/// <reference types="node" />
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BACKOFF, closeVerdict, nextDelay, retryAfterFailure, retryNow, socketRole, startRetry, type Retry } from '../src/client/reconnect.ts';
import type { ClientState, Session } from '../src/client/state.ts';

const socket = () => ({}) as WebSocket;
const playing = (ws: WebSocket): ClientState => ({ phase: 'playing', s: { ws } as Session });
const ABNORMAL = 1006;
const NO_STATUS = 1005;

test('backoff never exceeds the cap, however many attempts or how unlucky the jitter', () => {
  for (let attempt = 1; attempt <= 60; attempt++) for (const rand of [0, 0.5, 0.999999, 1]) assert.ok(nextDelay(attempt, rand) <= BACKOFF.capMs, `attempt ${attempt}`);
});

test('backoff starts near half a second and doubles until it reaches the cap', () => {
  const ceilings = [1, 2, 3, 4, 5, 6].map((a) => nextDelay(a, 1));
  assert.deepEqual(ceilings, [500, 1000, 2000, 4000, 5000, 5000]);
});

test('jitter spreads clients that dropped together across half of each window', () => {
  assert.equal(nextDelay(3, 0), 1000);
  assert.equal(nextDelay(3, 1), 2000);
});

test('a run of failed dials gives up once the next one would land past the budget, not before', () => {
  for (const rand of [0, 0.5, 1]) {
    let retry: Retry | null = startRetry(0, rand);
    let last = retry;
    for (let dials = 0; retry && dials < 1000; dials++) { last = retry; retry = retryAfterFailure(retry, retry.nextAt, rand); }
    assert.equal(retry, null, 'still retrying after 1000 failed dials');
    assert.ok(last.nextAt <= BACKOFF.budgetMs, `last dial at ${last.nextAt}ms`);
    assert.ok(last.nextAt > BACKOFF.budgetMs - BACKOFF.capMs, `gave up early, last dial at ${last.nextAt}ms`);
    assert.ok(last.attempt >= 9, `only ${last.attempt} attempts`);
  }
});

test('each failure counts as one more attempt', () => {
  const retry = retryAfterFailure(startRetry(0, 0.5), 400, 0.5)!;
  assert.equal(retry.attempt, 2);
  assert.equal(retry.nextAt, 400 + nextDelay(2, 0.5));
});

test('coming back online dials now instead of waiting out the backoff, and never delays a dial already due', () => {
  const waiting: Retry = { attempt: 6, startedAt: 0, nextAt: 20_000 };
  assert.deepEqual(retryNow(waiting, 16_000), { attempt: 6, startedAt: 0, nextAt: 16_000 });
  assert.equal(retryNow({ ...waiting, nextAt: 15_000 }, 16_000).nextAt, 15_000);
});

test('an unexpected close of the live session socket reconnects, alive or dead', () => {
  const ws = socket();
  for (const state of [playing(ws), { phase: 'dead', s: { ws } as Session, kill: null, loss: null, recap: null } satisfies ClientState]) {
    for (const code of [ABNORMAL, NO_STATUS, 1001, 1012]) assert.equal(closeVerdict(socketRole(state, ws), code), 'reconnect', `${state.phase} ${code}`);
  }
});

test('a server policy close (message flood) drops to the menu instead of dialing again', () => {
  const ws = socket();
  assert.equal(closeVerdict(socketRole(playing(ws), ws), 1008), 'drop');
});

test('a deliberate leave never reconnects: the client lets go of the socket before it closes', () => {
  const ws = socket();
  const afterLeave: ClientState = { phase: 'menu', status: { kind: 'idle' } };
  assert.equal(closeVerdict(socketRole(afterLeave, ws), ABNORMAL), 'ignore');
  assert.equal(closeVerdict(socketRole(afterLeave, ws), 1000), 'ignore');
});

test('a socket the client already replaced is ignored when it finally closes', () => {
  const old = socket();
  assert.equal(closeVerdict(socketRole(playing(socket()), old), ABNORMAL), 'ignore');
  const reconnecting: ClientState = { phase: 'reconnecting', s: { ws: old } as Session, rejoin: { room: 'ffa', name: 'A', loadout: { weapon: 'pistol', armor: 'none', color: 'green' }, token: undefined }, retry: startRetry(0, 0), dial: socket() };
  assert.equal(closeVerdict(socketRole(reconnecting, old), ABNORMAL), 'ignore');
});

test('a dial that closes while reconnecting counts as a failed attempt, and a first Play that fails reports it', () => {
  const dial = socket();
  const reconnecting: ClientState = { phase: 'reconnecting', s: { ws: socket() } as Session, rejoin: { room: 'ffa', name: 'A', loadout: { weapon: 'pistol', armor: 'none', color: 'green' }, token: undefined }, retry: startRetry(0, 0), dial };
  assert.equal(closeVerdict(socketRole(reconnecting, dial), ABNORMAL), 'retry-failed');
  const first = socket();
  const connecting: ClientState = { phase: 'menu', status: { kind: 'connecting', ws: first, rejoin: reconnecting.rejoin } };
  assert.equal(closeVerdict(socketRole(connecting, first), ABNORMAL), 'connect-failed');
});
