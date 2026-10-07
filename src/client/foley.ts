import type { WeaponId } from '../shared/defs.ts';
import type { Layer } from './sfx.ts';

/**
 * Reload foley: the small mechanical sounds of loading a gun, synthesized from the same layers as every other cue (filtered noise
 * bursts for transients and scrapes, sine "modal" rings for the body of struck metal, short pitch-dropping thumps for weight).
 * Each recipe is one event of a reload (a mag scrape, a bolt lock) at its natural length: WHEN it plays is not here but in the
 * reload's beat timeline (`soundTimeline` in reloadbeats.ts), so the sounds follow the real reload time. Nothing is baked to a
 * class's base reload length. Pitch and weight come from `K`/`G` per class: a bigger gun is lower and heavier.
 */
export type BoxSize = 'pistol' | 'smg' | 'assault' | 'lmg';
export const BOX_SIZES: readonly BoxSize[] = ['pistol', 'smg', 'assault', 'lmg'];
export type Surface = 'concrete' | 'wood' | 'metal' | 'snow' | 'grass' | 'dirt';
export const SURFACES: readonly Surface[] = ['concrete', 'wood', 'metal', 'snow', 'grass', 'dirt'];

type BoxAction = 'release' | 'magout' | 'magscrape' | 'magseat' | 'slap' | 'rackback' | 'rack';
const BOX_ACTIONS: readonly BoxAction[] = ['release', 'magout', 'magscrape', 'magseat', 'slap', 'rackback', 'rack'];
type Single = 'pouch' | 'latch' | 'creak' | 'belt' | 'beltlay' | 'slam' | 'shellpick' | 'shellin' | 'pumpback' | 'pump'
  | 'boltup' | 'boltdraw' | 'boltrear' | 'clipseat' | 'ratchet' | 'round' | 'boltfwd' | 'boltlock';
const SINGLES: readonly Single[] = ['pouch', 'latch', 'creak', 'belt', 'beltlay', 'slam', 'shellpick', 'shellin', 'pumpback', 'pump', 'boltup', 'boltdraw', 'boltrear', 'clipseat', 'ratchet', 'round', 'boltfwd', 'boltlock'];

export type FoleyId = `foley:${BoxAction}:${BoxSize}` | `foley:drop:${Surface}` | `foley:${Single}`;

/** Pitch and weight of each box class: the heavier the gun the lower the clicks and the more thump under them. */
const K: Record<BoxSize, number> = { pistol: 1, smg: 0.93, assault: 0.8, lmg: 0.56 };
const G: Record<BoxSize, number> = { pistol: 1, smg: 0.95, assault: 1.05, lmg: 1.25 };

/**
 * Everything here sits under the gunfire: through the real bus a shot peaks near -2 dBFS, and the loudest foley (a mag seat, a
 * rack, a bolt lock) near -16, the clicks and scrapes below that (see `LEVELS_DB` and test/client-reloadsfx.test.ts).
 */
export const FOLEY_TRIM = 0.2;
/** Per-recipe balance in dB on top of the trim: noisy textures (scrapes, cloth, belts) have low peaks for their loudness, so they are lifted, and the sharpest clicks come down. */
const LEVELS_DB: Readonly<Record<string, number>> = {
  'foley:magscrape': 9, 'foley:rack': -1.5, 'foley:slam': -3, 'foley:rackback:pistol': 7, 'foley:rackback:smg': 3.5, 'foley:rackback:assault': 3.5, 'foley:rackback:lmg': 3.5, 'foley:drop:wood': 1.8,
  'foley:pouch': 0.7, 'foley:latch': -2.6, 'foley:creak': 7.6, 'foley:belt': 3.6, 'foley:beltlay': 2.7, 'foley:shellpick': 4, 'foley:shellin': -3.5, 'foley:pumpback': -1,
  'foley:boltdraw': 9.8, 'foley:boltrear': -1.5, 'foley:clipseat': -1.7, 'foley:round': -2.4, 'foley:boltfwd': 1.5,
};
/** The dB balance of cue `id`: its own entry, else its kind's (`foley:magscrape:smg` falls back to `foley:magscrape`), else 0. */
const levelOf = (id: string): number => LEVELS_DB[id] ?? LEVELS_DB[id.split(':').slice(0, 2).join(':')] ?? 0;

// --- Building blocks (pitch k = 1, gain g = 1; `at` moves them) ----------------------------------------------------------

/** A few ms of high-passed noise: the hard transient of metal meeting metal. */
const hp = (hz: number, ms: number, gain: number, d = 0): Layer => ({ src: 'noise', filter: 'highpass', q: 0.7, cutoffHz: [hz, hz], ms, gain, delayMs: d });
const bp = (hz0: number, hz1: number, ms: number, gain: number, d = 0, q = 1.2, attackMs?: number): Layer =>
  ({ src: 'noise', filter: 'bandpass', q, cutoffHz: [hz0, hz1], ms, gain, delayMs: d, ...(attackMs ? { attackMs } : {}) });
const lp = (hz0: number, hz1: number, ms: number, gain: number, d = 0, attackMs?: number): Layer =>
  ({ src: 'noise', filter: 'lowpass', q: 0.7, cutoffHz: [hz0, hz1], ms, gain, delayMs: d, ...(attackMs ? { attackMs } : {}) });
const tone = (hz0: number, hz1: number, ms: number, gain: number, d = 0, wave: 'sine' | 'triangle' | 'sawtooth' = 'sine', attackMs?: number): Layer =>
  ({ src: 'tone', wave, pitchHz: [hz0, hz1], ms, gain: gain * (Math.max(hz0, hz1) < 260 ? THUMP : 1), delayMs: d, ...(attackMs ? { attackMs } : {}) });
/** The low thumps carry the weight but hold most of a hit's energy; kept to this share so the metal on top is heard (about half the energy under 250 Hz, not three quarters). */
const THUMP = 0.62;
/** The ring of struck steel: partials at bar-like ratios, the higher ones dying sooner. */
const modal = (hz: number, ms: number, gain: number, d = 0, ratios: readonly number[] = [1, 2.76, 5.4]): Layer[] =>
  ratios.map((r, i) => tone(hz * r, hz * r * 0.996, ms * (1 - 0.26 * i), gain * 0.55 ** i, d));
/** Little pseudo-random ticks over a span (links of a belt, rounds in a clip, grit); the same every time. */
function ticks(n: number, spanMs: number, hz: number, gain: number, d = 0, spreadHz = 1200, ms = 5): Layer[] {
  const out: Layer[] = [];
  for (let i = 0; i < n; i++) {
    const q = Math.abs((Math.sin(i * 12.9898 + hz) * 43758.5453) % 1), t = n > 1 ? i / (n - 1) : 0;
    out.push(hp(hz + q * spreadHz, ms, gain * (0.65 + 0.5 * q) * (1 - 0.35 * t), d + t * spanMs + q * (spanMs / n) * 0.3));
  }
  return out;
}

/** Moves a recipe `t` ms later, `k` times its pitch and `g` times its loudness. */
function at(layers: readonly Layer[], t: number, k = 1, g = 1): Layer[] {
  return layers.map((l): Layer => l.src === 'tone'
    ? { ...l, pitchHz: [l.pitchHz[0] * k, l.pitchHz[1] * k], gain: l.gain * g, delayMs: (l.delayMs ?? 0) + t }
    : { ...l, cutoffHz: [l.cutoffHz[0] * k, l.cutoffHz[1] * k], gain: l.gain * g, delayMs: (l.delayMs ?? 0) + t });
}

// --- Box magazines (pistol, SMG, assault; the LMG's box is the same pattern, heavier) -----------------------------------

/** The mag-release button: a firm click with a little knock behind it. */
const release = (): Layer[] => [hp(2600, 9, 0.34), tone(520, 300, 24, 0.3, 0, 'triangle'), tone(170, 100, 28, 0.26), ...modal(3300, 50, 0.08, 0, [1]), bp(1300, 800, 14, 0.2, 0, 2)];

/** The mag slides out of the well: a rough steel scrape, then the knock of it clearing the grip. */
const magout = (): Layer[] => [
  bp(2300, 1100, 95, 0.22, 0, 2.2, 14), bp(900, 520, 95, 0.18, 0, 1.4, 14), ...ticks(3, 70, 3000, 0.07, 10, 1500),
  hp(2000, 7, 0.22, 92), tone(220, 120, 55, 0.4, 90, 'triangle'), ...modal(1700, 60, 0.07, 90, [1]),
];

/** The fresh mag meets the well and rides up it. */
const magscrape = (): Layer[] => [bp(1800, 2700, 45, 0.17, 0, 2, 8), bp(800, 1200, 45, 0.14, 0, 1.4, 8), ...ticks(2, 25, 3200, 0.05, 6, 1000)];

/** The mag seats: a firm "clack" with weight, a body of ringing steel and a low thump through the frame. */
const magseat = (): Layer[] => [hp(2200, 10, 0.42), tone(155, 68, 85, 0.68), tone(640, 380, 38, 0.32, 0, 'triangle'), ...modal(1250, 140, 0.13), bp(1000, 600, 42, 0.26, 0, 1.5), lp(700, 220, 60, 0.25)];

/** A palm slaps the base plate: skin on steel, a dull pop. */
const slap = (): Layer[] => [tone(205, 90, 62, 0.52), bp(1100, 500, 48, 0.36, 0, 0.9), lp(750, 260, 55, 0.24), hp(3600, 6, 0.1)];

/**
 * Racking back. A pistol slide runs over its frame: a fast steel scrape with a ratchet of tiny ticks. A rifle's charging handle
 * is pulled: a longer, lower rasp that ends in a hollow knock. `heavy` is how much further apart and lower the long gun sounds.
 */
const rackback = (b: BoxSize): Layer[] => b === 'pistol'
  ? [bp(2900, 1500, 70, 0.22, 0, 3, 6), bp(1200, 700, 70, 0.14, 0, 1.4, 6), ...ticks(3, 38, 4200, 0.09, 12, 800), tone(190, 120, 40, 0.22, 62, 'triangle')]
  : [bp(1150, 620, 115, 0.22, 0, 2.2, 12), bp(420, 260, 115, 0.2, 0, 1.2, 12), ...ticks(b === 'smg' ? 3 : 5, 85, 2600, 0.07, 8, 900), tone(115, 70, 65, 0.34, 108), hp(2000, 6, 0.16, 112)];

/**
 * Racking forward. A pistol's slide snaps shut: a hard "tchk" with a ring and the spring's tiny ping. A rifle's carrier slams
 * home: lower, longer, a thud with rattling parts behind it.
 */
const rack = (b: BoxSize): Layer[] => b === 'pistol'
  ? [hp(3200, 7, 0.44), tone(185, 72, 68, 0.66), ...modal(2300, 160, 0.15, 0, [1, 2.1]), bp(1500, 800, 32, 0.26, 0, 2), tone(4800, 4700, 100, 0.045, 10), lp(900, 300, 50, 0.2)]
  : [tone(125, 55, 95, 0.74), lp(950, 260, 85, 0.42), hp(2500, 8, 0.32), ...modal(1400, 210, 0.13, 0, [1, 2.3, 4.5]), ...ticks(3, 40, 4500, 0.08, 14, 1200), bp(900, 500, 40, 0.24, 6, 1.6)];

/** Pulling a mag or shell from the vest: cloth against cloth, a velcro rip and a dull bump of the pouch. */
const pouch = (): Layer[] => [bp(2400, 1400, 115, 0.2, 0, 0.6, 32), bp(900, 600, 90, 0.1, 0, 0.7, 30), ...[10, 24, 41, 57, 70].map((d, i) => hp(3200 + i * 260, 7, 0.1, d)), tone(130, 90, 35, 0.2, 0)];

// --- Dropped magazines: what they land on ---------------------------------------------------------------------------------

/** A spent mag hitting the floor and bouncing, by surface. The first landing is `MAG_FALL_MS` after the let-go. */
function drop(s: Surface): Layer[] {
  switch (s) {
    case 'concrete': return [hp(4200, 7, 0.34), ...modal(2900, 120, 0.17), tone(135, 70, 55, 0.34), bp(1800, 900, 25, 0.2, 0, 2),
      hp(4500, 5, 0.16, 76), ...modal(3100, 70, 0.08, 76), hp(4800, 4, 0.08, 118)];
    case 'wood': return [tone(340, 170, 60, 0.46, 0, 'triangle'), bp(750, 430, 45, 0.34, 0, 1.5), lp(1500, 400, 45, 0.26), hp(2600, 5, 0.1),
      tone(300, 160, 45, 0.22, 78, 'triangle'), bp(700, 400, 30, 0.14, 78, 1.5), tone(280, 150, 30, 0.1, 122, 'triangle')];
    case 'metal': return [hp(4500, 7, 0.34), ...modal(1700, 270, 0.2, 0, [1, 2.76, 5.4, 8.9]), tone(160, 90, 45, 0.3),
      hp(4700, 5, 0.2, 70), ...modal(1850, 160, 0.1, 70), hp(5000, 4, 0.1, 112), ...modal(1950, 90, 0.05, 112, [1, 2.76])];
    case 'snow': return [lp(900, 240, 140, 0.4, 0, 10), tone(95, 58, 95, 0.4), bp(500, 300, 90, 0.12, 0, 0.8, 12)];
    case 'grass': return [tone(108, 62, 85, 0.44), lp(1100, 300, 115, 0.3, 0, 6), ...ticks(5, 90, 5200, 0.04, 8, 1400, 8), tone(95, 58, 55, 0.16, 80)];
    case 'dirt': return [tone(102, 56, 85, 0.46), bp(700, 330, 75, 0.36, 0, 0.9), ...ticks(6, 100, 2600, 0.07, 6, 1800, 7), lp(600, 200, 60, 0.16, 70)];
  }
}

// --- LMG: feed cover and belt ------------------------------------------------------------------------------------------

/** The cover latch pops: a sprung click and a knock. */
const latch = (): Layer[] => [hp(2200, 9, 0.38), tone(420, 250, 32, 0.4, 0, 'triangle'), ...modal(1500, 130, 0.14), tone(120, 75, 45, 0.34)];
/** The cover's hinge creaking up as it swings, with the flex of thin steel. */
const creak = (): Layer[] => [tone(240, 440, 160, 0.06, 18, 'sawtooth', 40), bp(520, 940, 160, 0.14, 18, 5, 40), bp(1700, 1050, 160, 0.05, 18, 6, 40), tone(330, 300, 120, 0.04, 30, 'triangle', 30)];
/** The belt lifted off its tray: chain links rattling over each other. */
const belt = (): Layer[] => [...ticks(9, 150, 2600, 0.14, 0, 1800, 5), bp(3200, 2000, 160, 0.09, 0, 1.2, 40), bp(1500, 900, 160, 0.06, 0, 1, 30), tone(150, 100, 40, 0.14, 0)];
/** The belt laid back across the tray: fewer, softer links and a last settling clink. */
const beltlay = (): Layer[] => [...ticks(6, 105, 2400, 0.1, 0, 1600, 5), bp(2800, 1500, 120, 0.07, 0, 1.2, 30), tone(120, 70, 40, 0.22, 100), hp(3500, 5, 0.1, 108)];
/** The cover slammed shut: heavy plate, a boom of the box under it and a rattle of loose parts. */
const slam = (): Layer[] => [tone(98, 44, 130, 0.84), hp(2200, 11, 0.48), lp(1100, 240, 115, 0.52), ...modal(900, 360, 0.2, 0, [1, 2.4, 4.7]), ...ticks(4, 70, 3800, 0.07, 22, 1200), bp(700, 400, 50, 0.3, 0, 1.2)];

// --- Shotgun ---------------------------------------------------------------------------------------------------------------

/** A shell lifted out of the pouch: brass on brass, soft. */
const shellpick = (): Layer[] => [...ticks(3, 42, 3100, 0.075, 0, 800, 4), lp(1500, 700, 55, 0.07), bp(2600, 1800, 40, 0.06, 0, 3)];
/** A shell pushed past the loading gate into the tube: a springy "chk", a ping of the loader spring and a small thump. */
const shellin = (): Layer[] => [hp(2800, 9, 0.36), tone(142, 82, 48, 0.48), bp(1500, 1100, 36, 0.32, 0, 5), tone(2300, 2100, 85, 0.05, 4), ...modal(2600, 70, 0.05, 6, [1]), lp(800, 300, 40, 0.18)];
/** The pump drawn back: forend rails scraping, a spent-shell clack at the end. */
const pumpback = (): Layer[] => [bp(1350, 720, 95, 0.28, 0, 2, 10), bp(480, 280, 95, 0.2, 0, 1.2, 10), ...ticks(3, 60, 3000, 0.07, 8, 900), hp(2500, 7, 0.32, 88), tone(102, 62, 65, 0.52, 84, 'triangle'), ...modal(1100, 140, 0.1, 86)];
/** The pump rammed forward and locked: the heaviest click of the lot. */
const pump = (): Layer[] => [tone(88, 40, 110, 0.78), lp(850, 210, 95, 0.46), hp(2400, 9, 0.46), ...modal(1250, 210, 0.14, 0, [1, 2.3, 4.2]), bp(1800, 900, 32, 0.3, 4, 2), ...ticks(2, 30, 4200, 0.06, 12, 900)];

// --- Bolt action -----------------------------------------------------------------------------------------------------------

/** The bolt handle lifted: an unlocking tick and a hint of ring. */
const boltup = (): Layer[] => [hp(2800, 7, 0.28), tone(450, 290, 30, 0.32, 0, 'triangle'), ...modal(2800, 75, 0.08, 0, [1]), tone(135, 80, 32, 0.26)];
/** The bolt drawn back: one long metallic slide along its raceway, with a gritty rub. */
const boltdraw = (): Layer[] => [bp(1600, 3000, 175, 0.2, 0, 2.5, 18), bp(820, 1500, 175, 0.18, 0, 1.4, 18), ...ticks(6, 150, 3400, 0.05, 6, 1400), tone(180, 120, 90, 0.08, 20, 'triangle', 30)];
/** The bolt hits the rear stop. */
const boltrear = (): Layer[] => [hp(2400, 9, 0.4), tone(142, 60, 85, 0.64), ...modal(1050, 190, 0.13, 0, [1, 2.5, 4.9]), bp(900, 500, 42, 0.26, 0, 1.5)];
/** A stripper clip dropped onto the guide: a light steel tink. */
const clipseat = (): Layer[] => [hp(3600, 6, 0.26), ...modal(2600, 105, 0.13, 0, [1, 2.2]), tone(260, 160, 32, 0.32, 0, 'triangle'), bp(2500, 1500, 32, 0.2, 0, 3)];
/** The thumb ripping five rounds down into the magazine: a fast ratchet, each round a tick, a knock and a spring, and the last a thump. */
const ratchet = (): Layer[] => {
  const out: Layer[] = [];
  for (let i = 0; i < 5; i++) {
    const d = i * 27;
    out.push(hp(3900 + i * 160, 4, 0.2, d), tone(1300 + i * 40, 900, 18, 0.15, d), tone(210 - i * 6, 120, 30, 0.26 + i * 0.02, d, 'triangle'), bp(2400, 1600, 14, 0.12, d, 3));
  }
  out.push(tone(150, 80, 70, 0.42, 5 * 27 - 8), lp(700, 260, 50, 0.2, 5 * 27 - 8));
  return out;
};
/** A single round pushed down under the bolt. */
const round = (): Layer[] => [hp(3600, 5, 0.22), tone(1300, 900, 20, 0.16), tone(200, 115, 34, 0.3, 0, 'triangle'), bp(2400, 1600, 16, 0.12, 0, 3), tone(150, 85, 55, 0.3, 8)];
/** The bolt run forward over a fresh round: a slide, then the tick of the round chambering. */
const boltfwd = (): Layer[] => [bp(3000, 1600, 125, 0.2, 0, 2.5, 12), bp(1450, 720, 125, 0.18, 0, 1.4, 12), hp(3500, 5, 0.22, 118), tone(240, 160, 40, 0.22, 118, 'triangle'), ...ticks(3, 60, 3000, 0.05, 4, 1000)];
/** The handle turned down: the solid clack of the bolt locking into its lugs. */
const boltlock = (): Layer[] => [tone(122, 55, 95, 0.78), hp(2200, 10, 0.46), ...modal(1150, 230, 0.14, 0, [1, 2.5, 4.9]), lp(900, 250, 75, 0.36), tone(520, 320, 28, 0.32, 0, 'triangle'), bp(1000, 600, 40, 0.24, 0, 1.5)];

// --- Table -----------------------------------------------------------------------------------------------------------------

const SINGLE_RECIPES: Record<Single, () => Layer[]> = { pouch, latch, creak, belt, beltlay, slam, shellpick, shellin, pumpback, pump, boltup, boltdraw, boltrear, clipseat, ratchet, round, boltfwd, boltlock };
const BOX_RECIPES: Record<BoxAction, (b: BoxSize) => Layer[]> = { release, magout, magscrape, magseat, slap, rackback, rack };

/** Pitch and weight tweaks per box action: the LMG's box swap is slower and louder, its handle a different animal. */
function boxRecipe(a: BoxAction, b: BoxSize): Layer[] {
  const k = K[b], g = G[b];
  const body = BOX_RECIPES[a](b);
  // The magazine well and the button are small whatever the gun: the weight sits in the seat, the rack and the thumps.
  const soft = a === 'release' || a === 'magscrape' || a === 'magout' || a === 'slap';
  return at(body, 0, soft ? Math.sqrt(k) : k, soft ? 1 : g);
}

function foleyTable(): Record<FoleyId, readonly Layer[]> {
  const out: Partial<Record<FoleyId, readonly Layer[]>> = {};
  const trim = (id: string) => FOLEY_TRIM * 10 ** (levelOf(id) / 20);
  for (const b of BOX_SIZES) for (const a of BOX_ACTIONS) out[`foley:${a}:${b}`] = at(boxRecipe(a, b), 0, 1, trim(`foley:${a}:${b}`));
  for (const s of SURFACES) out[`foley:drop:${s}`] = at(drop(s), 0, 1, trim(`foley:drop:${s}`));
  for (const s of SINGLES) out[`foley:${s}`] = at(SINGLE_RECIPES[s](), 0, 1, trim(`foley:${s}`));
  return out as Record<FoleyId, readonly Layer[]>;
}

export const FOLEY: Record<FoleyId, readonly Layer[]> = foleyTable();

// --- The action cycle after a shot ---------------------------------------------------------------------------------------

/**
 * Working the action between shots, for the shooter's own ears (the layers are `selfOnly`): a bolt-action sniper lifts, draws,
 * pushes and locks its bolt; a pump shotgun racks. Timed as shares of the gun's fire interval so it fits whatever the rate is,
 * and quieter than the reload's own foley. Semi-autos and double barrels have no such sound (nothing is worked by hand).
 */
export function actionCycle(base: WeaponId, fireMs: number, mag: number): Layer[] | null {
  // The shot recipe is trimmed up by its class's SHOT_TRIM (about 1.6x), so the cycle comes in at roughly half the reload foley.
  const g = 0.34;
  const only = (layers: Layer[]): Layer[] => layers.map((l) => ({ ...l, selfOnly: true as const }));
  const part = (id: FoleyId, t: number) => at(FOLEY[id], t, 1, g);
  if (base === 'sniper' && fireMs >= 1000) {
    return only([...part('foley:boltup', 0.3 * fireMs), ...part('foley:boltdraw', 0.32 * fireMs), ...part('foley:boltrear', 0.45 * fireMs),
      ...part('foley:boltfwd', 0.56 * fireMs - 100), ...part('foley:boltlock', 0.66 * fireMs)]);
  }
  if (base === 'shotgun' && fireMs >= 480 && mag > 2) {
    const back = 0.32 * fireMs;
    return only([...part('foley:pumpback', back - 85), ...part('foley:pump', back + 110)]);
  }
  return null;
}
