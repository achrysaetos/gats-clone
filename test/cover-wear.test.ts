/// <reference types="node" />
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { FEEL, WORLD } from '../src/shared/defs.ts';
import { KIT, type PieceId } from '../src/shared/kit.ts';
import { MAPS } from '../src/shared/maps.ts';
import { setInput, step } from '../src/shared/sim.ts';
import { snapshotFor } from '../src/shared/sim/snapshot.ts';
import type { Crate, World } from '../src/shared/sim/world.ts';
import { arenaFor } from '../src/server/bot/arena.ts';
import { freshAwareness, perceive } from '../src/server/bot/awareness.ts';
import { bandFor, nextIntent, PERSONALITIES, startIntent, type Intent, type IntentCtx, type Plan } from '../src/server/bot/intent.ts';
import { coverBroke, coverNear, pickCover } from '../src/server/bot/cover.ts';
import { botThink, newBotMemory } from '../src/server/bots.ts';
import { crateOf, emptyWorld, hpOf, press, run, shootOnce, spawnAt, TICK_MS } from './helpers.ts';

const R = WORLD.playerRadius;
const seeded = (seed: number) => { let x = seed; return () => ((x = (x * 16807) % 2147483647) / 2147483647); };

/** Sandbags turned to run north and south, their west face at x 900, centred on y 1000. */
function sandbags(w: World, hp: number = FEEL.cover.hp.sandbags): Crate {
  const c: Crate = { ...crateOf(9001, 900, 950, 'sandbags'), r: 1, w: 25, h: 100, hp };
  w.crates.push(c);
  w.wallsVersion++;
  return c;
}

const standing = (c: Crate) => c.respawnAt === null;

/** The intent a cautious bot moves to from `cur`, held so only the interrupts and the peek's phases can change it. */
function decide(w: World, id: number, cur: Plan | Intent): Intent {
  const snap = snapshotFor(w, id);
  const me = snap.players.find((p) => p.id === id)!;
  const { view } = perceive(snap, arenaFor(w), me, freshAwareness());
  const persona = PERSONALITIES.cautious;
  const ctx: IntentCtx = { tick: snap.tick, persona, role: null, band: bandFor(view.me.gun, persona), arena: arenaFor(w), rand: seeded(3) };
  return nextIntent('since' in cur ? cur : { ...startIntent(cur, ctx), holdUntil: Infinity }, view, ctx);
}

test('low cover wears under fire and breaks, scoring nothing, and shelters whoever is behind it until it does', () => {
  const w = emptyWorld();
  const shooter = spawnAt(w, 700, 1000, { loadout: { weapon: 'assault' } });
  const behind = spawnAt(w, 1100, 1000);
  const bags = sandbags(w);
  let worn = bags.hp, shots = 0;
  while (standing(bags) && shots < 200) {
    shootOnce(w, shooter, 0, 150);
    shots++;
    assert.ok(bags.hp <= worn, 'it only ever loses health');
    worn = bags.hp;
    if (standing(bags)) assert.equal(hpOf(behind), 100, `shot ${shots}: the sandbags still shelter the player behind`);
  }
  assert.ok(!standing(bags), `broke after ${shots} shots`);
  assert.equal(shooter.score, 0, 'breaking cover scores nothing');
  for (let i = 0; i < 5 && hpOf(behind) === 100; i++) shootOnce(w, shooter, 0, 150);
  assert.ok(hpOf(behind) < 100, 'with it gone, rounds reach the player behind');
});

test('only low cover breaks: every barrier and sandbag on a map wears down, and tall walls and containers never do', () => {
  const low = (Object.keys(KIT) as PieceId[]).filter((p) => KIT[p].breaks?.cover);
  assert.deepEqual(low.sort(), ['lowwall', 'sandbags', 'wall.broken']);
  for (const p of low) assert.ok(KIT[p].height <= 40, `${p} is low`);
  for (const p of ['wall', 'wall.long', 'wall.short', 'wall.post', 'wall.thick', 'container.blue'] as const) assert.equal(KIT[p].breaks, undefined, `${p} stays solid`);
  for (const [id, map] of Object.entries(MAPS)) {
    const placed = map.pieces.filter((at) => KIT[at.p].breaks?.cover).length;
    assert.equal(map.breakables.filter((at) => KIT[at.p].breaks?.cover).length, placed, `${id}: every piece of low cover can break`);
  }
});

test('worn cover stops bodies at its full size until the moment it breaks', () => {
  const w = emptyWorld();
  const walker = spawnAt(w, 850, 1000);
  const bags = sandbags(w, 1);
  press(w, walker, { right: true });
  run(w, 600);
  assert.ok(Math.abs(walker.x - (900 - R)) < 0.5, `held at the sandbags' full face: x ${walker.x.toFixed(1)}`);
  shootOnce(w, spawnAt(w, 912, 700), Math.PI / 2, 300);
  assert.ok(!standing(bags), 'a shot broke it');
  run(w, 600);
  assert.ok(walker.x > 950, `walks on through where it stood: x ${walker.x.toFixed(1)}`);
});

test('broken cover stands again after its wait at full health, but never round a body in its footprint', () => {
  const w = emptyWorld();
  const bags = sandbags(w, 1);
  shootOnce(w, spawnAt(w, 912, 700), Math.PI / 2, 300);
  assert.ok(!standing(bags));
  const squatter = spawnAt(w, 912, 1000);
  run(w, FEEL.cover.respawnMs + 500);
  assert.ok(!standing(bags), 'held while someone stands where it would be');
  press(w, squatter, { left: true });
  run(w, 1000);
  assert.ok(standing(bags), 'stands once the footprint is clear');
  assert.equal(bags.hp, FEEL.cover.hp.sandbags);
});

test('Last Squad keeps broken cover broken for the match', () => {
  const w = emptyWorld('BR');
  const bags = sandbags(w, 1);
  shootOnce(w, spawnAt(w, 912, 700, { team: 'blue' }), Math.PI / 2, 300);
  assert.equal(bags.respawnAt, Infinity);
});

test('bots drop the cover points beside a broken piece, and take them up again when it stands', () => {
  const w = emptyWorld();
  const bags = sandbags(w);
  const near = () => coverNear(arenaFor(w).cover, { x: 912, y: 1000 }, 80).length;
  const before = near();
  assert.ok(before > 0, 'standing sandbags are cover');
  bags.respawnAt = w.now + 1000;
  assert.equal(near(), 0, 'broken sandbags are not');
  run(w, 1100);
  assert.equal(near(), before, 'standing again, they are cover again');
});

test('a bot hiding behind cover that breaks stops hiding there: a peek turns into a fight, a retreat finds new cover', () => {
  const w = emptyWorld();
  const bot = spawnAt(w, 860, 1000, { loadout: { weapon: 'assault' } });
  const enemy = spawnAt(w, 1500, 1000);
  const bags = sandbags(w);
  const arena = arenaFor(w);
  const pick = pickCover(arena.cover, arena.nav, [bags], bot, [enemy], { reach: 300, range: 500, peek: false });
  assert.ok(pick, 'the sandbags give the bot a spot');
  const peek = decide(w, bot.id, { k: 'peekAndHide', target: enemy.id, spot: pick.spot, peek: { x: 860, y: 900 }, phase: 'hide', phaseUntil: Infinity });
  assert.equal(peek.k, 'peekAndHide', 'behind standing cover it keeps hiding');
  const retreat = decide(w, bot.id, { k: 'retreatAndHeal', spot: pick.spot, threat: enemy });
  assert.equal(retreat.k, 'retreatAndHeal');
  assert.equal(retreat.k === 'retreatAndHeal' && retreat.spot, pick.spot, 'and keeps its retreat');
  bags.respawnAt = w.now + 60_000;
  assert.ok(coverBroke(arenaFor(w).cover, pick.spot));
  assert.equal(decide(w, bot.id, peek).k, 'engage', 'the peek becomes a straight fight');
  const moved = decide(w, bot.id, retreat);
  assert.ok(moved.k === 'retreatAndHeal' && moved.spot !== pick.spot, 'the retreat leaves the broken cover');
});

test('a bot never shoots cover for its own sake', () => {
  const w = emptyWorld();
  const bot = spawnAt(w, 1000, 1000, { loadout: { weapon: 'assault' } });
  const bags: Crate = { ...crateOf(9001, 1250, 988, 'sandbags'), hp: FEEL.cover.hp.sandbags };
  w.crates.push(bags);
  const r = seeded(1);
  let mem = newBotMemory(r);
  for (let i = 0; i < 90; i++) {
    const d = botThink(snapshotFor(w, bot.id), arenaFor(w), mem, r);
    mem = d.mem;
    assert.ok(!d.input.fire, `tick ${i}: holds fire`);
    setInput(w, bot.id, i + 1, d.input);
    step(w, TICK_MS);
  }
  assert.equal(bags.hp, FEEL.cover.hp.sandbags);
});
