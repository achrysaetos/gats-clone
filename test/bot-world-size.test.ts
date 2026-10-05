/// <reference types="node" />
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { test } from 'node:test';

const BOT = new URL('../src/server/bot/', import.meta.url);

test('bot code reads the map and its size in one place, the arena, and everything else asks the arena', () => {
  const files = [...readdirSync(BOT).map((f) => new URL(f, BOT)), new URL('../src/server/bots.ts', import.meta.url)];
  const uses = files.flatMap((f) => readFileSync(f, 'utf8').split('\n')
    .filter((l) => /\bMAPS\[|\bWORLD\.size\b|\bmapSize\b|\.map\]\.size/.test(l))
    .map((l) => `${f.pathname.split('/src/')[1]}: ${l.trim()}`));
  assert.deepEqual(uses, ['server/bot/arena.ts: const size = MAPS[w.map].size;']);
});
