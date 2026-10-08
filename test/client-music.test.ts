/// <reference types="node" />
import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Snapshot } from '../src/shared/protocol.ts';
import { NO_TRACKER, observe, outcomeOf, finaleOf } from '../src/client/musicstate.ts';
import {
  approach, beatAt, BARS_PER_PHRASE, chordAt, crossfade, generateBar, heartTier, IDLE_INPUT, layerTargets, levelGain, stepHeat, tempoFor, type MusicInput,
} from '../src/client/musictheory.ts';

const input = (o: Partial<MusicInput>): MusicInput => ({ ...IDLE_INPUT, phase: 'play', ...o });

test('a seed always writes the same bars, and different seeds write different ones', () => {
  for (let n = 0; n < 16; n++) assert.deepEqual(generateBar(42, 'major', n), generateBar(42, 'major', n));
  const a = JSON.stringify(Array.from({ length: 16 }, (_, n) => generateBar(1, 'major', n)));
  const b = JSON.stringify(Array.from({ length: 16 }, (_, n) => generateBar(2, 'major', n)));
  assert.notEqual(a, b);
});

test('the march keeps its own key whatever the seed, and every note stays in a playable range', () => {
  for (let seed = 0; seed < 40; seed++) {
    const bar = generateBar(seed, seed % 2 ? 'minor' : 'major', seed);
    assert.equal(bar.tonic, 0, 'C, the plaza band\'s key');
    for (const e of bar.events) {
      assert.ok(e.step >= 0 && e.step < 16 && e.dur > 0 && e.vel > 0 && e.vel <= 1, JSON.stringify(e));
      if (e.inst === 'lead') assert.ok(e.midi >= 60 && e.midi <= 100, `lead ${e.midi}`);
    }
  }
});

test('the lead is diatonic in major and the bars loop with variation, not repetition', () => {
  const major = new Set([0, 2, 4, 5, 7, 9, 11]);
  for (let n = 0; n < 24; n++) {
    const bar = generateBar(5, 'major', n);
    for (const e of bar.events) if (e.inst === 'lead' && e.layer === 'hype') assert.ok(major.has((((e.midi - bar.tonic) % 12) + 12) % 12), `bar ${n} note ${e.midi}`);
  }
  const phrases = [0, 1, 2, 3].map((p) => JSON.stringify(Array.from({ length: BARS_PER_PHRASE }, (_, n) => generateBar(5, 'major', p * BARS_PER_PHRASE + n).events.map((e) => e.midi))));
  assert.ok(new Set(phrases).size > 1, 'four phrases are not all the same');
});

test('the march\'s A rests on the dominant halfway and comes home at its end, in major and minor', () => {
  for (const mode of ['major', 'minor'] as const) {
    assert.equal(chordAt(mode, 0).degree, 0);
    assert.equal(chordAt(mode, 3).degree, 7);
    assert.equal(chordAt(mode, BARS_PER_PHRASE - 1).degree, 0);
  }
  assert.deepEqual(chordAt('minor', 0).chord.tones, [0, 3, 7], 'the night turns the tonic minor');
});

test('night is minor with a heartbeat that thickens with the horde, day has neither', () => {
  const minorBar = generateBar(3, 'minor', 0);
  assert.equal(minorBar.mode, 'minor');
  assert.ok(minorBar.chord.tones.length === 3);
  const hearts = (tier: 0 | 1 | 2) => minorBar.events.filter((e) => e.inst === 'heart' && (e.tier ?? 0) <= tier).length;
  assert.ok(hearts(0) < hearts(1) && hearts(1) < hearts(2));
  assert.deepEqual([heartTier(0), heartTier(0.5), heartTier(1)], [0, 1, 2]);
  assert.equal(layerTargets(input({ day: true, mode: 'zombies' })).heart, 0);
  const quiet = layerTargets(input({ night: true, mode: 'zombies', horde: 0 })).heart;
  const full = layerTargets(input({ night: true, mode: 'zombies', horde: 1 })).heart;
  assert.ok(quiet > 0 && full === 1 && full > quiet);
  assert.ok(tempoFor({ mode: 'zombies', night: true, day: false }) !== tempoFor({ mode: 'zombies', night: false, day: true }));
});

test('state maps to layers: calm, then combat, hype and the finale stack on top', () => {
  assert.deepEqual(layerTargets(IDLE_INPUT), { calm: 1, combat: 0, hype: 0, finale: 0, heart: 0 });
  const calm = layerTargets(input({}));
  assert.deepEqual([calm.combat, calm.hype, calm.finale], [0, 0, 0]);
  assert.ok(layerTargets(input({ heat: 0.6 })).combat > 0.5);
  assert.equal(layerTargets(input({ heat: 1 })).hype, 0);
  for (const hot of [{ streak: 3 }, { multi: true }, { hunted: true }]) {
    const t = layerTargets(input(hot));
    assert.equal(t.hype, 1);
    assert.ok(t.combat >= 0.8, 'hype brings the fight in with it');
  }
  assert.equal(layerTargets(input({ streak: 2 })).hype, 0);
  assert.equal(layerTargets(input({ finale: true })).finale, 1);
  const dead = layerTargets(input({ phase: 'dead', streak: 9 }));
  assert.deepEqual([dead.combat, dead.hype, dead.finale], [0, 0, 0]);
});

test('crossfades are equal power and fades are smooth', () => {
  for (const x of [0, 0.25, 0.5, 0.9, 1]) { const { a, b } = crossfade(x); assert.ok(Math.abs(a * a + b * b - 1) < 1e-12); }
  assert.deepEqual([crossfade(0).a, crossfade(1).b], [1, 1]);
  assert.equal(crossfade(-5).b, 0);
  assert.equal(levelGain(0), 0);
  assert.equal(levelGain(1), 1);
  let v = 0;
  for (let i = 0; i < 100; i++) { const n = approach(v, 1, 0.05, 0.5); assert.ok(n >= v && n <= 1); v = n; }
  assert.ok(v > 0.99);
});

test('heat rises quickly in a fight and drains slowly after', () => {
  let h = 0;
  for (let i = 0; i < 20; i++) h = stepHeat(h, 0.05, { near: 0, firing: true, hurt: false, dealt: false });
  assert.ok(h > 0.4, `rose to ${h}`);
  const peak = h;
  for (let i = 0; i < 20; i++) h = stepHeat(h, 0.05, { near: 0, firing: false, hurt: false, dealt: false });
  assert.ok(h < peak && h > peak * 0.5, 'one second later it has barely faded');
  for (let i = 0; i < 400; i++) h = stepHeat(h, 0.05, { near: 0, firing: false, hurt: false, dealt: false });
  assert.ok(h < 0.02);
});

test('the beat clock follows scheduled bars, including a tempo change', () => {
  const bars = [{ t0: 10, spb: 0.5, barNo: 0 }, { t0: 12, spb: 0.4, barNo: 1 }];
  assert.equal(beatAt(bars, 9), null);
  const a = beatAt(bars, 10.75)!;
  assert.equal(a.bar, 0); assert.equal(a.beatInBar, 1); assert.ok(Math.abs(a.phase - 0.5) < 1e-9);
  const b = beatAt(bars, 12.6)!;
  assert.equal(b.bar, 1); assert.equal(b.beatInBar, 1); assert.ok(Math.abs(b.beat - 5.5) < 1e-9);
});

// ---- reading snapshots ----

function snap(o: { tick?: number; events?: Snapshot['events']; streak?: number; hp?: number; match?: Partial<Snapshot['match']>; run?: Snapshot['run']; zombies?: Snapshot['zombies']; enemy?: boolean }): Snapshot {
  const me = { id: 1, name: 'me', x: 0, y: 0, angle: 0, hp: o.hp ?? 100, maxHp: 100, color: 'red', gun: 'pistol', team: null, alive: true, hidden: false, shield: false, dashing: false, score: 0, level: 1, armorTier: 'none', kind: 'human', hunted: false };
  const enemy = { ...me, id: 2, x: 100, y: 0 };
  return {
    t: 'snap', tick: o.tick ?? 1, ackSeq: 0,
    self: { id: 1, streak: o.streak ?? 0, viewRadius: 600 },
    players: o.enemy ? [me, enemy] : [me], bullets: [], crates: [], thrown: [], zones: [], minimap: [], leaderboard: [],
    match: { mode: 'FFA', map: 'm', nextMap: 'n', mapChangeIn: 0, teamScore: { red: 0, blue: 0 }, winner: null, restartIn: 0, roundEndsAt: null, ...o.match },
    events: o.events ?? [], zombies: o.zombies, run: o.run,
  } as unknown as Snapshot;
}
const kill = (killerId: number): Snapshot['events'][number] => ({ e: 'kill', killer: 'a', victim: 'b', killerId, victimId: 9, weapon: 'p', bounty: false, assisters: [], ended: 0, revenge: false });

test('your kills sting once per snapshot, a second inside three seconds is a multi-kill', () => {
  const first = observe(NO_TRACKER, snap({ tick: 1, events: [kill(1)], streak: 1 }), 'play', 1000, false);
  assert.deepEqual(first.cues, [{ kind: 'kill', streak: 1, bounty: false }]);
  assert.equal(first.tracker.input.multi, false);
  const again = observe(first.tracker, snap({ tick: 1, events: [kill(1)] }), 'play', 1016, false);
  assert.deepEqual(again.cues, [], 'the same tick is not read twice');
  const second = observe(first.tracker, snap({ tick: 2, events: [kill(1)], streak: 2 }), 'play', 2000, false);
  assert.equal(second.tracker.input.multi, true);
  assert.deepEqual(observe(NO_TRACKER, snap({ events: [kill(5)] }), 'play', 0, false).cues, [], 'others\' kills do not sting');
});

test('firing and enemies close by heat the fight, and the menu is idle', () => {
  let tr = NO_TRACKER;
  for (let i = 1; i <= 30; i++) tr = observe(tr, snap({ tick: i, enemy: true }), 'play', i * 50, true).tracker;
  assert.ok(tr.input.heat > 0.5);
  assert.deepEqual(observe(tr, null, 'menu', 9999, false).tracker.input, IDLE_INPUT);
});

test('night, the horde and a boss shape the zombie score', () => {
  const run = (phase: 'day' | 'night', alive: number) => ({ phase, night: 1, phaseEndsAt: null, scrap: 0, core: { x: 0, y: 0, hp: 1, maxHp: 1 }, aliveZombies: alive, waveLeft: alive, survivors: 1, lost: 0, ready: [], report: null }) as Snapshot['run'];
  const night = observe(NO_TRACKER, snap({ run: run('night', 50) }), 'play', 0, false).tracker.input;
  assert.deepEqual([night.night, night.horde, night.mode], [true, 1, 'zombies']);
  assert.equal(observe(NO_TRACKER, snap({ run: run('day', 0) }), 'play', 0, false).tracker.input.day, true);
  assert.equal(finaleOf(snap({ run: run('night', 1), zombies: [[1, 5, 0, 0, 10]] })), true, 'a colossus');
  assert.equal(finaleOf(snap({ run: run('night', 1), zombies: [[1, 0, 0, 0, 10]] })), false, 'a walker');
});

test('the last sixty seconds of a round are the finale', () => {
  const tickMs = 1000 / 30;
  const at = (leftMs: number) => snap({ tick: 1000, match: { roundEndsAt: 1000 * (1000 / 30) + leftMs } });
  void tickMs;
  assert.equal(finaleOf(at(61_000)), false);
  assert.equal(finaleOf(at(59_000)), true);
  assert.equal(finaleOf(snap({ match: { roundEndsAt: null } })), false);
});

test('a round or run ending plays one cadence, a win or a loss', () => {
  const won = snap({ match: { winner: { name: 'me', id: 1, note: null } } });
  const lost = snap({ match: { winner: { name: 'x', id: 2, note: null } } });
  assert.equal(outcomeOf(won), 'win');
  assert.equal(outcomeOf(lost), 'loss');
  const a = observe(NO_TRACKER, won, 'play', 0, false);
  assert.deepEqual(a.cues, [{ kind: 'win' }]);
  assert.deepEqual(observe(a.tracker, { ...won, tick: 2 }, 'play', 50, false).cues, [], 'only once');
  const next = observe(a.tracker, snap({ tick: 3 }), 'play', 100, false);
  assert.equal(next.tracker.ended, false, 'a new round can end again');
});

test('a sampled instrument whose notes failed to load (a network blip) is fetched again the next time a track asks for it', async () => {
  const { createSampleBank, SAMPLES } = await import('../src/client/musicsamples.ts');
  const buffer = { duration: 2, sampleRate: 100, getChannelData: () => Float32Array.from({ length: 200 }, (_, i) => (i > 3 ? 0.5 : 0)) };
  const ctx = { decodeAudioData: async () => buffer } as unknown as BaseAudioContext;
  let online = false, fetched = 0;
  const bank = createSampleBank(ctx, async () => { fetched++; if (!online) throw new Error('offline'); return new ArrayBuffer(8); });
  await bank.load(['piano']);
  assert.equal(bank.voice('piano'), null, 'offline: the synth stands in');
  assert.equal(fetched, SAMPLES.piano!.notes.length);
  online = true;
  await bank.load(['piano']);
  assert.notEqual(bank.voice('piano'), null, 'back online, the next track start brings the samples in');
  const before = fetched;
  await bank.load(['piano']);
  assert.equal(fetched, before, 'a loaded instrument is never fetched twice');
});
