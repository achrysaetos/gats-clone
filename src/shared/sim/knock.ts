import { GUNS, KNOCK, rulesOf, type GunId, type ZombieKind } from '../defs.ts';
import { addKnock } from './movement.ts';
import { hasPerk, PERK_RULES } from './stats.ts';
import type { Player, Zombie } from './world.ts';

/** px/s a round of `damage` shoves its victim, before armor or weight; a gun's class sets how hard each point shoves. */
export const bulletShove = (gun: GunId, damage: number): number => damage * KNOCK.perDamage[GUNS[gun].base] * rulesOf(GUNS[gun]).shoveMul;

/** px/s a blast of `damage` shoves, before armor or weight. */
export const blastShove = (damage: number): number => damage * KNOCK.blastPerDamage;

/** The most one hit may leave a body moving at: blasts shove farther than rounds. */
export const shoveCap = (blast: boolean): number => (blast ? KNOCK.blastCap : KNOCK.cap);

/** Shoves a living player along (dirX, dirY); a downed player is on the ground and a dead one gone, so neither moves. */
export function shovePlayer(victim: Player, dirX: number, dirY: number, mag: number, blast: boolean): void {
  const life = victim.life;
  if (life.k !== 'alive' || mag <= 0) return;
  const m = mag * KNOCK.armor[victim.loadout.armor] * (hasPerk(victim, 'brace') ? PERK_RULES.brace.takenMul : 1);
  life.knock = addKnock(life.knock, dirX, dirY, m, shoveCap(blast));
}

/** Shoves a zombie by its kind's weight; brutes and the colossus take nothing. */
export function shoveZombie(z: Zombie, dirX: number, dirY: number, mag: number, blast: boolean): void {
  const weight = KNOCK.zombie[z.kind as ZombieKind];
  if (weight <= 0 || z.hp <= 0 || mag <= 0) return;
  z.knock = addKnock(z.knock, dirX, dirY, mag * weight, shoveCap(blast));
}

/**
 * For any other source of a shove (a prop's blast, a rocket): pushes `player` along (dirX, dirY) at `strength` px/s, through the same
 * armor resistance and cap as a blast. The world is taken so callers read like the rest of the sim; the shove itself is state on the player's life.
 */
export function applyKnock(_w: unknown, player: Player, dirX: number, dirY: number, strength: number): void {
  shovePlayer(player, dirX, dirY, strength, true);
}
