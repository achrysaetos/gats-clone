import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseClientMsg } from '../src/shared/protocol.ts';

const input = { up: true, down: false, left: false, right: false, angle: 1, fire: false, reload: false, ability: false, aimDist: 100 };
const loadout = { weapon: 'smg', armor: 'light', color: 'blue' };

test('parseClientMsg rejects malformed frames', () => {
  const bad: unknown[] = [
    '{not json',
    '42',
    'null',
    { t: 'teleport', x: 1 },
    { t: 'input', seq: 1, input: { ...input, angle: 'up' } },
    { t: 'input', seq: 'one', input },
    { t: 'input', seq: 1 },
    { t: 'perk', tier: 1, perk: 'dash' },
    { t: 'perk', tier: 4, perk: 'dash' },
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
  assert.deepEqual(parseClientMsg(JSON.stringify({ t: 'perk', tier: 3, perk: 'dash' })), { t: 'perk', tier: 3, perk: 'dash' });
  const join = parseClientMsg(JSON.stringify({ t: 'join', name: '<b>Ace</b>!!', loadout }));
  assert.deepEqual(join, { t: 'join', name: 'bAceb', loadout, token: undefined });
  const inp = parseClientMsg(JSON.stringify({ t: 'input', seq: 5, input: { ...input, aimDist: 99999 } }));
  assert.ok(inp?.t === 'input');
  assert.equal(inp.input.aimDist, 2000);
});
