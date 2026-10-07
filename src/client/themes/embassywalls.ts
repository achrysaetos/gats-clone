import { districtAt } from '../../shared/maps/embassy.ts';
import { seeded } from '../grain.ts';
import { INK } from '../palette.ts';
import type { Solid, SolidKind } from '../tilt.ts';
import { BRASS, BRASS_HI, CREAM, CRIMSON, NAVY, WALNUT, WALNUT_DK, WALNUT_HI, hash, hexA, hiLine, inkRect, mix, rr, seal, TAU } from './embassykit.ts';

/**
 * Embassy solids, painted whole once per solid into the sprite cache. One building-wall kind and four more (glass, furniture,
 * racks and shelves, hedge) each change dress with the district they stand in, so the same grid reads as white office partitions
 * in the Office Wing and as walnut wainscot and damask in the Residence, as a server aisle and as archive shelving, as a reception
 * desk and as a kitchen island. The half-turn twins share their collision and never their looks.
 */

const FACE = { embwall: 16, embglass: 14, embfurn: 12, embrack: 14, embhedge: 18 } as const;
const BEVEL = 4;
type G = CanvasRenderingContext2D;

/** Front face, top face, the two cel steps and the ink outline, in the kit's usual order. */
function shell(g: G, s: Solid, top: string, front: string, face: number, paintFront: () => void, paintTop: () => void, rounded = 0) {
  const { x, y, w, h } = s, e = BEVEL;
  g.lineJoin = 'miter';
  g.fillStyle = front; g.fillRect(x, y + h, w, face);
  paintFront();
  g.fillStyle = 'rgba(255, 255, 255, 0.13)'; g.fillRect(x, y + h, w, 2);
  g.fillStyle = 'rgba(10, 12, 16, 0.34)'; g.fillRect(x, y + h + face - 4, w, 4);
  g.strokeStyle = INK; g.lineWidth = 2; g.strokeRect(x, y + h, w, face);
  if (rounded) { rr(g, x, y, w, h, rounded); g.fillStyle = top; g.fill(); } else { g.fillStyle = top; g.fillRect(x, y, w, h); }
  paintTop();
  g.fillStyle = 'rgba(255, 255, 255, 0.24)';
  g.beginPath(); g.moveTo(x, y); g.lineTo(x + w, y); g.lineTo(x + w - e, y + e); g.lineTo(x + e, y + e); g.lineTo(x + e, y + h - e); g.lineTo(x, y + h); g.closePath(); g.fill();
  g.fillStyle = 'rgba(10, 12, 16, 0.32)';
  g.beginPath(); g.moveTo(x + w, y); g.lineTo(x + w, y + h); g.lineTo(x, y + h); g.lineTo(x + e, y + h - e); g.lineTo(x + w - e, y + h - e); g.lineTo(x + w - e, y + e); g.closePath(); g.fill();
  g.strokeStyle = INK; g.lineWidth = 2;
  if (rounded) { rr(g, x, y, w, h, rounded); g.stroke(); } else g.strokeRect(x, y, w, h);
}

/* -- wall dress -------------------------------------------------------------------------------------------------- */

type Motif = 'office' | 'panels' | 'steel' | 'marble' | 'damask' | 'concrete' | 'tile' | 'iron' | 'stone' | 'block';
type Dress = { top: string; front: string; trim: string; motif: Motif };
const DRESS: Record<string, Dress> = {
  office: { top: '#d9d5cb', front: '#cdc9be', trim: '#2f3a58', motif: 'office' },
  exec: { top: '#7d5532', front: '#6b4a2c', trim: BRASS, motif: 'panels' },
  steel: { top: '#8e9aaa', front: '#5f6c7e', trim: '#ffd34d', motif: 'steel' },
  marble: { top: '#d6cdb8', front: '#b9b09a', trim: BRASS, motif: 'marble' },
  damask: { top: '#5d3b22', front: '#7a2e3a', trim: BRASS, motif: 'damask' },
  concrete: { top: '#a3a8a2', front: '#80867f', trim: '#ffd34d', motif: 'concrete' },
  tile: { top: '#e4e8e2', front: '#dfe6e0', trim: '#8a9296', motif: 'tile' },
  iron: { top: '#e8e4d8', front: '#86ac96', trim: '#e8e4d8', motif: 'iron' },
  stone: { top: '#c4baa0', front: '#aa9f84', trim: '#2a2d34', motif: 'stone' },
  block: { top: '#a5a79f', front: '#8a8c84', trim: '#ffb347', motif: 'block' },
};
const FAMILY: Record<string, string> = {
  wing: 'office', openplan: 'office', comms: 'office', cafeteria: 'tile', suite: 'exec', conference: 'exec', servers: 'steel',
  lobby: 'marble', flaggallery: 'marble', checkpoint: 'marble', steps: 'stone', northterrace: 'stone', atrium: 'marble',
  residence: 'damask', library: 'damask', ballroom: 'damask', stairhall: 'damask', dining: 'damask', portraits: 'damask',
  archives: 'concrete', kitchen: 'tile', staff: 'tile', conservatory: 'iron',
  staging: 'block', garage: 'block', servicegate: 'block', loadingbay: 'block', dock: 'block',
};
const dressAt = (x: number, y: number): Dress => DRESS[FAMILY[districtAt(x, y).id] ?? 'stone']!;
/** The dress of the room a wall's front face hangs into, and of the one its cap sits in. */
const frontDress = (s: Solid) => dressAt(s.x + s.w / 2, s.y + s.h + 16);
const topDress = (s: Solid) => dressAt(s.x + s.w / 2, s.y + s.h / 2);

function frontDetail(g: G, s: Solid, d: Dress) {
  const { x, w } = s, y = s.y + s.h, f = FACE.embwall;
  const rand = seeded(hash(s.x, s.y));
  switch (d.motif) {
    case 'office': {
      // A glass band over a navy skirting, mullions every pace.
      g.fillStyle = 'rgba(120, 170, 200, 0.5)'; g.fillRect(x + 2, y + 3, w - 4, 7);
      g.fillStyle = 'rgba(255,255,255,0.22)'; for (let gx = x + 6; gx < x + w - 6; gx += 26) g.fillRect(gx, y + 3, 4, 7);
      g.fillStyle = INK; for (let gx = x + 50; gx < x + w - 2; gx += 50) g.fillRect(gx - 1, y + 3, 2, 7);
      g.fillStyle = d.trim; g.fillRect(x, y + f - 7, w, 5);
      g.fillStyle = '#a9a69c'; g.fillRect(x, y + 11, w, 1.5);
      if (w >= 150 && rand() < 0.5) { const px = x + 14 + rand() * (w - 60); inkRect(g, px, y + 13, 14, 9, '#e8e2d0', 1.2); g.fillStyle = '#8a2e3c'; g.fillRect(px + 2, y + 15, 10, 2); }
      break;
    }
    case 'panels': {
      g.fillStyle = 'rgba(0,0,0,0.18)';
      for (let px = x + 5; px < x + w - 12; px += 26) { g.strokeStyle = 'rgba(255, 220, 170, 0.28)'; g.lineWidth = 1.2; g.strokeRect(px, y + 5, 20, f - 11); g.fillRect(px + 2, y + 7, 16, f - 15); }
      g.fillStyle = d.trim; g.fillRect(x, y + 1.5, w, 2.2);
      g.fillStyle = hexA(BRASS, 0.9); g.fillRect(x, y + f - 3.5, w, 1.8);
      break;
    }
    case 'steel': {
      g.strokeStyle = 'rgba(10, 14, 22, 0.5)'; g.lineWidth = 1.2;
      for (let px = x + 25; px < x + w; px += 50) { g.beginPath(); g.moveTo(px, y + 2); g.lineTo(px, y + f - 6); g.stroke(); }
      g.fillStyle = 'rgba(10, 14, 22, 0.55)'; for (let px = x + 8; px < x + w - 10; px += 50) for (let i = 0; i < 3; i++) g.fillRect(px, y + 4 + i * 3, 12, 1.4);
      for (let px = x; px < x + w; px += 12) { g.fillStyle = (px / 12) & 1 ? '#ffd34d' : '#2a2d34'; g.fillRect(px, y + f - 5, Math.min(12, x + w - px), 3.4); }
      break;
    }
    case 'marble': {
      g.strokeStyle = 'rgba(70, 62, 50, 0.4)'; g.lineWidth = 1.2;
      for (let px = x; px < x + w; px += 50) { g.beginPath(); g.moveTo(px, y); g.lineTo(px, y + f); g.stroke(); }
      g.beginPath(); g.moveTo(x, y + 8); g.lineTo(x + w, y + 8); g.stroke();
      g.fillStyle = 'rgba(80, 70, 56, 0.35)'; g.fillRect(x, y + f - 5, w, 4);
      g.fillStyle = hexA(BRASS, 0.85); g.fillRect(x, y + 3, w, 1.8);
      break;
    }
    case 'damask': {
      // Walnut wainscot below a gold rail, crimson damask above it with a lattice of lilies.
      g.fillStyle = WALNUT_DK; g.fillRect(x, y + 8, w, f - 8);
      g.strokeStyle = 'rgba(255, 220, 170, 0.22)'; g.lineWidth = 1.2; for (let px = x + 4; px < x + w - 10; px += 22) g.strokeRect(px, y + 10, 18, f - 14);
      g.fillStyle = BRASS; g.fillRect(x, y + 6, w, 2.2);
      g.fillStyle = 'rgba(224, 170, 110, 0.35)';
      for (let px = x + 6; px < x + w; px += 12) { g.beginPath(); g.moveTo(px, y + 1.5); g.lineTo(px + 3, y + 4); g.lineTo(px, y + 6.5); g.lineTo(px - 3, y + 4); g.closePath(); g.fill(); }
      if (w >= 100 && rand() < 0.4) { const px = x + 14 + rand() * (w - 50); inkRect(g, px, y + 9, 12, 12, '#8a6a3a', 1.2); inkRect(g, px + 2, y + 11, 8, 8, '#3a2a3a', 1); }
      break;
    }
    case 'concrete': {
      g.strokeStyle = 'rgba(20, 24, 20, 0.35)'; g.lineWidth = 1.2; g.beginPath(); g.moveTo(x, y + 8); g.lineTo(x + w, y + 8); g.stroke();
      g.fillStyle = 'rgba(255, 211, 77, 0.85)'; g.fillRect(x, y + f - 6, w, 3);
      if (w >= 100) { lettering2(g, `ARCH-${(hash(s.x, s.y) % 90) + 10}`, x + w / 2, y + 7, 7); }
      break;
    }
    case 'tile': {
      g.strokeStyle = 'rgba(60, 76, 70, 0.45)'; g.lineWidth = 1; g.beginPath();
      for (let px = x; px < x + w; px += 12) { g.moveTo(px, y); g.lineTo(px, y + f - 4); }
      for (let py = y + 4; py < y + f - 3; py += 6) { g.moveTo(x, py); g.lineTo(x + w, py); }
      g.stroke();
      g.fillStyle = '#9aa4a8'; g.fillRect(x, y + f - 5, w, 3.6);
      g.fillStyle = 'rgba(255,255,255,0.35)'; g.fillRect(x, y + f - 5, w, 1);
      break;
    }
    case 'iron': {
      g.fillStyle = 'rgba(190, 235, 215, 0.4)'; g.fillRect(x + 2, y + 3, w - 4, f - 9);
      g.fillStyle = '#e8e4d8'; for (let px = x; px < x + w; px += 25) g.fillRect(px, y + 2, 2.4, f - 7);
      g.fillRect(x, y + f / 2 - 1, w, 2); g.fillRect(x, y + 2, w, 2);
      break;
    }
    case 'stone': {
      g.strokeStyle = 'rgba(40, 34, 24, 0.5)'; g.lineWidth = 1.3;
      for (let row = 0; row < 2; row++) {
        const yy = y + row * (f / 2); g.beginPath(); g.moveTo(x, yy + f / 2); g.lineTo(x + w, yy + f / 2); g.stroke();
        for (let px = x + (row ? 22 : 0); px < x + w; px += 44) { g.beginPath(); g.moveTo(px, yy); g.lineTo(px, yy + f / 2); g.stroke(); }
      }
      g.fillStyle = 'rgba(40, 34, 24, 0.22)'; g.fillRect(x, y + f - 5, w, 4);
      break;
    }
    case 'block': {
      g.strokeStyle = 'rgba(30, 32, 28, 0.45)'; g.lineWidth = 1.2;
      for (let row = 0; row < 2; row++) { const yy = y + row * 8; g.beginPath(); g.moveTo(x, yy + 8); g.lineTo(x + w, yy + 8); g.stroke(); for (let px = x + (row ? 16 : 0); px < x + w; px += 32) { g.beginPath(); g.moveTo(px, yy); g.lineTo(px, yy + 8); g.stroke(); } }
      for (let px = x; px < x + w; px += 14) { g.fillStyle = (px / 14) & 1 ? '#ffb347' : '#2a2d34'; g.fillRect(px, y + f - 5, Math.min(14, x + w - px), 3.4); }
      break;
    }
  }
}

function lettering2(g: G, text: string, x: number, y: number, size: number) {
  g.save(); g.font = `700 ${size}px "Barlow Condensed", "Arial Narrow", sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = 'rgba(232, 226, 200, 0.7)'; g.fillText(text, x, y); g.restore();
}

function topDetail(g: G, s: Solid, d: Dress) {
  const { x, y, w, h } = s;
  g.strokeStyle = 'rgba(20, 22, 26, 0.18)'; g.lineWidth = 1;
  const long = Math.max(w, h);
  g.beginPath();
  if (w >= h) for (let px = x + 100; px < x + w - 20; px += 100) { g.moveTo(px, y + 3); g.lineTo(px, y + h - 3); }
  else for (let py = y + 100; py < y + h - 20; py += 100) { g.moveTo(x + 3, py); g.lineTo(x + w - 3, py); }
  g.stroke();
  if (d.motif === 'stone' || d.motif === 'block') {
    // The compound wall's iron railing: black spikes along the cap.
    g.fillStyle = d.motif === 'stone' ? '#23262c' : '#3a3d44';
    const horizontal = w >= h;
    for (let t = 6; t < long - 3; t += 14) { if (horizontal) g.fillRect(x + t, y + h / 2 - 1, 2.6, 2.6); else g.fillRect(x + w / 2 - 1, y + t, 2.6, 2.6); }
  }
  if (d.motif === 'damask' || d.motif === 'panels') { g.fillStyle = hexA(BRASS, 0.5); if (w >= h) g.fillRect(x + 2, y + h / 2 - 0.8, w - 4, 1.6); else g.fillRect(x + w / 2 - 0.8, y + 2, 1.6, h - 4); }
  void long;
}

function paintWall(g: G, s: Solid) {
  const f = frontDress(s), t = topDress(s);
  // Square, short pieces are piers and columns: round the cap and give it a capital.
  const pier = s.w <= 110 && s.h <= 110 && Math.abs(s.w - s.h) < 12;
  shell(g, s, t.top, f.front, FACE.embwall, () => frontDetail(g, s, f), () => {
    topDetail(g, s, t);
    if (pier) { g.strokeStyle = hexA(BRASS, 0.7); g.lineWidth = 2; g.strokeRect(s.x + 7, s.y + 7, s.w - 14, s.h - 14); g.fillStyle = hexA(BRASS_HI, 0.5); g.fillRect(s.x + s.w / 2 - 3, s.y + s.h / 2 - 3, 6, 6); }
  });
}

/* -- curtain glass ----------------------------------------------------------------------------------------------- */

function paintGlass(g: G, s: Solid) {
  const { x, y, w, h } = s, f = FACE.embglass, py = y + h;
  const d = DISTRICTS_TINT(districtAt(x + w / 2, py + 16).id);
  shell(g, s, '#8fb4bd', d.glass, f, () => {
    g.fillStyle = 'rgba(255, 255, 255, 0.16)';
    for (let gx = x + 6; gx < x + w - 14; gx += 38) { g.beginPath(); g.moveTo(gx, py + 2); g.lineTo(gx + 12, py + 2); g.lineTo(gx + 4, py + f - 2); g.lineTo(gx - 8, py + f - 2); g.closePath(); g.fill(); }
    g.fillStyle = BRASS; for (let gx = x; gx <= x + w; gx += 50) g.fillRect(Math.min(gx, x + w - 3) - 0, py, 3, f);
    g.fillStyle = BRASS; g.fillRect(x, py, w, 2.4); g.fillRect(x, py + f - 4, w, 3);
    if (d.frost) { g.fillStyle = 'rgba(235, 245, 240, 0.55)'; g.fillRect(x, py + 5, w, f - 12); }
  }, () => {
    g.fillStyle = BRASS; g.fillRect(x + 3, y + h / 2 - 1.2, w - 6, 2.4);
    g.fillStyle = 'rgba(255,255,255,0.28)'; g.fillRect(x + 2, y + 2, w - 4, 3);
  });
}
const DISTRICTS_TINT = (id: string) => (id === 'staff' ? { glass: '#6a8c80', frost: true } : { glass: '#5f8a98', frost: false });

/* -- furniture --------------------------------------------------------------------------------------------------- */

type Room = 'office' | 'suite' | 'conference' | 'comms' | 'cafeteria' | 'lobby' | 'checkpoint' | 'gallery' | 'court' | 'garage' | 'lawn' | 'library' | 'ballroom' | 'dining' | 'stairhall' | 'conservatory' | 'kitchen' | 'staff' | 'rose' | 'dock';
const ROOM: Record<string, Room> = {
  openplan: 'office', wing: 'office', suite: 'suite', conference: 'conference', comms: 'comms', cafeteria: 'cafeteria', lobby: 'lobby', checkpoint: 'checkpoint',
  flaggallery: 'gallery', portraits: 'gallery', westcourt: 'court', eastcourt: 'rose', garage: 'garage', loadingbay: 'dock', lawn: 'lawn', servicelot: 'lawn', backsteps: 'court', steps: 'court',
  library: 'library', ballroom: 'ballroom', dining: 'dining', stairhall: 'stairhall', conservatory: 'conservatory', kitchen: 'kitchen', staff: 'staff', residence: 'library',
  staging: 'garage', servicegate: 'dock', drive: 'lawn', dock: 'dock', secretary: 'suite',
};

function legs(g: G, x: number, y: number, w: number, h: number, col: string) {
  g.fillStyle = col; for (const [lx, ly] of [[x + 3, y + h], [x + w - 8, y + h]] as const) g.fillRect(lx, ly, 5, 4);
}

function monitor(g: G, x: number, y: number, on: string) {
  inkRect(g, x, y, 16, 11, '#2a2d34', 1.3); g.fillStyle = on; g.fillRect(x + 2, y + 2, 12, 7); g.fillStyle = 'rgba(255,255,255,0.3)'; g.fillRect(x + 2, y + 2, 12, 1.6); inkRect(g, x + 5, y + 11, 6, 3, '#4a4f58', 1);
}

function paintFurniture(g: G, s: Solid) {
  const { x, y, w, h } = s, f = FACE.embfurn, py = y + h;
  const id = districtAt(x + w / 2, y + h / 2).id;
  const room: Room = ROOM[id] ?? 'office';
  const rand = seeded(hash(x, y));
  const big = w >= 300 && h >= 100;
  const horizontal = w >= h;
  // Which thing is it? By room and by size.
  let top = '#b9a98a', front = '#6a5a40';
  let kind: 'desk' | 'counter' | 'table' | 'lounge' | 'belt' | 'island' | 'bench' | 'kiosk' | 'buffet' | 'bar' = 'desk';
  switch (room) {
    case 'suite': case 'library': top = '#6b4a2c'; front = '#4a321c'; kind = big ? 'desk' : w >= 150 && h <= 60 ? 'counter' : 'lounge'; break;
    case 'conference': case 'ballroom': top = room === 'ballroom' ? '#e8e2d2' : '#7d5532'; front = room === 'ballroom' ? '#cfc8b4' : '#4a321c'; kind = 'buffet'; break;
    case 'comms': top = '#8a9096'; front = '#5a6068'; kind = h >= 100 && w >= 150 ? 'table' : 'counter'; break;
    case 'cafeteria': case 'conservatory': kind = w <= 110 && h <= 110 ? 'table' : 'counter'; top = room === 'cafeteria' ? '#c8c0a4' : '#a07a4a'; front = room === 'cafeteria' ? '#7a7560' : '#6a4a2a'; break;
    case 'lobby': kind = big ? 'desk' : 'counter'; top = '#d0c8b4'; front = '#5a4430'; break;
    case 'kitchen': kind = big ? 'island' : 'counter'; top = '#b8c0c4'; front = '#7c868c'; break;
    case 'checkpoint': case 'staff': kind = w >= 300 ? 'belt' : 'kiosk'; top = '#8a9096'; front = '#4a5058'; break;
    case 'gallery': case 'court': case 'lawn': case 'rose': kind = 'bench'; top = '#9a7a4e'; front = '#5a4426'; break;
    case 'garage': case 'dock': kind = 'counter'; top = '#8c8f98'; front = '#4a4f58'; break;
    case 'stairhall': kind = 'lounge'; top = '#7a2e3a'; front = '#4a1c24'; break;
    case 'dining': kind = 'buffet'; top = '#5a3a22'; front = '#3a2412'; break;
    default: kind = w >= 150 && h >= 100 ? 'desk' : w >= 150 ? 'counter' : 'table'; break;
  }
  void horizontal;
  shell(g, s, top, front, f, () => {
    legs(g, x, py, w, f, INK);
    if (kind === 'belt') { g.fillStyle = '#2a2d34'; g.fillRect(x + 8, py + 3, w - 16, 5); g.fillStyle = '#ffd34d'; g.fillRect(x, py + f - 4, w, 2.4); }
    if (kind === 'desk' && room === 'lobby') { seal(g, x + w / 2, py + 6, 8, { alpha: 0.95 }); g.fillStyle = hexA(BRASS, 0.8); g.fillRect(x, py + f - 3.5, w, 2); }
    if (kind === 'desk' && (room === 'suite' || room === 'library')) { g.fillStyle = 'rgba(0,0,0,0.2)'; g.fillRect(x + 6, py + 3, w - 12, f - 6); g.fillStyle = hexA(BRASS, 0.8); g.fillRect(x + w / 2 - 8, py + 5, 16, 3); }
    if (kind === 'island' || kind === 'counter') { g.fillStyle = 'rgba(255,255,255,0.12)'; g.fillRect(x + 2, py + 2, w - 4, 3); }
  }, () => {
    const cx = x + w / 2, cy = y + h / 2;
    g.fillStyle = 'rgba(255,255,255,0.12)'; g.fillRect(x + 4, y + 4, w - 8, 3);
    if (kind === 'desk' && (room === 'suite' || room === 'library')) {
      // The huge desk: a green leather blotter, a brass lamp and nameplate, a phone, a pen set, a heap of papers.
      inkRect(g, x + 22, y + 24, w - 44, h - 40, '#2f5a46', 1.6);
      g.strokeStyle = hexA(BRASS, 0.7); g.lineWidth = 1.2; g.strokeRect(x + 26, y + 28, w - 52, h - 48);
      inkRect(g, x + w - 56, y + 8, 22, 9, BRASS, 1.2); lettering2(g, room === 'suite' ? 'AMB.' : 'SIR', x + w - 45, y + 12.6, 6.5);
      inkRect(g, x + 14, y + 8, 30, 18, '#e8e2d0', 1.2);
      g.fillStyle = '#c0392b'; g.fillRect(x + 20, y + 11, 18, 2); g.fillStyle = '#2c3e66'; g.fillRect(x + 20, y + 16, 12, 2);
      const lx = x + w - 28, ly = y + h - 22;
      g.fillStyle = 'rgba(255, 220, 130, 0.22)'; g.beginPath(); g.arc(lx, ly, 18, 0, TAU); g.fill();
      inkDisc2(g, lx, ly, 5.5, '#d9c27a'); inkDisc2(g, lx, ly, 3.4, '#ffe9a8');
      inkRect(g, x + w / 2 - 12, y + h - 24, 24, 14, '#3a3d44', 1.3); g.fillStyle = '#9aa0a8'; g.fillRect(x + w / 2 - 8, y + h - 21, 16, 5);
      inkRect(g, x + 50, y + h - 20, 10, 12, '#2a2d34', 1.2);
    } else if (kind === 'desk') {
      g.fillStyle = 'rgba(0,0,0,0.12)'; g.fillRect(x + 5, y + 5, w - 10, h - 10);
      const screens = Math.max(1, Math.floor(w / 72));
      for (let i = 0; i < screens; i++) monitor(g, x + 12 + i * (w - 24) / screens + (w - 24) / screens / 2 - 8, y + 6, i === 0 && rand() < 0.5 ? '#7fd0a8' : '#8fb4e0');
      for (let i = 0; i < screens; i++) inkRect(g, x + 14 + i * (w - 24) / screens + (w - 24) / screens / 2 - 6, y + 28, 14, 6, '#d8d4c8', 1);
      inkDisc2(g, x + w - 14, y + h - 14, 5, '#e8e2d0');
      if (room === 'lobby') { g.fillStyle = 'rgba(255, 255, 255, 0.08)'; g.fillRect(x + 4, y + 4, w - 8, 3); inkRect(g, cx - 12, y + h - 18, 24, 12, '#1f2a4c', 1.3); lettering2(g, 'VISITORS', cx, y + h - 12, 6); }
    } else if (kind === 'counter') {
      if (room === 'comms') { for (let i = 0; i < Math.floor(w / 40); i++) inkRect(g, x + 8 + i * 40, y + 8, 28, h - 16, '#4a5058', 1.3); }
      else if (room === 'lobby') { g.fillStyle = 'rgba(160, 210, 230, 0.45)'; g.fillRect(x + 6, y + 4, w - 12, 5); g.strokeStyle = INK; g.lineWidth = 1.2; g.strokeRect(x + 6, y + 4, w - 12, 5); inkRect(g, x + 20, y + h - 14, 14, 9, '#e8e2d0', 1.1); }
      else if (room === 'cafeteria') { for (let i = 0; i < Math.floor(w / 40); i++) { inkRect(g, x + 8 + i * 40, y + 8, 30, h - 16, '#a8a48a', 1.2); inkDisc2(g, x + 22 + i * 40, y + h / 2, 7, i & 1 ? '#c8503a' : '#d8c050'); } }
      else if (room === 'conservatory') { for (let i = 0; i < Math.floor(w / 36); i++) { inkRect(g, x + 8 + i * 36, y + 8, 26, h - 16, '#8a5a38', 1.2); inkDisc2(g, x + 21 + i * 36, y + h / 2, 8, '#5aa04a'); } }
      else { g.fillStyle = 'rgba(255,255,255,0.14)'; for (let i = 0; i < Math.floor(w / 30); i++) g.fillRect(x + 8 + i * 30, y + 8, 18, h - 16); }
    } else if (kind === 'table') {
      g.fillStyle = 'rgba(0,0,0,0.18)'; g.beginPath(); g.arc(cx, cy, Math.min(w, h) / 2 - 6, 0, TAU); g.fill();
      inkDisc2(g, cx, cy, Math.min(w, h) / 2 - 9, room === 'cafeteria' ? '#d8d0b4' : room === 'conservatory' ? '#b08a56' : '#9aa0a6');
      if (room === 'cafeteria') { inkRect(g, cx - 14, cy - 6, 14, 8, '#c8503a', 1.1); inkRect(g, cx + 2, cy - 2, 12, 8, '#e8e2d0', 1.1); inkDisc2(g, cx + 2, cy - 12, 4, '#6a4030'); }
      if (room === 'comms') { g.strokeStyle = '#2a3a50'; g.lineWidth = 1.4; g.strokeRect(cx - 28, cy - 14, 56, 28); g.beginPath(); g.moveTo(cx - 20, cy - 4); g.lineTo(cx - 4, cy + 6); g.lineTo(cx + 12, cy - 8); g.lineTo(cx + 24, cy + 6); g.stroke(); }
    } else if (kind === 'lounge') {
      inkRect(g, x + 6, y + 6, w - 12, h - 12, room === 'stairhall' ? '#9a3a46' : room === 'library' ? '#3f5a3a' : '#4a5f78', 1.5);
      g.fillStyle = 'rgba(255,255,255,0.14)'; g.fillRect(x + 8, y + 8, w - 16, 5);
      g.fillStyle = 'rgba(0,0,0,0.22)'; g.fillRect(x + 8, y + h - 16, w - 16, 8);
      g.strokeStyle = 'rgba(0,0,0,0.3)'; g.lineWidth = 1.2; g.beginPath(); g.moveTo(cx, y + 14); g.lineTo(cx, y + h - 16); g.stroke();
    } else if (kind === 'belt') {
      // An x-ray belt: a tunnel hood over a rubber belt, trays at the near end.
      inkRect(g, x + 4, y + 8, w - 8, h - 16, '#3a3f48', 1.5);
      g.fillStyle = '#1c1f26'; g.fillRect(x + 10, y + h / 2 - 8, w - 20, 16);
      g.fillStyle = 'rgba(255,255,255,0.06)'; for (let px = x + 14; px < x + w - 14; px += 10) g.fillRect(px, y + h / 2 - 8, 2, 16);
      inkRect(g, x + w / 2 - 40, y + 6, 80, h - 12, '#6a727c', 1.6);
      g.fillStyle = 'rgba(255,255,255,0.18)'; g.fillRect(x + w / 2 - 38, y + 8, 76, 4);
      g.fillStyle = '#ffd34d'; g.fillRect(x + w / 2 - 40, y + 6, 80, 3);
      inkDisc2(g, x + w / 2 + 28, y + h - 10, 3.4, '#ff4a40');
      for (const tx of [x + 12, x + w - 34]) inkRect(g, tx, y + h / 2 - 7, 22, 14, '#9aa4ae', 1.2);
    } else if (kind === 'kiosk') {
      for (let i = 0; i < 3; i++) inkRect(g, x + 8, y + 8 + i * 7, w - 16, 6, '#9aa4ae', 1.1);
      inkRect(g, x + w - 30, y + h - 34, 18, 22, '#2a2d34', 1.3); g.fillStyle = '#7fd0a8'; g.fillRect(x + w - 27, y + h - 31, 12, 8);
    } else if (kind === 'island') {
      g.fillStyle = 'rgba(0,0,0,0.12)'; g.fillRect(x + 6, y + 6, w - 12, h - 12);
      for (let i = 0; i < Math.floor(w / 80); i++) { inkDisc2(g, x + 30 + i * 80, y + h / 2 - 8, 15, '#8a9298'); inkDisc2(g, x + 30 + i * 80, y + h / 2 - 8, 10, '#a8b0b4'); inkRect(g, x + 14 + i * 80, y + h - 22, 36, 8, '#c8503a', 1.1); }
      inkRect(g, x + w - 44, y + 10, 30, 16, '#d0c8b0', 1.2);
    } else if (kind === 'bench') {
      g.fillStyle = 'rgba(0,0,0,0.2)'; for (let i = 0; i < Math.floor((w >= h ? w : h) / 22); i++) { if (w >= h) g.fillRect(x + 6 + i * 22, y + 4, 2, h - 8); else g.fillRect(x + 4, y + 6 + i * 22, w - 8, 2); }
      g.fillStyle = BRASS; g.fillRect(x + 4, y + 3, 4, 4); g.fillRect(x + w - 8, y + h - 7, 4, 4);
    } else if (kind === 'buffet') {
      if (room === 'ballroom' || room === 'dining') {
        // A buffet laid for the gala: white linen, a silver tureen, stacked plates, a bowl of fruit.
        g.fillStyle = 'rgba(255,255,255,0.35)'; g.fillRect(x + 2, y + 2, w - 4, h - 4);
        for (let i = 0; i < Math.max(1, Math.floor(w / 70)); i++) { inkDisc2(g, x + 20 + i * 64, cy, Math.min(10, h / 2 - 5), i % 3 === 0 ? '#c0c8d0' : i % 3 === 1 ? '#d8b04a' : '#c8503a'); }
      } else {
        g.fillStyle = 'rgba(0,0,0,0.16)'; g.fillRect(x + 4, y + 4, w - 8, h - 8); inkRect(g, x + 8, y + 6, 14, h - 12, '#c9c2b0', 1.1);
        inkDisc2(g, x + w - 14, cy, 6, '#c0c8d0');
      }
    }
  });
}

function inkDisc2(g: G, x: number, y: number, r: number, fill: string) { g.fillStyle = fill; g.beginPath(); g.arc(x, y, r, 0, TAU); g.fill(); g.strokeStyle = INK; g.lineWidth = 1.3; g.stroke(); }

/* -- racks, shelves and cabinets --------------------------------------------------------------------------------- */

function paintRack(g: G, s: Solid) {
  const { x, y, w, h } = s, f = FACE.embrack, py = y + h;
  const id = districtAt(x + w / 2, y + h / 2).id;
  const rand = seeded(hash(x, y));
  const horizontal = w >= h;
  if (id === 'servers') {
    shell(g, s, '#3a4250', '#252b36', f, () => {
      // Cabinet doors in 50 px bays with a vent grille, a keyed handle and a row of status LEDs (the living ones are drawn over).
      for (let px = x; px < x + w; px += 50) {
        g.strokeStyle = 'rgba(0,0,0,0.6)'; g.lineWidth = 1.4; g.strokeRect(px + 2, py + 2, 46, f - 5);
        g.fillStyle = 'rgba(0,0,0,0.5)'; for (let k = 0; k < 4; k++) g.fillRect(px + 6, py + 4 + k * 2.6, 22, 1.2);
        for (let k = 0; k < 4; k++) { g.fillStyle = rand() < 0.7 ? '#2f7a4a' : '#7a5a2a'; g.fillRect(px + 33 + k * 3.4, py + 6, 2, 2); }
        g.fillStyle = '#9aa4b2'; g.fillRect(px + 42, py + 5, 2, 5);
      }
    }, () => {
      g.fillStyle = 'rgba(0,0,0,0.3)'; if (horizontal) for (let px = x + 6; px < x + w - 6; px += 8) g.fillRect(px, y + 6, 4, h - 12); else for (let py2 = y + 6; py2 < y + h - 6; py2 += 8) g.fillRect(x + 6, py2, w - 12, 4);
      g.fillStyle = 'rgba(86, 184, 255, 0.25)'; if (horizontal) g.fillRect(x + 3, y + h - 6, w - 6, 2); else g.fillRect(x + w - 6, y + 3, 2, h - 6);
    });
    return;
  }
  if (id === 'archives') {
    // Steel archive shelving: grey uprights, boxes with white labels.
    shell(g, s, '#7a8088', '#4a5058', f, () => {
      for (let px = x; px < x + w; px += 50) {
        g.fillStyle = '#2f343c'; g.fillRect(px, py + 2, 2, f - 3);
        for (let k = 0; k < 2; k++) for (let b = 0; b < 3; b++) { inkRect(g, px + 4 + b * 14, py + 2 + k * 6, 12, 5.4, ['#c9b790', '#b8a77c', '#d5c6a0'][Math.floor(rand() * 3)]!, 1); g.fillStyle = '#f0ebdc'; g.fillRect(px + 7 + b * 14, py + 4 + k * 6, 6, 1.6); }
      }
    }, () => { g.fillStyle = 'rgba(255,255,255,0.1)'; g.fillRect(x + 4, y + 4, w - 8, 3); g.fillStyle = 'rgba(0,0,0,0.2)'; for (let px = x + 8; px < x + w - 8; px += 12) g.fillRect(px, y + 6, 6, 8); });
    return;
  }
  if (id === 'suite' || id === 'library' || id === 'secretary') {
    // Bookcases: walnut carcass, shelves of spines.
    shell(g, s, WALNUT_HI, WALNUT_DK, f, () => {
      const cols = ['#7a2e3a', '#2f4a6a', '#6a7a3a', '#c9a23c', '#e8dfc6', '#3a2a4a'];
      for (let k = 0; k < 2; k++) {
        const yy = py + 2 + k * 6;
        g.fillStyle = 'rgba(0,0,0,0.5)'; g.fillRect(x + 2, yy + 5, w - 4, 1.2);
        for (let px = x + 3; px < x + w - 4; px += 3.2) { g.fillStyle = cols[Math.floor(rand() * cols.length)]!; g.fillRect(px, yy + (rand() < 0.2 ? 1.4 : 0), 2.6, rand() < 0.2 ? 3.6 : 5); }
      }
    }, () => { g.fillStyle = hexA(BRASS, 0.55); if (horizontal) g.fillRect(x + 2, y + h / 2 - 0.8, w - 4, 1.6); else g.fillRect(x + w / 2 - 0.8, y + 2, 1.6, h - 4); });
    return;
  }
  // Filing cabinets, vending machines and plain shelving elsewhere.
  const tone = id === 'kitchen' ? { t: '#aab2b6', f: '#7c868c' } : id === 'conservatory' ? { t: '#a8d0b0', f: '#6a9a78' } : id === 'cafeteria' ? { t: '#9a3a3a', f: '#6a2a2a' } : { t: '#8a9096', f: '#5a6068' };
  shell(g, s, tone.t, tone.f, f, () => {
    for (let px = x; px < x + w; px += 50) {
      for (let k = 0; k < 2; k++) { inkRect(g, px + 3, py + 2 + k * 6, 44, 5, tone.f, 1); g.fillStyle = '#d8d4c8'; g.fillRect(px + 20, py + 3.6 + k * 6, 10, 2); }
    }
  }, () => { g.fillStyle = 'rgba(255,255,255,0.12)'; g.fillRect(x + 4, y + 4, w - 8, 3); });
}

/* -- hedge ------------------------------------------------------------------------------------------------------- */

function paintHedge(g: G, s: Solid) {
  const { x, y, w, h } = s, f = FACE.embhedge, py = y + h;
  const rand = seeded(hash(x, y));
  const maze = districtAt(x + w / 2, y + h / 2).id;
  const tone = maze === 'maze' || maze === 'topiary' ? { top: '#3f6a38', front: '#2a4a2a', leaf: ['#2f5a30', '#3f7a3a', '#2a4a26'] } : { top: '#4a7a40', front: '#2f5030', leaf: ['#365f34', '#4a8444', '#2c4c2a'] };
  shell(g, s, tone.top, tone.front, f, () => {
    for (let px = x + 4; px < x + w - 4; px += 9) { g.fillStyle = tone.leaf[Math.floor(rand() * 3)]!; g.beginPath(); g.arc(px + rand() * 3, py + 5 + rand() * (f - 12), 4.6 + rand() * 2, 0, TAU); g.fill(); }
    g.fillStyle = 'rgba(10,26,12,0.4)'; g.fillRect(x, py + f - 6, w, 4);
  }, () => {
    for (let i = 0; i < (w * h) / 55; i++) { g.fillStyle = tone.leaf[Math.floor(rand() * 3)]!; g.globalAlpha = 0.7; g.beginPath(); g.arc(x + 3 + rand() * (w - 6), y + 3 + rand() * (h - 6), 2.2 + rand() * 2.4, 0, TAU); g.fill(); }
    g.globalAlpha = 1;
    g.fillStyle = 'rgba(220, 255, 170, 0.12)'; for (let i = 0; i < (w * h) / 300; i++) g.fillRect(x + 4 + rand() * (w - 8), y + 4 + rand() * (h - 8), 3, 2);
  }, 10);
  void mix; void CREAM; void CRIMSON; void NAVY; void WALNUT; void hiLine;
}

export const EMBASSY_WALLS: Partial<Record<SolidKind, (ctx: CanvasRenderingContext2D, s: Solid) => void>> = {
  embwall: paintWall,
  embglass: paintGlass,
  embfurn: paintFurniture,
  embrack: paintRack,
  embhedge: paintHedge,
};

/** Server racks and other lit things the theme animates over the baked art: their rects. */
export const isServerRack = (s: { x: number; y: number; w: number; h: number }): boolean => districtAt(s.x + s.w / 2, s.y + s.h / 2).id === 'servers';
