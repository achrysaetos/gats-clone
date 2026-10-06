import { GUNS, WORLD, ZOM } from '../../shared/defs.ts';
import { VIEW_ASPECT, viewExtents, type BuildingView, type InputState, type PlayerView, type RunView, type Snapshot } from '../../shared/protocol.ts';
import { cellRect } from '../../shared/sim/build.ts';
import { circleHitsRect, segmentEntersRectAt } from '../../shared/sim/movement.ts';
import type { BotDecision, BotMemory } from '../bots.ts';
import { aimSigma, bearingSpin, drift, engage, freshAim, HANDS, onTarget, SHARPNESS, TICK_MS, turn, type Engagement, type Hand } from './aim.ts';
import type { BotArena } from './arena.ts';
import { ABILITY_RULES, AIMED_ABILITIES, HURTING_HP_FRAC, type Situation } from './motor.ts';

export const DEAD_ZONE = 30;
const UNDER_FIRE_TICKS = Math.round(500 / TICK_MS);

const nearest = <T extends { x: number; y: number }>(me: PlayerView, xs: readonly T[]): T | null =>
  xs.reduce<T | null>((best, x) => (best && Math.hypot(best.x - me.x, best.y - me.y) <= Math.hypot(x.x - me.x, x.y - me.y) ? best : x), null);

type Watch = {
  me: PlayerView;
  core: { x: number; y: number };
  post: { x: number; y: number };
  zombie: { id: number; x: number; y: number; d: number } | null;
  downed: PlayerView | null;
  /** The nearest building that is worn, or a turret short of ammo. */
  wornBuilding: { x: number; y: number } | null;
  /** The core is worn and the bank can pay to mend it. */
  coreWorn: boolean;
};

type Errand = { x: number; y: number; use: boolean };

/** How far from the core a squad bot will wander, and how close a zombie must be before it stops mending. */
const GUARD_RADIUS = 550;
const POST_RADIUS = 320;
const BUSY_ZOMBIE_PX = 300;
const KITE_PX = 140;

const mendAt = (s: Watch, at: { x: number; y: number }): Errand => ({ ...at, use: Math.hypot(at.x - s.me.x, at.y - s.me.y) <= ZOM.reachPx - 60 });
const hordeFar = (s: Watch) => !s.zombie || s.zombie.d > BUSY_ZOMBIE_PX;

/** A squad bot's errands, first match wins: get a downed squadmate up, mend a building or reload a turret and then mend the core while the horde is far, else hold its post by the core. It shoots the nearest zombie through all of them. */
const SIEGE_RULES: readonly ((s: Watch) => Errand | null)[] = [
  (s) => s.downed && { x: s.downed.x, y: s.downed.y, use: Math.hypot(s.downed.x - s.me.x, s.downed.y - s.me.y) <= ZOM.reviveRange - 15 },
  (s) => s.wornBuilding && hordeFar(s) ? mendAt(s, s.wornBuilding) : null,
  (s) => s.coreWorn && hordeFar(s) ? mendAt(s, s.core) : null,
  (s) => {
    const post = { ...s.post, use: false };
    if (!s.zombie || s.zombie.d > KITE_PX) return post;
    // Back away from the zombie, or sidestep it where backing away would leave the guard ring.
    const away = Math.atan2(s.me.y - s.zombie.y, s.me.x - s.zombie.x);
    const steps = [away, away + Math.PI / 2, away - Math.PI / 2].map((a) => ({ x: s.me.x + Math.cos(a) * 200, y: s.me.y + Math.sin(a) * 200, use: false }));
    return steps.find((p) => Math.hypot(p.x - s.core.x, p.y - s.core.y) <= GUARD_RADIUS) ?? post;
  },
];

/** A bot's post on its own bearing from the core: POST_RADIUS out, or nearer when a squad wall stands in the way, so the walls shelter the bot instead of shutting it out. */
function postFor(core: { x: number; y: number }, bearing: number, buildings: readonly BuildingView[]): { x: number; y: number } {
  const at = (d: number) => ({ x: core.x + Math.cos(bearing) * d, y: core.y + Math.sin(bearing) * d });
  const nearest = ZOM.coreHalf + WORLD.playerRadius + 1;
  for (let d = nearest; d <= POST_RADIUS; d += 5) {
    const { x, y } = at(d);
    if (buildings.some((b) => circleHitsRect(x, y, WORLD.playerRadius, cellRect(b.cx, b.cy)))) return at(Math.max(nearest, d - 5));
  }
  return at(POST_RADIUS);
}

export function siegeThink(snap: Snapshot, run: RunView, me: PlayerView, arena: BotArena, mem: BotMemory, rand: () => number): Omit<BotDecision, 'pick'> {
  const walls = arena.walls;
  const sight = viewExtents(snap.self.viewRadius, VIEW_ASPECT.max);
  const zombies = (snap.zombies ?? [])
    .map(([id, , x, y]) => ({ id, x, y, d: Math.hypot(x - me.x, y - me.y) }))
    .filter((z) => Math.abs(z.x - me.x) <= sight.halfW && Math.abs(z.y - me.y) <= sight.halfH
      && !walls.some((r) => segmentEntersRectAt(me.x, me.y, z.x - me.x, z.y - me.y, r) !== null));
  const zombie = zombies.reduce<Watch['zombie']>((best, z) => (best && best.d <= z.d ? best : z), null);
  const down = snap.players.filter((p) => p.downed && p.id !== me.id);
  const downed = nearest(me, down.filter((p) => p.kind === 'human')) ?? nearest(me, down);
  const worn = (snap.buildings ?? [])
    .filter((b) => b.hp < 10 || (b.kind !== 'wall' && b.ammo < 10 && run.scrap > 0))
    .map((b) => ({ x: (b.cx + 0.5) * ZOM.cell, y: (b.cy + 0.5) * ZOM.cell }))
    .filter((b) => Math.hypot(b.x - run.core.x, b.y - run.core.y) <= GUARD_RADIUS);
  const watch: Watch = { me, core: run.core, post: postFor(run.core, me.id, snap.buildings ?? []), zombie, downed, wornBuilding: nearest(me, worn), coreWorn: run.core.hp < run.core.maxHp && run.scrap > 0 };
  const errand = SIEGE_RULES.reduce<Errand | null>((found, rule) => found ?? rule(watch), null)!;

  const outFromCore = { x: 2 * me.x - run.core.x, y: 2 * me.y - run.core.y };
  const face = errand.use ? errand : outFromCore;
  const before = mem.motor.aim ?? freshAim(me.angle);
  let want = Math.hypot(face.x - me.x, face.y - me.y) > 1 ? Math.atan2(face.y - me.y, face.x - me.x) : before.want;
  let spin = 0, hand: Hand = HANDS.calm, err = before.err, aimDist = 300, wantsFire = false;
  let threat: Situation['threat'] = null;
  let engaged: Engagement | null = null;
  if (zombie) {
    // A bot reacts once when the horde comes into sight, then swings from zombie to zombie without waiting again.
    const prev = mem.motor.engaged;
    engaged = prev?.id === zombie.id ? engage(prev, zombie, SHARPNESS[0]!, snap.tick, rand) : { ...engage(null, zombie, SHARPNESS[0]!, snap.tick, rand), ...(prev && { acquiredTick: prev.acquiredTick, noticeAtTick: prev.noticeAtTick }) };
    if (snap.tick >= engaged.noticeAtTick) {
      err = drift(err, aimSigma(engaged, me, SHARPNESS[0]!, snap.tick), TICK_MS, rand);
      const rx = zombie.x - me.x, ry = zombie.y - me.y;
      want = Math.atan2(ry, rx) + err;
      spin = bearingSpin(rx, ry, engaged.vx, engaged.vy);
      hand = HANDS.flick;
      aimDist = zombie.d;
      wantsFire = zombie.d < GUNS[me.gun].range * 0.95;
      threat = { d: zombie.d };
    }
  }
  const aim = turn({ ...before, err }, want, spin, hand, TICK_MS);
  const aimed = onTarget(aim, aimDist);
  const fire = wantsFire && aimed;
  const hitTick = snap.events.some((e) => e.e === 'dmg' && e.kind === 'player' && e.victim === me.id) ? snap.tick : mem.awareness.hitTick;
  const situation: Situation = { threat, hurting: me.hp < me.maxHp * HURTING_HP_FRAC, underFire: snap.tick - hitTick <= UNDER_FIRE_TICKS, onContestedZone: false };
  const readyAbility = snap.self.abilityReadyIn === 0 ? snap.self.ability : null;
  const ability = readyAbility !== null && readyAbility !== 'engineer' && ABILITY_RULES[readyAbility](situation) && (aimed || !AIMED_ABILITIES.has(readyAbility));
  const shots = mem.motor.shots + (fire ? 1 : 0);
  const mx = errand.x - me.x, my = errand.y - me.y;
  const still = errand.use;
  const input: InputState = {
    up: !still && my < -DEAD_ZONE, down: !still && my > DEAD_ZONE, left: !still && mx < -DEAD_ZONE, right: !still && mx > DEAD_ZONE,
    angle: aim.angle, fire, shots, reload: !zombie && snap.self.ammo < snap.self.mag / 2, ability, aimDist, use: errand.use,
  };
  const next = { ...mem, awareness: { ...mem.awareness, hitTick }, motor: { ...mem.motor, engaged, aim, shots } };
  return { input, mem: next };
}
