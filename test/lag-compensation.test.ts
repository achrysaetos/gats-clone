import assert from 'node:assert/strict';
import { test } from 'node:test';
import { GUNS, WORLD } from '../src/shared/defs.ts';
import { INTERP_DELAY_MS, parseClientMsg, type GameEvent } from '../src/shared/protocol.ts';
import { setInput, step } from '../src/shared/sim.ts';
import { MAX_REWIND_MS, rewindCapFor } from '../src/shared/sim/combat.ts';
import { IDLE_INPUT, type Player, type Wall, type World } from '../src/shared/sim/world.ts';
import { emptyWorld, press, run, spawnAt, TICK_MS } from './helpers.ts';

let seq = 1_000_000;
function fireSeeing(w: World, shooter: Player, angle: number, viewAt: number | null, rewindCapMs = MAX_REWIND_MS): GameEvent[] {
  setInput(w, shooter.id, seq++, { ...IDLE_INPUT, angle, fire: true, shots: shooter.input.shots + 1 }, viewAt, rewindCapMs);
  step(w, TICK_MS);
  const events = [...w.events];
  setInput(w, shooter.id, seq++, { ...IDLE_INPUT, angle, shots: shooter.input.shots }, viewAt, rewindCapMs);
  for (let t = 0; t < 500; t += TICK_MS) { step(w, TICK_MS); events.push(...w.events); }
  return events;
}

const hitOn = (events: GameEvent[], victim: Player) => events.some((e) => e.e === 'dmg' && e.kind === 'player' && e.victim === victim.id);

function victimThatSteppedAside(walls: Wall[] = []): { w: World; shooter: Player; victim: Player; sawAt: number } {
  const w = emptyWorld();
  w.walls.push(...walls);
  const shooter = spawnAt(w, 500, 500);
  const victim = spawnAt(w, 700, 500);
  run(w, 500);
  const sawAt = w.now - 100;
  press(w, victim, { down: true });
  run(w, 150);
  press(w, victim, {});
  return { w, shooter, victim, sawAt };
}

test('a shot at where the shooter saw a victim who has since stepped aside hits', () => {
  const { w, shooter, victim, sawAt } = victimThatSteppedAside();
  assert.ok(victim.y - 500 > WORLD.playerRadius * 2, `victim left the line of fire (y ${victim.y})`);
  assert.ok(hitOn(fireSeeing(w, shooter, 0, sawAt), victim), 'judged against the world the shooter drew');
});

test('the same shot with no view time misses the victim who stepped aside', () => {
  const { w, shooter, victim } = victimThatSteppedAside();
  assert.ok(!hitOn(fireSeeing(w, shooter, 0, null), victim), 'judged against the present');
});

test('a rewound shot stops at a wall standing between shooter and the rewound victim', () => {
  const { w, shooter, victim, sawAt } = victimThatSteppedAside([{ x: 600, y: 450, w: 20, h: 100, built: false, expiresAt: Infinity }]);
  const events = fireSeeing(w, shooter, 0, sawAt);
  assert.ok(!hitOn(events, victim), 'no hit through the wall');
  assert.ok(events.some((e) => e.e === 'impact' && e.x === 600), 'the bullet struck the wall face');
});

test('a rewound shot stops at a built wall that stood when the shooter saw the victim and has since expired', () => {
  const { w, shooter, victim, sawAt } = victimThatSteppedAside([{ x: 600, y: 450, w: 20, h: 100, built: true, expiresAt: 450 }]);
  assert.ok(sawAt < 450, 'the wall stood when the shooter saw the victim');
  assert.equal(w.walls.length, 0, 'the wall has expired');
  assert.ok(!hitOn(fireSeeing(w, shooter, 0, sawAt), victim), 'no hit through the wall as it stood');
});

/** How long after reaching cover a victim can still be hit by a shooter who claims to have seen the world at time 0. */
function latestHitAfterCover(rewindCapMs: number, range: number): number {
  let latest = -Infinity;
  for (let delayMs = 0; delayMs <= MAX_REWIND_MS + 200; delayMs += TICK_MS) {
    const w = emptyWorld();
    const shooter = spawnAt(w, 500, 380);
    const victim = spawnAt(w, 500 + range, 380);
    w.walls.push({ x: 600, y: 400, w: 20, h: 300, built: false, expiresAt: Infinity });
    run(w, 300);
    press(w, victim, { down: true });
    while (victim.y - 380 <= WORLD.playerRadius) step(w, TICK_MS);
    press(w, victim, {});
    const coveredAt = w.now;
    run(w, delayMs);
    const firedAt = w.now + TICK_MS;
    if (hitOn(fireSeeing(w, shooter, 0, 0, rewindCapMs), victim)) latest = Math.max(latest, firedAt - coveredAt);
  }
  return latest;
}

const RTT_MS = 40;
for (const [label, capMs] of [['the rewind cap', MAX_REWIND_MS], [`a ${RTT_MS}ms round trip's cap`, rewindCapFor(RTT_MS)]] as const) {
  test(`a victim who reached cover can be hit only for ${label} less the bullet's flight, however far back the client claims to see`, (t) => {
    const range = 200;
    const flightMs = (range / GUNS.pistol.bulletSpeed) * 1000;
    const latest = latestHitAfterCover(capMs, range);
    t.diagnostic(`latest hit ${Math.round(latest)}ms after reaching cover (cap ${Math.round(capMs)}ms, flight ${Math.round(flightMs)}ms)`);
    assert.ok(latest >= 0, 'a shot fired just after the victim reached cover still lands');
    assert.ok(latest <= capMs - flightMs + TICK_MS, `latest hit ${Math.round(latest)}ms after cover`);
  });
}

test('a measured round trip caps the rewind at the round trip plus the render delay and a margin, never above the global cap', () => {
  assert.equal(rewindCapFor(null), MAX_REWIND_MS, 'unmeasured clients get the full cap');
  assert.ok(rewindCapFor(RTT_MS) < MAX_REWIND_MS / 1.5, `a ${RTT_MS}ms round trip caps at ${rewindCapFor(RTT_MS)}ms`);
  assert.ok(rewindCapFor(RTT_MS) >= RTT_MS + INTERP_DELAY_MS, 'covers the view a lagged client really drew');
  assert.equal(rewindCapFor(1000), MAX_REWIND_MS);
});

test('input parsing keeps a numeric view time and drops anything else', () => {
  const input = { ...IDLE_INPUT };
  const viewAtOf = (viewAt: unknown) => {
    const msg = parseClientMsg(JSON.stringify({ t: 'input', seq: 1, input, viewAt }));
    assert.ok(msg?.t === 'input');
    return msg.viewAt;
  };
  assert.equal(viewAtOf(1234.5), 1234.5);
  assert.equal(viewAtOf(-50), 0);
  assert.equal(viewAtOf('1234'), null);
  assert.equal(viewAtOf(undefined), null);
});
