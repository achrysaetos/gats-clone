/// <reference types="node" />
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GUN_IDS, GUNS, KILL_REWARD, type GunId } from '../src/shared/defs.ts';
import type { Snapshot } from '../src/shared/protocol.ts';
import { reloadClock } from '../src/shared/sim/snapshot.ts';
import { reloadMsFor } from '../src/shared/sim/stats.ts';
import { NO_FIRING, settle, type Firing } from '../src/client/fire.ts';
import { TICK_MS } from '../src/client/interp.ts';
import { clearReloads, selfReload, startTopup, stepReload } from '../src/client/reloadanim.ts';
import { soundTimeline } from '../src/client/reloadbeats.ts';
import { createReloadFoley, type FoleyEmit } from '../src/client/reloadsfx.ts';
import { ROUND_GAP_MS, TOPUP_MS, TOPUP_VOICED, topupCues, topupOf } from '../src/client/topup.ts';

const SNIPERS = GUN_IDS.filter((g) => GUNS[g].base === 'sniper' && GUNS[g].look.hands !== 2);

/** A firing whose predicted trigger began a reload of `gun` at page time `startAt` (input `seq0`). */
function reloadingFirst(gun: GunId, startAt: number): Firing {
  const reloadMs = reloadMsFor(gun, {});
  const sv = { gun, mag: GUNS[gun].mag, reloadMs, ammo: 0, reloading: false, reloadFrac: 0, alive: true, armed: true };
  const f = settle(NO_FIRING, sv, 0, 0, []).firing;
  return { ...f, trigger: { ...f.trigger, reloadUntil: reloadMs }, sent: { seq: 0, at: startAt } };
}

test('a bolt-action reload plays every beat and sound over its whole reloadMs, even when the input timer stalls', () => {
  const gun: GunId = 'sniper', total = reloadMsFor(gun, {});
  assert.equal(total, GUNS.sniper.reloadMs);
  clearReloads();
  const heard: string[] = [];
  const emit: FoleyEmit = (id) => { heard.push(id); };
  const foley = createReloadFoley(emit);
  let f = reloadingFirst(gun, 1000), peak = 0, last = null as ReturnType<typeof stepReload>;
  // Inputs go out at only 70% of the tick rate (a busy page): the tick count lags the page clock all the way.
  for (let now = 1000, sent = 0; now <= 1000 + total + 40; now += 16) {
    if (Math.floor(((now - 1000) / TICK_MS) * 0.7) > sent) { sent++; f = { ...f, sent: { seq: sent, at: now } }; }
    const rl = selfReload(f, now);
    foley.step({ id: 7, gun, x: 0, y: 0, self: true }, rl, now);
    last = stepReload(7, gun, rl, now);
    if (rl) peak = Math.max(peak, rl[0]);
  }
  assert.equal(peak, total, 'the clock reaches the full reload time');
  assert.equal(last!.t > 0.99, true, 'the arms reach the end of their motion (bolt home and down)');
  assert.deepEqual(heard, soundTimeline(gun).map((e) => e.id), 'every sound of the bolt-action reload fired once, in order, boltlock last');
});

test('a remote soldier\'s reload (the snapshot\'s rl) of every sniper-class gun plays its arms and all of its sounds', () => {
  assert.ok(SNIPERS.length >= 5);
  for (const gun of SNIPERS) {
    clearReloads();
    const total = reloadMsFor(gun, {}), heard: string[] = [];
    const foley = createReloadFoley((id) => { heard.push(id); });
    let sawArms = false, end = 0;
    for (let now = 5000; now <= 5000 + total + 40; now += 33) {
      const rl = reloadClock(5000 + total, now, total);
      foley.step({ id: 9, gun, x: 100, y: 0, self: false }, rl, now, { listener: { x: 0, y: 0 }, viewRadius: 600 });
      const frame = stepReload(9, gun, rl, now);
      if (frame && frame.k > 0) sawArms = true;
      end = frame?.t ?? end;
    }
    assert.ok(sawArms, `${gun}: arms animate`);
    assert.ok(end > 0.97, `${gun}: arms finish`);
    // The crowd limiter may drop a few of other soldiers' sounds, never most of them.
    assert.ok(heard.length >= soundTimeline(gun).length - 1, `${gun}: ${heard.length}/${soundTimeline(gun).length} sounds heard`);
  }
});

const snapOf = (self: Partial<Snapshot['self']>, events: Snapshot['events'] = []) => ({ self: { alive: true, reloading: false, ammo: 5, ...self }, events }) as unknown as Snapshot;
const kill = (killerId: number) => ({ e: 'kill', killerId }) as unknown as Snapshot['events'][number];
const shot = (owner: number) => ({ e: 'shot', owner }) as unknown as Snapshot['events'][number];

test('a kill that puts rounds back in the mag is seen as a top-up of exactly those rounds', () => {
  const rounds = Math.ceil(KILL_REWARD.ammo * 5);
  assert.equal(rounds, 3);
  assert.equal(topupOf(snapOf({ ammo: 1 }), snapOf({ ammo: 1 + rounds }, [kill(1)]), 1), 3);
  // The killing shot is in the same snapshot: 2 -> fired -> 1 -> +3.
  assert.equal(topupOf(snapOf({ ammo: 2 }), snapOf({ ammo: 4 }, [shot(1), kill(1)]), 1), 3);
  // Topped up to the brim: only the rounds that fit count.
  assert.equal(topupOf(snapOf({ ammo: 4 }), snapOf({ ammo: 5 }, [kill(1)]), 1), 1);
  assert.equal(topupOf(snapOf({ ammo: 5 }), snapOf({ ammo: 4 }, [shot(1), kill(1)]), 1), 0, 'a full mag has nothing to top up');
  // Not yours, not a kill, or mid-reload (a reload ending refills the mag without any kill).
  assert.equal(topupOf(snapOf({ ammo: 1 }), snapOf({ ammo: 4 }, [kill(2)]), 1), 0);
  assert.equal(topupOf(snapOf({ ammo: 1 }), snapOf({ ammo: 5 }), 1), 0);
  assert.equal(topupOf(snapOf({ ammo: 1, reloading: true }), snapOf({ ammo: 5 }, [kill(1)]), 1), 0);
  assert.equal(topupOf(undefined, snapOf({ ammo: 4 }, [kill(1)]), 1), 0);
});

test('the top-up is voiced as a patter of rounds, one per round up to a few', () => {
  const cues = topupCues(3);
  assert.deepEqual(cues.map((c) => c.id), ['foley:round', 'foley:round', 'foley:round']);
  assert.deepEqual(cues.map((c) => c.delayMs), [0, ROUND_GAP_MS, 2 * ROUND_GAP_MS]);
  assert.equal(topupCues(30).length, TOPUP_VOICED);
  assert.equal(topupCues(0).length, 0);
  assert.ok(TOPUP_VOICED * ROUND_GAP_MS < TOPUP_MS, 'the patter fits inside the hand\'s tap');
});

test('a top-up taps the support hand on a bolt-action or shotgun for TOPUP_MS and then lets go; box-mag guns have no tap', () => {
  clearReloads();
  startTopup(4, 100);
  const mid = stepReload(4, 'sniper', null, 100 + TOPUP_MS / 2);
  assert.ok(mid && mid.k === 1 && mid.t > 0.55 && mid.t < 0.75, 'mid-tap the arms are in the clip-pressing stretch of the reload');
  assert.equal(stepReload(4, 'sniper', null, 100 + TOPUP_MS + 1), null, 'and the tap is over');
  startTopup(5, 0);
  assert.ok(stepReload(5, 'shotgun', null, 100));
  startTopup(6, 0);
  assert.equal(stepReload(6, 'assault', null, 100), null);
  // A real reload is never replaced by a tap.
  startTopup(8, 0);
  assert.ok(stepReload(8, 'sniper', [100, 2000], 50)!.t < 0.1);
});
