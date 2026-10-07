import { blotch, seeded } from '../grain.ts';
import { SUMMIT_DOORS } from '../../shared/maps/summitgeo.ts';
import { C, TAU, ell, hexA, rr, shade, type G } from './summitkit.ts';
import { RUGS, bed, both, contact, flags, label, planks, rug, stain, tiles, type Variant } from './summitdraw.ts';

/**
 * Every floor under a roof: the lodge from its guest rooms to its great hall, the alpine spa that is the lodge turned
 * half a turn, the hunter's cabin and the sawmill that is its twin. Drawn in west-half coordinates; `both` turns the same
 * code into the east half, and each variant picks its own materials: boards and wool for the lodge, slate, bamboo and
 * tatami for the spa. Doors get a worn sill at the end, so every threshold looks lived in.
 */

const BLANKETS = ['#8a2e3c', '#2c4a6b', '#3d6b52', '#8a6a2e', '#5a3a6a'];

/* -- the lodge and the spa --------------------------------------------------------------------------------------------- */

function hall(g: G, v: Variant) {
  const x = 1050, y = 2600, w = 900, h = 850;
  if (v === 0) {
    planks(g, x, y, w, h, { board: 26, seed: 11 });
    // The rug in the middle of the room, where the zone is, and a bearskin by the fire.
    rug(g, 1180, 2810, 590, 430, RUGS.lodge!);
    g.fillStyle = '#4a3a2e'; ell(g, 1262, 3030, 40, 56); g.fill(); g.strokeStyle = C.ink; g.lineWidth = 2; g.stroke();
    g.fillStyle = '#5a4838'; ell(g, 1262, 2988, 17, 14); g.fill(); g.stroke();
    // Hearth stones.
    flags(g, 1050, 2870, 210, 310, '#6a645a', 21);
    g.strokeStyle = C.ink; g.lineWidth = 2; g.strokeRect(1050, 2870, 210, 310);
    // Wet boot prints from the door to the fire, drying.
    g.fillStyle = 'rgba(20, 12, 6, 0.22)';
    for (let i = 0; i < 14; i++) { const px = 1930 - i * 50, py = 3020 + Math.sin(i * 0.9) * 20 + (i % 2 ? 9 : -9); ell(g, px, py, 7, 3.4, 0.1); g.fill(); }
    label(g, v, 'WELCOME TO THE SUMMIT', 1475, 3290, 20, 'rgba(232, 220, 190, 0.55)', { spacing: 5 });
  } else {
    tiles(g, x, y, w, h, 100, '#3d4a54', '#38444e', 'rgba(14, 22, 28, 0.7)', 12, 0.06);
    // Underfloor heating: warm bands under the slate.
    g.fillStyle = 'rgba(255, 150, 90, 0.08)';
    for (let i = 0; i < 8; i++) g.fillRect(x + 30, y + 60 + i * 100, w - 60, 20);
    // A sun medallion in brass over the zone.
    g.save(); g.translate(1475, 3025);
    g.fillStyle = 'rgba(14, 22, 28, 0.35)'; ell(g, 0, 0, 250, 250); g.fill();
    g.strokeStyle = hexA(C.brass, 0.75); g.lineWidth = 5; g.beginPath(); g.arc(0, 0, 240, 0, TAU); g.stroke(); g.lineWidth = 3; g.beginPath(); g.arc(0, 0, 200, 0, TAU); g.stroke();
    g.fillStyle = hexA(C.brass, 0.6);
    for (let k = 0; k < 16; k++) { const a = (k / 16) * TAU; g.beginPath(); g.moveTo(Math.cos(a - 0.1) * 120, Math.sin(a - 0.1) * 120); g.lineTo(Math.cos(a) * (k % 2 ? 190 : 230), Math.sin(a) * (k % 2 ? 190 : 230)); g.lineTo(Math.cos(a + 0.1) * 120, Math.sin(a + 0.1) * 120); g.closePath(); g.fill(); }
    g.restore();
    flags(g, 1050, 2870, 210, 310, '#4a4a4c', 22);
    g.strokeStyle = C.ink; g.lineWidth = 2; g.strokeRect(1050, 2870, 210, 310);
    label(g, v, 'RELAX', 1475, 2650, 22, 'rgba(168, 240, 224, 0.5)', { spacing: 8 });
  }
}

function bar(g: G, v: Variant) {
  const x = 1050, y = 2150, w = 900, h = 400;
  if (v === 0) {
    planks(g, x, y, w, h, { base: '#5a3e24', hi: '#6e4a2c', lo: '#46301c', board: 24, seed: 31 });
    // Behind the counter: black and white chequer, and a brass foot rail in front of it.
    tiles(g, x, y, w, 150, 50, '#d8d0bc', '#262a30', 'rgba(10, 10, 12, 0.6)', 32, 0.04);
    g.fillStyle = 'rgba(10, 8, 6, 0.28)'; g.fillRect(x, y + 150, w, 8);
    g.strokeStyle = C.brassHi; g.lineWidth = 4; g.beginPath(); g.moveTo(1200, 2392); g.lineTo(1800, 2392); g.stroke();
    g.strokeStyle = 'rgba(10, 8, 6, 0.5)'; g.lineWidth = 2; g.beginPath(); g.moveTo(1200, 2398); g.lineTo(1800, 2398); g.stroke();
    // Sawdust and spilled beer.
    const rand = seeded(33);
    for (let i = 0; i < 26; i++) blotch(g, x + 40 + rand() * (w - 80), y + 180 + rand() * 200, 18 + rand() * 40, '210, 180, 120', 0.12);
    stain(g, 1620, 2470, 40, '20, 12, 6', 0.18, 34);
    // A dart board on the floor chalk: the throw line.
    g.fillStyle = 'rgba(230, 224, 200, 0.5)'; g.fillRect(1740, 2500, 80, 3);
    label(g, v, 'THE FROSTBITE', 1500, 2210, 22, 'rgba(60, 40, 20, 0.5)', { spacing: 6 });
  } else {
    planks(g, x, y, w, h, { base: '#b09a68', hi: '#c4ae7c', lo: '#9a8656', board: 20, seed: 35, vertical: true });
    tiles(g, x, y, w, 150, 50, '#4f7a62', '#44705a', 'rgba(14, 40, 30, 0.6)', 36, 0.04);
    g.strokeStyle = C.brassHi; g.lineWidth = 4; g.beginPath(); g.moveTo(1200, 2392); g.lineTo(1800, 2392); g.stroke();
    label(g, v, 'TEA & JUICE', 1500, 2210, 22, 'rgba(232, 244, 224, 0.55)', { spacing: 6 });
  }
}

function shop(g: G, v: Variant) {
  const x = 1050, y = 3500, w = 900, h = 350;
  if (v === 0) {
    // Black rubber matting with a yellow safety border, a boot-wash drain by the shutter.
    tiles(g, x, y, w, h, 50, '#33373e', '#2e3238', 'rgba(8, 10, 12, 0.7)', 41, 0.05);
    g.strokeStyle = hexA(C.yellow, 0.7); g.lineWidth = 5; g.strokeRect(x + 14, y + 14, w - 28, h - 28);
    g.fillStyle = 'rgba(200, 210, 224, 0.1)';
    for (let i = 0; i < 6; i++) g.fillRect(1200 + i * 24, 3720, 12, 90);
    g.fillStyle = '#1a1d22'; rr(g, 1190, 3780, 170, 56, 8); g.fill(); g.strokeStyle = C.ink; g.lineWidth = 2; g.stroke();
    g.fillStyle = hexA(C.yellow, 0.7); g.fillRect(1196, 3786, 158, 3);
    label(g, v, 'RENTALS', 1480, 3560, 24, hexA(C.yellow, 0.5), { spacing: 8 });
    label(g, v, 'PULL SHUTTER UP', 1275, 3710, 13, 'rgba(232, 220, 190, 0.5)', { spacing: 3 });
    // Sizing marks.
    g.fillStyle = 'rgba(230, 224, 200, 0.4)'; for (let i = 0; i < 9; i++) g.fillRect(1680 + i * 22, 3640, 2, 10 + (i % 3) * 4);
  } else {
    tiles(g, x, y, w, h, 50, '#cbd4d6', '#c1ccd0', 'rgba(60, 76, 84, 0.5)', 42, 0.04);
    g.fillStyle = 'rgba(40, 60, 70, 0.4)'; for (const dx of [1200, 1600, 1800]) { ell(g, dx, 3700, 14, 14); g.fill(); }
    label(g, v, 'TREATMENTS', 1480, 3560, 22, 'rgba(40, 70, 80, 0.45)', { spacing: 6 });
  }
}

function wing(g: G, v: Variant) {
  // Corridor.
  const cx = 600, cw = 100;
  if (v === 0) {
    planks(g, 250, 2100, 800, 1800, { base: '#6a4a2c', hi: '#7e5836', lo: '#563a22', board: 24, seed: 51 });
    g.fillStyle = '#5a2430'; g.fillRect(cx + 8, 2100, cw - 16, 1800);
    g.strokeStyle = hexA(C.brassHi, 0.8); g.lineWidth = 3; g.strokeRect(cx + 12, 2100, cw - 24, 1800);
    g.fillStyle = hexA(C.brassHi, 0.5);
    for (let yy = 2130; yy < 3880; yy += 36) { g.beginPath(); g.moveTo(cx + 50, yy); g.lineTo(cx + 62, yy + 12); g.lineTo(cx + 50, yy + 24); g.lineTo(cx + 38, yy + 12); g.closePath(); g.fill(); }
  } else {
    planks(g, 250, 2100, 800, 1800, { base: '#a89066', hi: '#bca47a', lo: '#947c52', board: 16, seed: 52, vertical: true });
    g.fillStyle = '#6a5a3c'; g.fillRect(cx + 10, 2100, cw - 20, 1800);
    g.strokeStyle = 'rgba(40, 30, 16, 0.55)'; g.lineWidth = 2; for (let i = 1; i < 6; i++) { g.beginPath(); g.moveTo(cx + 10 + i * ((cw - 20) / 6), 2100); g.lineTo(cx + 10 + i * ((cw - 20) / 6), 3900); g.stroke(); }
  }
  // Guest rooms, west side.
  const rooms = [2150, 2500, 2850, 3200, 3550];
  rooms.forEach((ry, i) => {
    const rx = 300, rw = 250, rh = 300;
    if (v === 0) {
      planks(g, rx, ry, rw, rh, { base: '#7a5632', hi: '#8c6640', lo: '#664626', board: 22, seed: 60 + i });
      rug(g, rx + 120, ry + 150, 110, 120, RUGS[['navy', 'forest', 'rust', 'lodge', 'navy'][i]!]!);
      bed(g, rx + 12, ry + 14, 90, 150, BLANKETS[i % BLANKETS.length]!);
      g.fillStyle = C.logLo; g.fillRect(rx + 108, ry + 16, 34, 30); g.strokeStyle = C.ink; g.lineWidth = 2; g.strokeRect(rx + 108, ry + 16, 34, 30);
      g.fillStyle = hexA(C.window, 0.6); ell(g, rx + 125, ry + 31, 8, 8); g.fill();
    } else {
      g.fillStyle = '#b8a47a'; g.fillRect(rx, ry, rw, rh);
      g.strokeStyle = 'rgba(70, 56, 30, 0.6)'; g.lineWidth = 2;
      for (let tx = rx; tx < rx + rw; tx += 62) for (let ty = ry; ty < ry + rh; ty += 124) { g.strokeRect(tx + 1, ty + 1, 60, 122); }
      g.fillStyle = 'rgba(60, 90, 70, 0.4)'; for (let tx = rx; tx < rx + rw; tx += 62) for (let ty = ry; ty < ry + rh; ty += 124) { g.fillRect(tx + 2, ty + 2, 58, 6); }
      bed(g, rx + 20, ry + 30, 110, 150, ['#6a8a78', '#7a6a8a', '#8a7a5a', '#5a7a8a', '#8a5a5a'][i]!, true);
    }
  });
  // East rooms: two bunk rooms, a coat passage north, a ski-locker passage south.
  const ex = 750, ew = 250;
  if (v === 0) {
    tiles(g, ex, 2150, ew, 400, 50, '#6a6258', '#625a50', 'rgba(20, 16, 12, 0.6)', 71, 0.04);
    planks(g, ex, 3500, ew, 350, { base: '#7a5a38', hi: '#8c6a44', lo: '#664828', board: 18, seed: 72, vertical: true });
    for (const ry of [2600, 3050]) {
      planks(g, ex, ry, ew, 400, { base: '#6e4c2c', hi: '#805a36', lo: '#5a3c22', board: 22, seed: ry });
      bed(g, ex + 14, ry + 20, 80, 160, BLANKETS[(ry / 50) % BLANKETS.length]!); bed(g, ex + 14, ry + 200, 80, 160, BLANKETS[(ry / 25) % BLANKETS.length]!);
      rug(g, ex + 120, ry + 160, 100, 90, RUGS.forest!);
    }
    // Boot trays under the coat hooks.
    g.fillStyle = 'rgba(14, 14, 18, 0.5)'; for (let i = 0; i < 4; i++) g.fillRect(ex + 12 + i * 58, 2480, 48, 56);
    g.strokeStyle = 'rgba(200, 210, 224, 0.2)'; g.lineWidth = 2; for (let i = 0; i < 4; i++) g.strokeRect(ex + 12 + i * 58, 2480, 48, 56);
  } else {
    tiles(g, ex, 2150, ew, 400, 50, '#a4b0b0', '#9aa8a8', 'rgba(40, 56, 60, 0.5)', 73, 0.04);
    tiles(g, ex, 3500, ew, 350, 50, '#d2d8d4', '#c8d0cc', 'rgba(50, 66, 70, 0.5)', 74, 0.04);
    for (const ry of [2600, 3050]) { flags(g, ex, ry, ew, 400, '#5a5e60', ry + 3); g.fillStyle = 'rgba(255, 120, 70, 0.1)'; g.fillRect(ex, ry, ew, 400); ell(g, ex + 125, ry + 200, 70, 70); g.fillStyle = 'rgba(70, 150, 170, 0.5)'; g.fill(); g.strokeStyle = C.ink; g.lineWidth = 2; g.stroke(); }
  }
}

/** The lodge or the spa: boards, a door sill at every threshold. */
function lodge(g: G, v: Variant) {
  g.fillStyle = v ? '#4a4a48' : '#5a3e24'; g.fillRect(250, 2100, 1800, 1800);
  wing(g, v); bar(g, v); hall(g, v); shop(g, v);
  // The terrace under the great doors: boards swept clear.
  if (v === 0) planks(g, 2000, 2900, 250, 250, { base: '#6e4c2c', hi: '#805a36', lo: '#5a3c22', board: 24, seed: 91, vertical: true });
  else flags(g, 2000, 2900, 250, 250, '#5a5e60', 92);
  g.strokeStyle = 'rgba(10, 8, 6, 0.4)'; g.lineWidth = 3; g.strokeRect(2000, 2900, 250, 250);
}

/* -- the cabin and the sawmill ------------------------------------------------------------------------------------------ */

function cabin(g: G, v: Variant) {
  const x = 450, y = 650, w = 350, h = 250;
  if (v === 0) {
    planks(g, x, y, w, h, { base: '#6a4a2c', hi: '#7e5836', lo: '#563a22', board: 20, seed: 81, vertical: true });
    // A braided rug, oval, in rings of old shirts.
    g.save(); g.translate(630, 790);
    for (const [rx, ry, col] of [[84, 54, '#6a2a32'], [68, 42, '#d8c9a0'], [52, 30, '#3d6b52'], [34, 18, '#8a6a2e']] as const) { g.fillStyle = col; ell(g, 0, 0, rx, ry); g.fill(); }
    g.strokeStyle = 'rgba(10, 8, 6, 0.5)'; g.lineWidth = 2; ell(g, 0, 0, 84, 54); g.stroke();
    g.restore();
    // Stove hearth plate.
    g.fillStyle = '#4a4640'; g.fillRect(740, 655, 60, 70); g.strokeStyle = C.ink; g.lineWidth = 2; g.strokeRect(740, 655, 60, 70);
    // Snow tracked in at the door.
    blotch(g, 600, 880, 60, '210, 225, 245', 0.18); blotch(g, 700, 668, 50, '210, 225, 245', 0.16);
  } else {
    g.fillStyle = '#7a6a4a'; g.fillRect(x, y, w, h);
    const rand = seeded(82);
    for (let i = 0; i < 40; i++) blotch(g, x + rand() * w, y + rand() * h, 20 + rand() * 40, '226, 200, 150', 0.16);
    g.strokeStyle = C.steelLo; g.lineWidth = 6; g.beginPath(); g.moveTo(x, y + 80); g.lineTo(x + w, y + 80); g.moveTo(x, y + 170); g.lineTo(x + w, y + 170); g.stroke();
    g.strokeStyle = C.steelHi; g.lineWidth = 2; g.beginPath(); g.moveTo(x, y + 77); g.lineTo(x + w, y + 77); g.moveTo(x, y + 167); g.lineTo(x + w, y + 167); g.stroke();
    g.fillStyle = C.steelLo; for (let i = 0; i < 9; i++) { g.fillRect(x + 14 + i * 40, y + 70, 8, 110); }
  }
}

/* -- thresholds ---------------------------------------------------------------------------------------------------------- */

/** A worn sill at every door and a puddle of tracked-in snow either side. */
function thresholds(g: G, v: Variant) {
  for (const d of SUMMIT_DOORS) {
    const h = d.axis === 'h';
    const len = d.w;
    const x = h ? d.x : d.x - 25, y = h ? d.y - 25 : d.y, w = h ? len : 50, hh = h ? 50 : len;
    const wood = d.material === 'wood', glass = d.material === 'glass';
    g.fillStyle = glass ? (v ? '#6a7078' : '#7a7a72') : d.material === 'metal' ? '#4a5360' : v ? '#8a7a54' : '#4e3622';
    g.fillRect(x, y, w, hh);
    g.fillStyle = 'rgba(255, 244, 220, 0.14)'; if (h) g.fillRect(x, y, w, 3); else g.fillRect(x, y, 3, hh);
    g.fillStyle = 'rgba(10, 8, 6, 0.3)'; if (h) g.fillRect(x, y + hh - 4, w, 4); else g.fillRect(x + w - 4, y, 4, hh);
    if (d.material === 'metal' && !d.locked) { g.save(); g.beginPath(); g.rect(x, y, w, hh); g.clip(); g.globalAlpha = 0.5; (h ? () => { g.fillStyle = '#d9a02a'; for (let i = 0; i < w; i += 22) g.fillRect(x + i, y + 18, 11, 14); } : () => { g.fillStyle = '#d9a02a'; for (let i = 0; i < hh; i += 22) g.fillRect(x + 18, y + i, 14, 11); })(); g.restore(); }
    if (wood || glass) { g.strokeStyle = hexA(C.brass, 0.6); g.lineWidth = 2; if (h) { g.beginPath(); g.moveTo(x, y + hh / 2); g.lineTo(x + w, y + hh / 2); g.stroke(); } else { g.beginPath(); g.moveTo(x + w / 2, y); g.lineTo(x + w / 2, y + hh); g.stroke(); } }
    // Tracked-in snow, a little lighter than the floor, a little wet.
    const cx = h ? x + w / 2 : x + w / 2, cy = h ? y + hh / 2 : y + hh / 2;
    blotch(g, cx + (h ? 0 : -40), cy + (h ? -40 : 0), 46 + len * 0.2, '205, 222, 244', 0.12);
    blotch(g, cx + (h ? 0 : 40), cy + (h ? 40 : 0), 36 + len * 0.15, '60, 90, 130', 0.08);
  }
}

export function paintInteriors(g: G, _size: number, _seed: number) {
  both(g, (gg, v) => { lodge(gg, v); cabin(gg, v); });
  both(g, (gg, v) => thresholds(gg, v));
  void shade;
}
