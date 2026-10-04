import { EVOLUTIONS, GUN_IDS, GUNS, type GunId, type WeaponId } from '../shared/defs.ts';
import type { Snapshot } from '../shared/protocol.ts';
import { selfOf } from './derive.ts';

export type SoundId =
  | `shot:${GunId}` | 'shot:silenced'
  | 'hit' | 'hurt' | 'boom' | 'slash' | 'kill' | 'death' | 'reload' | 'levelup' | 'click';

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

/** Each evolution down the first branch drops the pitch and down the second raises it, so every gun on the tree sounds its own. */
const BRANCH_PITCH = [0.84, 1.18] as const;

function pitchOf(gun: GunId): number {
  const from = GUNS[gun].from;
  if (!from) return 1;
  return pitchOf(from) * (BRANCH_PITCH[EVOLUTIONS[from].indexOf(gun)] ?? 1);
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
  click: [{ src: 'tone', wave: 'square', pitchHz: [1800, 1800], ms: 18, gain: 0.15 }],
};

export type SoundCue = { x: number; y: number; self: boolean; gain: number }
  & ({ id: 'hurt'; damageFrac: number } | { id: Exclude<SoundId, 'hurt'> });

export function soundsFor(prev: Snapshot | null, next: Snapshot): SoundCue[] {
  const me = selfOf(next);
  const at = { x: me?.x ?? 0, y: me?.y ?? 0 };
  const cues: SoundCue[] = [];
  const mine = (id: Exclude<SoundId, 'hurt'>) => cues.push({ id, ...at, self: true, gain: 1 });
  for (const ev of next.events) {
    switch (ev.e) {
      case 'shot':
        cues.push({ id: ev.silenced ? 'shot:silenced' : `shot:${ev.gun}`, x: ev.x, y: ev.y, self: ev.owner === next.self.id, gain: 1 });
        break;
      case 'dmg': {
        const iHitSomeone = ev.kind === 'player' && ev.attacker === next.self.id && ev.victim !== next.self.id;
        if (iHitSomeone && !cues.some((c) => c.id === 'hit')) mine('hit');
        break;
      }
      case 'boom': cues.push({ id: 'boom', x: ev.x, y: ev.y, self: false, gain: 1 }); break;
      case 'slash': cues.push({ id: 'slash', x: ev.x, y: ev.y, self: ev.owner === next.self.id, gain: 1 }); break;
      case 'kill': if (ev.killerId === next.self.id && ev.victimId !== next.self.id) mine('kill'); break;
    }
  }
  if (!prev) return cues;
  const was = selfOf(prev);
  if (was?.alive && me?.alive) {
    const damage = was.hp + was.armor - (me.hp + me.armor);
    if (damage > 0) {
      const damageFrac = Math.min(1, damage / me.maxHp);
      cues.push({ id: 'hurt', ...at, self: true, gain: 0.5 + 0.5 * damageFrac, damageFrac });
    }
  }
  if (next.self.reloading && !prev.self.reloading) mine('reload');
  if (next.self.pending !== null && next.self.pending.level !== prev.self.pending?.level) mine('levelup');
  if (!next.self.alive && prev.self.alive) mine('death');
  return cues;
}
