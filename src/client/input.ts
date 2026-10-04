import type { InputState } from '../shared/protocol.ts';

export type Action = 'up' | 'down' | 'left' | 'right' | 'reload' | 'ability';

/** KeyboardEvent.code -> held action. Layout-independent so WASD stays in place on AZERTY. */
const KEY_BINDINGS: Readonly<Record<string, Action>> = {
  KeyW: 'up', ArrowUp: 'up',
  KeyS: 'down', ArrowDown: 'down',
  KeyA: 'left', ArrowLeft: 'left',
  KeyD: 'right', ArrowRight: 'right',
  KeyR: 'reload',
  Space: 'ability',
};

export const actionForKey = (code: string): Action | null => (Object.hasOwn(KEY_BINDINGS, code) ? KEY_BINDINGS[code]! : null);

const PERK_KEYS = ['Digit1', 'Digit2', 'Digit3', 'Digit4', 'Digit5', 'Digit6', 'Digit7', 'Digit8', 'Digit9', 'Digit0'] as const;

export const perkSlotForKey = (code: string): number | null => {
  const i = (PERK_KEYS as readonly string[]).indexOf(code);
  return i < 0 ? null : i;
};

export const perkKeyLabel = (slot: number) => PERK_KEYS[slot]?.slice(5) ?? '';

export const CONTROLS: readonly [string, string][] = [
  ['WASD', 'Move'],
  ['Mouse', 'Aim'],
  ['Left click', 'Fire'],
  ['R', 'Reload'],
  ['Space', 'Ability'],
  ['1-9, 0', 'Pick perk or evolution'],
  ['Enter', 'Chat'],
  ['M', 'Mute sound'],
  ['Touch', 'Left thumb moves, right thumb aims and fires'],
];

export const MAX_AIM_DIST = 2000;

export function assembleInput(held: ReadonlySet<Action>, firing: boolean, shots: number, aimWorldOffset: { dx: number; dy: number }): InputState {
  return {
    up: held.has('up'),
    down: held.has('down'),
    left: held.has('left'),
    right: held.has('right'),
    angle: Math.atan2(aimWorldOffset.dy, aimWorldOffset.dx),
    aimDist: Math.min(MAX_AIM_DIST, Math.hypot(aimWorldOffset.dx, aimWorldOffset.dy)),
    fire: firing,
    shots,
    reload: held.has('reload'),
    ability: held.has('ability'),
  };
}
