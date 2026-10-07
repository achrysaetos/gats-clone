import { cadencePlaying } from './music.ts';
import { screenCue, type SoundCue, type SoundId } from './sfx.ts';

/**
 * A back door for sounds that do not come from a snapshot (the killcam, a confetti cannon): the page registers one sink,
 * and any module can voice a cue or muffle the mix without knowing about the audio engine.
 */
export type SfxSink = { cues(cues: readonly SoundCue[]): void; muffle(on: boolean): void };
let sink: SfxSink | null = null;
export const setSfxSink = (s: SfxSink | null) => { sink = s; };

/** The round-end party sits under the win cadence, so the score's resolution is never drowned. */
const UNDER_CADENCE = 0.55;

/** Voices a screen-space cue (see `screenCue`): `pan` -1..1 for something that happens at a side of the screen. */
export function emitSfx(id: Exclude<SoundId, 'hurt'>, opts: { gain?: number; pan?: number } = {}) {
  const party = id === 'confetti' || id === 'firework';
  const gain = (opts.gain ?? 1) * (party && cadencePlaying() ? UNDER_CADENCE : 1);
  sink?.cues([screenCue(id, gain, opts.pan)]);
}

/** Voices a cue at a place in the world (a magazine hitting the floor), heard from `self`'s own gun a touch louder. */
export function emitSfxAt(id: Exclude<SoundId, 'hurt'>, x: number, y: number, self: boolean, opts: { gain?: number; delayMs?: number } = {}) {
  sink?.cues([{ id, x, y, self, gain: opts.gain ?? 1, ...(opts.delayMs ? { delayMs: opts.delayMs } : {}) }]);
}

/** Dulls the whole mix (the killcam) or opens it again. */
export const setMuffle = (on: boolean) => sink?.muffle(on);
