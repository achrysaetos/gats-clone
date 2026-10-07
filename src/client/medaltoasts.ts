import { MEDALS } from '../shared/defs.ts';
import { badgeKey } from '../shared/defs.ts';
import { careerArt, careerName, medalArt, medalSvg } from './medals.ts';
import { CAREER_TOAST_MS, MEDAL_MS, type MedalToast } from './moments.ts';

/**
 * Medal toasts in the manner of Call of Duty: each medal you earn punches onto the screen above centre, metal flashing and a
 * shine sweeping across it, with its name and score, then lifts away. Medals earned together line up side by side as each
 * lands. The punch, flash and exit are CSS animations (style.css `.medal-toast`); this keeps the row in step with the queue.
 */
/** How hard each tier lands: glints thrown, and a multiplier on the shake, the rays and the glow (style.css reads it as `--pow`). */
const TIER_FX: Record<string, { sparks: number; pow: number }> = {
  bronze: { sparks: 7, pow: 0.6 },
  silver: { sparks: 11, pow: 0.85 },
  gold: { sparks: 16, pow: 1.1 },
  platinum: { sparks: 28, pow: 1.6 },
};
const reduced = (): boolean => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

/** Glints thrown out from the medal's centre when it lands; each is a CSS animation steered by its own custom properties. */
function sparkles(art: HTMLElement, n: number, pow: number) {
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + Math.random() * 0.5;
    const d = (62 + Math.random() * 62) * (0.8 + pow * 0.35);
    const sp = document.createElement('i');
    sp.className = 'medal-spark';
    sp.style.cssText = `--dx:${(Math.cos(a) * d).toFixed(1)}px;--dy:${(Math.sin(a) * d).toFixed(1)}px;--sz:${(7 + Math.random() * 11 * pow).toFixed(1)}px;--dl:${(0.2 + Math.random() * 0.22).toFixed(2)}s;--sd:${(0.6 + Math.random() * 0.5).toFixed(2)}s;--rot:${Math.round(Math.random() * 90)}deg`;
    art.append(sp);
  }
}

/** The score counts up to its value as the medal lands. */
function countUp(el: HTMLElement, to: number) {
  if (reduced() || to < 2) return;
  const t0 = performance.now(), dur = 520, delay = 260;
  const step = (now: number) => {
    const k = Math.min(1, Math.max(0, (now - t0 - delay) / dur));
    el.textContent = `+${Math.round(to * (1 - Math.pow(1 - k, 3)))}`;
    if (k < 1 && el.isConnected) requestAnimationFrame(step);
  };
  el.textContent = '+0';
  requestAnimationFrame(step);
}

export function createMedalToasts(root: HTMLElement) {
  const shown = new Map<string, HTMLElement>();
  const keyOf = (t: MedalToast) => `${t.k === 'medal' ? t.medal : badgeKey(t.badge)}|${t.born}`;
  return (toasts: readonly MedalToast[], now: number) => {
    const live = new Set<string>();
    for (const t of toasts) {
      if (now < t.born) continue;
      const key = keyOf(t);
      live.add(key);
      let el = shown.get(key);
      if (!el) {
        const art = t.k === 'medal' ? medalArt(t.medal) : careerArt(t.badge);
        const name = t.k === 'medal' ? MEDALS[t.medal].name : careerName(t.badge);
        const score = t.k === 'medal' ? MEDALS[t.medal].score : t.score;
        el = document.createElement('div');
        // A lifetime medal lands bigger, longer and under its own banner: it is for good.
        el.className = `medal-toast tier-${art.tier}${t.k === 'career' ? ' career' : ''}`;
        el.style.setProperty('--pow', String(TIER_FX[art.tier]?.pow ?? 1));
        el.style.setProperty('--life', `${t.k === 'career' ? CAREER_TOAST_MS : MEDAL_MS}ms`);
        el.innerHTML = (t.k === 'career' ? '<small class="medal-banner">Lifetime medal</small>' : '')
          + `<div class="medal-art"><i class="medal-rays"></i><i class="medal-ring"></i>${medalSvg(art, t.k === 'career' ? 140 : 108, name)}<i class="medal-shine"></i></div>`
          + `<b class="medal-name"></b><span class="medal-score">+${score}</span>`;
        el.querySelector('.medal-name')!.textContent = name;
        root.append(el);
        if (!reduced()) sparkles(el.querySelector<HTMLElement>('.medal-art')!, Math.round((TIER_FX[art.tier]?.sparks ?? 12) * (t.k === 'career' ? 1.4 : 1)), TIER_FX[art.tier]?.pow ?? 1);
        countUp(el.querySelector<HTMLElement>('.medal-score')!, score);
        shown.set(key, el);
      }
    }
    for (const [key, el] of shown) {
      if (live.has(key)) continue;
      el.remove();
      shown.delete(key);
    }
  };
}
