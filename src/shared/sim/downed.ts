import { ZOM } from '../defs.ts';
import { dist2 } from './movement.ts';
import { freshLife } from './stats.ts';
import { sameTeam, type Player, type World } from './world.ts';

export function goDown(w: World, p: Player, hp = 0) {
  p.life = { k: 'downed', bleedOutAt: w.now + ZOM.bleedOutMs, reviveProgress: 0, hp };
  w.events.push({ e: 'life', id: p.id, name: p.name, k: 'downed', by: null });
}

/**
 * A squadmate standing within `ZOM.reviveRange` and holding use raises a downed player after `ZOM.reviveMs`; letting go starts it over.
 * Returns the reviver once they finish, or 'bledOut' once time runs out, which the mode turns into a death of its own kind.
 */
export function tickDowned(w: World, p: Player, dtMs: number, revivers: Set<Player>): Player | 'bledOut' | null {
  const life = p.life;
  if (life.k !== 'downed') return null;
  if (w.now >= life.bleedOutAt) {
    w.events.push({ e: 'life', id: p.id, name: p.name, k: 'bledOut', by: null });
    return 'bledOut';
  }
  const reviver = [...w.players.values()].find((o) => o.life.k === 'alive' && o.input.use && sameTeam(o, p) && dist2(o.x, o.y, p.x, p.y) <= ZOM.reviveRange ** 2);
  if (!reviver) { life.reviveProgress = 0; return null; }
  revivers.add(reviver);
  life.reviveProgress += dtMs;
  if (life.reviveProgress < ZOM.reviveMs) return null;
  const revived = freshLife(p, w.now);
  revived.hp *= ZOM.reviveHpFrac;
  revived.lastDamageAt = w.now;
  revived.shieldUntil = -Infinity;
  p.life = revived;
  w.events.push({ e: 'life', id: p.id, name: p.name, k: 'revived', by: reviver.id });
  return reviver;
}
