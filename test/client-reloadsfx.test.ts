/// <reference types="node" />
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GUN_IDS, GUNS, type GunId, type WeaponId } from '../src/shared/defs.ts';
import { reloadMsFor } from '../src/shared/sim/stats.ts';
import { FOLEY, SURFACES, actionCycle, type FoleyId } from '../src/client/foley.ts';
import { MAG_FALL_MS, soundTimeline } from '../src/client/reloadbeats.ts';
import { CROWD, MAX_CATCHUP_MS, OTHER_GAIN, SELF_GAIN, createReloadFoley, floorAt, heftOf, reloadCues, setFloorProbe, type FoleyEmit } from '../src/client/reloadsfx.ts';
import { SOUNDS, minGapMs, priorityOf, varianceOf } from '../src/client/sfx.ts';
import { asCue, lastSoundMs, loadWaa, peakOf, renderCues, renderReload, rmsOf } from '../scripts/render-reload-sfx.ts';

const BASES: WeaponId[] = ['pistol', 'smg', 'assault', 'shotgun', 'sniper', 'lmg'];
/** Every length a gun's reload can really have: its own, with quick reload, with fast hands, and with both. */
const lengths = (gun: GunId) => [...new Set([reloadMsFor(gun, {}), reloadMsFor(gun, { 1: 'quickReload' }), reloadMsFor(gun, { 2: 'fastHands' }), reloadMsFor(gun, { 1: 'quickReload', 2: 'fastHands' })].map(Math.round))];

type Heard = { id: FoleyId; x: number; y: number; self: boolean; gain: number; pitch: number; pan?: number; delayMs?: number; at: number };
function harness() {
  const heard: Heard[] = [];
  let clock = 0;
  const emit: FoleyEmit = (id, x, y, self, o) => { heard.push({ id, x, y, self, ...o, at: clock }); };
  const foley = createReloadFoley(emit);
  return { heard, foley, setClock: (n: number) => { clock = n; } };
}
const me = (gun: GunId, over: Partial<{ id: number; x: number; y: number; self: boolean; hidden: boolean }> = {}) => ({ id: 1, gun, x: 0, y: 0, self: true, ...over });

/** Runs one reload clock frame by frame (`frameMs` apart) and returns what was heard, with the elapsed reload time of the frame each sound fired in. */
function playReload(gun: GunId, total: number, o: { frameMs?: number; self?: boolean; from?: number; to?: number } = {}) {
  const { heard, foley, setClock } = harness();
  const frameMs = o.frameMs ?? 8, self = o.self ?? true;
  for (let t = o.from ?? 0; t <= (o.to ?? total) + 1e-9; t += frameMs) {
    setClock(t);
    foley.step(me(gun, { self }), [Math.min(t, total), total], 1000 + t);
  }
  return heard;
}

test('every cue a reload can play is in the recipe table, on every gun, floor and size', () => {
  for (const id of GUN_IDS) {
    const timeline = soundTimeline(id);
    assert.ok(timeline.length >= 4, `${id} has a reload sound sequence`);
    for (const e of timeline) {
      const ids = e.id === 'foley:drop' ? SURFACES.map((s) => `foley:drop:${s}` as const) : [e.id];
      for (const cue of ids) assert.ok(SOUNDS[cue]?.length > 0, `${id}: ${cue} has a recipe`);
    }
  }
  for (const [id, layers] of Object.entries(FOLEY)) {
    assert.equal(SOUNDS[id as FoleyId].length, layers.length, `${id} is in the sound table as written`);
    for (const l of layers) assert.ok(Number.isFinite(l.gain) && l.gain > 0 && l.ms > 0 && (l.delayMs ?? 0) >= 0, `${id} has sane layers`);
  }
  // Nothing in the table is dead weight: every foley cue is used by some gun's reload or is a floor's drop.
  const used = new Set<string>(GUN_IDS.flatMap((g) => soundTimeline(g).flatMap((e) => (e.id === 'foley:drop' ? SURFACES.map((s) => `foley:drop:${s}`) : [e.id]))));
  // (The box-size variants a class never plays, and the single-round push no 1-2 round bolt gun needs yet, are the only spares.)
  for (const id of Object.keys(FOLEY)) assert.ok(used.has(id) || /:(lmg|smg|assault|pistol)$/.test(id) || id === 'foley:round', `${id} is used`);
});

test('each mechanism has its own sound sequence: box mags, pump, bolt, belt box and a pair of pistols', () => {
  const seq = (g: GunId) => soundTimeline(g).map((e) => e.id.split(':')[1]);
  assert.deepEqual(seq('pistol'), ['release', 'magout', 'drop', 'pouch', 'magscrape', 'magseat', 'slap', 'rackback', 'rack']);
  assert.deepEqual(seq('assault'), seq('pistol'), 'a rifle is the same sequence with its own, heavier clicks');
  assert.notDeepEqual(soundTimeline('pistol').map((e) => e.id), soundTimeline('assault').map((e) => e.id));
  const shells = GUNS.shotgun.mag;
  assert.equal(soundTimeline('shotgun').filter((e) => e.id === 'foley:shellin').length, Math.min(6, shells), 'a click home per shell');
  assert.equal(soundTimeline('shotgun').filter((e) => e.id === 'foley:shellpick').length, Math.min(6, shells));
  assert.deepEqual(seq('shotgun').slice(-2), ['pumpback', 'pump'], 'the pump racks last, in two parts');
  assert.deepEqual(seq('sniper'), ['boltup', 'boltdraw', 'boltrear', 'pouch', 'clipseat', 'ratchet', 'boltfwd', 'boltlock']);
  assert.deepEqual(seq('lmg'), ['latch', 'creak', 'belt', 'magout', 'drop', 'pouch', 'magscrape', 'magseat', 'beltlay', 'slam', 'rackback', 'rack']);
  const ak = soundTimeline('akimbo');
  assert.equal(ak.filter((e) => e.id === 'foley:magseat:pistol').length, 2, 'two pistols, two mags seated');
  assert.equal(ak.filter((e) => e.id === 'foley:drop').length, 2);
  const seats = ak.filter((e) => e.id === 'foley:magseat:pistol');
  assert.ok(seats[0]!.at < 0.5 && seats[1]!.at > 0.5, 'one after the other');
  assert.ok(seats[0]!.pan! < 0 && seats[1]!.pan! > 0, 'alternating sides of the pan');
  // Silenced and evolved guns use their class's mechanism.
  for (const id of GUN_IDS) {
    const base = GUNS[id].base;
    if (GUNS[id].look.hands === 2) continue;
    assert.deepEqual(soundTimeline(id).map((e) => e.id).filter((x) => x !== 'foley:pouch' && x !== 'foley:shellin' && x !== 'foley:shellpick' && x !== 'foley:ratchet' && x !== 'foley:round'),
      soundTimeline(base).map((e) => e.id).filter((x) => x !== 'foley:pouch' && x !== 'foley:shellin' && x !== 'foley:shellpick' && x !== 'foley:ratchet' && x !== 'foley:round'), `${id} reloads like a ${base}`);
  }
  assert.deepEqual(soundTimeline('ghost').map((e) => e.id), soundTimeline('semiAuto').map((e) => e.id), 'silenced foley is not suppressed');
});

test('the sound schedule maps onto the real reload time exactly, with quick reload and fast hands', () => {
  for (const gun of GUN_IDS) {
    for (const ms of lengths(gun)) {
      const cues = reloadCues(gun, ms);
      soundTimeline(gun).forEach((e, i) => assert.equal(cues[i]!.delayMs, Math.round(e.at * ms) + (e.afterMs ?? 0), `${gun} ${e.id} at ${ms}ms`));
      const shared = soundTimeline(gun).map((e) => e.at);
      assert.deepEqual(shared, [...shared].sort((a, b) => a - b), `${gun} sounds are in order`);
      assert.ok(shared.every((s) => s > 0 && s < 1), `${gun} sounds are inside the reload`);
    }
  }
  assert.ok(reloadMsFor('assault', { 1: 'quickReload' }) < GUNS.assault.reloadMs, 'the perk really shortens the reload');
});

test('live, every sound fires once, on its beat, at the reload\'s true length (perks, evolved guns, any frame rate)', () => {
  for (const gun of GUN_IDS) {
    for (const total of lengths(gun)) {
      for (const frameMs of [4, 16, 33]) {
        const heard = playReload(gun, total, { frameMs });
        const timeline = soundTimeline(gun);
        assert.equal(heard.length, timeline.length, `${gun} at ${total}ms (${frameMs}ms frames) fires each sound once`);
        timeline.forEach((e, i) => {
          const h = heard[i]!;
          assert.equal(h.id, e.id === 'foley:drop' ? `foley:drop:${floorAt(undefined, 0, 0)}` : e.id);
          const due = e.at * total;
          assert.ok(h.at >= due - 1e-6 && h.at < due + frameMs, `${gun} ${e.id}: fired at ${h.at}ms for a beat at ${due.toFixed(1)}ms (frame ${frameMs})`);
        });
      }
    }
  }
});

test('a mag drop clatters after its fall, as real time not reload time; nothing else is delayed', () => {
  for (const gun of ['pistol', 'lmg', 'akimbo'] as GunId[]) {
    for (const total of lengths(gun)) {
      const heard = playReload(gun, total);
      for (const h of heard) {
        if (h.id.startsWith('foley:drop:')) assert.ok(h.delayMs! >= MAG_FALL_MS && h.delayMs! < MAG_FALL_MS + 60, `${gun} drop waits for the fall at ${total}ms`);
        else assert.equal(h.delayMs, undefined, `${gun} ${h.id} plays the moment its beat comes`);
      }
    }
  }
});

test('a cancelled reload stops: no further beats, no queued sounds, and the next reload starts clean', () => {
  for (const gun of ['assault', 'shotgun', 'sniper', 'lmg', 'akimbo'] as GunId[]) {
    const total = reloadMsFor(gun, { 1: 'quickReload' }), { heard, foley, setClock } = harness();
    for (let t = 0; t <= total * 0.5; t += 8) { setClock(t); foley.step(me(gun), [t, total], 1000 + t); }
    const before = heard.length;
    assert.ok(before > 0 && before < soundTimeline(gun).length, `${gun} was part-way`);
    // Cut off (a pickup refilled the mag, a death, a weapon change): rl is gone.
    for (let t = total * 0.5; t <= total * 2; t += 8) { setClock(t); foley.step(me(gun), null, 1000 + t); }
    assert.equal(heard.length, before, `${gun}: nothing more is heard once the reload is cut off`);
    assert.ok(heard.every((h) => h.delayMs === undefined || h.id.startsWith('foley:drop:')), 'no sound was queued ahead');
    // A new reload of the same gun: from the very start, nothing skipped.
    heard.length = 0;
    for (let t = 0; t <= total; t += 8) { setClock(t); foley.step(me(gun), [t, total], 5000 + t); }
    assert.equal(heard.length, soundTimeline(gun).length, `${gun} reloads again in full`);
  }
});

test('a gun change or a reload clock that restarts is a new reload, not a continuation', () => {
  const { heard, foley } = harness();
  foley.step(me('pistol'), [0, 1000], 1000);
  foley.step(me('pistol'), [600, 1000], 1016);
  const mid = heard.length;
  // Swapped to a shotgun mid-reload: the pistol's remaining beats are gone, the shotgun's earlier ones are skipped.
  foley.step(me('shotgun'), [900, 1800], 1032);
  foley.step(me('shotgun'), [1000, 1800], 1048);
  assert.ok(heard.slice(mid).every((h) => !h.id.includes(':pistol')), 'no pistol sound after the swap');
  assert.ok(heard.slice(mid).every((h) => /pump|shell/.test(h.id)));
  // The reload ends and a new one starts between two frames: the clock runs backwards, so it begins again.
  const { heard: h2, foley: f2 } = harness();
  f2.step(me('smg'), [1200, 1300], 1000);
  f2.step(me('smg'), [30, 1300], 1016);
  f2.step(me('smg'), [1000, 1300], 1016 + 1000);
  assert.equal(h2.length, 0, 'a restart seen at 30ms has not reached its first beat; a stale frame afterwards is skipped, not replayed');
});

test('a remote reload joined midway skips the beats already passed and plays the rest once', () => {
  for (const gun of ['assault', 'shotgun', 'sniper', 'lmg', 'pistol', 'akimbo'] as GunId[]) {
    const total = GUNS[gun].reloadMs;
    for (const joinAt of [0.3, 0.5, 0.8, 0.97]) {
      const heard = playReload(gun, total, { from: joinAt * total, self: false });
      const rest = soundTimeline(gun).filter((e) => e.at > joinAt + 8 / total);
      const missed = soundTimeline(gun).filter((e) => e.at <= joinAt);
      assert.ok(heard.length >= rest.length && heard.length <= soundTimeline(gun).length - missed.length, `${gun} joined at ${joinAt}: ${heard.length} heard of ${rest.length}..`);
      const ids = heard.map((h) => h.id);
      for (const e of missed) assert.ok(!ids.includes(e.id === 'foley:drop' ? (`foley:drop:${floorAt(undefined, 0, 0)}` as FoleyId) : e.id) || soundTimeline(gun).filter((x) => x.id === e.id).length > missed.filter((x) => x.id === e.id).length, `${gun} does not replay ${e.id}`);
      assert.ok(heard.every((h) => h.at >= joinAt * total), 'nothing before the join');
    }
  }
  // A frame gap too big to be a frame (a hidden tab) is not caught up with.
  const { heard, foley } = harness();
  foley.step(me('assault', { self: false }), [100, 1500], 1000);
  foley.step(me('assault', { self: false }), [100 + MAX_CATCHUP_MS * 2, 1500], 1016);
  assert.equal(heard.length, 0, 'beats behind a long stall are skipped, not machine-gunned');
});

test('your own reload is centred and louder than someone else\'s, who is placed in the world and quieter', () => {
  const mine = playReload('assault', 1500, { self: true }), theirs = playReload('assault', 1500, { self: false });
  assert.ok(mine.every((h) => h.self) && theirs.every((h) => !h.self));
  assert.ok(SELF_GAIN > OTHER_GAIN);
  for (let i = 0; i < mine.length; i++) assert.ok(mine[i]!.gain > theirs[i]!.gain * 1.5, `${mine[i]!.id} is louder for you`);
  const ak = playReload('akimbo', 1700, { self: true }), others = playReload('akimbo', 1700, { self: false });
  assert.ok(ak.some((h) => h.pan! < 0) && ak.some((h) => h.pan! > 0), 'your own pistols alternate in the pan');
  assert.ok(others.every((h) => h.pan === undefined), 'others\' are placed by where they are, not panned');
});

test('a crowd reloading at once is rate limited; you never are; the out-of-earshot and the hidden are silent', () => {
  const total = 1000, { heard, foley, setClock } = harness();
  const crowd = Array.from({ length: 30 }, (_, i) => me('assault', { id: 100 + i, self: false, x: 100 + i * 3, y: 0 }));
  const env = { listener: { x: 0, y: 0 }, viewRadius: 900 };
  for (let t = 0; t <= total; t += 8) {
    setClock(t);
    for (const p of crowd) foley.step(p, [t, total], 1000 + t, env);
    foley.step(me('assault', { id: 1 }), [t, total], 1000 + t, env);
  }
  const others = heard.filter((h) => !h.self), mineHeard = heard.filter((h) => h.self);
  assert.equal(mineHeard.length, soundTimeline('assault').length, 'your own reload is whole');
  // Any window of CROWD.windowMs holds at most CROWD.max of the crowd's sounds: a few at a time (a murmur, not one click) over a real stretch of time.
  assert.ok(CROWD.max >= 3 && CROWD.windowMs >= 150, 'the limit still lets a crowd be heard');
  for (const a of others) assert.ok(others.filter((b) => b.at >= a.at && b.at < a.at + CROWD.windowMs).length <= CROWD.max, 'the crowd is a murmur');
  assert.ok(others.length > 0 && others.length < 30 * soundTimeline('assault').length / 4, 'but not silent');
  // Out of earshot and hidden soldiers make no sound.
  const quiet = harness();
  const far = me('assault', { id: 7, self: false, x: 5000, y: 0 }), ghost = me('assault', { id: 8, self: false, x: 100, y: 0, hidden: true });
  for (let t = 0; t <= total; t += 8) { quiet.foley.step(far, [t, total], 1000 + t, env); quiet.foley.step(ghost, [t, total], 1000 + t, env); }
  assert.equal(quiet.heard.length, 0);
  assert.ok(minGapMs('foley:magseat:assault') > 0, 'the engine also spaces other soldiers\' repeats of one cue');
  assert.equal(priorityOf({ id: 'foley:magseat:assault', self: false }), 0, 'others\' foley is the first thing dropped from a busy mix');
  assert.equal(priorityOf({ id: 'foley:magseat:assault', self: true }), 1);
});

test('a dropped mag lands on the floor the map has, and a probe that knows better wins', () => {
  assert.equal(floorAt('park', 0, 0), 'grass');
  assert.equal(floorAt('summit', 0, 0), 'snow');
  assert.equal(floorAt(undefined, 0, 0), 'concrete');
  const drops = (mapId: string) => {
    const { heard, foley } = harness();
    for (let t = 0; t <= 1000; t += 8) foley.step(me('pistol'), [t, 1000], t, { mapId });
    return heard.filter((h) => h.id.startsWith('foley:drop:')).map((h) => h.id);
  };
  assert.deepEqual(drops('park'), ['foley:drop:grass']);
  assert.deepEqual(drops('summit'), ['foley:drop:snow']);
  setFloorProbe((x) => (x > 50 ? 'wood' : null));
  try {
    assert.equal(floorAt('park', 100, 0), 'wood');
    assert.equal(floorAt('park', 0, 0), 'grass');
  } finally { setFloorProbe(null); }
  const level = (s: (typeof SURFACES)[number]) => SOUNDS[`foley:drop:${s}`].reduce((a, l) => a + l.gain, 0);
  assert.ok(level('snow') < level('concrete') && level('grass') < level('metal'), 'soft floors thud, hard floors ring');
  assert.ok(SOUNDS['foley:drop:metal'].some((l) => l.src === 'tone' && l.pitchHz[0] > 1500), 'metal rings');
  assert.ok(!SOUNDS['foley:drop:snow'].some((l) => l.src === 'tone' && l.pitchHz[0] > 400), 'snow does not');
});

test('bigger guns sound lower and heavier, smaller ones higher and lighter, never by more than a tone', () => {
  assert.deepEqual(heftOf('pistol'), { pitch: 1, gain: 1 });
  assert.ok(heftOf('executioner').pitch < heftOf('handCannon').pitch && heftOf('handCannon').pitch < 1);
  assert.ok(heftOf('hornet').pitch > 1 && heftOf('hornet').gain < 1);
  assert.ok(heftOf('bulldog').pitch < 1 || heftOf('bulldog').gain >= 1);
  for (const id of GUN_IDS) { const h = heftOf(id); assert.ok(h.pitch >= 0.86 && h.pitch <= 1.14 && h.gain >= 0.9 && h.gain <= 1.15, id); }
  for (const [light, heavy] of [['pistol', 'smg'], ['smg', 'assault'], ['assault', 'lmg']] as const) {
    const low = (g: WeaponId) => Math.min(...SOUNDS[`foley:magseat:${g}` as FoleyId].flatMap((l) => (l.src === 'tone' ? [l.pitchHz[1]] : [])));
    assert.ok(low(heavy) < low(light), `${heavy}'s mag seat is lower than ${light}'s`);
  }
});

test('reload foley is shaped like foley, not bleeps: no square-wave beeps, weight under the clicks, brief', () => {
  for (const [id, layers] of Object.entries(FOLEY)) {
    assert.ok(!layers.some((l) => l.src === 'tone' && l.wave === 'square'), `${id} has no toy bleeps`);
    assert.ok(Math.max(...layers.map((l) => (l.delayMs ?? 0) + l.ms)) <= 400, `${id} is a short event`);
    assert.ok(layers.length >= 3, `${id} is layered`);
  }
  for (const id of ['foley:magseat:pistol', 'foley:rack:assault', 'foley:slam', 'foley:pump', 'foley:boltlock', 'foley:drop:concrete'] as const) {
    assert.ok(FOLEY[id].some((l) => l.src === 'tone' && Math.max(...l.pitchHz) < 260), `${id} has a low thump`);
    assert.ok(FOLEY[id].some((l) => l.src === 'noise' && l.filter === 'highpass'), `${id} has a transient`);
    assert.ok(FOLEY[id].filter((l) => l.src === 'tone' && l.pitchHz[0] > 900).length >= 2, `${id} rings with metallic partials`);
  }
  assert.ok(varianceOf('foley:magseat:pistol').pitch > 0, 'repeats are not identical');
});

test('the shot cycle: a bolt-action works its bolt and a pump gun racks between shots, for your own ears only', () => {
  for (const id of GUN_IDS) {
    const g = GUNS[id], cycle = actionCycle(g.base, g.fireMs, g.mag);
    const bolt = g.base === 'sniper' && g.fireMs >= 1000, pump = g.base === 'shotgun' && g.fireMs >= 480 && g.mag > 2;
    assert.equal(cycle !== null, bolt || pump, `${id}`);
    if (!cycle) continue;
    assert.ok(cycle.every((l) => l.selfOnly), `${id}'s action is not heard across the map`);
    assert.ok(Math.max(...cycle.map((l) => (l.delayMs ?? 0) + l.ms)) < g.fireMs + 100, `${id}'s cycle fits its fire interval`);
    assert.ok(SOUNDS[`shot:${id}`].filter((l) => l.selfOnly).length >= (bolt ? 20 : 8), `${id}'s shot carries the cycle`);
  }
  assert.ok(actionCycle('sniper', GUNS.semiAuto.fireMs, 10) === null, 'a semi-auto has nothing to work');
  const peak = (id: GunId, self: boolean) => Math.max(...SOUNDS[`shot:${id}`].filter((l) => self || !l.selfOnly).map((l) => l.gain));
  assert.equal(peak('sniper', false) > 0, true);
});

// --- Offline renders through the real engine and bus (needs node-web-audio-api; skipped without it) ---------------------------

const waa = loadWaa();
const DB = (v: number) => 20 * Math.log10(v);

test('offline render: every class\'s full reload is audible, under the limiter and under the gunfire, and ends with the reload', { skip: waa ? false : 'node-web-audio-api is not installed (see scripts/render-reload-sfx.ts)' }, async () => {
  const shot = await renderCues(waa!, [{ id: 'shot:pistol', x: 0, y: 0, self: true, gain: 1 }], 1.2);
  const shotPeak = peakOf(shot);
  for (const gun of ['pistol', 'akimbo', 'smg', 'assault', 'lmg', 'shotgun', 'sniper', 'handCannon', 'bulldog', 'longshot', 'ghost'] as GunId[]) {
    for (const ms of [GUNS[gun].reloadMs, Math.round(GUNS[gun].reloadMs * 0.65)]) {
      const r = await renderReload(waa!, gun, ms);
      const peak = peakOf(r);
      assert.ok(peak < 0.5, `${gun} ${ms}ms peaks at ${DB(peak).toFixed(1)} dBFS, well under the limiter ceiling`);
      assert.ok(peak < shotPeak * 0.5, `${gun} reload (${DB(peak).toFixed(1)} dBFS) sits at least 6 dB under a gunshot (${DB(shotPeak).toFixed(1)} dBFS)`);
      assert.ok(peak > 0.02 && rmsOf(r) > 0.001, `${gun} is audible (${DB(peak).toFixed(1)} dBFS)`);
      const timeline = reloadCues(gun, ms), first = timeline[0]!.delayMs, last = Math.max(...timeline.map((c) => c.delayMs));
      const end = lastSoundMs(r);
      assert.ok(end > last, `${gun} the last sound (${Math.round(end)}ms) is after the last beat (${last}ms)`);
      assert.ok(end < last + 450, `${gun} rings out within 450 ms of its last beat, not a stuck tone (${Math.round(end)}ms)`);
      // Silence before the first beat: nothing earlier than 12 ms ahead of it.
      const lead = Math.floor(((first - 12) / 1000) * 44100);
      assert.ok(Math.max(...r.left.slice(0, Math.max(0, lead)).map(Math.abs), 0) < 1e-4, `${gun} is silent until its first beat`);
      assert.ok(end < ms + 450, `${gun} does not outlast its reload by more than a ring`);
    }
  }
});

test('offline render: other soldiers\' reloads are quieter than yours, dulled with distance and silent past earshot; the mix with gunfire never clips', { skip: waa ? false : 'node-web-audio-api is not installed' }, async () => {
  const own = peakOf(await renderReload(waa!, 'assault', 1500));
  const near = peakOf(await renderReload(waa!, 'assault', 1500, { self: false, distance: 150 }));
  const far = peakOf(await renderReload(waa!, 'assault', 1500, { self: false, distance: 800 }));
  const gone = peakOf(await renderReload(waa!, 'assault', 1500, { self: false, distance: 1200 }));
  assert.ok(own > near && near > far, `yours ${DB(own).toFixed(1)} > near ${DB(near).toFixed(1)} > far ${DB(far).toFixed(1)} dBFS`);
  assert.ok(near < own * 0.7, 'a soldier next to you is audibly under your own');
  assert.ok(gone < 1e-3, 'past the audible radius nothing is heard');
  // A firefight with a reload in the middle: the reload adds next to nothing to the peak. (The absolute ceiling is the bus limiter's;
  // this implementation's compressor is only a stand-in for a browser's, so the check is relative: the foley does not move the peak.)
  const shots = Array.from({ length: 10 }, (_, i) => ({ id: 'shot:assault' as const, x: 0, y: 0, self: true, gain: 1, delayMs: i * 120 }));
  const alone = peakOf(await renderCues(waa!, shots, 2));
  const mixed = peakOf(await renderCues(waa!, [...shots, ...reloadCues('assault', 1000).map((c) => asCue({ ...c, delayMs: c.delayMs + 200 }, 0, 0, true))], 2));
  assert.ok(mixed < alone * 1.15, `the foley does not push the gunfire's peak (${DB(alone).toFixed(1)} -> ${DB(mixed).toFixed(1)} dBFS)`);
});
