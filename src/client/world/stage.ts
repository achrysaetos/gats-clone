import { BlurFilter, Color, Container, Graphics, Matrix, RenderTexture, Sprite, WebGLRenderer, type ColorSource, type Texture } from 'pixi.js';
import { BUILDINGS, WORLD, ZOM, ZOMBIES, type TurretKind } from '../../shared/defs.ts';
import type { WallView } from '../../shared/protocol.ts';
import type { Camera } from '../camera.ts';
import { PALETTE, shade, ZOMBIE_LOOK } from '../palette.ts';
import { isLive, particleAt } from '../particles.ts';
import { EFFECT_LIFE_MS, type Effect } from '../state.ts';
import { TURRET_LOOK } from '../siege.ts';
import { loadArt, type Art } from './assets.ts';
import { ART } from './art.ts';
import { facing, crateSprite, siegeWallSprite, SPRITES, type Layer } from './catalog.ts';
import { createGround } from './ground.ts';
import type { BodyLook, Scene } from './scene.ts';
import { createTextures } from './textures.ts';

const TAU = Math.PI * 2;
const R = WORLD.playerRadius;
/** The soldier's baked shadow is as dark as a wall's; at full strength it outweighs the soldier, so it is drawn lighter. */
const SOLDIER_SHADOW = 0.6;
const RECOIL = R * 0.22;
const MARK_Y = -R - 8;

export type Quality = { bloom: boolean };

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

type BodyView = { root: Container; ring: Sprite; base: Sprite; team: Sprite; armor: Sprite; gun: Sprite; flash: Sprite; chevrons: Sprite[]; hunted: Sprite; guard: Sprite; shield: Sprite; killer: Sprite };

type Decal = { name: string; frame: number; x: number; y: number; rotation: number; born: number };
const DECALS = { cap: 90, lifeMs: 40_000, fadeMs: 6000 } as const;
/** How strongly each decal marks the ground; the baked soot is opaque at its heart, which reads as a hole rather than a burn. */
const DECAL_STRENGTH: Record<string, number> = { 'decal.scorch': 0.55, 'decal.blood': 0.85, 'decal.ichor': 0.85 };

export type World = {
  draw(scene: Scene, cam: Camera, now: number, walls: readonly WallView[]): void;
  resize(w: number, h: number, dpr: number): void;
  quality: Quality;
  probe(): { tiles: number; atlas: boolean; drawn: number };
  /** Waits for the GPU to finish the last frame, so a benchmark times the pixels and not just the commands. */
  finish(): void;
};

export async function createWorld(canvas: HTMLCanvasElement, quality: Quality): Promise<World> {
  const renderer = new WebGLRenderer();
  await renderer.init({ canvas, width: canvas.clientWidth || 1, height: canvas.clientHeight || 1, resolution: 1, antialias: false, background: '#1d3a4c', powerPreference: 'high-performance' });
  const art = await loadArt();
  const tex = createTextures();
  let view = { w: 1, h: 1, dpr: 1 };

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
  const actorLayer = new Container();
  const fxLayer = new Container();
  const over = new Graphics();
  world.addChild(groundLayer, decalLayer, under, casingLayer, shadowLayer, solidLayer, cracks, actorLayer, fxLayer, over);
  const nightSprite = new Sprite();
  nightSprite.blendMode = 'multiply';
  const glowWorld = new Container({ isRenderGroup: true });
  const bloomSprite = new Sprite();
  bloomSprite.blendMode = 'add';
  root.addChild(waterLayer, world, nightSprite, glowWorld, bloomSprite);

  const lights = new Container({ isRenderGroup: true });
  const lightPool = pool(lights, sprite('add'));
  let lightRT: RenderTexture | null = null;
  let glowRT: RenderTexture | null = null;
  let bloomRT: RenderTexture | null = null;
  const blurSprite = new Sprite();
  blurSprite.filters = [new BlurFilter({ strength: 5, quality: 3 })];
  const blurRoot = new Container({ isRenderGroup: true });
  blurRoot.addChild(blurSprite);

  const ground = createGround(art, groundLayer, waterLayer);
  const decals: Decal[] = [];
  const seen = new WeakSet<Effect>();

  const decalPool = pool(decalLayer, sprite());
  const minePool = pool(casingLayer, sprite());
  const casingPool = pool(casingLayer, sprite());
  const shadowPool = pool(shadowLayer, sprite());
  const solidPool = pool(solidLayer, sprite());
  const solidGlowPool = pool(glowWorld, sprite('add'));
  const zombiePool = pool(actorLayer, sprite());
  const downedPool = pool(actorLayer, sprite());
  const bodyPool = pool(actorLayer, () => makeBody());
  const thrownPool = pool(actorLayer, sprite());
  const fxPool = pool(fxLayer, sprite());
  const glowPool = pool(glowWorld, sprite('add'));

  function makeBody(): Container {
    const root = new Container();
    const parts = {
      ring: new Sprite(tex.ring), base: new Sprite(), team: new Sprite(), armor: new Sprite(), gun: new Sprite(), flash: new Sprite(tex.disc),
      chevrons: [new Sprite(tex.chevron), new Sprite(tex.chevron)], hunted: new Sprite(tex.brackets), guard: new Sprite(tex.ring), shield: new Sprite(tex.arc), killer: new Sprite(tex.ring),
    };
    for (const s of [parts.ring, parts.flash, parts.hunted, parts.guard, parts.shield, parts.killer, ...parts.chevrons]) s.anchor.set(0.5);
    parts.flash.blendMode = 'add';
    root.addChild(parts.ring, parts.killer, parts.base, parts.team, parts.armor, parts.gun, parts.flash, parts.hunted, parts.guard, parts.shield, ...parts.chevrons);
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
    root.position.set(b.x, b.y);
    root.alpha = b.alpha;
    const { dir, rest } = facing(b.angle, SPRITES.soldier!.dirs);
    const lit = grey(b.light);
    place(p.base, 'soldier', 'base', dir, 0, 0, 0, rest);
    p.base.tint = lit;
    place(p.team, 'soldier', 'team', dir, 0, 0, 0, rest);
    const tc = hex(b.color);
    p.team.tint = b.light === 1 ? tc : shadeNum(tc, b.light);
    p.armor.visible = b.armor !== 'none';
    if (p.armor.visible) { place(p.armor, 'soldier', b.armor === 'light' ? 'armorLight' : b.armor === 'medium' ? 'armorMedium' : 'armorHeavy', dir, 0, 0, 0, rest); p.armor.tint = lit; }
    const back = RECOIL * Math.max(0, b.kick);
    place(p.gun, `gun.${b.gun}`, 'base', 0, 0, -Math.cos(b.angle) * back, -Math.sin(b.angle) * back, b.angle);
    p.gun.tint = lit;
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
    for (const c of scene.crates) place(solidPool.next(), crateSprite(c.tier, c.wear), 'base', 0, 0, c.x, c.y);
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
      over.arc(core.x, core.y, 84, -Math.PI / 2, -Math.PI / 2 + core.hp * TAU).stroke({ width: 5, color: core.hp > 0.5 ? PALETTE.hpGood : core.hp > 0.25 ? PALETTE.gold : PALETTE.hpBad, cap: 'round' });
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
      if (z.progress > 0) under.arc(z.x, z.y, z.r - 14, -Math.PI / 2, -Math.PI / 2 + z.progress * TAU).stroke({ width: 8, color: z.progressColor, alpha: 0.9 });
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
      if (d.revive > 0) over.arc(d.x, d.y, R + 10, -Math.PI / 2, -Math.PI / 2 + d.revive * TAU).stroke({ width: 3, color: PALETTE.hpGood, cap: 'round' });
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

  function addDecal(name: string, x: number, y: number, now: number) {
    const spec = SPRITES[name]!;
    const h = Math.abs(Math.sin(x * 12.9898 + y * 78.233) * 43758.5453) % 1;
    decals.push({ name, frame: Math.floor(h * spec.frames), x, y, rotation: h * TAU, born: now });
    if (decals.length > DECALS.cap) decals.shift();
  }

  function drawEffects(scene: Scene, now: number) {
    for (const fx of scene.effects) {
      const k = Math.max(0, now - fx.born) / EFFECT_LIFE_MS[fx.kind];
      if (!seen.has(fx)) {
        seen.add(fx);
        if (fx.kind === 'boom') addDecal('decal.scorch', fx.x, fx.y, now);
        if (fx.kind === 'death') addDecal('decal.blood', fx.x, fx.y, now);
        if (fx.kind === 'splat') addDecal('decal.ichor', fx.x, fx.y, now);
      }
      if (k >= 1) continue;
      switch (fx.kind) {
        case 'impact':
          if (fx.victim === null) {
            const fade = Math.max(0, 1 - k * 2.5);
            if (fade > 0) mark(glowPool.next(), tex.glow, fx.x, fx.y, 26 * (0.6 + 0.4 * fade), 0xffd56a, fade);
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
          over.circle(fx.x, fx.y, fx.r * (0.4 + 0.75 * wave)).stroke({ width: 10 * (1 - k) + 1, color: 0xffffff, alpha: (1 - k) * 0.7 });
          break;
        }
        case 'flash': {
          const spec = SPRITES['fx.muzzle']!;
          place(glowPool.next(), 'fx.muzzle', 'glow', 0, Math.min(spec.frames - 1, Math.floor(k * spec.frames)), fx.x, fx.y, fx.angle);
          mark(glowPool.next(), tex.glow, fx.x + Math.cos(fx.angle) * 6, fx.y + Math.sin(fx.angle) * 6, 44, 0xffc93a, 0.5 * (1 - k));
          break;
        }
        case 'slash': {
          const from = fx.angle - 1.1, to = from + 2.2 * Math.min(1, k * 3);
          over.arc(fx.x, fx.y, R + 34, from, to).stroke({ width: 12 * (1 - k * 0.5), color: 'rgb(28, 31, 38)', alpha: 0.35 * (1 - k), cap: 'round' });
          over.arc(fx.x, fx.y, R + 32, from, to).stroke({ width: 5 * (1 - k * 0.5), color: 0xffffff, alpha: 1 - k, cap: 'round' });
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
          if (ms < 70) place(glowPool.next(), 'fx.muzzle', 'glow', 0, Math.min(3, Math.floor((ms / 70) * 4)), fx.x, fx.y, fx.angle);
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
      }
    }
  }

  function drawDecals(now: number) {
    for (const d of decals) {
      const age = now - d.born;
      if (age >= DECALS.lifeMs) continue;
      const s = decalPool.next();
      place(s, d.name, 'base', 0, d.frame, d.x, d.y, d.rotation);
      s.alpha = (DECAL_STRENGTH[d.name] ?? 1) * Math.min(1, (DECALS.lifeMs - age) / DECALS.fadeMs);
    }
    while (decals.length && now - decals[0]!.born >= DECALS.lifeMs) decals.shift();
  }

  function drawParticles(scene: Scene, now: number) {
    for (const p of scene.particles.slots) {
      if (!isLive(p, now)) continue;
      const { x, y, k } = particleAt(p, now);
      if (p.shape === 'smoke') {
        const s = fxPool.next();
        place(s, 'fx.smoke', 'base', 0, Math.floor(p.vx * 7 + p.vy * 3) & 3, x, y, p.born * 0.001);
        const grow = (p.size * (1 + p.grow * k)) / 32;
        s.scale.x *= grow; s.scale.y *= grow;
        s.alpha = 0.6 * (1 - k);
        s.tint = hex(p.color);
      } else if (p.shape === 'casing') {
        const s = casingPool.next();
        s.texture = tex.casing;
        s.anchor.set(0.5);
        s.position.set(x, y);
        s.width = p.size * 1.4;
        s.height = p.size * 0.6;
        s.rotation = Math.atan2(p.vy, p.vx) + Math.hypot(x - p.x, y - p.y) * 0.35;
        s.alpha = k < 0.75 ? 1 : (1 - k) / 0.25;
        s.tint = 0xffffff;
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
    const light = (x: number, y: number, r: number, color: number, alpha: number) => mark(lightPool.next(), tex.light, x, y, r * 2, color, alpha);
    for (const b of scene.bodies) light(b.x, b.y, b.ring === 'self' ? 420 : 170, b.ring === 'self' ? 0xfff2dc : 0xc8d4ff, b.ring === 'self' ? 0.95 : 0.5);
    for (const fx of scene.effects) {
      const k = Math.max(0, now - fx.born) / EFFECT_LIFE_MS[fx.kind];
      if (k >= 1) continue;
      if (fx.kind === 'flash') light(fx.x, fx.y, 230, 0xffc070, 1 - k);
      if (fx.kind === 'boom') light(fx.x, fx.y, fx.r * 3.5, 0xffa050, 1 - k);
    }
    for (const t of scene.tracers) light(t.x1, t.y1, 70, 0xffd080, 0.6);
    if (scene.core) light(scene.core.x, scene.core.y, 300, 0x4fd1e8, 0.8);
    lightPool.end();
  }

  function renderTo(container: Container, target: RenderTexture, scale: number, clearColor?: [number, number, number, number]) {
    renderer.render({ container, target, clear: true, clearColor: clearColor ?? [0, 0, 0, 0], transform: new Matrix(world.scale.x * scale, 0, 0, world.scale.y * scale, world.x * scale, world.y * scale) });
  }

  function sizedRT(rt: RenderTexture | null, w: number, h: number): RenderTexture {
    const W = Math.max(1, Math.round(w)), H = Math.max(1, Math.round(h));
    if (rt && rt.width === W && rt.height === H) return rt;
    rt?.destroy(true);
    return RenderTexture.create({ width: W, height: H, resolution: 1 });
  }

  let drawn = 0;

  return {
    quality,
    resize(w, h, dpr) {
      view = { w, h, dpr };
      renderer.resolution = dpr;
      renderer.resize(w, h, dpr);
    },
    probe: () => ({ tiles: ground.loadedTiles(), atlas: art.manifest.atlases.length > 0, drawn }),
    finish() { renderer.gl.readPixels(0, 0, 1, 1, renderer.gl.RGBA, renderer.gl.UNSIGNED_BYTE, new Uint8Array(4)); },
    draw(scene, cam, now, walls) {
      world.scale.set(cam.scale);
      world.position.set(cam.w / 2 - cam.x * cam.scale, cam.h / 2 - cam.y * cam.scale);
      glowWorld.scale.copyFrom(world.scale);
      glowWorld.position.copyFrom(world.position);
      ground.draw(scene.layout, walls, scene.size, scene.view, { w: view.w, h: view.h, x: world.x, y: world.y, scale: cam.scale }, now);
      under.clear();
      over.clear();
      cracks.clear();
      for (const pool of [decalPool, minePool, casingPool, shadowPool, solidPool, solidGlowPool, zombiePool, downedPool, bodyPool, thrownPool, fxPool, glowPool]) pool.begin();
      drawEffects(scene, now);
      drawDecals(now);
      drawUnder(scene, now);
      drawShadows(scene);
      drawSolids(scene, now);
      drawCracks(scene);
      drawZombies(scene, now);
      for (const d of scene.downed) {
        const base = downedPool.next();
        place(base, 'soldier.downed', 'base', 0, 0, d.x, d.y);
        const team = downedPool.next();
        place(team, 'soldier.downed', 'team', 0, 0, d.x, d.y);
        team.tint = hex(shade(d.color, 0.8));
      }
      for (const b of scene.bodies) drawBody(b, now);
      drawThrown(scene, now);
      drawOver(scene, now);
      drawTracers(scene);
      drawParticles(scene, now);
      for (const pool of [decalPool, minePool, casingPool, shadowPool, solidPool, solidGlowPool, zombiePool, downedPool, bodyPool, thrownPool, fxPool, glowPool]) pool.end();

      const px = { w: view.w * view.dpr, h: view.h * view.dpr };
      nightSprite.visible = scene.dark > 0;
      if (scene.dark > 0) {
        drawLights(scene, now);
        lightRT = sizedRT(lightRT, px.w / 2, px.h / 2);
        const amb = [1 - 0.58 * scene.dark, 1 - 0.53 * scene.dark, 1 - 0.38 * scene.dark, 1] as [number, number, number, number];
        renderTo(lights, lightRT, view.dpr / 2, amb);
        nightSprite.texture = lightRT;
        nightSprite.scale.set(2 / view.dpr);
      }
      bloomSprite.visible = quality.bloom;
      if (quality.bloom) {
        glowRT = sizedRT(glowRT, px.w / 4, px.h / 4);
        bloomRT = sizedRT(bloomRT, px.w / 4, px.h / 4);
        renderTo(glowWorld, glowRT, view.dpr / 4);
        blurSprite.texture = glowRT;
        renderer.render({ container: blurRoot, target: bloomRT, clear: true, clearColor: [0, 0, 0, 0] });
        bloomSprite.texture = bloomRT;
        bloomSprite.scale.set(4 / view.dpr);
        bloomSprite.alpha = 0.9;
      }
      renderer.render({ container: root });
      drawn++;
    },
  };
}

/** A tint for a color in shadow: each channel scaled by the light. */
function shadeNum(c: number, light: number): number {
  return (Math.round(((c >> 16) & 255) * light) << 16) | (Math.round(((c >> 8) & 255) * light) << 8) | Math.round((c & 255) * light);
}

