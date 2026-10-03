import type { ModeId, PerkId } from '../src/shared/defs.ts';
import type { InputState, Loadout, Team } from '../src/shared/protocol.ts';
import { addPlayer, choosePerk, createWorld, IDLE_INPUT, pendingTier, setInput, step, type Player, type World } from '../src/shared/sim.ts';

export const TICK_MS = 1000 / 30;
export const PISTOL: Loadout = { weapon: 'pistol', armor: 'none', color: 'red' };

/** A world with no seeded walls or crates so tests place every obstacle themselves. */
export function emptyWorld(mode: ModeId = 'FFA'): World {
  const w = createWorld(mode, 1);
  w.walls = [];
  w.crates = [];
  return w;
}

export function spawnAt(w: World, x: number, y: number, opts: { loadout?: Partial<Loadout>; team?: Team; name?: string } = {}): Player {
  return addPlayer(w, opts.name ?? `p${w.nextId}`, { ...PISTOL, ...opts.loadout }, { at: { x, y }, team: opts.team });
}

let seq = 1;
export function press(w: World, p: Player, input: Partial<InputState>) {
  setInput(w, p.id, seq++, { ...IDLE_INPUT, angle: p.input.angle, ...input });
}

export function run(w: World, ms: number) {
  for (let t = 0; t < ms; t += TICK_MS) step(w, TICK_MS);
}

/** Fire exactly one trigger pull along `angle`, then let bullets fly for `ms`. */
export function shootOnce(w: World, p: Player, angle: number, ms = 500) {
  press(w, p, { angle, fire: true });
  step(w, TICK_MS);
  press(w, p, { angle });
  run(w, ms);
}

/** Unlock tiers by level and choose the given perks in tier order. */
export function grantPerks(w: World, p: Player, perks: PerkId[]) {
  p.level = 3;
  for (const perk of perks) {
    const tier = pendingTier(p);
    if (!tier || !choosePerk(w, p.id, tier, perk)) throw new Error(`could not choose ${perk}`);
  }
}

export function hpOf(p: Player): number {
  return p.life.k === 'alive' ? p.life.hp : 0;
}

/** Shoot along `angle` until `victim` dies, waiting out reloads. */
export function shootUntilDead(w: World, shooter: Player, victim: Player, angle = 0) {
  for (let i = 0; i < 40 && victim.life.k === 'alive'; i++) shootOnce(w, shooter, angle, 300);
  if (victim.life.k === 'alive') throw new Error('victim survived');
}
