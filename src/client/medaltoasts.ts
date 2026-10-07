import { MEDALS } from '../shared/defs.ts';
import { medalArt, medalSvg } from './medals.ts';
import { MEDAL_MS, type MedalToast } from './moments.ts';

/**
 * Medal toasts in the manner of Call of Duty: each medal you earn punches onto the screen above centre, metal flashing and a
 * shine sweeping across it, with its name and score, then lifts away. Medals earned together line up side by side as each
 * lands. The punch, flash and exit are CSS animations (style.css `.medal-toast`); this keeps the row in step with the queue.
 */
export function createMedalToasts(root: HTMLElement) {
  const shown = new Map<string, HTMLElement>();
  const keyOf = (t: MedalToast) => `${t.medal}|${t.born}`;
  return (toasts: readonly MedalToast[], now: number) => {
    const live = new Set<string>();
    for (const t of toasts) {
      if (now < t.born) continue;
      const key = keyOf(t);
      live.add(key);
      let el = shown.get(key);
      if (!el) {
        const def = MEDALS[t.medal];
        el = document.createElement('div');
        el.className = `medal-toast tier-${def.tier}`;
        el.style.setProperty('--life', `${MEDAL_MS}ms`);
        el.innerHTML = `<div class="medal-art">${medalSvg(medalArt(t.medal), 108, def.name)}<i class="medal-shine"></i></div>`
          + `<b class="medal-name"></b><span class="medal-score">+${def.score}</span>`;
        el.querySelector('.medal-name')!.textContent = def.name;
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
