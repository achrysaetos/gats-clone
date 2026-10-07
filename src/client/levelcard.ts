import { COSMETIC_BY_ID } from '../shared/cosmetics.ts';
import { RARITY_INK, unlockLabel } from './cosmeticlook.ts';
import { levelBar, nextUnlock, SLOT_LABEL } from './progression.ts';
import type { WardrobeState } from './wardrobe.ts';

const STAR = 'M12 2l2.9 6.6 7.1.6-5.4 4.7 1.7 7-6.3-3.8-6.3 3.8 1.7-7L2 9.2l7.1-.6z';
const starSvg = (cls = 'lv-star'): string => `<svg class="${cls}" viewBox="0 0 24 24" aria-hidden="true"><path d="${STAR}"/></svg>`;
export const starsHtml = (n: number): string => (n <= 0 ? '' : n <= 3 ? starSvg().repeat(n) : `${starSvg()}<b class="lv-x">×${n}</b>`);

/** The account level near the name field: the chip, prestige stars, the XP bar and what the next level earns. */
export function renderLevelCard(root: HTMLElement, st: Pick<WardrobeState, 'level'>): void {
  const bar = levelBar(st.level);
  const next = nextUnlock(st.level.level);
  root.dataset.level = String(bar.level);
  root.innerHTML = '';
  const chip = document.createElement('span');
  chip.className = 'lv-chip';
  chip.innerHTML = `<small>LV</small><b>${bar.level}</b>`;
  const stars = document.createElement('span');
  stars.className = 'lv-stars';
  stars.innerHTML = starsHtml(bar.prestige);
  const track = document.createElement('div');
  track.className = 'xp-bar';
  const fill = document.createElement('i');
  fill.style.width = `${Math.round(bar.pct * 100)}%`;
  track.append(fill);
  const label = document.createElement('small');
  label.className = 'lv-label';
  label.textContent = bar.label;
  const top = document.createElement('div');
  top.className = 'lv-top';
  top.append(chip, stars, label);
  root.append(top, track);
  if (next) {
    const line = document.createElement('p');
    line.className = 'lv-next';
    const c = COSMETIC_BY_ID.get(next.id)!;
    line.append(`Next reward · ${unlockLabel(c)} · `);
    const b = document.createElement('b');
    b.textContent = `${c.name} (${SLOT_LABEL[c.slot].toLowerCase()})`;
    b.style.color = RARITY_INK[c.rarity];
    line.append(b);
    root.append(line);
  }
}
