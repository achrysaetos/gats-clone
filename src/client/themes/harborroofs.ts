import type { MapDoor, MapRoof } from '../../shared/geom.ts';
import { BERTHS, ROOMS, ROOM_TWIN, SIZE } from '../../shared/maps/causewaydata.ts';
import type { DoorLeaf } from '../../shared/sim/doors.ts';
import type { GeoInfo } from '../geoart.ts';
import { setLight } from '../lighting.ts';
import { INK } from '../palette.ts';
import { C, TAU, hash2, hexA, mix, painted, plate, sprite, stamp } from './harborkit.ts';
import { bobOf } from './harborships.ts';

/**
 * Roofs and doors. Roofs are painted once into a sprite (they never move but for a ship's, which rides the swell) and fade to a
 * ghost while you stand under them. Each has its building's name painted large enough to read from across the yard. Doors are
 * drawn here for the harbour's own metals, planks and glass.
 */

type G = CanvasRenderingContext2D;

const shipOfRoof = (id: string): string | null => {
  const base = id.replace(/~$/, '').split(':')[0]!;
  const group = base === 'kbridge' ? 'kestrel' : base === 'twheel' ? 'trawler' : base === 'pcabin' ? 'patrol' : null;
  return group ? (id.endsWith('~') ? `${group}~` : group) : null;
};

const nameOf = (id: string): string => {
  const east = id.endsWith('~');
  const room = ROOMS.find((r) => id.startsWith(`${r.id}:`));
  if (!room) return '';
  return east ? ROOM_TWIN[room.name] ?? room.name : room.name;
};

function corrugated(g: G, x: number, y: number, w: number, h: number, ridge: number, dark: string, horizontal = false): void {
  g.strokeStyle = dark; g.lineWidth = 2;
  g.beginPath();
  if (horizontal) for (let yy = y + ridge; yy < y + h; yy += ridge) { g.moveTo(x, yy); g.lineTo(x + w, yy); }
  else for (let xx = x + ridge; xx < x + w; xx += ridge) { g.moveTo(xx, y); g.lineTo(xx, y + h); }
  g.stroke();
}

function paintRoof(g: G, roof: MapRoof, id: string): void {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const p of roof.points) { x0 = Math.min(x0, p.x); y0 = Math.min(y0, p.y); x1 = Math.max(x1, p.x); y1 = Math.max(y1, p.y); }
  const w = x1 - x0, h = y1 - y0, east = id.endsWith('~');
  const base = id.replace(/~$/, '').split(':')[0]!;
  const tint = roof.tint ?? '#8a8a80';
  const lip = 12;
  // The lip: the roof's thick edge seen from the south.
  g.fillStyle = mix(tint, 0, 0.42); g.fillRect(x0, y1, w, lip);
  g.strokeStyle = INK; g.lineWidth = 2; g.strokeRect(x0, y1, w, lip);
  g.fillStyle = tint; g.fillRect(x0, y0, w, h);
  g.save(); g.beginPath(); g.rect(x0, y0, w, h); g.clip();
  switch (base) {
    case 'fish': {
      corrugated(g, x0, y0, w, h, 24, 'rgba(0,0,0,0.2)');
      corrugated(g, x0 + 1, y0, w, h, 24, 'rgba(255,255,255,0.12)');
      // Ridge, skylights and the painted name.
      g.fillStyle = 'rgba(0,0,0,0.22)'; g.fillRect(x0, y0 + h / 2 - 5, w, 10);
      g.fillStyle = 'rgba(190, 230, 235, 0.55)';
      for (const fx of [0.2, 0.5, 0.8]) { g.fillRect(x0 + w * fx - 40, y0 + h * 0.2, 80, 54); g.strokeStyle = INK; g.strokeRect(x0 + w * fx - 40, y0 + h * 0.2, 80, 54); }
      // A fish, painted big.
      g.fillStyle = hexA('#f0f4ee', 0.5); g.beginPath(); g.ellipse(x0 + w * 0.5, y0 + h * 0.74, 70, 28, 0, 0, TAU); g.fill();
      g.beginPath(); g.moveTo(x0 + w * 0.5 + 62, y0 + h * 0.74); g.lineTo(x0 + w * 0.5 + 104, y0 + h * 0.74 - 24); g.lineTo(x0 + w * 0.5 + 104, y0 + h * 0.74 + 24); g.fill();
      break;
    }
    case 'customs': {
      g.strokeStyle = 'rgba(0,0,0,0.16)'; g.lineWidth = 2; g.strokeRect(x0 + 14, y0 + 14, w - 28, h - 28);
      g.fillStyle = 'rgba(40,50,40,0.5)';
      for (const [fx, fy] of [[0.14, 0.2], [0.82, 0.3], [0.7, 0.75]] as const) { g.fillRect(x0 + w * fx - 28, y0 + h * fy - 20, 56, 40); g.fillStyle = 'rgba(190,205,180,0.5)'; g.beginPath(); g.arc(x0 + w * fx, y0 + h * fy, 13, 0, TAU); g.fill(); g.fillStyle = 'rgba(40,50,40,0.5)'; }
      // The flag pole base and a painted compass-rose of the border post.
      g.fillStyle = hexA('#2f5f8c', 0.45); g.beginPath(); g.arc(x0 + w * 0.36, y0 + h * 0.55, 54, 0, TAU); g.fill();
      g.fillStyle = hexA('#f0f0e0', 0.55); for (let k = 0; k < 4; k++) { g.save(); g.translate(x0 + w * 0.36, y0 + h * 0.55); g.rotate((k * TAU) / 4); g.beginPath(); g.moveTo(0, -48); g.lineTo(9, 0); g.lineTo(-9, 0); g.fill(); g.restore(); }
      break;
    }
    case 'cafe': {
      for (let i = 0; i * 28 < w; i++) { g.fillStyle = i % 2 ? '#f2ead6' : '#b4442e'; g.fillRect(x0 + i * 28, y0, 28, h); }
      g.fillStyle = 'rgba(0,0,0,0.12)'; g.fillRect(x0, y0 + h - 22, w, 22);
      g.fillStyle = '#6a5034'; g.fillRect(x0 + w - 56, y0 + 18, 22, 22); g.strokeStyle = INK; g.strokeRect(x0 + w - 56, y0 + 18, 22, 22);
      break;
    }
    case 'loft': case 'pump': {
      g.strokeStyle = 'rgba(0,0,0,0.25)'; g.lineWidth = 2;
      g.beginPath(); for (let yy = y0 + 16; yy < y1; yy += 16) { g.moveTo(x0, yy); g.lineTo(x1, yy); } g.stroke();
      g.strokeStyle = 'rgba(255,255,255,0.1)'; g.beginPath(); for (let yy = y0 + 17; yy < y1; yy += 16) for (let xx = x0 + ((yy / 16) % 2) * 12; xx < x1; xx += 24) { g.moveTo(xx, yy); g.lineTo(xx, yy + 15); } g.stroke();
      if (base === 'pump') { g.fillStyle = '#4e4a44'; g.beginPath(); g.arc(x0 + w * 0.7, y0 + h * 0.4, 20, 0, TAU); g.fill(); g.strokeStyle = INK; g.stroke(); g.fillStyle = 'rgba(255,255,255,0.14)'; g.beginPath(); g.arc(x0 + w * 0.7 - 5, y0 + h * 0.4 - 5, 8, 0, TAU); g.fill(); }
      break;
    }
    case 'stores': {
      corrugated(g, x0, y0, w, h, 28, 'rgba(0,0,0,0.2)', true);
      g.fillStyle = 'rgba(214,210,194,0.32)'; g.font = '800 70px "Barlow Condensed", sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText(east ? 'CG' : 'N4', x0 + w / 2, y0 + h * 0.7);
      break;
    }
    case 'kbridge': case 'twheel': case 'pcabin': {
      g.strokeStyle = 'rgba(0,0,0,0.18)'; g.lineWidth = 2; g.strokeRect(x0 + 8, y0 + 8, w - 16, h - 16);
      g.fillStyle = 'rgba(0,0,0,0.16)'; g.fillRect(x0 + 8, y0 + h * 0.5 - 2, w - 16, 4);
      // Radar, funnel and vents.
      if (base === 'kbridge') { g.fillStyle = '#b4442e'; g.beginPath(); g.ellipse(x0 + w * 0.5, y0 + h * 0.72, 44, 34, 0, 0, TAU); g.fill(); g.strokeStyle = INK; g.lineWidth = 2; g.stroke(); g.fillStyle = '#2a2d33'; g.beginPath(); g.ellipse(x0 + w * 0.5, y0 + h * 0.72, 28, 20, 0, 0, TAU); g.fill(); g.fillStyle = '#e8e4d0'; g.fillRect(x0 + w * 0.5 - 30, y0 + h * 0.72 - 3, 60, 6); }
      g.fillStyle = '#c8c4b0'; g.beginPath(); g.arc(x0 + w * 0.3, y0 + h * 0.28, base === 'pcabin' ? 11 : 16, 0, TAU); g.fill(); g.strokeStyle = INK; g.lineWidth = 2; g.stroke();
      g.strokeStyle = '#d8d4c4'; g.lineWidth = 3; g.beginPath(); g.moveTo(x0 + w * 0.3 - 22, y0 + h * 0.28); g.lineTo(x0 + w * 0.3 + 22, y0 + h * 0.28); g.stroke();
      break;
    }
    default: break;
  }
  g.restore();
  g.strokeStyle = INK; g.lineWidth = 2; g.strokeRect(x0, y0, w, h);
  // The name, painted large on the roof (the ships' cabins stay plain).
  const nm = nameOf(id);
  const berth = BERTHS.find((b) => (b.id === 'kestrel' && base === 'kbridge') || (b.id === 'patrol' && base === 'pcabin'));
  if (berth) {
    plate(g, east ? berth.twinName : berth.name, x0 + w / 2, y0 + h * (base === 'kbridge' ? 0.3 : 0.5), base === 'kbridge' ? 24 : 18, '#f2ecd8', '#2c3e57', '#d8d2b8');
  } else if (nm && !shipOfRoof(id)) {
    const size = Math.min(54, (w / Math.max(5, nm.length)) * 1.45);
    if (base === 'cafe') plate(g, nm, x0 + w / 2, y0 + h * 0.5, 30, '#fff4dc', '#7a2c20', '#f2ead6');
    else painted(g, nm, x0 + w / 2, y0 + h * 0.34, size, hexA('#d6d0bc', 0.4), 0, 0.16);
  }
}

export function drawHarborRoof(g: G, roof: MapRoof, alpha: number, info: GeoInfo): boolean {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const p of roof.points) { x0 = Math.min(x0, p.x); y0 = Math.min(y0, p.y); x1 = Math.max(x1, p.x); y1 = Math.max(y1, p.y); }
  const s = sprite(`roof:${roof.id}`, x1 - x0, y1 - y0 + 12, 6, (c) => { c.translate(0, 0); c.translate(-x0, -y0); paintRoof(c, roof, roof.id); });
  const ship = shipOfRoof(roof.id);
  const dy = ship ? bobOf(ship, info.now).dy : 0;
  // A faint shadow of the roof on whatever is below it, then the roof.
  g.save();
  g.fillStyle = 'rgba(8, 10, 14, 0.18)'; g.fillRect(x0 + 8, y0 + 12 + dy, x1 - x0, y1 - y0);
  g.restore();
  stamp(g, s, x0, y0 + dy);
  void alpha; void SIZE; void hash2;
  return true;
}

/* -- doors ------------------------------------------------------------------------------------------------------- */

const PAINT: Record<string, { top: string; front: string; trim: string }> = {
  metal: { top: '#9aa4b2', front: '#4a5361', trim: '#d6c14a' },
  wood: { top: '#a8743f', front: '#5a3a1e', trim: '#3a2614' },
  glass: { top: 'rgba(170,214,232,0.5)', front: 'rgba(90,130,150,0.45)', trim: '#c8d0d6' },
};

export function drawHarborDoor(g: G, door: MapDoor, leaves: readonly DoorLeaf[], open: number, info: GeoInfo): boolean {
  const p = PAINT[door.material] ?? PAINT.metal!;
  const h = door.axis === 'h';
  const x1 = door.x + (h ? door.w : 0), y1 = door.y + (h ? 0 : door.w);
  const t = door.thick ?? 12;
  // The light of the room it opens into spills out while it is open.
  if (door.glow && open > 0.05) {
    const cx = (door.x + x1) / 2, cy = (door.y + y1) / 2;
    setLight(`door:${info.map.name}:${door.id}`, { x: cx, y: cy, radius: 200, color: door.glow, intensity: 0.55 * open, size: 14, inside: 60 });
    g.save();
    g.globalCompositeOperation = 'lighter';
    const gr = g.createRadialGradient(cx, cy, 6, cx, cy, 130);
    gr.addColorStop(0, door.glow); gr.addColorStop(1, 'rgba(0,0,0,0)');
    g.globalAlpha = 0.16 * open * (1 - 0.6 * info.dark);
    g.fillStyle = gr; g.fillRect(cx - 130, cy - 130, 260, 260);
    g.restore();
  }
  // The threshold: a steel sill across the opening, and a warm spill when open.
  g.fillStyle = 'rgba(30,34,40,0.55)';
  if (h) g.fillRect(door.x, door.y - 5, door.w, 10); else g.fillRect(door.x - 5, door.y, 10, door.w);
  if (door.kind === 'slide' || door.kind === 'double-slide') {
    g.strokeStyle = 'rgba(10,12,18,0.55)'; g.lineWidth = 3;
    g.beginPath(); g.moveTo(door.x, door.y); g.lineTo(x1, y1); g.stroke();
  }
  const glass = door.material === 'glass';
  for (const leaf of leaves) {
    const pts = leaf.pts ? Array.from({ length: leaf.pts.length / 2 }, (_, i) => ({ x: leaf.pts![2 * i]!, y: leaf.pts![2 * i + 1]! })) : [{ x: leaf.x, y: leaf.y }, { x: leaf.x + leaf.w, y: leaf.y }, { x: leaf.x + leaf.w, y: leaf.y + leaf.h }, { x: leaf.x, y: leaf.y + leaf.h }];
    const hh = glass ? 10 : 22;
    // Front face under the south edge, then the top with a frame and its panels.
    let ax = Infinity, ay = Infinity, bx = -Infinity, by = -Infinity;
    for (const q of pts) { ax = Math.min(ax, q.x); ay = Math.min(ay, q.y); bx = Math.max(bx, q.x); by = Math.max(by, q.y); }
    g.fillStyle = p.front; g.fillRect(ax, by, bx - ax, hh);
    g.strokeStyle = INK; g.lineWidth = 2; g.strokeRect(ax, by, bx - ax, hh);
    g.beginPath(); g.moveTo(pts[0]!.x, pts[0]!.y);
    for (const q of pts.slice(1)) g.lineTo(q.x, q.y);
    g.closePath(); g.fillStyle = p.top; g.fill();
    g.save(); g.clip();
    g.strokeStyle = p.trim; g.lineWidth = 2;
    if (bx - ax > by - ay) { for (let x = ax + 12; x < bx - 6; x += 28) { g.beginPath(); g.moveTo(x, ay); g.lineTo(x, by); g.stroke(); } } else { for (let y = ay + 12; y < by - 6; y += 28) { g.beginPath(); g.moveTo(ax, y); g.lineTo(bx, y); g.stroke(); } }
    if (glass) { g.fillStyle = 'rgba(255,255,255,0.35)'; g.fillRect(ax, ay, bx - ax, Math.min(4, by - ay)); }
    g.restore();
    g.beginPath(); g.moveTo(pts[0]!.x, pts[0]!.y); for (const q of pts.slice(1)) g.lineTo(q.x, q.y); g.closePath(); g.strokeStyle = INK; g.lineWidth = 2; g.stroke();
  }
  // Posts at both ends, and a hinge pin on the swinging kinds.
  for (const [px, py] of [[door.x, door.y], [x1, y1]] as const) {
    g.fillStyle = '#5b616c'; g.fillRect(px - t / 2 - 2, py - t / 2 - 2, t + 4, t + 4); g.strokeStyle = INK; g.lineWidth = 2; g.strokeRect(px - t / 2 - 2, py - t / 2 - 2, t + 4, t + 4);
  }
  if (door.kind === 'swing' || door.kind === 'double-swing') { g.fillStyle = INK; for (const [hx, hy] of door.kind === 'double-swing' ? [[door.x, door.y], [x1, y1]] : [(door.hinge ?? 'start') === 'start' ? [door.x, door.y] : [x1, y1]]) { g.beginPath(); g.arc(hx!, hy!, 4, 0, TAU); g.fill(); } }
  void C;
  return true;
}
