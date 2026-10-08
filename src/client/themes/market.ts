import { marketGeo } from './marketgeo.ts';
import { MAPS } from '../../shared/maps.ts';
import { seeded } from '../grain.ts';
import { setLight } from '../lighting.ts';
import type { FloorPlan } from '../floor.ts';
import { registerTheme, type ThemeView } from './registry.ts';
import { awningNorth, deriveOf, mix, DISTRICTS, districtAt, font, hash, hexA, OUTLINE, shade, type District } from './marketkit.ts';
import { catStack, fish, paintCart, paintLandmark, paintShopfront, paintStall, paintStack, paperLantern } from './marketwalls.ts';

type G = CanvasRenderingContext2D;
const TAU = Math.PI * 2;
const reduced = (): boolean => { try { return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches; } catch { return false; } };

/* ------------------------------------------------------------------------------------------------------ floor */

/** Wet night streets. Each district has its own pavement and wash of colour; the ground stays mid-dark and quiet so bodies pop. */
function paintMarketFloor(g: G, size: number, seed: number, plan: FloorPlan) {
  const map = MAPS.market;
  const cells = Math.ceil(size / 50);
  // 1. a soft wash of each district's floor colour (painted tiny and stretched, so the borders melt)
  const wash = document.createElement('canvas');
  wash.width = wash.height = cells;
  const w = wash.getContext('2d')!;
  for (let j = 0; j < cells; j++) for (let i = 0; i < cells; i++) { w.fillStyle = mix(districtAt(i * 50 + 25, j * 50 + 25).floor, '#58544e', 0.5); w.fillRect(i, j, 1, 1); }
  g.imageSmoothingEnabled = true;
  g.drawImage(wash, 0, 0, size, size);
  const rand = seeded(seed ^ 0x4d4b);
  // 2. paving by district
  for (let j = 0; j < cells; j++) for (let i = 0; i < cells; i++) {
    const x = i * 50, y = j * 50, d = districtAt(x + 25, y + 25);
    const k = (hash(i, j) - 0.5) * 0.08;
    g.fillStyle = k > 0 ? `rgba(255,255,255,${k.toFixed(3)})` : `rgba(0,0,0,${(-k).toFixed(3)})`;
    g.fillRect(x, y, 50, 50);
    g.fillStyle = hexA(d.seam, 0.7);
    switch (d.paving) {
      case 'flags': { // 100 px flagstones, rows offset by half a stone
        if (j % 2 === 0) g.fillRect(x, y, 50, 2);
        const off = (Math.floor(j / 2) % 2) * 50;
        if ((i * 50 + off) % 100 === 0) g.fillRect(x, y, 2, 50);
        break;
      }
      case 'tiles': g.fillRect(x, y, 50, 1.5); g.fillRect(x, y, 1.5, 50); g.fillStyle = 'rgba(210,235,255,0.05)'; if ((i + j) % 2) g.fillRect(x + 2, y + 2, 46, 46); break;
      case 'cobbles': g.fillStyle = hexA(d.seam, 0.38); for (let n = 0; n < 5; n++) { const cx = x + 6 + ((n * 17 + i * 7) % 38), cy = y + 6 + ((n * 23 + j * 11) % 38); g.beginPath(); g.ellipse(cx, cy, 7, 5, 0.3 * n, 0, TAU); g.fill(); } break;
      case 'grid': if (i % 2 === 0) g.fillRect(x, y, 1.5, 50); if (j % 2 === 0) g.fillRect(x, y, 50, 1.5); break;
      case 'rugs': g.fillStyle = hexA(d.seam, 0.45); for (let n = 0; n < 50; n += 10) g.fillRect(x + n, y, 4, 50); break;
      case 'soot': if (hash(i, j + 9) < 0.1) { g.fillStyle = 'rgba(20,14,10,0.08)'; g.beginPath(); g.ellipse(x + 25, y + 25, 24, 16, 0.4, 0, TAU); g.fill(); } break;
      default: if (hash(i + 3, j) < 0.1) { g.fillStyle = hexA(d.seam, 0.5); g.fillRect(x + 4, y + 20, 42, 1.5); }
    }
  }
  // 3. worn lanes: the avenues' centrelines are paler where boots and tyres have rubbed the wet tar
  g.lineCap = 'round';
  for (const [a, b] of [[[300, 300], [5700, 5700]], [[300, 5700], [5700, 300]]] as const) {
    for (const [lw, al] of [[260, 0.035], [120, 0.04]] as const) { g.strokeStyle = `rgba(230,220,200,${al})`; g.lineWidth = lw; g.beginPath(); g.moveTo(a[0], a[1]); g.lineTo(b[0], b[1]); g.stroke(); }
  }
  g.lineCap = 'butt';
  // 4. puddles with the district's light on them
  for (const p of deriveOf(map).puddles) {
    const r = seeded(p.seed * 977 + 5);
    const tilt = 0.2 * (r() - 0.5);
    g.fillStyle = 'rgba(16,24,36,0.15)';
    g.beginPath(); g.ellipse(p.x, p.y, p.r * 1.3, p.r * 0.7, tilt, 0, TAU); g.fill();
    // what the puddle reflects: a lantern's warm streak and a neon streak, wavering slightly
    for (const [col, dx, wd, al] of [[p.d.lantern, -0.25, 0.28, 0.5], [p.d.neon, 0.3, 0.16, 0.38]] as const) {
      const gr = g.createLinearGradient(p.x, p.y - p.r * 0.6, p.x, p.y + p.r * 0.6);
      gr.addColorStop(0, hexA(col, 0)); gr.addColorStop(0.45, hexA(col, al)); gr.addColorStop(1, hexA(col, 0));
      g.fillStyle = gr;
      g.beginPath(); g.ellipse(p.x + p.r * dx, p.y, p.r * wd, p.r * 0.62, tilt, 0, TAU); g.fill();
    }
    g.strokeStyle = 'rgba(214,232,250,0.5)'; g.lineWidth = 1.6; g.beginPath(); g.ellipse(p.x, p.y, p.r * 1.3, p.r * 0.7, tilt, 0, TAU); g.stroke();
    g.strokeStyle = 'rgba(255,255,255,0.35)'; g.lineWidth = 1.2; g.beginPath(); g.ellipse(p.x, p.y, p.r * 1.2, p.r * 0.62, tilt, Math.PI * 1.1, Math.PI * 1.55); g.stroke();
  }
  // 5. drains and manholes at the kerb of the avenues, and the district names stencilled big and quiet
  for (let n = 0; n < 40; n++) {
    const x = 150 + Math.floor(rand() * (size / 100 - 2)) * 100 + 0.5, y = 150 + Math.floor(rand() * (size / 100 - 2)) * 100 + 0.5;
    if (map.walls.some((wl) => x > wl.x - 30 && x < wl.x + wl.w + 30 && y > wl.y - 30 && y < wl.y + wl.h + 34)) continue;
    g.fillStyle = '#23262c'; g.fillRect(x - 22, y - 14, 44, 28);
    g.fillStyle = '#4a4f59'; for (let k = 0; k < 6; k++) g.fillRect(x - 18 + k * 7, y - 10, 3.4, 20);
    g.strokeStyle = OUTLINE; g.lineWidth = 2; g.strokeRect(x - 22, y - 14, 44, 28);
  }
  // 6. the crossing: a painted ring and zebra bars round the middle
  g.strokeStyle = 'rgba(240,226,200,0.2)'; g.lineWidth = 8; g.beginPath(); g.arc(3000, 3000, 330, 0, TAU); g.stroke();
  g.fillStyle = 'rgba(240,226,200,0.16)';
  for (let k = -5; k <= 5; k++) { g.fillRect(3000 + k * 40 - 12, 3330, 24, 120); g.fillRect(3000 + k * 40 - 12, 2550, 24, 120); }
  // 7. deployment pads and capture rings, simply
  for (const pad of plan.pads) {
    const tint = pad.team === 'red' ? '#b4524a' : pad.team === 'blue' ? '#4f7fbf' : '#b79a4a';
    g.fillStyle = hexA(tint, 0.16); g.fillRect(pad.x, pad.y, pad.w, pad.h);
    g.fillStyle = hexA(tint, 0.7);
    const arm = Math.min(40, pad.w / 2, pad.h / 2), t = 6;
    for (const [cx, cy, sx, sy] of [[pad.x, pad.y, 1, 1], [pad.x + pad.w, pad.y, -1, 1], [pad.x, pad.y + pad.h, 1, -1], [pad.x + pad.w, pad.y + pad.h, -1, -1]] as const) {
      g.fillRect(Math.min(cx, cx + sx * arm), Math.min(cy, cy + sy * t), arm, t); g.fillRect(Math.min(cx, cx + sx * t), Math.min(cy, cy + sy * arm), t, arm);
    }
  }
  for (const z of plan.zones) { g.fillStyle = 'rgba(14,16,22,0.16)'; g.beginPath(); g.arc(z.x, z.y, plan.zoneRadius - 6, 0, TAU); g.fill(); g.strokeStyle = 'rgba(240,226,200,0.35)'; g.lineWidth = 4; g.setLineDash([26, 20]); g.beginPath(); g.arc(z.x, z.y, plan.zoneRadius + 14, 0, TAU); g.stroke(); g.setLineDash([]); }
  // 8. the edge of the world falls into shadow
  const rim = 160;
  for (const [x0, y0, x1, y1, rx, ry, rw, rh] of [[0, 0, 0, rim, 0, 0, size, rim], [0, size, 0, size - rim, 0, size - rim, size, rim], [0, 0, rim, 0, 0, 0, rim, size], [size, 0, size - rim, 0, size - rim, 0, rim, size]] as const) {
    const gr = g.createLinearGradient(x0, y0, x1, y1);
    gr.addColorStop(0, 'rgba(10,10,14,0.5)'); gr.addColorStop(1, 'rgba(10,10,14,0)');
    g.fillStyle = gr; g.fillRect(rx, ry, rw, rh);
  }
}

/* ----------------------------------------------------------------------------------------------------- under */

const inView = (v: ThemeView, x: number, y: number, r: number) => x + r >= v.x0 && x - r <= v.x1 && y + r >= v.y0 && y - r <= v.y1;
const glow = (g: G, x: number, y: number, r: number, color: string, a: number) => {
  const gr = g.createRadialGradient(x, y, 0, x, y, r);
  gr.addColorStop(0, hexA(color, a)); gr.addColorStop(1, hexA(color, 0));
  g.fillStyle = gr; g.fillRect(x - r, y - r, r * 2, r * 2);
};

const sec = (now: number) => now / 1000;
/** A slow 0..1 pulse that never exceeds 0.4 Hz. */
const slow = (now: number, seed: number, hz = 0.25) => 0.5 + 0.5 * Math.sin(sec(now) * TAU * hz + seed * 6.28);

function steam(g: G, x: number, y: number, now: number, seed: number, tint = '255,255,255', scale = 1) {
  if (reduced()) { g.fillStyle = `rgba(${tint},0.14)`; g.beginPath(); g.arc(x, y - 14, 7 * scale, 0, TAU); g.fill(); return; }
  for (let i = 0; i < 4; i++) {
    const t = ((sec(now) * 0.32 + i / 4 + seed) % 1 + 1) % 1;
    const px = x + Math.sin(t * 5 + i * 2 + seed * 9) * 7 * scale, py = y - t * 44 * scale;
    g.fillStyle = `rgba(${tint},${(0.22 * (1 - t) * Math.min(1, t * 6)).toFixed(3)})`;
    g.beginPath(); g.arc(px, py, (4 + t * 9) * scale, 0, TAU); g.fill();
  }
}

function under(g: G, now: number, view: ThemeView, map: typeof MAPS.market) {
  const D = deriveOf(map);
  const calm = reduced();
  // puddle ripples: a ring now and then, never faster than a slow drip
  for (const p of D.puddles) {
    if (!inView(view, p.x, p.y, p.r * 1.4)) continue;
    const phase = ((sec(now) / (3.4 + hash(p.seed, 7) * 2.4) + hash(p.seed, 8)) % 1 + 1) % 1;
    if (phase > 0.55 || calm) continue;
    const k = phase / 0.55;
    g.strokeStyle = `rgba(225,238,250,${(0.3 * (1 - k)).toFixed(3)})`; g.lineWidth = 1.4;
    g.beginPath(); g.ellipse(p.x + (hash(p.seed, 9) - 0.5) * p.r, p.y + (hash(p.seed, 10) - 0.5) * p.r * 0.4, 3 + k * p.r * 0.6, (3 + k * p.r * 0.6) * 0.55, 0, 0, TAU); g.stroke();
  }
  // carts and landmarks: steam, coals, bubbles, screens
  for (const c of D.carts) {
    const { x, y, w, h } = c.w;
    if (!inView(view, x + w / 2, y + h / 2, 160) || Math.min(w, h) <= 60) continue;
    const key = `mk-cart-${x}-${y}`;
    setLight(key, { x: x + w / 2, y: y + h + 26, radius: 230, color: '#ffb066', intensity: 0.8, flicker: c.d.id === 'grill' ? 0.35 : 0.15, shadows: false });
    steam(g, x + w * 0.62, y + h * 0.45, now, c.h, c.d.id === 'grill' ? '255,214,170' : '255,255,255');
    if (c.d.id === 'grill' && c.h > 0.2) {
      // the lucky cat's paw, waving about once every two seconds
      const a = calm ? 0 : Math.sin(sec(now) * TAU * 0.5) * 0.5;
      g.save(); g.translate(x + w - 6, y + 26); g.rotate(-0.6 + a);
      g.fillStyle = '#f4efe4'; g.fillRect(-1.5, -9, 3.6, 9); g.strokeStyle = OUTLINE; g.lineWidth = 1; g.strokeRect(-1.5, -9, 3.6, 9); g.restore();
    }
  }
  for (const m of D.marks) {
    const { x, y, w, h } = m.w;
    const cx = x + w / 2, cy = y + h / 2;
    if (!inView(view, cx, cy, 220)) continue;
    const d = m.d;
    setLight(`mk-mark-${x}-${y}`, { x: cx, y: cy + h * 0.6, radius: 300, color: d.id === 'fish' ? '#9fd8ff' : d.id === 'arcade' ? '#6fb8ff' : d.light, intensity: 0.9, flicker: d.id === 'grill' ? 0.3 : d.id === 'arcade' ? 0.2 : 0.1, shadows: false });
    if (d.id === 'temple') { steam(g, x + 28, y + h - 24, now, 0.3, '210,205,195', 0.8); steam(g, x + 33, y + h - 24, now, 0.6, '210,205,195', 0.6); }
    if (d.id === 'noodle' || d.id === 'grill') steam(g, cx, y + 14, now, 0.4, d.id === 'grill' ? '70,64,60' : '255,255,255', 1.3);
    if (d.id === 'fish') { // fish drift through the tank, one slow lap each
      g.save(); g.beginPath(); g.rect(x + 12, y + 14, w - 24, h * 0.5); g.clip();
      for (let i = 0; i < 3; i++) { const t = calm ? i / 3 : (sec(now) * (0.05 + i * 0.012) + i * 0.33) % 1; const dir = i % 2 ? -1 : 1; const fx = dir > 0 ? x + 12 + t * (w - 24) : x + w - 12 - t * (w - 24); fish(g, fx, y + 34 + i * 22 + Math.sin(sec(now) * 0.9 + i) * 3, 12 + i * 2, ['#ff9a3c', '#f1e6c8', '#ffd34d'][i]!, dir); }
      g.restore();
    }
    if (d.id === 'arcade') for (let i = 0; i < 3; i++) { const on = slow(now, i * 0.37, 0.3) > 0.35; g.fillStyle = hexA([d.neon, d.neon2, '#9be36a'][i]!, on ? 0.55 : 0.3); g.fillRect(x + 16 + i * 44, y + 22, 30, 26); }
    if (d.id === 'grill') glow(g, cx, cy, 70, '#ff7a2a', 0.2 + 0.1 * slow(now, 0.2, 0.35));
    if (d.id === 'lantern') glow(g, cx, cy, 80, d.lantern, 0.18);
  }
  for (const s of D.stalls) {
    if (!['noodle', 'grill', 'lantern', 'temple'].includes(s.d.id) || !inView(view, s.w.x + s.w.w / 2, s.w.y, 100)) continue;
    for (let i = 0; i < Math.floor(s.w.w / 70); i++) steam(g, s.w.x + 40 + i * 62, s.w.y + s.w.h * 0.5, now, hash(s.w.x, i), '255,255,255', 0.8);
  }
  // air-conditioner fans turn slowly
  for (const sh of D.shops) {
    const { x, y, w, h } = sh.w;
    if (w < 150 || h < 150 || !inView(view, x + w / 2, y + h / 2, 280)) continue;
    const fx = x + w - 40 + 11, fy = y + 22 + 8, a = calm ? 0 : sec(now) * TAU * 0.9;
    g.strokeStyle = 'rgba(28,31,38,0.9)'; g.lineWidth = 1.6; g.beginPath(); for (let k = 0; k < 3; k++) { g.moveTo(fx, fy); g.lineTo(fx + Math.cos(a + k * 2.09) * 5, fy + Math.sin(a + k * 2.09) * 5); } g.stroke();
  }
  // warm pools on the wet street under every lantern string
  for (const st of D.strings) {
    const cx = (st.x0 + st.x1) / 2, cy = (st.y0 + st.y1) / 2, len = Math.hypot(st.x1 - st.x0, st.y1 - st.y0);
    if (!inView(view, cx, cy, len)) continue;
    g.save(); g.globalCompositeOperation = 'lighter';
    for (let i = 0; i < st.n; i += 2) { const t = (i + 0.5) / st.n; glow(g, st.x0 + (st.x1 - st.x0) * t, st.y0 + (st.y1 - st.y0) * t + 30, 64, i % 3 === 2 ? '#ffb347' : st.d.lantern, 0.09); }
    g.restore();
  }
  // the cat on the fish crate flicks its tail now and then
  for (const c of D.stacks) {
    if (c.d.id !== 'fish' || !catStack(c.w) || !inView(view, c.w.x, c.w.y, 120)) continue;
    const cx = c.w.x + c.w.w - 17, cy = c.w.y + c.w.h - 15;
    const t = calm ? 0 : Math.sin(sec(now) * TAU * 0.7) * 0.5;
    g.strokeStyle = '#d98a3a'; g.lineWidth = 2.6; g.lineCap = 'round'; g.beginPath(); g.moveTo(cx + 7, cy + 3); g.quadraticCurveTo(cx + 13, cy + 3 - 4 * (1 + t), cx + 12 + t * 3, cy - 7); g.stroke(); g.lineCap = 'butt';
  }
  // shop fronts: neon tubes with a single letter that stutters, and a pool on the street below
  for (const s of D.shops) {
    const { x, y, w, h } = s.w;
    if (!inView(view, x + w / 2, y + h, 220)) continue;
    if (s.h < 0.55) continue;
    const d = s.d, nx = x + w / 2, ny = y + h + 30;
    const col = s.h > 0.8 ? d.neon : d.neon2;
    setLight(`mk-shop-${x}-${y}`, { x: nx, y: ny, radius: 250, color: col, intensity: 0.8, flicker: 0.08, shadows: false });
    glow(g, nx, ny - 6, 90, col, 0.1);
  }
  // stall bulbs
  for (const s of D.stalls) {
    const { x, y, w, h } = s.w;
    if (!inView(view, x + w / 2, y, 150)) continue;
    const north = awningNorth(s.w, map.size);
    setLight(`mk-stall-${x}-${y}`, { x: x + w / 2, y: north ? y + h + 30 : y - 30, radius: 250, color: '#ffc27a', intensity: 0.95, flicker: 0.12, shadows: false });
  }
}

/* ------------------------------------------------------------------------------------------------------ over */

function awning(g: G, x: number, y: number, w: number, h: number, north: boolean, d: District) {
  // stripes run across the canvas; the scalloped valance hangs on the counter side
  const sw = 16;
  g.save();
  g.beginPath(); g.rect(x, y, w, h); g.clip();
  for (let i = 0, sx = x; sx < x + w; i++, sx += sw) { g.fillStyle = hexA(d.awn[i % 2]!, 0.5); g.fillRect(sx, y, sw, h); }
  g.fillStyle = 'rgba(255,255,255,0.1)'; g.fillRect(x, north ? y : y + h - 6, w, 6);
  g.fillStyle = 'rgba(10,12,16,0.12)'; g.fillRect(x, north ? y + h * 0.5 : y, w, h * 0.5);
  g.restore();
  const hy = north ? y + h : y;
  for (let i = 0, sx = x; sx < x + w - 1; i++, sx += sw) {
    g.fillStyle = hexA(d.awn[i % 2]!, 0.72);
    g.beginPath(); g.moveTo(sx, hy); g.lineTo(sx + sw, hy);
    g.lineTo(sx + sw, hy + (north ? 6 : -6)); g.arc(sx + sw / 2, hy + (north ? 6 : -6), sw / 2, 0, north ? Math.PI : -Math.PI, !north); g.closePath(); g.fill();
  }
  g.strokeStyle = 'rgba(28,31,38,0.8)'; g.lineWidth = 2; g.strokeRect(x, y, w, h);
  // a string of bulbs hangs under the hem
  const by = north ? y + h + 9 : y - 9, nb = Math.max(3, Math.floor(w / 34));
  g.strokeStyle = 'rgba(20,18,16,0.7)'; g.lineWidth = 1; g.beginPath(); g.moveTo(x + 4, by - 3); g.quadraticCurveTo(x + w / 2, by + (north ? 6 : -6), x + w - 4, by - 3); g.stroke();
  for (let i = 0; i < nb; i++) {
    const t = (i + 0.5) / nb, bx = x + 4 + (w - 8) * t, bb = by - 3 + Math.sin(t * Math.PI) * (north ? 5 : -5);
    glow(g, bx, bb, 34, '#ffc66a', 0.5); g.fillStyle = '#fff2c0'; g.beginPath(); g.arc(bx, bb, 2.6, 0, TAU); g.fill();
  }
}

function drawString(g: G, a: { x0: number; y0: number; x1: number; y1: number; d: District; n: number; seed: number }, now: number, withPlate: string | null) {
  const len = Math.hypot(a.x1 - a.x0, a.y1 - a.y0), sag = Math.min(34, 10 + len * 0.08), calm = reduced();
  g.strokeStyle = 'rgba(20,18,16,0.9)'; g.lineWidth = 1.8; g.beginPath();
  for (let i = 0; i <= 14; i++) { const t = i / 14, x = a.x0 + (a.x1 - a.x0) * t, y = a.y0 + (a.y1 - a.y0) * t + Math.sin(t * Math.PI) * sag; if (i) g.lineTo(x, y); else g.moveTo(x, y); }
  g.stroke();
  for (let i = 0; i < a.n; i++) {
    const t = (i + 0.5) / a.n, x = a.x0 + (a.x1 - a.x0) * t, y = a.y0 + (a.y1 - a.y0) * t + Math.sin(t * Math.PI) * sag;
    const swing = calm ? 0 : Math.sin(sec(now) * TAU * 0.2 + a.seed * 9 + i * 0.9) * 0.13;
    const col = (i + Math.floor(a.seed * 7)) % 3 === 2 ? '#ffb347' : a.d.lantern;
    g.save(); g.translate(x, y); g.rotate(swing);
    glow(g, 0, 14, 46, col, 0.24);
    paperLantern(g, 0, 14, 9, col);
    g.restore();
  }
  if (withPlate) {
    const t = 0.5, x = a.x0 + (a.x1 - a.x0) * t, y = a.y0 + (a.y1 - a.y0) * t + sag;
    g.font = font(15);
    const w = g.measureText(withPlate).width + 20;
    g.strokeStyle = 'rgba(20,18,16,0.8)'; g.lineWidth = 1.2; g.beginPath(); g.moveTo(x - w / 2 + 6, y); g.lineTo(x - w / 2 + 6, y + 12); g.moveTo(x + w / 2 - 6, y); g.lineTo(x + w / 2 - 6, y + 12); g.stroke();
    g.fillStyle = 'rgba(24,26,34,0.88)'; g.fillRect(x - w / 2, y + 12, w, 22);
    g.strokeStyle = 'rgba(28,31,38,1)'; g.lineWidth = 2; g.strokeRect(x - w / 2, y + 12, w, 22);
    g.strokeStyle = hexA(a.d.neon, 0.9); g.lineWidth = 1.2; g.strokeRect(x - w / 2 + 3, y + 15, w - 6, 16);
    // one letter has a tired tube: it stutters now and then
    const letters = [...withPlate];
    const bad = Math.floor(hash(a.seed * 99) * letters.length);
    const off = !reduced() && ((now / 1000 + a.seed * 7) % 9) < 0.18;
    g.textAlign = 'left'; g.textBaseline = 'middle';
    let cx = x - w / 2 + 10;
    for (const [i, ch] of letters.entries()) { g.fillStyle = i === bad && off ? hexA(a.d.neon, 0.25) : a.d.neon2; g.fillText(ch, cx, y + 23.5); cx += g.measureText(ch).width; }
    glow(g, x, y + 23, w * 0.7, a.d.neon, 0.1);
  }
}


/** Each district's big landmark, rising up-screen from its block so it can be seen from a long way off. Drawn over the players but thin and open where bodies pass. */
function landmarkOver(g: G, now: number, x: number, y: number, w: number, h: number, d: District) {
  const cx = x + w / 2, top = y, calm = reduced();
  const flick = calm ? 1 : 0.9 + 0.1 * slow(now, d.x * 0.001, 0.3);
  const ink = (lw = 2.4) => { g.strokeStyle = OUTLINE; g.lineWidth = lw; g.lineJoin = 'round'; };
  switch (d.id) {
    case 'temple': { // torii gate over the shrine
      const sp = 96, base = y + h + 20, tp = top - 170;
      for (const sx of [-sp, sp]) { g.fillStyle = '#c0392b'; g.fillRect(cx + sx - 9, tp, 18, base - tp); ink(); g.strokeRect(cx + sx - 9, tp, 18, base - tp); g.fillStyle = '#1c1f26'; g.fillRect(cx + sx - 11, base - 12, 22, 12); }
      g.fillStyle = '#c0392b'; g.fillRect(cx - sp - 8, tp + 40, sp * 2 + 16, 14); ink(); g.strokeRect(cx - sp - 8, tp + 40, sp * 2 + 16, 14);
      g.fillStyle = '#1c1f26'; g.beginPath(); g.moveTo(cx - sp - 40, tp + 6); g.quadraticCurveTo(cx, tp - 14, cx + sp + 40, tp + 6); g.lineTo(cx + sp + 30, tp + 26); g.quadraticCurveTo(cx, tp + 8, cx - sp - 30, tp + 26); g.closePath(); g.fill();
      g.fillStyle = '#c0392b'; g.fillRect(cx - 18, tp + 28, 36, 26); ink(1.6); g.strokeRect(cx - 18, tp + 28, 36, 26);
      g.font = font(16); g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = '#f4d58a'; g.fillText('TEMPLE', cx, tp + 41);
      paperLantern(g, cx - 50, tp + 76, 12, '#d9482f'); paperLantern(g, cx + 50, tp + 76, 12, '#d9482f');
      break;
    }
    case 'lantern': { // a giant lantern on a hook
      const sw = calm ? 0 : Math.sin(sec(now) * TAU * 0.2) * 0.06, ly = top - 80;
      g.strokeStyle = '#201a16'; g.lineWidth = 3; g.beginPath(); g.moveTo(cx, top - 220); g.lineTo(cx, ly - 60); g.stroke();
      g.save(); g.translate(cx, ly - 60); g.rotate(sw); g.translate(0, 60);
      glow(g, 0, 0, 150, '#ff6a3a', 0.28 * flick); paperLantern(g, 0, 0, 58, '#e5412d');
      g.font = font(34); g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = 'rgba(250,224,140,0.9)'; g.fillText('FEST', 0, -2); g.restore();
      break;
    }
    case 'fish': { // neon fish on a pole
      const fy = top - 110;
      g.strokeStyle = '#2a3036'; g.lineWidth = 5; g.beginPath(); g.moveTo(cx - 40, y + h); g.lineTo(cx - 40, fy + 30); g.moveTo(cx + 40, y + h); g.lineTo(cx + 40, fy + 30); g.stroke();
      g.fillStyle = 'rgba(14,26,34,0.85)'; g.beginPath(); g.ellipse(cx, fy, 82, 36, 0, 0, TAU); g.fill(); g.beginPath(); g.moveTo(cx + 78, fy); g.lineTo(cx + 124, fy - 34); g.lineTo(cx + 124, fy + 34); g.closePath(); g.fill();
      g.strokeStyle = hexA('#6fd8ff', 0.95 * flick); g.lineWidth = 5; g.beginPath(); g.ellipse(cx, fy, 82, 36, 0, 0, TAU); g.moveTo(cx + 78, fy); g.lineTo(cx + 124, fy - 34); g.lineTo(cx + 124, fy + 34); g.closePath(); g.stroke();
      g.strokeStyle = hexA('#e9fbff', 0.9); g.lineWidth = 3; g.beginPath(); g.moveTo(cx - 20, fy - 22); g.quadraticCurveTo(cx - 6, fy, cx - 20, fy + 22); g.stroke();
      g.fillStyle = '#e9fbff'; g.beginPath(); g.arc(cx - 56, fy - 8, 5, 0, TAU); g.fill();
      glow(g, cx, fy, 150, '#6fd8ff', 0.2 * flick);
      break;
    }
    case 'produce': { // a market parasol, striped, over the fruit
      const py = top - 30;
      for (let i = 0; i < 10; i++) { g.fillStyle = hexA(d.awn[i % 2]!, 0.62); g.beginPath(); g.moveTo(cx, py); g.arc(cx, py, 118, (i * TAU) / 10, ((i + 1) * TAU) / 10); g.closePath(); g.fill(); }
      g.strokeStyle = 'rgba(28,31,38,0.9)'; g.lineWidth = 2.4; g.beginPath(); g.arc(cx, py, 118, 0, TAU); g.stroke(); g.fillStyle = '#1c1f26'; g.beginPath(); g.arc(cx, py, 5, 0, TAU); g.fill();
      break;
    }
    case 'arcade': { // a big neon sign with a joystick
      const sy = top - 130;
      g.strokeStyle = '#232830'; g.lineWidth = 5; g.beginPath(); g.moveTo(cx - 80, y + 20); g.lineTo(cx - 80, sy + 24); g.moveTo(cx + 80, y + 20); g.lineTo(cx + 80, sy + 24); g.stroke();
      g.fillStyle = 'rgba(12,18,30,0.9)'; g.fillRect(cx - 118, sy - 26, 236, 52); ink(); g.strokeRect(cx - 118, sy - 26, 236, 52);
      g.strokeStyle = hexA('#3fe0e0', 0.95 * flick); g.lineWidth = 3; g.strokeRect(cx - 112, sy - 20, 224, 40);
      g.font = font(34); g.textAlign = 'left'; g.textBaseline = 'middle';
      const word = 'ARCADE', off = !calm && ((sec(now) + 3) % 11) < 0.16; let lx = cx - 104;
      for (const [i, ch] of [...word].entries()) { g.fillStyle = i === 2 && off ? hexA('#ff4fd0', 0.2) : '#ff4fd0'; g.fillText(ch, lx, sy + 1); lx += g.measureText(ch).width + 1; }
      g.strokeStyle = '#3fe0e0'; g.lineWidth = 3; g.beginPath(); g.moveTo(cx + 78, sy + 12); g.lineTo(cx + 78, sy - 4); g.stroke(); g.fillStyle = '#ffd34d'; g.beginPath(); g.arc(cx + 78, sy - 8, 6, 0, TAU); g.fill();
      glow(g, cx, sy, 190, '#3fe0e0', 0.14 * flick);
      break;
    }
    case 'noodle': { // a bowl of noodles with chopsticks, steaming
      const by = top - 100;
      glow(g, cx, by, 130, '#ffe08a', 0.2);
      g.fillStyle = '#efe4c4'; g.beginPath(); g.ellipse(cx, by, 66, 42, 0, 0, TAU); g.fill(); ink(); g.stroke();
      g.fillStyle = '#e8a93a'; g.beginPath(); g.ellipse(cx, by - 4, 50, 28, 0, 0, TAU); g.fill();
      g.strokeStyle = '#f4ecd0'; g.lineWidth = 3.4; for (let i = 0; i < 5; i++) { g.beginPath(); g.moveTo(cx - 36, by - 18 + i * 9); g.quadraticCurveTo(cx, by - 28 + i * 9, cx + 36, by - 18 + i * 9); g.stroke(); }
      g.strokeStyle = '#7a5a3a'; g.lineWidth = 4; g.beginPath(); g.moveTo(cx + 18, by - 24); g.lineTo(cx + 66, by - 78); g.moveTo(cx + 30, by - 26); g.lineTo(cx + 76, by - 68); g.stroke();
      steam(g, cx - 10, by - 28, now, 0.1, '255,255,255', 1.6);
      break;
    }
    case 'grill': { // chimney and a rising plume, with a skewer sign
      g.fillStyle = '#4a4f58'; g.fillRect(cx + 34, top - 190, 30, 190); ink(); g.strokeRect(cx + 34, top - 190, 30, 190); g.fillStyle = '#2a2d34'; g.fillRect(cx + 30, top - 200, 38, 14); g.strokeRect(cx + 30, top - 200, 38, 14);
      for (let i = 0; i < 5; i++) { const t = ((sec(now) * 0.22 + i / 5) % 1 + 1) % 1; g.fillStyle = `rgba(60,56,54,${(0.34 * (1 - t)).toFixed(3)})`; g.beginPath(); g.arc(cx + 49 + Math.sin(t * 4 + i) * 12, top - 205 - t * 120, 12 + t * 22, 0, TAU); g.fill(); }
      g.strokeStyle = '#7a5a3a'; g.lineWidth = 4; g.beginPath(); g.moveTo(cx - 70, top - 40); g.lineTo(cx - 10, top - 150); g.stroke();
      for (const [dx, col] of [[-62, '#9a4a2a'], [-48, '#b8683a'], [-34, '#d98a4a']] as const) { g.fillStyle = col; g.beginPath(); g.arc(cx + dx, top - 58 + (dx + 62) * -1.9, 9, 0, TAU); g.fill(); ink(1.6); g.stroke(); }
      glow(g, cx, top + 20, 150, '#ff7a2a', 0.16 * flick);
      break;
    }
    case 'spice': { // three hanging brass lamps
      for (const [dx, dy] of [[-64, -96], [0, -150], [64, -96]] as const) {
        const sw = calm ? 0 : Math.sin(sec(now) * TAU * 0.18 + dx) * 0.05;
        g.strokeStyle = '#201a16'; g.lineWidth = 2.4; g.beginPath(); g.moveTo(cx + dx, top - 230); g.lineTo(cx + dx, top + dy - 22); g.stroke();
        g.save(); g.translate(cx + dx, top + dy - 22); g.rotate(sw); g.translate(0, 22);
        glow(g, 0, 0, 80, '#ffc24a', 0.3 * flick);
        g.fillStyle = '#c9a24a'; g.beginPath(); g.moveTo(-16, -14); g.lineTo(16, -14); g.lineTo(22, 12); g.lineTo(-22, 12); g.closePath(); g.fill(); ink(1.8); g.stroke();
        g.fillStyle = '#ffd98a'; g.fillRect(-9, -6, 18, 12); g.restore();
      }
      break;
    }
    default: break;
  }
}

function over(g: G, now: number, view: ThemeView, map: typeof MAPS.market) {
  const D = deriveOf(map);
  for (const s of D.stalls) {
    const { x, y, w, h } = s.w;
    const north = awningNorth(s.w, map.size);
    const ay = north ? y - 100 : y + h + 14;
    if (!inView(view, x + w / 2, ay + 50, Math.max(w, 120))) continue;
    awning(g, x, ay, w, 100 - (north ? 0 : 14), north, s.d);
  }
  for (const m of D.marks) if (inView(view, m.w.x + m.w.w / 2, m.w.y - 60, 300)) landmarkOver(g, now, m.w.x, m.w.y, m.w.w, m.w.h, m.d);
  // each district's name hangs from the string nearest its landmark
  const plated = new Map<StringKey, string>();
  type StringKey = (typeof D.strings)[number];
  for (const d of DISTRICTS) {
    let best: StringKey | null = null, bd = Infinity;
    for (const st of D.strings) { const dd = Math.hypot((st.x0 + st.x1) / 2 - d.x, (st.y0 + st.y1) / 2 - d.y); if (dd < bd && st.d.id === d.id && Math.abs(st.y1 - st.y0) < 10) { bd = dd; best = st; } }
    if (best) plated.set(best, d.name);
  }
  for (const st of D.strings) {
    const cx = (st.x0 + st.x1) / 2, cy = (st.y0 + st.y1) / 2;
    if (!inView(view, cx, cy, 440)) continue;
    drawString(g, st, now, plated.get(st) ?? null);
    const key = `mk-lan-${Math.round(st.x0)}-${Math.round(st.y0)}`;
    setLight(key, { x: cx, y: cy + 30, radius: Math.max(260, Math.hypot(st.x1 - st.x0, st.y1 - st.y0) * 0.8), color: st.d.lantern, intensity: 0.85, flicker: 0.1, shadows: false });
  }
  // a balloon a child let go of, caught on a lantern wire in Lantern Alley
  const lanternStrings = D.strings.filter((s) => s.d.id === 'lantern' && Math.abs(s.y1 - s.y0) < 10);
  const caught = lanternStrings[Math.floor(hash(7) * lanternStrings.length)];
  if (caught && inView(view, caught.x0, caught.y0, 160)) {
    const bob = reduced() ? 0 : Math.sin(sec(now) * TAU * 0.2) * 3;
    const x = caught.x0 + (caught.x1 - caught.x0) * 0.22, y = caught.y0 + Math.sin(0.22 * Math.PI) * 18;
    g.strokeStyle = 'rgba(240,240,240,0.7)'; g.lineWidth = 1; g.beginPath(); g.moveTo(x, y); g.quadraticCurveTo(x - 6, y - 18, x - 4 + bob * 0.4, y - 34 + bob); g.stroke();
    g.fillStyle = '#e5484d'; g.beginPath(); g.ellipse(x - 4 + bob * 0.4, y - 46 + bob, 9, 11, 0, 0, TAU); g.fill();
    g.strokeStyle = OUTLINE; g.lineWidth = 1.5; g.stroke();
    g.fillStyle = 'rgba(255,255,255,0.5)'; g.beginPath(); g.ellipse(x - 7 + bob * 0.4, y - 50 + bob, 2.2, 3.4, -0.5, 0, TAU); g.fill();
  }
  // the neon crossing: an arch of tube over the middle, thin so it never hides a body
  if (inView(view, 3000, 3000, 520)) {
    const flick = reduced() ? 1 : 0.88 + 0.12 * slow(now, 0.3, 0.33);
    for (const [r, col, lw] of [[460, '#ff4fd0', 7], [440, '#3fe0d0', 3]] as const) {
      g.strokeStyle = hexA(col, 0.55 * flick); g.lineWidth = lw; g.beginPath(); g.arc(3000, 3000 + 40, r, Math.PI * 1.08, Math.PI * 1.92); g.stroke();
    }
    g.font = font(54); g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillStyle = hexA('#3fe0d0', 0.6 * flick); g.fillText('NEON CROSSING', 3000, 3000 - 492);
    glow(g, 3000, 3000 - 492, 260, '#ff4fd0', 0.1 * flick);
    setLight('mk-gate-a', { x: 3000, y: 3000 - 300, radius: 520, color: '#ff4fd0', intensity: 0.95, flicker: 0.06, shadows: false });
    setLight('mk-gate-b', { x: 3000, y: 3000 + 260, radius: 500, color: '#3fe0d0', intensity: 0.85, flicker: 0.06, shadows: false });
  }
}

registerTheme('market', {
  ...marketGeo,
  dusk: 0.2,
  floor: paintMarketFloor,
  walls: { shopfront: paintShopfront, stall: paintStall, stack: paintStack, cart: paintCart, shrine: paintLandmark },
  under: (g, now, view, map) => under(g, now, view, map as typeof MAPS.market),
  over: (g, now, view, map) => over(g, now, view, map as typeof MAPS.market),
});

void shade;
