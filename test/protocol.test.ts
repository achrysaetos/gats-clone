import assert from 'node:assert/strict';
import { test } from 'node:test';
import { clampAspect, cleanName, DEFAULT_VIEW_ASPECT, NAME_MAX, parseClientMsg, VIEW_ASPECT, viewExtents } from '../src/shared/protocol.ts';

const input = { up: true, down: false, left: false, right: false, angle: 1, fire: false, reload: false, ability: false, aimDist: 100 };
const loadout = { weapon: 'smg', armor: 'light', color: 'blue' };

test('parseClientMsg rejects malformed frames', () => {
  const bad: unknown[] = [
    '{not json',
    // JSON has no Infinity, but an overflowing literal parses to one; it must not be clamped into a legal value.
    '{"t":"input","seq":1,"input":{"up":true,"angle":1e999,"aimDist":100}}',
    '{"t":"input","seq":1e999,"input":{"up":true,"angle":1,"aimDist":100}}',
    '42',
    'null',
    { t: 'teleport', x: 1 },
    { t: 'input', seq: 1, input: { ...input, angle: 'up' } },
    { t: 'input', seq: 'one', input },
    { t: 'input', seq: 1 },
    { t: 'perk', tier: 3, perk: 'dash' },
    { t: 'pick', level: 0, option: 'dash' },
    { t: 'pick', level: 6, option: 'dash' },
    { t: 'pick', level: 2.5, option: 'handCannon' },
    { t: 'pick', level: '2', option: 'handCannon' },
    { t: 'pick', level: 2, option: 'railgun' },
    { t: 'pick', level: 2 },
    { t: 'join', name: 'x', loadout: { ...loadout, weapon: 'railgun' } },
    { t: 'join', name: 'x' },
    { t: 'chat', text: '   ' },
    { t: 'chat', text: 7 },
    { t: 'respawn', loadout: { ...loadout, color: 'chartreuse' } },
  ];
  for (const frame of bad) {
    const raw = typeof frame === 'string' ? frame : JSON.stringify(frame);
    assert.equal(parseClientMsg(raw), null, raw);
  }
});

test('parseClientMsg accepts well-formed frames and clamps or cleans fields', () => {
  assert.deepEqual(parseClientMsg(JSON.stringify({ t: 'pick', level: 4, option: 'dash' })), { t: 'pick', level: 4, option: 'dash' });
  assert.deepEqual(parseClientMsg(JSON.stringify({ t: 'pick', level: 5, option: 'railSlug', extra: 1 })), { t: 'pick', level: 5, option: 'railSlug' });
  const join = parseClientMsg(JSON.stringify({ t: 'join', name: '<b>Ace</b>!!', loadout }));
  assert.deepEqual(join, { t: 'join', name: 'bAceb', loadout, token: undefined, aspect: DEFAULT_VIEW_ASPECT });
  const nameOf = (name: unknown) => { const m = parseClientMsg(JSON.stringify({ t: 'join', name, loadout })); return m?.t === 'join' ? m.name : null; };
  assert.equal(nameOf('Abcdefghijklmnopqrstuvwxyz'), 'Abcdefghijklmnop', 'cut to 16 characters');
  assert.equal(nameOf('  Ze_ro.9-x  '), 'Ze_ro.9-x', 'letters, digits, space, _ . - kept, the ends trimmed');
  assert.equal(nameOf('Łukasz 東京'), 'Łukasz 東京', 'any script');
  assert.equal(nameOf('<>{}'), 'Unnamed');
  assert.equal(nameOf(42), 'Unnamed');
  const chat = parseClientMsg(JSON.stringify({ t: 'chat', text: `  ${'x'.repeat(200)}  ` }));
  assert.deepEqual(chat, { t: 'chat', text: 'x'.repeat(120) }, 'chat trimmed and cut to 120 characters');
  const token = parseClientMsg(JSON.stringify({ t: 'join', name: 'A', loadout, token: 't'.repeat(300) }));
  assert.equal(token?.t === 'join' && token.token, 't'.repeat(128), 'a token is cut to 128 characters');
  const inp = parseClientMsg(JSON.stringify({ t: 'input', seq: 5, input: { ...input, aimDist: 99999 } }));
  assert.ok(inp?.t === 'input');
  assert.equal(inp.input.aimDist, 2000);
});

test('a name cut to its length never ends in a space or half a character, so a guest cannot wear a padded copy of an account name', () => {
  assert.equal(cleanName('Abcdefghijklmno xyz'), 'Abcdefghijklmno', 'no trailing space left by the cut');
  const astral = '\u{1D49C}';
  assert.equal(cleanName(`${'a'.repeat(15)}${astral}${astral}`), 'a'.repeat(15), 'an astral letter that does not fit is dropped whole, never split');
  assert.equal(cleanName(astral.repeat(20)), astral.repeat(NAME_MAX / 2), 'whole letters within the length');
});

test('a non-finite aspect (a 0x0 viewport is 0/0) clamps to the default, never NaN', () => {
  assert.equal(clampAspect(NaN), DEFAULT_VIEW_ASPECT);
  assert.equal(clampAspect(Infinity), DEFAULT_VIEW_ASPECT);
  assert.equal(clampAspect(-Infinity), DEFAULT_VIEW_ASPECT);
  assert.ok(Number.isFinite(viewExtents(500, 0 / 0).halfH));
  assert.equal(clampAspect(0.5), VIEW_ASPECT.min, 'finite values still clamp as before');
});

test('the viewport aspect a client claims is clamped between square and 21:9 at the boundary', () => {
  const aspectOf = (msg: object) => { const m = parseClientMsg(JSON.stringify(msg)); return m && 'aspect' in m ? m.aspect : null; };
  assert.equal(aspectOf({ t: 'join', name: 'A', loadout, aspect: 1.6 }), 1.6, 'a 16:10 laptop keeps its aspect');
  assert.equal(aspectOf({ t: 'join', name: 'A', loadout, aspect: 32 / 9 }), VIEW_ASPECT.max, 'a super-ultrawide sees no more than the widest allowed shape');
  assert.equal(aspectOf({ t: 'join', name: 'A', loadout, aspect: 0.5 }), 1, 'a portrait phone is treated as square');
  assert.equal(aspectOf({ t: 'join', name: 'A', loadout, aspect: 'wide' }), DEFAULT_VIEW_ASPECT, 'garbage falls back to the bot view');
  assert.equal(aspectOf({ t: 'view', aspect: 9 }), VIEW_ASPECT.max, 'resizes are clamped the same way');
  assert.equal(aspectOf({ t: 'join', name: 'A', loadout, aspect: 852 / 393 }), 852 / 393, 'an iPhone in landscape keeps its aspect');
  assert.equal(aspectOf({ t: 'view', aspect: 1.25 }), 1.25);
});
