import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ASSIST, assistAngle } from '../src/client/aimassist.ts';
import { bench } from '../scripts/aim-assist-bench.ts';

const DEG = Math.PI / 180;

test('touch aim assist helps a thumb land about a fifth more shots at range, and does nothing up close where it is not needed', () => {
  const near = bench('pistol', 200, 3000), mid = bench('assault', 400, 3000), far = bench('lmg', 600, 3000);
  assert.ok(Math.abs(near.assisted - near.plain) < 0.03, `close shots barely change (${near.plain} -> ${near.assisted})`);
  const gain = (mid.assisted + far.assisted) / (mid.plain + far.plain) - 1;
  assert.ok(gain > 0.15 && gain < 0.8, `mid and long range gain ${Math.round(gain * 100)}%`);
});

test('the assist only ever nudges: never past its cap, and not at all for a target outside its cone or out of range', () => {
  const me = { x: 0, y: 0 };
  for (let off = -10; off <= 10; off += 0.5) {
    const t = { x: Math.cos(off * DEG) * 400, y: Math.sin(off * DEG) * 400, vx: 0, vy: 0 };
    const nudged = Math.abs(assistAngle(0, me, 'pistol', 700, [t]));
    assert.ok(nudged <= ASSIST.maxDeg * DEG + 1e-9, `${off} deg off moves the aim ${nudged / DEG} deg`);
    if (Math.abs(off) > ASSIST.coneDeg) assert.equal(nudged, 0, `${off} deg off is outside the cone`);
  }
  assert.equal(assistAngle(0, me, 'pistol', 700, [{ x: 900, y: 10, vx: 0, vy: 0 }]), 0, 'out of range');
  assert.equal(assistAngle(0, me, 'pistol', 700, []), 0, 'no one to help with');
});
