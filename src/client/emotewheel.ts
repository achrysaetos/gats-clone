import { EMOTE_IDS, EMOTES, type EmoteId } from '../shared/emotes.ts';
import { drawEmoteIcon } from './emotefx.ts';

/**
 * The emote wheel: hold T, flick the mouse toward a plate and let go; on a phone tap the emote button, then a plate.
 * DOM plates (styled in delight.css) so it scales with `--ui` and stays out of the canvas HUD.
 */
const DEAD_ZONE_PX = 46;
const RADIUS_PX = 132;

/** The wheel sector (0 at the top, clockwise) a pointer offset (`dx`, `dy` from the wheel's centre) points at, or null inside the dead zone. */
export function sectorAt(dx: number, dy: number, count = EMOTE_IDS.length, dead = DEAD_ZONE_PX): number | null {
  if (Math.hypot(dx, dy) < dead) return null;
  const turn = (Math.atan2(dx, -dy) + Math.PI * 2) % (Math.PI * 2);
  return Math.round(turn / ((Math.PI * 2) / count)) % count;
}

export function createEmoteWheel(root: HTMLElement, onPick: (id: EmoteId) => void) {
  const wheel = document.createElement('div');
  wheel.id = 'emote-wheel';
  wheel.className = 'emote-wheel';
  wheel.hidden = true;
  wheel.setAttribute('role', 'menu');
  const hub = document.createElement('div');
  hub.className = 'emote-hub';
  hub.textContent = 'EMOTE';
  wheel.append(hub);
  const plates = EMOTE_IDS.map((id, i) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'emote-plate';
    b.setAttribute('role', 'menuitem');
    b.setAttribute('aria-label', EMOTES[id].label);
    const a = (i / EMOTE_IDS.length) * Math.PI * 2;
    b.style.setProperty('--ex', `${Math.round(Math.sin(a) * RADIUS_PX)}px`);
    b.style.setProperty('--ey', `${Math.round(-Math.cos(a) * RADIUS_PX)}px`);
    const c = document.createElement('canvas');
    c.width = c.height = 60;
    c.className = 'emote-icon';
    const g = c.getContext('2d');
    if (g) drawEmoteIcon(g, id, 30, 30, 48);
    const label = document.createElement('span');
    label.textContent = EMOTES[id].label;
    b.append(c, label);
    b.addEventListener('click', (e) => { e.preventDefault(); pick(id); });
    wheel.append(b);
    return b;
  });
  root.append(wheel);

  let isOpen = false;
  let sel: number | null = null;
  const highlight = (i: number | null) => {
    sel = i;
    plates.forEach((b, k) => b.classList.toggle('on', k === i));
  };
  function pick(id: EmoteId) { close(); onPick(id); }
  function open() {
    if (isOpen) return;
    isOpen = true;
    highlight(null);
    wheel.hidden = false;
    wheel.classList.remove('pop');
    void wheel.offsetWidth;
    wheel.classList.add('pop');
  }
  function close() {
    isOpen = false;
    wheel.hidden = true;
    highlight(null);
  }
  const centre = () => { const r = wheel.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; };
  return {
    get open() { return isOpen; },
    openWheel: open,
    toggle: () => (isOpen ? close() : open()),
    close,
    /** Follows the mouse while the wheel is open. */
    move(x: number, y: number) {
      if (!isOpen) return;
      const c = centre();
      highlight(sectorAt(x - c.x, y - c.y));
    },
    /** T let go: sends whichever plate the mouse points at, or nothing if it never left the hub. */
    release() {
      if (!isOpen) return;
      const id = sel === null ? null : EMOTE_IDS[sel]!;
      close();
      if (id) onPick(id);
    },
  };
}
