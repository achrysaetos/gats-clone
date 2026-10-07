import { ABILITY_COOLDOWN_MS, type AbilityId } from '../shared/defs.ts';
import type { Snapshot } from '../shared/protocol.ts';
import { iconSvg, PERK_ICONS, UI_ICONS } from './icons.ts';

type SelfView = Snapshot['self'];

/**
 * What the touch buttons show, as icons instead of letters. Reload is a circular arrow that fills round as the reload runs
 * and glows when the mag is empty. The ability button shows the ability's own icon with a sweep for its cooldown and the
 * seconds left; before an ability is picked it shows a lock and the score that unlocks it.
 */
export type ButtonFaces = {
  reload: { sweep: number; empty: boolean };
  ability: { icon: AbilityId | 'lock'; sweep: number; label: string; ready: boolean };
};

/** `unlockAt` is the score that unlocks an ability, or undefined while the ability pick is waiting in the perk dock. */
export function buttonFaces(self: SelfView, unlockAt: number | undefined): ButtonFaces {
  const reload = { sweep: self.reloading ? self.reloadFrac : 0, empty: !self.reloading && self.ammo === 0 };
  if (!self.ability) return { reload, ability: { icon: 'lock', sweep: 0, label: unlockAt === undefined ? '' : String(unlockAt), ready: false } };
  const left = Math.max(0, self.abilityReadyIn);
  return {
    reload,
    ability: {
      icon: self.ability,
      sweep: left > 0 ? 1 - Math.min(1, left / ABILITY_COOLDOWN_MS[self.ability]) : 0,
      label: left > 0 ? String(Math.ceil(left / 1000)) : '',
      ready: left <= 0,
    },
  };
}

/** Applies faces to the buttons, touching the DOM only when something visible changed. */
export function createTouchButtons(reload: HTMLElement, ability: HTMLElement) {
  reload.replaceChildren(iconSvg(UI_ICONS.reload, 'touch-icon'));
  const icon = document.createElement('span');
  const count = document.createElement('span');
  count.className = 'touch-count';
  ability.replaceChildren(icon, count);
  let shown = '';
  let shownIcon = '';
  return (faces: ButtonFaces) => {
    const r = faces.reload, a = faces.ability;
    const key = `${r.sweep.toFixed(2)}|${r.empty}|${a.icon}|${a.sweep.toFixed(2)}|${a.label}|${a.ready}`;
    if (key === shown) return;
    shown = key;
    reload.style.setProperty('--sweep', String(r.sweep));
    reload.classList.toggle('busy', r.sweep > 0);
    reload.classList.toggle('empty', r.empty);
    if (a.icon !== shownIcon) {
      shownIcon = a.icon;
      icon.replaceChildren(iconSvg(a.icon === 'lock' ? UI_ICONS.lock : PERK_ICONS[a.icon], 'touch-icon'));
    }
    ability.style.setProperty('--sweep', String(a.sweep));
    ability.classList.toggle('busy', a.sweep > 0);
    ability.classList.toggle('ready', a.ready);
    ability.classList.toggle('locked', a.icon === 'lock');
    count.textContent = a.label;
  };
}
