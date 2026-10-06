import type { PerkId } from '../shared/defs.ts';

export const PERK_ICONS: Record<PerkId, string> = {
  optics: 'M4 12a8 8 0 1 0 16 0a8 8 0 1 0 -16 0M12 2v7M12 15v7M2 12h7M15 12h7',
  thermal: 'M7 21c-3-4 3-6 0-10s3-6 0-9M12 21c-3-4 3-6 0-10s3-6 0-9M17 21c-3-4 3-6 0-10s3-6 0-9',
  ghillie: 'M12 22V11M12 11C6 11 4 7 4 3c5 0 8 3 8 8zM12 15c5 0 8-3 8-8-5 0-8 3-8 8z',
  piercing: 'M2 12h17M14 7l5 5-5 5M9 4v16',
  extended: 'M8 2h8v6l2 14h-8L8 8zM9.5 7h5M10 11.5h6M10.5 16h6',
  grip: 'M3 6h18v5H3zM9 11l-1.5 10h4.5l1-10',
  silencer: 'M1 12h4M5 8h17v8H5zM10 8v8M14 8v8M18 8v8',
  lightweight: 'M21 3C11 3 5 9 4 21M21 3c0 9-6 13-13 13M9 11h7',
  longRange: 'M2 12h3M8 12h3M14 12h6M17 8l4 4-4 4',
  quickReload: 'M19 12a7 7 0 1 1-2.1-5M19 3v4h-4M12 8v4l2.5 2.5',
  choke: 'M2 7h9l6 3v4l-6 3H2zM20 10.5l2 1.5-2 1.5',
  shield: 'M12 2l8 3v7c0 5-4 9-8 10-4-1-8-5-8-10V5z',
  thickSkin: 'M3 7l9-4 9 4M3 12l9-4 9 4M3 17l9-4 9 4',
  firstAid: 'M4 4h16v16H4zM12 8v8M8 12h8',
  grenade: 'M6 15a6 6 0 1 0 12 0a6 6 0 1 0 -12 0M10 9V6h4v3M14 6l5-3',
  fragGrenade: 'M12 2v5M12 17v5M2 12h5M17 12h5M5 5l3.5 3.5M15.5 15.5L19 19M19 5l-3.5 3.5M8.5 15.5L5 19',
  gasGrenade: 'M7 19h10a4 4 0 0 0 0-8 5.5 5.5 0 0 0-10.5-1.5A4.5 4.5 0 0 0 7 19z',
  landMine: 'M3 18h18M5 18a7 7 0 0 1 14 0M12 8V4M7 10L5 7M17 10l2-3',
  knife: 'M3 21l5-5M7 17l-2-2M8 16L20 4c0 7-4 12-9 14z',
  engineer: 'M3 5h18v14H3zM3 12h18M10 5v7M15 12v7M7 12v7',
  dash: 'M2 8h6M1 12h9M2 16h6M12 5l7 7-7 7M16 5l7 7-7 7',
};

export const UI_ICONS = {
  heart: 'M12 21C5 15 2 12 2 8a5 5 0 0 1 10-1 5 5 0 0 1 10 1c0 4-3 7-10 13z',
  target: 'M5 12a7 7 0 1 0 14 0a7 7 0 1 0 -14 0M12 1v6M12 17v6M1 12h6M17 12h6',
  scrap: 'M4 7l8-4 8 4v10l-8 4-8-4zM4 7l8 4 8-4M12 11v10',
  core: 'M12 2l7 10-7 10-7-10z',
} as const;

const paths = new Map<string, Path2D>();

export function strokeIcon(ctx: CanvasRenderingContext2D, d: string, x: number, y: number, size: number, color: string, width = 2.2) {
  let path = paths.get(d);
  if (!path) paths.set(d, (path = new Path2D(d)));
  const k = size / 24;
  ctx.save();
  ctx.translate(x - size / 2, y - size / 2);
  ctx.scale(k, k);
  ctx.lineWidth = width;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.strokeStyle = color;
  ctx.stroke(path);
  ctx.restore();
}

const SVG_NS = 'http://www.w3.org/2000/svg';

export function iconSvg(d: string, className: string): SVGSVGElement {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('class', className);
  svg.setAttribute('aria-hidden', 'true');
  const path = document.createElementNS(SVG_NS, 'path');
  path.setAttribute('d', d);
  svg.append(path);
  return svg;
}
