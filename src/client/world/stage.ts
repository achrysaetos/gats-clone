import { BlurFilter, Color, Container, Graphics, Matrix, RenderTexture, Sprite, WebGLRenderer, type ColorSource, type Texture } from 'pixi.js';
import { BUILDINGS, GUNS, WORLD, ZOM, ZOMBIES, type TurretKind, type WeaponId } from '../../shared/defs.ts';
import type { PieceId } from '../../shared/kit.ts';
import type { WallView } from '../../shared/protocol.ts';
import type { Camera } from '../camera.ts';
import { PALETTE, shade, ZOMBIE_LOOK } from '../palette.ts';
import { isLive, PARTICLE_CAP, particleAt } from '../particles.ts';
import { EFFECT_LIFE_MS, type Effect } from '../state.ts';
import { TURRET_LOOK } from '../siege.ts';
import type { Knobs } from '../quality.ts';
import { loadArt, type Art } from './assets.ts';
import { ART, SHADOW_PER_HEIGHT } from './art.ts';
import { facing, FIRE_FRAMES, GUN_FRAMES, siegeWallSprite, SPRITES, TRAIN, type Layer } from './catalog.ts';
import { blockLook } from './blocks.ts';
import { createGround } from './ground.ts';
import { createKnee } from './knee.ts';
import { add, clear, createRing, marksOf, visible, type Placed } from './marks.ts';
import type { BodyLook, Scene } from './scene.ts';
import { createTextures } from './textures.ts';

const TAU = Math.PI * 2;
const R = WORLD.playerRadius;
/** The soldier's baked shadow is as dark as a wall's; at full strength it outweighs the soldier, so it is drawn lighter. */
const SOLDIER_SHADOW = 0.6;
/** How far an overhead piece fades while someone is under it, and how quickly. */
const OVERHEAD_FADED = 0.28;
const OVERHEAD_EASE_MS = 140;
const RECOIL = R * 0.22;
const MARK_Y = -R - 8;

const colors = new Map<string, number>();
/** Pixi parses a CSS color on every tint; the palette is small, so parse each once. */
const hex = (c: string): number => {
  let n = colors.get(c);
  if (n === undefined) colors.set(c, (n = new Color(c as ColorSource).toNumber()));
  return n;
};
const grey = (v: number) => {
  const c = Math.round(Math.max(0, Math.min(1, v)) * 255);
  return (c << 16) | (c << 8) | c;
};

/** Sprites reused frame to frame: `begin`, take what the frame needs, `end` hides the rest. */
type Pool<T extends Container> = { begin(): void; next(): T; end(): void };

function pool<T extends Container>(parent: Container, make: () => T): Pool<T> {
  const items: T[] = [];
  let used = 0;
  return {
    begin() { used = 0; },
    next() {
      let item = items[used];
      if (!item) { item = make(); items.push(item); parent.addChild(item); }
      item.visible = true;
      used++;
      return item;
    },
    end() { for (let i = used; i < items.length; i++) items[i]!.visible = false; },
  };
}

const sprite = (blend?: 'add' | 'multiply') => () => {
  const s = new Sprite();
  if (blend) s.blendMode = blend;
  return s;
};

type BodyView = { root: Container; ring: Sprite; legs: Sprite; legsTeam: Sprite; base: Sprite; team: Sprite; armor: Sprite; gun: Sprite; mag: Sprite; action: Sprite; flash: Sprite; chevrons: Sprite[]; hunted: Sprite; guard: Sprite; shield: Sprite; killer: Sprite };

/**
 * The most marks each ring holds, at the top tier; the tier's budget draws the newest of them. Floor marks (scorch, blood,
 * piles, rubble) stay for the match, casings for `CASING_LIFE_MS`.
 */
const MARK_CAP = 400;
const CASING_CAP = 300;
const CASING_LIFE_MS = 14_000;
/** How each class's flash shows: its size, and the light it throws at night. A suppressor shrinks and dims it. */
const FLASH: Record<WeaponId, { glow: number; light: number }> = {
  pistol: { glow: 40, light: 210 }, smg: { glow: 34, light: 190 }, assault: { glow: 48, light: 240 },
  shotgun: { glow: 64, light: 290 }, sniper: { glow: 60, light: 300 }, lmg: { glow: 56, light: 270 },
};
/** How much of each channel full night takes from the day. */
const NIGHT = { r: 0.9, g: 0.88, b: 0.8 } as const;
/** A breakable piece's live sun shadow, as dark as the baked ones under the pieces that never break. */
const LIVE_SHADOW = { color: 0x0e1420, alpha: 0.42 } as const;

/** Thrown when the browser cannot give the world a WebGL2 context; the menu says so and keeps Play off. */
export class NoWebGL2 extends Error {}

/**
 * A WebGL2 context, on the GPU when the browser offers one. `software` is true when only a software rasterizer was offered:
 * the game still runs, at the lowest quality.
 */
function webgl2(canvas: HTMLCanvasElement): { gl: WebGL2RenderingContext; software: boolean } {
  const attrs: WebGLContextAttributes = { alpha: false, premultipliedAlpha: true, antialias: false, stencil: true, powerPreference: 'high-performance' };
  const gpu = canvas.getContext('webgl2', { ...attrs, failIfMajorPerformanceCaveat: true });
  if (gpu) return { gl: gpu, software: false };
  const any = canvas.getContext('webgl2', attrs);
  if (any) return { gl: any, software: true };
  throw new NoWebGL2('no WebGL2 context');
}

export type World = {
  draw(scene: Scene, cam: Camera, now: number, walls: readonly WallView[]): void;
  resize(w: number, h: number, dpr: number): void;
  probe(): { tiles: number; failedTiles: number; atlas: boolean; drawn: number; software: boolean; floatSums: boolean };
  art: Pick<Art, 'progress' | 'ready' | 'loaded'>;
  software: boolean;
  /** Waits for the GPU to finish the last frame, so a benchmark times the pixels and not just the commands. */
  finish(): void;
};

/** `knobs` is read every frame, so a tier change takes effect on the next one. */
export async function createWorld(canvas: HTMLCanvasElement, knobs: () => Knobs): Promise<World> {
  const { gl, software } = webgl2(canvas);
  const renderer = new WebGLRenderer();
  await renderer.init({ canvas, context: gl, width: canvas.clientWidth || 1, height: canvas.clientHeight || 1, resolution: 1, antialias: false, background: '#1d3a4c', powerPreference: 'high-performance' });
  if (renderer.context.webGLVersion !== 2) throw new NoWebGL2(`WebGL${renderer.context.webGLVersion}`);
  const art = loadArt();
  const tex = createTextures();
  let view = { w: 1, h: 1, dpr: 1 };
  let k = knobs();
  /** The share of particles, flames and smoke the tier draws. */
  let density = 1;
  /** World pixels per CSS pixel: the display's DPR scaled by the tier. */
  let res = 1;

  const root = new Container();
  const waterLayer = new Container();
  const world = new Container();
  const groundLayer = new Container();
  const decalLayer = new Container();
  const under = new Graphics();
  const casingLayer = new Container();
  const shadowLayer = new Container();
  const solidLayer = new Container();
  const cracks = new Graphics();
  const remainsLayer = new Container();
  const actorLayer = new Container();
  const fxLayer = new Container();
  const over = new Graphics();
  /** Kit pieces with no baked look yet, drawn as their top and south face. */
  const blocks = new Graphics();
  /** Above the actors: the train, then roofs, gantries and pipes, which fade to show who is under them. */
  const aboveLayer = new Container();
  const aboveBlocks = new Graphics();
  world.addChild(groundLayer, decalLayer, under, casingLayer, shadowLayer, remainsLayer, blocks, solidLayer, cracks, actorLayer, aboveBlocks, aboveLayer, fxLayer, over);
  const nightSprite = new Sprite();
  nightSprite.blendMode = 'multiply';
  const glowWorld = new Container({ isRenderGroup: true });
  // Glow and bloom screen onto the scene rather than add, so a lit floor under a blast brightens toward white without clipping flat.
  const glowSprite = new Sprite();
  glowSprite.blendMode = 'screen';
  const bloomSprite = new Sprite();
  bloomSprite.blendMode = 'screen';
  root.addChild(waterLayer, world, nightSprite, glowSprite, bloomSprite);

  const lights = new Container({ isRenderGroup: true });
  const lightPool = pool(lights, sprite('add'));
  // Lights and glows add up past 1 where they overlap; they are summed in half floats where the GPU can render to them, then
  // rolled off by a knee into the 8-bit buffers that are drawn, so a night blast shades instead of clipping to a white disc.
  const float = !!renderer.context.extensions.colorBufferFloat;
  let lightSum: RenderTexture | null = null;
  let lightRT: RenderTexture | null = null;
  let glowSum: RenderTexture | null = null;
  let glowFullSum: RenderTexture | null = null;
  let glowFullRT: RenderTexture | null = null;
  let glowRT: RenderTexture | null = null;
  let bloomRT: RenderTexture | null = null;
  const lightKnee = createKnee(0.8, 1);
  /** Bloom adds at most this much to any channel, however many glows stack. */
  const glowKnee = createKnee(0, 0.5);
  /** The glow layer itself keeps its colour to 0.6, then rolls off below 0.9, so three stacked fireballs still show their shape. */
  const glowFullKnee = createKnee(0.6, 0.9);
  const blurSprite = new Sprite();
  const blur = new BlurFilter({ strength: 5, quality: 3 });
  blurSprite.filters = [blur];
  const blurRoot = new Container({ isRenderGroup: true });
  blurRoot.addChild(blurSprite);

  const ground = createGround(art, groundLayer, waterLayer);
  const floorMarks = createRing(MARK_CAP);
  const casingMarks = createRing(CASING_CAP, CASING_LIFE_MS);
  /** The map the marks were left on: a new one wipes the floor. */
  let markedLayout = '';
  const seen = new WeakSet<Effect>();
  const liveShadows = new Graphics();
  shadowLayer.addChild(liveShadows);
  /** The crates the live shadows were last built for, so a still scene keeps its geometry. */
  let shadowed = '';

  const decalPool = pool(decalLayer, sprite());
  const minePool = pool(casingLayer, sprite());
  const casingPool = pool(casingLayer, sprite());
  const shadowPool = pool(shadowLayer, sprite());
  const solidPool = pool(solidLayer, sprite());
  const solidGlowPool = pool(glowWorld, sprite('add'));
  const zombiePool = pool(actorLayer, sprite());
  const downedPool = pool(remainsLayer, sprite());
  const remainsPool = pool(remainsLayer, sprite());
  const bodyPool = pool(actorLayer, () => makeBody());
  const thrownPool = pool(actorLayer, sprite());
  const fxPool = pool(fxLayer, sprite());
  const flyPool = pool(fxLayer, sprite());
  const glowPool = pool(glowWorld, sprite('add'));
  const abovePool = pool(aboveLayer, sprite());
  /** Each overhead piece's drawn opacity by its key and spot, eased toward shown or faded. */
  const fades = new Map<string, number>();
  let lastDraw = 0;

  function makeBody(): Container {
    const root = new Container();
    const parts = {
      ring: new Sprite(tex.ring), legs: new Sprite(), legsTeam: new Sprite(), base: new Sprite(), team: new Sprite(), armor: new Sprite(), gun: new Sprite(), mag: new Sprite(), action: new Sprite(), flash: new Sprite(tex.disc),
      chevrons: [new Sprite(tex.chevron), new Sprite(tex.chevron)], hunted: new Sprite(tex.brackets), guard: new Sprite(tex.ring), shield: new Sprite(tex.arc), killer: new Sprite(tex.ring),
    };
    for (const s of [parts.ring, parts.flash, parts.hunted, parts.guard, parts.shield, parts.killer, ...parts.chevrons]) s.anchor.set(0.5);
    parts.flash.blendMode = 'add';
    root.addChild(parts.ring, parts.killer, parts.legs, parts.legsTeam, parts.gun, parts.mag, parts.action, parts.base, parts.team, parts.armor, parts.flash, parts.hunted, parts.guard, parts.shield, ...parts.chevrons);
    (root as Container & { parts: Omit<BodyView, 'root'> }).parts = parts;
    return root;
  }

  /** Points `s` at a baked frame, anchored and scaled so the frame's box lands in game units around (x, y). */
  function place(s: Sprite, name: string, layer: Layer, dir: number, frame: number, x: number, y: number, rotation = 0) {
    const spec = SPRITES[name]!;
    const t = art.frame(name, layer, dir, frame);
    s.texture = t;
    s.anchor.set(-spec.box.x / spec.box.w, -spec.box.y / spec.box.h);
    s.scale.set(spec.box.w / t.width, spec.box.h / t.height);
    s.position.set(x, y);
    s.rotation = rotation;
    s.alpha = 1;
    s.tint = 0xffffff;
  }

  function mark(s: Sprite, t: Texture, x: number, y: number, size: number, tint: number, alpha: number, rotation = 0) {
    s.texture = t;
    s.anchor.set(0.5);
    s.position.set(x, y);
    s.width = s.height = size;
    s.tint = tint;
    s.alpha = alpha;
    s.rotation = rotation;
  }

  function drawBody(b: BodyLook, now: number) {
    const root = bodyPool.next() as Container & { parts: Omit<BodyView, 'root'> };
    const p = root.parts;
    root.position.set(b.x + b.dx, b.y + b.dy);
    root.scale.set(b.scale);
    root.alpha = b.alpha;
    const { dir, rest } = facing(b.angle, SPRITES.soldier!.dirs);
    const pose = facing(b.angle, SPRITES[b.torso.sprite]!.dirs);
    const lit = grey(b.light);
    const gait = facing(b.legs.heading, SPRITES['soldier.legs']!.dirs);
    place(p.legs, 'soldier.legs', 'base', gait.dir, b.legs.frame, 0, 0, gait.rest);
    p.legs.tint = lit;
    place(p.legsTeam, 'soldier.legs', 'team', gait.dir, b.legs.frame, 0, 0, gait.rest);
    place(p.base, b.torso.sprite, 'base', pose.dir, b.torso.frame, 0, 0, pose.rest);
    p.base.tint = lit;
    place(p.team, b.torso.sprite, 'team', pose.dir, b.torso.frame, 0, 0, pose.rest);
    const tc = hex(b.color);
    p.team.tint = b.light === 1 ? tc : shadeNum(tc, b.light);
    p.legsTeam.tint = p.team.tint;
    p.armor.visible = b.armor !== 'none';
    if (p.armor.visible) { place(p.armor, 'soldier', b.armor === 'light' ? 'armorLight' : b.armor === 'medium' ? 'armorMedium' : 'armorHeavy', dir, 0, 0, 0, rest); p.armor.tint = lit; }
    // The gun lies under the torso, so the hands baked on its grip and fore-end sit on top of it.
    const c = Math.cos(b.angle), s = Math.sin(b.angle), back = RECOIL * b.gunKick;
    place(p.gun, `gun.${b.gun}`, 'base', 0, GUN_FRAMES.body, -c * back, -s * back, b.angle);
    p.gun.tint = lit;
    p.mag.visible = b.parts.mag;
    if (b.parts.mag) { place(p.mag, `gun.${b.gun}`, 'base', 0, GUN_FRAMES.mag, -c * back, -s * back, b.angle); p.mag.tint = lit; }
    place(p.action, `gun.${b.gun}`, 'base', 0, GUN_FRAMES.action, -c * (back + b.parts.action), -s * (back + b.parts.action), b.angle);
    p.action.tint = lit;
    p.flash.visible = b.flash > 0;
    if (b.flash > 0) mark(p.flash, tex.disc, 0, 0, R * 2.2, 0xffffff, b.flash * 0.8);
    p.ring.visible = b.ring !== null;
    if (b.ring) mark(p.ring, b.ring === 'self' ? tex.ring : tex.ringDashed, 0, 0, (R + 5) * 2 + 4, b.ring === 'self' ? tc : hex(PALETTE.rival), b.ring === 'self' ? 0.55 : 0.9);
    p.killer.visible = b.killer;
    if (b.killer) mark(p.killer, tex.ring, 0, 0, (R + 11) * 2 + 5, hex(PALETTE.hunted), 0.65 + 0.35 * (0.5 + 0.5 * Math.sin(now / 200)));
    p.hunted.visible = b.hunted;
    if (b.hunted) mark(p.hunted, tex.brackets, 0, 0, (R + 13) * 2, hex(PALETTE.hunted), 0.55 + 0.4 * (0.5 + 0.5 * Math.sin(now / 220)));
    p.guard.visible = b.spawnShield;
    if (b.spawnShield) mark(p.guard, tex.ring, 0, 0, (R + 5) * 2 + 4, hex(PALETTE.shield), 0.55 + 0.25 * Math.sin(now / 120));
    p.shield.visible = b.shield;
    if (b.shield) mark(p.shield, tex.arc, 0, 0, (R + 6) * 2 * (64 / 56), hex(PALETTE.shield), 1, b.angle);
    p.chevrons.forEach((c, i) => {
      c.visible = i < b.stage;
      if (c.visible) mark(c, tex.chevron, 0, MARK_Y - i * 6, 13, b.stage === 2 ? hex(PALETTE.gold) : 0xc9ced8, 1);
      c.height = 8;
    });
  }

  /** The fallen, each with the gun it dropped: a soft shadow under the gun, then the gun's frames, then the body over them. */
  function drawRemains(scene: Scene) {
    for (const r of scene.remains) {
      mark(remainsPool.next(), tex.disc, r.gun.x + 3, r.gun.y + 4, R * 1.3, 0x141820, 0.25 * r.alpha);
      for (const frame of [GUN_FRAMES.body, GUN_FRAMES.mag, GUN_FRAMES.action]) {
        const g = remainsPool.next();
        place(g, `gun.${r.gun.gun}`, 'base', 0, frame, r.gun.x, r.gun.y, r.gun.angle);
        g.alpha = r.alpha;
      }
      for (const layer of ['base', 'team'] as const) {
        const s = remainsPool.next();
        place(s, 'soldier.die', layer, 0, r.frame, r.x, r.y, r.turn);
        s.alpha = r.alpha;
        if (layer === 'team') s.tint = hex(shade(r.color, 0.8));
      }
    }
  }

  function drawZombies(scene: Scene, now: number) {
    for (const z of scene.zombies) {
      const s = zombiePool.next();
      const { dir, rest } = facing(z.angle, SPRITES[`zombie.${z.kind}`]!.dirs);
      place(s, `zombie.${z.kind}`, 'base', dir, 0, z.x, z.y + Math.sin(now / 180 + z.id) * 0.6, rest);
      s.tint = grey(z.light);
      if (z.flash > 0) mark(glowPool.next(), tex.disc, z.x, z.y, ZOMBIES[z.kind].radius * 2.2, 0xffffff, z.flash * 0.7);
      if (scene.dark > 0.3) {
        const r = ZOMBIES[z.kind].radius;
        for (const side of [-1, 1]) {
          const a = z.angle + side * 0.42;
          mark(glowPool.next(), tex.glow, z.x + Math.cos(a) * r * 0.55, z.y + Math.sin(a) * r * 0.55, r * 0.7, hex(ZOMBIE_LOOK[z.kind].eye === '#1b1d22' ? '#ff5a3c' : ZOMBIE_LOOK[z.kind].eye), scene.dark);
        }
      }
    }
  }

  function drawShadows(scene: Scene) {
    const [sx, sy] = ART.sun.shadow;
    for (const b of scene.bodies) {
      if (b.alpha < 1) continue;
      const s = shadowPool.next();
      const { dir, rest } = facing(b.angle, SPRITES['soldier.shadow']!.dirs);
      place(s, 'soldier.shadow', 'shadow', dir, 0, b.x, b.y, rest);
      s.alpha = b.light === 1 ? SOLDIER_SHADOW : SOLDIER_SHADOW * 0.35;
    }
    for (const d of scene.downed) mark(shadowPool.next(), tex.disc, d.x + sx * 8, d.y + sy * 8, R * 2.2, 0x141820, 0.35);
    for (const z of scene.zombies) {
      const r = ZOMBIES[z.kind].radius;
      mark(shadowPool.next(), tex.disc, z.x + sx * r * 0.7, z.y + sy * r * 0.7, r * 2.6, 0x141820, z.light === 1 ? 0.42 : 0.15);
    }
    // Breakable pieces cast live, since a baked shadow would outlive them. Each sprite is sheared about its top, so its
    // foot, and the shadow leaving it, sits its south face's depth below the solid.
    const key = scene.crates.map((c) => `${c.id}:${c.wear}`).join();
    if (key === shadowed) return;
    shadowed = key;
    liveShadows.clear();
    for (const c of scene.crates) {
      const h = c.height * (1 - 0.5 * c.wear);
      const face = h * ART.camera.shear, dx = sx * h * SHADOW_PER_HEIGHT, dy = sy * h * SHADOW_PER_HEIGHT;
      if (c.piece.startsWith('barrel')) liveShadows.poly(capsule(c.x + c.w / 2, c.y + c.h / 2 + face, c.w / 2, dx, dy));
      else {
        // The hull of the foot and its copy cast south-west, the way ART.sun.shadow falls.
        const x0 = c.x, x1 = c.x + c.w, y0 = c.y + face, y1 = c.y + c.h + face;
        liveShadows.poly([x0, y0, x1, y0, x1, y1, x1 + dx, y1 + dy, x0 + dx, y1 + dy, x0 + dx, y0 + dy]);
      }
      liveShadows.fill({ color: LIVE_SHADOW.color, alpha: LIVE_SHADOW.alpha });
    }
  }

  /** A kit piece: its baked look when the atlas has it, else its greybox top and south face. */
  function piece(into: Pool<Sprite>, grey: Graphics, key: string, p: PieceId, x: number, y: number, w: number, h: number, height: number, alpha: number, mirror = false) {
    if (SPRITES[key] && art.has(key, 'base')) {
      for (const [pool, layer] of [[into, 'base'], [solidGlowPool, 'glow']] as const) {
        if (layer === 'glow' && !art.has(key, 'glow')) continue;
        const s = pool.next();
        place(s, key, layer, 0, 0, mirror ? x + w : x, y);
        if (mirror) s.scale.x *= -1;
        s.alpha = alpha;
      }
      return;
    }
    const look = blockLook(p);
    const face = height * ART.camera.shear;
    grey.rect(x, y + h - face, w, face).fill({ color: look.face, alpha });
    grey.rect(x, y - face, w, h).fill({ color: look.top, alpha }).stroke({ width: 2, color: look.edge, alpha: alpha * 0.8 });
  }

  /** The train, then the overhead pieces, faded toward see-through while someone stands under them. */
  function drawAbove(scene: Scene, now: number) {
    const dt = Math.min(100, now - lastDraw);
    // The cars are baked heading east or south; a westbound train is the eastbound one mirrored, while a northbound one keeps
    // its south-facing look, since flipping it would put its lit south face on top.
    const train = scene.train;
    for (const car of train?.cars ?? []) piece(abovePool, aboveBlocks, car.key, 'container.rust', car.x, car.y, car.w, car.h, TRAIN.height, 1, train!.back && train!.axis === 'x');
    const seen = new Set<string>();
    for (const o of scene.overheads) {
      const id = `${o.key}@${o.x},${o.y}`;
      seen.add(id);
      const target = o.under ? OVERHEAD_FADED : 1;
      const was = fades.get(id) ?? target;
      const a = was + (target - was) * Math.min(1, dt / OVERHEAD_EASE_MS);
      fades.set(id, a);
      piece(abovePool, aboveBlocks, o.key, o.p, o.x, o.y, o.w, o.h, o.height, a);
    }
    for (const id of fades.keys()) if (!seen.has(id)) fades.delete(id);
    lastDraw = now;
  }

  /**
   * Flames licking up from spots across a burning patch of radius `r`, each at its own phase of the looping flipbook, with
   * smoke rising off them and embers. `size` scales the flames; the tier's density thins flames, smoke and embers alike.
   */
  function drawFire(x: number, y: number, r: number, seed: number, size: number, now: number) {
    const flicker = 0.8 + 0.2 * Math.sin(now / 70 + seed) * Math.sin(now / 113 + seed * 3);
    mark(glowPool.next(), tex.glow, x, y, (r * 2 + 50 * size) * flicker, 0xff8a30, 0.5 * flicker);
    const flames = Math.max(1, Math.round((1 + r / 10) * density));
    for (let i = 0; i < flames; i++) {
      const a = hash(seed, i) * TAU, d = r * 0.6 * Math.sqrt(hash(seed, i + 17));
      const fx = x + Math.cos(a) * d, fy = y + Math.sin(a) * d * 0.7;
      const frame = Math.floor(now / 75 + hash(seed, i + 5) * 40) % FIRE_FRAMES;
      const sc = size * (0.65 + 0.45 * hash(seed, i + 31)) * (0.92 + 0.08 * Math.sin(now / 90 + i));
      // The flame's own colour first, so it holds its shape over a sunlit floor, then its glow, which blooms.
      for (const [into, tint, alpha] of [[fxPool, 0xc84a12, 0.6], [glowPool, 0xffffff, 0.95]] as const) {
        const s = into.next();
        place(s, 'fx.fire', 'glow', 0, frame, fx, fy);
        s.scale.x *= sc; s.scale.y *= sc;
        s.tint = tint;
        s.alpha = alpha;
      }
    }
    const puffs = Math.max(1, Math.round((1 + r / 30) * 2 * density));
    for (let i = 0; i < puffs; i++) {
      const h = hash(seed, i + 50), p = (now / 2600 + i / puffs + h) % 1;
      const s = fxPool.next();
      place(s, 'fx.smoke', 'base', 0, (i + seed) & 3, x + (h - 0.5) * r * 0.8 + 30 * p * size, y - 30 * size - 130 * p * size, h * TAU + p);
      const grow = size * (0.7 + 1.9 * p);
      s.scale.x *= grow; s.scale.y *= grow;
      s.tint = 0x34302c;
      s.alpha = 0.55 * Math.sin(Math.PI * Math.min(1, p * 1.4)) * (1 - p * 0.4);
    }
    const embers = Math.round((2 + r / 12) * density);
    for (let i = 0; i < embers; i++) {
      const h = hash(seed, i + 90), p = (now / 1100 + i / embers + h) % 1;
      mark(glowPool.next(), tex.glow, x + (h - 0.5) * r * 1.2 + Math.sin(now / 200 + i) * 6, y - p * 100 * Math.max(0.6, size), 8 * (1 - p), i % 2 ? 0xffc050 : 0xff7020, 1 - p);
    }
  }

  function drawFires(scene: Scene, now: number) {
    for (const f of scene.fires) drawFire(f.x, f.y, f.r, f.id, 1.25, now);
    for (const p of scene.pieces) if (p.p === 'barrel.fire') drawFire(p.x + p.w / 2, p.y + p.h / 2 - p.height * ART.camera.shear, 6, p.x * 7 + p.y, 0.42, now);
  }

  function drawSolids(scene: Scene, now: number) {
    for (const w of scene.engineerWalls) place(solidPool.next(), w.w > w.h ? 'engineer.wall.h' : 'engineer.wall.v', 'base', 0, 0, w.x, w.y);
    for (const b of scene.siege) {
      place(solidPool.next(), b.kind === 'wall' ? siegeWallSprite(b.wear) : 'siege.pad', 'base', 0, 0, b.x, b.y);
      if (b.barrel && b.kind !== 'wall') drawTurret(b.kind, b.x + b.w / 2, b.y + b.h / 2, b.barrel.angle, b.barrel.recoil, 1);
      if (b.ammo !== null) {
        const empty = b.ammo === 0;
        over.roundRect(b.x + 7, b.y + b.h - 9, b.w - 14, 5, 2.5).fill({ color: 0x1c1f26, alpha: 0.7 });
        if (!empty || Math.floor(now / 250) % 2 === 0) over.roundRect(b.x + 8, b.y + b.h - 8, empty ? b.w - 16 : Math.max(3, ((b.w - 16) * b.ammo) / 10), 3, 1.5).fill(empty ? PALETTE.hpBad : TURRET_LOOK[b.kind as TurretKind].ammo);
      }
      if (b.flash > 0) over.rect(b.x, b.y, b.w, b.h).fill({ color: 0xffffff, alpha: 0.7 * b.flash });
    }
    for (const p of scene.pieces) piece(solidPool, blocks, p.key, p.p, p.x, p.y, p.w, p.h, p.height, 1);
    for (const c of scene.crates) piece(solidPool, blocks, c.key, c.piece, c.x, c.y, c.w, c.h, c.height * (1 - 0.5 * c.wear), 1);
    for (const p of scene.pieces) if (p.p === 'signal') {
      const on = scene.train ? Math.floor(now / 250) % 2 === 0 : false;
      mark(solidGlowPool.next(), tex.glow, p.x + p.w / 2, p.y + p.h / 2 - p.height * ART.camera.shear, on ? 90 : 30, 0xff3a2e, on ? 0.9 : 0.35);
    }
    const core = scene.core;
    if (core) {
      place(solidPool.next(), 'core', 'base', 0, 0, core.x - ZOM.coreHalf, core.y - ZOM.coreHalf);
      const pulse = 0.5 + 0.5 * Math.sin(now / 420);
      const g = solidGlowPool.next();
      place(g, 'core', 'glow', 0, 0, core.x - ZOM.coreHalf, core.y - ZOM.coreHalf);
      g.alpha = 0.7 + 0.3 * pulse;
      g.tint = core.hp > 0.35 ? 0xffffff : hex(PALETTE.hpBad);
      mark(solidGlowPool.next(), tex.glow, core.x, core.y, 200 + 12 * pulse, core.hp > 0.35 ? 0x4fd1e8 : hex(PALETTE.hpBad), 0.25 + 0.1 * pulse);
      if (core.hit > 0) over.rect(core.x - ZOM.coreHalf, core.y - ZOM.coreHalf, ZOM.coreHalf * 2, ZOM.coreHalf * 2).fill({ color: 0xffffff, alpha: 0.6 * core.hit });
      over.circle(core.x, core.y, 84).stroke({ width: 7, color: 0x1c1f26, alpha: 0.3 });
      arcFrom(over, core.x, core.y, 84, -Math.PI / 2, -Math.PI / 2 + core.hp * TAU).stroke({ width: 5, color: core.hp > 0.5 ? PALETTE.hpGood : core.hp > 0.25 ? PALETTE.gold : PALETTE.hpBad, cap: 'round' });
    }
  }

  function drawTurret(kind: TurretKind, x: number, y: number, angle: number, recoil: number, alpha: number) {
    const s = solidPool.next();
    place(s, `turret.${kind}`, 'base', 0, 0, x - Math.cos(angle) * recoil * 5, y - Math.sin(angle) * recoil * 5, angle);
    s.alpha = alpha;
    if (art.has(`turret.${kind}`, 'glow')) {
      const g = solidGlowPool.next();
      place(g, `turret.${kind}`, 'glow', 0, 0, s.x, s.y, angle);
      g.alpha = alpha;
    }
  }

  function dashedCircle(g: Graphics, x: number, y: number, r: number, dash: number, gap: number, offset: number, style: { width: number; color: ColorSource; alpha: number }) {
    const step = (dash + gap) / r;
    const start = (offset / r) % step;
    for (let a = start; a < TAU + start; a += step) g.moveTo(x + Math.cos(a) * r, y + Math.sin(a) * r).arc(x, y, r, a, a + dash / r);
    g.stroke({ ...style, cap: 'round' });
  }

  function drawUnder(scene: Scene, now: number) {
    for (const z of scene.zones) {
      under.circle(z.x, z.y, z.r).fill({ color: z.color, alpha: 0.1 }).circle(z.x, z.y, z.r).stroke({ width: 4, color: z.color, alpha: 0.6 });
      dashedCircle(under, z.x, z.y, z.r - 14, 3, 18, 0, { width: 6, color: z.color, alpha: 0.35 });
      if (z.progress > 0) arcFrom(under, z.x, z.y, z.r - 14, -Math.PI / 2, -Math.PI / 2 + z.progress * TAU).stroke({ width: 8, color: z.progressColor, alpha: 0.9 });
    }
    for (const d of scene.trails) under.moveTo(d.x0, d.y0).lineTo(d.x1, d.y1).stroke({ width: d.dashing ? R * 0.42 : R * 0.19, color: 0xffffff, alpha: 0.9 * d.fade, cap: 'round' });
    const pulse = 0.5 + 0.5 * Math.sin(now / 90);
    for (const c of scene.dangers) {
      under.circle(c.x, c.y, c.r).fill({ color: 0xe5484d, alpha: 0.07 + 0.06 * pulse });
      dashedCircle(under, c.x, c.y, c.r, 14, 10, now / 40, { width: 3, color: 0xe5484d, alpha: 0.55 + 0.35 * pulse });
    }
    for (const m of scene.mines) {
      place(minePool.next(), 'thrown.landMine', 'base', 0, 0, m.x, m.y);
      if (Math.floor(now / 400) % 2) mark(glowPool.next(), tex.glow, m.x, m.y, 26, 0xff4d4f, 0.9);
    }
  }

  function drawOver(scene: Scene, now: number) {
    for (const g of scene.gas) {
      over.circle(g.x, g.y, g.r).fill(PALETTE.gas);
      for (let i = 0; i < 7; i++) {
        const a = (i / 7) * TAU + (now / 2400) * (i % 2 ? 1 : -1);
        const d = g.r * (0.45 + 0.12 * Math.sin(now / 700 + i));
        over.circle(g.x + Math.cos(a) * d, g.y + Math.sin(a) * d, g.r * 0.42).fill(PALETTE.gas);
      }
      dashedCircle(over, g.x, g.y, g.r, 10, 10, now / 60, { width: 3, color: PALETTE.gasEdge, alpha: 1 });
    }
    for (const d of scene.downed) {
      over.circle(d.x, d.y, R + 10).stroke({ width: 3, color: d.self ? d.color : 'rgba(28, 31, 38, 0.25)' });
      if (d.revive > 0) arcFrom(over, d.x, d.y, R + 10, -Math.PI / 2, -Math.PI / 2 + d.revive * TAU).stroke({ width: 3, color: PALETTE.hpGood, cap: 'round' });
    }
    if (scene.ring) {
      const { x, y, r, next } = scene.ring;
      const v = scene.view;
      over.rect(v.x0, v.y0, v.x1 - v.x0, v.y1 - v.y0).fill({ color: 0x4b2f86, alpha: 0.2 }).circle(x, y, r).cut();
      over.circle(x, y, r).stroke({ width: 6, color: 0xb48cff, alpha: 0.85 });
      if (next) dashedCircle(over, next.x, next.y, next.r, 24, 18, 0, { width: 3, color: 0xffffff, alpha: 0.55 });
    }
    for (const l of scene.loot) {
      const pad = l.cache ? 4 : 3;
      over.rect(l.x - pad, l.y - pad, l.w + pad * 2, l.h + pad * 2).stroke({ width: l.cache ? 3 : 1.5, color: PALETTE.gold, alpha: l.cache ? 1 : 0.6 });
    }
    for (const d of scene.drops) {
      const size = 64;
      if (d.landsIn !== null) {
        const pulse = 0.5 + 0.5 * Math.sin(now / 180);
        over.circle(d.x, d.y, size * (0.8 + 0.25 * pulse)).stroke({ width: 4, color: PALETTE.gold, alpha: 0.55 + 0.35 * pulse });
      } else over.rect(d.x - size / 2 - 4, d.y - size / 2 - 4, size + 8, size + 8).stroke({ width: 3, color: PALETTE.gold });
    }
    if (scene.ghost) {
      const { ghost, self, core } = scene.ghost;
      dashedCircle(over, core.x, core.y, ZOM.buildRadius, 12, 10, now / 60, { width: 3, color: 'rgb(214, 160, 20)', alpha: 0.75 });
      dashedCircle(over, self.x, self.y, ZOM.reachPx, 12, 10, now / 60, { width: 3, color: 'rgb(40, 44, 52)', alpha: 0.45 });
      const x = ghost.cx * ZOM.cell, y = ghost.cy * ZOM.cell, w = ZOM.cell, h = ZOM.cell;
      const color = ghost.refusal === null ? PALETTE.hpGood : ghost.refusal === 'taken' ? '#ff9f43' : PALETTE.hpBad;
      if (ghost.kind !== 'wall' && ghost.refusal !== 'taken') drawTurret(ghost.kind, x + w / 2, y + h / 2, Math.atan2(y + h / 2 - core.y, x + w / 2 - core.x), 0, 0.6);
      over.rect(x, y, w, h).fill({ color, alpha: 0.3 + 0.1 * Math.sin(now / 160) }).rect(x + 1.5, y + 1.5, w - 3, h - 3).stroke({ width: 3, color });
    }
  }

  function drawThrown(scene: Scene, now: number) {
    for (const t of scene.thrown) {
      place(thrownPool.next(), `thrown.${t.kind}`, 'base', 0, 0, t.x, t.y, now / 300);
      if (t.kind === 'fragGrenade') for (let i = 0; i < 8; i++) {
        const a = (i / 8) * TAU + now / 300;
        over.rect(t.x + Math.cos(a) * 13 - 2, t.y + Math.sin(a) * 13 - 2, 4, 4).fill(0x1c1f26);
      }
    }
  }

  function drawTracers(scene: Scene) {
    for (const t of scene.tracers) {
      const len = Math.hypot(t.x1 - t.x0, t.y1 - t.y0);
      if (len < 1) continue;
      const a = Math.atan2(t.y1 - t.y0, t.x1 - t.x0);
      for (const [w, color, alpha] of [[t.r * 6, t.glow, 0.55], [t.r * 2, t.hot, 1]] as const) {
        const s = glowPool.next();
        s.texture = tex.streak;
        s.anchor.set(1, 0.5);
        s.position.set(t.x1, t.y1);
        s.rotation = a;
        s.width = len;
        s.height = w * 2;
        s.tint = hex(color);
        s.alpha = alpha;
      }
      mark(glowPool.next(), tex.glow, t.x1, t.y1, t.r * 7, hex(t.glow), 0.7);
    }
  }

  function drawEffects(scene: Scene, now: number, walls: readonly WallView[]) {
    for (const fx of scene.effects) {
      const k = Math.max(0, now - fx.born) / EFFECT_LIFE_MS[fx.kind];
      if (!seen.has(fx)) {
        seen.add(fx);
        const left = marksOf(fx, walls, Math.random);
        for (const m of left.floor) add(floorMarks, m);
        for (const m of left.casings) add(casingMarks, m);
      }
      if (k >= 1) continue;
      switch (fx.kind) {
        case 'impact':
          // Hard cover sparks where the round strikes; wood, sandbags and planters only throw grit.
          if (fx.victim === null && (fx.material === 'metal' || fx.material === 'concrete' || fx.material === undefined)) {
            const fade = Math.max(0, 1 - k * 2.5);
            const hot = fx.material === 'metal' ? 1.5 : 1;
            if (fade > 0) mark(glowPool.next(), tex.glow, fx.x, fx.y, 26 * hot * (0.6 + 0.4 * fade), 0xffc04a, fade);
          }
          break;
        case 'boom': {
          const spec = SPRITES['fx.explosion']!;
          const frame = Math.min(spec.frames - 1, Math.floor(k * spec.frames));
          const scale = fx.r / 110;
          const smoke = fxPool.next();
          place(smoke, 'fx.explosion', 'base', 0, frame, fx.x, fx.y);
          smoke.scale.x *= scale; smoke.scale.y *= scale;
          const fire = glowPool.next();
          place(fire, 'fx.explosion', 'glow', 0, frame, fx.x, fx.y);
          fire.scale.x *= scale; fire.scale.y *= scale;
          const wave = 1 - (1 - k) * (1 - k);
          over.circle(fx.x, fx.y, fx.r * (0.4 + 0.75 * wave)).stroke({ width: 8 * (1 - k) + 1, color: 0xffe2b0, alpha: (1 - k) * 0.4 });
          break;
        }
        case 'flash': {
          const base = GUNS[fx.gun].base, quiet = GUNS[fx.gun].silenced ? 0.35 : 1;
          const s = glowPool.next();
          place(s, `fx.muzzle.${base}`, 'glow', 0, Math.min(2, Math.floor(k * 3)), fx.x, fx.y, fx.angle);
          s.scale.x *= 0.5 + 0.5 * quiet; s.scale.y *= 0.5 + 0.5 * quiet;
          s.alpha = quiet;
          mark(glowPool.next(), tex.glow, fx.x + Math.cos(fx.angle) * 6, fx.y + Math.sin(fx.angle) * 6, FLASH[base].glow * (0.6 + 0.4 * quiet), 0xffb43a, 0.35 * (1 - k) * quiet);
          break;
        }
        case 'slash': {
          const from = fx.angle - 1.1, to = from + 2.2 * Math.min(1, k * 3);
          arcFrom(over, fx.x, fx.y, R + 34, from, to).stroke({ width: 12 * (1 - k * 0.5), color: 'rgb(28, 31, 38)', alpha: 0.35 * (1 - k), cap: 'round' });
          arcFrom(over, fx.x, fx.y, R + 32, from, to).stroke({ width: 5 * (1 - k * 0.5), color: 0xffffff, alpha: 1 - k, cap: 'round' });
          break;
        }
        case 'death':
          over.circle(fx.x, fx.y, R * (0.8 + 1.4 * Math.sqrt(k))).stroke({ width: 3 * (1 - k) + 0.5, color: 0xffffff, alpha: (1 - k) * 0.6 });
          break;
        case 'splat': {
          const r = ZOMBIES[fx.zombie].radius, color = ZOMBIE_LOOK[fx.zombie].arm;
          over.circle(fx.x, fx.y, r * (0.9 + 0.5 * Math.sqrt(k))).fill({ color, alpha: 0.55 * (1 - k) });
          over.circle(fx.x, fx.y, r * (1 + 1.2 * Math.sqrt(k))).stroke({ width: 3 * (1 - k) + 1, color, alpha: (1 - k) * 0.5 });
          break;
        }
        case 'tracer': {
          const ms = now - fx.born;
          if (ms < 70) place(glowPool.next(), 'fx.muzzle.lmg', 'glow', 0, Math.min(2, Math.floor((ms / 70) * 3)), fx.x, fx.y, fx.angle);
          const { bulletSpeed, bullet } = BUILDINGS[fx.turret].turret;
          const head = (bulletSpeed * ms) / 1000;
          if (head > fx.reach) break;
          const tail = Math.max(0, head - bulletSpeed * 0.03);
          const c = Math.cos(fx.angle), s = Math.sin(fx.angle);
          const t = glowPool.next();
          t.texture = tex.streak;
          t.anchor.set(1, 0.5);
          t.position.set(fx.x + c * head, fx.y + s * head);
          t.rotation = fx.angle;
          t.width = Math.max(1, head - tail);
          t.height = bullet.r * 5;
          t.tint = hex(PALETTE.tracer);
          t.alpha = 1;
          break;
        }
        case 'broke':
          break;
      }
    }
  }

  /** A mark at rest lies in its floor layer under the cover; one still flying is drawn over everything, lifted by its hop. */
  function drawMark(p: Placed, rest: Pool<Sprite>, view: Scene['view']) {
    const { m } = p;
    if (p.x < view.x0 || p.x > view.x1 || p.y < view.y0 || p.y > view.y1) return;
    const s = (p.flying ? flyPool : rest).next();
    place(s, m.sprite, 'base', 0, m.frame, p.x, p.y - p.lift, p.turn);
    const grow = m.scale * (1 + p.lift / 40);
    s.scale.x *= grow; s.scale.y *= grow;
    s.alpha = p.alpha;
    s.tint = m.tint;
  }

  function drawMarks(scene: Scene, now: number) {
    if (scene.layout !== markedLayout) {
      markedLayout = scene.layout;
      clear(floorMarks);
      clear(casingMarks);
    }
    // Oldest first, so newer marks lie on top.
    for (const p of visible(floorMarks, k.decals, now).reverse()) drawMark(p, decalPool, scene.view);
    for (const p of visible(casingMarks, k.casings, now).reverse()) drawMark(p, casingPool, scene.view);
  }

  function drawParticles(scene: Scene, now: number) {
    let left = k.particles;
    const slots = scene.particles.slots;
    for (let i = 0; i < slots.length; i++) {
      const p = slots[i]!;
      if (!isLive(p, now)) continue;
      // A lower tier keeps an even share of every burst rather than whichever particles come first.
      if (density < 1 && hash(i, 0.5) >= density) continue;
      if (left-- <= 0) break;
      const { x, y, k } = particleAt(p, now);
      if (p.shape === 'smoke') {
        const s = fxPool.next();
        place(s, 'fx.smoke', 'base', 0, Math.floor(p.vx * 7 + p.vy * 3) & 3, x, y, p.born * 0.001);
        const grow = (p.size * (1 + p.grow * k)) / 32;
        s.scale.x *= grow; s.scale.y *= grow;
        s.alpha = 0.6 * Math.min(1, k * 8) * (1 - k);
        s.tint = hex(p.color);
      } else if (p.shape === 'chip') {
        const s = fxPool.next();
        const r = p.size * (1 - k * 0.5);
        s.texture = tex.white;
        s.anchor.set(0.5);
        s.position.set(x, y);
        s.width = s.height = r;
        s.rotation = p.born;
        s.tint = hex(p.color);
        s.alpha = 1 - k * k;
      } else if (p.shape === 'ember') {
        const flicker = 0.7 + 0.3 * Math.sin(now / 40 + i);
        mark(glowPool.next(), tex.glow, x, y - k * 30, p.size * 3.2 * (1 - k * 0.6), hex(p.color), (1 - k) * flicker);
      } else {
        const s = glowPool.next();
        const speed = Math.exp((-p.drag * (now - p.born)) / 1000);
        s.texture = tex.streak;
        s.anchor.set(1, 0.5);
        s.position.set(x, y);
        s.rotation = Math.atan2(p.vy, p.vx);
        s.width = Math.max(2, Math.hypot(p.vx, p.vy) * speed * 0.03);
        s.height = p.size * 1.6;
        s.tint = hex(p.color);
        s.alpha = 1 - k * k;
      }
    }
  }

  function drawCracks(scene: Scene) {
    for (const c of scene.cracks) {
      for (let i = 0; i < c.lines.length; i += 4) cracks.moveTo(c.lines[i]!, c.lines[i + 1]!).lineTo(c.lines[i + 2]!, c.lines[i + 3]!);
      cracks.stroke({ width: 0.8, color: 0x22242a, alpha: 0.7 * c.alpha, cap: 'round' });
    }
  }

  function drawLights(scene: Scene, now: number) {
    lightPool.begin();
    let left = k.lights;
    const light = (x: number, y: number, r: number, color: number, alpha: number) => { if (left-- > 0) mark(lightPool.next(), tex.light, x, y, r * 2, color, alpha); };
    // Most telling first, so a low cap drops other players' and tracers' lights before your own and the blasts.
    if (scene.core) light(scene.core.x, scene.core.y, 300, 0x4fd1e8, 0.8);
    for (const b of scene.bodies) if (b.ring === 'self') light(b.x, b.y, 380, 0xfff2dc, 0.9);
    for (const fx of scene.effects) {
      const k = Math.max(0, now - fx.born) / EFFECT_LIFE_MS[fx.kind];
      if (k >= 1) continue;
      if (fx.kind === 'flash') light(fx.x, fx.y, FLASH[GUNS[fx.gun].base].light * (GUNS[fx.gun].silenced ? 0.5 : 1), 0xffb060, 1 - k);
      if (fx.kind === 'boom') light(fx.x, fx.y, fx.r * 3.5, 0xffa050, 1 - k);
    }
    for (const f of scene.fires) light(f.x, f.y, f.r * 4, 0xff8a40, 0.85 + 0.15 * Math.sin(now / 70 + f.id));
    for (const l of scene.lamps) light(l.x, l.y, l.r * 1.3, l.color, l.strength * (l.pulseMs ? 0.6 + 0.4 * Math.sin((now / l.pulseMs) * TAU) : 1));
    for (const p of scene.pieces) if (p.p === 'signal' && scene.train && Math.floor(now / 250) % 2 === 0) light(p.x + p.w / 2, p.y + p.h / 2, 160, 0xff3a2e, 1);
    for (const b of scene.bodies) if (b.ring !== 'self') light(b.x, b.y, 150, 0xc8d4ff, 0.45);
    for (const fx of scene.effects) if (fx.kind === 'impact' && fx.victim === null && now - fx.born < 120) light(fx.x, fx.y, 60, 0xffc070, 0.8);
    for (const t of scene.tracers) light(t.x1, t.y1, 80, 0xff9a40, 0.6);
    lightPool.end();
  }

  function renderTo(container: Container, target: RenderTexture, scale: number, clearColor?: [number, number, number, number]) {
    renderer.render({ container, target, clear: true, clearColor: clearColor ?? [0, 0, 0, 0], transform: new Matrix(world.scale.x * scale, 0, 0, world.scale.y * scale, world.x * scale, world.y * scale) });
  }

  function sizedRT(rt: RenderTexture | null, w: number, h: number, sum = false): RenderTexture {
    const W = Math.max(1, Math.round(w)), H = Math.max(1, Math.round(h));
    if (rt && rt.width === W && rt.height === H) return rt;
    rt?.destroy(true);
    return RenderTexture.create({ width: W, height: H, resolution: 1, ...(sum && float ? { format: 'rgba16float' as const } : {}) });
  }

  function knee(k: ReturnType<typeof createKnee>, from: RenderTexture, to: RenderTexture) {
    k.from(from);
    renderer.render({ container: k.root, target: to, clear: true, clearColor: [0, 0, 0, 0] });
  }

  let drawn = 0;
  const dprScaled = () => view.dpr * k.renderScale;

  return {
    resize(w, h, dpr) {
      view = { w, h, dpr };
      res = dpr * k.renderScale;
      renderer.resize(w, h, res);
    },
    art, software,
    probe: () => ({ tiles: ground.loadedTiles(), failedTiles: ground.failedTiles(), atlas: art.loaded() && art.manifest.atlases.length > 0, drawn, software, floatSums: float }),
    finish() { renderer.gl.readPixels(0, 0, 1, 1, renderer.gl.RGBA, renderer.gl.UNSIGNED_BYTE, new Uint8Array(4)); },
    draw(scene, cam, now, walls) {
      k = knobs();
      density = Math.min(1, k.particles / PARTICLE_CAP);
      if (dprScaled() !== res) { res = dprScaled(); renderer.resize(view.w, view.h, res); }
      world.scale.set(cam.scale);
      world.position.set(cam.w / 2 - cam.x * cam.scale, cam.h / 2 - cam.y * cam.scale);
      glowWorld.scale.copyFrom(world.scale);
      glowWorld.position.copyFrom(world.position);
      ground.draw(scene.layout, walls, scene.size, scene.view, { w: view.w, h: view.h, x: world.x, y: world.y, scale: cam.scale }, now);
      under.clear();
      over.clear();
      cracks.clear();
      blocks.clear();
      aboveBlocks.clear();
      for (const pool of [decalPool, minePool, casingPool, shadowPool, solidPool, solidGlowPool, zombiePool, downedPool, remainsPool, bodyPool, thrownPool, fxPool, flyPool, glowPool, abovePool]) pool.begin();
      drawEffects(scene, now, walls);
      drawMarks(scene, now);
      drawUnder(scene, now);
      drawShadows(scene);
      drawSolids(scene, now);
      drawCracks(scene);
      drawZombies(scene, now);
      drawRemains(scene);
      for (const d of scene.downed) {
        const base = downedPool.next();
        place(base, 'soldier.downed', 'base', 0, d.frame, d.x, d.y, d.angle);
        const team = downedPool.next();
        place(team, 'soldier.downed', 'team', 0, d.frame, d.x, d.y, d.angle);
        team.tint = hex(shade(d.color, 0.8));
      }
      for (const b of scene.bodies) drawBody(b, now);
      drawThrown(scene, now);
      drawAbove(scene, now);
      drawFires(scene, now);
      drawOver(scene, now);
      drawTracers(scene);
      drawParticles(scene, now);
      for (const pool of [decalPool, minePool, casingPool, shadowPool, solidPool, solidGlowPool, zombiePool, downedPool, remainsPool, bodyPool, thrownPool, fxPool, flyPool, glowPool, abovePool]) pool.end();

      const px = { w: view.w * res, h: view.h * res };
      nightSprite.visible = scene.dark > 0;
      if (scene.dark > 0) {
        drawLights(scene, now);
        lightSum = sizedRT(lightSum, px.w / 2, px.h / 2, true);
        lightRT = sizedRT(lightRT, px.w / 2, px.h / 2);
        // Full night leaves a tenth of the day's light, moonlit blue, so what no lamp, fire or flash reaches is dark but not void.
        const amb = [1 - NIGHT.r * scene.dark, 1 - NIGHT.g * scene.dark, 1 - NIGHT.b * scene.dark, 1] as [number, number, number, number];
        renderTo(lights, lightSum, res / 2, amb);
        knee(lightKnee, lightSum, lightRT);
        nightSprite.texture = lightRT;
        nightSprite.scale.set(2 / res);
      }
      glowSprite.visible = k.glowClamp;
      if (k.glowClamp) {
        const g = k.glowScale;
        glowFullSum = sizedRT(glowFullSum, px.w * g, px.h * g, true);
        glowFullRT = sizedRT(glowFullRT, px.w * g, px.h * g);
        renderTo(glowWorld, glowFullSum, res * g);
        knee(glowFullKnee, glowFullSum, glowFullRT);
        glowSprite.texture = glowFullRT;
        glowSprite.scale.set(1 / (res * g));
      }
      const div = k.bloomDiv;
      bloomSprite.visible = div !== null;
      if (div !== null) {
        glowSum = sizedRT(glowSum, px.w / div, px.h / div, true);
        glowRT = sizedRT(glowRT, px.w / div, px.h / div);
        bloomRT = sizedRT(bloomRT, px.w / div, px.h / div);
        renderTo(glowWorld, glowSum, res / div);
        knee(glowKnee, glowSum, glowRT);
        blurSprite.texture = glowRT;
        // The blur works in the buffer's pixels, so a half-size buffer needs twice the reach to spread as far on screen.
        blur.strength = (5 * 4) / div;
        renderer.render({ container: blurRoot, target: bloomRT, clear: true, clearColor: [0, 0, 0, 0] });
        bloomSprite.texture = bloomRT;
        bloomSprite.scale.set(div / res);
        bloomSprite.alpha = 1;
      }
      renderer.render({ container: root });
      if (!k.glowClamp) renderer.render({ container: glowWorld, clear: false });
      drawn++;
    },
  };
}

/** An arc as its own stroke: `Graphics.arc` alone joins the arc to wherever the last path ended with a straight line. */
function arcFrom(g: Graphics, x: number, y: number, r: number, from: number, to: number): Graphics {
  return g.moveTo(x + Math.cos(from) * r, y + Math.sin(from) * r).arc(x, y, r, from, to);
}

/** A tint for a color in shadow: each channel scaled by the light. */
function shadeNum(c: number, light: number): number {
  return (Math.round(((c >> 16) & 255) * light) << 16) | (Math.round(((c >> 8) & 255) * light) << 8) | Math.round((c & 255) * light);
}


/** The hull of a circle and its copy moved by (dx, dy), as a flat point list: a round piece's shadow along the floor. */
function capsule(x: number, y: number, r: number, dx: number, dy: number, n = 10): number[] {
  const a = Math.atan2(dy, dx);
  const pts: number[] = [];
  for (let i = 0; i <= n; i++) {
    const t = a + Math.PI / 2 + (i / n) * Math.PI;
    pts.push(x + Math.cos(t) * r, y + Math.sin(t) * r);
  }
  for (let i = 0; i <= n; i++) {
    const t = a - Math.PI / 2 + (i / n) * Math.PI;
    pts.push(x + dx + Math.cos(t) * r, y + dy + Math.sin(t) * r);
  }
  return pts;
}

/** A stable pseudo-random value in [0, 1) for a pair of numbers, so a fire's flames keep their spots frame to frame. */
function hash(a: number, b: number): number {
  const v = Math.sin(a * 12.9898 + b * 78.233) * 43758.5453;
  return v - Math.floor(v);
}
