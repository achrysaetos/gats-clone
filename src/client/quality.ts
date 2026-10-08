export const TIERS = ['low', 'medium', 'high', 'ultra'] as const;
export type Tier = (typeof TIERS)[number];
/** `auto` starts at `high` and steps down when frames run long; a tier picked by hand stays put. */
export type QualityMode = 'auto' | Tier;

/** What a tier costs the GPU. Every effect that scales with quality reads its cap from here. */
export type Knobs = {
  /** World pixels per CSS pixel as a share of the display's DPR. The HUD canvas keeps full DPR, so text stays sharp. */
  renderScale: number;
  /** The bloom buffer's size as a divisor of the world's, or null for no bloom. */
  bloomDiv: 2 | 4 | null;
  /** Whether the glow layer is summed off-screen and rolled off before it lands, which costs a full-size pass; without it glows add straight on. */
  glowClamp: boolean;
  particles: number;
  decals: number;
  lights: number;
};

export const QUALITY: Readonly<Record<Tier, Knobs>> = {
  low: { renderScale: 0.5, bloomDiv: null, glowClamp: false, particles: 120, decals: 24, lights: 12 },
  medium: { renderScale: 0.75, bloomDiv: 4, glowClamp: true, particles: 250, decals: 48, lights: 24 },
  high: { renderScale: 1, bloomDiv: 4, glowClamp: true, particles: 500, decals: 90, lights: 48 },
  ultra: { renderScale: 1, bloomDiv: 2, glowClamp: true, particles: 500, decals: 160, lights: 96 },
};

const MODES: readonly string[] = ['auto', ...TIERS];
export const parseMode = (s: string | null | undefined): QualityMode | null => (s && MODES.includes(s) ? (s as QualityMode) : null);

/**
 * When `auto` steps. The last `windowMs` of rAF intervals (at least `minFrames` of them) is judged by its 90th percentile against
 * a 60 Hz budget: over `downMs` steps down at once; under `upMs` for `upAfterMs` steps back up. After a change the first `settleMs`
 * are skipped while the new tier's buffers are made. A tier that was stepped down from is barred for `barMs`, doubling each time,
 * so the governor never bounces between two tiers. An interval past `hitchMs` is a paused page, not frame time.
 */
export const GOVERN = { windowMs: 1500, minFrames: 8, settleMs: 500, downMs: 25, upMs: 18, upAfterMs: 20_000, barMs: 60_000, hitchMs: 5000 } as const;

export type Governor = {
  tier: Tier;
  /** The highest tier auto may climb back to. */
  top: Tier;
  window: readonly number[];
  settleUntil: number;
  calmSince: number | null;
  barred: Readonly<Partial<Record<Tier, { until: number; nextMs: number }>>>;
  /** The p90 of the window that last moved the tier. */
  lastP90: number | null;
};

export const governor = (tier: Tier, top: Tier = 'high', now = 0): Governor => ({ tier, top, window: [], settleUntil: now + GOVERN.settleMs, calmSince: null, barred: {}, lastP90: null });

export function percentile(xs: readonly number[], q: number): number {
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor(q * s.length))] ?? NaN;
}

const step = (t: Tier, by: 1 | -1): Tier => TIERS[Math.max(0, Math.min(TIERS.length - 1, TIERS.indexOf(t) + by))]!;

export function govern(g: Governor, intervalMs: number, now: number): Governor {
  if (intervalMs > GOVERN.hitchMs || now < g.settleUntil) return g;
  const window = [...g.window, intervalMs];
  let span = window.reduce((a, b) => a + b, 0);
  while (window.length > GOVERN.minFrames && span - window[0]! >= GOVERN.windowMs) span -= window.shift()!;
  if (span < GOVERN.windowMs || window.length < GOVERN.minFrames) return { ...g, window };
  const p90 = percentile(window, 0.9);
  const moved = (tier: Tier, barred: Governor['barred']): Governor => ({ ...g, tier, barred, window: [], settleUntil: now + GOVERN.settleMs, calmSince: null, lastP90: p90 });
  if (p90 > GOVERN.downMs && g.tier !== 'low') {
    const nextMs = g.barred[g.tier]?.nextMs ?? GOVERN.barMs;
    return moved(step(g.tier, -1), { ...g.barred, [g.tier]: { until: now + nextMs, nextMs: nextMs * 2 } });
  }
  if (p90 >= GOVERN.upMs) return { ...g, window, calmSince: null };
  const calmSince = g.calmSince ?? now;
  const up = step(g.tier, 1);
  const open = TIERS.indexOf(up) <= TIERS.indexOf(g.top) && up !== g.tier && !((g.barred[up]?.until ?? 0) > now);
  if (open && now - calmSince >= GOVERN.upAfterMs) return moved(up, g.barred);
  return { ...g, window, calmSince };
}

export type QualityChange = { at: number; from: Tier; to: Tier; p90: number | null; why: 'auto' | 'set' };

/** The page's quality: the mode the player chose, the tier in force, and its knobs with `?bloom=0` applied. */
export function createQuality(mode: QualityMode, bloomAllowed: boolean) {
  let current = mode;
  let gov = governor(mode === 'auto' ? 'high' : mode);
  const changes: QualityChange[] = [];
  const note = (from: Tier, why: QualityChange['why'], now: number) => { if (gov.tier !== from) changes.push({ at: now, from, to: gov.tier, p90: why === 'auto' ? gov.lastP90 : null, why }); };
  return {
    mode: () => current,
    tier: () => gov.tier,
    knobs(): Knobs {
      const k = QUALITY[gov.tier];
      return bloomAllowed ? k : { ...k, bloomDiv: null };
    },
    /** Picks a mode by hand; `auto` restarts the governor from `start`. */
    set(next: QualityMode, now: number, start: Tier = 'high') {
      const from = gov.tier;
      current = next;
      gov = governor(next === 'auto' ? start : next, 'high', now);
      note(from, 'set', now);
    },
    frame(intervalMs: number, now: number) {
      if (current !== 'auto') return;
      const from = gov.tier;
      gov = govern(gov, intervalMs, now);
      note(from, 'auto', now);
    },
    changes: () => changes,
  };
}
export type Quality = ReturnType<typeof createQuality>;
