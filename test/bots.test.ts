/// <reference types="node" />
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { GUNS, WORLD, type WeaponId } from '../src/shared/defs.ts';
import type { InputState, WallView } from '../src/shared/protocol.ts';
import { setInput, step } from '../src/shared/sim.ts';
import { snapshotFor } from '../src/shared/sim/snapshot.ts';
import { botName, botThink, newBotMemory, type BotMemory } from '../src/server/bots.ts';
import { arenaFor } from '../src/server/bot/arena.ts';
import type { PersonalityId } from '../src/server/bot/intent.ts';
import { emptyWorld, setWalls, spawnAt } from './helpers.ts';

const rand = (() => { let x = 7; return () => ((x = (x * 16807) % 2147483647) / 2147483647); })();

const TICK_MS = 1000 / 30;
const seeded = (seed: number) => { let x = seed; return () => ((x = (x * 16807) % 2147483647) / 2147483647); };

type Look = { tick: number; angle: number; fire: boolean; bearing: number; leadAngle: number };

function watch(opts: { seed: number; ticks: number; weapon?: WeaponId; targetAt: { x: number; y: number }; targetVel?: { x: number; y: number }; walls?: (tick: number) => WallView[] }): Look[] {
  const w = emptyWorld();
  const bot = spawnAt(w, 1000, 1000, { loadout: { weapon: opts.weapon ?? 'assault' } });
  const target = spawnAt(w, opts.targetAt.x, opts.targetAt.y);
  const vel = opts.targetVel ?? { x: 0, y: 0 };
  const r = seeded(opts.seed);
  let mem = newBotMemory(r);
  const looks: Look[] = [];
  for (let i = 0; i < opts.ticks; i++) {
    if (opts.walls) setWalls(w, opts.walls(i));
    const d = botThink(snapshotFor(w, bot.id), arenaFor(w), mem, r);
    mem = d.mem;
    const flight = Math.hypot(target.x - bot.x, target.y - bot.y) / GUNS[bot.loadout.weapon].bulletSpeed;
    const leadAngle = Math.atan2(target.y + vel.y * flight - bot.y, target.x + vel.x * flight - bot.x);
    looks.push({ tick: i, angle: d.input.angle, fire: d.input.fire, bearing: Math.atan2(target.y - bot.y, target.x - bot.x), leadAngle });
    target.x += vel.x * TICK_MS / 1000;
    target.y += vel.y * TICK_MS / 1000;
    step(w, TICK_MS);
  }
  return looks;
}

const rms = (xs: number[]) => Math.sqrt(xs.reduce((a, x) => a + x * x, 0) / xs.length);
const aimErrors = (looks: Look[], from: number, to: number) => looks.slice(from, to).map((l) => Math.atan2(Math.sin(l.angle - l.leadAngle), Math.cos(l.angle - l.leadAngle)));

test('a bot holds fire at an enemy behind a wall and fires once it can see them', () => {
  const wall: WallView = { x: 1180, y: 900, w: 40, h: 200, built: false, material: 'concrete' };
  const looks = watch({ seed: 3, ticks: 60, targetAt: { x: 1400, y: 1000 }, walls: (i) => (i < 30 ? [wall] : []) });
  assert.ok(looks.slice(0, 30).every((l) => !l.fire), 'no shots into the wall');
  assert.ok(looks.slice(30).some((l) => l.fire), 'fires with a clear line');
});

test('a bot waits a human-like reaction time after first seeing an enemy before it fires', () => {
  for (let seed = 1; seed <= 20; seed++) {
    const firstFire = watch({ seed, ticks: 30, targetAt: { x: 1400, y: 1000 } }).find((l) => l.fire);
    assert.ok(firstFire, `seed ${seed}: fires eventually`);
    const ms = firstFire.tick * TICK_MS;
    assert.ok(ms >= 250 - TICK_MS && ms <= 400 + TICK_MS, `seed ${seed}: first shot after ${ms.toFixed(0)}ms`);
  }
});

test('a bot misses a fast-strafing target by more than a still one', () => {
  const still: number[] = [], strafing: number[] = [];
  for (let seed = 1; seed <= 20; seed++) {
    still.push(...aimErrors(watch({ seed, ticks: 90, targetAt: { x: 1500, y: 1000 } }), 45, 90));
    strafing.push(...aimErrors(watch({ seed, ticks: 90, targetAt: { x: 1500, y: 700 }, targetVel: { x: 0, y: 300 } }), 45, 90));
  }
  assert.ok(rms(strafing) > 2 * rms(still), `strafing ${rms(strafing).toFixed(3)} rad vs still ${rms(still).toFixed(3)} rad`);
});

test('a bot aims more steadily the longer it tracks the same target', () => {
  const early: number[] = [], late: number[] = [];
  for (let seed = 1; seed <= 40; seed++) {
    const looks = watch({ seed, ticks: 90, targetAt: { x: 1500, y: 1000 } });
    early.push(...aimErrors(looks, 0, 10));
    late.push(...aimErrors(looks, 60, 90));
  }
  assert.ok(rms(early) > 1.5 * rms(late), `first 300ms ${rms(early).toFixed(3)} rad vs after 2s ${rms(late).toFixed(3)} rad`);
});

test('a bot ignores an enemy in the snapshot preload margin beyond its 16:9 view', () => {
  const looks = watch({ seed: 5, ticks: 30, weapon: 'sniper', targetAt: { x: 1000, y: 1000 + WORLD.viewRadius + 30 } });
  assert.ok(looks.every((l) => !l.fire), 'never fires at what a player there could not see');
});

/** A bot of `persona` at (1000, 1000) fighting a still enemy 400px right in the open, both kept at full health, its inputs fed to the sim. */
function duel(persona: PersonalityId, seed: number, ticks: number): InputState[] {
  const w = emptyWorld();
  const bot = spawnAt(w, 1000, 1000, { loadout: { weapon: 'assault' } });
  const enemy = spawnAt(w, 1400, 1000);
  const r = seeded(seed);
  let mem: BotMemory = { ...newBotMemory(r), persona };
  const out: InputState[] = [];
  for (let i = 0; i < ticks; i++) {
    for (const p of [bot, enemy]) if (p.life.k === 'alive') p.life.hp = 100;
    const d = botThink(snapshotFor(w, bot.id), arenaFor(w), mem, r);
    mem = d.mem;
    setInput(w, bot.id, i + 1, d.input);
    out.push(d.input);
    step(w, TICK_MS);
  }
  return out;
}

const moving = (i: InputState) => i.up || i.down || i.left || i.right;
const keysOf = (i: InputState) => `${+i.up}${+i.down}${+i.left}${+i.right}`;

test('a bot in its range plants its feet to shoot', () => {
  for (const persona of ['cautious', 'marksman'] as const) {
    const shots = Array.from({ length: 10 }, (_, s) => duel(persona, s + 1, 150)).flat().filter((i) => i.fire);
    const still = shots.filter((i) => !moving(i)).length / shots.length;
    assert.ok(still > 0.6, `${persona}: ${(100 * still).toFixed(0)}% of shots fired standing still`);
  }
});

test('a bot\'s movement keys hold for a while instead of flickering tick to tick', () => {
  for (const persona of ['aggressive', 'cautious', 'marksman'] as const) {
    for (let seed = 1; seed <= 5; seed++) {
      const inputs = duel(persona, seed, 150);
      const changes = inputs.slice(1).filter((i, k) => keysOf(i) !== keysOf(inputs[k]!)).length;
      assert.ok(changes <= 12, `${persona} seed ${seed}: ${changes} key changes in 5s`);
    }
  }
});

test('a bot leads a target moving across its line of fire', () => {
  const offsets: number[] = [];
  for (let seed = 1; seed <= 10; seed++) {
    for (const l of watch({ seed, ticks: 60, weapon: 'sniper', targetAt: { x: 1800, y: 800 }, targetVel: { x: 0, y: 300 } }).slice(30)) offsets.push(l.angle - l.bearing);
  }
  const mean = offsets.reduce((a, b) => a + b, 0) / offsets.length;
  assert.ok(mean > 0.01, `aims ahead (downward) of a target moving down: mean angle ${mean.toFixed(3)}`);
});

test('bot names never repeat a name already in the room', () => {
  const taken = new Set<string>();
  for (let i = 0; i < 40; i++) {
    const n = botName(taken, rand);
    assert.ok(!taken.has(n), `${n} reused`);
    taken.add(n);
  }
});
