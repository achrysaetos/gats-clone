/// <reference types="node" />
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { WORLD } from '../src/shared/defs.ts';
import { MAPS } from '../src/shared/maps.ts';
import { setInput, step } from '../src/shared/sim.ts';
import { snapshotFor } from '../src/shared/sim/snapshot.ts';
import { createWorld, type World } from '../src/shared/sim/world.ts';
import { botThink, newBotMemory, type BotMemory } from '../src/server/bots.ts';
import { arenaFor, losClear } from '../src/server/bot/arena.ts';
import { coverPointsNear, pickCover } from '../src/server/bot/cover.ts';
import type { Intent } from '../src/server/bot/intent.ts';
import { spawnAt, TICK_MS } from './helpers.ts';

const seeded = (seed: number) => { let x = seed; return () => ((x = (x * 16807) % 2147483647) / 2147483647); };
const geoWorld = (): World => {
  const w = createWorld('FFA', 1, 'geo-test');
  w.crates = []; w.barrels = []; w.props = []; w.airdrops = { due: [], flight: null };
  return w;
};
const goTo = (spot: { x: number; y: number }): Intent => ({ k: 'takePosition', spot, facing: { x: spot.x, y: spot.y - 400 }, since: 0, holdUntil: Infinity });

function drive(w: World, botId: number, mem: BotMemory, ticks: number, r: () => number, each?: (i: number) => void) {
  let m = mem;
  for (let i = 0; i < ticks; i++) {
    each?.(i);
    const bot = w.players.get(botId)!;
    const d = botThink(snapshotFor(w, botId), arenaFor(w), m, r);
    m = d.mem;
    setInput(w, botId, i + 1, d.input);
    step(w, TICK_MS);
    void bot;
  }
  return m;
}

test('a bot hides behind a polygon from a threat, in cover its attacker cannot shoot', () => {
  const w = geoWorld();
  const arena = arenaFor(w);
  // The round tank (a 10 m polygon) stands at (2300, 1850); the threat is east of it, the bot west of it.
  const threat = { x: 2900, y: 1850 }, me = { x: 1800, y: 1860 };
  assert.ok(coverPointsNear(arena.cover, { x: 2300, y: 1850 }, 450).length > 4, 'the tank has cover points round its curve');
  const pick = pickCover(arena.cover, arena.nav, arena.sightWalls, me, [threat], { reach: 700, range: 400, peek: false });
  assert.ok(pick, 'found cover');
  assert.equal(losClear(arena, pick.spot, threat, 'shot'), false, 'the threat cannot hit the spot');
  assert.ok(pick.spot.x < 2300, `west of the tank: ${JSON.stringify(pick.spot)}`);
});

test('a bot under fire with little health retreats to cover behind the tank', () => {
  const w = geoWorld();
  const bot = spawnAt(w, 2000, 1500, { loadout: { weapon: 'assault' }, kind: 'bot' });
  const foe = spawnAt(w, 2800, 1500, { loadout: { weapon: 'assault' } });
  const r = seeded(7);
  let mem = newBotMemory(r);
  let hid = false;
  assert.ok(losClear(arenaFor(w), bot, foe, 'shot'), 'the bot starts in the open');
  mem = drive(w, bot.id, mem, 240, r, (i) => {
    if (bot.life.k === 'alive') { bot.life.hp = Math.min(bot.life.hp, 8); bot.life.shieldUntil = Infinity; }
    if (foe.life.k === 'alive') foe.life.hp = 100;
    setInput(w, foe.id, i + 1, { ...foe.input, left: false, angle: Math.atan2(bot.y - foe.y, bot.x - foe.x), fire: i % 5 < 3, shots: foe.input.shots + (i % 5 === 0 ? 1 : 0) });
    if (i > 120 && !losClear(arenaFor(w), foe, bot, 'shot')) hid = true;
  });
  assert.ok(hid, `the bot ended up out of the foe's line of fire (at ${Math.round(bot.x)}, ${Math.round(bot.y)})`);
});

test('a bot walks through a swing door by pushing it, without stalling in the leaf', () => {
  const w = geoWorld();
  const bot = spawnAt(w, 3525, 760, { kind: 'bot' });
  const r = seeded(3);
  const mem = { ...newBotMemory(r), intent: goTo({ x: 3525, y: 380 }) };
  let best = Infinity, tickAt = -1;
  drive(w, bot.id, mem, 30 * 12, r, (i) => {
    const d = Math.hypot(bot.x - 3525, bot.y - 380);
    if (d < best) { best = d; tickAt = i; }
  });
  assert.ok(best < 90, `reached the corridor (closest ${Math.round(best)}px)`);
  assert.ok(tickAt < 30 * 9, `in under nine seconds (at tick ${tickAt})`);
});

test('a bot passes an auto sliding door and a double swing door too', () => {
  for (const [from, to] of [[{ x: 2325, y: 760 }, { x: 2325, y: 380 }], [{ x: 4125, y: 760 }, { x: 4125, y: 380 }], [{ x: 2925, y: 760 }, { x: 2925, y: 380 }]] as const) {
    const w = geoWorld();
    const bot = spawnAt(w, from.x, from.y, { kind: 'bot' });
    const r = seeded(11);
    let best = Infinity;
    drive(w, bot.id, { ...newBotMemory(r), intent: goTo(to) }, 30 * 12, r, () => { best = Math.min(best, Math.hypot(bot.x - to.x, bot.y - to.y)); });
    assert.ok(best < 90, `through the door at x=${from.x} (closest ${Math.round(best)}px)`);
  }
});

test('bots do not pick cover standing in a doorway', () => {
  const arena = arenaFor(geoWorld());
  for (const d of MAPS['geo-test'].doors!) {
    const mid = d.axis === 'h' ? { x: d.x + d.w / 2, y: d.y } : { x: d.x, y: d.y + d.w / 2 };
    for (const c of coverPointsNear(arena.cover, mid, 100)) assert.ok(Math.hypot(c.x - mid.x, c.y - mid.y) > WORLD.playerRadius * 2, `${d.id}: cover at ${Math.round(c.x)},${Math.round(c.y)}`);
  }
});

test('a bot hurt in the corridor retreats through a door into a room, out of the foe\'s sight', () => {
  const w = geoWorld();
  const bot = spawnAt(w, 3300, 380, { loadout: { weapon: 'assault' }, kind: 'bot' });
  const foe = spawnAt(w, 3900, 380, { loadout: { weapon: 'assault' } });
  const r = seeded(5);
  let hidden = 0;
  drive(w, bot.id, newBotMemory(r), 30 * 10, r, (i) => {
    if (bot.life.k === 'alive') { bot.life.hp = Math.min(bot.life.hp, 8); bot.life.shieldUntil = Infinity; }
    if (foe.life.k === 'alive') foe.life.hp = 100;
    setInput(w, foe.id, i + 1, { ...foe.input, angle: Math.atan2(bot.y - foe.y, bot.x - foe.x), fire: i % 5 < 3, shots: foe.input.shots + (i % 5 === 0 ? 1 : 0) });
    if (i > 150 && bot.y > 560 && !losClear(arenaFor(w), foe, bot, 'shot')) hidden++;
  });
  assert.ok(hidden > 20, `spent ${hidden} ticks in a room, out of sight (bot ended at ${Math.round(bot.x)}, ${Math.round(bot.y)})`);
});
