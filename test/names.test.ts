/// <reference types="node" />
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { WORLD } from '../src/shared/defs.ts';
import type { Accounts } from '../src/server/accounts.ts';
import { uniqueName } from '../src/server/names.ts';
import { createRoom } from '../src/server/room.ts';

const none = () => false;

test('a free name is kept as typed', () => {
  assert.equal(uniqueName('Alex', ['Juno'], none), 'Alex');
});

test('a taken name gets the lowest free number, compared case-insensitively', () => {
  assert.equal(uniqueName('Alex', ['alex'], none), 'Alex2');
  assert.equal(uniqueName('Alex', ['Alex', 'Alex2'], none), 'Alex3');
});

test('a reserved name and its reserved variants are skipped', () => {
  const reserved = (n: string) => ['tester', 'tester2'].includes(n.toLowerCase());
  assert.equal(uniqueName('Tester', [], reserved), 'Tester3');
});

test('suffixed names still fit the 16-character limit', () => {
  const long = 'Abcdefghijklmnop';
  assert.equal(uniqueName(long, [long], none), 'Abcdefghijklmno2');
});

test('bots never take a registered account name', () => {
  const registeredUnlessNumbered = (name: string) => (/\d/.test(name) ? null : { name, kills: 0, deaths: 0, score: 0, games: 0, best: 0 });
  const accounts = { stats: registeredUnlessNumbered } as unknown as Accounts;
  const room = createRoom('ffa', 'FFA', 1, accounts);
  const bots = [...room.world.players.values()].map((p) => p.name);
  assert.equal(bots.length, WORLD.minPlayers);
  assert.deepEqual(bots.filter((n) => registeredUnlessNumbered(n)), [], `bot names ${bots.join(', ')}`);
});
