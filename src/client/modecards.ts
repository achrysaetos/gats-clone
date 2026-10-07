import { COLORS, type GunId } from '../shared/defs.ts';
import { INK } from './palette.ts';
import {
  barrel, core, crate, flag, floor, lamp, muzzleFlash, muzzleOf, nightShade, paintEllipse, paintHorde, paintSoldier, pool, sandbags, shambler, supply, target, TAU,
  type Shambler,
} from './menuart.ts';

/**
 * The mode cards' dioramas (screen one of the menu): each fight is a small lit scene painted with the match's own art: soldiers
 * (`drawSoldier`), guns, zombies and range targets, props with a top face and a front lip, a practical light, a night grade.
 * Hovering a card wakes its scene: the soldiers turn to your pointer, fire a little faster and the light opens up.
 */
export const STAGE = { w: 360, h: 200 } as const;
export type SceneId = 'FFA' | 'TDM' | 'DOM' | 'BR' | 'ZOM' | 'RNG';

/** What each mode is called on its card and in one line. (No all-caps codes in the pitch: the chip carries the code.) */
export const MODE_INFO: Record<SceneId, { name: string; pitch: string; short: string }> = {
  FFA: { name: 'Free for all', pitch: 'Every soldier for themselves. Top score when the clock runs out wins the yard.', short: 'Free for all' },
  TDM: { name: 'Team deathmatch', pitch: 'Red against Blue. Every kill counts for your squad; hold the line together.', short: 'Team deathmatch' },
  DOM: { name: 'Domination', pitch: 'Capture the zones and keep them. Points tick up for whoever holds the ground.', short: 'Domination' },
  BR: { name: 'Last squad', pitch: 'Squads of three drop in as the storm closes the ring. Be the last squad standing.', short: 'Last squad' },
  ZOM: { name: 'Bastion squad', pitch: 'Hold the core against the horde with up to three friends. Build by day, survive the night.', short: 'Bastion squad' },
  RNG: { name: 'Shooting range', pitch: 'Your own private range. Any gun, any perk, nothing counts toward your record.', short: 'Shooting range' },
};

type Scene = {
  g: CanvasRenderingContext2D; k: number; t: number; hot: number; calm: boolean;
  /** The pointer in stage units, or null when it is elsewhere. */
  ptr: { x: number; y: number } | null;
};
type Item = { y: number; draw(): void };
type Glow = () => void;
type Light = { x: number; y: number; r: number; k?: number };
type Painted = { items: Item[]; glows: Glow[]; lights: Light[]; after?: () => void };

const angleLerp = (a: number, b: number, k: number) => a + Math.atan2(Math.sin(b - a), Math.cos(b - a)) * k;

type Actor = { x: number; y: number; color: string; gun: GunId; base: number; phase: number; period?: number; scale?: number; walk?: boolean; armor?: 'none' | 'light' | 'medium' | 'heavy'; sprint?: number };

/** A soldier of the diorama: idles with a slow sway, turns to the pointer when hot, and fires now and then. Returns its draw call and muzzle light. */
function actor(s: Scene, o: Actor, out: Painted, onShot?: (power: number) => void) {
  const sc = o.scale ?? 1.18;
  let aim = o.base + (s.calm ? 0 : Math.sin(s.t / 1500 + o.phase) * 0.1);
  if (s.ptr && s.hot > 0.02) aim = angleLerp(aim, Math.atan2(s.ptr.y - o.y, s.ptr.x - o.x), Math.min(1, s.hot * 1.1));
  const period = (o.period ?? 3900) * (1 - 0.7 * s.hot);
  const ph = s.calm ? 9999 : (s.t + o.phase * 700) % period;
  const flash = ph < 120 ? 1 - ph / 120 : 0;
  if (flash > 0 && onShot) onShot(flash);
  const spec = { x: o.x, y: o.y, scale: sc, color: o.color, gun: o.gun, aim, armor: o.armor ?? 'medium', now: s.calm ? 0 : s.t, walk: !s.calm && o.walk, recoil: flash * 3, breathe: !s.calm, sprint: o.sprint };
  out.items.push({ y: o.y, draw: () => paintSoldier(s.g, s.k, spec) });
  if (flash > 0) {
    const m = muzzleOf(spec);
    out.glows.push(() => muzzleFlash(s.g, m.x, m.y, aim, flash, 1.1));
  }
}

const item = (out: Painted, y: number, draw: () => void) => out.items.push({ y, draw });

function ffa(s: Scene): Painted {
  const o: Painted = { items: [], glows: [], lights: [{ x: 70, y: 70, r: 270 }] };
  const { g } = s;
  item(o, 52, () => lamp(g, 40, 52));
  item(o, 66, () => barrel(g, 336, 66));
  item(o, 154, () => crate(g, 188, 156, 42));
  item(o, 84, () => crate(g, 128, 86, 34, '#6c7356', 13));
  actor(s, { x: 72, y: 140, color: COLORS.blue, gun: 'assault', base: -0.28, phase: 0 }, o);
  actor(s, { x: 290, y: 128, color: COLORS.red, gun: 'shotgun', base: Math.PI + 0.32, phase: 1.7 }, o);
  actor(s, { x: 236, y: 84, color: COLORS.green, gun: 'smg', base: 2.3, phase: 3.1 }, o);
  return o;
}

function tdm(s: Scene): Painted {
  const o: Painted = { items: [], glows: [], lights: [{ x: 180, y: 60, r: 260 }] };
  const { g } = s;
  item(o, 58, () => lamp(g, 180, 58));
  for (const y of [90, 122, 154]) item(o, y, () => sandbags(g, 166, y, 1, 1));
  item(o, 154, () => sandbags(g, 194, 154, 1, 1));
  item(o, 76, () => barrel(g, 28, 80));
  item(o, 76, () => barrel(g, 336, 84));
  actor(s, { x: 62, y: 112, color: COLORS.blue, gun: 'assault', base: 0.1, phase: 0.4 }, o);
  actor(s, { x: 92, y: 168, color: COLORS.blue, gun: 'smg', base: -0.12, phase: 2.2 }, o);
  actor(s, { x: 300, y: 108, color: COLORS.red, gun: 'smg', base: Math.PI - 0.1, phase: 1.1 }, o);
  actor(s, { x: 270, y: 164, color: COLORS.red, gun: 'lmg', base: Math.PI + 0.14, phase: 2.9 }, o);
  return o;
}

function dom(s: Scene): Painted {
  const o: Painted = { items: [], glows: [], lights: [{ x: 190, y: 122, r: 250 }] };
  const { g } = s;
  const spin = s.calm ? 0 : -s.t / 90;
  // The zone is painted on the floor: bone ring, team fill, a dashed inner ring that turns.
  o.after = undefined;
  item(o, 0, () => {
    g.save();
    g.fillStyle = 'rgba(62, 99, 221, 0.3)';
    g.beginPath(); g.ellipse(190, 122, 104, 54, 0, 0, TAU); g.fill();
    paintEllipse(g, 190, 122, 104, 54, '#b79a4a', 5);
    paintEllipse(g, 190, 122, 88, 45, 'rgba(210, 202, 180, 0.8)', 4, [4, 16], spin);
    g.restore();
  });
  item(o, 128, () => flag(g, 190, 130, COLORS.blue, s.calm ? 0 : s.t));
  item(o, 54, () => lamp(g, 40, 54));
  item(o, 78, () => crate(g, 330, 168, 38, '#6c7356', 14));
  item(o, 68, () => barrel(g, 70, 82));
  actor(s, { x: 138, y: 150, color: COLORS.blue, gun: 'assault', base: 0.25, phase: 0.8 }, o);
  actor(s, { x: 300, y: 84, color: COLORS.red, gun: 'smg', base: 2.55, phase: 2.0 }, o);
  actor(s, { x: 250, y: 168, color: COLORS.orange, gun: 'shotgun', base: -2.4, phase: 3.3 }, o);
  return o;
}

function br(s: Scene): Painted {
  const o: Painted = { items: [], glows: [], lights: [{ x: 312, y: 84, r: 210 }, { x: 36, y: 56, r: 200, k: 0.7 }] };
  const { g } = s;
  const drift = s.calm ? 0 : Math.sin(s.t / 2600) * 4;
  item(o, 56, () => lamp(g, 36, 56));
  item(o, 84, () => supply(g, 312, 86));
  o.glows.push(() => pool(g, 312, 90, 80 + (s.hot ? 12 : 0), 0.4, '255, 120, 60'));
  actor(s, { x: 78 + drift, y: 160, color: COLORS.purple, gun: 'assault', base: -0.05, phase: 0.2, walk: true, sprint: 0, armor: 'light' }, o);
  actor(s, { x: 148 - drift, y: 106, color: COLORS.purple, gun: 'smg', base: 0.03, phase: 1.4, walk: true, armor: 'light' }, o);
  actor(s, { x: 214 + drift, y: 158, color: COLORS.purple, gun: 'sniper', base: -0.12, phase: 2.6, walk: true, armor: 'light' }, o);
  // The storm: the ring's far side is closed in a sick teal-violet haze (light on the edge, not paint on a solid).
  o.after = () => {
    g.save();
    g.globalCompositeOperation = 'source-over';
    const cx = 250, cy = 100;
    const gr = g.createRadialGradient(cx, cy, 90, cx, cy, 240);
    gr.addColorStop(0, 'rgba(124, 70, 200, 0)');
    gr.addColorStop(0.6, 'rgba(110, 60, 190, 0.14)');
    gr.addColorStop(1, 'rgba(76, 38, 140, 0.46)');
    g.fillStyle = gr;
    g.fillRect(0, 0, STAGE.w, STAGE.h);
    g.restore();
    paintEllipse(g, cx, cy, 168, 92, 'rgba(190, 140, 255, 0.85)', 3, [14, 9], s.calm ? 0 : -s.t / 40);
  };
  return o;
}

function zom(s: Scene): Painted {
  const o: Painted = { items: [], glows: [], lights: [{ x: 76, y: 112, r: 230 }] };
  const { g } = s;
  const t = s.calm ? 0 : s.t;
  const w1 = shambler('walker', 282 + (s.calm ? 0 : Math.sin(t / 2300) * 30), 120);
  const w2 = shambler('brute', 322 - (s.calm ? 0 : (Math.sin(t / 3100 + 1) * 0.5 + 0.5) * 22), 70);
  const w3 = shambler('runner', 312, 168 + (s.calm ? 0 : Math.sin(t / 1900 + 2) * 6));
  const list: Shambler[] = [w1, w2, w3];
  item(o, 112, () => core(g, 76, 124, t, 1.1));
  for (const y of [78, 106, 134, 162]) item(o, y, () => sandbags(g, 214, y, 1, 1));
  o.items.push({ y: 100, draw: () => paintHorde(g, s.k, list, s.calm ? 1000 : s.t, { x: 140, y: 120 }, 1.0) });
  actor(s, { x: 142, y: 148, color: COLORS.blue, gun: 'assault', base: 0.06, phase: 0.6, armor: 'heavy' }, o);
  actor(s, { x: 146, y: 84, color: COLORS.green, gun: 'shotgun', base: 0.28, phase: 2.3 }, o);
  o.glows.push(() => pool(g, 76, 130, 110, 0.42 + 0.08 * s.hot, '79, 209, 232'));
  return o;
}

function rng(s: Scene): Painted {
  const o: Painted = { items: [], glows: [], lights: [{ x: 40, y: 52, r: 250 }] };
  const { g } = s;
  const hit = (n: number) => (s.calm ? 0 : Math.max(0, 1 - (((s.t + n * 900) % (s.hot ? 1700 : 3900)) / 260)));
  item(o, 0, () => {
    g.save();
    g.fillStyle = '#b79a4a';
    for (const y of [84, 118, 152]) { g.fillRect(14, y, 332, 3); }
    g.fillStyle = 'rgba(210, 202, 180, 0.85)';
    g.font = '800 12px "Barlow Condensed", sans-serif';
    for (const [x, label] of [[160, '300'], [230, '600'], [300, '900']] as const) g.fillText(label, x, 76);
    g.restore();
  });
  item(o, 52, () => lamp(g, 40, 52));
  const hs = [hit(0), hit(1), hit(2)];
  item(o, 88, () => target(g, 262, 92, 'paper', 0.82, hs[0]! * 0.12, 3, hs[0]! * 0.6));
  item(o, 122, () => target(g, 300, 124, 'plank', 0.8, hs[1]! * -0.1, 2, hs[1]! * 0.6));
  item(o, 156, () => target(g, 336, 158, 'paper', 0.82, hs[2]! * 0.12, 1, hs[2]! * 0.6));
  item(o, 176, () => { barrel(g, 150, 184, 0.9); barrel(g, 176, 186, 0.9, '#6c7356'); });
  actor(s, { x: 84, y: 128, color: COLORS.blue, gun: 'sniper', base: -0.12, phase: 0, period: 2200 }, o);
  return o;
}

const SCENES: Record<SceneId, (s: Scene) => Painted> = { FFA: ffa, TDM: tdm, DOM: dom, BR: br, ZOM: zom, RNG: rng };
const FLOOR_SEED: Record<SceneId, number> = { FFA: 3, TDM: 5, DOM: 7, BR: 11, ZOM: 13, RNG: 17 };
const EDGE: Record<SceneId, string> = { FFA: '86, 98, 154', TDM: '86, 98, 154', DOM: '86, 98, 154', BR: '72, 80, 146', ZOM: '70, 94, 140', RNG: '90, 100, 150' };

/** Paints one scene into the stage. `k` is canvas pixels per stage unit. */
export function paintScene(id: SceneId, g: CanvasRenderingContext2D, k: number, t: number, hot: number, ptr: { x: number; y: number } | null, calm: boolean) {
  g.save();
  g.setTransform(k, 0, 0, k, 0, 0);
  g.lineJoin = 'round';
  floor(g, STAGE.w, STAGE.h, 84, FLOOR_SEED[id]);
  const scene: Scene = { g, k, t, hot, calm, ptr };
  const p = SCENES[id](scene);
  p.items.sort((a, b) => a.y - b.y);
  for (const it of p.items) it.draw();
  const open = 1 + 0.18 * hot;
  nightShade(g, STAGE.w, STAGE.h, p.lights.map((l) => ({ ...l, r: l.r * open, k: (l.k ?? 1) * (1 + 0.5 * hot) })), EDGE[id]);
  for (const l of p.lights) pool(g, l.x, l.y + 24, l.r * 0.34 * open, 0.2 + 0.16 * hot);
  p.after?.();
  for (const glow of p.glows) glow();
  // A hard ink frame; the DOM plate adds the bevel.
  g.strokeStyle = INK;
  g.lineWidth = 3;
  g.strokeRect(0, 0, STAGE.w, STAGE.h);
  g.restore();
}

type Entry = { canvas: HTMLCanvasElement; id: SceneId; card: HTMLElement; hot: number; target: number; ptr: { x: number; y: number } | null; last: number; seen: boolean };

/** Runs every card's scene on one clock: the hovered card at ~30 fps, the rest slowly; nothing while off screen, hidden or calm. */
export function createModeArt(calm: () => boolean) {
  const entries = new Map<HTMLCanvasElement, Entry>();
  let raf = 0;
  let on = false;
  const io = typeof IntersectionObserver === 'function' ? new IntersectionObserver((list) => { for (const e of list) { const en = entries.get(e.target as HTMLCanvasElement); if (en) en.seen = e.isIntersecting; } }) : null;

  const size = (e: Entry) => {
    const r = e.canvas.getBoundingClientRect();
    const dpr = Math.min(2, Math.max(1, typeof devicePixelRatio === 'number' ? devicePixelRatio : 1));
    const w = Math.max(2, Math.round(r.width * dpr));
    const h = Math.round((w * STAGE.h) / STAGE.w);
    if (e.canvas.width !== w || e.canvas.height !== h) { e.canvas.width = w; e.canvas.height = h; }
    return { w, k: w / STAGE.w, rect: r };
  };

  const draw = (e: Entry, now: number) => {
    const { k } = size(e);
    if (e.canvas.width <= 2) return;
    const g = e.canvas.getContext('2d');
    if (!g) return;
    e.last = now;
    paintScene(e.id, g, k, now, e.hot, e.ptr, calm());
  };

  const tick = (now: number) => {
    raf = on ? requestAnimationFrame(tick) : 0;
    const still = calm();
    for (const e of entries.values()) {
      if (!e.seen) continue;
      const ease = e.hot + (e.target - e.hot) * 0.2;
      e.hot = Math.abs(ease - e.target) < 0.01 ? e.target : ease;
      const busy = e.target > 0 || e.hot > 0;
      const gap = busy ? 33 : still ? 600 : 90;
      if (now - e.last >= gap) draw(e, now);
    }
  };

  return {
    add(canvas: HTMLCanvasElement, id: SceneId, card: HTMLElement) {
      const e: Entry = { canvas, id, card, hot: 0, target: 0, ptr: null, last: -1e9, seen: true };
      entries.set(canvas, e);
      io?.observe(canvas);
      const place = (ev: PointerEvent) => {
        const r = canvas.getBoundingClientRect();
        // The canvas is cropped to the card's window (object-fit: cover, 62% down), so map through the same fit.
        const k = Math.max(r.width / STAGE.w, r.height / STAGE.h);
        e.ptr = { x: (ev.clientX - r.left - (r.width - STAGE.w * k) * 0.5) / k, y: (ev.clientY - r.top - (r.height - STAGE.h * k) * 0.62) / k };
      };
      card.addEventListener('pointerenter', (ev) => { if (ev.pointerType === 'touch') return; e.target = 1; place(ev); });
      card.addEventListener('pointermove', (ev) => { if (ev.pointerType !== 'touch') place(ev); });
      card.addEventListener('pointerleave', () => { e.target = 0; e.ptr = null; });
      card.addEventListener('focusin', () => { e.target = 1; if (!e.ptr) e.ptr = { x: STAGE.w * 0.62, y: STAGE.h * 0.5 }; });
      card.addEventListener('focusout', () => { e.target = 0; e.ptr = null; });
    },
    remove(canvas: HTMLCanvasElement) { io?.unobserve(canvas); entries.delete(canvas); },
    clear() { for (const c of entries.keys()) io?.unobserve(c); entries.clear(); },
    /** Repaints every card now (a resize, a step change, or the calm still). */
    paint(now = 0) { for (const e of entries.values()) draw(e, now); },
    start() { if (on) return; on = true; if (!raf) raf = requestAnimationFrame(tick); },
    stop() { on = false; },
    get running() { return on; },
  };
}

export type ModeArt = ReturnType<typeof createModeArt>;
