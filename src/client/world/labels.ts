import { WORLD, ZOM, ZOMBIES } from '../../shared/defs.ts';
import type { Camera } from '../camera.ts';
import { clock } from '../derive.ts';
import { NUMBER_MS, numberHeight } from '../feedback.ts';
import { NIGHT, PALETTE } from '../palette.ts';
import type { Scene } from './scene.ts';

/** Words and bars the world carries, drawn crisp on the HUD canvas over the WebGL world in the same camera. */
const R = WORLD.playerRadius;
const MARK_Y = -R - 8;
const TAG = { bar: R + 7, barW: 36, barH: 3.5, name: R + 21, font: 11, nameAlpha: 0.85 } as const;
const FONT = 'system-ui, -apple-system, "Segoe UI", sans-serif';

export function drawLabels(ctx: CanvasRenderingContext2D, scene: Scene, cam: Camera, dpr: number, now: number) {
  const k = dpr * cam.scale;
  ctx.setTransform(k, 0, 0, k, dpr * (cam.w / 2 - cam.x * cam.scale), dpr * (cam.h / 2 - cam.y * cam.scale));
  const night = scene.dark > 0.5;
  const ink = night ? NIGHT.label : PALETTE.label;
  ctx.textAlign = 'center';

  for (const z of scene.zones) {
    ctx.globalAlpha = 0.88;
    ctx.beginPath();
    ctx.roundRect(z.x - 28, z.y - 28, 56, 56, 12);
    ctx.fillStyle = 'rgba(28, 32, 40, 0.82)';
    ctx.fill();
    ctx.lineWidth = 3;
    ctx.strokeStyle = z.color;
    ctx.stroke();
    ctx.globalAlpha = 1;
    ctx.fillStyle = '#ffffff';
    ctx.font = `800 30px ${FONT}`;
    ctx.textBaseline = 'middle';
    ctx.fillText(z.letter, z.x, z.y + 2);
  }

  ctx.font = `600 ${TAG.font}px ${FONT}`;
  ctx.textBaseline = 'alphabetic';
  // Light names on a dark halo read on sunlit concrete and in shadow alike.
  ctx.globalAlpha = TAG.nameAlpha;
  ctx.lineWidth = 3;
  ctx.lineJoin = 'round';
  ctx.strokeStyle = 'rgba(20, 22, 28, 0.75)';
  ctx.fillStyle = '#f2f4f8';
  for (const t of scene.tags) if (t.name !== null) { ctx.strokeText(t.name, t.x, t.y + TAG.name); ctx.fillText(t.name, t.x, t.y + TAG.name); }
  ctx.globalAlpha = 1;

  for (const t of scene.tags) {
    if (t.bar <= 0) continue;
    ctx.globalAlpha = t.bar;
    const x = t.x - TAG.barW / 2, y = t.y + TAG.bar;
    ctx.fillStyle = night ? 'rgba(230, 235, 245, 0.25)' : 'rgba(40, 44, 52, 0.2)';
    ctx.fillRect(x, y, TAG.barW, TAG.barH);
    ctx.fillStyle = t.hp > 0.35 ? ink : PALETTE.hpBad;
    ctx.fillRect(x, y, TAG.barW * t.hp, TAG.barH);
  }
  ctx.globalAlpha = 1;

  for (const z of scene.zombies) {
    if (!z.bar) continue;
    const r = ZOMBIES[z.kind].radius, half = r - 2;
    ctx.fillStyle = 'rgba(28, 31, 38, 0.45)';
    ctx.beginPath();
    ctx.roundRect(z.x - half - 1, z.y - r - 13, half * 2 + 2, 6, 3);
    ctx.fill();
    ctx.fillStyle = z.hp > 3 ? PALETTE.hpBad : '#ff9f43';
    ctx.beginPath();
    ctx.roundRect(z.x - half, z.y - r - 12, Math.max(4, half * 2 * (z.hp / 10)), 4, 2);
    ctx.fill();
  }

  ctx.lineJoin = 'round';
  for (const d of scene.downed) {
    if (d.bleedLeft === null) continue;
    ctx.font = `750 12px ${FONT}`;
    ctx.textBaseline = 'middle';
    ctx.lineWidth = 3;
    ctx.strokeStyle = 'rgba(28, 31, 38, 0.7)';
    ctx.strokeText(clock(d.bleedLeft), d.x, d.y - R - 22);
    ctx.fillStyle = d.bleedLeft < 8000 ? PALETTE.hunted : '#ffffff';
    ctx.fillText(clock(d.bleedLeft), d.x, d.y - R - 22);
  }

  for (const d of scene.drops) {
    if (d.landsIn === null) continue;
    ctx.globalAlpha = 0.95;
    ctx.font = `800 22px ${FONT}`;
    ctx.textBaseline = 'middle';
    ctx.fillStyle = PALETTE.gold;
    ctx.fillText(String(Math.ceil(d.landsIn / 1000)), d.x, d.y);
    ctx.globalAlpha = 1;
  }

  if (scene.ghost?.ghost.label) {
    const { ghost } = scene.ghost;
    const x = ghost.cx * ZOM.cell, y = ghost.cy * ZOM.cell, w = ZOM.cell;
    const ok = ghost.refusal === null;
    ctx.font = `800 14px ${FONT}`;
    ctx.textBaseline = 'middle';
    const lw = ctx.measureText(ghost.label).width + 16;
    ctx.fillStyle = 'rgba(28, 32, 40, 0.82)';
    ctx.beginPath();
    ctx.roundRect(x + w / 2 - lw / 2, y - 34, lw, 24, 7);
    ctx.fill();
    ctx.fillStyle = ok ? '#ffffff' : ghost.refusal === 'taken' ? '#ff9f43' : PALETTE.hpBad;
    ctx.fillText(ghost.label, x + w / 2, y - 21);
  }

  if (scene.killer) {
    ctx.font = `800 12px ${FONT}`;
    ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = night ? NIGHT.label : PALETTE.hunted;
    ctx.fillText(`KILLER · ${scene.killer.name}`, scene.killer.x, scene.killer.y + MARK_Y - scene.killer.lift);
  }

  ctx.textBaseline = 'middle';
  for (const n of scene.numbers) {
    const t = (now - n.born) / NUMBER_MS;
    if (t < 0 || t >= 1) continue;
    const player = n.kind === 'player';
    ctx.globalAlpha = 1 - t * t;
    ctx.font = `800 ${player ? 17 : 13}px ${FONT}`;
    const label = String(Math.max(1, Math.round(n.amount)));
    const y = n.y + MARK_Y - 10 - numberHeight(n, now);
    ctx.lineWidth = 3;
    ctx.strokeStyle = 'rgba(28, 31, 38, 0.75)';
    ctx.strokeText(label, n.x, y);
    ctx.fillStyle = player ? PALETTE.gold : '#fff3dc';
    ctx.fillText(label, n.x, y);
  }
  ctx.globalAlpha = 1;
  drawLetterbox(ctx, cam, dpr);
}

function drawLetterbox(ctx: CanvasRenderingContext2D, cam: Camera, dpr: number) {
  const barW = cam.w / 2 - cam.viewHalfW * cam.scale, barH = cam.h / 2 - cam.viewHalfH * cam.scale;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.fillStyle = PALETTE.letterbox;
  if (barW >= 1) { ctx.fillRect(0, 0, barW, cam.h); ctx.fillRect(cam.w - barW, 0, barW, cam.h); }
  if (barH >= 1) { ctx.fillRect(0, 0, cam.w, barH); ctx.fillRect(0, cam.h - barH, cam.w, barH); }
}
