import type { ModeId } from '../shared/defs.ts';
import type { ClientMsg } from '../shared/protocol.ts';
import { resetRange, setRangeLoadout, validLoadout } from '../shared/sim/targets.ts';
import type { World } from '../shared/sim/world.ts';

/** The rooms that are one player's own practice, where nothing counts toward an account, a profile, XP or a medal. */
export const isPractice = (mode: ModeId): boolean => mode === 'RNG';

/**
 * A `range` message from a player: a loadout to put on at once, or a reset of the readout and the targets. Only a Range room
 * takes one, whatever a client sends; any other room answers with the reason. Returns that reason, or null when it was applied.
 */
export function applyRangeMsg(w: World, playerId: number, msg: Extract<ClientMsg, { t: 'range' }>): string | null {
  const p = w.players.get(playerId);
  if (w.mode !== 'RNG' || !w.range) return 'That only works on the shooting range';
  if (!p || p.life.k !== 'alive') return null;
  if (msg.a === 'reset') {
    resetRange(w, playerId);
    return null;
  }
  const { a: _a, t: _t, ...loadout } = msg;
  return validLoadout(loadout) && setRangeLoadout(w, p, loadout) ? null : 'That loadout is not allowed';
}
