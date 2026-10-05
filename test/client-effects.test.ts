/// <reference types="node" />
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { HIT_FLASH_MS, hitFlashes, KICK_MS, kicks } from '../src/client/effects.ts';
import type { Effect } from '../src/client/state.ts';

const hit = (victim: number | null, born: number): Effect => ({ kind: 'impact', surface: victim === null ? 'crate' : 'player', x: 0, y: 0, victim, born });

test('a body flashes from its newest hit until the flash runs out', () => {
  const now = 1000;
  const flashes = hitFlashes([hit(2, now - 10), hit(2, now - 50), hit(3, now - HIT_FLASH_MS), hit(null, now)], now);
  assert.deepEqual([...flashes], [[2, now - 10]], 'only the live player hit, its newest one');
});

const shot = (owner: number, born: number): Effect => ({ kind: 'flash', x: 0, y: 0, angle: 0, owner, born });

test("a gun kicks back from its shooter's newest shot until the kick runs out, and a hit kicks nothing", () => {
  const now = 1000;
  const recoil = kicks([shot(4, now - 30), shot(4, now - 5), shot(6, now - KICK_MS), hit(4, now)], now);
  assert.deepEqual([...recoil], [[4, now - 5]], "only shooter 4's live kick, from its newest shot");
});
