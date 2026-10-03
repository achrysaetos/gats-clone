/// <reference types="node" />
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { WEAPONS, type WeaponId } from '../src/shared/defs.ts';
import type { WallView } from '../src/shared/protocol.ts';
import { snapshotFor, step } from '../src/shared/sim.ts';
import { botName, botThink, newBotMemory } from '../src/server/bots.ts';
import { emptyWorld, spawnAt } from './helpers.ts';

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
    const d = botThink(snapshotFor(w, bot.id), opts.walls?.(i) ?? [], mem, r);
    mem = d.mem;
    const flight = Math.hypot(target.x - bot.x, target.y - bot.y) / WEAPONS[bot.loadout.weapon].bulletSpeed;
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
  const wall: WallView = { x: 1180, y: 900, w: 40, h: 200, built: false };
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

test('a bot in range strafes sideways instead of standing still', () => {
  const w = emptyWorld();
  const bot = spawnAt(w, 1000, 1000, { loadout: { weapon: 'assault' } });
  spawnAt(w, 1300, 1000);
  const d = botThink(snapshotFor(w, bot.id), [], newBotMemory(rand), rand);
  assert.ok(d.input.up || d.input.down, 'moves across the line to the enemy');
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
