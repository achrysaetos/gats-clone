/// <reference types="node" />
import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { MAPS, ROTATION, ZONE_RADIUS, type MapId } from '../src/shared/maps.ts';
import { parseClientMsg, type ServerMsg } from '../src/shared/protocol.ts';
import { cycleStation, FIXED_RADIO, HIDDEN_RADIOS, hiddenRadios, isStationId, RADIO_INTERVAL_MS, STATION_IDS, TRACK_IDS, roundKeyOf } from '../src/shared/radio.ts';
import { RADIO_POOL } from '../src/shared/radiopool.ts';
import { createWorld } from '../src/shared/sim/world.ts';
import { snapshotFor } from '../src/shared/sim/snapshot.ts';
import { addPlayer } from '../src/shared/sim.ts';
import type { Accounts } from '../src/server/accounts.ts';
import { createRoom } from '../src/server/room.ts';
import { cellsIn, CELL, flood, standable } from '../scripts/map-lint.ts';
import { POOL_GAP, SPAWN_CLEAR, tuck, VERSUS_MAPS, ZONE_CLEAR } from '../scripts/radio-pool.ts';
import { TRACK_IDS as CLIENT_TRACKS, TRACKS } from '../src/client/musictracks.ts';
import { fakeSocket, PISTOL } from './helpers.ts';

const sockets: ReturnType<typeof fakeSocket>[] = [];
after(() => { for (const s of sockets) s.close(); });
const accounts = { stats: () => null, credit: () => {} } as unknown as Accounts;

test('radio frames parse only for known stations', () => {
  for (const station of STATION_IDS) assert.deepEqual(parseClientMsg(JSON.stringify({ t: 'radio', station, junk: 1 })), { t: 'radio', station });
  for (const bad of [{ t: 'radio' }, { t: 'radio', station: 'jazz' }, { t: 'radio', station: 7 }, { t: 'radio', station: null }, { t: 'radio', station: '<b>' }]) assert.equal(parseClientMsg(JSON.stringify(bad)), null);
});

test('every station is a track the client composes, and off', () => {
  assert.deepEqual([...CLIENT_TRACKS], [...TRACK_IDS]);
  for (const id of TRACK_IDS) assert.ok(TRACKS[id].label.length > 0);
  assert.ok(isStationId('off') && isStationId('harbor') && !isStationId('radio'));
});

test('stations cycle through every track and off; the hidden radio adds the map default', () => {
  let at = cycleStation(null, false);
  assert.equal(at, 'march', 'an untuned fixed radio starts at the first track, never at Off');
  const seen = new Set<string | null>();
  for (let i = 0; i < STATION_IDS.length; i++) { seen.add(at); at = cycleStation(at, false); }
  assert.equal(seen.size, STATION_IDS.length);
  assert.equal(cycleStation('off', false), 'march', 'off wraps to the first track');
  let h: ReturnType<typeof cycleStation> = null;
  const loop: (string | null)[] = [];
  for (let i = 0; i < STATION_IDS.length + 1; i++) { h = cycleStation(h, true); loop.push(h); }
  assert.equal(loop.at(-1), null, 'back to the map default after Off');
  assert.equal(loop[0], 'march');
  assert.equal(new Set(loop).size, STATION_IDS.length + 1);
});

function join(room: ReturnType<typeof createRoom>, name: string) {
  const ws = fakeSocket();
  sockets.push(ws);
  room.connect(ws.socket);
  ws.send({ t: 'join', name, loadout: PISTOL, aspect: 1.5 });
  assert.ok(ws.sent.some((m) => m.t === 'welcome'), `${name} joined`);
  return ws;
}
const radios = (ws: ReturnType<typeof fakeSocket>) => ws.sent.filter((m): m is Extract<ServerMsg, { t: 'radio' }> => m.t === 'radio');
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

test('the radio message is accepted only in the Zombies and range rooms', () => {
  for (const [mode, ok] of [['ZOM', true], ['RNG', true], ['FFA', false], ['TDM', false], ['DOM', false], ['BR', false]] as const) {
    const room = createRoom(mode.toLowerCase(), mode, 1, accounts);
    const a = join(room, 'Aa');
    a.send({ t: 'radio', station: 'harbor' });
    assert.equal(radios(a).length, ok ? 1 : 0, mode);
    if (ok) assert.deepEqual(radios(a)[0], { t: 'radio', station: 'harbor', by: 'Aa' });
  }
});

test('in Zombies the whole squad hears the station, and a squadmate who joins later is told it', async () => {
  const room = createRoom('zom', 'ZOM', 1, accounts);
  const a = join(room, 'Aa');
  const b = join(room, 'Bb');
  a.send({ t: 'radio', station: 'wasteland' });
  for (const c of [a, b]) assert.deepEqual(radios(c), [{ t: 'radio', station: 'wasteland', by: 'Aa' }]);
  await wait(RADIO_INTERVAL_MS + 30);
  b.send({ t: 'radio', station: 'off' });
  for (const c of [a, b]) assert.equal(radios(c).at(-1)!.station, 'off');
  const late = join(room, 'Cc');
  assert.deepEqual(radios(late), [{ t: 'radio', station: 'off', by: null }]);
});

test('a client tuning faster than the interval is dropped without a word', () => {
  const room = createRoom('zom', 'ZOM', 1, accounts);
  const a = join(room, 'Aa');
  for (const station of ['march', 'park', 'summit', 'range'] as const) a.send({ t: 'radio', station });
  assert.equal(radios(a).length, 1);
  assert.equal(a.sent.filter((m) => m.t === 'error').length, 0);
});

test('a radio never changes the simulation', () => {
  const room = createRoom('zom', 'ZOM', 1, accounts);
  const a = join(room, 'Aa');
  const before = JSON.stringify([...room.world.players.values()].map((p) => [p.x, p.y, p.life.k]));
  const rng = room.world.rng;
  a.send({ t: 'radio', station: 'embassy' });
  assert.equal(room.world.rng, rng);
  assert.equal(JSON.stringify([...room.world.players.values()].map((p) => [p.x, p.y, p.life.k])), before);
});

// ---- placement ----

test('every versus map has a pool of hidden-radio spots', () => {
  for (const mode of ['FFA', 'TDM', 'DOM', 'BR'] as const) for (const id of ROTATION[mode]) {
    assert.ok((RADIO_POOL[id]?.length ?? 0) >= 8, `${id} (${mode}) has a pool`);
    assert.ok(VERSUS_MAPS.includes(id));
  }
});

test('hidden radios are the same for every client of a round and move between rounds', () => {
  for (const id of VERSUS_MAPS) {
    const a = hiddenRadios(id, 123456), b = hiddenRadios(id, 123456);
    assert.deepEqual(a, b, `${id} agrees with itself`);
    assert.ok(a.length >= HIDDEN_RADIOS.min && a.length <= HIDDEN_RADIOS.max, `${id}: ${a.length} radios`);
    const sets = new Set<string>();
    for (let round = 1; round <= 24; round++) sets.add(JSON.stringify(hiddenRadios(id, round * 90_000 + 17)));
    assert.ok(sets.size >= 20, `${id}: rounds differ (${sets.size} of 24 distinct)`);
    for (let i = 0; i < a.length; i++) for (let j = i + 1; j < a.length; j++) assert.ok(Math.hypot(a[i]!.x - a[j]!.x, a[i]!.y - a[j]!.y) >= HIDDEN_RADIOS.minGap, `${id}: spread out`);
  }
});

test('every versus map gets at least six hidden radios a round, spread across the map', () => {
  for (const id of VERSUS_MAPS) {
    for (let round = 1; round <= 40; round++) {
      const set = hiddenRadios(id, round * 61_000 + 3);
      assert.ok(set.length >= 6 && set.length <= HIDDEN_RADIOS.max, `${id} round ${round}: ${set.length} radios`);
      for (let i = 0; i < set.length; i++) for (let j = i + 1; j < set.length; j++) assert.ok(Math.hypot(set[i]!.x - set[j]!.x, set[i]!.y - set[j]!.y) >= HIDDEN_RADIOS.minGap, `${id} round ${round}: spread out`);
      // Not all in one half of the map.
      const xs = set.map((p) => p.x), ys = set.map((p) => p.y);
      assert.ok(Math.max(...xs) - Math.min(...xs) > 2000 || Math.max(...ys) - Math.min(...ys) > 2000, `${id} round ${round}: across the map`);
    }
  }
  assert.notDeepEqual(hiddenRadios('plaza', 5), hiddenRadios('oldtown', 5));
});

test('every pooled spot is walkable, reachable from a spawn, tucked away, and clear of spawn pads and zones', () => {
  for (const id of VERSUS_MAPS) {
    const def = MAPS[id];
    const n = Math.floor(def.size / CELL);
    const free = standable(def, n);
    const spawns = [...def.spawns.red, ...def.spawns.blue, ...def.spawns.ffa];
    const reached = new Uint8Array(n * n);
    flood(free, n, spawns.flatMap((r) => cellsIn(r, n)), reached);
    for (const [x, y] of RADIO_POOL[id]!) {
      const i = Math.floor(x / CELL), j = Math.floor(y / CELL), c = j * n + i;
      assert.ok(free[c], `${id} (${x}, ${y}) is walkable`);
      assert.ok(reached[c], `${id} (${x}, ${y}) can be walked to from a spawn`);
      assert.ok(tuck(free, n, i, j).arc, `${id} (${x}, ${y}) is tucked into a corner or alcove, not a lane`);
      for (const r of spawns) {
        const dx = Math.max(r.x - x, 0, x - (r.x + r.w)), dy = Math.max(r.y - y, 0, y - (r.y + r.h));
        assert.ok(Math.hypot(dx, dy) >= SPAWN_CLEAR, `${id} (${x}, ${y}) is clear of the spawn pads`);
      }
      for (const z of def.zones) assert.ok(Math.hypot(z.x - x, z.y - y) >= ZONE_CLEAR && ZONE_CLEAR > ZONE_RADIUS, `${id} (${x}, ${y}) is clear of zone`);
    }
    const pool = RADIO_POOL[id]!;
    for (let i = 0; i < pool.length; i++) for (let j = i + 1; j < pool.length; j++) assert.ok(Math.hypot(pool[i]![0] - pool[j]![0], pool[i]![1] - pool[j]![1]) >= POOL_GAP - 1, `${id}: pool spots are spread`);
  }
});

test('the fixed radios stand on walkable ground, off the spawn pads', () => {
  for (const id of ['range', 'outpost'] as MapId[]) {
    const def = MAPS[id];
    const p = FIXED_RADIO[id]!;
    assert.ok(p, `${id} has a radio`);
    const n = Math.floor(def.size / CELL);
    const free = standable(def, n);
    assert.ok(free[Math.floor(p.y / CELL) * n + Math.floor(p.x / CELL)], `${id} radio is on open floor`);
    for (const r of [...def.spawns.red, ...def.spawns.ffa]) assert.ok(!(p.x > r.x - 24 && p.x < r.x + r.w + 24 && p.y > r.y - 24 && p.y < r.y + r.h + 24), `${id} radio is off the pads`);
  }
  const core = MAPS.outpost.siege!.core;
  assert.ok(Math.hypot(FIXED_RADIO.outpost!.x - core.x, FIXED_RADIO.outpost!.y - core.y) < 260, 'the outpost radio stands by the core');
  const booth = MAPS.range.range!.pad;
  assert.ok(Math.hypot(FIXED_RADIO.range!.x - booth.x, FIXED_RADIO.range!.y - booth.y) < 200, 'the range radio stands by the booth');
});

test('the round\'s name rides the snapshot: the clock\'s end in clocked rounds, the start of a Last Squad round', () => {
  const ffa = createWorld('FFA', 1, 'plaza');
  addPlayer(ffa, 'a', PISTOL, {});
  const snap = snapshotFor(ffa, [...ffa.players.keys()][0]!);
  assert.equal(roundKeyOf(snap), snap.match.roundEndsAt);
  assert.ok(roundKeyOf(snap) !== null);
  const br = createWorld('BR', 1, 'plaza');
  addPlayer(br, 'a', PISTOL, { team: 'red' });
  const bs = snapshotFor(br, [...br.players.keys()][0]!);
  assert.equal(bs.match.roundEndsAt, null);
  assert.equal(roundKeyOf(bs), bs.royale!.round);
});
