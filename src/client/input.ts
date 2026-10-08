import type { InputState } from '../shared/protocol.ts';

export type Action = 'up' | 'down' | 'left' | 'right' | 'reload' | 'ability' | 'use' | 'sprint';

/** KeyboardEvent.code -> held action. Layout-independent so WASD stays in place on AZERTY. */
const KEY_BINDINGS: Readonly<Record<string, Action>> = {
  KeyW: 'up', ArrowUp: 'up',
  KeyS: 'down', ArrowDown: 'down',
  KeyA: 'left', ArrowLeft: 'left',
  KeyD: 'right', ArrowRight: 'right',
  KeyR: 'reload',
  Space: 'ability',
  KeyE: 'use',
  ShiftLeft: 'sprint', ShiftRight: 'sprint',
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
  ['Shift', 'Hold to sprint, about 35% faster; the gun is lowered, so a click ends the sprint, and your aim takes about 2s to settle (touch: push the move stick out to its outer ring)'],
  ['Mouse', 'Aim'],
  ['Left click', 'Fire'],
  ['R', 'Reload'],
  ['Space', 'Ability'],
  ['1-9, 0', 'Pick perk or evolution'],
  ['B', 'Zombies: build by day; 1-9 pick (1 again, Q or the wheel steps wall tiers), right click takes down'],
  ['U', 'Zombies: upgrade the wall, turret or utility under the cursor (or nearest, outside build mode)'],
  ['E', 'Zombies: hold to revive, repair or reload; beside a radio, press to change its station'],
  ['L', 'Shooting range: open the loadout panel (any gun, evolution, armor and perk)'],
  ['Tab', 'Hold for the whole leaderboard'],
  ['Enter', 'Chat'],
  ['T', 'Hold for the emote wheel, flick toward a plate, let go'],
  ['M', 'Mute sound'],
  ['Shift+M', 'Music on or off'],
  ['C', 'Soldier chatter on or off'],
  ['Esc', 'Pause menu: volume, graphics, gameplay options, controls, leave the match (the match keeps running)'],
  ['Touch', 'Left thumb moves, right thumb aims and fires'],
];

/** Notes for the Controls page on a phone, where there are no keys. */
export const TOUCH_NOTES: readonly string[] = [
  'Left thumb moves; push the stick out to its outer ring to sprint.',
  'Right thumb aims and fires while it is held.',
  'Reload and the ability have their own buttons; GG opens the emote wheel, then tap a plate.',
  'The cog in the top corner opens this menu.',
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
    use: held.has('use'),
    sprint: held.has('sprint'),
  };
}
