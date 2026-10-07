import { MEDALS } from '../shared/defs.ts';
import { badgeKey } from '../shared/defs.ts';
import { careerArt, careerName, medalArt, medalSvg } from './medals.ts';
import { CAREER_TOAST_MS, MEDAL_MS, type MedalToast } from './moments.ts';

/**
 * Medal toasts in the manner of Call of Duty: each medal you earn punches onto the screen above centre, metal flashing and a
 * shine sweeping across it, with its name and score, then lifts away. Medals earned together line up side by side as each
 * lands. The punch, flash and exit are CSS animations (style.css `.medal-toast`); this keeps the row in step with the queue.
 */
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
        el.style.setProperty('--life', `${t.k === 'career' ? CAREER_TOAST_MS : MEDAL_MS}ms`);
        el.innerHTML = (t.k === 'career' ? '<small class="medal-banner">Lifetime medal</small>' : '')
          + `<div class="medal-art">${medalSvg(art, t.k === 'career' ? 140 : 108, name)}<i class="medal-shine"></i></div>`
          + `<b class="medal-name"></b><span class="medal-score">+${score}</span>`;
        el.querySelector('.medal-name')!.textContent = name;
        root.append(el);
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
