import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ARMOR_ABSORB, WEAPONS, WORLD } from '../src/shared/defs.ts';
import type { GameEvent } from '../src/shared/protocol.ts';
import { step, type World } from '../src/shared/sim.ts';
import { emptyWorld, press, spawnAt, TICK_MS } from './helpers.ts';

const PISTOL_DMG = WEAPONS.pistol.damage;

/** One trigger pull along +x, then `ms` of flight, returning every event the world emitted. */
function fireAndCollect(w: World, shooter: ReturnType<typeof spawnAt>, ms = 500): GameEvent[] {
  const events: GameEvent[] = [];
  press(w, shooter, { angle: 0, fire: true });
  step(w, TICK_MS);
  events.push(...w.events);
  press(w, shooter, { angle: 0 });
  for (let t = 0; t < ms; t += TICK_MS) { step(w, TICK_MS); events.push(...w.events); }
  return events;
}

const hits = (events: GameEvent[]) => events.filter((e) => e.e === 'dmg' || e.e === 'impact');

// Defect: a player hit pushed one event from the bullet and another from damagePlayer.
test('one bullet hitting a player emits exactly one dmg event naming attacker, victim and amount', () => {
  const w = emptyWorld();
  const a = spawnAt(w, 500, 500);
  const b = spawnAt(w, 700, 500);
  const got = hits(fireAndCollect(w, a));
  assert.equal(got.length, 1, JSON.stringify(got));
  assert.deepEqual(got[0], { e: 'dmg', attacker: a.id, victim: b.id, amount: PISTOL_DMG, x: b.x, y: b.y, kind: 'player' });
});

// Defect: amount reports only hp lost, so armored targets show smaller numbers than the damage dealt.
test('dmg amount counts armor absorbed as damage dealt', () => {
  const w = emptyWorld();
  const a = spawnAt(w, 500, 500);
  const b = spawnAt(w, 700, 500, { loadout: { armor: 'medium' } });
  const [ev] = hits(fireAndCollect(w, a));
  assert.ok(ev?.e === 'dmg' && b.life.k === 'alive');
  assert.equal(b.life.hp, WORLD.baseHp - PISTOL_DMG * (1 - ARMOR_ABSORB), 'armor took part of the hit');
  assert.equal(ev.amount, PISTOL_DMG);
});

// Defect: overkill reported as damage, so a 22-damage shot on a 5-hp target reads 22.
test('dmg amount stops at what the target had left', () => {
  const w = emptyWorld();
  const a = spawnAt(w, 500, 500);
  const b = spawnAt(w, 700, 500);
  if (b.life.k === 'alive') Object.assign(b.life, { hp: 5, lastDamageAt: w.now });
  const [ev] = hits(fireAndCollect(w, a));
  assert.ok(ev?.e === 'dmg');
  assert.equal(ev.amount, 5);
  assert.equal(b.life.k, 'dead');
});

// Defect: crate hits indistinguishable from player hits.
test('a crate hit emits one crate-kind dmg event with the crate id', () => {
  const w = emptyWorld();
  const a = spawnAt(w, 500, 500);
  w.crates.push({ id: 999, x: 640, y: 478, size: 44, hp: WORLD.crateHp, respawnAt: null });
  const got = hits(fireAndCollect(w, a));
  assert.deepEqual(got, [{ e: 'dmg', attacker: a.id, victim: 999, amount: PISTOL_DMG, x: 662, y: 500, kind: 'crate' }]);
});

// Defect: wall hits drawn as damage.
test('a wall hit emits an impact at the wall face and no dmg', () => {
  const w = emptyWorld();
  const a = spawnAt(w, 500, 500);
  w.walls.push({ x: 650, y: 400, w: 40, h: 200, built: false, expiresAt: Infinity });
  const got = hits(fireAndCollect(w, a));
  assert.equal(got.length, 1, JSON.stringify(got));
  const [ev] = got;
  assert.ok(ev?.e === 'impact');
  assert.ok(Math.abs(ev.x - 650) < 1 && Math.abs(ev.y - 500) < 10, `impact at ${ev.x},${ev.y}`);
});

// Defect: blocked friendly fire still flashes a hit for both teammates.
test('a shot a teammate shrugs off emits no dmg event', () => {
  const w = emptyWorld('TDM');
  const a = spawnAt(w, 500, 500, { team: 'red' });
  spawnAt(w, 700, 500, { team: 'red' });
  assert.deepEqual(hits(fireAndCollect(w, a)).filter((e) => e.e === 'dmg'), []);
});

// Defect: the client cannot place a muzzle flash at the barrel without knowing the aim.
test('shot events carry the aim angle', () => {
  const w = emptyWorld();
  const a = spawnAt(w, 500, 500);
  press(w, a, { angle: 1.25, fire: true });
  step(w, TICK_MS);
  assert.deepEqual(w.events.filter((e) => e.e === 'shot').map((e) => e.e === 'shot' && e.angle), [1.25]);
});

// Defect: kill events identify players only by name, which can be shared.
test('kill events carry killer and victim ids', () => {
  const w = emptyWorld();
  const a = spawnAt(w, 500, 500, { name: 'Alex' });
  const b = spawnAt(w, 700, 500, { name: 'Alex' });
  if (b.life.k === 'alive') b.life.hp = 1;
  const kill = fireAndCollect(w, a).find((e) => e.e === 'kill');
  assert.ok(kill?.e === 'kill');
  assert.deepEqual([kill.killerId, kill.victimId], [a.id, b.id]);
});
