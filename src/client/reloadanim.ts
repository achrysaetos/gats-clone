import { GUNS, type GunId, type WeaponId } from '../shared/defs.ts';
import type { Firing } from './fire.ts';
import { dropMag, type GunFx } from './gunfx.ts';
import { drawHeldGun, heldHands, heldPoint, type GunView, type Hand, type Part } from './gunart.ts';
import { TICK_MS } from './interp.ts';
import { TOPUP_MS } from './topup.ts';
import { INK } from './palette.ts';
import { BEATS, BOLT, shellCount, shellSeat, worksBolt } from './reloadbeats.ts';
import { reloadFoley } from './reloadsfx.ts';

/**
 * Reload choreography. A reload is a progress `t` (0..1) through the gun's real reload time, and each class keyframes the
 * support hand, the gun's tilt and its moving parts over that `t`, in the holder's frame (x along the aim, y to the right):
 * box-mag guns pull the mag, fetch a fresh one from the vest, seat it, slap it and rack; the shotgun thumbs in a shell per round
 * and racks its pump; the bolt-action works its bolt and presses a stripper clip in; the LMG lifts its feed cover and swaps its
 * box; an akimbo pair reloads one pistol at a time with the other hand's gun held out. Every keyframe time is in `BEATS`,
 * which the reload sounds share. The motion is anticipation (the gun cants and the hand finds the mag), snap (the yank, the
 * seat, the rack) and settle (everything eases back to the held pose exactly at `t = 1`).
 */

// --- Keyframes --------------------------------------------------------------------------------------------------

type Ease = 'io' | 'out' | 'in' | 'lin' | 'snap';
type Key<T> = readonly [t: number, v: T, e?: Ease];

const clamp01 = (x: number) => Math.max(0, Math.min(1, x));
const lerp = (a: number, b: number, k: number) => a + (b - a) * k;
const mixHand = (a: Hand, b: Hand, k: number): Hand => ({ x: lerp(a.x, b.x, k), y: lerp(a.y, b.y, k) });

export function ease(e: Ease, x: number): number {
  switch (e) {
    case 'lin': return x;
    case 'out': return 1 - (1 - x) ** 3;
    case 'in': return x ** 3;
    // A hard arrival that overshoots a hair and settles: the seat of a mag, the slam of a pump.
    case 'snap': return 1 + 2.2 * (x - 1) ** 3 + 1.2 * (x - 1) ** 2;
    default: return x < 0.5 ? 4 * x ** 3 : 1 - (-2 * x + 2) ** 3 / 2;
  }
}

/** The value at `t` along keyframes: each segment eases into its later key; before the first and after the last it holds. */
export function track<T>(keys: readonly Key<T>[], t: number, mix: (a: T, b: T, k: number) => T): T {
  const first = keys[0]!;
  if (t <= first[0]) return first[1];
  for (let i = 1; i < keys.length; i++) {
    const [t1, b, e] = keys[i]!;
    if (t <= t1) {
      const [t0, a] = keys[i - 1]!;
      return t1 > t0 ? mix(a, b, ease(e ?? 'io', (t - t0) / (t1 - t0))) : b;
    }
  }
  return keys[keys.length - 1]![1];
}
const num = (keys: readonly Key<number>[], t: number) => track(keys, t, lerp);
const hand = (keys: readonly Key<Hand>[], t: number) => track(keys, t, mixHand);
/** A short triangular pulse, for the body's dip at a beat. */
const pulse = (t: number, at: number, width = 0.035) => Math.max(0, 1 - Math.abs(t - at) / width);

// --- Geometry ---------------------------------------------------------------------------------------------------

type Pt = readonly [number, number];
const rotAbout = (p: Hand, c: Hand, a: number): Hand => {
  const dx = p.x - c.x, dy = p.y - c.y, cs = Math.cos(a), sn = Math.sin(a);
  return { x: c.x + dx * cs - dy * sn, y: c.y + dx * sn + dy * cs };
};
const add = (p: Hand, x: number, y: number): Hand => ({ x: p.x + x, y: p.y + y });

type Rig = {
  gun: GunId; R: number; aim: number; s: 1 | -1;
  trigger: Hand; support: Hand; pouch: Hand;
  /** A gun art point in the holder's frame. */
  pt: (x: number, y: number) => Hand;
  /** Holder-frame size of one art unit along and across the bore (the latter signed, mirrored when aimed left). */
  sx: number; sy: number;
};

function rigOf(gun: GunId, R: number, aim: number): Rig {
  const [trigger, support] = heldHands(gun, R, aim);
  const o = heldPoint(gun, R, aim, 0, 0);
  const s = o.sy < 0 ? -1 : 1;
  // The vest pouch rides on the side the mag hangs, so a reload always happens under the gun where it reads.
  return { gun, R, aim, s, trigger, support, pouch: { x: 0.04 * R, y: s * 0.6 * R }, pt: (x, y) => heldPoint(gun, R, aim, x, y), sx: o.sx, sy: o.sy };
}

/** What a reload draws at progress `t`. */
export type ReloadScene = {
  /** `[trigger, support]` hands in the holder's frame, before recoil. */
  hands: [Hand, Hand];
  /** How far the shoulders dip at a seat or a slam, in px (a little extra recoil). */
  dip: number;
  /** Draws the gun, its moving parts and what the hands carry, in the holder's frame, under the hands. */
  draw: (ctx: CanvasRenderingContext2D, golden: boolean, skin?: string) => void;
  /** The magazine in the support hand, if any: where its grip is and its angle, in the holder's frame. */
  carried?: { at: Hand; angle: number; big: boolean };
};

const TILT = 0.35;
const FREE: GunView = {};

type Pieces = {
  hide?: readonly Part[];
  /** Painted in the gun's tilted frame, after the gun. */
  inGun?: (ctx: CanvasRenderingContext2D) => void;
  /** Painted untilted, over the gun: what a hand carries. */
  carry?: (ctx: CanvasRenderingContext2D) => void;
};

/** Paints the gun canted `tilt` radians about the trigger hand, with the pieces layered over it. */
function paintGun(ctx: CanvasRenderingContext2D, rig: Rig, tilt: number, golden: boolean, skin: string | undefined, p: Pieces) {
  const { gun, R, aim, trigger } = rig;
  ctx.save();
  ctx.translate(trigger.x, trigger.y);
  ctx.rotate(tilt);
  ctx.translate(-trigger.x, -trigger.y);
  drawHeldGun(ctx, gun, R, aim, golden, skin, p.hide?.length ? { hide: p.hide } : FREE);
  p.inGun?.(ctx);
  ctx.restore();
  p.carry?.(ctx);
}

/** One part of the gun, drawn alone, nudged `dx` along the bore (holder frame) in the current transform. */
function paintPart(ctx: CanvasRenderingContext2D, rig: Rig, golden: boolean, skin: string | undefined, only: Part, dx = 0, dy = 0) {
  ctx.save();
  ctx.translate(dx, dy);
  drawHeldGun(ctx, rig.gun, rig.R, rig.aim, golden, skin, { only });
  ctx.restore();
}

/** Rotates `ctx` by `phi` about the art point `h` as the art's own units see it (the art is squashed across the bore). */
function artRotate(ctx: CanvasRenderingContext2D, rig: Rig, h: Hand, phi: number) {
  const c = Math.cos(phi), n = Math.sin(phi);
  ctx.translate(h.x, h.y);
  ctx.transform(c, n * (rig.sy / rig.sx), -n * (rig.sx / rig.sy), c, 0, 0);
  ctx.translate(-h.x, -h.y);
}

/** A magazine (or box) painted as its own part, its grip at `at`, turned `angle`, given where that grip sits at rest. */
function paintFree(ctx: CanvasRenderingContext2D, rig: Rig, golden: boolean, skin: string | undefined, only: Part, at: Hand, angle: number, rest: Hand, off: Hand = { x: 0, y: 0 }) {
  ctx.save();
  ctx.translate(at.x, at.y);
  ctx.rotate(angle);
  // A little oversize while it is in hand, so the magazine reads at the size of a glove.
  ctx.scale(1.3, 1.3);
  ctx.translate(off.x - rest.x, off.y - rest.y);
  paintPart(ctx, rig, golden, skin, only);
  ctx.restore();
}

const BRASS = '#d1a94c', HULL = '#c0492f';

function paintShell(ctx: CanvasRenderingContext2D, at: Hand, angle: number, R: number) {
  const len = 0.4 * R, wid = 0.17 * R;
  ctx.save();
  ctx.translate(at.x, at.y);
  ctx.rotate(angle);
  ctx.lineWidth = 1.3;
  ctx.strokeStyle = INK;
  ctx.lineJoin = 'round';
  ctx.fillStyle = HULL;
  ctx.beginPath();
  ctx.rect(-len / 2, -wid / 2, len * 0.66, wid);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = BRASS;
  ctx.beginPath();
  ctx.rect(len / 2 - len * 0.34, -wid / 2, len * 0.34, wid);
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}

/** A stripper clip: a steel strip holding five brass rounds. */
function paintClip(ctx: CanvasRenderingContext2D, at: Hand, angle: number, R: number) {
  const len = 0.8 * R, wid = 0.2 * R;
  ctx.save();
  ctx.translate(at.x, at.y);
  ctx.rotate(angle);
  ctx.lineWidth = 1.3;
  ctx.strokeStyle = INK;
  ctx.fillStyle = '#7d8693';
  ctx.beginPath();
  ctx.rect(-len / 2, -wid * 0.62, len, wid * 1.24);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = BRASS;
  ctx.beginPath();
  for (let i = 0; i < 5; i++) {
    const x = -len / 2 + (len * (i + 0.5)) / 5;
    ctx.moveTo(x - len * 0.085, -wid * 0.5);
    ctx.rect(x - len * 0.085, -wid * 0.5, len * 0.17, wid);
  }
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}

/** A little knob on a stem: the bolt's handle, or an AR's charging handle. */
function paintKnob(ctx: CanvasRenderingContext2D, from: Hand, to: Hand, r: number) {
  ctx.lineCap = 'round';
  if (Math.hypot(to.x - from.x, to.y - from.y) > r * 0.8) {
    ctx.strokeStyle = INK;
    ctx.lineWidth = r * 1.5 + 2;
    ctx.beginPath(); ctx.moveTo(from.x, from.y); ctx.lineTo(to.x, to.y); ctx.stroke();
    ctx.strokeStyle = '#2c3037';
    ctx.lineWidth = r * 1.5;
    ctx.beginPath(); ctx.moveTo(from.x, from.y); ctx.lineTo(to.x, to.y); ctx.stroke();
  }
  ctx.fillStyle = INK;
  ctx.beginPath(); ctx.arc(to.x, to.y, r + 1, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#2c3037';
  ctx.beginPath(); ctx.arc(to.x, to.y, r, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = 'rgba(255, 255, 255, 0.28)';
  ctx.beginPath(); ctx.arc(to.x - r * 0.25, to.y - r * 0.25, r * 0.38, 0, Math.PI * 2); ctx.fill();
}

// --- Box magazines: pistol, SMG, assault ------------------------------------------------------------------------

type BoxArt = { grab: Pt; dir: Pt; len: number; ch: Pt; back: number };
const BOX: Partial<Record<WeaponId, BoxArt>> = {
  pistol: { grab: [19.5, 19], dir: [-0.09, 1], len: 14, ch: [14, -5], back: 9 },
  smg: { grab: [43, 21], dir: [0.08, 1], len: 24, ch: [24, -10], back: 9 },
  assault: { grab: [61, 21], dir: [0.25, 1], len: 24, ch: [28, -11], back: 11 },
};

const TILT_BOX: readonly Key<number>[] = [[0, 0], [BEATS.box.grab, 1], [0.8, 1, 'io'], [BEATS.box.rack, 0.25, 'io'], [1, 0, 'io']];

function boxScene(rig: Rig, base: WeaponId, t: number, k: number): ReloadScene {
  const B = BEATS.box, art = BOX[base]!, { pt, sx, sy, R, s, trigger, support } = rig;
  const tilt = (tk: number) => s * TILT * k * num(TILT_BOX, tk);
  const vec = { x: art.dir[0] * art.len * 1.15 * sx, y: art.dir[1] * art.len * 1.15 * sy };
  const well0 = pt(art.grab[0], art.grab[1]);
  const well = (f: number, tk: number) => rotAbout(add(well0, vec.x * f, vec.y * f), trigger, tilt(tk));
  const ch0 = pt(art.ch[0], art.ch[1]);
  const handle = (f: number, tk: number) => rotAbout(add(ch0, -art.back * f * sx, 0), trigger, tilt(tk));
  const slide = base === 'pistol';
  const slideOff = slide ? -art.back * num([[0, 0], [B.rackBack - 0.02, 0], [B.rackBack, 1, 'out'], [B.rack, 0, 'in'], [1, 0]], t) * sx : 0;
  const stash = add(rig.pouch, 0.05 * R, 0);
  const h = hand([
    [0, support], [B.grab, well(0, B.grab)], [B.out, well(0, B.out), 'lin'], [B.drop, well(1, B.drop), 'io'],
    [B.pouch, rig.pouch], [B.take, stash, 'lin'], [B.near, well(0.45, B.near), 'io'], [B.seat, well(0, B.seat), 'snap'],
    [0.67, well(0.35, 0.67), 'out'], [0.71, well(-0.05, 0.71), 'in'], [0.75, well(0.25, 0.75), 'out'],
    [0.8, handle(0, 0.8), 'io'], [0.85, handle(0, 0.85), 'lin'], [B.rackBack, handle(1, B.rackBack), 'out'], [B.rack, handle(0, B.rack), 'in'], [1, support, 'io'],
  ], t);
  const hands: [Hand, Hand] = [trigger, k >= 1 ? h : mixHand(support, h, k)];
  const dip = k * (0.9 * pulse(t, B.seat) + 0.6 * pulse(t, B.slap - 0.01) + 0.5 * pulse(t, B.rack));
  const out = t >= B.out && t < B.seat;
  const holding = (t >= B.out && t <= B.drop) || (t >= B.take && t < B.seat);
  const fresh = t >= B.take;
  const carriedAngle = tilt(t) + (fresh ? s * 0.6 * (1 - ease('out', clamp01((t - B.take) / (B.seat - B.take)))) * k : 0);
  // The hand holds the mag by its top, so its body hangs out below the glove where it can be seen.
  const hang = t <= B.drop ? ease('io', clamp01((t - B.out) / ((B.drop - B.out) * 0.5))) : 1 - ease('io', clamp01((t - B.near) / (B.seat - B.near)));
  const off = { x: vec.x * 0.5 * hang, y: vec.y * 0.5 * hang };
  const carried = k >= 1 && t >= B.out && t <= B.drop ? { at: add(h, off.x, off.y), angle: tilt(t), big: false } : undefined;
  return {
    hands, dip, carried,
    draw: (ctx, golden, skin) => {
      const hidden = k >= 1 && out;
      const pieces: Pieces = {
        hide: [...(hidden ? (['mag'] as const) : []), ...(slide && k >= 1 ? (['slide'] as const) : [])],
        inGun: (g) => {
          if (slide && k >= 1) paintPart(g, rig, golden, skin, 'slide', slideOff, 0);
          // The charging handle of a long gun rides back with the hand.
          if (!slide && t >= 0.78 && t < 1) {
            const back = num([[0, 0], [B.rackBack - 0.02, 0], [B.rackBack, 1, 'out'], [B.rack, 0, 'in'], [1, 0]], t);
            if (back > 0.02) paintKnob(g, ch0, add(ch0, -art.back * back * sx, 0), 0.07 * R);
          }
        },
        carry: (g) => { if (hidden && holding) paintFree(g, rig, golden, skin, 'mag', h, carriedAngle, well0, off); },
      };
      paintGun(ctx, rig, tilt(t), golden, skin, pieces);
    },
  };
}

// --- LMG: feed cover, box swap -----------------------------------------------------------------------------------

function lmgScene(rig: Rig, t: number, k: number): ReloadScene {
  const B = BEATS.lmg, { pt, sx, sy, R, s, trigger, support } = rig;
  const tiltKeys: readonly Key<number>[] = [[0, 0], [0.1, 1], [0.8, 1], [B.rack, 0.25], [1, 0]];
  const tilt = (tk: number) => s * 0.3 * k * num(tiltKeys, tk);
  const hinge = pt(28, -11), box0 = pt(52, 26);
  const lidKeys: readonly Key<number>[] = [[0, 0], [0.1, 0], [B.lidUp, -1.15, 'out'], [0.7, -1.15], [B.shut, 0, 'in'], [1, 0]];
  const lidTip = (phi: number, tk: number) => {
    const c = Math.cos(phi), n = Math.sin(phi), vx = 38, vy = -2.5;
    return rotAbout(pt(28 + vx * c - vy * n, -11 + vx * n + vy * c), trigger, tilt(tk));
  };
  const vec = { x: 0, y: 24 * 1.15 * sy };
  const boxAt = (f: number, tk: number) => rotAbout(add(box0, vec.x * f, vec.y * f), trigger, tilt(tk));
  const ch0 = pt(26, -12), back = 11;
  const handle = (f: number, tk: number) => rotAbout(add(ch0, -back * f * sx, 0), trigger, tilt(tk));
  const h = hand([
    [0, support], [0.1, lidTip(0, 0.1)], [B.lidUp, lidTip(-1.15, B.lidUp), 'out'],
    [0.27, boxAt(0, 0.27), 'io'], [B.drop, boxAt(1, B.drop), 'io'],
    [B.pouch, rig.pouch], [B.take, add(rig.pouch, 0.05 * R, 0), 'lin'], [B.near, boxAt(0.5, B.near), 'io'], [B.seat, boxAt(0, B.seat), 'snap'],
    [0.7, lidTip(-1.15, 0.7), 'io'], [B.shut, lidTip(0, B.shut), 'in'], [0.8, add(lidTip(0, 0.8), 0, 0.05 * R * s), 'out'],
    [0.83, handle(0, 0.83), 'io'], [B.rackBack, handle(1, B.rackBack), 'out'], [B.rack, handle(0, B.rack), 'in'], [1, support, 'io'],
  ], t);
  const hands: [Hand, Hand] = [trigger, k >= 1 ? h : mixHand(support, h, k)];
  const dip = k * (1.2 * pulse(t, B.seat) + 0.9 * pulse(t, B.shut) + 0.5 * pulse(t, B.rack));
  const out = t >= B.out && t < B.seat;
  const fresh = t >= B.take;
  const boxAngle = tilt(t) + (fresh ? s * 0.5 * (1 - ease('out', clamp01((t - B.take) / (B.seat - B.take)))) * k : 0);
  const lidOpen = t >= 0.1 && t < B.shut + 0.001;
  const holding = (t >= B.out && t <= B.drop) || (t >= B.take && t < B.seat);
  const hang = t <= B.drop ? ease('io', clamp01((t - B.out) / ((B.drop - B.out) * 0.5))) : 1 - ease('io', clamp01((0.58 - 0.5 + (t - 0.58)) / 0.14));
  const off = { x: 0, y: vec.y * 0.4 * clamp01(hang) };
  const carried = k >= 1 && t >= B.out && t <= B.drop ? { at: add(h, off.x, off.y), angle: tilt(t), big: true } : undefined;
  return {
    hands, dip, carried,
    draw: (ctx, golden, skin) => {
      const hidden = k >= 1 && out;
      const hide: Part[] = [...(hidden ? (['mag'] as const) : []), ...(lidOpen && k >= 1 ? (['lid'] as const) : [])];
      paintGun(ctx, rig, tilt(t), golden, skin, {
        hide,
        inGun: (g) => {
          if (lidOpen && k >= 1) {
            g.save();
            artRotate(g, rig, hinge, num(lidKeys, t));
            paintPart(g, rig, golden, skin, 'lid');
            g.restore();
          }
          const b = t >= 0.8 && t < 1 ? num([[0, 0], [B.rackBack - 0.02, 0], [B.rackBack, 1, 'out'], [B.rack, 0, 'in'], [1, 0]], t) : 0;
          if (b > 0.02) paintKnob(g, ch0, add(ch0, -back * b * sx, 0), 0.08 * R);
        },
        carry: (g) => { if (hidden && holding) paintFree(g, rig, golden, skin, 'mag', h, boxAngle, box0, off); },
      });
    },
  };
}

// --- Shotgun: shell by shell, then the pump ---------------------------------------------------------------------

function tubeScene(rig: Rig, mag: number, t: number, k: number): ReloadScene {
  const B = BEATS.tube, { pt, sx, R, s, trigger, support } = rig;
  const n = shellCount(mag);
  const tiltKeys: readonly Key<number>[] = [[0, 0], [B.start, 1], [B.end, 1], [B.end + 0.04, 0.2], [1, 0]];
  const tilt = (tk: number) => s * 0.3 * k * num(tiltKeys, tk);
  const port0 = pt(46, 8);
  const port = (tk: number, push = 0) => rotAbout(add(port0, push * sx, 0), trigger, tilt(tk));
  const cycle = (B.end - B.start) / n;
  const keys: Key<Hand>[] = [[0, support]];
  for (let i = 0; i < n; i++) {
    const c0 = B.start + i * cycle;
    keys.push([c0 + 0.001, port(c0)]);
    keys.push([c0 + 0.28 * cycle, add(rig.pouch, 0, 0), 'io']);
    keys.push([c0 + 0.42 * cycle, add(rig.pouch, 0.04 * R, 0), 'lin']);
    keys.push([c0 + 0.8 * cycle, port(c0 + 0.8 * cycle), 'io']);
    keys.push([c0 + 0.92 * cycle, port(c0 + 0.92 * cycle, 3), 'in']);
    keys.push([c0 + cycle - 0.001, port(c0 + cycle), 'out']);
  }
  const travel = 14 * sx;
  const pumpF = num([[0, 0], [B.pumpBack - 0.05, 0], [B.pumpBack, 1, 'out'], [B.pump, 0, 'in'], [1, 0]], t);
  const grip = (f: number): Hand => ({ x: support.x - f * travel, y: support.y });
  keys.push([B.end + 0.02, add(support, 0, 0), 'io']);
  keys.push([B.pumpBack - 0.05, grip(0), 'lin']);
  keys.push([B.pumpBack, grip(1), 'out']);
  keys.push([B.pump, grip(0), 'in']);
  keys.push([1, support, 'io']);
  const h = hand(keys, t);
  const hands: [Hand, Hand] = [trigger, k >= 1 ? h : mixHand(support, h, k)];
  const dip = k * (1.0 * pulse(t, B.pump, 0.03) + 0.5 * pulse(t, B.pumpBack, 0.03));
  // Which shell the hand holds: from the pouch to the port in each cycle.
  const shell = (() => {
    if (t >= B.end) return null;
    const i = Math.min(n - 1, Math.floor((t - B.start) / cycle));
    if (i < 0) return null;
    const c0 = B.start + i * cycle, u = (t - c0) / cycle;
    return u >= 0.42 && u < 0.92 ? { u } : null;
  })();
  return {
    hands, dip,
    draw: (ctx, golden, skin) => {
      paintGun(ctx, rig, tilt(t), golden, skin, {
        hide: k >= 1 && t < 1 ? ['pump'] : [],
        inGun: (g) => { if (k >= 1 && t < 1) paintPart(g, rig, golden, skin, 'pump', -pumpF * travel, 0); },
        carry: (g) => { if (shell && k >= 1) paintShell(g, add(h, 0.1 * R, -0.05 * R * s), -s * 0.5 * (1 - shell.u), R); },
      });
    },
  };
}

// --- Bolt-action: bolt up and back, a stripper clip, bolt forward and down --------------------------------------

function sniperScene(rig: Rig, t: number, k: number): ReloadScene {
  const B = BEATS.sniper, { pt, sx, R, s, trigger, support } = rig;
  const tiltKeys: readonly Key<number>[] = [[0, 0], [B.grab, 1], [0.88, 1], [0.95, 0], [1, 0]];
  const tilt = (tk: number) => s * 0.22 * k * num(tiltKeys, tk);
  // The knob rests below the receiver; the bolt lifts it to the top, draws it back, and runs forward and down again.
  const K0: Pt = [62, 7], K1: Pt = [62, -2], K2: Pt = [45, -2];
  const knobArt = track<Pt>([[0, K0], [B.grab, K0], [B.up, K1, 'out'], [B.back, K2, 'out'], [0.8, K2], [B.fwd, K1, 'in'], [B.latch, K0, 'snap'], [1, K0]], t, (a, b, x) => [lerp(a[0], b[0], x), lerp(a[1], b[1], x)]);
  const knobAt = (a: Pt, tk: number) => rotAbout(pt(a[0], a[1]), trigger, tilt(tk));
  const portHover = (tk: number) => rotAbout(pt(58, -26), trigger, tilt(tk));
  const portIn = (tk: number, dy = 0) => rotAbout(pt(58, -9 + dy), trigger, tilt(tk));
  const h = hand([
    [0, support], [B.grab, knobAt(K0, B.grab)], [B.up, knobAt(K1, B.up), 'out'], [B.back, knobAt(K2, B.back), 'out'],
    [0.31, knobAt(K2, 0.31), 'io'], [B.take, add(rig.pouch, 0.05 * R, 0), 'io'], [0.52, portHover(0.52), 'io'], [B.seat, portIn(B.seat), 'snap'],
    [B.press, portIn(B.press, 3), 'in'], [0.74, portIn(0.74, -2), 'out'],
    [0.78, knobAt(K2, 0.78), 'io'], [B.fwd, knobAt(K1, B.fwd), 'in'], [B.latch, knobAt(K0, B.latch), 'snap'], [1, support, 'io'],
  ], t);
  const hands: [Hand, Hand] = [trigger, k >= 1 ? h : mixHand(support, h, k)];
  const dip = k * (0.7 * pulse(t, B.back, 0.03) + 0.8 * pulse(t, B.seat) + 0.9 * pulse(t, B.latch, 0.03));
  const clip = t >= B.take && t < B.press;
  return {
    hands, dip,
    draw: (ctx, golden, skin) => {
      const own = k >= 1 && t > 0;
      paintGun(ctx, rig, tilt(t), golden, skin, {
        hide: own ? ['bolt'] : [],
        inGun: (g) => { if (own) paintKnob(g, pt(62, -2), pt(knobArt[0], knobArt[1]), 3.2 * sx); },
        carry: (g) => { if (clip && k >= 1) paintClip(g, add(h, 0.12 * R, -0.04 * R * s), -s * 0.35 * (1 - ease('out', clamp01((t - B.take) / (B.seat - B.take)))), R); },
      });
    },
  };
}

// --- Working the bolt between shots -----------------------------------------------------------------------------

/**
 * A bolt-action working its bolt after a shot, `u` (0..1) through its fire interval (see `BOLT`): the support hand leaves the fore-end for
 * the handle, lifts it, draws it back, runs it home and locks it down, the gun canting a hair toward the hand, and is back on the fore-end
 * before the next round can go. The same knob and keyframes as the reload's bolt work, so the two read as one motion.
 */
export function boltScene(gun: GunId, R: number, aim: number, u: number): ReloadScene {
  const rig = rigOf(gun, R, aim), { pt, sx, s, trigger, support } = rig, B = BOLT;
  u = clamp01(u);
  const K0: Pt = [62, 7], K1: Pt = [62, -2], K2: Pt = [45, -2];
  const tiltAt = (uk: number) => s * 0.1 * num([[0, 0], [B.grab, 1], [B.lock, 1], [B.home, 0, 'io'], [1, 0]], uk);
  const knob = track<Pt>([[0, K0], [B.lift - 0.05, K0], [B.lift, K1, 'out'], [B.back, K2, 'out'], [B.fwd, K1, 'in'], [B.lock, K0, 'snap'], [1, K0]], u, (a, b, x) => [lerp(a[0], b[0], x), lerp(a[1], b[1], x)]);
  const knobAt = (a: Pt, uk: number) => rotAbout(pt(a[0], a[1]), trigger, tiltAt(uk));
  const h = hand([
    [0, support], [B.grab, knobAt(K0, B.grab), 'io'], [B.lift - 0.05, knobAt(K0, B.lift - 0.05)], [B.lift, knobAt(K1, B.lift), 'out'], [B.back, knobAt(K2, B.back), 'out'],
    [B.fwd, knobAt(K1, B.fwd), 'in'], [B.lock, knobAt(K0, B.lock), 'snap'], [B.home, support, 'io'], [1, support],
  ], u);
  const dip = 0.5 * pulse(u, B.back, 0.03) + 0.7 * pulse(u, B.lock, 0.03);
  const working = u > B.grab * 0.5 && u < B.home;
  return {
    hands: [trigger, h], dip,
    draw: (ctx, golden, skin) => paintGun(ctx, rig, tiltAt(u), golden, skin, {
      hide: working ? ['bolt'] : [],
      inGun: (g) => { if (working) paintKnob(g, pt(62, -2), pt(knob[0], knob[1]), 3.2 * sx); },
    }),
  };
}

const boltShots = new Map<number, number>();
/**
 * Soldier `id`'s bolt work this frame: `shotAt` is when its newest muzzle flash was born, if one is still up (a fresh shot); returns how far
 * (0..1) through working the bolt it is, or null when it is not working one (another gun, or the round is already chambered).
 */
export function stepBolt(id: number, gun: GunId, shotAt: number | undefined, now: number): number | null {
  if (shotAt !== undefined) boltShots.set(id, Math.max(boltShots.get(id) ?? -Infinity, shotAt));
  const at = boltShots.get(id);
  if (at === undefined) return null;
  const u = (now - at) / GUNS[gun].fireMs;
  if (!worksBolt(gun) || u >= 1) { boltShots.delete(id); return null; }
  return u < 0 ? 0 : u;
}

// --- Akimbo: one pistol at a time, the other held out ------------------------------------------------------------

const AK = BEATS.akimbo;

function akimboScene(rig: Rig, t: number, k: number): ReloadScene {
  const { pt, R, s, trigger, support } = rig;
  const art = BOX.pistol!;
  const second = t >= 0.5;
  const u = second ? (t - 0.5) * 2 : t * 2;
  // The first pistol to reload is the back one (the support hand's); then the front one (the trigger hand's).
  const rest = second ? trigger : support;
  const partMag: Part = second ? 'mag' : 'mag2';
  // The back pistol is drawn shifted from the front one in the art (see `build` in gunart.ts); its well shifts with it.
  const g2 = (x: number, y: number): Hand => (second ? pt(x, y) : pt(x + 16, y - 13));
  const well0 = g2(art.grab[0], art.grab[1]);
  const grip0 = rest;
  const theta = (uu: number) => s * k * num([[0, 0], [0.22, 0.7], [AK.seat, 0.95, 'io'], [0.8, 0.5], [1, 0]], uu);
  const xf = (p: Hand, uh: Hand, uu: number): Hand => { const r = rotAbout(p, grip0, theta(uu)); return { x: r.x - grip0.x + uh.x, y: r.y - grip0.y + uh.y }; };
  const wellRel = (uu: number) => rotAbout(well0, grip0, theta(uu));
  const seatHand: Hand = { x: rig.pouch.x - (wellRel(AK.seat).x - grip0.x), y: rig.pouch.y - (wellRel(AK.seat).y - grip0.y) };
  const tuckA: Hand = mixHand(grip0, add(rig.pouch, 0.05 * R, -s * 0.25 * R), 0.55);
  const tuckB: Hand = mixHand(tuckA, seatHand, 0.35);
  const hu = hand([
    [0, grip0], [0.22, tuckA, 'out'], [AK.fresh, tuckB, 'io'], [AK.seat, seatHand, 'snap'],
    [0.68, add(seatHand, 0, s * 0.16 * R), 'out'], [0.73, seatHand, 'in'], [0.8, mixHand(seatHand, grip0, 0.3), 'io'], [1, grip0, 'io'],
  ], u);
  const hands: [Hand, Hand] = second ? [k >= 1 ? hu : mixHand(trigger, hu, k), support] : [trigger, k >= 1 ? hu : mixHand(support, hu, k)];
  const dip = k * (0.8 * pulse(u, AK.seat, 0.07) + 0.4 * pulse(u, AK.slap, 0.06));
  const magOut = u >= AK.pop && u < AK.seat;
  const wellNow = (uu: number) => xf(well0, hu, uu);
  const carried = k >= 1 && u >= AK.pop - 0.001 && u < AK.pop + 0.02 ? { at: wellNow(AK.pop), angle: theta(AK.pop), big: false } : undefined;
  return {
    hands, dip, carried,
    draw: (ctx, golden, skin) => {
      const frontView = (hide: Part[]): GunView => ({ hide: ['g2', ...hide] });
      const hideF: Part[] = second && magOut && k >= 1 ? ['mag'] : [];
      const hideB: Part[] = !second && magOut && k >= 1 ? ['mag2'] : [];
      const paintOne = (view: GunView, ang: number, at: Hand, pivot: Hand) => {
        ctx.save();
        ctx.translate(at.x, at.y);
        ctx.rotate(ang);
        ctx.translate(-pivot.x, -pivot.y);
        drawHeldGun(ctx, rig.gun, R, rig.aim, golden, skin, view);
        ctx.restore();
      };
      // Back pistol first (it sits under the front one), then the front.
      paintOne({ only: 'g2', hide: hideB }, second ? 0 : theta(u), second ? support : hu, support);
      paintOne(frontView(hideF), second ? theta(u) : 0, second ? hu : trigger, trigger);
      if (k >= 1 && u >= AK.fresh && u < AK.seat) paintFree(ctx, rig, golden, skin, partMag, rig.pouch, theta(AK.seat), well0);
    },
  };
}

// --- Entry points -----------------------------------------------------------------------------------------------

/** The held pose, as a "scene" with nothing moving, for guns with no reload choreography. */
function restScene(rig: Rig): ReloadScene {
  return { hands: [rig.trigger, rig.support], dip: 0, draw: (ctx, golden, skin) => drawHeldGun(ctx, rig.gun, rig.R, rig.aim, golden, skin) };
}

/**
 * What a soldier holding `gun` aimed along `aim` (body radius `R`) draws at progress `t` of its reload. `k` (0..1) is how fully
 * the reload pose is on: 1 while it runs, easing to 0 when it is cut off, so the arms come back to the gun smoothly.
 */
export function reloadScene(gun: GunId, R: number, aim: number, t: number, k = 1): ReloadScene {
  const rig = rigOf(gun, R, aim);
  const { base, look, mag } = GUNS[gun];
  t = clamp01(t);
  if (look.hands === 2) return akimboScene(rig, t, k);
  switch (base) {
    case 'pistol': case 'smg': case 'assault': return boxScene(rig, base, t, k);
    case 'lmg': return lmgScene(rig, t, k);
    case 'shotgun': return tubeScene(rig, mag, t, k);
    case 'sniper': return sniperScene(rig, t, k);
    default: return restScene(rig);
  }
}

/** The reload beats at which a magazine is let go, as shares of the reload. */
export function dropBeats(gun: GunId): readonly number[] {
  const { base, look } = GUNS[gun];
  if (look.hands === 2) return [AK.pop * 0.5, 0.5 + AK.pop * 0.5];
  if (base === 'pistol' || base === 'smg' || base === 'assault') return [BEATS.box.drop];
  if (base === 'lmg') return [BEATS.lmg.drop];
  return [];
}

// --- Per-soldier state --------------------------------------------------------------------------------------------

type Track = { t: number; k: number; key: string; at: number; seen: number };
const tracks = new Map<number, Track>();
const FADE_IN_MS = 70, FADE_OUT_MS = 150;
/** Dev probe: soldier `id`'s arm-animation state (share of the reload and pose weight), or null when its arms are not reloading. */
export const reloadTrackOf = (id: number): { t: number; k: number } | null => { const tr = tracks.get(id); return tr ? { t: tr.t, k: tr.k } : null; };
let prunedAt = 0;

/**
 * The kill top-up's tap (see topup.ts): the support hand reaches the ammo and presses rounds in, over `TOPUP_MS`, on the stretch of the
 * gun's own reload where that happens. Only guns that load rounds by hand have one (the bolt-action's clip, the shotgun's shells);
 * a box-mag gun has no motion for it, so its top-up is the sound and the HUD alone.
 */
const TOPUP_SPAN: Partial<Record<WeaponId, readonly [number, number]>> = { sniper: [BEATS.sniper.seat - 0.02, 0.74], shotgun: [0.3, 0.42] };
const topups = new Map<number, number>();
export const startTopup = (id: number, now: number) => { topups.set(id, now); };

function topupFrame(id: number, gun: GunId, now: number): ReloadFrame | null {
  const at = topups.get(id);
  if (at === undefined) return null;
  const u = (now - at) / TOPUP_MS, span = TOPUP_SPAN[GUNS[gun].base];
  if (u >= 1 || u < 0 || !span) { topups.delete(id); return null; }
  // The hand is on its way in for the first quarter and off again for the last.
  return { t: span[0] + (span[1] - span[0]) * u, k: Math.min(1, u / 0.25, (1 - u) / 0.25), drops: [] };
}

export type ReloadFrame = { t: number; k: number; drops: readonly number[] };

/**
 * Follows soldier `id`'s reload through a frame at `now`: `rl` is `[elapsedMs, totalMs]` while it reloads (null otherwise).
 * Returns its progress `t`, how fully the pose is on (`k`: easing in at the start, and out again if the reload is cut off,
 * by a pickup or a change of class) and the magazine-drop beats this frame crossed; null when there is nothing to draw.
 */
export function stepReload(id: number, gun: GunId, rl: readonly [number, number] | null | undefined, now: number): ReloadFrame | null {
  const base = GUNS[gun], key = `${base.base}${base.look.hands === 2 ? '2' : ''}`;
  let tr = tracks.get(id);
  const dt = tr ? Math.min(100, Math.max(0, now - tr.at)) : 0;
  if (now - prunedAt > 4000) {
    prunedAt = now;
    for (const [i, o] of tracks) if (now - o.seen > 3000) tracks.delete(i);
  }
  if (!(rl && rl[1] > 0) && !tr) { const top = topupFrame(id, gun, now); if (top) return top; }
  if (rl && rl[1] > 0) {
    const t = clamp01(rl[0] / rl[1]);
    if (!tr || tr.key !== key) {
      // Seen from the start, the pose eases in; seen already under way (it came into view), it is simply on.
      tr = { t, k: t > 0.08 ? 1 : 0, key, at: now, seen: now };
      tracks.set(id, tr);
      return { t, k: tr.k, drops: [] };
    }
    const before = tr.t;
    tr.t = t;
    tr.k = Math.min(1, tr.k + dt / FADE_IN_MS);
    tr.at = now;
    tr.seen = now;
    const drops = t > before && t - before < 0.3 ? dropBeats(gun).filter((b) => before < b && b <= t) : [];
    return { t, k: tr.k, drops };
  }
  if (!tr) return null;
  tr.k = Math.max(0, tr.k - dt / FADE_OUT_MS);
  tr.at = now;
  // A reload that ran to its end holds its last frame, which is the held pose; one that was cut off eases out from where it was.
  if (tr.k <= 0) { tracks.delete(id); return null; }
  return { t: tr.t, k: tr.k, drops: [] };
}

/** Forgets every soldier's reload (a new round, a reconnect). */
export const clearReloads = () => { tracks.clear(); boltShots.clear(); reloadFoley.clear(); };

/**
 * Your own reload as the page predicts it, so your arms move the instant you press the key: `[elapsedMs, totalMs]` from the
 * predicted trigger (see `fire.ts`) at the page clock `now`, or null when it is not reloading.
 * The trigger counts time in input ticks, which stall whenever the input timer does (a busy frame, a throttled tab): a reload
 * read straight off them runs slow and is cut off, at say 80%, when the server's snapshot says it is done, with the last
 * beats (the bolt going home, the rack) never shown or heard. So once a reload is seen its start is pinned to the page clock and
 * it runs on real time, as the server's does; the tick count only ever pushes it forward.
 */
let selfClock: { until: number; total: number; startAt: number } | null = null;
export function selfReload(f: Firing, now: number): [number, number] | null {
  const t = f.trigger;
  if (!t.alive || t.reloadUntil === null) { selfClock = null; return null; }
  const clock = f.sent.seq * TICK_MS + Math.min(100, Math.max(0, now - f.sent.at));
  const ticks = Math.min(t.reloadMs, Math.max(0, t.reloadMs - (t.reloadUntil - clock)));
  if (!selfClock || selfClock.total !== t.reloadMs || Math.abs(selfClock.until - t.reloadUntil) > 4 * TICK_MS || now < selfClock.startAt) selfClock = { until: t.reloadUntil, total: t.reloadMs, startAt: now - ticks };
  return [Math.min(t.reloadMs, Math.max(ticks, now - selfClock.startAt)), t.reloadMs];
}

/**
 * Lets go of the magazine in `scene.carried`: a spent mag tumbles to the floor from the soldier at (`x`, `y`) aiming along `aim`.
 * Returns where it was let go, for the tink that goes with it.
 */
export function dropCarried(fx: GunFx, x: number, y: number, aim: number, scene: ReloadScene, now: number, rand: () => number = Math.random): { x: number; y: number } | null {
  const c = scene.carried;
  if (!c) return null;
  const cs = Math.cos(aim), sn = Math.sin(aim);
  const wx = x + c.at.x * cs - c.at.y * sn, wy = y + c.at.x * sn + c.at.y * cs;
  // It falls the way the hand pulled it: away from the gun, down-screen, a little forward.
  const out = 40 + rand() * 30;
  dropMag(fx, wx, wy, (rand() - 0.5) * 50, out, now, c.big, rand);
  return { x: wx, y: wy };
}
