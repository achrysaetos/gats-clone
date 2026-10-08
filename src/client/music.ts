/**
 * The adaptive soundtrack: a toy-military march built bar by bar from a seeded chord progression, in layers that swell with the fight.
 * `musicStart` runs from a user gesture, `musicUpdate` once a frame; `onBeat` and `getBeat` give the visuals a clock.
 */
import { newestSnap } from './interp.ts';
import { createRig, type Deck, type Rig } from './musicsynth.ts';
import { pickTrack, trackIdFor, TRACKS, type TrackDef, type TrackId } from './musictracks.ts';
import type { StationId } from '../shared/radio.ts';
import { NO_TRACKER, observe, type MusicCue, type MusicTracker } from './musicstate.ts';
import {
  approach, beatAt, crossfade, fadeTau, hash, heartTier, IDLE_INPUT, LAYER_IDS, layerTargets, levelGain, modeOf, STEPS_PER_BAR,
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
/** A map change crossfades the old track out and the new one in over this long. */
export const XFADE_S = 3.5;

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
const barLocal = new Map<number, { local: number; track: TrackId }>();
/** What the playing deck is: its track, its first global bar, the layers audible when it was last replaced. */
type Playing = { track: TrackDef; deck: Deck; startBar: number };
let current: Playing | null = null;
/** The deck fading out, still being fed its own bars until `endT`. */
let leaving: (Playing & { local: number; nextT: number; endT: number; mode: Mode; on: Record<LayerId, boolean> }) | null = null;
/** The track the map (or the radio) asks for. */
let wantTrack: TrackId = 'march';
/** The room's radio (Zombies, range) and the player's own tuning (a hidden radio): a track id, 'off', or null for the map's own track. A personal choice wins. */
let roomStation: StationId | null = null;
let personalStation: StationId | null = null;
const effectiveStation = (): StationId | null => personalStation ?? roomStation;
let mapTrack: TrackId = 'march';
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

const audibleBase = () => !sfxMuted && !musicMuted && volume > 0;
const audible = () => audibleBase() && effectiveStation() !== 'off';

function applyVolume() {
  if (rig && ctx) {
    rig.volume.gain.setTargetAtTime(audible() ? BUS_GAIN * volume : 0, ctx.currentTime, 0.05);
    rig.fx.gain.setTargetAtTime(audibleBase() ? volume : 0, ctx.currentTime, 0.05);
  }
}

/** Starts the score on the page's audio graph. Call from a user gesture; later calls do nothing. `out` is the master bus music joins. */
export function musicStart(audioCtx: AudioContext, out: AudioNode) {
  if (rig) { void ctx?.resume(); return; }
  ctx = audioCtx;
  rig = createRig(ctx, out);
  applyVolume();
  current = { track: TRACKS[wantTrack], deck: rig.newDeck(TRACKS[wantTrack].trim), startBar: barNo };
  nextBarT = ctx.currentTime + 0.12;
  timer = setInterval(tick, TICK_MS);
  (timer as { unref?: () => void }).unref?.();
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

/** Begins the next track at `t`: the old deck keeps playing its own bars for the crossfade while the new one fades in. */
function switchTrack(t: number, id: TrackId) {
  if (!rig || !ctx || !current) return;
  const old = current;
  const oldLocal = barNo - old.startBar;
  const on = activeLayers();
  const x = Math.max(0.5, XFADE_S);
  const curveOut = Float32Array.from({ length: 32 }, (_, i) => crossfade(i / 31).a);
  const curveIn = Float32Array.from({ length: 32 }, (_, i) => crossfade(i / 31).b);
  old.deck.fade.gain.cancelScheduledValues(t);
  old.deck.fade.gain.setValueAtTime(1, t);
  old.deck.fade.gain.setValueCurveAtTime(curveOut, t, x);
  const track = TRACKS[id];
  const deck = rig.newDeck(track.trim);
  for (const l of LAYER_IDS) deck.layers[l].gain.value = levelGain(levels[l]);
  deck.fade.gain.setValueAtTime(0, ctx.currentTime);
  deck.fade.gain.setValueCurveAtTime(curveIn, t, x);
  current = { track, deck, startBar: barNo };
  leaving = { ...old, local: oldLocal, nextT: t, endT: t + x, mode: barModes.get(barNo - 1) ?? 'major', on };
  const dead = old.deck;
  setTimeout(() => { if (rig) rig.disposeDeck(dead); }, (t - ctx.currentTime + x + 2.5) * 1000);
}

function tick() {
  if (!ctx || !rig || !current) return;
  const now = ctx.currentTime;
  while (nextBarT < now + LOOKAHEAD_S) {
    if (wantTrack !== current.track.id) switchTrack(nextBarT, wantTrack);
    const mode = modeOf(input);
    const spb = 60 / current.track.bpm(input);
    const local = barNo - current.startBar;
    const bar = current.track.bar(seed, mode, local);
    const on = activeLayers();
    if (audible()) rig.playBar({ ...bar, events: bar.events.filter((e) => on[e.layer]) }, nextBarT, spb, heartTier(input.horde), current.deck);
    bars.push({ t0: nextBarT, spb, barNo });
    barModes.set(barNo, mode);
    barLocal.set(barNo, { local, track: current.track.id });
    barNo++;
    nextBarT += spb * 4;
  }
  // The track fading out keeps playing its bars until the crossfade is over.
  while (leaving && leaving.nextT < Math.min(leaving.endT, now + LOOKAHEAD_S)) {
    const spb = 60 / leaving.track.bpm(input);
    const bar = leaving.track.bar(seed, leaving.mode, leaving.local);
    if (audible()) rig.playBar({ ...bar, events: bar.events.filter((e) => leaving!.on[e.layer]) }, leaving.nextT, spb, heartTier(input.horde), leaving.deck);
    leaving.local++;
    leaving.nextT += spb * 4;
  }
  if (leaving && leaving.nextT >= leaving.endT) leaving = null;
  if (bars.length > 12) { for (const b of bars.slice(0, -12)) { barModes.delete(b.barNo); barLocal.delete(b.barNo); } bars = bars.slice(-12); }
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
  const info = barLocal.get(n);
  const track = info ? TRACKS[info.track] : current?.track ?? TRACKS.march;
  return track.bar(seed, barModes.get(n) ?? modeOf(input), info?.local ?? Math.max(0, n - (current?.startBar ?? 0))).chord;
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
      rig.playSting(chordFor(t), barModes.get(cur?.barNo ?? -1) ?? modeOf(input), cue.streak, t, cue.bounty, current?.track.sting);
      break;
    }
    case 'zkill':
      if (now - lastZkillAt > ZKILL_GAP_S) { lastZkillAt = now; rig.playSting(chordFor(now), modeOf(input), 1, now + 0.02, false, current?.track.sting); }
      break;
    // Ducking for kills, booms and the other big moments is the page's: it follows the sound effects' own list (sfx.ts DUCKS) through `musicDuck`.
    case 'win': case 'loss': {
      const dur = rig.playCadence(cue.kind, current?.track.tonic(seed) ?? 0, now + 0.12);
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
  // Back at the menu the radios are left behind: it plays its own calm march again.
  if (phase !== 'menu' && next === 'menu' && (roomStation !== null || personalStation !== null)) { roomStation = null; personalStation = null; applyVolume(); }
  phase = next;
  const seen = observe(tracker, snap, phase, now, firing);
  tracker = seen.tracker;
  input = tracker.input;
  if (wasEnded && !tracker.ended) musicSeed(Date.now());
  wasEnded = tracker.ended;
  mapTrack = phase === 'menu' ? 'march' : trackIdFor(state.phase === 'menu' ? undefined : state.s.mapId ?? snap?.match.map);
  wantTrack = pickTrack(mapTrack, effectiveStation(), input.night);
  for (const cue of seen.cues) onCue(cue);
  if (!ctx || !rig) return;
  const dt = lastUpdate ? Math.min(0.25, (now - lastUpdate) / 1000) : 0;
  lastUpdate = now;
  const cadence = cadenceUntil > ctx.currentTime;
  const target = layerTargets(input);
  for (const id of LAYER_IDS) {
    const goal = cadence ? 0 : target[id];
    levels[id] = approach(levels[id], goal, dt, cadence ? 0.12 : fadeTau(levels[id], goal));
    if (current) current.deck.layers[id].gain.setTargetAtTime(levelGain(levels[id]), ctx.currentTime, 0.03);
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
/** The live gain of the music bus (0 while muted or off; null before the first gesture), for the `?dev` probe. */
export const musicGainNow = (): number | null => (rig ? rig.volume.gain.value : null);

// ---- radio and track selection ----

/** The station the player hears now: their own tuning, else the room's, else null (each map plays its own track). */
export const getStation = () => effectiveStation();
export const getRoomStation = () => roomStation;
export const getPersonalStation = () => personalStation;
/** The room's radio changed (the server's word in Zombies and the range). */
export function setRoomStation(next: StationId | null) { roomStation = next; applyVolume(); }
/** A hidden radio's tuning, for this player only; null hands back to the room's radio or the map's track. */
export function setPersonalStation(next: StationId | null) { personalStation = next; applyVolume(); }
/** The track the current map would play on its own. */
export const getMapTrack = () => mapTrack;
/** The track that is sounding (or about to). */
export const getPlayingTrack = () => (current?.track.id ?? wantTrack);
/** The map change in progress, or null: the track going out and the one coming in. */
export const getCrossfade = (): { from: TrackId; to: TrackId } | null => (leaving && current ? { from: leaving.track.id, to: current.track.id } : null);
/** The tune-in: a burst of static sweeping across the dial and a click. Honours mute and volume, but not Off (the click that turns it off is heard). */
export function playTuneIn() {
  if (rig && ctx && audibleBase()) rig.playTuneIn(ctx.currentTime + 0.01);
}
/** The scheduler step; the page runs it on a timer, tests drive it. */
export const musicTick = tick;
