import { PRESS_GRACE_MS, type GunDef } from '../defs.ts';
import type { InputState } from '../protocol.ts';
import type { Life } from './world.ts';

export type TriggerState = Pick<Extract<Life, { k: 'alive' }>, 'ammo' | 'reloadUntil' | 'nextFireAt' | 'burstLeft' | 'pressUntil'>;
export type HeldGun = { def: GunDef; mag: number; armed: boolean };
export type Pull = Pick<InputState, 'fire' | 'reload'> & { pressed: boolean };

/** Whether `shots` counts a press the trigger has not seen yet, and marks it seen. */
export function consumePresses(seen: { shotsSeen: number }, shots: number): boolean {
  const pressed = shots > seen.shotsSeen;
  seen.shotsSeen = Math.max(seen.shotsSeen, shots);
  return pressed;
}

/**
 * One tick of a living player's trigger at `now`: reloads, holds a press through the cooldown, and fires when it can.
 * Steps `s` in place and returns whether a shot went off. The sim and the client's prediction both run it.
 */
export function pullTrigger(s: TriggerState, gun: HeldGun, pull: Pull, now: number, tickMs: number): boolean {
  const { def } = gun;
  if (s.reloadUntil !== null && now >= s.reloadUntil) { s.ammo = gun.mag; s.reloadUntil = null; }
  if (s.reloadUntil === null && (s.ammo <= 0 || (pull.reload && s.ammo < gun.mag))) {
    s.reloadUntil = now + def.reloadMs;
    s.burstLeft = 0;
  }
  // After the reload check, so a press that lands as the reload starts waits for it rather than expiring under it.
  if (pull.pressed) {
    const cooledAt = s.burstLeft > 0 && def.burst ? s.nextFireAt + (s.burstLeft - 1) * def.burst.gapMs + def.fireMs : s.nextFireAt;
    s.pressUntil = Math.max(now, cooledAt, s.reloadUntil ?? 0) + PRESS_GRACE_MS;
  }
  const bursting = s.burstLeft > 0;
  const wantsShot = bursting || now <= s.pressUntil || (def.auto && pull.fire);
  if (!gun.armed || !wantsShot || s.reloadUntil !== null || s.ammo <= 0 || now < s.nextFireAt) return false;
  if (!bursting) {
    s.pressUntil = -Infinity;
    s.burstLeft = def.burst?.count ?? 1;
  }
  s.ammo--;
  s.burstLeft = s.ammo > 0 ? s.burstLeft - 1 : 0;
  // Carry the part of the interval that fell between ticks, so a held trigger keeps the gun's rate rather than the tick's.
  const from = now - s.nextFireAt < tickMs ? s.nextFireAt : now;
  s.nextFireAt = from + (s.burstLeft > 0 && def.burst ? def.burst.gapMs : def.fireMs);
  return true;
}
