import { RING, ZOM, type ColorId } from '../shared/defs.ts';
import { ringAt, type PlayerView, type RoyaleResult, type RoyaleView, type Snapshot } from '../shared/protocol.ts';
import { clock } from './derive.ts';
import { TEAM_COLORS } from './palette.ts';

type Point = { x: number; y: number };

export const RING_LOOK = { storm: '#4b2f86', stormAlpha: 0.2, edge: '#b48cff', next: 'rgba(255, 255, 255, 0.75)', drop: '#ffd34d' } as const;

export const squadLabel = (team: ColorId) => `${team[0]!.toUpperCase()}${team.slice(1)} squad`;

/** `Ring closes in 0:24` while it waits, `Ring closing · 0:12` while it moves, `Final circle` once it is shut. */
export function ringLine(royale: Pick<RoyaleView, 'ring'>, serverNow: number): string {
  const { ring } = royale;
  if (ring.phase >= RING.length) return 'Final circle';
  if (serverNow < ring.shrinkAt) return `Ring closes in ${clock(ring.shrinkAt - serverNow)}`;
  return `Ring closing · ${clock(ring.closeAt - serverNow)}`;
}

/** The pill's two halves: the phase, and the time to its next move. */
export function ringPill(royale: Pick<RoyaleView, 'ring'>, serverNow: number): { label: string; time: string } {
  const { ring } = royale;
  if (ring.phase >= RING.length) return { label: 'FINAL', time: '' };
  const until = serverNow < ring.shrinkAt ? ring.shrinkAt : ring.closeAt;
  return { label: `RING ${ring.phase + 1}/${RING.length}`, time: clock(until - serverNow) };
}

export const outsideRing = (royale: Pick<RoyaleView, 'ring'>, at: Point, serverNow: number): boolean => {
  const c = ringAt(royale.ring, serverNow);
  return Math.hypot(at.x - c.x, at.y - c.y) > c.r;
};

export const resultTitle = (r: RoyaleResult) => (r.place === 1 ? '#1 · Last squad standing' : `#${r.place} of ${r.of}`);

const nameOf = (snap: Snapshot, id: number | null) =>
  id === null ? null : snap.players.find((p) => p.id === id)?.name ?? snap.leaderboard.find((r) => r.id === id)?.name ?? null;

/** What a dead player's screen says: whom the camera follows, and whether and when they come back. */
export function spectateLines(snap: Snapshot, royale: RoyaleView, serverNow: number): { title: string; sub: string } {
  const watched = nameOf(snap, royale.watch);
  const title = watched ? `Watching ${watched}` : 'Spectating';
  if (royale.redeployAt !== null) return { title, sub: `Redeploy beside your squad in ${clock(royale.redeployAt - serverNow)}` };
  if (royale.result) return { title, sub: `Your squad finished ${resultTitle(royale.result)}` };
  const me = snap.players.find((p) => p.id === snap.self.id);
  return { title, sub: me?.team ? 'Last lives: no redeploy this match' : 'You join a squad when the next match starts' };
}

/** The squadmate a held E would revive, by the rule the server follows. */
export function reviveHint(snap: Snapshot, me: PlayerView | null): string | null {
  if (!me?.alive || !snap.royale) return null;
  const mate = snap.players.find((p) => p.id !== me.id && p.team === me.team && p.downed && Math.hypot(p.x - me.x, p.y - me.y) <= ZOM.reviveRange);
  return mate ? `Hold E to revive ${mate.name}` : null;
}

/** The safe circle and the next one, with the storm shading everything outside, drawn in world space over the visible rect. */
export function drawRingWorld(ctx: CanvasRenderingContext2D, royale: RoyaleView, serverNow: number, tl: Point, br: Point) {
  const c = ringAt(royale.ring, serverNow);
  ctx.save();
  ctx.beginPath();
  ctx.rect(tl.x, tl.y, br.x - tl.x, br.y - tl.y);
  ctx.arc(c.x, c.y, Math.max(0, c.r), 0, Math.PI * 2, true);
  ctx.globalAlpha = RING_LOOK.stormAlpha;
  ctx.fillStyle = RING_LOOK.storm;
  ctx.fill('evenodd');
  ctx.globalAlpha = 0.85;
  ctx.lineWidth = 6;
  ctx.strokeStyle = RING_LOOK.edge;
  ctx.beginPath();
  ctx.arc(c.x, c.y, Math.max(0, c.r), 0, Math.PI * 2);
  ctx.stroke();
  const next = royale.ring.to;
  if (royale.ring.phase < RING.length && next.r < c.r) {
    ctx.globalAlpha = 0.7;
    ctx.lineWidth = 3;
    ctx.setLineDash([24, 18]);
    ctx.strokeStyle = RING_LOOK.next;
    ctx.beginPath();
    ctx.arc(next.x, next.y, Math.max(1, next.r), 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.restore();
}

/** An incoming drop pulses where it will land and counts down; a landed one wears a gold frame over its crate. */
export function drawDropsWorld(ctx: CanvasRenderingContext2D, royale: RoyaleView, serverNow: number, now: number, size: number) {
  for (const d of royale.drops) {
    ctx.save();
    ctx.strokeStyle = RING_LOOK.drop;
    if (d.landsAt > serverNow) {
      const pulse = 0.5 + 0.5 * Math.sin(now / 180);
      ctx.globalAlpha = 0.55 + 0.35 * pulse;
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.arc(d.x, d.y, size * (0.8 + 0.25 * pulse), 0, Math.PI * 2);
      ctx.stroke();
      ctx.globalAlpha = 0.95;
      ctx.font = '800 22px system-ui, -apple-system, "Segoe UI", sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = RING_LOOK.drop;
      ctx.fillText(String(Math.ceil((d.landsAt - serverNow) / 1000)), d.x, d.y);
    } else {
      ctx.lineWidth = 3;
      ctx.strokeRect(d.x - size / 2 - 4, d.y - size / 2 - 4, size + 8, size + 8);
    }
    ctx.restore();
  }
}

/** The minimap's ring: storm outside the circle, the circle itself and the next one dashed, and the drops as gold marks. */
export function drawRingMap(ctx: CanvasRenderingContext2D, royale: RoyaleView, serverNow: number, now: number, x: number, y: number, k: number, size: number) {
  const c = ringAt(royale.ring, serverNow);
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, size, size);
  ctx.clip();
  ctx.beginPath();
  ctx.rect(x, y, size, size);
  ctx.arc(x + c.x * k, y + c.y * k, Math.max(0, c.r * k), 0, Math.PI * 2, true);
  ctx.globalAlpha *= 0.45;
  ctx.fillStyle = RING_LOOK.storm;
  ctx.fill('evenodd');
  ctx.globalAlpha /= 0.45;
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = RING_LOOK.edge;
  ctx.beginPath();
  ctx.arc(x + c.x * k, y + c.y * k, Math.max(0, c.r * k), 0, Math.PI * 2);
  ctx.stroke();
  const next = royale.ring.to;
  if (royale.ring.phase < RING.length && next.r < c.r) {
    ctx.setLineDash([4, 3]);
    ctx.strokeStyle = RING_LOOK.next;
    ctx.beginPath();
    ctx.arc(x + next.x * k, y + next.y * k, Math.max(1.5, next.r * k), 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
  }
  for (const d of royale.drops) {
    const blink = d.landsAt > serverNow && Math.floor(now / 250) % 2 === 0;
    ctx.fillStyle = RING_LOOK.drop;
    ctx.globalAlpha = blink ? 0.4 : 1;
    ctx.fillRect(x + d.x * k - 3, y + d.y * k - 3, 6, 6);
  }
  ctx.restore();
}

export const squadColor = (team: ColorId) => TEAM_COLORS[team];

const TRACKER = { col: 22, pip: 4.5, gap: 13 } as const;
export const trackerSize = (squads: number) => ({ w: squads * TRACKER.col, h: 3 * TRACKER.gap });

/** Six columns of three pips, one per squad: filled while up, hollow while knocked, faint once dead, and a squad that is out shows its place. */
export function drawTracker(ctx: CanvasRenderingContext2D, royale: RoyaleView, mine: ColorId | null, left: number, top: number) {
  const { col, pip, gap } = TRACKER;
  const { h } = trackerSize(royale.squads.length);
  royale.squads.forEach((s, i) => {
    const x = left + col * i + col / 2;
    const color = squadColor(s.team);
    if (s.team === mine) {
      ctx.fillStyle = 'rgba(255, 255, 255, 0.14)';
      ctx.beginPath();
      ctx.roundRect(x - col / 2 + 1, top, col - 2, h, 4);
      ctx.fill();
    }
    if (s.place !== null && s.place > 1) {
      ctx.globalAlpha = 0.7;
      ctx.fillStyle = '#c4c8d0';
      ctx.font = '700 10px system-ui, -apple-system, "Segoe UI", sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(`#${s.place}`, x, top + h / 2);
      ctx.globalAlpha = 1;
      return;
    }
    s.pips.forEach((p, j) => {
      const y = top + gap / 2 + j * gap;
      ctx.beginPath();
      ctx.arc(x, y, pip, 0, Math.PI * 2);
      if (p === 'up') { ctx.fillStyle = color; ctx.fill(); }
      else if (p === 'down') { ctx.lineWidth = 2; ctx.strokeStyle = color; ctx.stroke(); }
      else { ctx.globalAlpha = 0.35; ctx.fillStyle = '#c4c8d0'; ctx.fill(); ctx.globalAlpha = 1; }
    });
  });
}

export const ringMoved = (prev: RoyaleView | undefined, next: RoyaleView | undefined, prevAt: number, nextAt: number): boolean =>
  !!prev && !!next && prevAt < next.ring.shrinkAt && nextAt >= next.ring.shrinkAt && next.ring.phase < RING.length;

/** One-off announcements as the match turns: the ring setting off, last lives. */
export function royaleCallouts(prev: RoyaleView | undefined, next: RoyaleView | undefined, prevAt: number, nextAt: number): { title: string; line: string }[] {
  const out: { title: string; line: string }[] = [];
  if (prev?.redeploys && next && !next.redeploys) out.push({ title: 'Last lives', line: 'No more redeploys. Knocked squadmates still get back up.' });
  if (ringMoved(prev, next, prevAt, nextAt)) out.push({ title: 'The ring is moving', line: 'Get inside the dashed circle' });
  return out;
}
