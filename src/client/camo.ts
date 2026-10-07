import { hash32, seeded } from '../shared/cosmetics.ts';
import { TAU } from './cel.ts';
import { INK } from './palette.ts';

/**
 * Torso patterns for the `c_` cosmetics, printed on the soldier's chest and shoulders. Each is painted once into the torso sprite
 * (bodies.ts caches one per colour, camo, armor and angle bucket), clipped to a face a little inside the torso so a rim of the
 * player's colour always shows, and then given the same two cel steps as the paint under it. Fixed catalog colours go over the
 * player's own colour; their blobs and stripes are sparse enough that the team still reads at a glance, and the arms, pauldrons,
 * helmet and ring under the feet keep it too. Every catalog id has a pattern here (test/client-cosmetics.test.ts).
 */
export type CamoKit = {
  g: CanvasRenderingContext2D;
  /** The torso's half-width (along the aim) and half-height (across the shoulders), in px, with the origin at its centre. */
  W: number; H: number; R: number;
  rnd: () => number;
  color: string;
};
type Paint = (k: CamoKit) => void;

const OLIVE = '#6c7356', KHAKI = '#b4a07a', BONE = '#e2dccb', RUST = '#a8552e', GOLD = '#ffd34d', MINT = '#8ff0c4', STEEL = '#26304a';
const RED = '#e8433a', BLUE = '#3a7be8', GUNMETAL = '#4f5560';

/** A rough blob of radius about `r` at (x, y): seven jittered points joined by curves. */
function blob(g: CanvasRenderingContext2D, rnd: () => number, x: number, y: number, r: number) {
  const n = 7, rot = rnd() * TAU, pts: [number, number][] = [];
  for (let i = 0; i < n; i++) { const a = rot + (i * TAU) / n, rr = r * (0.65 + rnd() * 0.5); pts.push([x + Math.cos(a) * rr * 1.15, y + Math.sin(a) * rr * 0.85]); }
  g.beginPath();
  const mid = (a: [number, number], b: [number, number]): [number, number] => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
  const start = mid(pts[n - 1]!, pts[0]!);
  g.moveTo(start[0], start[1]);
  for (let i = 0; i < n; i++) { const m = mid(pts[i]!, pts[(i + 1) % n]!); g.quadraticCurveTo(pts[i]![0], pts[i]![1], m[0], m[1]); }
  g.closePath();
}

const scatter = (k: CamoKit, colors: readonly string[], n: number, rMin: number, rMax: number) => {
  const { g, rnd, W, H, R } = k;
  for (let i = 0; i < n; i++) {
    g.fillStyle = colors[i % colors.length]!;
    blob(g, rnd, (rnd() * 2 - 1) * W * 1.1, (rnd() * 2 - 1) * H * 0.95, (rMin + rnd() * (rMax - rMin)) * R);
    g.fill();
  }
};

const rectAt = (g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, rot: number) => {
  g.save();
  g.translate(x, y);
  g.rotate(rot);
  g.fillRect(-w / 2, -h / 2, w, h);
  g.restore();
};

function star4(g: CanvasRenderingContext2D, x: number, y: number, r: number) {
  g.beginPath();
  g.moveTo(x, y - r);
  g.quadraticCurveTo(x, y, x + r, y);
  g.quadraticCurveTo(x, y, x, y + r);
  g.quadraticCurveTo(x, y, x - r, y);
  g.quadraticCurveTo(x, y, x, y - r);
  g.fill();
}

export const CAMOS: Record<string, Paint> = {
  c_plain: () => {},

  c_woodland(k) { scatter(k, ['#3f4a30', OLIVE, '#3f4a30', RUST, OLIVE], 11, 0.14, 0.25); },

  c_desert(k) {
    scatter(k, [KHAKI, '#8a7650', KHAKI], 9, 0.16, 0.28);
    const { g, rnd, W, H, R } = k;
    g.fillStyle = '#6b5a3a';
    for (let i = 0; i < 8; i++) g.fillRect((rnd() * 2 - 1) * W, (rnd() * 2 - 1) * H * 0.9, R * 0.07, R * 0.07);
  },

  c_urban(k) {
    const { g, rnd, W, H, R } = k;
    const cols = [GUNMETAL, '#3d4450', '#6b7280', '#3d4450'];
    for (let i = 0; i < 11; i++) {
      g.fillStyle = cols[i % cols.length]!;
      rectAt(g, (rnd() * 2 - 1) * W, (rnd() * 2 - 1) * H * 0.95, (0.14 + rnd() * 0.18) * R, (0.1 + rnd() * 0.16) * R, Math.round(rnd() * 3) * (Math.PI / 12));
    }
  },

  c_tiger(k) {
    const { g, rnd, W, H, R } = k;
    g.lineCap = 'round';
    for (let i = 0; i < 6; i++) {
      const x = -W * 1.2 + ((i + 0.5) * 2.4 * W) / 6;
      const bend = (rnd() - 0.5) * 0.5 * R;
      g.strokeStyle = i % 2 ? RUST : INK;
      g.lineWidth = (i % 2 ? 0.09 : 0.13) * R;
      g.beginPath();
      g.moveTo(x - 0.1 * R, -H);
      g.quadraticCurveTo(x + bend, 0, x + 0.12 * R, H);
      g.stroke();
    }
    g.fillStyle = OLIVE;
    for (let i = 0; i < 4; i++) { blob(g, rnd, (rnd() * 2 - 1) * W, (rnd() * 2 - 1) * H * 0.8, 0.1 * R); g.fill(); }
  },

  c_digital(k) {
    const { g, rnd, W, H, R } = k;
    const s = 0.17 * R, cols = [GUNMETAL, OLIVE, KHAKI, '#3d4450'];
    for (let x = -W * 1.2; x < W * 1.2; x += s) {
      for (let y = -H * 1.1; y < H * 1.1; y += s) {
        if (rnd() < 0.5) continue;
        g.fillStyle = cols[Math.floor(rnd() * cols.length)]!;
        g.fillRect(x, y, s, s);
      }
    }
  },

  c_arctic(k) { scatter(k, [BONE, '#9fb3c8', BONE, '#9fb3c8'], 9, 0.16, 0.28); },

  c_hazard(k) {
    const { g, W, H, R } = k;
    g.save();
    g.rotate(-Math.PI / 4);
    const span = Math.max(W, H) * 1.6, step = 0.2 * R;
    let i = 0;
    for (let d = -span; d < span; d += step, i++) {
      g.fillStyle = i % 2 ? INK : GOLD;
      g.fillRect(d, -span, step, span * 2);
    }
    g.restore();
  },

  c_polka(k) {
    const { g, W, H, R } = k;
    const s = 0.3 * R;
    let row = 0;
    for (let y = -H * 1.1; y < H * 1.1; y += s * 0.86, row++) {
      for (let x = -W * 1.2 + (row % 2 ? s / 2 : 0); x < W * 1.2; x += s) {
        g.fillStyle = BONE;
        g.beginPath();
        g.arc(x, y, 0.105 * R, 0, TAU);
        g.fill();
        g.fillStyle = RED;
        g.beginPath();
        g.arc(x, y, 0.045 * R, 0, TAU);
        g.fill();
      }
    }
  },

  // Three chunky blocks, each with its own ink edge, like pieces fresh out of the box.
  c_toybox(k) {
    const { g, W, H, R } = k;
    g.lineJoin = 'round';
    g.lineWidth = 0.07 * R;
    g.strokeStyle = INK;
    g.fillStyle = RED;
    g.beginPath(); g.rect(-W * 0.9, -H * 0.62, 0.34 * R, 0.34 * R); g.fill(); g.stroke();
    g.fillStyle = BLUE;
    g.beginPath(); g.arc(W * 0.35, -H * 0.1, 0.19 * R, 0, TAU); g.fill(); g.stroke();
    g.fillStyle = GOLD;
    g.beginPath(); g.moveTo(-W * 0.35, H * 0.28); g.lineTo(-W * 0.35 + 0.38 * R, H * 0.28); g.lineTo(-W * 0.35 + 0.19 * R, H * 0.28 + 0.34 * R); g.closePath(); g.fill(); g.stroke();
    g.fillStyle = RED;
    g.beginPath(); g.arc(W * 0.55, H * 0.6, 0.11 * R, 0, TAU); g.fill(); g.stroke();
  },

  // Coal-dark weave with cracks glowing from inside: the cracks are light, so they carry no outline.
  c_ember(k) {
    const { g, rnd, W, H, R } = k;
    g.fillStyle = 'rgba(28, 31, 38, 0.82)';
    g.fillRect(-W * 1.3, -H * 1.1, W * 2.6, H * 2.2);
    g.strokeStyle = 'rgba(80, 40, 28, 0.55)';
    g.lineWidth = 0.05 * R;
    g.beginPath();
    for (let d = -H * 2; d < H * 2; d += 0.2 * R) { g.moveTo(-W * 1.3, d); g.lineTo(W * 1.3, d + W * 2.6); g.moveTo(-W * 1.3, d + W * 2.6); g.lineTo(W * 1.3, d); }
    g.stroke();
    g.lineCap = 'round';
    g.lineJoin = 'round';
    for (const [col, w] of [['#d9541f', 0.085], ['#ff9a3c', 0.045], ['#ffe08a', 0.02]] as const) {
      g.strokeStyle = col;
      g.lineWidth = w * R;
      const r2 = seeded(7);
      for (let c = 0; c < 4; c++) {
        let x = -W * 1.1 + c * W * 0.6, y = -H * 0.9 + r2() * H * 0.4;
        g.beginPath();
        g.moveTo(x, y);
        for (let s = 0; s < 6; s++) { x += (r2() - 0.4) * 0.34 * R; y += (0.2 + r2() * 0.22) * R; g.lineTo(x, y); }
        g.stroke();
      }
    }
    void rnd;
  },

  c_goldleaf(k) {
    const { g, rnd, W, H, R } = k;
    g.fillStyle = '#e2b838';
    g.fillRect(-W * 1.3, -H * 1.1, W * 2.6, H * 2.2);
    const cols = ['#ffe08a', '#b8860b', '#ffd34d', '#fff1a8'];
    for (let i = 0; i < 22; i++) {
      g.fillStyle = cols[i % cols.length]!;
      const x = (rnd() * 2 - 1) * W * 1.1, y = (rnd() * 2 - 1) * H, s = (0.07 + rnd() * 0.1) * R, a = rnd() * TAU;
      g.beginPath();
      g.moveTo(x + Math.cos(a) * s, y + Math.sin(a) * s);
      g.lineTo(x + Math.cos(a + 2.2) * s * 0.9, y + Math.sin(a + 2.2) * s * 0.9);
      g.lineTo(x + Math.cos(a + 3.9) * s * 0.8, y + Math.sin(a + 3.9) * s * 0.8);
      g.closePath();
      g.fill();
    }
  },

  c_galaxy(k) {
    const { g, rnd, W, H, R } = k;
    g.fillStyle = STEEL;
    g.fillRect(-W * 1.3, -H * 1.1, W * 2.6, H * 2.2);
    for (const [col, ox, oy, rx, ry, a] of [['rgba(122, 90, 232, 0.7)', -0.2, -0.25, 0.9, 0.5, 0.5], ['rgba(232, 90, 200, 0.5)', 0.25, 0.3, 0.8, 0.42, -0.4], ['rgba(122, 90, 232, 0.5)', 0.3, -0.5, 0.5, 0.3, 0.1]] as const) {
      g.fillStyle = col;
      g.beginPath();
      g.ellipse(ox * W, oy * H, rx * W, ry * H * 0.7, a, 0, TAU);
      g.fill();
    }
    g.fillStyle = BONE;
    for (let i = 0; i < 16; i++) { const s = (0.035 + rnd() * 0.035) * R; g.fillRect((rnd() * 2 - 1) * W, (rnd() * 2 - 1) * H * 0.95, s, s); }
    for (const [x, y] of [[-0.5, -0.4], [0.45, 0.2], [-0.1, 0.55]] as const) star4(g, x * W, y * H, 0.14 * R);
  },

  // Khaki canvas worn smooth, with a stitched rust patch, a rank chevron and a few scuffs.
  c_oldguard(k) {
    const { g, rnd, W, H, R } = k;
    g.fillStyle = 'rgba(180, 160, 122, 0.62)';
    g.fillRect(-W * 1.3, -H * 1.1, W * 2.6, H * 2.2);
    g.fillStyle = RUST;
    rectAt(g, -W * 0.35, -H * 0.4, 0.42 * R, 0.5 * R, 0.12);
    g.setLineDash([0.06 * R, 0.05 * R]);
    g.strokeStyle = BONE;
    g.lineWidth = 0.035 * R;
    g.save();
    g.translate(-W * 0.35, -H * 0.4);
    g.rotate(0.12);
    g.strokeRect(-0.17 * R, -0.22 * R, 0.34 * R, 0.44 * R);
    g.restore();
    g.setLineDash([]);
    g.strokeStyle = INK;
    g.lineWidth = 0.09 * R;
    g.lineCap = 'round';
    g.lineJoin = 'round';
    g.beginPath();
    g.moveTo(W * 0.1, H * 0.3); g.lineTo(W * 0.5, H * 0.45); g.lineTo(W * 0.1, H * 0.6);
    g.moveTo(W * 0.4, H * 0.3); g.lineTo(W * 0.8, H * 0.45); g.lineTo(W * 0.4, H * 0.6);
    g.stroke();
    g.fillStyle = 'rgba(28, 31, 38, 0.35)';
    for (let i = 0; i < 6; i++) rectAt(g, (rnd() * 2 - 1) * W, (rnd() * 2 - 1) * H, 0.12 * R, 0.04 * R, rnd() * 3);
  },

  c_confetti(k) {
    const { g, rnd, W, H, R } = k;
    const cols = [RED, BLUE, GOLD, MINT];
    for (let i = 0; i < 46; i++) { g.fillStyle = cols[i % 4]!; rectAt(g, (rnd() * 2 - 1) * W * 1.1, (rnd() * 2 - 1) * H, (0.07 + rnd() * 0.07) * R, (0.04 + rnd() * 0.04) * R, rnd() * TAU); }
  },
};

export const CAMO_IDS: readonly string[] = Object.keys(CAMOS);

/** A camo pattern's overall coverage: how much of the torso it paints over, 0..1, for the cel overlay's strength. */
export const CAMO_COVER: Record<string, number> = { c_ember: 0.9, c_goldleaf: 0.95, c_galaxy: 0.95, c_oldguard: 0.7, c_hazard: 1, c_plain: 0 };

/** Paints camo `id` into a clipped torso face. The pattern is the same for every colour, angle and scale, seeded by its id. */
export function paintCamo(id: string, k: Omit<CamoKit, 'rnd'>) {
  const paint = CAMOS[id];
  if (!paint || id === 'c_plain') return;
  paint({ ...k, rnd: seeded(hash32(id)) });
}
