/// <reference types="node" />
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { test } from 'node:test';

const BOT = new URL('../src/server/bot/', import.meta.url);

test('bot code reads the world size in one place, the arena, so a per-map size is a one-line change', () => {
  const files = [...readdirSync(BOT).map((f) => new URL(f, BOT)), new URL('../src/server/bots.ts', import.meta.url)];
  const uses = files.flatMap((f) => readFileSync(f, 'utf8').split('\n').filter((l) => l.includes('WORLD.size')).map((l) => `${f.pathname.split('/src/')[1]}: ${l.trim()}`));
  assert.deepEqual(uses, ['server/bot/arena.ts: const size = WORLD.size;']);
});
