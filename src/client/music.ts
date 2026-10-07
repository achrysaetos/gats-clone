/**
 * The adaptive soundtrack: a toy-military march built bar by bar from a seeded chord progression, in layers that swell with the fight.
 * `musicStart` runs from a user gesture, `musicUpdate` once a frame; `onBeat` and `getBeat` give the visuals a clock.
 */
import { newestSnap } from './interp.ts';
import { createRig, type Rig } from './musicsynth.ts';
import { NO_TRACKER, observe, type MusicCue, type MusicTracker } from './musicstate.ts';
import {
  approach, beatAt, chordAt, fadeTau, generateBar, hash, heartTier, IDLE_INPUT, keyOfSeed, LAYER_IDS, layerTargets, levelGain, modeOf, STEPS_PER_BAR, tempoFor,
  type BarClock, type LayerId, type Mode, type MusicInput,
} from './musictheory.ts';
import type { ClientState } from './state.ts';

const SOUND_MUTE_KEY = 'skirmish.muted';
const MUSIC_MUTE_KEY = 'skirmish.music.muted';
const MUSIC_VOL_KEY = 'skirmish.music.volume';
/** The music bus sits well under the sound effects. */
const BUS_GAIN = 0.32;
const LOOKAHEAD_S = 0.3;
const TICK_MS = 30;
const IDLE_BPM = 128;
const DEAD_CUTOFF_HZ = 650;
const ZKILL_GAP_S = 0.35;

export type BeatInfo = { beat: number; phase: number; bar: number; beatInBar: number; step: number; bpm: number; audible: boolean };
export type BeatEvent = { beat: number; bar: number; beatInBar: number; downbeat: boolean; time: number };

const store = {
  get: (k: string) => { try { return localStorage.getItem(k); } catch { return null; } },
  set: (k: string, v: string) => { try { localStorage.setItem(k, v); } catch { /* the setting lasts this tab only */ } },
};

let rig: Rig | null = null;
let ctx: AudioContext | null = null;
let timer: ReturnType<typeof setInterval> | undefined;
let seed = hash(Date.now() & 0xffffff, 17);
let barNo = 0;
let nextBarT = 0;
let bars: BarClock[] = [];
let barModes = new Map<number, Mode>();
let input: MusicInput = IDLE_INPUT;
let tracker: MusicTracker = NO_TRACKER;
let phase: MusicInput['phase'] = 'menu';
let wasEnded = false;
const levels: Record<LayerId, number> = { calm: 0, combat: 0, hype: 0, finale: 0, heart: 0 };
let cadenceUntil = 0;
let lastUpdate = 0;
let lastZkillAt = -Infinity;
let firedBeat = -1;
let sfxMuted = store.get(SOUND_MUTE_KEY) === '1';
let musicMuted = store.get(MUSIC_MUTE_KEY) === '1';
let volume = Math.min(1, Math.max(0, Number(store.get(MUSIC_VOL_KEY) ?? 1) || 0)) || (store.get(MUSIC_VOL_KEY) === '0' ? 0 : 1);
const listeners = new Set<(e: BeatEvent) => void>();

const audible = () => !sfxMuted && !musicMuted && volume > 0;

function applyVolume() {
  if (rig && ctx) rig.volume.gain.setTargetAtTime(audible() ? BUS_GAIN * volume : 0, ctx.currentTime, 0.05);
}

/** Starts the score on the page's audio graph. Call from a user gesture; later calls do nothing. `out` is the master bus music joins. */
export function musicStart(audioCtx: AudioContext, out: AudioNode) {
  if (rig) { void ctx?.resume(); return; }
  ctx = audioCtx;
  rig = createRig(ctx, out);
  applyVolume();
  nextBarT = ctx.currentTime + 0.12;
  timer = setInterval(tick, TICK_MS);
  tick();
}

/** Writes a different march: a new key, progressions and tunes. Takes effect from the next bar. */
export function musicSeed(n: number) { seed = hash(n, 17); }

function activeLayers(): Record<LayerId, boolean> {
  const t = cadenceUntil > (ctx?.currentTime ?? 0) ? null : layerTargets(input);
  const on = {} as Record<LayerId, boolean>;
  for (const id of LAYER_IDS) on[id] = !!t && (levels[id] > 0.02 || t[id] > 0.02);
  return on;
}

function tick() {
  if (!ctx || !rig) return;
  const now = ctx.currentTime;
  while (nextBarT < now + LOOKAHEAD_S) {
    const mode = modeOf(input);
    const spb = 60 / tempoFor(input);
    const bar = generateBar(seed, mode, barNo);
    const on = activeLayers();
    if (audible()) rig.playBar({ ...bar, events: bar.events.filter((e) => on[e.layer]) }, nextBarT, spb, heartTier(input.horde));
    bars.push({ t0: nextBarT, spb, barNo });
    barModes.set(barNo, mode);
    barNo++;
    nextBarT += spb * 4;
  }
  if (bars.length > 12) { for (const b of bars.slice(0, -12)) barModes.delete(b.barNo); bars = bars.slice(-12); }
  const at = beatAt(bars, now - (ctx.outputLatency || ctx.baseLatency || 0));
  if (at) {
    const whole = Math.floor(at.beat);
    if (firedBeat < 0) firedBeat = whole - 1;
    if (whole > firedBeat) {
      firedBeat = whole;
      const e: BeatEvent = { beat: whole, bar: at.bar, beatInBar: at.beatInBar, downbeat: at.beatInBar === 0, time: performance.now() };
      for (const fn of listeners) fn(e);
    }
  }
}

/** Subscribe to every beat as it is heard. Returns the unsubscribe. */
export function onBeat(fn: (e: BeatEvent) => void): () => void {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}

/** The beat clock: audio-timed once the score is playing, a free-running 128 bpm before then so visuals still pulse in the menu. */
export function getBeat(): BeatInfo {
  if (ctx && rig) {
    const at = beatAt(bars, ctx.currentTime - (ctx.outputLatency || ctx.baseLatency || 0));
    if (at) return { ...at, bpm: 60 / (bars.at(-1)?.spb ?? 60 / IDLE_BPM), audible: audible() };
  }
  const beat = (performance.now() / 1000) * (IDLE_BPM / 60);
  return { beat, phase: beat % 1, bar: Math.floor(beat / 4), beatInBar: Math.floor(beat % 4), step: Math.floor((beat % 4) * 4), bpm: IDLE_BPM, audible: false };
}
/** 0 on the beat, rising to 1 just before the next. */
export const beatPhase = () => getBeat().phase;
/** 1 on the beat, decaying to 0, a ready-made pulse for HUD juice. */
export const beatPulse = (decay = 3) => (1 - getBeat().phase) ** decay;

function duck(depth: number, holdS: number, recoverS = 0.25) {
  if (!ctx || !rig) return;
  const t = ctx.currentTime;
  rig.duck.gain.cancelScheduledValues(t);
  rig.duck.gain.setTargetAtTime(depth, t, 0.012);
  rig.duck.gain.setTargetAtTime(1, t + holdS, recoverS);
}

/** Whether a win or loss cadence is sounding, so a celebration can stay under it. */
export const cadencePlaying = () => !!ctx && cadenceUntil > ctx.currentTime;

/** Ducks the score under a big sound effect: the page calls it for every cue on sfx.ts's DUCKS list. */
export const musicDuck = (depth = 0.5, holdMs = 250) => duck(depth, holdMs / 1000);

function barClockAt(t: number): BarClock | undefined {
  let cur: BarClock | undefined;
  for (const b of bars) if (b.t0 <= t) cur = b;
  return cur;
}

function chordFor(t: number) {
  const at = beatAt(bars, t);
  const n = at?.bar ?? Math.max(0, barNo - 1);
  return chordAt(seed, barModes.get(n) ?? modeOf(input), n).chord;
}

function onCue(cue: MusicCue) {
  if (!ctx || !rig || !audible()) return;
  const now = ctx.currentTime;
  switch (cue.kind) {
    case 'kill': {
      // Land the sting on the next sixteenth so it rides the groove.
      const cur = barClockAt(now);
      const sixteenth = cur ? (cur.spb * 4) / STEPS_PER_BAR : 0.12;
      const t = cur ? now + sixteenth - ((now - cur.t0) % sixteenth) : now + 0.02;
      rig.playSting(chordFor(t), barModes.get(cur?.barNo ?? -1) ?? modeOf(input), cue.streak, t, cue.bounty);
      break;
    }
    case 'zkill':
      if (now - lastZkillAt > ZKILL_GAP_S) { lastZkillAt = now; rig.playSting(chordFor(now), modeOf(input), 1, now + 0.02); }
      break;
    // Ducking for kills, booms and the other big moments is the page's: it follows the sound effects' own list (sfx.ts DUCKS) through `musicDuck`.
    case 'win': case 'loss': {
      const dur = rig.playCadence(cue.kind, keyOfSeed(seed), now + 0.12);
      cadenceUntil = now + 0.12 + dur;
      break;
    }
  }
}

/** Call once a frame with the client state; `firing` is whether the trigger is held. Reads the newest snapshot, so it needs no other hook. */
export function musicUpdate(state: ClientState, now: number, firing = false) {
  const snap = state.phase === 'menu' ? null : newestSnap(state.s.snaps);
  const next: MusicInput['phase'] = state.phase === 'menu' ? 'menu' : state.phase === 'dead' ? 'dead' : 'play';
  if (phase === 'menu' && next !== 'menu') musicSeed(Date.now());
  phase = next;
  const seen = observe(tracker, snap, phase, now, firing);
  tracker = seen.tracker;
  input = tracker.input;
  if (wasEnded && !tracker.ended) musicSeed(Date.now());
  wasEnded = tracker.ended;
  for (const cue of seen.cues) onCue(cue);
  if (!ctx || !rig) return;
  const dt = lastUpdate ? Math.min(0.25, (now - lastUpdate) / 1000) : 0;
  lastUpdate = now;
  const cadence = cadenceUntil > ctx.currentTime;
  const target = layerTargets(input);
  for (const id of LAYER_IDS) {
    const goal = cadence ? 0 : target[id];
    levels[id] = approach(levels[id], goal, dt, cadence ? 0.12 : fadeTau(levels[id], goal));
    rig.layers[id].gain.setTargetAtTime(levelGain(levels[id]), ctx.currentTime, 0.03);
  }
  rig.tone.frequency.setTargetAtTime(phase === 'dead' ? DEAD_CUTOFF_HZ : 18000, ctx.currentTime, 0.25);
}

// ---- mix controls ----

/** Follows the sound effects' mute (M): music is silent whenever sound is. */
export function setSoundMuted(muted: boolean) { sfxMuted = muted; applyVolume(); }
export const isMusicMuted = () => musicMuted;
/** The music's own toggle (Shift+M). Returns whether it is now muted. */
export function toggleMusicMuted(): boolean {
  musicMuted = !musicMuted;
  store.set(MUSIC_MUTE_KEY, musicMuted ? '1' : '0');
  applyVolume();
  return musicMuted;
}
/** Music volume 0..1, kept under the effects by the bus gain. */
export function setMusicVolume(v: number) {
  volume = Math.min(1, Math.max(0, v));
  store.set(MUSIC_VOL_KEY, String(volume));
  applyVolume();
}
export const getMusicVolume = () => volume;
