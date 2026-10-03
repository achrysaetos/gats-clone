import { ARMOR_IDS, COLOR_IDS, PERK_TIERS, WEAPON_IDS, WEAPONS, WORLD, type PerkId, type Tier } from '../shared/defs.ts';
import type { InputState, Loadout, PlayerView, Snapshot } from '../shared/protocol.ts';

export type BotMemory = { targetX: number; targetY: number; lastX: number; lastY: number; stuckTicks: number };

export type BotDecision = { input: InputState; perk: { tier: Tier; perk: PerkId } | null; mem: BotMemory };

const pick = <T>(xs: readonly T[], rand: () => number): T => xs[Math.floor(rand() * xs.length)];

export function newBotMemory(rand: () => number): BotMemory {
  return { targetX: rand() * WORLD.size, targetY: rand() * WORLD.size, lastX: 0, lastY: 0, stuckTicks: 0 };
}

export function randomLoadout(rand: () => number): Loadout {
  return { weapon: pick(WEAPON_IDS, rand), armor: pick(ARMOR_IDS, rand), color: pick(COLOR_IDS, rand) };
}

/** Pure: the bot sees only what a client would see (its own snapshot). */
export function botThink(snap: Snapshot, mem: BotMemory, rand: () => number): BotDecision {
  const me = snap.players.find((p) => p.id === snap.self.id);
  const tier = snap.self.pendingTier;
  const perk = tier ? { tier, perk: pick<PerkId>(PERK_TIERS[tier], rand) } : null;
  if (!me || !me.alive) {
    return { input: { up: false, down: false, left: false, right: false, angle: 0, fire: false, reload: false, ability: false, aimDist: 0 }, perk, mem };
  }

  let next = { ...mem };
  const moved = Math.hypot(me.x - mem.lastX, me.y - mem.lastY);
  next.stuckTicks = moved < 1 ? mem.stuckTicks + 1 : 0;
  const arrived = Math.hypot(me.x - mem.targetX, me.y - mem.targetY) < 80;
  if (arrived || next.stuckTicks > 15) {
    const contested = snap.zones.filter((z) => z.owner !== me.team);
    const zone = contested.length > 0 && rand() < 0.8 ? pick(contested, rand) : null;
    next = zone
      ? { ...next, targetX: zone.x + (rand() - 0.5) * zone.r, targetY: zone.y + (rand() - 0.5) * zone.r, stuckTicks: 0 }
      : { ...next, targetX: rand() * WORLD.size, targetY: rand() * WORLD.size, stuckTicks: 0 };
  }
  next.lastX = me.x;
  next.lastY = me.y;

  const enemy = nearestEnemy(me, snap.players);
  const range = WEAPONS[me.weapon].range;
  let goX = next.targetX, goY = next.targetY;
  let angle = Math.atan2(goY - me.y, goX - me.x);
  let fire = false, ability = false, aimDist = 300;
  if (enemy) {
    const d = Math.hypot(enemy.x - me.x, enemy.y - me.y);
    angle = Math.atan2(enemy.y - me.y, enemy.x - me.x) + (rand() - 0.5) * 0.12;
    aimDist = d;
    // Semi-auto weapons need trigger releases, so alternate.
    fire = d < range * 0.95 && (WEAPONS[me.weapon].auto || snap.tick % 2 === 0);
    ability = snap.self.ability !== null && d < 350 && rand() < 0.05;
    if (d > range * 0.6) { goX = enemy.x; goY = enemy.y; }
  }
  const mx = goX - me.x, my = goY - me.y;
  const dead = 30;
  const input: InputState = {
    up: my < -dead, down: my > dead, left: mx < -dead, right: mx > dead,
    angle, fire, reload: !enemy && snap.self.ammo < snap.self.mag / 2, ability, aimDist,
  };
  return { input, perk, mem: next };
}

function nearestEnemy(me: PlayerView, players: PlayerView[]): PlayerView | null {
  let best: PlayerView | null = null, bestD = Infinity;
  for (const p of players) {
    if (p.id === me.id || !p.alive || (me.team !== null && p.team === me.team)) continue;
    const d = Math.hypot(p.x - me.x, p.y - me.y);
    if (d < bestD) { best = p; bestD = d; }
  }
  return best;
}
