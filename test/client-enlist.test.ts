/// <reference types="node" />
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { authErrorText, credentialError, enlistPitch, enlistVisible, guestNudge, isUnrecordedNotice, loadDismissed, loadStakes, NO_STAKES, saveDismissed, saveStakes } from '../src/client/enlist.ts';
import { UNRECORDED_NOTICE } from '../src/server/room.ts';

const memStore = () => { const m = new Map<string, string>(); return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k) }; };

test('the plate shows to a guest, folds away for an account, and hides after "not now"', () => {
  assert.equal(enlistVisible(false, false), true);
  assert.equal(enlistVisible(true, false), false);
  assert.equal(enlistVisible(false, true), false);
  // An open form stays up even when dismissed (the death card's nudge reopens it); an account always wins.
  assert.equal(enlistVisible(false, true, 'register'), true);
  assert.equal(enlistVisible(true, false, 'login'), false);
});

test('"not now" lasts for the visit only: it lives in the session store and survives a broken one', () => {
  const s = memStore();
  assert.equal(loadDismissed(s), false);
  saveDismissed(true, s);
  assert.equal(loadDismissed(s), true);
  saveDismissed(false, s);
  assert.equal(loadDismissed(s), false);
  assert.equal(loadDismissed(memStore()), false, 'a new visit starts with a fresh session store');
  const broken = { getItem() { throw new Error('denied'); }, setItem() { throw new Error('denied'); }, removeItem() { throw new Error('denied'); } };
  assert.doesNotThrow(() => saveDismissed(true, broken));
  assert.equal(loadDismissed(broken), false);
  assert.equal(loadDismissed(null), false);
});

test('stakes round-trip and junk reads as none', () => {
  const s = memStore();
  assert.deepEqual(loadStakes(s), NO_STAKES);
  saveStakes({ unrecorded: false, medal: true, level: false }, s);
  assert.deepEqual(loadStakes(s), { unrecorded: false, medal: true, level: false });
  s.setItem('skirmish.enlist.stakes', '{bad');
  assert.deepEqual(loadStakes(s), NO_STAKES);
});

test('the pitch and the death-card line sharpen with what a guest stands to lose, loudest first', () => {
  assert.equal(enlistPitch(NO_STAKES).title, 'Enlist');
  assert.match(enlistPitch({ ...NO_STAKES, level: true }).title, /climbing/i);
  assert.match(enlistPitch({ ...NO_STAKES, medal: true, level: true }).title, /medals/i);
  assert.match(enlistPitch({ unrecorded: true, medal: true, level: true }).title, /saved/i);
  assert.equal(guestNudge(false, NO_STAKES), null, 'nothing at stake: the death card stays quiet');
  assert.equal(guestNudge(true, { unrecorded: true, medal: true, level: true }), null, 'never nags an account');
  assert.match(guestNudge(false, { ...NO_STAKES, medal: true })!, /medals/);
  assert.match(guestNudge(false, { ...NO_STAKES, unrecorded: true, level: true })!, /saved/);
});

test('credentials are checked by the server\'s rule before the round trip', () => {
  assert.equal(credentialError('Rook', 'abcd'), null);
  assert.equal(credentialError('  Rook  ', 'abcd'), null);
  assert.match(credentialError('', 'abcd')!, /name/i);
  assert.match(credentialError('ab', 'abcd')!, /3/);
  assert.match(credentialError('a'.repeat(17), 'abcd')!, /16/);
  assert.match(credentialError('bad<name>', 'abcd')!, /letters/);
  assert.match(credentialError('Rook', 'abc')!, /^Passwords/);
});

test('server errors read in the plate\'s voice', () => {
  assert.match(authErrorText('register', 'Name taken'), /already enlisted/);
  assert.equal(authErrorText('login', 'Wrong name or password'), 'Wrong name or password.');
  assert.match(authErrorText('login', 'Could not reach server'), /reach the server/);
  assert.equal(authErrorText('login', 'Too many attempts. Try again in a minute.'), 'Too many attempts. Try again in a minute.');
});

test('the server\'s unrecorded-guest notice is recognised, and only as a system line', () => {
  assert.equal(isUnrecordedNotice('', UNRECORDED_NOTICE), true);
  assert.equal(isUnrecordedNotice('Rook', UNRECORDED_NOTICE), false);
  assert.equal(isUnrecordedNotice('', 'Reconnected.'), false);
});
