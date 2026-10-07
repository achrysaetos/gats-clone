import { COSMETIC_BY_ID, type Cosmetic } from '../shared/cosmetics.ts';
import { COLORS, WORLD, type ColorId, type GunId } from '../shared/defs.ts';
import { drawSoldier } from './bodies.ts';
import { drawBursts, emitBit, resetFx, onDeath } from './killfx.ts';
import { drawGunArt, drawHeldGun, heldHands } from './gunart.ts';
import { cosLook, lookOfEquipped, type CosLook } from './cosmeticlook.ts';
import type { Equipped } from '../shared/cosmetics.ts';
import { nameInk } from './nametag.ts';

/**
 * Soldiers and items drawn into plain canvases for the menu: the armory's live preview, the grid's icons, the XP card's reveal and
 * the profile page. They use the same drawing as the match (drawSoldier, the gun art), so what you pick is what others see.
 */
const R = WORLD.playerRadius;
const dprOf = () => Math.max(1, Math.min(3, typeof devicePixelRatio === 'number' ? devicePixelRatio : 1));

export type PreviewOpts = {
  look: CosLook; color: string; gun: GunId; aim: number; now: number;
  /** Body radii on screen; the soldier is drawn at `scale` x the world's size. */
  scale: number;
  armor?: 'none' | 'light' | 'medium' | 'heavy';
  walking?: boolean;
  /** Where the soldier stands, as shares of the canvas (default centre). */
  at?: { x: number; y: number };
};

function fit(canvas: HTMLCanvasElement): { ctx: CanvasRenderingContext2D; w: number; h: number; dpr: number } | null {
  const rect = canvas.getBoundingClientRect();
  const w = Math.round(canvas.clientWidth || rect.width || Number(canvas.dataset.w) || 160);
  const h = Math.round(canvas.clientHeight || rect.height || Number(canvas.dataset.h) || 120);
  const dpr = dprOf();
  if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) { canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr); }
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, h);
  return { ctx, w, h, dpr };
}

/** A soldier with a gun, standing on a contact shadow, in the canvas. */
export function drawPreview(canvas: HTMLCanvasElement, o: PreviewOpts): void {
  const f = fit(canvas);
  if (!f) return;
  const { ctx, w, h, dpr } = f;
  const x = w * (o.at?.x ?? 0.5), y = h * (o.at?.y ?? 0.52);
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(o.scale, o.scale);
  const hands = heldHands(o.gun, R, o.aim);
  const phase = o.walking ? o.now / 260 : 0;
  drawSoldier(ctx, o.color, 0, 0, R, {
    angle: o.aim, armor: o.armor ?? 'medium', hands, jump: 0, flash: 0,
    helmet: o.look.helmet, camo: o.look.camo, spin: o.now / 180,
    gait: o.walking ? { x: 0, y: 0, t: o.now, phase, speed: 220, heading: o.aim } : undefined,
    gun: (g) => drawHeldGun(g, o.gun, R, o.aim, false, o.look.skin),
  }, dpr * o.scale);
  ctx.restore();
}

/** A bust for a helmet or camo card: the soldier turned toward the viewer, close in. */
export function drawBust(canvas: HTMLCanvasElement, c: Cosmetic, color: ColorId = 'blue', now = 0): void {
  const f = fit(canvas);
  if (!f) return;
  const look = lookOfEquipped({ [c.slot]: c.id } as unknown as Equipped);
  const { ctx, w, h } = f;
  drawPreview(canvas, { look, color: COLORS[color], gun: 'smg', aim: Math.PI * 0.5, now, scale: Math.min(w / 56, h / 62) * (c.slot === 'helmet' ? 2.1 : 1.5), armor: c.slot === 'camo' ? 'none' : 'light', at: { x: 0.5, y: c.slot === 'helmet' ? 0.7 : 0.5 } });
  void ctx;
}

/** A gun in a skin, for a skin card. */
export function drawSkinCard(canvas: HTMLCanvasElement, c: Cosmetic, gun: GunId = 'assault'): void {
  const f = fit(canvas);
  if (!f) return;
  drawGunArt(f.ctx, gun, 4, 4, f.w - 8, f.h - 8, { skin: c.id });
}

/** Name colour and title cards: the item itself as it would read on a plate. */
export function drawNameSample(canvas: HTMLCanvasElement, c: Cosmetic, name: string, now = 0): void {
  const f = fit(canvas);
  if (!f) return;
  const { ctx, w, h } = f;
  ctx.fillStyle = '#131519';
  ctx.beginPath();
  const pw = Math.min(w - 8, 150), ph = 24, px = (w - pw) / 2, py = (h - ph) / 2, cut = 5;
  ctx.moveTo(px, py); ctx.lineTo(px + pw - cut, py); ctx.lineTo(px + pw, py + cut); ctx.lineTo(px + pw, py + ph); ctx.lineTo(px + cut, py + ph); ctx.lineTo(px, py + ph - cut);
  ctx.closePath();
  ctx.fill();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = '700 17px "Barlow Condensed", system-ui, sans-serif';
  const tw = ctx.measureText(name).width;
  if (c.slot === 'nameColor') ctx.fillStyle = nameInk(ctx, c.id, w / 2 - tw / 2, tw, now);
  else ctx.fillStyle = '#ece6d6';
  ctx.fillText(name, w / 2, h / 2 + 1);
}

/** A kill effect card: its swatch colours as a small burst, drawn flat (the live effect plays in the armory's preview). */
export function drawFxSample(canvas: HTMLCanvasElement, c: Cosmetic): void {
  const f = fit(canvas);
  if (!f) return;
  const { ctx, w, h } = f;
  const cols = c.swatch.length ? c.swatch : ['#e2dccb'];
  ctx.lineJoin = 'round';
  const n = 9;
  for (let i = 0; i < n; i++) {
    const a = (i * Math.PI * 2) / n + 0.3, r = 12 + (i % 3) * 7;
    const x = w / 2 + Math.cos(a) * r * 1.5, y = h / 2 + Math.sin(a) * r * 0.9;
    ctx.fillStyle = cols[i % cols.length]!;
    ctx.strokeStyle = '#1c1f26';
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    if (c.id === 'k_ink' || c.id === 'k_bubbles') ctx.arc(x, y, 4 + (i % 3) * 2, 0, Math.PI * 2);
    else ctx.rect(x - 4, y - 3, 8, 6);
    ctx.fill();
    ctx.stroke();
  }
}

/** The card art for any cosmetic. */
export function drawItem(canvas: HTMLCanvasElement, c: Cosmetic, now = 0): void {
  switch (c.slot) {
    case 'helmet': case 'camo': return drawBust(canvas, c, 'blue', now);
    case 'gunSkin': return drawSkinCard(canvas, c);
    case 'nameColor': return drawNameSample(canvas, c, 'Viper', now);
    case 'title': return drawNameSample(canvas, c, c.name, now);
    case 'killFx': return drawFxSample(canvas, c);
  }
}

/** Plays kill effect `fx` on a preview canvas: call every frame with the page clock; it re-fires the burst every `every` ms. */
export function createFxStage() {
  let last = -Infinity;
  return (canvas: HTMLCanvasElement, fx: string, now: number, every = 1500) => {
    const f = fit(canvas);
    if (!f) return;
    if (now - last > every) {
      last = now;
      resetFx();
      onDeath({ x: 0, y: 0, color: '#3a7be8', dir: 0.4, mine: false, self: false, preview: true, fx }, now);
    }
    f.ctx.save();
    f.ctx.translate(f.w / 2, f.h * 0.55);
    drawBursts(f.ctx, now);
    f.ctx.restore();
  };
}
void emitBit; void cosLook; void COSMETIC_BY_ID;
