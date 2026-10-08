/// <reference types="node" />
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { decayCorrection, drawnPosition, NO_PREDICTION, predictAbility, predictInput, reconcile, selfMotion, solidsOf, type Prediction } from '../src/client/predict.ts';
import { ABILITY_COOLDOWN_MS, WORLD } from '../src/shared/defs.ts';
import { MAPS } from '../src/shared/maps.ts';
import type { InputState, Snapshot } from '../src/shared/protocol.ts';
import { setInput, step } from '../src/shared/sim.ts';
import type { Rect } from '../src/shared/sim/movement.ts';
import { applyKnock } from '../src/shared/sim/knock.ts';
import { goDown } from '../src/shared/sim/downed.ts';
import { snapshotFor, wallViews } from '../src/shared/sim/snapshot.ts';
import { createWorld, IDLE_INPUT, newId } from '../src/shared/sim/world.ts';
import { emptyWorld, grantPerks, spawnAt, TICK_MS } from './helpers.ts';

const LATENCY_TICKS = 3;

/** `squad` plays in a zombies run instead, from beside the core, with squad walls on `walls`, the player starting down when `downed`. */
type Lockstep = {
  clientSolids?: (snap: Snapshot) => Rect[]; ability?: 'dash' | 'knife'; enemyAt?: { x: number; y: number };
  squad?: { walls: [number, number][]; downed?: boolean };
  /** A hit shoves the player on this tick, `mag` px/s along (dirX, dirY). */
  shove?: { at: number; dirX: number; dirY: number; mag: number };
};

function lockstepWorld(squad: Lockstep['squad']) {
  if (!squad) {
    const w = emptyWorld();
    w.walls = [{ x: 600, y: 300, w: 40, h: 400, built: false, material: 'concrete', expiresAt: Infinity }];
    return { w, p: spawnAt(w, 500, 500) };
  }
  const w = createWorld('ZOM', 1, 'outpost');
  const p = spawnAt(w, 1380, 1525);
  for (const [cx, cy] of squad.walls) w.buildings.push({ id: newId(w), kind: 'wall', cx, cy, hp: 400 });
  if (squad.downed) goDown(w, p);
  return { w, p };
}

function playOutLockstep(inputs: Partial<InputState>[], { clientSolids, ability, enemyAt, squad, shove }: Lockstep = {}) {
  const { w, p } = lockstepWorld(squad);
  if (ability) grantPerks(w, p, ['extended', 'thickSkin', ability]);
  if (enemyAt) spawnAt(w, enemyAt.x, enemyAt.y);
  const walls = wallViews(w);
  const solidsFor = clientSolids ?? ((snap: Snapshot) => solidsOf(walls, snap));
  const first = snapshotFor(w, p.id);
  let pred: Prediction = reconcile(NO_PREDICTION, selfMotion(first).at, first.ackSeq, solidsFor(first), selfMotion(first).speed, MAPS[w.map].size);
  let latest = first;
  const toServer: { at: number; seq: number; input: InputState }[] = [];
  const toClient: { at: number; snap: Snapshot }[] = [];
  let maxCorrection = 0;
  const all = [...inputs, ...Array<Partial<InputState>>(LATENCY_TICKS * 2 + 2).fill({})];
  all.forEach((partial, i) => {
    const seq = i + 1;
    const input = { ...IDLE_INPUT, ...partial };
    pred = predictInput(pred, { seq, input, dtMs: TICK_MS, ability: predictAbility(pred, input, latest) }, solidsFor(latest), selfMotion(latest).speed, seq * TICK_MS, MAPS[w.map].size);
    toServer.push({ at: seq + LATENCY_TICKS, seq, input });
    for (const m of toServer.filter((m) => m.at === seq)) setInput(w, p.id, m.seq, m.input);
    if (shove && i === shove.at) applyKnock(w, p, shove.dirX, shove.dirY, shove.mag);
    step(w, TICK_MS);
    toClient.push({ at: seq + LATENCY_TICKS, snap: snapshotFor(w, p.id) });
    for (const m of toClient.filter((m) => m.at === seq)) {
      const before = pred.afterNewest!;
      latest = m.snap;
      pred = reconcile(pred, selfMotion(m.snap).at, m.snap.ackSeq, solidsFor(m.snap), selfMotion(m.snap).speed, MAPS[w.map].size);
      maxCorrection = Math.max(maxCorrection, Math.hypot(pred.afterNewest!.x - before.x, pred.afterNewest!.y - before.y));
    }
  });
  return { server: { x: p.x, y: p.y, dash: p.life.k === 'alive' ? p.life.dash : null }, pred, maxCorrection, downed: p.life.k === 'downed' };
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

test('prediction with sprint bursts and stops matches the server every snapshot', () => {
  const sprinting: Partial<InputState>[] = [
    ...Array(20).fill({ right: true }),
    ...Array(25).fill({ right: true, sprint: true }),
    ...Array(10).fill({ down: true, sprint: true }),
    ...Array(8).fill({ down: true, sprint: true, fire: true }),
    ...Array(15).fill({ up: true, left: true, sprint: true }),
    ...Array(10).fill({ sprint: true }),
  ];
  const { server, pred, maxCorrection } = playOutLockstep(sprinting);
  assert.ok(maxCorrection < 1e-9, `sprint never needed a correction (max ${maxCorrection})`);
  assert.deepEqual(pred.afterNewest, server);
  const walked = playOutLockstep(route.map((i) => ({ ...i, sprint: false })));
  const ran = playOutLockstep(route.map((i) => ({ ...i, sprint: true })));
  assert.ok(ran.maxCorrection < 1e-9 && Math.hypot(ran.server.x - 500, ran.server.y - 500) > Math.hypot(walked.server.x - 500, walked.server.y - 500) * 0.99, 'a sprint along the wall route still reconciles');
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
  const pred = reconcile(at(100, 100), { x: 106, y: 100, dash: null }, 0, [], 300, 3000);
  assert.deepEqual(drawnPosition(pred, 0, TICK_MS), { x: 100, y: 100 });
  const later = drawnPosition(decayCorrection(pred, 60), 0, TICK_MS)!;
  assert.ok(later.x > 102 && later.x < 106, `partway after 60ms (x=${later.x})`);
  assert.ok(Math.abs(drawnPosition(decayCorrection(pred, 600), 0, TICK_MS)!.x - 106) < 0.01);
});

test('a respawn-sized correction snaps', () => {
  const pred = reconcile(at(100, 100), { x: 2000, y: 1500, dash: null }, 0, [], 300, 3000);
  assert.deepEqual(drawnPosition(pred, 0, TICK_MS), { x: 2000, y: 1500 });
});

test('the drawn player walks the latest step across one input interval', () => {
  const pred = predictInput(at(100, 100), { seq: 1, input: { ...IDLE_INPUT, right: true }, dtMs: TICK_MS, ability: null }, [], 300, 1000, 3000);
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
  const { server, pred, maxCorrection } = playOutLockstep(dashRoute, { ability: 'dash' });
  assert.ok(server.y - 500 > 240, `the server dashed down (y ${server.y})`);
  assert.ok(maxCorrection < 1e-9, `no correction was ever needed (max ${maxCorrection})`);
  assert.deepEqual(pred.afterNewest, server);
});

const knifeRoute: Partial<InputState>[] = [
  ...Array(4).fill({ ability: true, angle: -Math.PI / 2 }),
  ...Array(Math.ceil(ABILITY_COOLDOWN_MS.knife / TICK_MS) + 5).fill({}),
  ...Array(4).fill({ ability: true, angle: 0 }),
  ...Array(10).fill({}),
];

test('a knife lunge predicted on the client matches the server every snapshot, including one cut short by a wall', () => {
  const { server, pred, maxCorrection } = playOutLockstep(knifeRoute, { ability: 'knife' });
  assert.ok(500 - server.y > 80, `the server lunged up (y ${server.y})`);
  assert.ok(server.x < 600 - 24 && server.x > 500 + 45, `the second lunge stopped at the wall (x ${server.x})`);
  assert.ok(maxCorrection < 1e-9, `no correction was ever needed (max ${maxCorrection})`);
  assert.deepEqual(pred.afterNewest, server);
});

test('a knife lunge that reaches an enemy stops where the server stops it', () => {
  const { server, pred, maxCorrection } = playOutLockstep(knifeRoute.slice(0, 20), { ability: 'knife', enemyAt: { x: 500, y: 360 } });
  assert.ok(server.y < 470 && server.y > 420, `the lunge stopped short of its full 90px (y ${server.y})`);
  assert.ok(maxCorrection < 1e-9, `no correction was ever needed (max ${maxCorrection})`);
  assert.deepEqual(pred.afterNewest, server);
});

test('in a zombies run the squad\'s walls and the core stop the predicted player where the server stops them', () => {
  const route: Partial<InputState>[] = [...Array(20).fill({ left: true }), ...Array(30).fill({ right: true })];
  const { server, pred, maxCorrection } = playOutLockstep(route, { squad: { walls: [[25, 30]] } });
  assert.ok(Math.abs(server.x - (1450 - 24)) < 1e-9, `the core stopped the server player (x ${server.x})`);
  assert.ok(maxCorrection < 1e-9, `no correction was ever needed (max ${maxCorrection})`);
  assert.deepEqual(pred.afterNewest, server);
});

test('a downed player\'s crawl is predicted as the server moves it', () => {
  const route: Partial<InputState>[] = Array(40).fill({ left: true, up: true });
  const { server, pred, maxCorrection, downed } = playOutLockstep(route, { squad: { walls: [], downed: true } });
  assert.ok(downed && 1525 - server.y > 40, `the crawl moved them (to ${server.x.toFixed(1)},${server.y.toFixed(1)})`);
  assert.ok(maxCorrection < 1e-9, `no correction was ever needed (max ${maxCorrection})`);
  assert.deepEqual(pred.afterNewest, server);
});

test('the local player walks up to the edge of the map in play, however big it is', () => {
  const walkRight = (size: number) => predictInput(at(size - 30, 100), { seq: 1, input: { ...IDLE_INPUT, right: true }, dtMs: TICK_MS, ability: null }, [], 300, 0, size).afterNewest!.x;
  assert.equal(walkRight(3000), 3000 - WORLD.playerRadius);
  assert.equal(walkRight(6000), 6000 - WORLD.playerRadius);
});

test('a hit that shoves the local player is replayed by prediction, so the view glides and ends exactly on the server', () => {
  const idle = Array<Partial<InputState>>(40).fill({});
  const plain = playOutLockstep(idle);
  const shoved = playOutLockstep(idle, { shove: { at: 10, dirX: 1, dirY: 0, mag: 120 } });
  assert.ok(shoved.server.x - plain.server.x > 5, `the shove moved the server body (${shoved.server.x - plain.server.x}px)`);
  assert.ok(Math.abs(shoved.pred.afterNewest!.x - shoved.server.x) < 1e-6 && Math.abs(shoved.pred.afterNewest!.y - shoved.server.y) < 1e-6, 'prediction ends on the server');
  assert.ok(shoved.maxCorrection < 15, `no rubber-band: the largest correction was ${shoved.maxCorrection}px`);
  assert.ok(shoved.maxCorrection > 0, 'the client could not know of the hit before its snapshot');
});

test('the shove rides the self snapshot and its replay matches the server while the client is also walking', () => {
  const walk = Array<Partial<InputState>>(30).fill({ down: true });
  const r = playOutLockstep(walk, { shove: { at: 8, dirX: 0, dirY: 1, mag: 100 } });
  assert.ok(Math.abs(r.pred.afterNewest!.y - r.server.y) < 1e-6);
  assert.ok(r.maxCorrection < 15);
});

/** A bare snapshot carrying just what selfMotion, solidsOf and predictAbility read. */
const bareSnap = (o: { me?: object; self?: object; players?: object[]; buildings?: object[] } = {}) => ({
  self: { id: 1, alive: true, speed: 300, sprintSpeed: 420, dash: null, ability: 'knife', abilityReadyIn: 0, ...o.self },
  players: [{ id: 1, x: 10, y: 20, alive: true, team: 'red', ...o.me }, ...(o.players ?? [])],
  match: { winner: null }, crates: [], buildings: o.buildings ?? [],
}) as unknown as Snapshot;

test('a standing player predicts from the server\'s shove and sprint pace; a crawling one gets neither, and a dead one has no position', () => {
  const knock = { vx: 90, vy: 0 };
  const up = selfMotion(bareSnap({ self: { knock } }));
  assert.deepEqual(up.at, { x: 10, y: 20, dash: null, knock });
  assert.deepEqual(up.speed, { walk: 300, sprint: 420 });
  const crawling = selfMotion(bareSnap({ me: { alive: false, downed: { revive: 0, bleedOutAt: 9e9 } }, self: { knock } }));
  assert.deepEqual(crawling.at, { x: 10, y: 20, dash: null }, 'a downed body is not shoved along by the hit that dropped it');
  assert.ok(typeof crawling.speed === 'number' && crawling.speed < 300, 'and crawls slower than it walks, with no sprint');
  assert.equal(selfMotion(bareSnap({ me: { alive: false } })).at, null);
});

test('a spike strip is walked over; a squad wall stops the predicted player', () => {
  const rects = solidsOf([], bareSnap({ buildings: [{ kind: 'spikes', cx: 3, cy: 3, hp: 10 }, { kind: 'wall', cx: 5, cy: 3, hp: 10 }] }));
  assert.equal(rects.length, 1, 'only the wall is solid');
  const walkInto = (kind: string) => predictInput(at(240, 175), { seq: 1, input: { ...IDLE_INPUT, right: true }, dtMs: 1000, ability: null },
    solidsOf([], bareSnap({ buildings: [{ kind, cx: 5, cy: 3, hp: 10 }] })), 300, 0, 3000).afterNewest!.x;
  assert.ok(walkInto('spikes') > 500, 'straight over the spikes');
  assert.ok(walkInto('wall') < 260, 'stopped at the wall');
});

test('a knife lunge only homes on enemies: teammates and the dead are not targets, and in free for all everyone else is', () => {
  const lunge = (team: string | null, others: object[]) => {
    const a = predictAbility(NO_PREDICTION, { ...IDLE_INPUT, ability: true }, bareSnap({ me: { team }, players: others }));
    return a?.k === 'knife' ? a.enemies.map((e) => (e as unknown as { id: number }).id) : null;
  };
  const others = [{ id: 2, x: 0, y: 0, alive: true, team: 'red' }, { id: 3, x: 0, y: 0, alive: true, team: 'blue' }, { id: 4, x: 0, y: 0, alive: false, team: 'blue' }];
  assert.deepEqual(lunge('red', others), [3]);
  assert.deepEqual(lunge(null, others.map((p) => ({ ...p, team: null }))), [2, 3]);
  assert.equal(predictAbility(NO_PREDICTION, { ...IDLE_INPUT, ability: true }, bareSnap({ self: { abilityReadyIn: 500 } })), null, 'not while it cools down');
});
