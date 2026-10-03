import type { WeaponId } from '../shared/defs.ts';
import type { Snapshot } from '../shared/protocol.ts';
import { isDead, selfOf } from './derive.ts';

export type SoundId =
  | `shot:${WeaponId}` | 'shot:silenced'
  | 'hit' | 'hurt' | 'boom' | 'kill' | 'death' | 'reload' | 'levelup' | 'click';

type Wave = 'sine' | 'square' | 'sawtooth' | 'triangle';
type Timing = { ms: number; gain: number; delayMs?: number };
export type Layer =
  | ({ src: 'tone'; wave: Wave; hz: readonly [number, number] } & Timing)
  | ({ src: 'noise'; filter: 'lowpass' | 'highpass' | 'bandpass'; q: number; hz: readonly [number, number] } & Timing);
export type Recipe = readonly Layer[];

const crack = (hz: number, ms: number, gain: number): Layer => ({ src: 'noise', filter: 'bandpass', q: 0.9, hz: [hz, hz * 0.4], ms, gain });
const thump = (hz: number, ms: number, gain: number): Layer => ({ src: 'tone', wave: 'triangle', hz: [hz, hz * 0.35], ms, gain });
const note = (hz: number, delayMs: number, ms = 110, gain = 0.25): Layer => ({ src: 'tone', wave: 'square', hz: [hz, hz], ms, gain, delayMs });

export const SOUNDS: Record<SoundId, Recipe> = {
  'shot:pistol': [crack(2600, 70, 0.5), thump(260, 60, 0.35)],
  'shot:smg': [crack(3200, 45, 0.4), thump(320, 40, 0.25)],
  'shot:shotgun': [crack(1400, 180, 0.7), thump(140, 160, 0.6)],
  'shot:assault': [crack(2200, 80, 0.5), thump(200, 70, 0.4)],
  'shot:sniper': [crack(1800, 260, 0.75), thump(110, 240, 0.6), { src: 'tone', wave: 'sawtooth', hz: [900, 300], ms: 90, gain: 0.15 }],
  'shot:lmg': [crack(1900, 70, 0.45), thump(170, 70, 0.4)],
  'shot:silenced': [{ src: 'noise', filter: 'lowpass', q: 1, hz: [1200, 300], ms: 60, gain: 0.35 }],
  hit: [{ src: 'tone', wave: 'square', hz: [900, 500], ms: 45, gain: 0.18 }, crack(4000, 30, 0.2)],
  hurt: [{ src: 'tone', wave: 'sawtooth', hz: [220, 90], ms: 140, gain: 0.3 }, { src: 'noise', filter: 'lowpass', q: 1, hz: [800, 200], ms: 120, gain: 0.3 }],
  boom: [{ src: 'noise', filter: 'lowpass', q: 0.7, hz: [1600, 60], ms: 700, gain: 0.9 }, thump(90, 500, 0.8)],
  kill: [note(880, 0), note(1320, 70, 160)],
  death: [{ src: 'tone', wave: 'sawtooth', hz: [440, 55], ms: 900, gain: 0.35 }, { src: 'noise', filter: 'lowpass', q: 1, hz: [900, 80], ms: 600, gain: 0.3 }],
  reload: [{ src: 'noise', filter: 'highpass', q: 1, hz: [3000, 3000], ms: 40, gain: 0.25 }, { src: 'noise', filter: 'highpass', q: 1, hz: [2200, 2200], ms: 50, gain: 0.25, delayMs: 110 }],
  levelup: [note(523, 0, 120, 0.2), note(659, 90, 120, 0.2), note(784, 180, 260, 0.22)],
  click: [{ src: 'tone', wave: 'square', hz: [1800, 1800], ms: 18, gain: 0.15 }],
};

export type SoundCue = { id: SoundId; x: number; y: number; self: boolean; strength: number };

export function soundsFor(prev: Snapshot | null, next: Snapshot): SoundCue[] {
  const me = selfOf(next);
  const at = { x: me?.x ?? 0, y: me?.y ?? 0 };
  const cues: SoundCue[] = [];
  const mine = (id: SoundId, strength = 1) => cues.push({ id, ...at, self: true, strength });
  for (const ev of next.events) {
    switch (ev.e) {
      case 'shot': {
        const weapon = next.players.find((p) => p.id === ev.owner)?.weapon ?? 'pistol';
        cues.push({ id: ev.silenced ? 'shot:silenced' : `shot:${weapon}`, x: ev.x, y: ev.y, self: ev.owner === next.self.id, strength: 1 });
        break;
      }
      case 'dmg': {
        const iHitSomeone = ev.kind === 'player' && ev.attacker === next.self.id && ev.victim !== next.self.id;
        if (iHitSomeone && !cues.some((c) => c.id === 'hit')) mine('hit');
        break;
      }
      case 'boom': cues.push({ id: 'boom', x: ev.x, y: ev.y, self: false, strength: 1 }); break;
      case 'kill': if (ev.killerId === next.self.id && ev.victimId !== next.self.id) mine('kill'); break;
    }
  }
  if (!prev) return cues;
  const was = selfOf(prev);
  if (was?.alive && me?.alive) {
    const damage = was.hp + was.armor - (me.hp + me.armor);
    if (damage > 0) mine('hurt', Math.min(1, damage / me.maxHp));
  }
  if (next.self.reloading && !prev.self.reloading) mine('reload');
  if (next.self.pendingTier !== null && next.self.pendingTier !== prev.self.pendingTier) mine('levelup');
  if (isDead(next) && !isDead(prev)) mine('death');
  return cues;
}
