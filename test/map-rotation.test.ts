import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { test } from 'node:test';
import type { WebSocket } from 'ws';
import { WORLD, type ModeId } from '../src/shared/defs.ts';
import { MAP_MS, MAP_NOTICE_MS, MAPS, ROTATION, type MapId } from '../src/shared/maps.ts';
import type { ServerMsg } from '../src/shared/protocol.ts';
import { addPlayer } from '../src/shared/sim.ts';
import { circleHitsRect } from '../src/shared/sim/movement.ts';
import { snapshotFor, wallViews } from '../src/shared/sim/snapshot.ts';
import { createWorld, type World } from '../src/shared/sim/world.ts';
import type { Accounts } from '../src/server/accounts.ts';
import { createRoom } from '../src/server/room.ts';
import { PISTOL, run, TICK_MS } from './helpers.ts';

function assertStandingInSpawns(w: World, map: MapId) {
  for (const p of w.players.values()) {
    if (p.life.k !== 'alive') continue;
    const regions = MAPS[map].spawns[p.team ?? 'ffa'];
    assert.ok(regions.some((r) => p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h), `${p.name} at (${p.x.toFixed(0)}, ${p.y.toFixed(0)}) is outside the ${MAPS[map].name} spawns`);
    assert.ok(!w.walls.some((wall) => circleHitsRect(p.x, p.y, WORLD.playerRadius, wall)), `${p.name} stands in a wall`);
  }
}

function populate(w: World) {
  for (let i = 0; i < 8; i++) addPlayer(w, `p${i}`, PISTOL);
}

for (const [mode, winScore, side] of [['TDM', WORLD.tdmWinScore, 'red'], ['DOM', WORLD.domWinScore, 'blue']] as const) {
  test(`${mode}: the round restart loads the next map and moves every living player into its spawns`, () => {
    const [first, second] = ROTATION[mode];
    const w = createWorld(mode, 1, first);
    populate(w);
    const viewer = [...w.players.values()][0];
    w.teamScore[side] = winScore;
    run(w, TICK_MS);
    const over = snapshotFor(w, viewer.id).match;
    assert.equal(over.map, MAPS[first].name);
    assert.equal(over.nextMap, MAPS[second].name);
    assert.ok(over.mapChangeIn > 0 && over.mapChangeIn <= WORLD.roundRestartMs, `announces the change ${over.mapChangeIn}ms ahead`);
    assert.equal(w.map, first, 'the map holds during the end-of-round banner');

    run(w, WORLD.roundRestartMs + 100);
    assert.equal(w.map, second);
    assert.equal(snapshotFor(w, viewer.id).match.map, MAPS[second].name);
    assert.deepEqual(wallViews(w), MAPS[second].walls.map((r) => ({ ...r, built: false })));
    assert.equal(w.zones.length, mode === 'DOM' ? 3 : 0);
    assertStandingInSpawns(w, second);
  });
}

test('FFA announces the next map, then loads it on a timer and moves everyone into its spawns', () => {
  const [first, second] = ROTATION.FFA;
  const w = createWorld('FFA', 1, first);
  populate(w);
  const viewer = [...w.players.values()][0];
  run(w, MAP_MS.FFA - MAP_NOTICE_MS - 1000);
  assert.equal(snapshotFor(w, viewer.id).match.mapChangeIn, 0, 'quiet until the notice window');
  run(w, 2000);
  const notice = snapshotFor(w, viewer.id).match;
  assert.ok(notice.mapChangeIn > 0 && notice.mapChangeIn <= MAP_NOTICE_MS, `notice ${notice.mapChangeIn}`);
  assert.equal(notice.nextMap, MAPS[second].name);
  assert.equal(w.map, first);
  run(w, MAP_NOTICE_MS);
  assert.equal(w.map, second);
  assertStandingInSpawns(w, second);
});

test('FFA: the first to the kill target wins the round, and the next round starts on the next map with kills reset', () => {
  const [first, second] = ROTATION.FFA;
  const w = createWorld('FFA', 1, first);
  populate(w);
  const [leader, viewer] = [...w.players.values()];
  leader!.kills = WORLD.ffaWinKills - 1;
  viewer!.score = 500;
  run(w, TICK_MS);
  assert.equal(w.match.k, 'playing', 'one short of the target');
  leader!.kills = WORLD.ffaWinKills;
  run(w, TICK_MS);
  const over = snapshotFor(w, viewer!.id);
  assert.equal(over.match.winner, leader!.name);
  assert.deepEqual(over.leaderboard[0], { id: leader!.id, name: leader!.name, score: leader!.score, kills: WORLD.ffaWinKills, team: null }, 'the leaderboard ranks by kills');
  assert.equal(w.map, first, 'the map holds during the end-of-round banner');
  run(w, WORLD.roundRestartMs + 100);
  assert.deepEqual([w.match.k, w.map, leader!.kills], ['playing', second, 0]);
  assertStandingInSpawns(w, second);
});

test('FFA: when the map timer runs out, the player with the most kills wins the round', () => {
  const [first, second] = ROTATION.FFA;
  const w = createWorld('FFA', 1, first);
  populate(w);
  const [a, b, viewer] = [...w.players.values()];
  a!.kills = 4;
  b!.kills = 7;
  run(w, MAP_MS.FFA + TICK_MS);
  assert.equal(snapshotFor(w, viewer!.id).match.winner, b!.name);
  assert.equal(w.map, first);
  run(w, WORLD.roundRestartMs + 100);
  assert.equal(w.map, second);
});

function fakeSocket() {
  const sent: ServerMsg[] = [];
  const ws = Object.assign(new EventEmitter(), {
    OPEN: 1, readyState: 1, sent,
    send: (data: string) => { sent.push(JSON.parse(data)); },
    close: () => {}, ping: () => {}, terminate: () => {},
  });
  return ws;
}

test('a joined client receives the new map\'s walls when the round restarts', () => {
  const mode: ModeId = 'TDM';
  const [first, second] = ROTATION[mode];
  const room = createRoom('tdm', mode, 1, { stats: () => null, credit: () => {} } as unknown as Accounts);
  const ws = fakeSocket();
  room.connect(ws as unknown as WebSocket);
  ws.emit('message', Buffer.from(JSON.stringify({ t: 'join', name: 'Tester', loadout: PISTOL, aspect: 1.5 })), false);
  const welcome = ws.sent.find((m) => m.t === 'welcome');
  assert.ok(welcome && welcome.t === 'welcome');
  assert.deepEqual(welcome.walls.map(({ x, y, w, h }) => ({ x, y, w, h })), MAPS[first].walls);

  room.world.teamScore.red = WORLD.tdmWinScore;
  for (let t = 0; t <= WORLD.roundRestartMs + 500; t += TICK_MS) room.tick();
  ws.emit('close');
  const walls = ws.sent.filter((m) => m.t === 'walls');
  assert.equal(walls.length, 1, 'one walls message for the one map change');
  assert.deepEqual(walls[0].t === 'walls' && walls[0].walls, MAPS[second].walls.map((r) => ({ ...r, built: false })));
});
