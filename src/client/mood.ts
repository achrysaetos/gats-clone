import { MAPS } from '../shared/maps.ts';
import type { RGB } from './lighting.ts';

/**
 * A map's mood: the time of day and weather chosen so that the map's own lights matter. By day the practical lights are a
 * gentle accent; at night they are the picture. Pure data and lookups (no GL, no DOM), so the table is unit-tested; the
 * renderer asks `moodOf` for the map it draws, ambient.ts-style registries stay out of the shared files.
 *
 * `dusk` is the 0..1 darkness the map always wears (what a theme's `dusk` used to say). `ambient` is what the unlit world
 * is multiplied by at that darkness: cool for night, amber for a sunset. It is never black: the lowest channel of every
 * mood stays above `MIN_AMBIENT` and the soldiers are drawn unlit over it, so players read in the darkest corner.
 */
export type Fog = {
  rgb: RGB;
  /** 0..1 how much of the view the fog covers at its thickest. */
  density: number;
  /** World units per fog cell; larger is broader, slower banks. */
  scale?: number;
  /** World units per second the banks drift (x then y). */
  drift?: readonly [number, number];
};

export type Mood = {
  /** A name for the dev overlay. */
  name: string;
  dusk: number;
  ambient?: RGB;
  /** Multiplier on how strongly lights add (1 is the default night). */
  gain?: number;
  /** Multiplier on the bloom strength. */
  glow?: number;
  fog?: Fog;
  /** 0..1 wet ground: puddles that mirror the lights and a glint on the stone. */
  wet?: number;
  /** 0..1 rain streaks over the view. */
  rain?: number;
  /** 0..1 how often the sky flashes: a storm's lightning lights the whole view for an instant. */
  lightning?: number;
};

/** No channel of a mood's ambient goes below this: darkness is a design tool, not a filter. */
export const MIN_AMBIENT = 0.17;

const FOG_SEA: Fog = { rgb: [0.46, 0.62, 0.72], density: 0.5, scale: 520, drift: [14, 5] };

export const MOODS: Readonly<Record<string, Mood>> = {
  // The harbour: a moonless night over the quay, a low sea fog rolling in, sodium lamps, ship lamps, the lighthouse sweeping.
  causeway: { name: 'harbour night', dusk: 0.94, ambient: [0.264, 0.352, 0.528], gain: 1.34, glow: 1.25, fog: FOG_SEA, wet: 0.6 },
  // Plaza: a sunset plaza, rose and amber, the lamps just coming on.
  plaza: { name: 'plaza sunset', dusk: 0.62, ambient: [0.68, 0.54, 0.6], gain: 1.1, glow: 1.15, fog: { rgb: [1, 0.72, 0.5], density: 0.16, scale: 700, drift: [8, 3] } },
  // Old Town: a cold night, a hand of lamps in the lanes, a ground mist.
  oldtown: { name: 'old town night', dusk: 0.92, ambient: [0.264, 0.326, 0.51], gain: 1.34, glow: 1.2, fog: { rgb: [0.5, 0.58, 0.7], density: 0.34, scale: 480, drift: [10, 4] }, wet: 0.25 },
  // Quarry: a stormy afternoon, grey and cold, rain on the rock; the day map, so lights stay an accent.
  quarry: { name: 'quarry storm', dusk: 0.3, ambient: [0.56, 0.62, 0.72], gain: 1, glow: 0.9, fog: { rgb: [0.7, 0.76, 0.82], density: 0.28, scale: 800, drift: [26, 8] }, wet: 0.7, rain: 0.55, lightning: 1 },
  // The Night Market: a rainy night, neon and lanterns bloom on wet pavement.
  market: { name: 'rainy neon night', dusk: 0.96, ambient: [0.29, 0.273, 0.458], gain: 1.46, glow: 1.5, fog: { rgb: [0.55, 0.42, 0.7], density: 0.2, scale: 420, drift: [12, 9] }, wet: 1, rain: 0.8 },
  // The Museum, after hours: dark galleries, pools of light on the exhibits.
  museum: { name: 'after hours', dusk: 0.93, ambient: [0.246, 0.273, 0.396], gain: 1.51, glow: 1.2, fog: { rgb: [0.6, 0.62, 0.75], density: 0.14, scale: 380, drift: [4, 2] }, wet: 0.35 },
  // The Sub Pen: sodium and a red alarm sweeping through a damp haze.
  subpen: { name: 'sodium and alarms', dusk: 0.86, ambient: [0.299, 0.273, 0.37], gain: 1.4, glow: 1.3, fog: { rgb: [0.62, 0.42, 0.32], density: 0.3, scale: 440, drift: [9, 3] }, wet: 0.55 },
  // The Park: golden hour sliding into dusk, lamps and fireflies.
  park: { name: 'golden hour', dusk: 0.58, ambient: [0.64, 0.52, 0.5], gain: 1.1, glow: 1.2, fog: { rgb: [1, 0.78, 0.5], density: 0.14, scale: 650, drift: [7, 2] } },
  // The Rail Yard: a night of platform lamps, signals and steam lit from below.
  railyard: { name: 'yard at night', dusk: 0.92, ambient: [0.255, 0.308, 0.458], gain: 1.34, glow: 1.2, fog: { rgb: [0.58, 0.64, 0.72], density: 0.3, scale: 460, drift: [11, 4] }, wet: 0.5 },
  // The Summit: a blue night on the snow, warm windows spilling light across it.
  summit: { name: 'blue alpine night', dusk: 0.92, ambient: [0.246, 0.352, 0.581], gain: 1.23, glow: 1.25, fog: { rgb: [0.62, 0.74, 0.95], density: 0.22, scale: 600, drift: [18, 6] } },
  // The Embassy: a gala night, chandeliers in the windows, uplights in the garden.
  embassy: { name: 'gala night', dusk: 0.9, ambient: [0.264, 0.29, 0.458], gain: 1.4, glow: 1.3, fog: { rgb: [0.62, 0.6, 0.78], density: 0.12, scale: 560, drift: [5, 2] }, wet: 0.25 },
  // The Airbase: dusk, the runway edge lights on, the beacon turning.
  airbase: { name: 'airfield dusk', dusk: 0.72, ambient: [0.5, 0.44, 0.58], gain: 1.2, glow: 1.2, fog: { rgb: [0.72, 0.62, 0.78], density: 0.16, scale: 720, drift: [15, 5] }, wet: 0.3 },
  // The Wasteland: a burning orange sunset, fire barrels and dust in the air.
  wasteland: { name: 'burning sunset', dusk: 0.7, ambient: [0.7, 0.44, 0.34], gain: 1.2, glow: 1.3, fog: { rgb: [0.95, 0.55, 0.28], density: 0.32, scale: 640, drift: [30, 6] } },
};

/** `?nomood` (dev): every map wears its old daytime look, to compare before and after. */
const NO_MOOD = typeof location !== 'undefined' && /[?&]nomood\b/.test(location.search);

/** The mood of a map, by id or display name; undefined for a map with none (the outpost, the range). */
export function moodOf(map: string | undefined): Mood | undefined {
  if (!map || NO_MOOD) return undefined;
  if (MOODS[map]) return MOODS[map];
  const id = Object.keys(MAPS).find((k) => (MAPS as Record<string, { name: string }>)[k]!.name === map);
  return id ? MOODS[id] : undefined;
}

let active: Mood | undefined;
/** The renderer says which map it is drawing, once a frame. */
export function setMood(m: Mood | undefined): void { active = m; }
export const currentMood = (): Mood | undefined => active;
