import type { Snapshot } from '../shared/protocol.ts';
import { drawSoldier } from './bodies.ts';
import { seconds } from './derive.ts';
import { celebrationFor, newTracker, trackSnap, type Celebration, type Tracker } from './celebratedata.ts';
import { clipped, outlined } from './emotefx.ts';
import { INK, NIGHT, PALETTE, shade } from './palette.ts';
import { reducedMotion } from './screenfx.ts';

/**
 * The round-end celebration: a canvas layer over the whole page (the plain winner banner hides under it). Top three stand on a
 * toy podium in their own colours, confetti cannons go off in the winners' colour, fireworks bloom over the arena, MVP cards and
 * your placement stamp slam down. Rules from docs/art/STYLE.md: ink outlines, a top face and a darker front face on the podium,
 * the fire and spark ramps for fireworks (white-hot cores), team colour only for the winners' confetti, no beat longer than 1.2 s.
 */

const BONE = '#ece6d6', PLATE = '#3d4450', PLATE_LIT = '#4f5560', ORANGE = '#ff5a1f', GOLD = PALETTE.gold, MUTED = '#9a9ea6';
const FONT = (w: number, px: number) => `${w} ${Math.max(13, Math.round(px))}px "Barlow Condensed", "Arial Narrow", system-ui, sans-serif`;
const TAU = Math.PI * 2;
const easeOut = (k: number) => 1 - (1 - Math.min(1, Math.max(0, k))) ** 3;
const MAX_CONFETTI = 280;
const CANNON_AT = [0.25, 2.3, 5.0];
const FIREWORK_AT = [0.9, 1.5, 2.1, 2.8, 3.5, 4.2, 5.0, 5.8, 6.6];
/** The fire ramp: white-hot, pale amber, orange, rust, smoke. */
const FIRE = ['#fffbea', '#ffe08a', '#ff9a3c', '#d9541f', '#5a5550'];

type Piece = { x: number; y: number; vx: number; vy: number; rot: number; vr: number; w: number; h: number; color: string; flip: number; vf: number; age: number };
type Spark = { x: number; y: number; vx: number; vy: number; age: number; life: number; size: number };
type Shell = { at: number; x: number; y: number; burstY: number; fired: boolean };
type Glow = { x: number; y: number; r: number; age: number; life: number; color: string; alpha: number };

const rand = (a: number, b: number) => a + Math.random() * (b - a);

export function createCelebration(host: HTMLElement) {
  const canvas = document.createElement('canvas');
  canvas.className = 'celebrate';
  canvas.hidden = true;
  canvas.setAttribute('aria-hidden', 'true');
  host.append(canvas);
  const ctx = canvas.getContext('2d')!;

  let tracker: Tracker = newTracker();
  let cel: Celebration | null = null;
  let t0 = 0;
  let restartIn = 0;
  let restartAt = 0;
  let stampSub = '';
  let pieces: Piece[] = [];
  let sparks: Spark[] = [];
  let shells: Shell[] = [];
  let glows: Glow[] = [];
  let fired = new Set<number>();
  let recoil = [-1e9, -1e9];
  let raf = 0;
  let last = 0;
  let ended = false;
  const reduced = reducedMotion();

  const W = () => window.innerWidth, H = () => window.innerHeight;
  const scale = () => Math.min(1.8, Math.max(0.55, Math.min(W() / 1000, H() / 720)));

  function confetti(x: number, y: number, angle: number, spread: number, speed: number, n: number, colors: string[]) {
    for (let i = 0; i < n && pieces.length < MAX_CONFETTI; i++) {
      const a = angle + rand(-spread, spread), v = speed * rand(0.55, 1.1);
      pieces.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, rot: rand(0, TAU), vr: rand(-7, 7), w: rand(7, 12), h: rand(4, 7), color: colors[(Math.random() * colors.length) | 0]!, flip: rand(0, TAU), vf: rand(3, 8), age: 0 });
    }
  }

  function burst(x: number, y: number) {
    const ring = Math.random() < 0.4, n = 44;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * TAU + rand(-0.05, 0.05), v = ring ? 210 : rand(90, 260);
      sparks.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, age: 0, life: rand(0.8, 1.2), size: rand(1.8, 3) });
    }
    glows.push({ x, y, r: 70, age: 0, life: 0.26, color: FIRE[0]!, alpha: 0.9 }, { x, y, r: 280, age: 0, life: 0.6, color: '#ffb347', alpha: 0.2 });
  }

  function start(c: Celebration, now: number) {
    cel = c;
    t0 = now;
    ended = false;
    fired = new Set();
    shells = c.confetti && !reduced && c.kind !== 'zomLoss' ? FIREWORK_AT.map((at) => ({ at, x: rand(0.14, 0.86), y: 1, burstY: rand(0.1, 0.3), fired: false })) : [];
    canvas.hidden = false;
    document.body.classList.add('celebrating');
    schedule();
  }

  function stop() {
    cel = null;
    document.body.classList.remove('celebrating');
    shells = [];
  }

  function schedule() {
    if (raf) return;
    last = performance.now();
    raf = requestAnimationFrame(loop);
  }

  function loop(now: number) {
    raf = 0;
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    const w = W(), h = H(), dpr = Math.min(window.devicePixelRatio || 1, 2.5);
    if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) { canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr); }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    if (cel) update(now, dt, w, h);
    stepParticles(dt, h);
    if (cel) drawScene(now, w, h, dpr);
    drawLights();
    drawConfetti();
    if (cel || pieces.length || sparks.length || glows.length) schedule();
    else { canvas.hidden = true; }
  }

  function update(now: number, dt: number, w: number, h: number) {
    const t = (now - t0) / 1000;
    const u = scale();
    CANNON_AT.forEach((at, i) => {
      if (t < at || fired.has(i) || !cel?.confetti) return;
      fired.add(i);
      recoil = [now, now];
      const n = reduced ? 18 : 70;
      confetti(30 * u, h - 40 * u, -1.15, 0.3, 920 * u, n, cel.confetti);
      confetti(w - 30 * u, h - 40 * u, -Math.PI + 1.15, 0.3, 920 * u, n, cel.confetti);
      if (!reduced) for (const x of [30 * u, w - 30 * u]) glows.push({ x, y: h - 50 * u, r: 150 * u, age: 0, life: 0.15, color: '#ffb347', alpha: 0.5 });
    });
    for (const s of shells) if (!s.fired && t >= s.at) { s.fired = true; burst(s.x * w, s.burstY * h); }
    if (cel?.kind === 'zomLoss' && Math.random() < dt * 6) sparks.push({ x: rand(0, w), y: h + 6, vx: rand(-12, 12), vy: rand(-70, -40), age: 0, life: 3, size: 2 });
    if (!ended && restartAt && now > restartAt + 400) ended = true;
  }

  function stepParticles(dt: number, h: number) {
    for (const p of pieces) {
      p.age += dt;
      p.vy += 520 * dt;
      const drag = Math.exp(-2.2 * dt);
      p.vx *= drag;
      if (p.vy > 150) p.vy = 150 + (p.vy - 150) * Math.exp(-4 * dt);
      p.x += p.vx * dt + Math.sin(p.age * 3 + p.flip) * 20 * dt;
      p.y += p.vy * dt;
      p.rot += p.vr * dt;
      p.flip += (reduced ? 0 : p.vf) * dt;
    }
    pieces = pieces.filter((p) => p.y < h + 20);
    for (const s of sparks) {
      s.age += dt;
      s.vy += (cel?.kind === 'zomLoss' ? -10 : 150) * dt;
      s.vx *= Math.exp(-1.6 * dt);
      s.vy *= Math.exp(-1.6 * dt);
      s.x += s.vx * dt;
      s.y += s.vy * dt;
    }
    sparks = sparks.filter((s) => s.age < s.life);
    for (const g of glows) g.age += dt;
    glows = glows.filter((g) => g.age < g.life);
  }

  /** Practical lights: every flash and burst paints a short warm pool, additively. */
  function drawLights() {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (const g of glows) {
      const k = g.age / g.life, a = g.alpha * (1 - k) ** 2;
      const grad = ctx.createRadialGradient(g.x, g.y, 0, g.x, g.y, g.r * (0.6 + 0.4 * k));
      grad.addColorStop(0, g.color);
      grad.addColorStop(1, 'rgba(255, 179, 71, 0)');
      ctx.globalAlpha = a;
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(g.x, g.y, g.r, 0, TAU);
      ctx.fill();
    }
    for (const s of sparks) {
      const k = s.age / s.life;
      const color = FIRE[Math.min(FIRE.length - 1, Math.floor(k * FIRE.length * 0.95))]!;
      ctx.globalAlpha = Math.max(0, 1 - k * k);
      ctx.strokeStyle = color;
      ctx.lineCap = 'round';
      ctx.lineWidth = s.size * (1 - k * 0.5);
      ctx.beginPath();
      ctx.moveTo(s.x - s.vx * 0.045, s.y - s.vy * 0.045);
      ctx.lineTo(s.x, s.y);
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawConfetti() {
    ctx.lineJoin = 'round';
    for (const p of pieces) {
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);
      ctx.scale(1, Math.max(0.12, Math.abs(Math.cos(p.flip))));
      ctx.fillStyle = p.color;
      ctx.strokeStyle = INK;
      ctx.lineWidth = 1.25;
      ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
      ctx.strokeRect(-p.w / 2, -p.h / 2, p.w, p.h);
      ctx.restore();
    }
  }

  const stage = (t: number, delay: number, dur: number) => (reduced ? 1 : easeOut((t - delay) / dur));

  function plate(x: number, y: number, w: number, h: number, cut: number, lit = true) {
    ctx.fillStyle = 'rgba(20, 24, 32, 0.3)';
    clipped(ctx, x + 3, y + 3, w, h, cut);
    ctx.fill();
    clipped(ctx, x, y, w, h, cut);
    outlined(ctx, PLATE);
    if (lit) {
      ctx.save();
      clipped(ctx, x, y, w, h, cut);
      ctx.clip();
      ctx.fillStyle = PLATE_LIT;
      ctx.fillRect(x, y, w, Math.max(4, h * 0.14));
      ctx.restore();
    }
    ctx.beginPath();
    ctx.moveTo(x + 3, y + 14);
    ctx.lineTo(x + 3, y + 3);
    ctx.lineTo(x + 14, y + 3);
    ctx.lineWidth = 3;
    ctx.lineCap = 'butt';
    ctx.strokeStyle = ORANGE;
    ctx.stroke();
  }

  function text(s: string, x: number, y: number, font: string, color: string, align: CanvasTextAlign = 'center', baseline: CanvasTextBaseline = 'middle') {
    ctx.font = font;
    ctx.textAlign = align;
    ctx.textBaseline = baseline;
    ctx.fillStyle = color;
    ctx.fillText(s, x, y);
  }

  function drawScene(now: number, w: number, h: number, dpr: number) {
    const c = cel!;
    const t = (now - t0) / 1000;
    const u = scale();
    const win = c.kind !== 'zomLoss';
    // The scrim: gunmetal over the arena, cool night steel for a defeat, a dawn glow low on the horizon for a held Bastion.
    ctx.globalAlpha = stage(t, 0, 0.4) * (win ? 0.55 : 0.68);
    ctx.fillStyle = win ? '#15171b' : NIGHT.shade;
    ctx.fillRect(0, 0, w, h);
    ctx.globalAlpha = 1;
    if (c.kind === 'zomWin') {
      const g = ctx.createRadialGradient(w / 2, h * 1.02, 0, w / 2, h * 1.02, h * 0.95);
      g.addColorStop(0, 'rgba(255, 179, 71, 0.5)');
      g.addColorStop(1, 'rgba(255, 179, 71, 0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
    }

    // The podium: top face in the soldier's colour, a darker front face below its south edge, ink outlines, cel steps.
    const baseY = h * 0.6, bw = 150 * u, depth = 28 * u;
    const heights = [118 * u, 86 * u, 60 * u];
    const slots = [{ rank: 0, x: w / 2 }, { rank: 1, x: w / 2 - bw * 1.14 }, { rank: 2, x: w / 2 + bw * 1.14 }];
    for (const slot of [slots[1]!, slots[2]!, slots[0]!]) {
      const s = c.podium[slot.rank];
      if (!s) continue;
      const rise = stage(t, [0.5, 0.15, 0.3][slot.rank]!, 0.5);
      const hh = heights[slot.rank]! * rise;
      const x = slot.x - bw / 2, top = baseY - hh;
      ctx.fillStyle = 'rgba(20, 24, 32, 0.3)';
      ctx.fillRect(x + 8, baseY - 2, bw, 10 * u);
      // front face
      ctx.beginPath(); ctx.rect(x, top, bw, hh); outlined(ctx, shade(s.color, 0.62));
      ctx.fillStyle = 'rgba(0,0,0,0.18)'; ctx.fillRect(x + bw * 0.7, top + 1, bw * 0.3 - 1, hh - 2);
      if (rise > 0.6) text(String(slot.rank + 1), x + bw / 2, top + hh * 0.52, FONT(800, 58 * u * Math.min(1, hh / (60 * u))), slot.rank === 0 ? GOLD : BONE);
      // top face
      ctx.beginPath(); ctx.rect(x, top - depth, bw, depth); outlined(ctx, s.color);
      ctx.fillStyle = 'rgba(255,255,255,0.24)'; ctx.fillRect(x + 1, top - depth + 1, bw - 2, 5 * u);
      ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.fillRect(x + bw * 0.78, top - depth + 6 * u, bw * 0.22 - 1, depth - 7 * u);
      // the soldier: squash, snap, settle as they land
      const land = [0.95, 0.6, 0.78][slot.rank]!;
      const k = (t - land) / 0.4;
      if (k > 0) {
        const pop = reduced ? 1 : k < 0.25 ? 1 - 0.12 * (k / 0.25) : k < 0.55 ? 0.88 + 0.28 * easeOut((k - 0.25) / 0.3) : 1.16 - 0.16 * easeOut((k - 0.55) / 0.45);
        const R = Math.round(30 * u);
        const bounce = reduced || !win ? 0 : Math.abs(Math.sin(t * 3.4 + slot.rank)) * R * (slot.rank === 0 ? 0.2 : 0.1);
        const swing = reduced ? 0 : Math.sin(t * 7.5 + slot.rank);
        const up = (side: number, extra = 0) => ({ x: -R * (1.45 + extra), y: side * R * 0.95 });
        const hands: [{ x: number; y: number }, { x: number; y: number }] = !win
          ? [{ x: R * 0.5, y: R * 0.8 }, { x: R * 0.5, y: -R * 0.8 }]
          : slot.rank === 0 ? [up(1, swing * 0.18), up(-1, -swing * 0.18)]
          : slot.rank === 1 ? [up(1, swing * 0.12), { x: R * 0.1, y: -R * 0.95 }]
          : [{ x: -R * 0.35, y: R * 0.32 }, { x: -R * 0.35, y: -R * 0.32 }];
        ctx.save();
        ctx.translate(slot.x, top - depth * 0.45 - bounce);
        ctx.scale(1 + (1 - pop) * 0.6, pop);
        drawSoldier(ctx, s.color, 0, 0, R, { angle: Math.PI / 2, armor: s.armor, hands, jump: 0, flash: 0 }, dpr);
        ctx.restore();
      }
      // name plate under the block
      const labelA = stage(t, 0.9, 0.3);
      if (labelA > 0) {
        ctx.globalAlpha = labelA;
        const pw = bw, ph = 46 * u, py = baseY + 16 * u;
        plate(slot.x - pw / 2, py, pw, ph, 7, false);
        ctx.beginPath(); ctx.arc(slot.x - pw / 2 + 16, py + ph * 0.36, 5.5, 0, TAU); outlined(ctx, s.color, 1.5);
        text(s.name, slot.x - pw / 2 + 26, py + ph * 0.36, FONT(800, 20 * u), BONE, 'left');
        text(`${s.kills} ${c.kind === 'ffa' || c.kind === 'team' ? 'KILLS' : 'KILLS'}`, slot.x, py + ph * 0.74, FONT(700, 14 * u), MUTED);
        ctx.globalAlpha = 1;
      }
    }

    // Title plate, dropping in.
    let titleBottom = 0;
    {
      const k = stage(t, 0, 0.35);
      ctx.font = FONT(800, 44 * u);
      const tw = ctx.measureText(c.title).width;
      ctx.font = FONT(600, 19 * u);
      const sw = c.sub ? ctx.measureText(c.sub).width : 0;
      const pw = Math.min(w - 24, Math.max(tw + 70 * u, sw + 50 * u, 300 * u)), ph = (c.sub ? 92 : 66) * u;
      const px = w / 2 - pw / 2, py = 28 * u - (1 - k) * 90 * u;
      plate(px, py, pw, ph, 12);
      titleBottom = 28 * u + ph;
      text(c.title, w / 2, py + 34 * u, FONT(800, 44 * u), c.kind === 'zomLoss' ? PALETTE.hunted : BONE);
      if (c.sub) text(c.sub, w / 2, py + 72 * u, FONT(600, 19 * u), MUTED);
    }

    // Next round, top right.
    if (restartIn > 0) {
      const left = seconds(restartIn - (now - restartAt));
      const label = `NEXT ROUND ${left}`;
      ctx.font = FONT(800, 16 * u);
      const pw = ctx.measureText(label).width + 30, ph = 30 * u + 4;
      plate(w / 2 - pw / 2, titleBottom + 12, pw, ph, 7, false);
      text(label, w / 2, titleBottom + 12 + ph / 2 + 1, FONT(800, 16 * u), BONE);
    }

    // Your placement, stamped: ease in hard, then settle.
    {
      const k = (t - 1.4) / 0.26;
      if (k > 0 || reduced) {
        const kk = reduced ? 1 : Math.min(1, k);
        const s = 1 + 1.3 * (1 - easeOut(kk)) ** 2 + (kk > 0.8 ? 0.04 * Math.sin((kk - 0.8) * 5 * Math.PI) : 0);
        const px = Math.max(110 * u, Math.min(w * 0.17, w / 2 - bw * 1.9));
        const py = h * 0.4;
        ctx.save();
        ctx.translate(px, py);
        ctx.rotate(-0.12);
        ctx.scale(s, s);
        ctx.globalAlpha = Math.min(1, kk * 3);
        ctx.font = FONT(800, 78 * u);
        const sw = Math.max(ctx.measureText(c.stamp.text).width + 44 * u, 150 * u), sh = 108 * u;
        const ink = c.stamp.top3 ? GOLD : BONE;
        ctx.fillStyle = 'rgba(20, 24, 32, 0.3)';
        ctx.fillRect(-sw / 2 + 5, -sh / 2 + 5, sw, sh);
        ctx.fillStyle = 'rgba(21, 23, 27, 0.9)';
        ctx.fillRect(-sw / 2, -sh / 2, sw, sh);
        ctx.lineWidth = 2; ctx.strokeStyle = INK; ctx.strokeRect(-sw / 2 - 2, -sh / 2 - 2, sw + 4, sh + 4);
        ctx.lineWidth = 4; ctx.strokeStyle = ink; ctx.strokeRect(-sw / 2 + 4, -sh / 2 + 4, sw - 8, sh - 8);
        text(c.stamp.text, 0, -sh * 0.08, FONT(800, 78 * u), ink);
        if (c.stamp.sub) text(c.stamp.sub, 0, sh * 0.34, FONT(700, 20 * u), MUTED);
        ctx.restore();
      }
    }

    // MVP cards, sliding up one after another.
    const gap = 12 * u, cw = Math.min(215 * u, (w - 28 - gap * 3) / 4), ch = 76 * u;
    const cx0 = w / 2 - (cw * 4 + gap * 3) / 2;
    c.cards.forEach((card, i) => {
      const k = stage(t, 1.9 + i * 0.14, 0.3);
      if (k <= 0) return;
      const x = cx0 + i * (cw + gap), y = h - ch - 14 * u + (1 - k) * 40 * u;
      ctx.globalAlpha = k;
      plate(x, y, cw, ch, 9);
      text(card.label, x + 14, y + 17 * u, FONT(800, 13 * u), MUTED, 'left');
      text(card.value, x + 14, y + 44 * u, FONT(800, 36 * u), card.label === 'LONGEST SHOT' || card.label === 'MOST MEDALS' ? GOLD : BONE, 'left');
      if (card.color) { ctx.beginPath(); ctx.arc(x + cw - 18, y + 20 * u, 5.5, 0, TAU); outlined(ctx, card.color, 1.5); }
      ctx.save();
      ctx.beginPath(); ctx.rect(x + 10, y, cw - 20, ch); ctx.clip();
      text(card.who, x + cw - 14, y + 62 * u, FONT(700, 15 * u), BONE, 'right');
      ctx.restore();
      ctx.globalAlpha = 1;
    });

    // The cannons at the corners.
    if (win && c.confetti) {
      for (const side of [-1, 1]) {
        const base = { x: side < 0 ? 30 * u : w - 30 * u, y: h - 20 * u };
        const kick = reduced ? 0 : Math.max(0, 1 - (now - recoil[0]!) / 220) * 8 * u;
        ctx.save();
        ctx.translate(base.x, base.y);
        ctx.scale(side * -1, 1);
        ctx.rotate(-1.15 + (side < 0 ? 0 : 0));
        ctx.translate(-kick, 0);
        ctx.beginPath(); ctx.roundRect(-8 * u, -13 * u, 66 * u, 26 * u, 6); outlined(ctx, PLATE);
        ctx.fillStyle = PLATE_LIT; ctx.fillRect(-6 * u, -11 * u, 62 * u, 6 * u);
        ctx.beginPath(); ctx.roundRect(54 * u, -17 * u, 14 * u, 34 * u, 4); outlined(ctx, '#7d8693');
        ctx.restore();
        ctx.beginPath(); ctx.arc(base.x - side * 2 * u, base.y + 4 * u, 14 * u, 0, TAU); outlined(ctx, '#33312d');
        ctx.beginPath(); ctx.arc(base.x - side * 2 * u, base.y + 4 * u, 4 * u, 0, TAU); outlined(ctx, '#7d8693', 1.5);
      }
    }
  }

  return {
    onSnap(snap: Snapshot, now: number) {
      tracker = trackSnap(tracker, snap);
      const c = celebrationFor(snap, tracker);
      if (c && !cel) start(c, now);
      else if (!c && cel) stop();
      if (c && cel) {
        cel = { ...cel, stamp: c.stamp, cards: c.cards, podium: c.podium };
        const left = snap.match.restartIn;
        if (left !== restartIn) { restartIn = left; restartAt = now; }
      }
    },
    /** A small cannon-burst of confetti from a screen point, in `color`: the 100th career kill, an anniversary. */
    puff(x: number, y: number, color: string) {
      const u = scale();
      confetti(x, y, -Math.PI / 2, 0.9, 520 * u, reduced ? 14 : 46, [color, color, BONE, shade(color, 1.2)]);
      canvas.hidden = false;
      schedule();
    },
    /** Dev hook (?dev): plays the celebration from made-up data. */
    demo(c: Celebration, restartInMs = 8000) {
      if (cel) stop();
      pieces = []; sparks = []; glows = [];
      restartIn = restartInMs;
      restartAt = performance.now();
      start(c, performance.now());
    },
    reset() { stop(); pieces = []; sparks = []; glows = []; tracker = newTracker(); },
  };
}
