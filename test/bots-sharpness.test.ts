/// <reference types="node" />
import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { PlayerKind } from '../src/shared/defs.ts';
import { MAPS } from '../src/shared/maps.ts';
import { step } from '../src/shared/sim.ts';
import { snapshotFor } from '../src/shared/sim/snapshot.ts';
import type { Player } from '../src/shared/sim/world.ts';
import { botThink, newBotMemory } from '../src/server/bots.ts';
import { arenaFor } from '../src/server/bot/arena.ts';
import { emptyWorld, equip, spawnAt, TICK_MS } from './helpers.ts';

const seeded = (seed: number) => { let x = seed; return () => ((x = (x * 16807) % 2147483647) / 2147483647); };
const rms = (xs: number[]) => Math.sqrt(xs.reduce((a, x) => a + x * x, 0) / xs.length);
const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));

type Look = { tick: number; angle: number; fire: boolean; bearing: number };

function duel(seed: number, ticks: number, kind: PlayerKind, dress: (target: Player) => void): Look[] {
  const w = emptyWorld();
  const bot = spawnAt(w, 1000, 1000, { loadout: { weapon: 'assault' } });
  const target = spawnAt(w, 1500, 1000, { kind });
  dress(target);
  const r = seeded(seed);
  let mem = newBotMemory(r);
  const looks: Look[] = [];
  for (let i = 0; i < ticks; i++) {
    const d = botThink(snapshotFor(w, bot.id), arenaFor(w), mem, r);
    mem = d.mem;
    looks.push({ tick: i, angle: d.input.angle, fire: d.input.fire, bearing: Math.atan2(target.y - bot.y, target.x - bot.x) });
    step(w, TICK_MS);
  }
  return looks;
}

const fresh = () => {};
const veteran = (t: Player) => { t.level = 5; };
const hunted = (t: Player) => equip(t, 'executioner');

function aimError(kind: PlayerKind, dress: (t: Player) => void): number {
  const errs: number[] = [];
  for (let seed = 1; seed <= 30; seed++) errs.push(...duel(seed, 60, kind, dress).map((l) => wrap(l.angle - l.bearing)));
  return rms(errs);
}

function meanReactionMs(kind: PlayerKind, dress: (t: Player) => void): number {
  let sum = 0;
  for (let seed = 1; seed <= 30; seed++) sum += (duel(seed, 30, kind, dress).find((l) => l.fire)?.tick ?? 30) * TICK_MS;
  return sum / 30;
}

test('bots aim tighter at a high-level human than at a fresh one', () => {
  const a = aimError('human', fresh), b = aimError('human', veteran);
  assert.ok(b < 0.6 * a, `level 5 ${b.toFixed(3)} rad vs level 0 ${a.toFixed(3)} rad`);
});

test('bots react faster to a hunted human than to a fresh one', () => {
  const a = meanReactionMs('human', fresh), b = meanReactionMs('human', hunted);
  assert.ok(b < 0.8 * a, `hunted ${b.toFixed(0)}ms vs fresh ${a.toFixed(0)}ms`);
});

test('bots fight a high-level or hunted bot with the same aim and reaction as a fresh one', () => {
  assert.equal(aimError('bot', veteran), aimError('bot', fresh), 'a level 5 bot draws base aim');
  assert.equal(meanReactionMs('bot', hunted), meanReactionMs('bot', fresh), 'a hunted bot draws base reaction');
});
