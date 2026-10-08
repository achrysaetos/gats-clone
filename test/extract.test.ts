import assert from 'node:assert/strict';
import { test } from 'node:test';
import { EXT, WORLD } from '../src/shared/defs.ts';
import { MAPS } from '../src/shared/maps.ts';
import { kill } from '../src/shared/sim/combat.ts';
import { snapshotFor } from '../src/shared/sim/snapshot.ts';
import { grantPerks, emptyWorld, press, run, spawnAt, TICK_MS } from './helpers.ts';
import type { Player, World } from '../src/shared/sim/world.ts';

const def = MAPS.vault.extract!;
const T = def.terminal;
const padCenter = { x: def.pad.x + def.pad.w / 2, y: def.pad.y + def.pad.h / 2 };
const inside = (r: { x: number; y: number; w: number; h: number }, p: { x: number; y: number }) => p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h;

/** An open Vault with red attacking round 1: one attacker and one defender, both far from the terminal. */
function match() {
  const w = emptyWorld('EXT');
  const attacker = spawnAt(w, 600, 1600, { team: 'red', name: 'att' });
  const defender = spawnAt(w, 600, 1400, { team: 'blue', name: 'def' });
  return { w, attacker, defender };
}
const put = (p: Player, at: { x: number; y: number }) => { p.x = at.x; p.y = at.y; };
const ext = (w: World) => w.extract!;
const progress = (w: World) => { const c = ext(w).case; return c.k === 'hacking' ? c.progress : 1; };

/** Inside the circle but out of reach of the case. */
const AT_TERMINAL = { x: T.x + 80, y: T.y };

function hack(w: World, attacker: Player) {
  put(attacker, AT_TERMINAL);
  run(w, EXT.hackMs + 100);
  assert.equal(ext(w).case.k, 'ready');
}

function carry(w: World, attacker: Player) {
  hack(w, attacker);
  put(attacker, T);
  run(w, TICK_MS * 2);
  assert.deepEqual({ k: ext(w).case.k, by: (ext(w).case as { by?: number }).by }, { k: 'carried', by: attacker.id });
}

test('the hack runs only while attackers stand in the circle with no defender in it, holds otherwise, and more attackers do not speed it up', () => {
  const { w, attacker, defender } = match();
  put(attacker, { x: T.x + EXT.terminalR - 10, y: T.y });
  run(w, EXT.hackMs / 2);
  assert.ok(Math.abs(progress(w) - 0.5) < 0.02, `half done alone: ${progress(w)}`);
  put(defender, { x: T.x, y: T.y + 40 });
  run(w, 3000);
  assert.ok(Math.abs(progress(w) - 0.5) < 0.02, `held while contested: ${progress(w)}`);
  assert.deepEqual(ext(w).case, { k: 'hacking', progress: progress(w), contested: true });
  put(attacker, { x: 600, y: 1600 });
  put(defender, { x: 600, y: 1400 });
  run(w, 3000);
  assert.ok(Math.abs(progress(w) - 0.5) < 0.02, `held while empty, never drains: ${progress(w)}`);
  put(attacker, AT_TERMINAL);
  spawnAt(w, T.x + 70, T.y + 50, { team: 'red' });
  spawnAt(w, T.x + 70, T.y - 50, { team: 'red' });
  run(w, EXT.hackMs / 4);
  assert.ok(Math.abs(progress(w) - 0.75) < 0.02, `three attackers hack at one's pace: ${progress(w)}`);
  run(w, EXT.hackMs / 4 + 100);
  assert.equal(ext(w).case.k, 'ready', 'ten seconds of uncontested presence completes the hack');
});

test('an attacker picks the case up by touching it, then moves 12% slower and cannot use an ability', () => {
  const { w, attacker } = match();
  grantPerks(w, attacker, ['optics', 'firstAid', 'dash']);
  hack(w, attacker);
  put(attacker, { x: T.x + EXT.touchR + 30, y: T.y });
  run(w, 500);
  assert.equal(ext(w).case.k, 'ready', 'the case waits untouched');
  const free = snapshotFor(w, attacker.id).self.speed;
  put(attacker, T);
  run(w, TICK_MS * 2);
  assert.equal(ext(w).case.k, 'carried');
  assert.ok(Math.abs(snapshotFor(w, attacker.id).self.speed - free * EXT.carrierSpeedMul) < 1e-9, 'the carrier is told its slower speed');
  put(attacker, { x: 1600, y: 1600 });
  press(w, attacker, { right: true });
  run(w, 1000);
  const moved = attacker.x - 1600;
  assert.ok(Math.abs(moved - free * EXT.carrierSpeedMul) < free * 0.03, `carried ${moved.toFixed(0)}px in a second, free speed ${free.toFixed(0)}`);
  press(w, attacker, { ability: true });
  run(w, TICK_MS * 3);
  assert.equal(attacker.abilityReadyAt, 0, 'the dash never fires while carrying');
});

test('a carrier who dies drops the case where they fell; a defender touching it sends it home at once', () => {
  const { w, attacker, defender } = match();
  carry(w, attacker);
  put(attacker, { x: 1500, y: 1500 });
  run(w, TICK_MS);
  kill(w, attacker, defender, 'test');
  run(w, TICK_MS);
  assert.deepEqual(ext(w).case, { k: 'dropped', x: 1500, y: 1500, returnAt: w.now + EXT.returnMs });
  put(defender, { x: 1500 + EXT.touchR - 5, y: 1500 });
  run(w, TICK_MS);
  assert.equal(ext(w).case.k, 'ready', 'returned to the terminal');
});

test('a dropped case left alone goes home after 20 seconds, and an attacker can take it up before then', () => {
  const { w, attacker } = match();
  carry(w, attacker);
  put(attacker, { x: 1500, y: 1500 });
  run(w, TICK_MS);
  kill(w, attacker, null, 'test');
  run(w, EXT.returnMs - 1000);
  assert.equal(ext(w).case.k, 'dropped', 'still lying there just before the timeout');
  run(w, 1100);
  assert.equal(ext(w).case.k, 'ready');

  const second = match();
  carry(second.w, second.attacker);
  put(second.attacker, { x: 1500, y: 1500 });
  run(second.w, TICK_MS);
  kill(second.w, second.attacker, null, 'test');
  const mate = spawnAt(second.w, 1500, 1500 + EXT.touchR - 5, { team: 'red' });
  run(second.w, TICK_MS * 2);
  assert.equal((second.w.extract!.case as { by?: number }).by, mate.id, 'a teammate picks it up');
});

test('the carrier reaching the pad wins the round for the attackers; the next round swaps sides and respawns everyone on their new side', () => {
  const { w, attacker, defender } = match();
  carry(w, attacker);
  put(attacker, padCenter);
  run(w, TICK_MS);
  assert.deepEqual(ext(w).wins, { red: 1, blue: 0 });
  assert.equal(ext(w).phase.k, 'break');
  assert.equal(w.match.k, 'playing', 'one round does not end the match');
  run(w, EXT.breakMs + 100);
  assert.equal(ext(w).round, 2);
  assert.equal(snapshotFor(w, attacker.id).ext?.attackers, 'blue', 'blue attacks round 2');
  assert.ok(def.defend.some((r) => inside(r, attacker)), 'red now starts in the defenders\' spawn');
  assert.ok(def.attack.some((r) => inside(r, defender)), 'blue now starts in the attackers\' spawn');
  assert.equal(ext(w).case.k, 'hacking');
});

test('when the clock runs out the defenders win the round', () => {
  const { w } = match();
  run(w, EXT.roundMs - 500);
  assert.equal(ext(w).phase.k, 'live');
  run(w, 600);
  assert.deepEqual(ext(w).wins, { red: 0, blue: 1 });
});

test('the first team to three rounds wins the match', () => {
  const { w } = match();
  for (let round = 1; round <= 5 && w.match.k === 'playing'; round++) {
    run(w, EXT.roundMs + 100);
    if (w.match.k === 'playing') run(w, EXT.breakMs);
  }
  assert.equal(w.match.k, 'over');
  assert.deepEqual(w.match.k === 'over' && w.match.winner, { name: 'Blue team', id: null, note: 'Won 3–2' }, 'defenders hold every round: blue wins rounds 1, 3, 5 and red 2, 4');
});

test('the dead come back on the round\'s next 8-second wave', () => {
  const { w, attacker } = match();
  run(w, 3000);
  kill(w, attacker, null, 'test');
  assert.deepEqual(attacker.life, { k: 'dead', respawnAt: EXT.waveMs });
  run(w, EXT.waveMs);
  kill(w, spawnAt(w, 600, 1700, { team: 'blue' }), null, 'test');
  assert.equal(w.players.size, 3);
  const last = [...w.players.values()].at(-1)!;
  assert.deepEqual(last.life, { k: 'dead', respawnAt: 2 * EXT.waveMs });
  assert.notEqual(WORLD.respawnMs, EXT.waveMs);
});
