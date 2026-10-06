import { RING, ZOM, type ColorId } from '../shared/defs.ts';
import { ringAt, type CrateView, type PlayerView, type RoyaleResult, type RoyaleView, type Snapshot, type SquadView } from '../shared/protocol.ts';
import { clock } from './derive.ts';
import { TEAM_COLORS } from './palette.ts';

type Point = { x: number; y: number };

const RING_LOOK = { storm: '#4b2f86', stormAlpha: 0.2, edge: '#b48cff', next: 'rgba(255, 255, 255, 0.75)', drop: '#ffd34d' } as const;

export const squadLabel = (team: ColorId) => `${team[0]!.toUpperCase()}${team.slice(1)} squad`;

export function ringLine(royale: Pick<RoyaleView, 'ring'>, serverNow: number): string {
  const { ring } = royale;
  if (ring.phase >= RING.length) return 'Final circle';
  if (serverNow < ring.shrinkAt) return `Ring closes in ${clock(ring.shrinkAt - serverNow)}`;
  return `Ring closing · ${clock(ring.closeAt - serverNow)}`;
}

export function ringPill(royale: Pick<RoyaleView, 'ring'>, serverNow: number): { label: string; time: string } {
  const { ring } = royale;
  if (ring.phase >= RING.length) return { label: 'FINAL', time: '' };
  const until = serverNow < ring.shrinkAt ? ring.shrinkAt : ring.closeAt;
  return { label: `RING ${ring.phase + 1}/${RING.length}`, time: clock(until - serverNow) };
}

export const resultTitle = (r: RoyaleResult) => (r.place === 1 ? '#1 · Last squad standing' : `#${r.place} of ${r.of}`);

const nameOf = (snap: Snapshot, id: number | null) =>
  id === null ? null : snap.players.find((p) => p.id === id)?.name ?? snap.leaderboard.find((r) => r.id === id)?.name ?? null;

export function spectateLines(snap: Snapshot, royale: RoyaleView, serverNow: number): { title: string; sub: string } {
  const watched = nameOf(snap, royale.watch);
  const title = watched ? `Watching ${watched}` : 'Spectating';
  const team = snap.players.find((p) => p.id === snap.self.id)?.team ?? snap.leaderboard.find((r) => r.id === snap.self.id)?.team;
  const regroupAt = royale.squads.find((sq) => sq.team === team)?.regroupAt ?? null;
  if (regroupAt !== null) return { title, sub: `Squad wiped · regrouping in ${clock(regroupAt - serverNow)}` };
  if (royale.redeployAt !== null) return { title, sub: `Redeploy beside your squad in ${clock(royale.redeployAt - serverNow)}` };
  if (royale.result) return { title, sub: `Your squad finished ${resultTitle(royale.result)}` };
  const me = snap.players.find((p) => p.id === snap.self.id);
  return { title, sub: me?.team ? 'Last lives: no redeploy this match' : 'You join a squad when the next match starts' };
}

export function reviveHint(snap: Snapshot, me: PlayerView | null): string | null {
  if (!me?.alive || !snap.royale) return null;
  const mate = snap.players.find((p) => p.id !== me.id && p.team === me.team && p.downed && Math.hypot(p.x - me.x, p.y - me.y) <= ZOM.reviveRange);
  return mate ? `Hold E to revive ${mate.name}` : null;
}

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

/** Rich crates and caches wear a gold frame, a caches' as bold as a landed drop's, so the loot worth a detour reads at a glance. */
export function drawLootWorld(ctx: CanvasRenderingContext2D, crates: readonly CrateView[]) {
  ctx.save();
  ctx.strokeStyle = RING_LOOK.drop;
  for (const c of crates) {
    if (c.tier !== 'rich' && c.tier !== 'cache') continue;
    const pad = c.tier === 'cache' ? 4 : 3;
    ctx.globalAlpha = c.tier === 'cache' ? 1 : 0.6;
    ctx.lineWidth = c.tier === 'cache' ? 3 : 1.5;
    ctx.strokeRect(c.x - pad, c.y - pad, c.size + pad * 2, c.size + pad * 2);
  }
  ctx.restore();
}

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

const TRACKER = { col: 22, pip: 4.5, gap: 13 } as const;

/** What a squad's tracker column reads in place of its pips: its place once out, the seconds left while it regroups. */
export const trackerLabel = (s: SquadView, serverNow: number | null): string | null =>
  s.place !== null && s.place > 1 ? `#${s.place}` : s.regroupAt !== null && serverNow !== null ? `${Math.max(0, Math.ceil((s.regroupAt - serverNow) / 1000))}s` : null;
export const trackerSize = (squads: number) => ({ w: squads * TRACKER.col, h: 3 * TRACKER.gap });

export function drawTracker(ctx: CanvasRenderingContext2D, royale: RoyaleView, mine: ColorId | null, left: number, top: number, serverNow: number | null) {
  const { col, pip, gap } = TRACKER;
  const { h } = trackerSize(royale.squads.length);
  royale.squads.forEach((s, i) => {
    const x = left + col * i + col / 2;
    const color = TEAM_COLORS[s.team];
    if (s.team === mine) {
      ctx.fillStyle = 'rgba(255, 255, 255, 0.14)';
      ctx.beginPath();
      ctx.roundRect(x - col / 2 + 1, top, col - 2, h, 4);
      ctx.fill();
    }
    const label = trackerLabel(s, serverNow);
    if (label) {
      ctx.globalAlpha = s.place === null ? 0.9 : 0.7;
      ctx.fillStyle = s.place === null ? color : '#c4c8d0';
      ctx.font = '700 10px system-ui, -apple-system, "Segoe UI", sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(label, x, top + h / 2);
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

export function royaleCallouts(prev: RoyaleView | undefined, next: RoyaleView | undefined, prevAt: number, nextAt: number): { title: string; line: string }[] {
  const out: { title: string; line: string }[] = [];
  if (prev?.redeploys && next && !next.redeploys) out.push({ title: 'Last lives', line: 'Fall now and you stay down. Knocked squadmates still get back up.' });
  if (ringMoved(prev, next, prevAt, nextAt)) out.push({ title: 'The ring is moving', line: 'Get inside the dashed circle' });
  return out;
}
