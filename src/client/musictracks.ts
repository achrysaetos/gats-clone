/**
 * The soundtrack library: one composition per map, all in the adaptive framework (calm, combat, hype, finale and, for the Zombies night, heart).
 * The yard maps share the toy march in three flavours; the rest are `TrackSpec`s from musictracksa/b.ts written by musicgen.ts.
 */
import { generateTrackBar, formBars, formOf } from './musicgen.ts';
import { AIRBASE, EMBASSY, RAILYARD, RANGE, SUMMIT, WASTELAND, OUTPOST } from './musictracksb.ts';
import { HARBOR, MARKET, MUSEUM, PARK, SUBPEN } from './musictracksa.ts';
import type { TrackSpec } from './musicgen.ts';
import { generateBar, keyOfSeed, MARCH_TONIC, tempoFor, type Bar, type Inst, type MarchStyle, type Mode, type MusicInput } from './musictheory.ts';

import { TRACK_IDS, type StationId, type TrackId } from '../shared/radio.ts';
export { TRACK_IDS, type TrackId };

export type TrackDef = {
  id: TrackId;
  /** Shown on the radio. */
  label: string;
  /** The key the track plays in for this seed (fixed for all but the plaza march). */
  tonic(seed: number): number;
  /** Beats per minute for the moment. */
  bpm(input: Pick<MusicInput, 'mode' | 'night' | 'day'>): number;
  /** Loudness trim so every track sits at about the same level. */
  trim: number;
  /** The bell or pluck a kill rings on. */
  sting: Inst;
  bar(seed: number, mode: Mode, barNo: number): Bar;
  /** Bars before the form repeats, in each mode. */
  formBars: Record<Mode, number>;
  /** The track's spec, for the written tracks (the march is generated in musictheory.ts). */
  spec?: TrackSpec;
};

const fromSpec = (spec: TrackSpec, label: string, bpm: number | ((i: Pick<MusicInput, 'night' | 'day'>) => number), trim: number, sting: Inst): TrackDef => ({
  id: spec.id as TrackId, label, tonic: () => spec.tonic, bpm: typeof bpm === 'number' ? () => bpm : bpm, trim, sting,
  bar: (seed, mode, barNo) => generateTrackBar(spec, seed, mode, barNo),
  formBars: { major: formBars(formOf(spec, 'major')), minor: formBars(formOf(spec, 'minor')) }, spec,
});

const march = (id: 'march' | 'oldtown' | 'quarry', label: string, bpm: number, trim: number, sting: Inst): TrackDef => {
  const style: MarchStyle = id === 'march' ? 'plaza' : id;
  return {
    id, label, tonic: (seed) => MARCH_TONIC[style] ?? keyOfSeed(seed), bpm: id === 'march' ? (i) => tempoFor(i) : () => bpm, trim, sting,
    bar: (seed, mode, barNo) => generateBar(seed, mode, barNo, style), formBars: { major: 32, minor: 32 },
  };
};

export const TRACKS: Record<TrackId, TrackDef> = {
  march: march('march', 'Toy March', 132, 0.8, 'glock'),
  oldtown: march('oldtown', 'Cobblestone Fife', 124, 0.97, 'harp'),
  quarry: march('quarry', 'Quarry Clank', 112, 1.45, 'clank'),
  harbor: fromSpec(HARBOR, 'Harbour Shanty', 108, 1.07, 'accordion'),
  market: fromSpec(MARKET, 'Lantern Night', 100, 1.13, 'koto'),
  museum: fromSpec(MUSEUM, 'After Hours', 112, 1.2, 'vibes'),
  subpen: fromSpec(SUBPEN, 'Deep Sonar', 118, 1.7, 'sonar'),
  park: fromSpec(PARK, 'Picnic Parade', 124, 1.06, 'marimba'),
  railyard: fromSpec(RAILYARD, 'Night Freight', 120, 1.3, 'rbell'),
  summit: fromSpec(SUMMIT, 'Alpine Bells', 116, 1.17, 'glock'),
  embassy: fromSpec(EMBASSY, 'Diplomatic Cover', 120, 1.24, 'twang'),
  airbase: fromSpec(AIRBASE, 'Runway Anthem', 130, 0.91, 'glock'),
  wasteland: fromSpec(WASTELAND, 'Dust and Wire', 98, 1.27, 'whistle'),
  range: fromSpec(RANGE, 'Practice Lane', 96, 2, 'vibes'),
  outpost: fromSpec(OUTPOST, 'Bastion', (i) => (i.night ? 124 : 112), 1.24, 'marimba'),
};

/** Which track plays on which map. Unknown maps (the geometry test room) get the march. */
export const MAP_TRACK: Record<string, TrackId> = {
  plaza: 'march', oldtown: 'oldtown', quarry: 'quarry', causeway: 'harbor', market: 'market', museum: 'museum', subpen: 'subpen', park: 'park',
  railyard: 'railyard', summit: 'summit', embassy: 'embassy', airbase: 'airbase', wasteland: 'wasteland', range: 'range', outpost: 'outpost',
};

/** The track for a map; the menu (no map) and any map without its own plays the march. */
export const trackIdFor = (mapId: string | undefined): TrackId => (mapId ? MAP_TRACK[mapId] ?? 'march' : 'march');

/** Seconds before the form comes round again, at the track's own tempo. */
export function formSeconds(t: TrackDef, mode: Mode): number {
  const bpm = t.bpm({ mode: 'arena', night: mode === 'minor', day: mode === 'major' && t.id === 'outpost' });
  return (t.formBars[mode] * 240) / bpm;
}

/**
 * The track to play: the radio's station if one is tuned, else the map's own. A Zombies night keeps the Bastion's night score (its heartbeat and
 * menace are the night's alarm) whatever the radio says, and the station comes back at dawn; Off stays off, which is silence.
 */
export function pickTrack(mapTrack: TrackId, station: StationId | null, night: boolean): TrackId {
  if (night && mapTrack === 'outpost' && station !== 'off') return 'outpost';
  return station && station !== 'off' ? station : mapTrack;
}
