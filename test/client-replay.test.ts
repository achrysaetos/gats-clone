/// <reference types="node" />
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { GameEvent, PlayerView, Snapshot } from '../src/shared/protocol.ts';
import { TICK_MS } from '../src/client/interp.ts';
import { clipOf, createReplayBuffer, frameAt, recordFrame, serverMs, snapWeight } from '../src/client/replaybuf.ts';
import { clusterScore, foldEvents, HIGHLIGHT, NO_HIGHLIGHT, observeHighlight, stampsAt } from '../src/client/highlight.ts';
import { dilatedView, IDLE_WARP, intensityAt, requestSlowmo, SLOWMO, slowmoTrigger, speedAt, stepWarp, totalLag } from '../src/client/slowmo.ts';
import { replayView } from '../src/client/replaystage.ts';
import { advanceHead, clipLongEnough, easeToward, framing, KILLCAM, killcamOver, killcamSpeed, replayDuration } from '../src/client/killcam.ts';

const player = (id: number, over: Partial<PlayerView> = {}): PlayerView => ({
  id, name: `p${id}`, x: 100 * id, y: 0, angle: 0, hp: 100, maxHp: 100, color: 'red', gun: 'pistol',
  team: null, alive: true, hidden: false, shield: false, dashing: false, score: 0, level: 0, armorTier: 'none', hunted: false, kind: 'bot', ...over,
});

const snap = (tick: number, events: GameEvent[] = [], over: Partial<Snapshot> = {}, me: Partial<PlayerView> = {}): Snapshot => ({
  t: 'snap', tick, ackSeq: 0,
  self: { id: 1, ammo: 12, mag: 12, speed: 300, reloading: false, reloadFrac: 0, perks: {}, pending: null, ability: null, abilityReadyIn: 0, alive: true, dash: null, respawnIn: 0, kills: 0, deaths: 0, viewRadius: 900, suppression: 0, streak: 0, nemesis: null },
  players: [player(1, { x: tick, ...me }), player(2)], bullets: [], crates: [], thrown: [], zones: [], minimap: [], leaderboard: [],
  match: { mode: 'FFA', map: 'Boneyard', nextMap: 'Old Town', mapChangeIn: 0, teamScore: { red: 0, blue: 0 }, winner: null, restartIn: 0, roundEndsAt: null },
  events, ...over,
} as Snapshot);

const killBy = (killerId: number | null, victimId: number): GameEvent =>
  ({ e: 'kill', killer: 'K', victim: 'V', killerId, victimId, weapon: 'Pistol', bounty: false, assisters: [], ended: 0, revenge: false });
const medal = (id: number, m: 'quadKill' | 'longShot' | 'massacre' | 'clutch'): GameEvent => ({ e: 'medal', id, medal: m });

// --- the ring buffer ---------------------------------------------------------------------------------------------

test('the replay ring forgets frames older than its window, keeping the newest', () => {
  const buf = createReplayBuffer(1000, 1e9);
  for (let t = 0; t < 300; t++) recordFrame(buf, snap(t));
  const span = serverMs(buf.frames.at(-1)!) - serverMs(buf.frames[0]!);
  assert.ok(span <= 1000 + TICK_MS && span >= 1000 - TICK_MS, `span ${span}`);
  assert.equal(buf.frames.at(-1)!.tick, 299);
});

test('the replay ring is capped by weight even inside its window', () => {
  const crowd = (t: number) => snap(t, [], { zombies: Array.from({ length: 200 }, (_, i) => [i, 0, 0, 0, 10] as [number, number, number, number, number]) });
  const buf = createReplayBuffer(60_000, 5000);
  for (let t = 0; t < 400; t++) recordFrame(buf, crowd(t));
  assert.ok(buf.weight <= 5000 + snapWeight(crowd(0)), `weight ${buf.weight}`);
  assert.ok(buf.frames.length < 20 && buf.frames.length >= 1);
  assert.equal(buf.weight, buf.frames.reduce((n, f) => n + snapWeight(f), 0), 'the running weight matches the frames kept');
});

test('the ring ignores repeats and starts over when the tick count restarts', () => {
  const buf = createReplayBuffer();
  recordFrame(buf, snap(10)); recordFrame(buf, snap(10)); recordFrame(buf, snap(9));
  assert.equal(buf.frames.length, 1);
  recordFrame(buf, snap(11)); recordFrame(buf, snap(2));
  assert.deepEqual(buf.frames.map((f) => f.tick), [2]);
});

test('a clip has one frame of margin each side, and a frame samples with its own self', () => {
  const buf = createReplayBuffer();
  for (let t = 0; t < 120; t++) recordFrame(buf, snap(t));
  const clip = clipOf(buf, 30 * TICK_MS, 60 * TICK_MS);
  assert.equal(clip[0]!.tick, 29);
  assert.equal(clip.at(-1)!.tick, 60);
  const mid = frameAt(clip, 45.5 * TICK_MS)!;
  const me = mid.players.find((p) => p.id === 1)!;
  assert.ok(me.x > 45 && me.x < 46, `interpolated ${me.x}`);
  assert.deepEqual(clipOf(buf, 9999 * TICK_MS, 10000 * TICK_MS), []);
});

// --- highlight scoring -------------------------------------------------------------------------------------------

test('kills and medals within the window make one moment, scored by medal, kills and chain', () => {
  let c = foldEvents(null, snap(100, [killBy(1, 2)]));
  assert.equal(clusterScore(c!), HIGHLIGHT.killScore);
  c = foldEvents(c, snap(100 + 60, [killBy(1, 3), medal(1, 'longShot')]));
  assert.equal(c!.kills, 2);
  assert.equal(clusterScore(c!), 75 + 2 * HIGHLIGHT.killScore + HIGHLIGHT.chainScore);
  const later = foldEvents(c, snap(100 + 60 + 150, [killBy(1, 4)]));
  assert.equal(later!.kills, 1, 'past the window it is a fresh moment');
});

test('other players kills and medals are not yours; a kill on low health scores extra', () => {
  assert.equal(foldEvents(null, snap(1, [killBy(2, 3), medal(2, 'quadKill'), killBy(1, 1)])), null);
  const low = foldEvents(null, snap(1, [killBy(1, 2)], {}, { hp: 20 }));
  assert.equal(clusterScore(low!), HIGHLIGHT.killScore + HIGHLIGHT.lowHpScore);
});

test('the best moment keeps its clip, a smaller one later does not replace it', () => {
  const buf = createReplayBuffer();
  const st = { h: NO_HIGHLIGHT };
  const best = () => st.h.best;
  const feed = (tick: number, events: GameEvent[] = []) => { const s = snap(tick, events); recordFrame(buf, s); st.h = observeHighlight(st.h, s, buf); };
  for (let t = 0; t < 100; t++) feed(t);
  feed(100, [killBy(1, 2), medal(1, 'massacre')]);
  assert.equal(best(), null, 'waits for the tail to be recorded');
  for (let t = 101; t < 140; t++) feed(t);
  assert.ok(best() && best()!.score >= 400, 'massacre moment kept');
  assert.ok(best()!.clip.length > 30 && best()!.clip.length <= 200);
  const kept = best()!;
  for (let t = 140; t < 400; t++) feed(t, t === 300 ? [killBy(1, 2)] : []);
  assert.equal(best(), kept, 'a lone kill scores less than a massacre');
  assert.deepEqual(stampsAt(kept, kept.from).length, 0);
  assert.equal(stampsAt(kept, kept.to).length, 1);
});

test('the round ending extracts a pending moment without waiting for its tail', () => {
  const buf = createReplayBuffer();
  let h = NO_HIGHLIGHT;
  for (let t = 0; t < 60; t++) { const s = snap(t, t === 59 ? [killBy(1, 2), medal(1, 'quadKill')] : []); recordFrame(buf, s); h = observeHighlight(h, s, buf, t === 59); }
  assert.ok(h.best);
  assert.equal(h.want, null);
});

// --- time dilation -----------------------------------------------------------------------------------------------

test('the speed curve ramps down, holds, ramps up, and builds a lag that fits the buffer', () => {
  assert.equal(speedAt(-10), 1);
  assert.equal(speedAt(SLOWMO.rampInMs), SLOWMO.rate);
  assert.equal(speedAt(SLOWMO.durationMs / 2), SLOWMO.rate);
  assert.ok(speedAt(SLOWMO.rampInMs / 2) < 1 && speedAt(SLOWMO.rampInMs / 2) > SLOWMO.rate);
  assert.equal(speedAt(SLOWMO.durationMs), 1);
  assert.ok(SLOWMO.durationMs <= 1200, 'a celebration lasts at most 1.2 s');
  assert.ok(totalLag() <= SLOWMO.maxLagMs, `lag ${totalLag()}`);
  assert.ok(totalLag() > 500, 'it is a real slowdown');
});

test('the warp starts when the drawn time reaches the trigger, then slows, catches up and ends at lag 0', () => {
  let w = requestSlowmo(IDLE_WARP, 0, 5000, { x: 1, y: 2 }, true);
  assert.ok(w.pending);
  w = stepWarp(w, 16, 16, 1000);
  assert.equal(w.startedAt, null, 'not yet: the drawn time is far before the kill');
  let now = 16, base = 4900, maxLag = 0;
  for (let i = 0; i < 400; i++) { now += 16; base += 16; w = stepWarp(w, now, 16, base); maxLag = Math.max(maxLag, w.lag); }
  assert.ok(maxLag > 400 && maxLag <= SLOWMO.maxLagMs, `max lag ${maxLag}`);
  assert.equal(w.lag, 0);
  assert.equal(w.startedAt, null);
  assert.equal(w.focus, null);
});

test('a second request waits out the cooldown unless forced, and none stacks on a running warp', () => {
  let w = requestSlowmo(IDLE_WARP, 100, 0, null);
  w = stepWarp(w, 100, 16, 100);
  assert.notEqual(w.startedAt, null);
  assert.equal(requestSlowmo(w, 200, 0, null, true), w, 'not while running');
  const done = { ...w, startedAt: null, lag: 0 };
  assert.equal(requestSlowmo(done, 100 + SLOWMO.cooldownMs - 1, 0, null), done, 'inside the cooldown');
  assert.ok(requestSlowmo(done, 100 + SLOWMO.cooldownMs - 1, 0, null, true).pending, 'the last kill of a round ignores it');
  assert.ok(requestSlowmo(done, 100 + SLOWMO.cooldownMs, 0, null).pending);
});

test('the cinematic look eases in and out and the view narrows toward the kill', () => {
  assert.equal(intensityAt(null), 0);
  assert.equal(intensityAt(0), 0);
  assert.equal(intensityAt(SLOWMO.durationMs / 2), 1);
  assert.equal(intensityAt(SLOWMO.durationMs), 0);
  const v = dilatedView({ x: 0, y: 0 }, { x: 100, y: 0 }, 900, 1, false);
  assert.ok(v.radius < 900 && v.center.x > 0 && v.center.x < 100);
  assert.deepEqual(dilatedView({ x: 0, y: 0 }, { x: 100, y: 0 }, 900, 1, true), { center: { x: 0, y: 0 }, radius: 900 }, 'reduced motion keeps the view');
  assert.deepEqual(dilatedView({ x: 5, y: 5 }, null, 900, 0, false), { center: { x: 5, y: 5 }, radius: 900 });
});

test('the slow-motion triggers on the round-ending kill and on a big medal, not on a small one or in zombies', () => {
  const before = snap(10);
  const fin = snap(11, [killBy(2, 3)], { match: { ...before.match, winner: { name: 'p2', note: null } } as Snapshot['match'] });
  assert.equal(slowmoTrigger(before, fin)?.why, 'final');
  assert.equal(slowmoTrigger(fin, snap(12, [killBy(2, 3)], { match: fin.match })), null, 'the winner was already set');
  assert.equal(slowmoTrigger(before, snap(11, [killBy(1, 2), medal(1, 'massacre')]))?.why, 'medal');
  assert.equal(slowmoTrigger(before, snap(11, [killBy(1, 2), medal(1, 'longShot')])), null);
  assert.equal(slowmoTrigger(before, snap(11, [medal(2, 'massacre')])), null, "someone else's medal");
  assert.equal(slowmoTrigger(before, snap(11, [medal(1, 'quadKill')], { run: {} as Snapshot['run'] })), null);
});

// --- killcam -----------------------------------------------------------------------------------------------------

test('the killcam plays at speed, eases to a slow-motion kill, and ends a beat after it', () => {
  const death = 10_000;
  assert.equal(killcamSpeed(death - KILLCAM.leadMs, death), 1);
  assert.equal(killcamSpeed(death - KILLCAM.slowFromMs - 1, death), 1);
  assert.equal(killcamSpeed(death, death), KILLCAM.slowRate);
  assert.ok(killcamSpeed(death - KILLCAM.slowFromMs + 60, death) < 1);
  assert.equal(killcamOver(death + KILLCAM.tailMs - 1, death), false);
  assert.equal(killcamOver(death + KILLCAM.tailMs, death), true);
  const real = replayDuration(death - KILLCAM.leadMs, death);
  assert.ok(real > 3000 && real < 4500, `real duration ${real}`);
  assert.equal(advanceHead(0, 5000, death), 100, 'a stalled frame cannot jump the playhead');
  assert.equal(clipLongEnough(death - 500, death), false);
  assert.equal(clipLongEnough(death - 2000, death), true);
});

test('the killcam frames you and your killer both, and the camera eases', () => {
  const f = framing({ x: 0, y: 0 }, { x: 600, y: 0 }, 900, 16 / 9);
  assert.deepEqual(f.center, { x: 300, y: 0 });
  assert.ok(f.radius >= 300 + KILLCAM.margin);
  const alone = framing({ x: 5, y: 5 }, null, 900, 16 / 9);
  assert.deepEqual(alone.center, { x: 5, y: 5 });
  const tall = framing({ x: 0, y: 0 }, { x: 0, y: 700 }, 900, 16 / 9);
  assert.ok(tall.radius <= 900 * KILLCAM.maxRadius, 'the view never claims more than the server sends');
  assert.ok(easeToward(0, 100, 16) > 0 && easeToward(0, 100, 16) < 100);
  assert.ok(easeToward(0, 100, 5000) > 30, 'a long frame is clamped, not skipped');
});

// --- a replay's layers follow the replayed frame, not the live game ---------------------------------------------------

test('a replayed frame pins the server clock and the roofs/listener spot to that frame, not to the live game', () => {
  const frame = snap(100, [], {}, { x: 777, y: 42 });
  const at = replayView(frame, 5000, 1, { x: 1, y: 2 });
  assert.equal(at.clockOffset + 5000, serverMs(frame), 'serverNow(now) is the frame\'s own time');
  assert.deepEqual(at.self, { x: 777, y: 42 }, 'roofs thin out around where you were in the replay');
  assert.deepEqual(replayView(snap(100, [], { players: [player(2)] }), 5000, 1, { x: 1, y: 2 }).self, { x: 1, y: 2 }, 'no body in the frame keeps the last known spot');
});

test('every early return that skips the live draw still hands its frame to the shader pass', () => {
  // The lit world is composed in the shader canvas and the 2D canvas is cleared for it (lightfeed.lightWorld). A killcam frame
  // that returned before processFrame left that canvas showing the last LIVE frame: the live camera's floor behind the replay.
  const src = readFileSync(new URL('../src/client/main.ts', import.meta.url), 'utf8');
  const from = src.indexOf('delight.drawKillcam(');
  assert.ok(from > 0);
  const branch = src.slice(from, src.indexOf('return;', from));
  assert.match(branch, /processFrame\(/, 'the killcam branch runs the shader pass on its own frame');
});
