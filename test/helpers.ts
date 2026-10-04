import type { ModeId, PerkId } from '../src/shared/defs.ts';
import type { InputState, Loadout, Team } from '../src/shared/protocol.ts';
import { addPlayer, setInput, step } from '../src/shared/sim.ts';
import { choosePerk, pendingTier } from '../src/shared/sim/stats.ts';
import { createWorld, IDLE_INPUT, type Player, type World } from '../src/shared/sim/world.ts';

export const TICK_MS = 1000 / 30;
export const PISTOL: Loadout = { weapon: 'pistol', armor: 'none', color: 'red' };

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
  setInput(w, p.id, seq++, { ...IDLE_INPUT, angle: p.input.angle, shots: p.input.shots, ...input });
}

export function run(w: World, ms: number) {
  for (let t = 0; t < ms; t += TICK_MS) step(w, TICK_MS);
}

export function shootOnce(w: World, p: Player, angle: number, ms = 500) {
  press(w, p, { angle, fire: true, shots: p.input.shots + 1 });
  step(w, TICK_MS);
  press(w, p, { angle });
  run(w, ms);
}

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

export function shootUntilDead(w: World, shooter: Player, victim: Player, angle = 0) {
  for (let i = 0; i < 40 && victim.life.k === 'alive'; i++) shootOnce(w, shooter, angle, 300);
  if (victim.life.k === 'alive') throw new Error('victim survived');
}
