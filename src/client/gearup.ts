import { COLORS, type ArmorId, type GunId } from '../shared/defs.ts';
import type { Loadout } from '../shared/protocol.ts';
import type { CosLook } from './cosmeticlook.ts';
import { floor, lamp, muzzleFlash, muzzleOf, nightShade, paintEllipse, paintSoldier, pool, TAU } from './menuart.ts';
import { INK } from './palette.ts';

/**
 * The gear-up stage: your soldier, standing on a lit concrete pad in the diorama's yard: your colour, armor, gun in hand and
 * what you have equipped, turning to follow the pointer. A click on the stage fires (a muzzle flash and a kick). Hovering a gun
 * tile puts that gun in the soldier's hands for a look. It paints with the match's own soldier and gun art.
 */
export const GEAR_STAGE = { w: 420, h: 250 } as const;

type Deps = { loadout(): Loadout; look(): CosLook; calm(): boolean };

export function createGearStage(canvas: HTMLCanvasElement, deps: Deps) {
  let raf = 0, on = false, last = 0;
  let aim = 0.35, target = 0.35;
  let flashAt = -1e9;
  let peek: GunId | null = null;
  let mouse: { x: number; y: number } | null = null;
  const motes = Array.from({ length: 26 }, (_, i) => ({ x: (i * 97) % GEAR_STAGE.w, y: (i * 53) % GEAR_STAGE.h, p: i, v: 3 + (i % 5) }));

  const size = () => {
    const r = canvas.getBoundingClientRect();
    const dpr = Math.min(2, Math.max(1, typeof devicePixelRatio === 'number' ? devicePixelRatio : 1));
    const w = Math.max(2, Math.round(r.width * dpr)), h = Math.round((w * GEAR_STAGE.h) / GEAR_STAGE.w);
    if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
    return { k: w / GEAR_STAGE.w, rect: r };
  };

  const draw = (now: number) => {
    const { k, rect } = size();
    if (canvas.width <= 2) return;
    const g = canvas.getContext('2d');
    if (!g) return;
    const calm = deps.calm();
    const t = calm ? 0 : now;
    const l = deps.loadout();
    const look = deps.look();
    const gun = peek ?? l.weapon;
    const W = GEAR_STAGE.w, H = GEAR_STAGE.h;
    const cx = W * 0.5, cy = H * 0.58;
    // Aim: toward the pointer when it moves, otherwise a slow sweep; never snaps (anticipation, then settle).
    if (mouse && !calm) target = Math.atan2((mouse.y - rect.top) / rect.height * H - (cy - 34), (mouse.x - rect.left) / rect.width * W - cx);
    else target = 0.3 + Math.sin(t / 2300) * 0.35;
    const d = Math.atan2(Math.sin(target - aim), Math.cos(target - aim));
    aim += d * (calm ? 1 : 0.14);

    g.save();
    g.setTransform(k, 0, 0, k, 0, 0);
    g.lineJoin = 'round';
    floor(g, W, H, 96, 21);
    // The yard around the pad.
    lamp(g, 40, 70, 62);
    // The pad: a podium with a lit top face and a darker front.
    const pad = { rx: 104, ry: 38, lip: 15 };
    g.fillStyle = 'rgba(10, 12, 18, 0.42)';
    g.beginPath(); g.ellipse(cx + 14, cy + pad.lip + 10, pad.rx + 6, pad.ry + 4, 0, 0, TAU); g.fill();
    g.save();
    g.translate(cx, cy);
    g.lineWidth = 6; g.strokeStyle = INK;
    const side = () => { g.beginPath(); g.ellipse(0, 0, pad.rx, pad.ry, 0, Math.PI, 0, true); g.lineTo(pad.rx, pad.lip); g.ellipse(0, pad.lip, pad.rx, pad.ry, 0, 0, Math.PI); g.closePath(); };
    side(); g.stroke();
    g.fillStyle = '#3d4450'; side(); g.fill();
    g.save(); side(); g.clip(); g.fillStyle = '#4f5560'; g.fillRect(-pad.rx, 0, pad.rx * 0.9, pad.lip + pad.ry); g.restore();
    g.fillStyle = INK; g.beginPath(); g.ellipse(0, 0, pad.rx + 2, pad.ry + 2, 0, 0, TAU); g.fill();
    g.fillStyle = '#7b8492'; g.beginPath(); g.ellipse(0, 0, pad.rx - 2, pad.ry - 1.5, 0, 0, TAU); g.fill();
    g.save(); g.beginPath(); g.ellipse(0, 0, pad.rx - 2, pad.ry - 1.5, 0, 0, TAU); g.clip();
    g.fillStyle = '#656e7c'; g.beginPath(); g.ellipse(18, 14, pad.rx * 0.98, pad.ry * 0.98, 0, 0, TAU); g.ellipse(0, 0, pad.rx * 1.4, pad.ry * 1.4, 0, 0, TAU, true); g.fill('evenodd');
    g.restore();
    // Stencil rings painted on the top face; the team colour band under the boots.
    paintEllipse(g, 0, 0, pad.rx - 18, pad.ry - 8, '#b79a4a', 4);
    paintEllipse(g, 0, 0, pad.rx - 36, pad.ry - 16, 'rgba(210, 202, 180, 0.9)', 3, [3, 12]);
    g.restore();
    // Soldier.
    const sc = 1.7;
    const recoil = Math.max(0, 1 - (t - flashAt) / 140);
    const spec = { x: cx, y: cy - 4, scale: sc, color: COLORS[l.color], gun, aim, armor: l.armor as ArmorId, now: t, helmet: look.helmet, camo: look.camo, skin: look.skin, recoil: recoil * 3.5, breathe: !calm };
    paintSoldier(g, k, spec);
    // Light: the lamp's pool, and the muzzle when it fires.
    nightShade(g, W, H, [{ x: 46, y: 60, r: 330, k: 1.1 }, { x: cx, y: cy - 20, r: 200, k: 0.8 }], '72, 84, 138');
    pool(g, cx - 10, cy, 190, 0.2);
    pool(g, 40, 9, 18, 0.7, '255, 214, 140', 1);
    // Dust in the lamp's light.
    g.save();
    g.fillStyle = '#e2dccb';
    for (const m of motes) {
      const x = (m.x + (calm ? 0 : t / 1000) * m.v) % W, y = (m.y - (calm ? 0 : t / 1000) * m.v * 1.4 + H * 4) % H;
      const near = Math.max(0, 1 - Math.hypot((x - 50) / 260, (y - 70) / 220));
      if (near <= 0) continue;
      g.globalAlpha = near * 0.7;
      g.beginPath(); g.arc(x, y, 1.3, 0, TAU); g.fill();
    }
    g.restore();
    const f = Math.max(0, 1 - (t - flashAt) / 110);
    if (f > 0 && !calm) { const m = muzzleOf(spec); muzzleFlash(g, m.x, m.y, aim, f, 2.1); }
    g.strokeStyle = INK; g.lineWidth = 3; g.strokeRect(0, 0, W, H);
    g.restore();
  };

  const tick = (now: number) => {
    raf = on ? requestAnimationFrame(tick) : 0;
    if (now - last < 1000 / 30) return;
    last = now;
    draw(now);
  };
  const move = (e: PointerEvent) => { if (e.pointerType === 'touch') return; mouse = { x: e.clientX, y: e.clientY }; };
  const fire = (e: PointerEvent) => { flashAt = performance.now(); mouse = { x: e.clientX, y: e.clientY }; };
  const onVisible = () => { if (document.hidden) { cancelAnimationFrame(raf); raf = 0; } else if (on && !raf && !deps.calm()) raf = requestAnimationFrame(tick); };

  return {
    start() {
      if (on) return;
      on = true;
      addEventListener('pointermove', move, { passive: true });
      canvas.addEventListener('pointerdown', fire);
      document.addEventListener('visibilitychange', onVisible);
      draw(performance.now());
      if (!deps.calm() && !raf) raf = requestAnimationFrame(tick);
    },
    stop() {
      on = false;
      cancelAnimationFrame(raf);
      raf = 0;
      removeEventListener('pointermove', move);
      canvas.removeEventListener('pointerdown', fire);
      document.removeEventListener('visibilitychange', onVisible);
    },
    /** Repaint now (a pick changed, and the calm still has no loop). */
    paint() { if (on) draw(performance.now()); },
    peek(gun: GunId | null) { peek = gun; if (on && deps.calm()) draw(performance.now()); },
    /** Fires the muzzle (a touch tap, or a key). */
    fire() { flashAt = performance.now(); },
    get running() { return on; },
  };
}
