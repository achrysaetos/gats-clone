import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chatEntries, parseMuted, serializeMuted, toggleMute } from '../src/client/chatmute.ts';
import type { ChatLine } from '../src/client/state.ts';

const said = (from: string, text: string, at: number): ChatLine => ({ from, text, team: null, at });
const describe = (lines: ChatLine[], muted: Set<string>) =>
  chatEntries(lines, muted).map((e) => (e.kind === 'said' ? `${e.line.from || '*'}: ${e.line.text}` : `[muted ${e.from} @${e.at}]`));

test('toggling a name mutes it, toggling again unmutes it, and the input set is left untouched', () => {
  const none = new Set<string>();
  const one = toggleMute(none, 'Spammer');
  assert.deepEqual([...one], ['Spammer']);
  assert.deepEqual([...none], []);
  assert.deepEqual([...toggleMute(one, 'Spammer')], []);
});

test('names match exactly, so muting one player never hides a differently cased or longer name', () => {
  const muted = new Set(['Ann']);
  assert.deepEqual(describe([said('ann', 'a', 1), said('Anne', 'b', 2), said('Ann', 'c', 3)], muted), ['ann: a', 'Anne: b', '[muted Ann @3]']);
});

test('a muted player\'s lines are hidden and collapse to one marker at their latest line', () => {
  const lines = [said('Bob', 'spam 1', 1), said('Cat', 'hi', 2), said('Bob', 'spam 2', 3), said('Dan', 'gg', 4)];
  assert.deepEqual(describe(lines, new Set(['Bob'])), ['Cat: hi', '[muted Bob @3]', 'Dan: gg']);
});

test('system lines have no sender and are never hidden', () => {
  assert.deepEqual(describe([said('', 'Reconnected.', 1), said('Bob', 'x', 2)], new Set(['Bob', ''])), ['*: Reconnected.', '[muted Bob @2]']);
});

test('with nobody muted every line passes through in order', () => {
  const lines = [said('A', '1', 1), said('B', '2', 2), said('A', '3', 3)];
  assert.deepEqual(describe(lines, new Set()), ['A: 1', 'B: 2', 'A: 3']);
});

test('muted names survive a save and load round trip', () => {
  const muted = toggleMute(toggleMute(new Set(), 'Bob'), 'Zed 9');
  assert.deepEqual([...parseMuted(serializeMuted(muted))], ['Bob', 'Zed 9']);
});

test('corrupt or foreign stored values load as nobody muted instead of throwing', () => {
  for (const raw of [null, '', 'not json', '{"Bob":true}', '"Bob"', '42']) assert.deepEqual([...parseMuted(raw)], [], String(raw));
  assert.deepEqual([...parseMuted('["Bob", 3, null, "", "Cat"]')], ['Bob', 'Cat']);
});
