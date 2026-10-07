import { COLORS } from '../shared/defs.ts';
import { barrel, crate, floor, lamp, nightShade, paintEllipse, paintSoldier, pool, sandbags, supply, TAU } from './menuart.ts';

/**
 * The slow diorama behind the menu: a night yard with two lamps, a few idle soldiers, crates and sandbags, and dust drifting in the
 * light. It is the same toy-soldier art as the match, graded dark under a CSS vignette so the plates on top stay readable. It is cheap:
 * the floor and props are painted once per size, the rest at about 14 fps at half resolution, and it stops when the tab is hidden,
 * the menu is closed (the game owns the screen) or the player asked for reduced motion (then it paints once).
 */
const FPS = 14;

type Mote = { x: number; y: number; vx: number; vy: number; r: number; a: number; p: number };

export function createMenuScene(canvas: HTMLCanvasElement, calm: () => boolean) {
  const g = canvas.getContext('2d')!;
  const base = document.createElement('canvas');
  const bg = base.getContext('2d')!;
  let w = 0, h = 0, k = 1, u = 1;
  let raf = 0, on = false, last = 0;
  let motes: Mote[] = [];
  let lamps: { x: number; y: number }[] = [];
  let pointer = { x: 0.5, y: 0.5 };

  const layout = () => {
    const r = canvas.getBoundingClientRect();
    const cw = Math.max(2, r.width), ch = Math.max(2, r.height);
    // Half resolution is plenty under the vignette, and keeps the backdrop to a few percent of a frame.
    const res = Math.min(1, (typeof devicePixelRatio === 'number' ? devicePixelRatio : 1) * 0.6);
    k = res;
    w = Math.round(cw * res); h = Math.round(ch * res);
    if (canvas.width === w && canvas.height === h && base.width === w) return;
    canvas.width = base.width = w; canvas.height = base.height = h;
    u = Math.max(0.55, Math.min(cw, ch) / 760) * res * 1.0;
    lamps = [{ x: w * 0.17, y: h * 0.4 }, { x: w * 0.84, y: h * 0.3 }];
    paintBase();
    let n = 7;
    const rnd = () => { n = (n * 9301 + 49297) % 233280; return n / 233280; };
    motes = Array.from({ length: 46 }, () => ({ x: rnd() * w, y: rnd() * h, vx: (rnd() - 0.3) * 4, vy: -2 - rnd() * 4, r: (0.8 + rnd() * 1.4) * res, a: 0.3 + rnd() * 0.5, p: rnd() * 6 }));
  };

  /** The floor, the lamp posts' feet and the props: static for a given size. */
  const paintBase = () => {
    bg.setTransform(1, 0, 0, 1, 0, 0);
    floor(bg, w, h, 150 * u, 4);
    bg.save();
    bg.scale(u * 1.6, u * 1.6);
    const sx = (v: number) => v / (u * 1.6);
    const items: { y: number; draw: () => void }[] = [
      { y: h * 0.78, draw: () => crate(bg, sx(w * 0.28), sx(h * 0.82), 46) },
      { y: h * 0.78, draw: () => crate(bg, sx(w * 0.3 + 48 * u), sx(h * 0.86), 38, '#5f6a48', 14) },
      { y: h * 0.8, draw: () => barrel(bg, sx(w * 0.12), sx(h * 0.84), 1.15) },
      { y: h * 0.8, draw: () => barrel(bg, sx(w * 0.12 + 34 * u), sx(h * 0.88), 1.15, '#6c7356') },
      { y: h * 0.9, draw: () => sandbags(bg, sx(w * 0.7), sx(h * 0.9), 4, 2) },
      { y: h * 0.2, draw: () => barrel(bg, sx(w * 0.62), sx(h * 0.16), 1.15) },
      { y: h * 0.16, draw: () => crate(bg, sx(w * 0.36), sx(h * 0.14), 44) },
      { y: h * 0.62, draw: () => supply(bg, sx(w * 0.93), sx(h * 0.66)) },
    ];
    items.sort((a, b) => a.y - b.y);
    for (const it of items) it.draw();
    bg.restore();
    // A faded painted lane on the floor, like the yard's stencils.
    bg.save();
    bg.globalAlpha = 0.5;
    paintEllipse(bg, w * 0.5, h * 0.55, w * 0.34, h * 0.26, '#b79a4a', Math.max(2, 5 * u), [Math.max(8, 26 * u), Math.max(8, 20 * u)]);
    bg.restore();
  };

  const draw = (now: number) => {
    const t = calm() ? 0 : now;
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.drawImage(base, 0, 0);
    const s = u * 1.6;
    // Idle soldiers around the lamps, each with a slow sway and a glance toward the pointer.
    const who: { x: number; y: number; color: string; gun: 'assault' | 'smg' | 'shotgun' | 'sniper' | 'lmg'; base: number; ph: number }[] = [
      { x: w * 0.2, y: h * 0.52, color: COLORS.blue, gun: 'assault', base: 0.0, ph: 0 },
      { x: w * 0.1, y: h * 0.62, color: COLORS.blue, gun: 'smg', base: -0.4, ph: 1.9 },
      { x: w * 0.82, y: h * 0.44, color: COLORS.red, gun: 'shotgun', base: Math.PI + 0.1, ph: 3.2 },
      { x: w * 0.9, y: h * 0.52, color: COLORS.red, gun: 'lmg', base: Math.PI - 0.3, ph: 4.4 },
      { x: w * 0.55, y: h * 0.9, color: COLORS.green, gun: 'sniper', base: -1.4, ph: 2.2 },
    ];
    who.sort((a, b) => a.y - b.y);
    for (const a of who) {
      const look = Math.atan2(pointer.y * h - a.y, pointer.x * w - a.x);
      const aim = a.base + Math.sin(t / 2600 + a.ph) * 0.12 + Math.sin(look - a.base) * 0.1;
      paintSoldier(g, k, { x: a.x, y: a.y, scale: s, color: a.color, gun: a.gun, aim, now: t, armor: 'medium' });
    }
    for (const l of lamps) lamp(g, l.x, l.y, 70, 1);
    const flick = calm() ? 1 : 0.94 + 0.06 * Math.sin(now / 410) * Math.sin(now / 1130);
    nightShade(g, w, h, lamps.map((l) => ({ x: l.x, y: l.y + 14 * s, r: Math.min(w, h) * 0.78, k: 1.15 * flick })), '58, 70, 124');
    for (const l of lamps) pool(g, l.x, l.y + 10 * s, Math.min(w, h) * 0.3, 0.28 * flick);
    for (const l of lamps) pool(g, l.x, l.y - 68 * s, 18 * s, 0.7 * flick, '255, 214, 140', 1);
    // Dust, visible only inside the light.
    g.save();
    g.fillStyle = '#e2dccb';
    for (const m of motes) {
      let near = 0;
      for (const l of lamps) near = Math.max(near, 1 - Math.hypot((m.x - l.x) / (w * 0.5), (m.y - l.y) / (h * 0.7)));
      if (near <= 0) continue;
      g.globalAlpha = Math.min(1, near * 1.3) * m.a * (0.6 + 0.4 * Math.sin(t / 900 + m.p));
      g.beginPath();
      g.arc(m.x, m.y, m.r, 0, TAU);
      g.fill();
    }
    g.restore();
  };

  const step = (dt: number) => {
    for (const m of motes) {
      m.x += m.vx * dt * k; m.y += m.vy * dt * k;
      if (m.y < -4) { m.y = h + 4; m.x = Math.random() * w; }
      if (m.x < -4) m.x = w + 4; else if (m.x > w + 4) m.x = -4;
    }
  };

  const tick = (now: number) => {
    raf = on ? requestAnimationFrame(tick) : 0;
    if (now - last < 1000 / FPS) return;
    step(Math.min(0.2, (now - last) / 1000));
    last = now;
    draw(now);
  };

  const onMove = (e: PointerEvent) => { pointer = { x: e.clientX / Math.max(1, innerWidth), y: e.clientY / Math.max(1, innerHeight) }; };
  const onResize = () => { if (on) { layout(); draw(performance.now()); } };
  const onVisible = () => { if (document.hidden) { cancelAnimationFrame(raf); raf = 0; } else if (on && !raf && !calm()) raf = requestAnimationFrame(tick); };

  return {
    start() {
      if (on) return;
      on = true;
      layout();
      draw(performance.now());
      addEventListener('resize', onResize);
      addEventListener('pointermove', onMove, { passive: true });
      document.addEventListener('visibilitychange', onVisible);
      if (!calm() && !document.hidden && !raf) raf = requestAnimationFrame(tick);
    },
    stop() {
      on = false;
      cancelAnimationFrame(raf);
      raf = 0;
      removeEventListener('resize', onResize);
      removeEventListener('pointermove', onMove);
      document.removeEventListener('visibilitychange', onVisible);
    },
    get running() { return on; },
  };
}
