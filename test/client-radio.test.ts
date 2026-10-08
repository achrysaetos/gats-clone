/// <reference types="node" />
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { FIXED_RADIO, hiddenRadios, RADIO_REACH } from '../src/shared/radio.ts';
import type { ClientMsg, Snapshot } from '../src/shared/protocol.ts';
import { getPersonalStation, getRoomStation, getStation, setPersonalStation, setRoomStation } from '../src/client/music.ts';
import { __test, onRoomRadio, radioDebug, radioFinds, radioPress, radioUpdate, stationLabel } from '../src/client/radio.ts';
import { drawRadio, drawRadioPrompt } from '../src/client/radioart.ts';

function snapAt(o: { mode: 'FFA' | 'TDM' | 'DOM' | 'ZOM' | 'RNG' | 'BR'; x: number; y: number; round?: number | null; bullets?: { x: number; y: number }[] }): Snapshot {
  const me = { id: 1, x: o.x, y: o.y, alive: true, team: null };
  return {
    t: 'snap', tick: 1, self: { id: 1 }, players: [me], bullets: (o.bullets ?? []).map((b, i) => ({ id: i, ...b, vx: 0, vy: 0, owner: 2, gun: null })),
    match: { mode: o.mode, map: 'm', roundEndsAt: o.round === undefined ? 1000 : o.round },
  } as unknown as Snapshot;
}
const stateOf = (snap: Snapshot, mapId: string) => ({ phase: 'playing', s: { snaps: { snaps: [snap], serverClockOffset: null }, mapId, rounds: [] } }) as never;
const reset = () => { __test.reset(); setRoomStation(null); setPersonalStation(null); };

test('a hidden radio appears only for the round it belongs to, and walking up to it shows the prompt', () => {
  reset();
  const sent: ClientMsg[] = [];
  const spots = hiddenRadios('museum', 4242);
  radioUpdate(stateOf(snapAt({ mode: 'FFA', x: 10, y: 10, round: 4242 }), 'museum'), 0, (m) => sent.push(m));
  assert.deepEqual(radioDebug().placed.map(({ x, y }) => ({ x, y })), spots);
  assert.ok(radioDebug().placed.every((r) => r.hidden));
  assert.equal(radioDebug().near, null);
  radioUpdate(stateOf(snapAt({ mode: 'FFA', x: spots[0]!.x + RADIO_REACH - 5, y: spots[0]!.y, round: 4242 }), 'museum'), 16, (m) => sent.push(m));
  assert.deepEqual(radioDebug().near, spots[0]);
  radioUpdate(stateOf(snapAt({ mode: 'FFA', x: spots[0]!.x + RADIO_REACH + 30, y: spots[0]!.y, round: 4242 }), 'museum'), 32, (m) => sent.push(m));
  assert.equal(radioDebug().near, null);
  assert.deepEqual(sent, [], 'a hidden radio never talks to the server');
  // A new round moves them.
  radioUpdate(stateOf(snapAt({ mode: 'FFA', x: 10, y: 10, round: 9999 }), 'museum'), 48, () => {});
  assert.deepEqual(radioDebug().placed.map(({ x, y }) => ({ x, y })), hiddenRadios('museum', 9999));
  assert.notDeepEqual(radioDebug().placed.map(({ x, y }) => ({ x, y })), spots);
});

test('E at a hidden radio cycles your own music through the map default and Off, and ends with the round', () => {
  reset();
  const spot = hiddenRadios('plaza', 77)[0]!;
  const state = stateOf(snapAt({ mode: 'TDM', x: spot.x + 20, y: spot.y, round: 77 }), 'plaza');
  const sent: ClientMsg[] = [];
  radioUpdate(state, 0, (m) => sent.push(m));
  assert.equal(radioPress(state, 100, (m) => sent.push(m)), true);
  assert.equal(getPersonalStation(), 'march', 'the first press steps off the map default');
  assert.equal(getStation(), 'march');
  assert.equal(radioFinds(), 1);
  assert.equal(radioPress(state, 700, () => {}), true);
  assert.equal(getPersonalStation(), 'oldtown');
  assert.equal(radioFinds(), 1, 'one radio counts once');
  for (let i = 0; i < 20; i++) radioPress(state, 1000 + i * 400, () => {});
  assert.ok(['march', 'oldtown', 'quarry', 'harbor', 'market', 'museum', 'subpen', 'park', 'railyard', 'summit', 'embassy', 'airbase', 'wasteland', 'range', 'outpost', 'off', null].includes(getPersonalStation()));
  assert.deepEqual(sent, [], 'no message for a personal radio');
  // Nowhere near a radio: E is not ours.
  radioUpdate(stateOf(snapAt({ mode: 'TDM', x: 5, y: 5, round: 77 }), 'plaza'), 20_000, () => {});
  assert.equal(radioPress(state, 20_100, () => {}), false);
  // The round ends: your tuning goes with it.
  setPersonalStation('park');
  radioUpdate(stateOf(snapAt({ mode: 'TDM', x: 5, y: 5, round: 78 }), 'plaza'), 21_000, () => {});
  assert.equal(getPersonalStation(), null);
});

test('the fixed radio turns at once and tells the server, and the squad\'s station is the one the server says', () => {
  reset();
  const at = FIXED_RADIO.outpost!;
  const state = stateOf(snapAt({ mode: 'ZOM', x: at.x + 30, y: at.y, round: null }), 'outpost');
  const sent: ClientMsg[] = [];
  radioUpdate(state, 0, (m) => sent.push(m));
  assert.deepEqual(radioDebug().placed.map(({ x, y, hidden }) => ({ x, y, hidden })), [{ ...at, hidden: false }]);
  assert.equal(radioPress(state, 50, (m) => sent.push(m)), true);
  assert.deepEqual(sent, [{ t: 'radio', station: 'march' }], 'untuned, the dial starts at the first station');
  assert.equal(getRoomStation(), 'march', 'like a real radio, the station changes as you press, before the server answers');
  assert.equal(radioPress(state, 200, (m) => sent.push(m)), true);
  assert.equal(sent.length, 1, 'a press faster than the server takes them is ignored, so you never drift from the squad');
  onRoomRadio('march', 100);
  assert.equal(getRoomStation(), 'march');
  onRoomRadio('wasteland', 600);
  assert.equal(getStation(), 'wasteland');
  assert.equal(stationLabel('wasteland'), 'Dust and Wire');
  assert.equal(stationLabel('off'), 'Off');
  sent.length = 0;
  radioPress(state, 700, (m) => sent.push(m));
  assert.deepEqual(sent, [{ t: 'radio', station: 'range' }], 'the dial goes on to the next station after wasteland');
});

test('a round through a radio makes it sputter, and the range radio stands where the range says', () => {
  reset();
  const at = FIXED_RADIO.range!;
  const state = stateOf(snapAt({ mode: 'RNG', x: at.x + 200, y: at.y, round: null, bullets: [{ x: at.x + 3, y: at.y - 2 }] }), 'range');
  radioUpdate(state, 5000, () => {});
  assert.ok(radioDebug().placed[0]!.sputtering > 5000);
  radioUpdate(stateOf(snapAt({ mode: 'RNG', x: at.x + 200, y: at.y, round: null }), 'range'), 9000, () => {});
  assert.ok(radioDebug().placed[0]!.sputtering < 9000, 'it settles again');
});

test('the radio and its prompt draw without error in every state', () => {
  const calls: string[] = [];
  const g: Record<string, unknown> = new Proxy({}, { get: (_t, k) => { if (k === 'measureText') return () => ({ width: 80 }); if (k === 'createRadialGradient') return () => ({ addColorStop() {} }); return (..._a: unknown[]) => { calls.push(String(k)); }; }, set: () => true });
  const ctx = g as unknown as CanvasRenderingContext2D;
  for (const o of [{ off: false, sputter: 0, near: true }, { off: true, sputter: 0, near: false }, { off: false, sputter: 0.8, near: false }]) {
    drawRadio(ctx, { x: 10, y: 10, scale: 1.5, now: 1234, pulse: 0.6, dark: 0.5, needle: 0.4, quiet: false, reduced: false, ...o });
    drawRadio(ctx, { x: 10, y: 10, scale: 1.1, now: 99, pulse: 0, dark: 0, needle: 1, quiet: true, reduced: true, ...o });
  }
  drawRadioPrompt(ctx, 0, 0, 100, 'Radio · Toy March', 'E', false, 1.45);
  drawRadioPrompt(ctx, 0, 0, 100, 'Radio · Off', 'TAP', true);
  assert.ok(calls.length > 100);
});
