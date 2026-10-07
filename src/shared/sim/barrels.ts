import { BARREL, WORLD } from '../defs.ts';
import type { Team } from '../protocol.ts';
import { explode, award } from './combat.ts';
import { clamp, dist2, rectsOverlap } from './movement.ts';
import { barrelRect, type Barrel, type Player, type World } from './world.ts';

const CHAIN_MEMORY_MS = 8000;

/** Whoever set a barrel off: their id (null once they have left), their team then, and the chain it belongs to. */
export type Spark = { attacker: Player | null; team: Team; chain?: number };

/**
 * Hurts a barrel. At zero health it is lit: it hisses until its fuse runs out (`tickBarrels`). A barrel already lit, or
 * standing again, ignores more. A spark from a burst (`chain` set) lights a shorter fuse the nearer the burst was.
 */
export function damageBarrel(w: World, b: Barrel, amount: number, spark: Spark, fromDist = 0): void {
  if (b.respawnAt !== null || b.fuseAt !== null) return;
  b.hp = Math.max(0, b.hp - amount);
  w.events.push({ e: 'dmg', attacker: spark.attacker?.id ?? null, victim: b.id, amount: Math.round(Math.min(BARREL.hp, amount) * 10) / 10, x: b.x, y: b.y, kind: 'crate' });
  if (b.hp > 0) return;
  const chain = spark.chain ?? b.id;
  if (spark.chain === undefined) w.chains.set(chain, { by: spark.attacker?.id ?? null, barrels: 0, kills: 0, paid: false, at: w.now });
  b.by = { attacker: spark.attacker?.id ?? null, team: spark.team, chain };
  b.fuseAt = w.now + (spark.chain === undefined ? BARREL.fuseMs : BARREL.chainBaseMs + BARREL.chainPerPx * fromDist);
}

function burst(w: World, b: Barrel) {
  const by = b.by!;
  const chain = w.chains.get(by.chain);
  if (chain) { chain.barrels++; chain.at = w.now; payChain(w, chain); }
  b.fuseAt = null;
  b.respawnAt = w.now + BARREL.respawnMs;
  explode(w, b.x, b.y, BARREL.radius, BARREL.damage, { attacker: by.attacker === null ? null : w.players.get(by.attacker) ?? null, team: by.team, label: 'Barrel', chain: by.chain });
  b.by = null;
  w.wallsVersion++;
}

/** A chain of two or more barrels whose blasts killed two or more rewards the player who struck the spark. */
export function payChain(w: World, chain: { by: number | null; barrels: number; kills: number; paid: boolean }) {
  if (chain.paid || chain.barrels < 2 || chain.kills < 2 || chain.by === null) return;
  const p = w.players.get(chain.by);
  if (!p) return;
  chain.paid = true;
  award(w, p, 'chainReaction');
}

export function tickBarrels(w: World) {
  for (const b of w.barrels) {
    if (b.respawnAt !== null) {
      const stood = [...w.players.values()].some((p) => p.life.k !== 'dead' && rectsOverlap(barrelRect(b), { x: p.x, y: p.y, w: 0, h: 0 }, WORLD.playerRadius));
      if (w.now >= b.respawnAt && !stood) { b.respawnAt = null; b.hp = BARREL.hp; b.fuseAt = null; w.wallsVersion++; }
    } else if (b.fuseAt !== null && w.now >= b.fuseAt) burst(w, b);
  }
  for (const [id, c] of w.chains) if (w.now - c.at > CHAIN_MEMORY_MS) w.chains.delete(id);
}

/** Barrels a blast at (x, y) reaches within `radius`, each with its distance from the burst. */
export function barrelsInBlast(w: World, x: number, y: number, radius: number): { b: Barrel; d: number }[] {
  const out: { b: Barrel; d: number }[] = [];
  for (const b of w.barrels) {
    if (b.respawnAt !== null || b.fuseAt !== null) continue;
    const r = barrelRect(b);
    const d = Math.sqrt(dist2(x, y, clamp(x, r.x, r.x + r.w), clamp(y, r.y, r.y + r.h)));
    if (d < radius) out.push({ b, d });
  }
  return out;
}
