import { GUNS, type WeaponId } from '../shared/defs.ts';
import type { Snapshot } from '../shared/protocol.ts';
import { selfOf } from './derive.ts';

export type SoundId =
  | `shot:${WeaponId}` | 'shot:silenced'
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

export const SOUNDS: Record<SoundId, Recipe> = {
  'shot:pistol': [crack(2600, 70, 0.5), thump(260, 60, 0.35)],
  'shot:smg': [crack(3200, 45, 0.4), thump(320, 40, 0.25)],
  'shot:shotgun': [crack(1400, 180, 0.7), thump(140, 160, 0.6)],
  'shot:assault': [crack(2200, 80, 0.5), thump(200, 70, 0.4)],
  'shot:sniper': [crack(1800, 260, 0.75), thump(110, 240, 0.6), { src: 'tone', wave: 'sawtooth', pitchHz: [900, 300], ms: 90, gain: 0.15 }],
  'shot:lmg': [crack(1900, 70, 0.45), thump(170, 70, 0.4)],
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
      case 'shot': {
        const weapon = GUNS[ev.gun].base;
        cues.push({ id: ev.silenced ? 'shot:silenced' : `shot:${weapon}`, x: ev.x, y: ev.y, self: ev.owner === next.self.id, gain: 1 });
        break;
      }
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
