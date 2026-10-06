import { BUILDINGS, GUNS, WORLD, ZOM, type BuildingKind } from '../../shared/defs.ts';
import { VIEW_ASPECT, viewExtents, type BuildingView, type InputState, type PlayerView, type RunView, type Snapshot } from '../../shared/protocol.ts';
import { cellOf, cellRect } from '../../shared/sim/build.ts';
import { circleHitsRect, segmentEntersRectAt } from '../../shared/sim/movement.ts';
import type { BotDecision, BotMemory } from '../bots.ts';
import { aimAndTrigger, aimSigma, bearingSpin, drift, engage, freshAim, HANDS, SHARPNESS, TICK_MS, type Engagement, type Look } from './aim.ts';
import type { BotArena } from './arena.ts';
import { ABILITY_RULES, HURTING_HP_FRAC, type Situation } from './motor.ts';

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
  needsTending: { x: number; y: number } | null;
  coreMendable: boolean;
  next: { kind: BuildingKind; cx: number; cy: number; x: number; y: number } | null;
};

type Errand = { x: number; y: number; use: boolean };

const GUARD_RADIUS = 550;
const POST_RADIUS = 320;
const BUSY_ZOMBIE_PX = 300;
const KITE_PX = 140;

const mendAt = (s: Watch, at: { x: number; y: number }): Errand => ({ ...at, use: Math.hypot(at.x - s.me.x, at.y - s.me.y) <= ZOM.reachPx - 60 });
const hordeFar = (s: Watch) => !s.zombie || s.zombie.d > BUSY_ZOMBIE_PX;

type Rule = (s: Watch) => Errand | null;

const revive: Rule = (s) => s.downed && { x: s.downed.x, y: s.downed.y, use: Math.hypot(s.downed.x - s.me.x, s.downed.y - s.me.y) <= ZOM.reviveRange - 15 };
const mendBuilding: Rule = (s) => s.needsTending && hordeFar(s) ? mendAt(s, s.needsTending) : null;
const mendCore: Rule = (s) => s.coreMendable && hordeFar(s) ? mendAt(s, s.core) : null;
const buildNext: Rule = (s) => s.next && { x: s.next.x, y: s.next.y, use: false };
const holdPost: Rule = (s) => {
  const post = { ...s.post, use: false };
  if (!s.zombie || s.zombie.d > KITE_PX) return post;
  const away = Math.atan2(s.me.y - s.zombie.y, s.me.x - s.zombie.x);
  const steps = [away, away + Math.PI / 2, away - Math.PI / 2].map((a) => ({ x: s.me.x + Math.cos(a) * 200, y: s.me.y + Math.sin(a) * 200, use: false }));
  return steps.find((p) => Math.hypot(p.x - s.core.x, p.y - s.core.y) <= GUARD_RADIUS) ?? post;
};

const SIEGE_RULES: readonly Rule[] = [revive, mendBuilding, buildNext, mendCore, holdPost];

/** What the squad's bots put up, in order, in cells out from the core's center: a sentry each side first, then a turret for each new kind of night. */
const BASTION_PLAN: readonly { kind: BuildingKind; dx: number; dy: number }[] = [
  { kind: 'sentry', dx: 0, dy: -3 }, { kind: 'sentry', dx: 3, dy: 0 }, { kind: 'scatter', dx: 0, dy: 3 }, { kind: 'sentry', dx: -3, dy: 0 },
  { kind: 'cannon', dx: 3, dy: -3 }, { kind: 'mortar', dx: -3, dy: 3 }, { kind: 'scatter', dx: 0, dy: -4 }, { kind: 'sentry', dx: 0, dy: 4 },
  { kind: 'cannon', dx: -3, dy: -3 }, { kind: 'mortar', dx: 3, dy: 3 }, { kind: 'scatter', dx: 4, dy: 0 }, { kind: 'scatter', dx: -4, dy: 0 },
];

/** The first building of the plan not yet up. By day its cost is what the bots keep in hand before they mend the core. */
function nextBuild(run: RunView, buildings: readonly BuildingView[]) {
  const todo = BASTION_PLAN.map((p) => ({ kind: p.kind, ...cellOf(run.core.x + p.dx * ZOM.cell, run.core.y + p.dy * ZOM.cell) }))
    .find((p) => !buildings.some((b) => b.cx === p.cx && b.cy === p.cy));
  return todo ? { ...todo, x: (todo.cx + 0.5) * ZOM.cell, y: (todo.cy + 0.5) * ZOM.cell, cost: BUILDINGS[todo.kind].cost } : null;
}

function postFor(core: { x: number; y: number }, bearing: number, buildings: readonly BuildingView[]): { x: number; y: number } {
  const at = (d: number) => ({ x: core.x + Math.cos(bearing) * d, y: core.y + Math.sin(bearing) * d });
  const innermost = ZOM.coreHalf + WORLD.playerRadius + 1;
  for (let d = innermost; d <= POST_RADIUS; d += 5) {
    const { x, y } = at(d);
    if (buildings.some((b) => circleHitsRect(x, y, WORLD.playerRadius, cellRect(b.cx, b.cy)))) return at(Math.max(innermost, d - 5));
  }
  return at(POST_RADIUS);
}

function swingTo(prev: Engagement | null, zombie: NonNullable<Watch['zombie']>, tick: number, rand: () => number): Engagement {
  if (prev?.id === zombie.id) return engage(prev, zombie, SHARPNESS[0]!, tick, rand);
  const fresh = engage(null, zombie, SHARPNESS[0]!, tick, rand);
  return prev ? { ...fresh, acquiredTick: prev.acquiredTick, noticeAtTick: prev.noticeAtTick } : fresh;
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
  const plan = nextBuild(run, snap.buildings ?? []);
  const buildable = plan && run.phase === 'day' && run.scrap >= plan.cost ? plan : null;
  const watch: Watch = {
    me, core: run.core, post: postFor(run.core, me.id, snap.buildings ?? []), zombie, downed, needsTending: nearest(me, worn), next: buildable,
    coreMendable: run.core.hp < run.core.maxHp && run.scrap > (run.phase === 'day' ? plan?.cost ?? 0 : 0),
  };
  const errand = SIEGE_RULES.reduce<Errand | null>((found, rule) => found ?? rule(watch), null)!;
  const builds = buildable && errand.x === buildable.x && errand.y === buildable.y && Math.hypot(buildable.x - me.x, buildable.y - me.y) <= ZOM.reachPx - 60;

  const outFromCore = { x: 2 * me.x - run.core.x, y: 2 * me.y - run.core.y };
  const face = errand.use ? errand : outFromCore;
  const before = mem.motor.aim ?? freshAim(me.angle);
  const want = Math.hypot(face.x - me.x, face.y - me.y) > 1 ? Math.atan2(face.y - me.y, face.x - me.x) : before.want;
  let look: Look = { want, spin: 0, hand: HANDS.calm, d: 300, err: before.err };
  let wantsFire = false;
  let threat: Situation['threat'] = null;
  let engaged: Engagement | null = null;
  if (zombie) {
    engaged = swingTo(mem.motor.engaged, zombie, snap.tick, rand);
    if (snap.tick >= engaged.noticeAtTick) {
      const err = drift(before.err, aimSigma(engaged, me, SHARPNESS[0]!, snap.tick), TICK_MS, rand);
      const rx = zombie.x - me.x, ry = zombie.y - me.y;
      look = { want: Math.atan2(ry, rx) + err, spin: bearingSpin(rx, ry, engaged.vx, engaged.vy), hand: HANDS.flick, d: zombie.d, err };
      wantsFire = zombie.d < GUNS[me.gun].range * 0.95;
      threat = { d: zombie.d };
    }
  }
  const hitTick = snap.events.some((e) => e.e === 'dmg' && e.kind === 'player' && e.victim === me.id) ? snap.tick : mem.awareness.hitTick;
  const situation: Situation = { threat, hurting: me.hp < me.maxHp * HURTING_HP_FRAC, underFire: snap.tick - hitTick <= UNDER_FIRE_TICKS, onContestedZone: false };
  const readyAbility = snap.self.abilityReadyIn === 0 ? snap.self.ability : null;
  const wanted = readyAbility !== null && readyAbility !== 'engineer' && ABILITY_RULES[readyAbility](situation) ? readyAbility : null;
  const { aim, fire, ability, shots } = aimAndTrigger(before, look, wantsFire, wanted, mem.motor.shots);
  const mx = errand.x - me.x, my = errand.y - me.y;
  const still = errand.use;
  const input: InputState = {
    up: !still && my < -DEAD_ZONE, down: !still && my > DEAD_ZONE, left: !still && mx < -DEAD_ZONE, right: !still && mx > DEAD_ZONE,
    angle: aim.angle, fire, shots, reload: !zombie && snap.self.ammo < snap.self.mag / 2, ability, aimDist: look.d, use: errand.use,
  };
  const next = { ...mem, awareness: { ...mem.awareness, hitTick }, motor: { ...mem.motor, engaged, aim, shots } };
  return { input, mem: next, ...(builds && { build: { kind: buildable.kind, cx: buildable.cx, cy: buildable.cy } }) };
}
