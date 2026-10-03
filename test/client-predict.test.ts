/// <reference types="node" />
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { decayCorrection, drawnPosition, NO_PREDICTION, predictInput, reconcile, solidsOf, startsDash, type Prediction } from '../src/client/predict.ts';
import type { InputState, Snapshot } from '../src/shared/protocol.ts';
import { IDLE_INPUT, setInput, snapshotFor, step, wallViews, type Motion, type Rect } from '../src/shared/sim.ts';
import { emptyWorld, grantPerks, spawnAt, TICK_MS } from './helpers.ts';

const LATENCY_TICKS = 3;

type Lockstep = { clientSolids?: (snap: Snapshot) => Rect[]; dashPerk?: boolean };

function playOutLockstep(inputs: Partial<InputState>[], { clientSolids, dashPerk = false }: Lockstep = {}) {
  const w = emptyWorld();
  w.walls = [{ x: 600, y: 300, w: 40, h: 400, built: false, expiresAt: Infinity }];
  const p = spawnAt(w, 500, 500);
  if (dashPerk) grantPerks(w, p, ['grip', 'thickSkin', 'dash']);
  const walls = wallViews(w);
  const solidsFor = clientSolids ?? ((snap: Snapshot) => solidsOf(walls, snap.crates));
  const selfOf = (snap: Snapshot): Motion => {
    const v = snap.players.find((v) => v.id === snap.self.id)!;
    return { x: v.x, y: v.y, dash: snap.self.dash };
  };
  const first = snapshotFor(w, p.id);
  let pred: Prediction = reconcile(NO_PREDICTION, selfOf(first), first.ackSeq, solidsFor(first), first.self.speed);
  let latest = first;
  const toServer: { at: number; seq: number; input: InputState }[] = [];
  const toClient: { at: number; snap: Snapshot }[] = [];
  let maxCorrection = 0;
  const all = [...inputs, ...Array<Partial<InputState>>(LATENCY_TICKS * 2 + 2).fill({})];
  all.forEach((partial, i) => {
    const seq = i + 1;
    const input = { ...IDLE_INPUT, ...partial };
    const dash = startsDash(pred, input, latest.self, true);
    pred = predictInput(pred, { seq, input, dtMs: TICK_MS, startsDash: dash }, solidsFor(latest), latest.self.speed, seq * TICK_MS);
    toServer.push({ at: seq + LATENCY_TICKS, seq, input });
    for (const m of toServer.filter((m) => m.at === seq)) setInput(w, p.id, m.seq, m.input);
    step(w, TICK_MS);
    toClient.push({ at: seq + LATENCY_TICKS, snap: snapshotFor(w, p.id) });
    for (const m of toClient.filter((m) => m.at === seq)) {
      const before = pred.afterNewest!;
      latest = m.snap;
      pred = reconcile(pred, selfOf(m.snap), m.snap.ackSeq, solidsFor(m.snap), m.snap.self.speed);
      maxCorrection = Math.max(maxCorrection, Math.hypot(pred.afterNewest!.x - before.x, pred.afterNewest!.y - before.y));
    }
  });
  return { server: { x: p.x, y: p.y, dash: p.life.k === 'alive' ? p.life.dash : null }, pred, maxCorrection };
}

const route: Partial<InputState>[] = [
  ...Array(25).fill({ right: true }),
  ...Array(20).fill({ right: true, down: true }),
  ...Array(15).fill({ up: true, left: true }),
  ...Array(10).fill({ right: true }),
];

test('prediction with a wall in the way matches the server every snapshot and ends exactly on it', () => {
  const { server, pred, maxCorrection } = playOutLockstep(route);
  assert.ok(server.x <= 600 - 24 + 1e-9, `the wall stopped the server player (x=${server.x})`);
  assert.ok(maxCorrection < 1e-9, `no correction was ever needed (max ${maxCorrection})`);
  assert.deepEqual(pred.afterNewest, server);
  assert.equal(pred.pending.length, LATENCY_TICKS * 2, 'acknowledged inputs are dropped; only the round trip in flight remains');
});

test('a misprediction converges to the server position and the drawn player glides there', () => {
  const { server, pred, maxCorrection } = playOutLockstep(route, { clientSolids: () => [] });
  assert.ok(maxCorrection > 1, 'the client did mispredict through the wall');
  assert.deepEqual(pred.afterNewest, server);
  const settled = decayCorrection(pred, 1000);
  const drawn = drawnPosition(settled, Infinity, TICK_MS)!;
  assert.ok(Math.hypot(drawn.x - server.x, drawn.y - server.y) < 0.01, `drawn ${drawn.x},${drawn.y} vs server ${server.x},${server.y}`);
});

const at = (x: number, y: number): Prediction => ({ ...NO_PREDICTION, afterNewest: { x, y, dash: null }, beforeNewest: { x, y } });

test('a small correction leaves the drawn player in place, then decays toward the server', () => {
  const pred = reconcile(at(100, 100), { x: 106, y: 100, dash: null }, 0, [], 300);
  assert.deepEqual(drawnPosition(pred, 0, TICK_MS), { x: 100, y: 100 });
  const later = drawnPosition(decayCorrection(pred, 60), 0, TICK_MS)!;
  assert.ok(later.x > 102 && later.x < 106, `partway after 60ms (x=${later.x})`);
  assert.ok(Math.abs(drawnPosition(decayCorrection(pred, 600), 0, TICK_MS)!.x - 106) < 0.01);
});

test('a respawn-sized correction snaps', () => {
  const pred = reconcile(at(100, 100), { x: 2000, y: 1500, dash: null }, 0, [], 300);
  assert.deepEqual(drawnPosition(pred, 0, TICK_MS), { x: 2000, y: 1500 });
});

test('the drawn player walks the latest step across one input interval', () => {
  const pred = predictInput(at(100, 100), { seq: 1, input: { ...IDLE_INPUT, right: true }, dtMs: TICK_MS, startsDash: false }, [], 300, 1000);
  assert.equal(drawnPosition(pred, 1000, TICK_MS)!.x, 100);
  assert.ok(Math.abs(drawnPosition(pred, 1000 + TICK_MS / 2, TICK_MS)!.x - 105) < 1e-9);
  assert.ok(Math.abs(drawnPosition(pred, 5000, TICK_MS)!.x - 110) < 1e-9);
});

const dashRoute: Partial<InputState>[] = [
  ...Array(5).fill({ down: true }),
  ...Array(3).fill({ down: true, ability: true }),
  ...Array(12).fill({ down: true }),
  ...Array(4).fill({ ability: true, angle: Math.PI }),
  ...Array(10).fill({}),
];

test('a dash predicted on the client matches the server every snapshot, so the local player never rubber-bands', () => {
  const { server, pred, maxCorrection } = playOutLockstep(dashRoute, { dashPerk: true });
  assert.ok(server.y - 500 > 240, `the server dashed down (y ${server.y})`);
  assert.ok(maxCorrection < 1e-9, `no correction was ever needed (max ${maxCorrection})`);
  assert.deepEqual(pred.afterNewest, server);
});
