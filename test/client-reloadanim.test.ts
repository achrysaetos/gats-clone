/// <reference types="node" />
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GUNS, GUN_IDS, type GunId, type WeaponId } from '../src/shared/defs.ts';
import { effectiveStats } from '../src/shared/sim/stats.ts';
import { snapshotFor, reloadClock } from '../src/shared/sim/snapshot.ts';
import { makeSnapshotEncoder } from '../src/shared/wire.ts';
import type { PlayerView } from '../src/shared/protocol.ts';
import { heldHands } from '../src/client/gunart.ts';
import { reloadAt } from '../src/client/interp.ts';
import { BEATS, shellCount, shellSeat, soundTimeline } from '../src/client/reloadbeats.ts';
import { clearReloads, dropBeats, reloadScene, selfReload, stepReload } from '../src/client/reloadanim.ts';
import { SOUNDS } from '../src/client/sfx.ts';
import { NO_FIRING, settle } from '../src/client/fire.ts';
import { emptyWorld, grantPerks, press, run, spawnAt, TICK_MS } from './helpers.ts';
import { step } from '../src/shared/sim.ts';

const R = 24;
const BASES: WeaponId[] = ['pistol', 'smg', 'assault', 'shotgun', 'sniper', 'lmg'];

test('a reloading soldier carries [elapsed, total] on the wire, the real length with perks, and nothing otherwise', () => {
  for (const perks of [false, true]) {
    const w = emptyWorld();
    const a = spawnAt(w, 500, 500), b = spawnAt(w, 900, 900);
    if (perks) grantPerks(w, a, ['quickReload']);
    if (a.life.k === 'alive') a.life.ammo = 3;
    assert.equal(snapshotFor(w, b.id).players.find((p) => p.id === a.id)!.rl, undefined);
    press(w, a, { reload: true });
    step(w, TICK_MS);
    press(w, a, {});
    run(w, 300);
    const total = effectiveStats(a).reloadMs;
    assert.ok(perks ? total < GUNS[a.gun].reloadMs : total === GUNS.pistol.reloadMs);
    const seen = snapshotFor(w, b.id).players.find((p) => p.id === a.id)!.rl!;
    assert.equal(seen[1], Math.round(total));
    assert.ok(Math.abs(seen[0] - 300) <= TICK_MS * 2, `elapsed ${seen[0]}`);
    const wire = JSON.parse(makeSnapshotEncoder()(snapshotFor(w, b.id))).players.find((p: PlayerView) => p.id === a.id);
    assert.deepEqual(wire.rl, seen);
    run(w, total);
    assert.equal(snapshotFor(w, b.id).players.find((p) => p.id === a.id)!.rl, undefined, 'gone the tick the reload ends');
  }
  assert.deepEqual(reloadClock(1000, 400, 1000), [400, 1000]);
  assert.deepEqual(reloadClock(1000, 1000, 1000), [1000, 1000]);
});

test('interpolating between snapshots keeps the reload clock exact, finishing on the very ms it does', () => {
  // Newer snapshot says 600/1000 and the snapshots are 100 ms apart: halfway between them it is 550.
  assert.deepEqual(reloadAt([500, 1000], [600, 1000], 0.5, 100), { rl: [550, 1000] });
  assert.deepEqual(reloadAt(undefined, [30, 1000], 0.5, 100), { rl: [0, 1000] });
  // Finished between the two: counted on from the older one, and gone at the total.
  assert.deepEqual(reloadAt([950, 1000], undefined, 0.25, 100), { rl: [975, 1000] });
  assert.deepEqual(reloadAt([950, 1000], undefined, 0.5, 100), {});
  assert.deepEqual(reloadAt(undefined, undefined, 0.5, 100), {});
});

test('every beat sits inside the reload and in order, and the foley timeline fires on those beats', () => {
  for (const [name, beats] of Object.entries(BEATS)) {
    const times = Object.values(beats);
    assert.ok(times.every((t) => t > 0 && t < 1), name);
  }
  for (const k of ['box', 'lmg', 'sniper', 'akimbo'] as const) {
    const t = Object.values(BEATS[k]);
    assert.deepEqual(t, [...t].sort((a, b) => a - b), `${k} beats in order`);
  }
  const at = (gun: GunId) => soundTimeline(gun).map((e) => [e.id, e.at] as const);
  const B = BEATS;
  assert.deepEqual(at('assault').filter(([id]) => id !== 'foley:drop').map(([, t]) => t), [B.box.release, B.box.out, B.box.pouch, B.box.near, B.box.seat, B.box.slap, B.box.rackBack, B.box.rack]);
  assert.ok(at('assault').some(([id, t]) => id === 'foley:drop' && t === B.box.drop), 'the mag drop lands on the let-go beat of the animation');
  for (const base of BASES) assert.ok(soundTimeline(base).length >= 4, base);
  const n = shellCount(GUNS.shotgun.mag);
  for (let i = 0; i < n; i++) assert.ok(at('shotgun').some(([id, t]) => id === 'foley:shellin' && t === shellSeat(i, n)), `shell ${i} clicks home on its seat beat`);
  assert.deepEqual(at('shotgun').slice(-2), [['foley:pumpback', B.tube.pumpBack], ['foley:pump', B.tube.pump]]);
  assert.deepEqual(at('sniper').map(([id]) => id), ['foley:boltup', 'foley:boltdraw', 'foley:boltrear', 'foley:pouch', 'foley:clipseat', 'foley:ratchet', 'foley:boltfwd', 'foley:boltlock']);
  assert.equal(at('lmg').find(([id]) => id === 'foley:slam')![1], B.lmg.shut);
  // The magazine drop sound is exactly the beat dropBeats() reports for the animation.
  for (const gun of GUN_IDS) {
    const drops = soundTimeline(gun).filter((e) => e.id === 'foley:drop').map((e) => e.at);
    assert.deepEqual(drops, [...dropBeats(gun)].sort((a, b) => a - b), `${gun} drop sounds match the animation's drops`);
  }
});

test('every class and evolved gun starts and ends a reload in exactly the held pose, with the support hand moving in between', () => {
  for (const id of GUN_IDS as readonly GunId[]) {
    for (const aim of [0, Math.PI, 1.2]) {
      const rest = heldHands(id, R, aim);
      for (const t of [0, 1]) {
        const s = reloadScene(id, R, aim, t);
        for (const i of [0, 1] as const) {
          assert.ok(Math.abs(s.hands[i].x - rest[i].x) < 1e-6 && Math.abs(s.hands[i].y - rest[i].y) < 1e-6, `${id} aim ${aim} t=${t} hand ${i}`);
        }
        assert.ok(s.dip < 1e-6, `${id} no dip at t=${t}`);
      }
      const mid = Math.max(...[0.15, 0.3, 0.5, 0.7].map((t) => { const h = reloadScene(id, R, aim, t).hands[1]; return Math.hypot(h.x - rest[1].x, h.y - rest[1].y); }));
      assert.ok(mid > 3, `${id} support hand moves (${mid.toFixed(1)}px)`);
    }
  }
});

test('the hands blend back: k scales the pose, and a cut-off reload eases out over a fraction of a second', () => {
  const rest = heldHands('assault', R, 0)[1];
  const full = reloadScene('assault', R, 0, 0.3, 1).hands[1];
  const half = reloadScene('assault', R, 0, 0.3, 0.5).hands[1];
  const none = reloadScene('assault', R, 0, 0.3, 0).hands[1];
  assert.ok(Math.hypot(none.x - rest.x, none.y - rest.y) < 1e-6);
  assert.ok(Math.hypot(half.x - rest.x, half.y - rest.y) < Math.hypot(full.x - rest.x, full.y - rest.y));
  clearReloads();
  let f = stepReload(1, 'assault', [450, 1500], 1000)!;
  assert.equal(f.t, 0.3);
  assert.equal(f.k, 1, 'seen mid-reload it is simply on');
  // A pickup refills the mag: the reload vanishes at t = 0.3.
  const ks: number[] = [];
  for (let now = 1016; now < 1400; now += 16) { const r = stepReload(1, 'assault', null, now); if (r) ks.push(r.k); }
  assert.ok(ks.length > 5 && ks.length < 14, `eases out over ~150 ms (${ks.length} frames)`);
  assert.deepEqual(ks, [...ks].sort((a, b) => b - a));
  assert.equal(stepReload(1, 'assault', null, 1500), null);
  // Starting from the beginning eases in.
  clearReloads();
  f = stepReload(2, 'smg', [0, 1300], 5000)!;
  assert.equal(f.k, 0);
  assert.equal(stepReload(2, 'smg', [30, 1300], 5030)!.k > 0, true);
});

test('a reload ends on its last ms: the run of frames reaches t = 1 exactly, and the mag is let go once at its beat', () => {
  clearReloads();
  const total = 1500;
  let now = 0, last = null as ReturnType<typeof stepReload>, drops = 0;
  for (let e = 0; e <= total; e += 16) { last = stepReload(3, 'assault', [Math.min(e, total), total], now); drops += last!.drops.length; now += 16; }
  last = stepReload(3, 'assault', [total, total], now);
  assert.equal(last!.t, 1);
  assert.equal(drops, 1);
  assert.deepEqual(dropBeats('assault'), [BEATS.box.drop]);
  assert.equal(dropBeats('akimbo').length, 2);
  assert.equal(dropBeats('sniper').length, 0);
  // The scene at the drop beat holds a mag to let go.
  assert.ok(reloadScene('assault', R, 0, BEATS.box.drop).carried);
  assert.ok(reloadScene('lmg', R, 0, BEATS.lmg.drop).carried?.big);
  assert.ok(reloadScene('akimbo', R, 0, dropBeats('akimbo')[0]!).carried);
  assert.ok(reloadScene('akimbo', R, 0, dropBeats('akimbo')[1]!).carried);
});

test('your own reload follows the predicted trigger: the arms start the moment you press, and end at its reload time', () => {
  const sv = { gun: 'smg' as GunId, mag: 30, reloadMs: 1300, ammo: 10, reloading: false, reloadFrac: 0, alive: true, armed: true };
  let f = settle(NO_FIRING, sv, 0, 0, []).firing;
  assert.equal(selfReload(f, 0), null);
  f = { ...f, trigger: { ...f.trigger, reloadUntil: 5 * TICK_MS + 1300 }, sent: { seq: 5, at: 1000 } };
  assert.deepEqual(selfReload(f, 1000), [0, 1300]);
  assert.deepEqual(selfReload(f, 1050), [50, 1300]);
  assert.deepEqual(selfReload(f, 5000), [1300, 1300], 'the reload runs on real time even when no input has gone out for seconds, and stops at its length');
});
