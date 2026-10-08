import { GUNS } from '../shared/defs.ts';
import { KIT, type Material } from '../shared/kit.ts';
import { cellRect, coreRectAt } from '../shared/sim/build.ts';
import { addCrack, hostOf, inward } from './decals.ts';
import type { PlayerView } from '../shared/protocol.ts';
import type { EffectSpec } from './eventclock.ts';
import { newestSnap } from './interp.ts';
import { ZOMBIE_LOOK } from './palette.ts';
import { burst } from './particles.ts';
import { addRemains, fallOf, liveRemains } from './remains.ts';
import type { Effect, Session } from './state.ts';

const TAU = Math.PI * 2;
export const HIT_FLASH_MS = 120;

type Cover = { x: number; y: number; w: number; h: number; material: Material };

function coverOf(s: Session): Cover[] {
  const snap = newestSnap(s.snaps);
  return [
    ...s.walls.map((w) => ({ x: w.x, y: w.y, w: w.w, h: w.h, material: w.built ? 'concrete' as const : w.material })),
    ...(snap?.crates ?? []).map((c) => ({ x: c.x, y: c.y, w: c.w, h: c.h, material: KIT[c.piece].material })),
    ...(snap?.buildings ?? []).map((b) => ({ ...cellRect(b.cx, b.cy), material: 'concrete' as const })),
    ...(snap?.run ? [{ ...coreRectAt(snap.run.core), material: 'metal' as const }] : []),
  ];
}

/** What a round knocks off each material: the chips that fly, the grit's tint, and how hard it sparks. */
const STRIKE: Record<Material, { chips: 'rubble' | 'splinter' | null; dust: string | null; sparks: 'spark' | 'metalSpark' | null }> = {
  concrete: { chips: 'rubble', dust: '#b9b4aa', sparks: 'spark' },
  metal: { chips: null, dust: null, sparks: 'metalSpark' },
  wood: { chips: 'splinter', dust: '#a8865a', sparks: null },
  planter: { chips: 'rubble', dust: '#8a7458', sparks: null },
  sandbag: { chips: null, dust: '#b8a37c', sparks: null },
};

/** Heavier classes leave smoke hanging at the muzzle. */
const WISPS = new Set(['shotgun', 'sniper', 'lmg']);
/** Extra spark bursts a round throws off each armour tier. */
const ARMOR_SPARKS = { none: 0, light: 1, medium: 1, heavy: 2 } as const;

export function startEffect(s: Session, spec: EffectSpec, now: number, tint?: string) {
  const host = spec.kind === 'impact' && spec.victim === null ? hostOf(coverOf(s), spec.x, spec.y) : null;
  s.effects.push({ ...spec, ...(host && { material: host.material }), born: now } as Effect);
  const angle = Math.random() * TAU;
  switch (spec.kind) {
    case 'impact': {
      if (spec.victim !== null) {
        s.hurtAt.set(spec.victim, now);
        const armor = spec.surface === 'player' ? newestSnap(s.snaps)?.players.find((p) => p.id === spec.victim)?.armorTier ?? 'none' : 'none';
        // The round carries on through: blood sprays out the far side, sparks glance back toward the shooter.
        if (spec.dir !== null) {
          burst(s.particles, 'spark', spec.x, spec.y, spec.dir + Math.PI, now);
          // Armour rings and throws plate chips; the heavier it is, the more of the round it takes and the less blood shows.
          for (let i = 0; i < ARMOR_SPARKS[armor]; i++) burst(s.particles, 'metalSpark', spec.x, spec.y, spec.dir + Math.PI, now);
          if (armor !== 'none') burst(s.particles, 'rubble', spec.x, spec.y, spec.dir + Math.PI, now, Math.random, '#8a8f98');
          if (armor !== 'heavy' || Math.random() < 0.4) burst(s.particles, spec.surface === 'zombie' ? 'ichor' : 'blood', spec.x, spec.y, spec.dir, now);
        }
        return;
      }
      const away = spec.dir !== null ? reflect(spec.dir, host ? inward(host, spec.x, spec.y) + Math.PI : null) : host ? inward(host, spec.x, spec.y) + Math.PI : angle;
      if (host) addCrack(s.cracks, host, spec.x, spec.y, now);
      const strike = STRIKE[host?.material ?? 'concrete'];
      if (strike.chips) burst(s.particles, strike.chips, spec.x, spec.y, away, now);
      if (strike.dust) burst(s.particles, 'dust', spec.x, spec.y, away, now, Math.random, strike.dust);
      if (strike.sparks) burst(s.particles, strike.sparks, spec.x, spec.y, away, now);
      return;
    }
    case 'boom':
      burst(s.particles, 'debris', spec.x, spec.y, angle, now);
      burst(s.particles, 'smoke', spec.x, spec.y, angle, now);
      burst(s.particles, 'ember', spec.x, spec.y, angle, now);
      burst(s.particles, 'plume', spec.x, spec.y, -Math.PI / 2, now);
      return;
    case 'broke': {
      const debris = KIT[spec.piece].breaks?.debris ?? 'wood';
      const cx = spec.x + spec.w / 2, cy = spec.y + spec.h / 2;
      burst(s.particles, debris === 'wood' ? 'splinter' : 'rubble', cx, cy, angle, now);
      burst(s.particles, debris === 'wood' ? 'splinter' : 'rubble', cx, cy, angle + Math.PI, now);
      burst(s.particles, 'dust', cx, cy, angle, now, Math.random, debris === 'wood' ? '#a8865a' : '#9c978e');
      burst(s.particles, 'dust', cx, cy, angle + Math.PI, now, Math.random, debris === 'wood' ? '#a8865a' : '#9c978e');
      if (debris === 'metal') burst(s.particles, 'metalSpark', cx, cy, angle, now);
      return;
    }
    case 'death': {
      burst(s.particles, 'puff', spec.x, spec.y, angle, now, Math.random, tint);
      const victim = lastSeen(s, spec.victim);
      if (!victim) return;
      const blow = s.effects.filter((fx) => fx.kind === 'impact' && fx.victim === spec.victim && fx.dir !== null && now - fx.born < 400).at(-1);
      const blast = s.effects.some((fx) => fx.kind === 'boom' && now - fx.born < 300 && Math.hypot(fx.x - spec.x, fx.y - spec.y) < fx.r + 30);
      const dir = blow?.kind === 'impact' ? blow.dir : null;
      const { fall, turn } = fallOf(dir, victim.angle, blast);
      s.anim.remains = addRemains(liveRemains(s.anim.remains, now), {
        id: spec.victim, x: spec.x, y: spec.y, turn, fall, color: tint ?? '#888888', armor: victim.armorTier, gun: victim.gun, born: now,
        blow: dir ?? angle, spin: spec.victim % 2 ? 1 : -1,
      });
      return;
    }
    case 'splat': burst(s.particles, 'gore', spec.x, spec.y, angle, now, Math.random, ZOMBIE_LOOK[spec.zombie].body); return;
    case 'flash':
      s.anim.shotAt.set(spec.owner, now);
      if (WISPS.has(GUNS[spec.gun].base)) {
        burst(s.particles, 'wisp', spec.x, spec.y, spec.angle, now);
        burst(s.particles, 'wisp', spec.x + Math.cos(spec.angle) * 10, spec.y + Math.sin(spec.angle) * 10, spec.angle, now);
      }
      return;
    case 'slash':
      s.anim.moves.set(spec.owner, { kind: 'knife', at: now });
      return;
    case 'tracer':
      return;
  }
}

/**
 * A player as the newest snapshot that still lists them showed them. Deaths play at render time, a few ticks after the
 * newest snapshot has already dropped the dead.
 */
export const lastSeen = (s: Session, id: number): PlayerView | undefined => s.snaps.snaps.flatMap((snap) => snap.players.filter((p) => p.id === id)).at(-1);

/** The way a round glances off a face whose outward normal is `normal`: mirrored about it, or straight back when the face is unknown. */
export function reflect(dir: number, normal: number | null): number {
  if (normal === null) return dir + Math.PI;
  return 2 * normal - dir + Math.PI;
}

export function hitFlashes(effects: readonly Effect[], now: number): Map<number, number> {
  const flashes = new Map<number, number>();
  for (const fx of effects) {
    if (fx.kind !== 'impact' || fx.victim === null || now - fx.born >= HIT_FLASH_MS) continue;
    flashes.set(fx.victim, Math.max(flashes.get(fx.victim) ?? -Infinity, fx.born));
  }
  return flashes;
}

export const KICK_MS = 110;

export function kicks(effects: readonly Effect[], now: number): Map<number, number> {
  const out = new Map<number, number>();
  for (const fx of effects) {
    if (fx.kind !== 'flash' || now - fx.born >= KICK_MS) continue;
    out.set(fx.owner, Math.max(out.get(fx.owner) ?? -Infinity, fx.born));
  }
  return out;
}
