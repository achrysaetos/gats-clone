/// <reference types="node" />
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { CONTROLS, assembleInput, actionForKey } from '../src/client/input.ts';
import { stepTrigger, NO_FIRING, settle, settleOf, type ServerGun } from '../src/client/fire.ts';
import { NO_STICKS, dragStick, pressStick, touchMoves } from '../src/client/touch.ts';
import { GUNS, LOAD_SPEED_FLOOR, raiseMsOf, rulesOf, settleRulesOf, SPRINT, WORLD } from '../src/shared/defs.ts';
import { parseClientMsg } from '../src/shared/protocol.ts';
import { snapshotFor } from '../src/shared/sim/snapshot.ts';
import { effectiveStats, settleSpreadMul, spreadFor } from '../src/shared/sim/stats.ts';
import { botThink, newBotMemory } from '../src/server/bots.ts';
import { arenaFor } from '../src/server/bot/arena.ts';
import { emptyWorld, grantPerks, press, run, spawnAt, TICK_MS } from './helpers.ts';

/** Distance a player covers in `ms` holding right, sprinting or not. */
function travelled(sprint: boolean, ms: number, loadout: Parameters<typeof spawnAt>[3] = {}, perks: Parameters<typeof grantPerks>[2] = []) {
  const w = emptyWorld();
  const p = spawnAt(w, 500, 500, loadout);
  if (perks.length) grantPerks(w, p, perks);
  press(w, p, { right: true, sprint });
  run(w, ms);
  return p.x - 500;
}

test('sprinting moves 1.35 times faster than walking, and only while moving', () => {
  const walk = travelled(false, 1000), sprint = travelled(true, 1000);
  assert.ok(Math.abs(sprint / walk - SPRINT.speedMul) < 0.03, `sprint ${sprint.toFixed(1)} vs walk ${walk.toFixed(1)}`);
  const w = emptyWorld();
  const p = spawnAt(w, 500, 500);
  press(w, p, { sprint: true });
  run(w, 500);
  assert.equal(p.x, 500, 'holding sprint standing still goes nowhere');
  assert.equal(snapshotFor(w, p.id).self.sprint, false, 'and is not a sprint');
});

test('sprint multiplies the loadout speed after the 58% floor, and Lightweight stacks with it', () => {
  const heavy = { weapon: 'lmg', armor: 'heavy' } as const;
  const base = WORLD.baseSpeed * LOAD_SPEED_FLOOR;
  const lmgSprint = 1 + (SPRINT.speedMul - 1) * rulesOf(GUNS.lmg).sprintMul;
  assert.ok(Math.abs(travelled(true, 1000, { loadout: heavy }) - base * lmgSprint) < 4, 'the heaviest loadout still sprints above its floor speed (an LMG a little less than most)');
  const light = travelled(true, 1000, {}, ['lightweight']);
  assert.ok(Math.abs(light - WORLD.baseSpeed * 1.25 * SPRINT.speedMul) < 4, `Lightweight sprint ${light.toFixed(1)}`);
});

test('a sprinting player cannot fire; a click ends the sprint and the shot waits for the gun to come up', () => {
  const w = emptyWorld();
  const a = spawnAt(w, 500, 500, { loadout: { weapon: 'assault' } });
  spawnAt(w, 1500, 900);
  press(w, a, { right: true, sprint: true });
  run(w, 400);
  assert.equal(snapshotFor(w, a.id).self.sprint, true);
  const shots = () => w.events.filter((e) => e.e === 'shot' && e.owner === a.id).length;
  let fired = 0;
  const clickAt = w.now;
  press(w, a, { right: true, sprint: true, fire: true, shots: a.input.shots + 1 });
  let firstShotMs: number | null = null;
  for (let i = 0; i < Math.ceil(raiseMsOf(GUNS.assault) / TICK_MS) + 10; i++) {
    run(w, TICK_MS);
    fired += shots();
    if (fired > 0 && firstShotMs === null) firstShotMs = w.now - clickAt;
  }
  assert.equal(snapshotFor(w, a.id).self.sprint, false, 'the click ended the sprint even with the key still held');
  assert.ok(firstShotMs !== null, 'the held trigger fires once the gun is up');
  assert.ok(firstShotMs! >= raiseMsOf(GUNS.assault) - TICK_MS, `no shot before the gun is raised (${firstShotMs}ms)`);
  assert.ok(firstShotMs! <= raiseMsOf(GUNS.assault) + 2 * TICK_MS + 1, `a held trigger fires right as it comes up (${firstShotMs}ms)`);
});

test('sprinting never fires, however long the trigger is held without a click ending it', () => {
  const w = emptyWorld();
  const a = spawnAt(w, 500, 500, { loadout: { weapon: 'lmg' } });
  press(w, a, { right: true, sprint: true });
  run(w, 600);
  assert.equal(w.events.filter((e) => e.e === 'shot').length, 0);
  assert.equal(snapshotFor(w, a.id).self.ammo, snapshotFor(w, a.id).self.mag);
});

test('reloading while sprinting is allowed', () => {
  const w = emptyWorld();
  const a = spawnAt(w, 500, 500);
  if (a.life.k === 'alive') a.life.ammo = 1;
  press(w, a, { right: true, sprint: true, reload: true });
  run(w, TICK_MS * 3);
  const self = snapshotFor(w, a.id).self;
  assert.equal(self.reloading, true);
  assert.equal(self.sprint, true, 'the sprint carried on through the reload');
});

test('leaving sprint runs the raise, then a settle that eases spread from the gun\'s settle multiple back to normal', () => {
  assert.equal(settleSpreadMul(1), SPRINT.settleMul);
  assert.equal(settleSpreadMul(0), 1);
  assert.equal(settleSpreadMul(2), SPRINT.settleMul, 'a share above 1 (the gun still coming up) counts as the full settle');
  assert.ok(Math.abs(settleSpreadMul(0.5) - (1 + (SPRINT.settleMul - 1) * 0.25)) < 1e-9, 'ease-out: most of the bloom is gone by the half-way point');
  assert.ok(settleSpreadMul(0.25) < settleSpreadMul(0.5) && settleSpreadMul(0.5) < settleSpreadMul(0.75));
  const w = emptyWorld();
  const a = spawnAt(w, 500, 500, { loadout: { weapon: 'assault' } });
  const raise = raiseMsOf(GUNS.assault), { ms: settleMs } = settleRulesOf(GUNS.assault);
  press(w, a, { right: true, sprint: true });
  run(w, 300);
  press(w, a, {});
  run(w, TICK_MS);
  const early = snapshotFor(w, a.id).self;
  assert.equal(early.settleMs, settleMs);
  assert.ok(Math.abs(early.settle! - (raise + settleMs) / settleMs) < 0.03, `the clock starts with the raise ahead of the settle (${early.settle})`);
  run(w, raise);
  const up = snapshotFor(w, a.id).self.settle!;
  assert.ok(up <= 1 && up > 0.95, `the settle starts in full only once the gun is up (${up})`);
  run(w, settleMs / 2);
  const mid = snapshotFor(w, a.id).self.settle!;
  assert.ok(Math.abs(mid - 0.5) < 0.04, `half the settle time, half the settle (${mid})`);
  run(w, settleMs / 2 + TICK_MS);
  assert.equal(snapshotFor(w, a.id).self.settle, 0, 'gone once the settle has run');
  const steady = spreadFor('assault', {}, true);
  assert.ok(Math.abs(spreadFor('assault', {}, true, 0, 0, 1) / steady - SPRINT.settleMul) < 1e-9);
  assert.equal(spreadFor('assault', {}, true, 0, 0, 0), steady);
});

test('the settle is horrific on the anchors (x4) but kinder and quicker on the pistol and the rushing SMG', () => {
  const at = (gun: 'pistol' | 'smg' | 'shotgun' | 'assault' | 'sniper' | 'lmg') => spreadFor(gun, {}, false, 0, 0, 1) / spreadFor(gun, {}, false);
  for (const gun of ['assault', 'lmg'] as const) assert.ok(Math.abs(at(gun) - 4) < 1e-9, `${gun} starts at x${at(gun)}`);
  assert.ok(at('sniper') > 3, 'a just-sprinted sniper sprays');
  for (const gun of ['pistol', 'smg', 'shotgun'] as const) assert.ok(at(gun) >= 1.5 && at(gun) <= 3, `${gun} starts at x${at(gun)}`);
  const ms = (gun: keyof typeof GUNS) => settleRulesOf(GUNS[gun]).ms;
  assert.ok(ms('pistol') < ms('assault') && ms('smg') < ms('assault') && ms('smg') <= 500, 'the light guns settle fastest');
  assert.ok(ms('lmg') >= ms('assault') && ms('sniper') >= ms('assault'), 'the heavy guns settle slowest');
  // The SMG stays a rusher: up and fully steady before an assault rifle is even up.
  assert.ok(raiseMsOf(GUNS.smg) + ms('smg') < raiseMsOf(GUNS.assault));
});

for (const gun of ['pistol', 'smg', 'shotgun', 'assault', 'sniper', 'lmg'] as const) {
  test(`${gun}: no round leaves (and no ammo is spent) until the gun is up after a sprint`, () => {
    const w = emptyWorld();
    const a = spawnAt(w, 500, 500, { loadout: { weapon: gun } });
    press(w, a, { right: true, sprint: true });
    run(w, 400);
    const mag = snapshotFor(w, a.id).self.ammo;
    const shots = () => w.events.filter((e) => e.e === 'shot' && e.owner === a.id).length;
    const clickAt = w.now;
    let firstShotMs: number | null = null;
    // A click ends the sprint; the trigger is then held (a semi-auto gets a fresh click each tick).
    press(w, a, { right: true, sprint: true, fire: true, shots: a.input.shots + 1 });
    for (let i = 0; i < Math.ceil(raiseMsOf(GUNS[gun]) / TICK_MS) + 6 && firstShotMs === null; i++) {
      run(w, TICK_MS);
      if (shots() > 0) firstShotMs = w.now - clickAt;
      else {
        assert.equal(snapshotFor(w, a.id).self.ammo, mag, `no ammo spent ${w.now - clickAt}ms in`);
        if (!GUNS[gun].auto) press(w, a, { right: true, fire: true, shots: a.input.shots + 1 });
      }
    }
    assert.ok(firstShotMs !== null, 'it fires once up');
    assert.ok(firstShotMs! >= raiseMsOf(GUNS[gun]) - TICK_MS, `not before ${raiseMsOf(GUNS[gun])}ms (${firstShotMs}ms)`);
    assert.ok(firstShotMs! <= raiseMsOf(GUNS[gun]) + 2 * TICK_MS + 1, `as soon as it is up (${firstShotMs}ms)`);
  });
}

test('the settle also breaks a planted sniper\'s pinpoint, and suppression still stacks on top', () => {
  assert.equal(spreadFor('sniper', {}, true), 0);
  assert.ok(spreadFor('sniper', {}, true, 0, 0, 1) > 0, 'a just-sprinted sniper rifle is not pinpoint');
  const base = spreadFor('assault', {}, true, 0, 0, 0.6);
  assert.ok(spreadFor('assault', {}, true, 0, 1, 0.6) > base, 'suppression stacks on the settle');
});

test('a sprint ending mid-settle restarts it, and sprint speed appears in the self snapshot', () => {
  const w = emptyWorld();
  const a = spawnAt(w, 500, 500);
  const s = effectiveStats(a);
  assert.ok(Math.abs(s.sprintSpeed - s.speed * SPRINT.speedMul) < 1e-9);
  press(w, a, { right: true, sprint: true });
  run(w, TICK_MS * 2);
  assert.equal(snapshotFor(w, a.id).self.sprintSpeed, s.sprintSpeed);
  assert.equal(snapshotFor(w, a.id).players.find((p) => p.id === a.id)?.sprint, true, 'others see a sprint pose');
});

const SERVER: ServerGun = { gun: 'assault', mag: GUNS.assault.mag, reloadMs: GUNS.assault.reloadMs, ammo: GUNS.assault.mag, reloading: false, reloadFrac: 0, alive: true, armed: true };

test('the client trigger mirrors the sprint: no shot while sprinting, the raise delay and the settle after', () => {
  let t = settle(NO_FIRING, SERVER, 0, 0, []).firing.trigger;
  const moving = { up: false, down: false, left: false, right: true, reload: false };
  let now = TICK_MS;
  let step = stepTrigger(t, { ...moving, fire: false, shots: 0, sprint: true }, now);
  t = step.t;
  assert.equal(t.sprint, true);
  now += TICK_MS;
  step = stepTrigger(t, { ...moving, fire: false, shots: 1, sprint: true }, now);
  assert.equal(step.fired, false, 'the click ends the sprint but the gun is not up yet');
  t = step.t;
  assert.equal(t.sprint, false);
  assert.equal(t.settleLeft, raiseMsOf(GUNS.assault) + t.settleMs, 'the post-sprint clock: the raise, then the settle');
  let firedAfter: number | null = null;
  for (let i = 0; i < Math.ceil(raiseMsOf(GUNS.assault) / TICK_MS) + 10 && firedAfter === null; i++) {
    now += TICK_MS;
    step = stepTrigger(t, { ...moving, right: false, fire: true, shots: 1, sprint: true }, now);
    t = step.t;
    if (step.fired) firedAfter = i + 1;
  }
  assert.ok(firedAfter !== null && firedAfter * TICK_MS >= raiseMsOf(GUNS.assault) - TICK_MS, `fired after ${firedAfter} ticks`);
  assert.ok(settleOf({ ...NO_FIRING, trigger: t }) < 1, 'the settle is draining');
});

test('input parsing keeps sprint, and Shift and the move stick\'s outer ring both sprint', () => {
  const input = assembleInput(new Set(['right', 'sprint'] as const), false, 0, { dx: 1, dy: 0 });
  assert.equal(input.sprint, true);
  const parsed = parseClientMsg(JSON.stringify({ t: 'input', seq: 1, input }));
  assert.equal(parsed?.t === 'input' && parsed.input.sprint, true);
  const junk = parseClientMsg(JSON.stringify({ t: 'input', seq: 1, input: { ...input, sprint: 'yes' } }));
  assert.equal(junk?.t === 'input' && junk.input.sprint, false, 'only a real true sprints');
  assert.equal(actionForKey('ShiftLeft'), 'sprint');
  assert.equal(actionForKey('ShiftRight'), 'sprint');
  assert.ok(CONTROLS.some(([key, what]) => key === 'Shift' && /sprint/i.test(what)), 'the controls table lists Shift');
  let s = pressStick(NO_STICKS, 1, 100, 400, 800);
  s = dragStick(s, 1, 100 + 40, 400);
  assert.deepEqual(touchMoves(s), ['right'], 'a thumb inside the ring walks');
  s = dragStick(s, 1, 100 + 70, 400);
  assert.deepEqual(touchMoves(s), ['right'], 'a full push to the walking ring still walks');
  s = dragStick(s, 1, 100 + 95, 400);
  assert.deepEqual(touchMoves(s).sort(), ['right', 'sprint'], 'a thumb out on the outer ring sprints');
});

test('a bot sprints to travel and walks the moment an enemy is in sight, so it can fire', () => {
  const r = (() => { let x = 11; return () => ((x = (x * 16807) % 2147483647) / 2147483647); })();
  const alone = emptyWorld();
  const bot = spawnAt(alone, 1000, 1000, { loadout: { weapon: 'assault' } });
  let mem = newBotMemory(r);
  let sprinted = 0, moved = 0;
  for (let i = 0; i < 120; i++) {
    const d = botThink(snapshotFor(alone, bot.id), arenaFor(alone), mem, r);
    mem = d.mem;
    const walking = d.input.up || d.input.down || d.input.left || d.input.right;
    if (walking) moved++;
    if (d.input.sprint) { sprinted++; assert.ok(walking, 'never sprints standing still'); assert.equal(d.input.fire, false); }
    press(alone, bot, d.input);
    run(alone, TICK_MS);
  }
  assert.ok(moved > 20 && sprinted > moved / 2, `a bot with nobody in sight sprints as it travels (${sprinted}/${moved})`);

  const fight = emptyWorld();
  const shooter = spawnAt(fight, 1000, 1000, { loadout: { weapon: 'assault' } });
  const target = spawnAt(fight, 1350, 1000);
  if (target.life.k === 'alive') target.life.hp = 1e9;
  mem = newBotMemory(r);
  let fires = 0;
  for (let i = 0; i < 90; i++) {
    if (target.life.k === 'alive') target.life.hp = 1e9;
    const d = botThink(snapshotFor(fight, shooter.id), arenaFor(fight), mem, r);
    mem = d.mem;
    if (d.input.fire) { fires++; assert.ok(!d.input.sprint, 'a bot never fires while sprinting'); }
    if (d.input.sprint && i > 5) assert.fail(`sprinting with an enemy in sight at tick ${i}`);
    press(fight, shooter, d.input);
    run(fight, TICK_MS);
  }
  assert.ok(fires > 0, 'it fought');
});

test('a single click while a slow gun is coming up after a sprint is not kept: no shot until it is up and you click again (a quick draw keeps a click made just before)', () => {
  const w = emptyWorld();
  const a = spawnAt(w, 500, 500, { loadout: { weapon: 'shotgun' } });
  spawnAt(w, 1500, 900);
  press(w, a, { right: true, sprint: true });
  run(w, 400);
  const shots = () => w.events.filter((e) => e.e === 'shot' && e.owner === a.id).length;
  let fired = 0;
  // The click ends the sprint; release it at once (a shotgun does not fire on a held trigger).
  press(w, a, { right: true, sprint: true, fire: true, shots: a.input.shots + 1 });
  run(w, TICK_MS); fired += shots();
  press(w, a, { right: true, sprint: false, fire: false, shots: a.input.shots });
  for (let i = 0; i < Math.ceil((raiseMsOf(GUNS.shotgun) + 300) / TICK_MS); i++) { run(w, TICK_MS); fired += shots(); }
  assert.equal(fired, 0, 'the click made while the gun was down never fires');
  press(w, a, { right: true, fire: true, shots: a.input.shots + 1 });
  for (let i = 0; i < 4; i++) { run(w, TICK_MS); fired += shots(); }
  assert.equal(fired, 1, 'a fresh click once the gun is up fires');
});
