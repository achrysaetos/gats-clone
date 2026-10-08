import { COLORS, CRATE_TIERS, GUNS, RING, WORLD, ZOMBIE_KINDS, ZOMBIES, type ArmorId, type BuildingKind, type CrateTier, type GunId, type ZombieKind } from '../../shared/defs.ts';
import { ringAt, type BulletView, type ThrownKind, type PlayerView, type RunView, type Snapshot, type WallView } from '../../shared/protocol.ts';
import { BLAST_RADIUS } from '../../shared/sim/abilities.ts';
import { KIT, type PieceId } from '../../shared/kit.ts';
import { MAPS } from '../../shared/maps.ts';
import { trainAt } from '../../shared/sim/train.ts';
import { legFrame, stride } from '../gait.ts';
import { SOLDIER, TRAIN, trainSprite } from './catalog.ts';
import { mapLooks, pieceKey, stageFor, type PieceLook } from './pieces.ts';
import { cellRect, coreRectAt } from '../../shared/sim/build.ts';
import { screenToWorld, type Camera } from '../camera.ts';
import { crackFade, hostKey } from '../decals.ts';
import { HIT_FLASH_MS, hitFlashes, kicks, KICK_MS } from '../effects.ts';
import type { DamageNumber } from '../feedback.ts';
import { serverNow } from '../interp.ts';
import { glow, PALETTE, TEAM_COLORS, teamColor, ZOMBIE_LOOK } from '../palette.ts';
import type { ParticlePool } from '../particles.ts';
import { TRACER } from '../rounds.ts';
import { wallFlashes, type TurretAim } from '../siege.ts';
import type { Effect, Session } from '../state.ts';
import { trailDashes } from '../trails.ts';
import type { Ghost } from '../zombies.ts';
import { ART, SHADOW_PER_HEIGHT } from './art.ts';
import { mapLayoutKey } from './layout.ts';

/** Everything the world shows this frame, decided here and drawn by the painter, so what shows can be tested without a GPU. */
export type Frame = { snap: Snapshot; s: Session; cam: Camera; dpr: number; now: number; selfAngle: number | null; killerId: number | null; ghost?: Ghost | null };

type Rect = { x: number; y: number; w: number; h: number };
export type View = { x0: number; y0: number; x1: number; y1: number };

export type BodyLook = {
  id: number; x: number; y: number; angle: number; gun: GunId; color: string; armor: ArmorId; alpha: number;
  /** Your own ring, or the dashed one on a free-for-all enemy who picked your color. */
  ring: 'self' | 'rival' | null;
  hunted: boolean; stage: 0 | 1 | 2; spawnShield: boolean; shield: boolean;
  /** 1 just hit, fading to 0. */
  flash: number;
  /** 1 just fired, fading to 0. */
  kick: number;
  killer: boolean;
  /** 1 in the sun, less inside a wall's shadow. */
  light: number;
  /** The legs: the way they walk and the frame of the run cycle (`SOLDIER.legs`). */
  legs: { heading: number; frame: number };
};

export type Tag = { id: number; x: number; y: number; name: string | null; bar: number; hp: number };
export type ZoneLook = { x: number; y: number; r: number; color: string; progress: number; progressColor: string; letter: string };
export type ThrownLook = { id: number; kind: Exclude<ThrownKind, 'gasCloud' | 'fire'>; x: number; y: number };
export type Circle = { x: number; y: number; r: number };
export type CrateLook = Rect & { id: number; key: string; piece: PieceId; height: number; tier: CrateTier | undefined; wear: number };
/** An overhead piece and whether a body stands under it, so the painter fades it. */
export type OverheadLook = PieceLook & { under: boolean };
/** The passing train's cars in map space, nose first; `warn` while its signals flash before it comes. */
export type TrainLook = { cars: (Rect & { key: string })[]; warn: boolean; axis: 'x' | 'y'; back: boolean };
export type SiegeLook = Rect & { key: string; kind: BuildingKind; wear: number; ammo: number | null; flash: number; barrel: { angle: number; recoil: number } | null };
export type ZombieLook = { id: number; kind: ZombieKind; x: number; y: number; angle: number; flash: number; hp: number; bar: boolean; light: number };
export type DownedLook = { id: number; x: number; y: number; color: string; self: boolean; revive: number; bleedLeft: number | null };
export type TracerLook = { x0: number; y0: number; x1: number; y1: number; r: number; glow: string; color: string; hot: string };
export type CrackLook = { lines: readonly number[]; alpha: number };
export type RingLook = { x: number; y: number; r: number; next: Circle | null };
export type DropLook = { x: number; y: number; landsIn: number | null };
export type CoreLook = Rect & { x: number; y: number; hp: number; hit: number };

export type Scene = {
  view: View;
  size: number;
  /** Which baked ground to show, from the map's own walls. */
  layout: string;
  dark: number;
  zones: ZoneLook[];
  mines: ThrownLook[];
  thrown: ThrownLook[];
  /** Live blast radii, so a player can see exactly what a grenade will reach. */
  dangers: Circle[];
  gas: Circle[];
  trails: ReturnType<typeof trailDashes>;
  crates: CrateLook[];
  /** The map's standing kit pieces in view. */
  pieces: PieceLook[];
  overheads: OverheadLook[];
  train: TrainLook | null;
  /** Burning fuel on the floor. */
  fires: (Circle & { id: number })[];
  engineerWalls: Rect[];
  siege: SiegeLook[];
  core: CoreLook | null;
  tracers: TracerLook[];
  zombies: ZombieLook[];
  downed: DownedLook[];
  bodies: BodyLook[];
  tags: Tag[];
  cracks: CrackLook[];
  ring: RingLook | null;
  loot: (Rect & { cache: boolean })[];
  drops: DropLook[];
  ghost: { ghost: Ghost; self: { x: number; y: number }; core: { x: number; y: number } } | null;
  killer: { x: number; y: number; name: string; lift: number } | null;
  numbers: readonly DamageNumber[];
  effects: readonly Effect[];
  particles: ParticlePool;
};

const R = WORLD.playerRadius;
const CULL_MARGIN = 120;
const HURT_SHOW_MS = 1800;
const HURT_FADE_MS = 500;
/** How much of the sun a body inside a wall's shadow still gets. */
const IN_SHADOW = 0.62;

export const bodyColor = (p: Pick<PlayerView, 'color' | 'team'>): string => (p.team ? TEAM_COLORS[p.team] : COLORS[p.color]);

const inView = (v: View, x: number, y: number, w: number, h: number) => x + w >= v.x0 && x <= v.x1 && y + h >= v.y0 && y <= v.y1;

export function viewOf(cam: Camera): View {
  const tl = screenToWorld(cam, { x: 0, y: 0 }), br = screenToWorld(cam, { x: cam.w, y: cam.h });
  return { x0: tl.x - CULL_MARGIN, y0: tl.y - CULL_MARGIN, x1: br.x + CULL_MARGIN, y1: br.y + CULL_MARGIN };
}

const heightOf = (w: WallView): number => (w.built ? ART.heights.slate : ART.heights[w.material]);

/** Whether the sun's ray back from (x, y) meets a solid within its height's shadow reach: the slab test along -sun. */
export function inShadow(x: number, y: number, walls: readonly WallView[]): boolean {
  const [sx, sy] = ART.sun.shadow;
  for (const w of walls) {
    const reach = heightOf(w) * SHADOW_PER_HEIGHT;
    let t0 = 0, t1 = reach;
    for (const [p, d, lo, hi] of [[x, -sx, w.x, w.x + w.w], [y, -sy, w.y, w.y + w.h]] as const) {
      if (Math.abs(d) < 1e-9) { if (p < lo || p > hi) { t1 = -1; break; } continue; }
      const a = (lo - p) / d, b = (hi - p) / d;
      t0 = Math.max(t0, Math.min(a, b));
      t1 = Math.min(t1, Math.max(a, b));
    }
    if (t0 <= t1) return true;
  }
  return false;
}

const TRACER_LOOK = { r: 1.6, glow: PALETTE.tracerGlow, color: PALETTE.tracer, hot: PALETTE.tracerHot } as const;

function tracerOf(b: BulletView): TracerLook {
  const look = !b.gun || GUNS[b.gun].stage === 0 ? TRACER_LOOK : { r: GUNS[b.gun].look.bullet.r, glow: glow(GUNS[b.gun].look.bullet.color, 0.62), color: glow(GUNS[b.gun].look.bullet.color, 0.72), hot: glow(GUNS[b.gun].look.bullet.color, 0.92) };
  return { x0: b.x - b.vx * TRACER.tail, y0: b.y - b.vy * TRACER.tail, x1: b.x, y1: b.y, ...look };
}

function tagsOf(bodies: readonly PlayerView[], s: Session, now: number): Tag[] {
  return bodies.filter((p) => p.id === s.myId || !p.hidden).map((p) => {
    const hp = Math.max(0, Math.min(1, p.hp / p.maxHp));
    if (p.id === s.myId) return { id: p.id, x: p.x, y: p.y, name: null, bar: p.hp < p.maxHp ? 1 : 0, hp };
    const hurt = s.hurtAt.get(p.id);
    return { id: p.id, x: p.x, y: p.y, name: p.name, bar: hurt === undefined ? 0 : Math.max(0, Math.min(1, (HURT_SHOW_MS - (now - hurt)) / HURT_FADE_MS)), hp };
  });
}

const cellKey = (cx: number, cy: number) => `${cx},${cy}`;

function siegeOf(snap: Snapshot, s: Session, view: View, now: number): SiegeLook[] {
  if (!snap.buildings || !snap.run) return [];
  const flashes = wallFlashes(s.effects, now);
  return snap.buildings.flatMap((b) => {
    const r = cellRect(b.cx, b.cy);
    if (!inView(view, r.x, r.y, r.w, r.h)) return [];
    const hit = flashes.get(cellKey(b.cx, b.cy));
    const aim = s.turretAims.get(cellKey(b.cx, b.cy));
    const core = snap.run!.core;
    const barrel = b.kind === 'wall' ? null : aim
      ? { angle: aim.drawn, recoil: Math.max(0, 1 - (now - aim.firedAt) / TURRET_RECOIL_MS) }
      : { angle: Math.atan2(r.y + r.h / 2 - core.y, r.x + r.w / 2 - core.x), recoil: 0 };
    return [{ ...r, key: cellKey(b.cx, b.cy), kind: b.kind, wear: 1 - b.hp / 10, ammo: b.kind === 'wall' ? null : b.ammo, flash: hit === undefined ? 0 : 1 - (now - hit) / HIT_FLASH_MS, barrel }];
  });
}

const TURRET_RECOIL_MS = 110;

function coreOf(run: RunView | undefined, hitAt: number, now: number): CoreLook | null {
  if (!run) return null;
  return { ...coreRectAt(run.core), x: run.core.x, y: run.core.y, hp: Math.max(0, run.core.hp / run.core.maxHp), hit: Math.max(0, 1 - (now - hitAt) / CORE_HIT_MS) };
}

const CORE_HIT_MS = 180;

export function describeWorld(f: Frame, dark: number): Scene {
  const { snap, s, now } = f;
  const view = viewOf(f.cam);
  const near = (x: number, y: number, pad: number) => inView(view, x - pad, y - pad, pad * 2, pad * 2);
  const mapWalls = s.walls.filter((w) => !w.built && inView(view, w.x - 200, w.y - 200, w.w + 400, w.h + 400));
  const lightAt = (x: number, y: number) => (inShadow(x, y, mapWalls) ? IN_SHADOW : 1);
  const mine = snap.players.find((p) => p.id === s.myId);
  // The squad shares one team, so each squadmate wears their own color instead.
  const colorOf = (p: PlayerView) => (snap.run ? COLORS[p.color] : bodyColor(p));
  const alive = snap.players.filter((p) => p.alive && near(p.x, p.y, R * 3));
  const flashes = hitFlashes(s.effects, now);
  const recoil = kicks(s.effects, now);
  const zombies = (snap.zombies ?? []).filter(([, , x, y]) => near(x, y, 60));
  const clock = snap.royale || snap.run ? serverNow(s.snaps, now) : null;
  const killer = f.killerId === null ? undefined : alive.find((p) => p.id === f.killerId);
  const looks = mapLooks(s.map);
  for (const p of alive) s.strides.set(p.id, stride(s.strides.get(p.id), p.x, p.y, now));
  if (s.strides.size > alive.length * 2 + 16) for (const id of s.strides.keys()) if (!alive.some((p) => p.id === id)) s.strides.delete(id);
  const standing = new Set([...s.walls, ...snap.crates.map((c) => ({ x: c.x, y: c.y, w: c.w, h: c.h })), ...(snap.buildings ?? []).map((b) => cellRect(b.cx, b.cy)), ...(snap.run ? [coreRectAt(snap.run.core)] : [])].map(hostKey));

  return {
    view, size: s.worldSize, layout: mapLayoutKey(s.walls), dark,
    zones: snap.zones.map((z, i) => ({
      x: z.x, y: z.y, r: z.r, color: teamColor(z.owner), progress: Math.min(1, Math.abs(z.progress)), progressColor: teamColor(z.capturing ?? z.owner), letter: String.fromCharCode(65 + i),
    })),
    mines: snap.thrown.flatMap((t) => (t.kind === 'landMine' ? [{ id: t.id, kind: t.kind, x: t.x, y: t.y }] : [])),
    thrown: snap.thrown.flatMap((t) => (t.kind === 'grenade' || t.kind === 'fragGrenade' || t.kind === 'gasGrenade' ? [{ id: t.id, kind: t.kind, x: t.x, y: t.y }] : [])),
    dangers: snap.thrown.flatMap((t) => (t.kind === 'grenade' || t.kind === 'fragGrenade' ? [{ x: t.x, y: t.y, r: BLAST_RADIUS[t.kind] }] : [])),
    gas: snap.thrown.flatMap((t) => (t.kind === 'gasCloud' ? [{ x: t.x, y: t.y, r: t.r }] : [])),
    trails: [...s.trails.values()].flatMap((t) => trailDashes(t, now)),
    crates: snap.crates.filter((c) => inView(view, c.x, c.y, c.w, c.h + KIT[c.piece].height)).map((c) => {
      const wear = 1 - c.hp / (c.tier ? CRATE_TIERS[c.tier].hp : KIT[c.piece].breaks?.hp ?? 1);
      return { id: c.id, key: pieceKey({ p: c.piece, r: c.r }, stageFor(c.piece, wear)), piece: c.piece, x: c.x, y: c.y, w: c.w, h: c.h, height: KIT[c.piece].height, tier: c.tier, wear };
    }),
    pieces: looks.standing.filter((p) => inView(view, p.x, p.y, p.w, p.h + p.height)),
    overheads: looks.overhead.filter((p) => inView(view, p.x, p.y, p.w, p.h + p.height)).map((p) => ({
      ...p, under: alive.some((b) => b.x > p.x - R && b.x < p.x + p.w + R && b.y > p.y - R && b.y < p.y + p.h + R),
    })),
    train: trainOf(s, now),
    fires: snap.thrown.flatMap((t) => (t.kind === 'fire' && near(t.x, t.y, t.r) ? [{ id: t.id, x: t.x, y: t.y, r: t.r }] : [])),
    engineerWalls: s.walls.filter((w) => w.built && inView(view, w.x, w.y, w.w, w.h)).map(({ x, y, w, h }) => ({ x, y, w, h })),
    siege: siegeOf(snap, s, view, now),
    core: coreOf(snap.run, s.coreHitAt, now),
    tracers: snap.bullets.filter((b) => near(b.x, b.y, 200)).map(tracerOf),
    zombies: zombies.map(([id, k, x, y, hp]) => {
      const kind = ZOMBIE_KINDS[k];
      const hit = flashes.get(id);
      return { id, kind, x, y, angle: s.zombieFaces.get(id)?.a ?? 0, flash: hit === undefined ? 0 : 1 - (now - hit) / HIT_FLASH_MS, hp, bar: ZOMBIE_LOOK[kind].bar, light: lightAt(x, y) };
    }),
    downed: snap.players.filter((p) => p.downed && near(p.x, p.y, R * 3)).map((p) => ({
      id: p.id, x: p.x, y: p.y, color: colorOf(p), self: p.id === s.myId, revive: p.downed!.revive, bleedLeft: clock === null ? null : p.downed!.bleedOutAt - clock,
    })),
    bodies: alive.map((p) => {
      const self = p.id === s.myId;
      const flash = flashes.get(p.id), kick = recoil.get(p.id);
      return {
        id: p.id, x: p.x, y: p.y, angle: self && f.selfAngle !== null ? f.selfAngle : p.angle, gun: p.gun, color: colorOf(p), armor: p.armorTier, alpha: p.hidden ? 0.25 : 1,
        ring: self ? 'self' : p.team === null && p.color === mine?.color ? 'rival' : null,
        hunted: p.hunted && !self, stage: GUNS[p.gun].stage, spawnShield: !!p.spawnShield, shield: p.shield,
        flash: flash === undefined ? 0 : 1 - (now - flash) / HIT_FLASH_MS, kick: kick === undefined ? 0 : 1 - (now - kick) / KICK_MS,
        killer: p === killer, light: lightAt(p.x, p.y),
        legs: legsOf(s.strides.get(p.id)),
      };
    }),
    tags: tagsOf(alive, s, now),
    cracks: s.cracks.slots.flatMap((c) => (c && standing.has(c.host) && crackFade(c, now) > 0 ? [{ lines: c.lines, alpha: crackFade(c, now) }] : [])),
    ring: snap.royale && clock !== null ? ringOf(snap, clock) : null,
    loot: snap.royale ? snap.crates.flatMap((c) => (c.tier === 'rich' || c.tier === 'cache' ? [{ x: c.x, y: c.y, w: c.w, h: c.h, cache: c.tier === 'cache' }] : [])) : [],
    drops: snap.royale && clock !== null ? snap.royale.drops.map((d) => ({ x: d.x, y: d.y, landsIn: d.landsAt > clock ? d.landsAt - clock : null })) : [],
    ghost: f.ghost && snap.run ? { ghost: f.ghost, self: s.lastSelf, core: snap.run.core } : null,
    killer: killer ? { x: killer.x, y: killer.y, name: killer.name, lift: GUNS[killer.gun].stage ? 12 + 6 * GUNS[killer.gun].stage : 6 } : null,
    numbers: s.feedback.numbers,
    effects: s.effects,
    particles: s.particles,
  };
}

function legsOf(st: ReturnType<typeof stride> | undefined): BodyLook['legs'] {
  if (!st) return { heading: 0, frame: SOLDIER.legs.stand };
  return { heading: st.heading, frame: legFrame(st, SOLDIER.legs.stand, SOLDIER.legs.run[0], SOLDIER.legs.run.length) };
}

/** Train cars in their baked sizes, laid back from the nose along the lane. */

function trainOf(s: Session, now: number): TrainLook | null {
  const train = MAPS[s.map].train;
  const clock = train ? serverNow(s.snaps, now) : null;
  if (!train || clock === null) return null;
  const at = trainAt(train, clock);
  if (at.k === 'clear') return null;
  if (at.k === 'warn') return { cars: [], warn: true, axis: train.axis, back: train.dir === -1 };
  const nose = ((clock - at.arrivedAt) / 1000) * train.speed;
  const { lane } = train;
  const span = train.axis === 'x' ? lane.w : lane.h;
  const cars: TrainLook['cars'] = [];
  for (let back = 0, i = 0; back < train.length; i++) {
    const len = Math.min(i === 0 ? TRAIN.loco : TRAIN.car, train.length - back);
    const from = nose - back - len;
    const a = train.dir === 1 ? from : span - from - len;
    const turn = train.axis === 'x' ? 0 : 1;
    const key = trainSprite(i === 0 ? 'loco' : 'car', turn);
    cars.push(train.axis === 'x' ? { key, x: lane.x + a, y: lane.y, w: len, h: lane.h } : { key, x: lane.x, y: lane.y + a, w: lane.w, h: len });
    back += len;
  }
  return { cars, warn: false, axis: train.axis, back: train.dir === -1 };
}

function ringOf(snap: Snapshot, clock: number): RingLook {
  const { ring } = snap.royale!;
  const c = ringAt(ring, clock);
  return { x: c.x, y: c.y, r: Math.max(0, c.r), next: ring.phase < RING.length && ring.to.r < c.r ? { x: ring.to.x, y: ring.to.y, r: Math.max(1, ring.to.r) } : null };
}
