import { currentMood } from './mood.ts';
import { lightingStatus, lightState } from './postfx.ts';

/**
 * A small readout of what the shader pass and the lighting are doing and why, for `?dev` or `?fxinfo`: the renderer string,
 * the decision (mode and reason), the lighting tier, the governor's frame average against its limit, the pass's CPU cost,
 * the map's mood and the last few things the governor did. Drawn in screen pixels after the HUD, so it is never processed.
 */
const SHOW = typeof location !== 'undefined' && /[?&](dev|fxinfo)\b/.test(location.search);

export function drawLightingDev(ctx: CanvasRenderingContext2D, dpr: number): void {
  if (!SHOW) return;
  const st = lightingStatus();
  const lights = lightState().stats?.lights ?? 0;
  const mood = currentMood();
  const rows = [
    `GPU ${st.renderer ?? 'hidden'}`,
    `fx ${st.decision}`,
    `${st.line}${lights ? `, ${lights} lights` : ''}`,
    `frame ${st.frameMs.toFixed(1)} ms (limit ${st.limitMs.toFixed(0)}), pass cpu ${st.cpuMs.toFixed(1)} ms`,
    `mood ${mood ? `${mood.name} (dusk ${mood.dusk})` : 'none'}`,
    ...st.log.slice(-3).map((e) => `${(e.at / 1000).toFixed(0)}s ${e.what}: ${e.why}`),
  ];
  ctx.save();
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.font = '11px ui-monospace, Menlo, Consolas, monospace';
  ctx.textBaseline = 'top';
  const w = Math.max(...rows.map((r) => ctx.measureText(r).width)) + 12, h = rows.length * 14 + 8;
  ctx.fillStyle = 'rgba(20, 24, 32, 0.78)';
  ctx.fillRect(8, 8, w, h);
  ctx.fillStyle = st.on ? '#8ff0c4' : '#ffb347';
  rows.forEach((r, i) => { if (i === 2) ctx.fillStyle = st.on ? '#8ff0c4' : '#ffb347'; else ctx.fillStyle = '#e2dccb'; ctx.fillText(r, 14, 12 + i * 14); });
  ctx.restore();
}
