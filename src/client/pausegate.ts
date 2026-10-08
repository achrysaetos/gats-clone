/**
 * The two rules the pause menu (pausemenu.ts) adds to the game loop, kept free of the DOM so they are unit-tested:
 * when your soldier takes input, and what the Escape key does when several things could use it.
 */

/** Your soldier takes keys, mouse and sticks only while it is playing, no chat line is open and the pause menu is closed. */
export const takesInput = (phase: string, typing: boolean, paused: boolean): boolean => phase === 'playing' && !typing && !paused;

export type EscapeContext = {
  /** In a match (playing or dead). Escape does nothing in the menu: the menu's own handler owns it there. */
  inMatch: boolean;
  typing: boolean;
  pauseOpen: boolean;
  /** The pause menu is asking whether to leave. */
  confirming: boolean;
  /** The emote wheel is held open. */
  wheelOpen: boolean;
  /** The shooting range's loadout panel (L) is open. */
  rangeOpen: boolean;
  /** Zombies build mode (B) is on. */
  building: boolean;
};

export type EscapeAction = 'none' | 'close-chat' | 'cancel-leave' | 'close-pause' | 'close-wheel' | 'close-range' | 'exit-build' | 'open-pause';

/**
 * Escape closes the innermost thing first: a chat line, then the leave question, then the pause menu itself; with nothing of
 * the pause menu up, the emote wheel, then the range loadout panel, then build mode; and only with none of those open, it opens
 * the pause menu.
 */
export function escapeAction(c: EscapeContext): EscapeAction {
  if (!c.inMatch) return 'none';
  if (c.typing) return 'close-chat';
  if (c.pauseOpen) return c.confirming ? 'cancel-leave' : 'close-pause';
  if (c.wheelOpen) return 'close-wheel';
  if (c.rangeOpen) return 'close-range';
  if (c.building) return 'exit-build';
  return 'open-pause';
}

/** A gamepad's buttons and stick as one step of menu navigation. */
export type PadIntent = 'up' | 'down' | 'left' | 'right' | 'accept' | 'back' | 'start' | null;

export type PadSample = { buttons: readonly boolean[]; x: number; y: number };

const STICK = 0.55;
/** Standard mapping: 0 A, 1 B, 9 Start, 12..15 the d-pad. */
export const PAD_BUTTONS = { accept: 0, back: 1, start: 9, up: 12, down: 13, left: 14, right: 15 } as const;

/** The one thing a pad asks for on this poll: only a fresh press (or the stick pushed past its threshold) counts, so holding repeats nothing. */
export function padIntent(prev: PadSample | null, now: PadSample): PadIntent {
  const fresh = (i: number) => !!now.buttons[i] && !prev?.buttons[i];
  if (fresh(PAD_BUTTONS.start)) return 'start';
  if (fresh(PAD_BUTTONS.back)) return 'back';
  if (fresh(PAD_BUTTONS.accept)) return 'accept';
  for (const dir of ['up', 'down', 'left', 'right'] as const) if (fresh(PAD_BUTTONS[dir])) return dir;
  const was = prev ?? { buttons: [], x: 0, y: 0 };
  if (Math.abs(now.y) > STICK && Math.abs(was.y) <= STICK) return now.y < 0 ? 'up' : 'down';
  if (Math.abs(now.x) > STICK && Math.abs(was.x) <= STICK) return now.x < 0 ? 'left' : 'right';
  return null;
}
