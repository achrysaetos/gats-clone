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

/** Dulls the whole mix (the killcam) or opens it again. */
export const setMuffle = (on: boolean) => sink?.muffle(on);
