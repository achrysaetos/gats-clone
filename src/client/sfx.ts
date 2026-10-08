import { EVOLUTIONS, GUN_IDS, GUNS, ZOM, type ArmorId, type GunId, type TurretKind, type WeaponId } from '../shared/defs.ts';
import { KIT, type Material } from '../shared/kit.ts';
import type { GameEvent, SelfView, Snapshot, WallView } from '../shared/protocol.ts';
import { cellRect, coreRectAt } from '../shared/sim/build.ts';
import { hostOf } from './decals.ts';
import { selfOf } from './derive.ts';
import { TICK_MS } from './interp.ts';
import { beatsCrossed, cycleOf, reloadFamily, type ReloadCue } from './reload.ts';
import { ringMoved } from './royale.ts';

export type SoundId =
  | `shot:${GunId}` | 'shot:silenced'
  | 'hit' | 'hurt' | 'boom' | 'slash' | 'kill' | 'bounty' | 'death' | 'levelup' | 'evolve' | 'perk' | 'click'
  | `gun:${ReloadCue}` | 'brass:casing' | 'brass:shell'
  | `impact:${Material}` | 'flesh' | `tink:${Exclude<ArmorId, 'none'>}` | 'whizz' | 'clatter'
  | 'bite' | 'splat' | 'wallHit' | 'wallUp' | 'wallDown' | 'coreHit' | 'horn' | 'chime' | 'downed' | 'revived' | `turret:${TurretKind}`
  | 'knock' | 'ring';

type Wave = 'sine' | 'square' | 'sawtooth' | 'triangle';
type Timing = { ms: number; gain: number; delayMs?: number };
export type Layer =
  | ({ src: 'tone'; wave: Wave; pitchHz: readonly [number, number] } & Timing)
  | ({ src: 'noise'; filter: 'lowpass' | 'highpass' | 'bandpass'; q: number; cutoffHz: readonly [number, number] } & Timing);
type Recipe = readonly Layer[];

const crack = (cutoffHz: number, ms: number, gain: number): Layer => ({ src: 'noise', filter: 'bandpass', q: 0.9, cutoffHz: [cutoffHz, cutoffHz * 0.4], ms, gain });
const thump = (pitchHz: number, ms: number, gain: number): Layer => ({ src: 'tone', wave: 'triangle', pitchHz: [pitchHz, pitchHz * 0.35], ms, gain });
const tick = (cutoffHz: number, ms: number, gain: number, delayMs?: number): Layer => ({ src: 'noise', filter: 'bandpass', q: 3, cutoffHz: [cutoffHz, cutoffHz * 0.8], ms, gain, ...(delayMs !== undefined && { delayMs }) });
const note = (pitchHz: number, delayMs: number, ms = 110, gain = 0.25): Layer => ({ src: 'tone', wave: 'square', pitchHz: [pitchHz, pitchHz], ms, gain, delayMs });

const CLASS_SHOTS: Record<WeaponId, Recipe> = {
  pistol: [crack(2600, 70, 0.5), thump(260, 60, 0.35)],
  smg: [crack(3200, 45, 0.4), thump(320, 40, 0.25)],
  shotgun: [crack(1400, 180, 0.7), thump(140, 160, 0.6)],
  assault: [crack(2200, 80, 0.5), thump(200, 70, 0.4)],
  sniper: [crack(1800, 260, 0.75), thump(110, 240, 0.6), { src: 'tone', wave: 'sawtooth', pitchHz: [900, 300], ms: 90, gain: 0.15 }],
  lmg: [crack(1900, 70, 0.45), thump(170, 70, 0.4)],
};

const BRANCH_PITCH = [[0.84, 1.18], [0.92, 1.09]] as const;

function pitchOf(gun: GunId): number {
  const { from, stage } = GUNS[gun];
  if (!from) return 1;
  return pitchOf(from) * (BRANCH_PITCH[stage - 1]?.[EVOLUTIONS[from].indexOf(gun)] ?? 1);
}

export const retune = (layer: Layer, k: number, stage: number): Layer => {
  const loud = { ...layer, gain: Math.min(1, layer.gain * (1 + 0.12 * stage)) };
  return loud.src === 'tone'
    ? { ...loud, pitchHz: [loud.pitchHz[0] * k, loud.pitchHz[1] * k] }
    : { ...loud, cutoffHz: [loud.cutoffHz[0] * k, loud.cutoffHz[1] * k] };
};

function shotRecipe(gun: GunId): Recipe {
  const g = GUNS[gun];
  const k = pitchOf(gun);
  const layers = CLASS_SHOTS[g.base].map((l) => retune(l, k, g.stage));
  if (g.blast) layers.push(thump(70, 260, 0.65));
  if (g.penetrate) layers.push({ src: 'tone', wave: 'sawtooth', pitchHz: [1500 * k, 400 * k], ms: 80, gain: 0.14 });
  if (g.pellets > 1 && g.base !== 'shotgun') layers.push(crack(3000 * k, 40, 0.3));
  return layers;
}

function shotSounds(): Record<`shot:${GunId}`, Recipe> {
  const out: Partial<Record<`shot:${GunId}`, Recipe>> = {};
  for (const id of GUN_IDS) out[`shot:${id}`] = shotRecipe(id);
  return out as Record<`shot:${GunId}`, Recipe>;
}

export const SOUNDS: Record<SoundId, Recipe> = {
  ...shotSounds(),
  'shot:silenced': [{ src: 'noise', filter: 'lowpass', q: 1, cutoffHz: [1200, 300], ms: 60, gain: 0.35 }],
  hit: [{ src: 'tone', wave: 'square', pitchHz: [900, 500], ms: 45, gain: 0.18 }, crack(4000, 30, 0.2)],
  hurt: [{ src: 'tone', wave: 'sawtooth', pitchHz: [220, 90], ms: 140, gain: 0.3 }, { src: 'noise', filter: 'lowpass', q: 1, cutoffHz: [800, 200], ms: 120, gain: 0.3 }],
  boom: [{ src: 'noise', filter: 'lowpass', q: 0.7, cutoffHz: [1600, 60], ms: 700, gain: 0.9 }, thump(90, 500, 0.8)],
  slash: [
    { src: 'noise', filter: 'bandpass', q: 2.5, cutoffHz: [5200, 1400], ms: 150, gain: 0.55 },
    { src: 'tone', wave: 'triangle', pitchHz: [1100, 500], ms: 60, gain: 0.12, delayMs: 50 },
  ],
  kill: [thump(150, 140, 0.6), note(880, 60), note(1320, 130, 160)],
  death: [{ src: 'tone', wave: 'sawtooth', pitchHz: [440, 55], ms: 900, gain: 0.35 }, { src: 'noise', filter: 'lowpass', q: 1, cutoffHz: [900, 80], ms: 600, gain: 0.3 }],
  'gun:magOut': [tick(2600, 40, 0.25), tick(1800, 60, 0.2, 50)],
  'gun:magIn': [tick(2200, 30, 0.3), thump(420, 40, 0.25)],
  'gun:slide': [tick(3200, 50, 0.3), tick(2400, 40, 0.3, 70)],
  'gun:bolt': [tick(3000, 40, 0.3), tick(2000, 50, 0.35, 90)],
  'gun:shell': [tick(1600, 50, 0.25), thump(300, 40, 0.2)],
  'gun:pump': [tick(1400, 70, 0.35), thump(220, 60, 0.3), tick(1800, 60, 0.35, 150)],
  'gun:boxOpen': [tick(2000, 60, 0.3), thump(260, 50, 0.2)],
  'gun:boxClose': [thump(300, 60, 0.35), tick(2400, 40, 0.3)],
  'brass:casing': [{ src: 'tone', wave: 'triangle', pitchHz: [5200, 4800], ms: 40, gain: 0.08 }, { src: 'tone', wave: 'triangle', pitchHz: [4700, 4500], ms: 30, gain: 0.05, delayMs: 90 }],
  'brass:shell': [tick(900, 40, 0.15), tick(1100, 30, 0.1, 110)],
  'impact:metal': [tick(3800, 30, 0.3), { src: 'tone', wave: 'sine', pitchHz: [3400, 1900], ms: 320, gain: 0.12, delayMs: 20 }],
  'impact:concrete': [crack(2400, 50, 0.35), { src: 'noise', filter: 'lowpass', q: 1, cutoffHz: [1600, 400], ms: 120, gain: 0.2 }],
  'impact:wood': [tick(1300, 60, 0.35), thump(260, 50, 0.2)],
  'impact:planter': [{ src: 'noise', filter: 'lowpass', q: 1, cutoffHz: [900, 200], ms: 90, gain: 0.35 }],
  'impact:sandbag': [{ src: 'noise', filter: 'lowpass', q: 1, cutoffHz: [700, 150], ms: 110, gain: 0.4 }, thump(140, 80, 0.25)],
  flesh: [{ src: 'noise', filter: 'bandpass', q: 1.2, cutoffHz: [1100, 300], ms: 80, gain: 0.35 }, thump(180, 60, 0.2)],
  'tink:light': [{ src: 'tone', wave: 'triangle', pitchHz: [4200, 3900], ms: 120, gain: 0.18 }],
  'tink:medium': [{ src: 'tone', wave: 'triangle', pitchHz: [3200, 3000], ms: 160, gain: 0.2 }, tick(2400, 30, 0.2)],
  'tink:heavy': [{ src: 'tone', wave: 'triangle', pitchHz: [2300, 2150], ms: 220, gain: 0.22 }, thump(320, 90, 0.3)],
  whizz: [{ src: 'noise', filter: 'bandpass', q: 4, cutoffHz: [5200, 1800], ms: 220, gain: 0.35 }],
  clatter: [tick(2200, 50, 0.3), tick(1700, 60, 0.25, 90), tick(2600, 40, 0.15, 190)],
  levelup: [note(523, 0, 120, 0.2), note(659, 90, 120, 0.2), note(784, 180, 260, 0.22)],
  evolve: [
    { src: 'tone', wave: 'sawtooth', pitchHz: [180, 720], ms: 420, gain: 0.16 },
    note(392, 60, 120, 0.18), note(587, 170, 120, 0.2), note(784, 280, 380, 0.24),
    { src: 'noise', filter: 'highpass', q: 0.8, cutoffHz: [6000, 9000], ms: 500, gain: 0.12, delayMs: 280 },
  ],
  perk: [{ src: 'tone', wave: 'triangle', pitchHz: [660, 660], ms: 60, gain: 0.22 }, { src: 'tone', wave: 'triangle', pitchHz: [990, 990], ms: 90, gain: 0.22, delayMs: 60 }],
  bounty: [note(988, 0, 80, 0.22), note(1319, 80, 320, 0.24), { src: 'noise', filter: 'highpass', q: 1, cutoffHz: [7000, 7000], ms: 200, gain: 0.1, delayMs: 80 }],
  click: [{ src: 'tone', wave: 'square', pitchHz: [1800, 1800], ms: 18, gain: 0.15 }],
  bite: [{ src: 'noise', filter: 'bandpass', q: 1.4, cutoffHz: [900, 260], ms: 130, gain: 0.5 }, { src: 'tone', wave: 'sawtooth', pitchHz: [150, 60], ms: 110, gain: 0.22 }],
  splat: [{ src: 'noise', filter: 'bandpass', q: 1.2, cutoffHz: [700, 180], ms: 110, gain: 0.35 }, { src: 'tone', wave: 'triangle', pitchHz: [210, 70], ms: 90, gain: 0.25 }],
  'turret:sentry': [crack(4200, 35, 0.3), { src: 'tone', wave: 'square', pitchHz: [1400, 900], ms: 25, gain: 0.08 }],
  'turret:cannon': [crack(900, 300, 0.7), thump(70, 380, 0.75), { src: 'noise', filter: 'lowpass', q: 0.7, cutoffHz: [700, 80], ms: 420, gain: 0.35 }],
  'turret:scatter': [crack(2600, 120, 0.45), { src: 'noise', filter: 'bandpass', q: 0.9, cutoffHz: [2400, 600], ms: 140, gain: 0.3 }],
  'turret:mortar': [thump(120, 220, 0.6), { src: 'noise', filter: 'lowpass', q: 0.8, cutoffHz: [500, 120], ms: 260, gain: 0.3 }],
  wallHit: [thump(150, 90, 0.4), { src: 'noise', filter: 'lowpass', q: 1, cutoffHz: [1400, 300], ms: 80, gain: 0.3 }],
  wallUp: [thump(320, 50, 0.45), thump(240, 70, 0.45), { ...thump(240, 70, 0.4), delayMs: 80 }],
  wallDown: [{ src: 'noise', filter: 'lowpass', q: 0.8, cutoffHz: [1500, 90], ms: 480, gain: 0.6 }, thump(85, 300, 0.55)],
  coreHit: [{ src: 'tone', wave: 'square', pitchHz: [240, 190], ms: 130, gain: 0.16 }, thump(95, 160, 0.5)],
  horn: [
    { src: 'tone', wave: 'sawtooth', pitchHz: [110, 98], ms: 1300, gain: 0.22 },
    { src: 'tone', wave: 'triangle', pitchHz: [165, 147], ms: 1300, gain: 0.2 },
    { src: 'noise', filter: 'lowpass', q: 0.7, cutoffHz: [400, 120], ms: 900, gain: 0.15 },
  ],
  chime: [
    { src: 'tone', wave: 'triangle', pitchHz: [659, 659], ms: 420, gain: 0.22 },
    { src: 'tone', wave: 'triangle', pitchHz: [880, 880], ms: 420, gain: 0.22, delayMs: 140 },
    { src: 'tone', wave: 'triangle', pitchHz: [1175, 1175], ms: 700, gain: 0.24, delayMs: 280 },
  ],
  downed: [{ src: 'tone', wave: 'sawtooth', pitchHz: [330, 110], ms: 650, gain: 0.3 }, { src: 'noise', filter: 'lowpass', q: 1, cutoffHz: [700, 120], ms: 400, gain: 0.25 }],
  revived: [note(523, 0, 110, 0.2), note(784, 100, 260, 0.22)],
  knock: [thump(240, 110, 0.45), note(740, 0, 80, 0.2), note(554, 80, 170, 0.2)],
  ring: [
    { src: 'tone', wave: 'sawtooth', pitchHz: [82, 62], ms: 1500, gain: 0.16 },
    { src: 'tone', wave: 'triangle', pitchHz: [123, 93], ms: 1500, gain: 0.14 },
    { src: 'noise', filter: 'lowpass', q: 0.7, cutoffHz: [420, 140], ms: 1300, gain: 0.16 },
  ],
};

/** The recordings `npm run art:sounds` ships, named as in art/sounds.json. Several cues share one at different rates. */
export const SAMPLE_IDS = [
  'pistol', 'smg', 'shotgun', 'assault', 'sniper', 'lmg', 'silenced', 'launcher', 'crack', 'sub',
  'magOut', 'magIn', 'slide', 'bolt', 'shellIn', 'pump', 'boxOpen', 'boxClose', 'casing', 'shellDrop',
  'ricochet', 'chip', 'splinter', 'dirt', 'sandbag', 'flesh', 'tink', 'plate', 'whizz', 'clatter', 'thump',
  'hit', 'hurt', 'boom', 'slash', 'kill', 'bounty', 'levelup', 'evolve', 'perk', 'click',
  'bite', 'splat', 'wallHit', 'wallUp', 'wallDown', 'coreHit', 'horn', 'chime', 'revived', 'knock', 'ring', 'cannon', 'mortar',
] as const;
export type SampleId = (typeof SAMPLE_IDS)[number];
export type SampleLayer = { sample: SampleId; rate: number; gain: number; delayMs?: number };

const layer = (sample: SampleId, rate = 1, gain = 1, delayMs?: number): SampleLayer => ({ sample, rate, gain, ...(delayMs !== undefined && { delayMs }) });

/** The crack every report opens on, brighter on light guns. */
const CRACK: Record<WeaponId, SampleLayer> = {
  pistol: layer('crack', 1.1, 0.5), smg: layer('crack', 1.25, 0.4), assault: layer('crack', 1, 0.5),
  shotgun: layer('crack', 0.8, 0.6), sniper: layer('crack', 0.9, 0.65), lmg: layer('crack', 0.95, 0.5),
};
/** The low body under a report: a heavy gun shoves, a light one has none and flutters. */
const SUB: Partial<Record<WeaponId, SampleLayer>> = {
  assault: layer('sub', 1.5, 0.3), lmg: layer('sub', 1.3, 0.45), shotgun: layer('sub', 1, 0.9), sniper: layer('sub', 0.85, 0.8),
};

/**
 * A report is a transient, the class recording as its body, and a low layer by weight, all pitched together by branch.
 * The tail is not a recording: the page sends each report into a space (see `placeCue`). A blast gun adds the launcher's thump.
 */
function shotLayers(gun: GunId): SampleLayer[] {
  const g = GUNS[gun];
  const k = pitchOf(gun);
  const sub = SUB[g.base];
  return [
    { ...CRACK[g.base], rate: CRACK[g.base].rate * k },
    layer(g.base, k),
    ...(sub ? [{ ...sub, rate: sub.rate * k }] : []),
    ...(g.blast ? [layer('launcher', 1, 0.8)] : []),
  ];
}

function shotSamples(): Record<`shot:${GunId}`, readonly SampleLayer[]> {
  const out: Partial<Record<`shot:${GunId}`, readonly SampleLayer[]>> = {};
  for (const id of GUN_IDS) out[`shot:${id}`] = shotLayers(id);
  return out as Record<`shot:${GunId}`, readonly SampleLayer[]>;
}

/** The kill confirm is a thump, then the tone this long after it. */
const KILL_TONE_MS = 70;

export const SAMPLES: Record<SoundId, readonly SampleLayer[]> = {
  ...shotSamples(),
  'shot:silenced': [layer('silenced')],
  hit: [layer('hit')],
  hurt: [layer('hurt')],
  boom: [layer('boom')],
  slash: [layer('slash')],
  kill: [layer('thump', 1, 0.9), layer('kill', 1, 1, KILL_TONE_MS)],
  bounty: [layer('thump', 1, 0.9), layer('kill', 1, 1, KILL_TONE_MS), layer('bounty', 1, 1, KILL_TONE_MS)],
  death: [layer('hurt', 0.6)],
  'gun:magOut': [layer('magOut')],
  'gun:magIn': [layer('magIn')],
  'gun:slide': [layer('slide')],
  'gun:bolt': [layer('bolt')],
  'gun:shell': [layer('shellIn')],
  'gun:pump': [layer('pump')],
  'gun:boxOpen': [layer('boxOpen')],
  'gun:boxClose': [layer('boxClose')],
  'brass:casing': [layer('casing')],
  'brass:shell': [layer('shellDrop')],
  'impact:metal': [layer('ricochet')],
  'impact:concrete': [layer('chip', 1.25)],
  'impact:wood': [layer('splinter')],
  'impact:planter': [layer('dirt')],
  'impact:sandbag': [layer('sandbag')],
  flesh: [layer('flesh')],
  'tink:light': [layer('tink', 1.2, 0.6)],
  'tink:medium': [layer('tink', 1, 0.8)],
  'tink:heavy': [layer('tink', 0.8, 1), layer('plate', 0.9, 0.7)],
  whizz: [layer('whizz')],
  clatter: [layer('clatter')],
  levelup: [layer('levelup')],
  evolve: [layer('evolve')],
  perk: [layer('perk')],
  click: [layer('click')],
  bite: [layer('bite')],
  splat: [layer('splat')],
  wallHit: [layer('wallHit')],
  wallUp: [layer('wallUp')],
  wallDown: [layer('wallDown', 0.75)],
  coreHit: [layer('coreHit')],
  horn: [layer('horn')],
  chime: [layer('chime')],
  downed: [layer('hurt', 0.75)],
  revived: [layer('revived')],
  knock: [layer('knock')],
  ring: [layer('ring')],
  'turret:sentry': [layer('smg', 1.35, 0.55)],
  'turret:cannon': [layer('cannon')],
  'turret:scatter': [layer('shotgun', 1.2, 0.7)],
  'turret:mortar': [layer('mortar')],
};

/** Every play of a sample is nudged by up to this fraction of its rate, so a held trigger doesn't machine-gun one identical clip. */
export const RATE_JITTER = 0.04;

export type Voice = { kind: 'sample'; layers: readonly SampleLayer[] } | { kind: 'synth'; recipe: Recipe };

/** A cue plays its recording once every layer has decoded, and its synth recipe until then. `random` is in [0, 1). */
export function voiceFor(id: SoundId, decoded: (sample: SampleId) => boolean, random: () => number): Voice {
  const layers = SAMPLES[id];
  if (!layers.every((l) => decoded(l.sample))) return { kind: 'synth', recipe: SOUNDS[id] };
  const jitter = 1 + (random() * 2 - 1) * RATE_JITTER;
  return { kind: 'sample', layers: layers.map((l) => ({ ...l, rate: l.rate * jitter })) };
}

export const MAX_VOICES = 32;
/** Footsteps, brass and impacts give way first: they take a voice only while this many stay free for shots and hits. */
const FILLER_HEADROOM = 8;

/** How far off a cue carries, in view radii; how much of it rings into the space around it; and whether it gives way when voices run short. */
export type Trait = { reach: number; tail: number; filler: boolean };

const SHOT_TAIL: Record<WeaponId, number> = { pistol: 0.3, smg: 0.25, assault: 0.4, shotgun: 0.55, sniper: 0.7, lmg: 0.45 };
const TRAIT = (reach: number, tail = 0, filler = false): Trait => ({ reach, tail, filler });

export function traitsOf(id: SoundId): Trait {
  if (id === 'shot:silenced') return TRAIT(0.8, 0.08);
  if (id.startsWith('shot:')) return TRAIT(1.2, SHOT_TAIL[GUNS[id.slice(5) as GunId].base]);
  if (id === 'boom') return TRAIT(1.2, 0.8);
  if (id === 'turret:cannon' || id === 'turret:mortar') return TRAIT(1.2, 0.5);
  if (id.startsWith('turret:')) return TRAIT(1.2, 0.25);
  if (id.startsWith('gun:')) return TRAIT(0.6, 0.05);
  if (id.startsWith('brass:')) return TRAIT(0.45, 0, true);
  if (id.startsWith('impact:') || id.startsWith('tink:') || id === 'flesh' || id === 'clatter') return TRAIT(0.8, 0.1, true);
  return TRAIT(1.2);
}

/** Whether a cue of `layers` voices may start with `active` already sounding. */
export const admits = (id: SoundId, layers: number, active: number): boolean =>
  active + layers <= MAX_VOICES - (traitsOf(id).filler ? FILLER_HEADROOM : 0);

type Rect = { x: number; y: number; w: number; h: number };
/** Under a roof the tail is short and close; in the open it rolls off the buildings. */
export type Space = 'open' | 'roof';
export type Hearing = { listener: { x: number; y: number }; viewRadius: number; roofs: readonly Rect[] };
/** `cutoffHz` is the low pass distance puts on a cue, null when it arrives unfiltered; `wet` is how loud it rings into `space`. */
export type Placed = { gain: number; pan: number; cutoffHz: number | null; space: Space; wet: number };

const ROOF_MIN = 100;
/** A roof is an overhead piece broad both ways: a gantry beam or a pipe run overhead leaves the sky open. */
export const roofsOf = (overhead: readonly Rect[]): Rect[] => overhead.filter((p) => p.w >= ROOF_MIN && p.h >= ROOF_MIN);
const under = (roofs: readonly Rect[], x: number, y: number) => roofs.some((r) => x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h);

/** Closer than this share of a cue's reach it arrives bright; from there to the edge its low pass falls from `FULL_HZ` to `FAR_HZ`. */
const NEAR_SHARE = 0.2;
const FULL_HZ = 18000;
const FAR_HZ = 900;

/** How loud, where in the stereo field and in what space a cue lands for a listener, or null when it is out of earshot. */
export function placeCue(cue: SoundCue, hearing: Hearing): Placed | null {
  const { listener, viewRadius, roofs } = hearing;
  const { reach, tail } = traitsOf(cue.id);
  const roofed = under(roofs, listener.x, listener.y) || (!cue.self && under(roofs, cue.x, cue.y));
  const space: Space = roofed ? 'roof' : 'open';
  if (cue.self) return { gain: cue.gain, pan: 0, cutoffHz: null, space, wet: tail * cue.gain };
  const dx = cue.x - listener.x;
  const share = Math.hypot(dx, cue.y - listener.y) / (viewRadius * reach);
  const falloff = Math.max(0, 1 - share) ** 2;
  if (falloff <= 0) return null;
  const far = Math.max(0, (share - NEAR_SHARE) / (1 - NEAR_SHARE));
  return {
    gain: falloff * cue.gain,
    pan: Math.max(-1, Math.min(1, dx / viewRadius)) * 0.8,
    cutoffHz: far > 0 ? FULL_HZ * (FAR_HZ / FULL_HZ) ** far : null,
    space,
    // The dry sound falls off faster than its tail, so a far gun is mostly echo.
    wet: tail * cue.gain * Math.sqrt(falloff),
  };
}

/** Each space's tail: how long it takes to die away and the slaps off walls before it. */
export const SPACES: Record<Space, { decayS: number; echoes: readonly { ms: number; gain: number }[] }> = {
  open: { decayS: 1.6, echoes: [{ ms: 95, gain: 0.5 }, { ms: 230, gain: 0.32 }, { ms: 410, gain: 0.2 }] },
  roof: { decayS: 0.35, echoes: [{ ms: 11, gain: 0.45 }, { ms: 23, gain: 0.3 }] },
};

/** A stereo impulse response for `space`: its slaps, then noise dying away to -60 dB over `decayS`. `random` is in [0, 1). */
export function impulse(space: Space, sampleRate: number, random: () => number): [Float32Array<ArrayBuffer>, Float32Array<ArrayBuffer>] {
  const { decayS, echoes } = SPACES[space];
  const n = Math.ceil(decayS * sampleRate);
  const channels: [Float32Array<ArrayBuffer>, Float32Array<ArrayBuffer>] = [new Float32Array(n), new Float32Array(n)];
  channels.forEach((data, c) => {
    for (let i = 0; i < n; i++) data[i] = (random() * 2 - 1) * 0.35 * 10 ** ((-3 * i) / n);
    // The two ears hear each slap a hair apart, which widens the tail.
    for (const e of echoes) {
      const at = Math.floor(((e.ms + c * 3) / 1000) * sampleRate);
      for (let i = 0; i < 48 && at + i < n; i++) data[at + i]! += (random() * 2 - 1) * e.gain * (1 - i / 48);
    }
  });
  return channels;
}

/** Each 100 hp the core loses sounds once, so a crowd chewing on it reads as a steady alarm rather than a buzz. */
const CORE_HIT_STEP = 100;

/** `delayMs` starts a cue that long after it is played; `rate` pitches it, slower for heavier. */
export type SoundCue = { x: number; y: number; self: boolean; gain: number; delayMs?: number; rate?: number }
  & ({ id: 'hurt'; damageFrac: number } | { id: Exclude<SoundId, 'hurt'> });

/** Handling sounds pitch with the gun: a pistol's parts are small and quick, an LMG's heavy. */
const HANDLING_RATE: Record<WeaponId, number> = { pistol: 1.12, smg: 1.08, assault: 1, sniper: 0.94, shotgun: 1, lmg: 0.88 };
/** How long a casing flies before it rings on the floor; it leaves on the shot, or on the pump or bolt that throws it. */
const BRASS_LANDS_MS = 400;

const handling = (gun: GunId, cue: ReloadCue, at: { x: number; y: number }, self: boolean, delayMs?: number): SoundCue =>
  ({ id: `gun:${cue}`, x: at.x, y: at.y, self, gain: 0.8, rate: HANDLING_RATE[GUNS[gun].base], ...(delayMs !== undefined && { delayMs }) });

/** A shot's report, then the pump or bolt worked after it, then its casing or shell landing. */
export function shotCues(gun: GunId, silenced: boolean, at: { x: number; y: number }, self: boolean): SoundCue[] {
  const cycle = cycleOf(gun);
  return [
    { id: silenced ? 'shot:silenced' : `shot:${gun}`, x: at.x, y: at.y, self, gain: 1 },
    ...(cycle ? [handling(gun, cycle.kind, at, self, cycle.atMs)] : []),
    { id: cycle?.kind === 'pump' ? 'brass:shell' : 'brass:casing', x: at.x, y: at.y, self, gain: self ? 0.45 : 0.7, delayMs: (cycle?.atMs ?? 0) + BRASS_LANDS_MS },
  ];
}

/** The reload beats passed between two shares of a reload, undefined when none runs; one that vanished from a living player finished. */
function reloadBeats(gun: GunId, from: number | undefined, to: number | undefined, alive: boolean): ReloadCue[] {
  if (from === undefined && to === undefined) return [];
  return beatsCrossed(reloadFamily(gun), from ?? 0, to ?? (alive ? 1 : 0));
}

type Cover = Rect & { material: Material };

/** What stands where a round stopped, found the way the impact effect finds it, so the sound and the chips agree. */
function coverOf(walls: readonly WallView[], snap: Snapshot): Cover[] {
  return [
    ...walls.map((w) => ({ x: w.x, y: w.y, w: w.w, h: w.h, material: w.built ? 'concrete' as const : w.material })),
    ...snap.crates.map((c) => ({ x: c.x, y: c.y, w: c.w, h: c.h, material: KIT[c.piece].material })),
    ...(snap.buildings ?? []).map((b) => ({ ...cellRect(b.cx, b.cy), material: 'concrete' as const })),
    ...(snap.run ? [{ ...coreRectAt(snap.run.core), material: 'metal' as const }] : []),
  ];
}

/** The sound a bullet makes where it struck: the material of the cover, or flesh, or a plate that rings heavier on heavier armour. */
function strikeOf(ev: Extract<GameEvent, { e: 'impact' } | { e: 'dmg' }>, prev: Snapshot | null, next: Snapshot, cover: () => Cover[]): Exclude<SoundId, 'hurt'> | null {
  if (ev.e === 'impact') return `impact:${hostOf(cover(), ev.x, ev.y)?.material ?? 'concrete'}`;
  if (!ev.hit) return null;
  const find = <T extends { id: number }>(of: (s: Snapshot) => readonly T[]) => of(next).find((v) => v.id === ev.victim) ?? (prev && of(prev).find((v) => v.id === ev.victim));
  switch (ev.kind) {
    case 'crate': { const c = find((s) => s.crates); return `impact:${c ? KIT[c.piece].material : 'wood'}`; }
    case 'player': { const tier = find((s) => s.players)?.armorTier ?? 'none'; return tier === 'none' ? 'flesh' : `tink:${tier}`; }
    case 'zombie': return 'flesh';
    case 'building': return null;
  }
}

/** A dropped gun lands this long after its owner falls. */
const CLATTER_MS = 250;

/** The sounds a snapshot's events and changes make. Your own shots are left out: the page voices them as it fires them. */
export function soundsFor(prev: Snapshot | null, next: Snapshot, walls: readonly WallView[] = []): SoundCue[] {
  const me = selfOf(next);
  const at = { x: me?.x ?? 0, y: me?.y ?? 0 };
  const cues: SoundCue[] = [];
  const mine = (id: Exclude<SoundId, 'hurt'>) => cues.push({ id, ...at, self: true, gain: 1 });
  let cover: Cover[] | null = null;
  const once = (id: Exclude<SoundId, 'hurt'>, x: number, y: number, gain = 1, delayMs?: number) => {
    if (!cues.some((c) => c.id === id)) cues.push({ id, x, y, self: false, gain, ...(delayMs !== undefined && { delayMs }) });
  };
  for (const ev of next.events) {
    switch (ev.e) {
      case 'shot':
        if (ev.owner !== next.self.id) cues.push(...shotCues(ev.gun, ev.silenced, ev, false));
        break;
      case 'dmg': {
        const iHitSomeone = (ev.kind === 'player' || ev.kind === 'zombie') && ev.attacker === next.self.id && ev.victim !== next.self.id;
        if (iHitSomeone && !cues.some((c) => c.id === 'hit')) mine('hit');
        break;
      }
      case 'boom': cues.push({ id: 'boom', x: ev.x, y: ev.y, self: false, gain: 1 }); break;
      case 'slash': cues.push({ id: 'slash', x: ev.x, y: ev.y, self: ev.owner === next.self.id, gain: 1 }); break;
      case 'kill': {
        if (ev.killerId === next.self.id && ev.victimId !== next.self.id) mine(ev.bounty ? 'bounty' : ev.knock ? 'knock' : 'kill');
        const body = !ev.knock && (prev?.players.find((p) => p.id === ev.victimId) ?? next.players.find((p) => p.id === ev.victimId));
        if (body) cues.push({ id: 'clatter', x: body.x, y: body.y, self: false, gain: 1, delayMs: CLATTER_MS });
        break;
      }
      case 'whizz':
        if (ev.victim === next.self.id) once('whizz', ev.x, ev.y);
        break;
      case 'zkill':
        if (ev.by === next.self.id) cues.push({ id: 'splat', x: ev.x, y: ev.y, self: true, gain: 1 });
        break;
      case 'turret':
        // A row of sentries fires several rounds a snapshot; one cue per kind keeps it a rattle instead of a roar.
        if (!cues.some((c) => c.id === `turret:${ev.kind}`)) cues.push({ id: `turret:${ev.kind}`, x: ev.x, y: ev.y, self: false, gain: 1 });
        break;
      case 'life':
        if (ev.id === next.self.id && (ev.k === 'downed' || ev.k === 'bledOut' || ev.k === 'finished')) mine(ev.k === 'downed' ? 'downed' : 'death');
        else if ((ev.k === 'revived' && (ev.id === next.self.id || ev.by === next.self.id)) || (ev.k === 'redeployed' && ev.id === next.self.id)) mine('revived');
        else if (ev.k === 'finished' && ev.by === next.self.id) mine('kill');
        break;
    }
  }
  for (const ev of next.events) {
    if (ev.e === 'impact' || (ev.e === 'dmg' && ev.hit)) {
      const id = strikeOf(ev, prev, next, () => (cover ??= coverOf(walls, next)));
      const where = ev.e === 'dmg' && ev.hit ? ev.hit : ev;
      if (id) once(id, where.x, where.y, 0.7);
    }
    if (ev.e !== 'dmg') continue;
    if (ev.kind === 'building' && !cues.some((c) => c.id === 'wallHit')) cues.push({ id: 'wallHit', x: ev.x, y: ev.y, self: false, gain: 1 });
    if (ev.kind === 'player' && ev.victim === next.self.id && ev.attacker === null && next.run && !cues.some((c) => c.id === 'bite')) mine('bite');
  }
  if (!prev) return cues;
  if (ringMoved(prev.royale, next.royale, prev.tick * TICK_MS, next.tick * TICK_MS)) mine('ring');
  const run = next.run, ran = prev.run;
  if (run && ran) {
    if (ran.phase === 'day' && run.phase === 'night') mine('horn');
    if (ran.phase === 'night' && run.phase === 'day') mine('chime');
    if (run.phase !== 'over' && Math.floor(run.core.hp / CORE_HIT_STEP) < Math.floor(ran.core.hp / CORE_HIT_STEP)) cues.push({ id: 'coreHit', ...at, self: true, gain: 0.7 });
    const cells = (b: Snapshot['buildings']) => new Set((b ?? []).map((w) => `${w.cx},${w.cy}`));
    const had = cells(prev.buildings), has = cells(next.buildings);
    const up = (next.buildings ?? []).find((w) => !had.has(`${w.cx},${w.cy}`));
    const down = (prev.buildings ?? []).find((w) => !has.has(`${w.cx},${w.cy}`));
    if (up) cues.push({ id: 'wallUp', x: (up.cx + 0.5) * ZOM.cell, y: (up.cy + 0.5) * ZOM.cell, self: false, gain: 1 });
    if (down && run.phase !== 'over') cues.push({ id: 'wallDown', x: (down.cx + 0.5) * ZOM.cell, y: (down.cy + 0.5) * ZOM.cell, self: false, gain: 1 });
  }
  const was = selfOf(prev);
  if (was?.alive && me?.alive) {
    const damage = was.hp - me.hp;
    if (damage > 0) {
      const damageFrac = Math.min(1, damage / me.maxHp);
      cues.push({ id: 'hurt', ...at, self: true, gain: 0.5 + 0.5 * damageFrac, damageFrac });
    }
    if (GUNS[me.gun].stage > GUNS[was.gun].stage) mine('evolve');
    if (Object.keys(next.self.perks).length > Object.keys(prev.self.perks).length) mine('perk');
  }
  if (me) {
    const share = (v: SelfView) => (v.reloading ? v.reloadFrac : undefined);
    for (const cue of reloadBeats(me.gun, share(prev.self), share(next.self), next.self.alive)) cues.push(handling(me.gun, cue, at, true));
  }
  for (const p of next.players) {
    if (p.id === next.self.id) continue;
    const was = prev.players.find((q) => q.id === p.id);
    if (was) for (const cue of reloadBeats(p.gun, was.reload, p.reload, p.alive)) cues.push(handling(p.gun, cue, p, false));
  }
  if (next.self.pending !== null && next.self.pending.level !== prev.self.pending?.level) mine('levelup');
  if (!next.self.alive && prev.self.alive && !me?.downed) mine('death');
  return cues;
}
