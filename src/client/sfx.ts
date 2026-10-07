import { EVOLUTIONS, GUN_IDS, GUNS, ZOM, type GunId, type TurretKind, type WeaponId } from '../shared/defs.ts';
import type { Snapshot } from '../shared/protocol.ts';
import { selfOf } from './derive.ts';
import { TICK_MS } from './interp.ts';
import { ringMoved } from './royale.ts';

export type SoundId =
  | `shot:${GunId}` | 'shot:silenced'
  | 'hit' | 'hurt' | 'boom' | 'slash' | 'kill' | 'bounty' | 'death' | 'reload' | 'levelup' | 'evolve' | 'perk' | 'click'
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

const retune = (layer: Layer, k: number, stage: number): Layer => {
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
  kill: [note(880, 0), note(1320, 70, 160)],
  death: [{ src: 'tone', wave: 'sawtooth', pitchHz: [440, 55], ms: 900, gain: 0.35 }, { src: 'noise', filter: 'lowpass', q: 1, cutoffHz: [900, 80], ms: 600, gain: 0.3 }],
  reload: [{ src: 'noise', filter: 'highpass', q: 1, cutoffHz: [3000, 3000], ms: 40, gain: 0.25 }, { src: 'noise', filter: 'highpass', q: 1, cutoffHz: [2200, 2200], ms: 50, gain: 0.25, delayMs: 110 }],
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
  'pistol', 'smg', 'shotgun', 'assault', 'sniper', 'lmg', 'silenced', 'launcher', 'reload',
  'hit', 'hurt', 'boom', 'slash', 'kill', 'bounty', 'levelup', 'evolve', 'perk', 'click',
  'bite', 'splat', 'wallHit', 'wallUp', 'wallDown', 'coreHit', 'horn', 'chime', 'revived', 'knock', 'ring', 'cannon', 'mortar',
] as const;
export type SampleId = (typeof SAMPLE_IDS)[number];
export type SampleLayer = { sample: SampleId; rate: number; gain: number };

const layer = (sample: SampleId, rate = 1, gain = 1): SampleLayer => ({ sample, rate, gain });

/** A blast gun keeps its class's report and adds the launcher's thump, the way its synth recipe adds a low thump. */
function shotLayers(gun: GunId): SampleLayer[] {
  const g = GUNS[gun];
  const shot = layer(g.base, pitchOf(gun));
  return g.blast ? [shot, layer('launcher', 1, 0.8)] : [shot];
}

function shotSamples(): Record<`shot:${GunId}`, readonly SampleLayer[]> {
  const out: Partial<Record<`shot:${GunId}`, readonly SampleLayer[]>> = {};
  for (const id of GUN_IDS) out[`shot:${id}`] = shotLayers(id);
  return out as Record<`shot:${GunId}`, readonly SampleLayer[]>;
}

export const SAMPLES: Record<SoundId, readonly SampleLayer[]> = {
  ...shotSamples(),
  'shot:silenced': [layer('silenced')],
  hit: [layer('hit')],
  hurt: [layer('hurt')],
  boom: [layer('boom')],
  slash: [layer('slash')],
  kill: [layer('kill')],
  bounty: [layer('kill'), layer('bounty')],
  death: [layer('hurt', 0.6)],
  reload: [layer('reload')],
  levelup: [layer('levelup')],
  evolve: [layer('evolve')],
  perk: [layer('perk')],
  click: [layer('click')],
  bite: [layer('bite')],
  splat: [layer('splat')],
  wallHit: [layer('wallHit')],
  wallUp: [layer('wallUp')],
  wallDown: [layer('wallDown')],
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

const AUDIBLE_RADII = 1.2;

/** How loud and where in the stereo field a cue lands for a listener, or null when it is out of earshot. */
export function placeCue(cue: SoundCue, listener: { x: number; y: number }, viewRadius: number): { gain: number; pan: number } | null {
  if (cue.self) return { gain: cue.gain, pan: 0 };
  const dx = cue.x - listener.x;
  const falloff = Math.max(0, 1 - Math.hypot(dx, cue.y - listener.y) / (viewRadius * AUDIBLE_RADII)) ** 2;
  if (falloff <= 0) return null;
  return { gain: falloff * cue.gain, pan: Math.max(-1, Math.min(1, dx / viewRadius)) * 0.8 };
}

/** Each 100 hp the core loses sounds once, so a crowd chewing on it reads as a steady alarm rather than a buzz. */
const CORE_HIT_STEP = 100;

export type SoundCue = { x: number; y: number; self: boolean; gain: number }
  & ({ id: 'hurt'; damageFrac: number } | { id: Exclude<SoundId, 'hurt'> });

export const shotCue = (gun: GunId, silenced: boolean, at: { x: number; y: number }, self: boolean): SoundCue =>
  ({ id: silenced ? 'shot:silenced' : `shot:${gun}`, x: at.x, y: at.y, self, gain: 1 });

/** The sounds a snapshot's events and changes make. Your own shots are left out: the page voices them as it fires them. */
export function soundsFor(prev: Snapshot | null, next: Snapshot): SoundCue[] {
  const me = selfOf(next);
  const at = { x: me?.x ?? 0, y: me?.y ?? 0 };
  const cues: SoundCue[] = [];
  const mine = (id: Exclude<SoundId, 'hurt'>) => cues.push({ id, ...at, self: true, gain: 1 });
  for (const ev of next.events) {
    switch (ev.e) {
      case 'shot':
        if (ev.owner !== next.self.id) cues.push(shotCue(ev.gun, ev.silenced, ev, false));
        break;
      case 'dmg': {
        const iHitSomeone = (ev.kind === 'player' || ev.kind === 'zombie') && ev.attacker === next.self.id && ev.victim !== next.self.id;
        if (iHitSomeone && !cues.some((c) => c.id === 'hit')) mine('hit');
        break;
      }
      case 'boom': cues.push({ id: 'boom', x: ev.x, y: ev.y, self: false, gain: 1 }); break;
      case 'slash': cues.push({ id: 'slash', x: ev.x, y: ev.y, self: ev.owner === next.self.id, gain: 1 }); break;
      case 'kill':
        if (ev.killerId === next.self.id && ev.victimId !== next.self.id) mine(ev.bounty ? 'bounty' : ev.knock ? 'knock' : 'kill');
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
  if (next.self.reloading && !prev.self.reloading) mine('reload');
  if (next.self.pending !== null && next.self.pending.level !== prev.self.pending?.level) mine('levelup');
  if (!next.self.alive && prev.self.alive && !me?.downed) mine('death');
  return cues;
}
