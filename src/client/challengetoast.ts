import type { ChallengeView } from '../shared/challenges.ts';
import { emitSfx } from './sfxbus.ts';

/**
 * A challenge completed in a match lands as a toast in the medals' own style (style.css `.medal-toast`): a stamped badge, "Challenge
 * complete", what it was and the XP it paid. It rides in the same row as the medal toasts and lifts away after its moment.
 */
export const CHALLENGE_TOAST_MS = 4200;

const BADGE = `<svg viewBox="0 0 108 108" width="108" height="108" role="img" aria-label="Challenge complete">
  <polygon points="54,4 96,28 96,80 54,104 12,80 12,28" fill="#2a303a" stroke="#1c1f26" stroke-width="6" stroke-linejoin="round"/>
  <polygon points="54,12 89,32 89,76 54,96 19,76 19,32" fill="#4f5560" stroke="#c9ced8" stroke-width="3" stroke-linejoin="round"/>
  <polygon points="54,12 89,32 54,50 19,32" fill="rgba(255,255,255,0.14)"/>
  <path d="M33 56l15 15 28-31" fill="none" stroke="#1c1f26" stroke-width="15" stroke-linecap="round" stroke-linejoin="round"/>
  <path d="M33 56l15 15 28-31" fill="none" stroke="#ffd34d" stroke-width="9" stroke-linecap="round" stroke-linejoin="round"/>
</svg>`;

export function createChallengeToasts(root: HTMLElement) {
  return (c: ChallengeView) => {
    const el = document.createElement('div');
    el.className = 'medal-toast tier-silver challenge-toast';
    el.style.setProperty('--life', `${CHALLENGE_TOAST_MS}ms`);
    el.style.setProperty('--pow', '0.85');
    el.innerHTML = `<small class="medal-banner">Challenge complete</small><div class="medal-art"><i class="medal-ring"></i>${BADGE}<i class="medal-shine"></i></div><b class="medal-name"></b><span class="medal-score"></span>`;
    el.querySelector('.medal-name')!.textContent = c.text;
    el.querySelector('.medal-score')!.textContent = `+${c.xp} XP`;
    root.append(el);
    emitSfx('medal:silver', { gain: 0.9 });
    setTimeout(() => el.remove(), CHALLENGE_TOAST_MS + 100);
  };
}
