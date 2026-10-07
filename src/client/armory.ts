import { COSMETIC_BY_ID, cosmeticsIn, DEFAULTS, SLOTS, type Cosmetic, type Equipped, type Slot } from '../shared/cosmetics.ts';
import { COLORS } from '../shared/defs.ts';
import type { Loadout } from '../shared/protocol.ts';
import { lookOfEquipped, RARITY_NAME, unlockLabel } from './cosmeticlook.ts';
import { drawItem, drawPreview, createFxStage } from './preview.ts';
import { owns, SLOT_LABEL } from './progression.ts';
import { reducedMotion } from './screenfx.ts';
import type { Wardrobe } from './wardrobe.ts';

/**
 * The armory (the menu's locker): a live soldier in the colours of your loadout wearing what you have equipped, with one tab per
 * slot and a grid of every item in it. Owned items equip on a click; locked ones stay grey with what unlocks them, and try on in the
 * preview so you know what you are playing for. The kill-effect tab plays the effect on a stand-in soldier.
 */
type Deps = { wardrobe: Wardrobe; loadout(): Loadout };

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls = '', text = ''): HTMLElementTagNameMap[K] {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text) n.textContent = text;
  return n;
}

/** How far an unlock is, for a locked card: "12 more levels" for a level item, otherwise what to do. */
export function unlockHint(c: Cosmetic, level: number): string {
  if ('level' in c.unlock) {
    const more = c.unlock.level - level;
    return more > 0 ? `${more} more level${more === 1 ? '' : 's'}` : 'Reached';
  }
  if ('career' in c.unlock) return 'Earn this lifetime medal';
  if ('challenge' in c.unlock) return 'Reward for a weekly challenge';
  return '';
}

export function createArmory(root: HTMLElement, deps: Deps) {
  let slot: Slot = 'helmet';
  /** An item being tried on, per slot, that you do not own or have not equipped. */
  const tryOn: Partial<Record<Slot, string>> = {};
  let hover: string | null = null;
  let shown = false;
  let raf = 0;

  const stage = el('div', 'armory-stage');
  const view = el('canvas', 'armory-view');
  view.dataset.w = '320'; view.dataset.h = '250';
  const fxView = el('canvas', 'armory-fx');
  fxView.dataset.w = '320'; fxView.dataset.h = '250';
  const info = el('div', 'armory-info');
  stage.append(el('div', 'armory-floor'), view, fxView);
  const tabs = el('div', 'armory-tabs');
  tabs.setAttribute('role', 'tablist');
  const grid = el('div', 'armory-grid');
  const counts = el('span', 'armory-count');
  const notice = el('p', 'armory-notice');
  notice.setAttribute('role', 'status');
  const left = el('div', 'armory-left');
  left.append(stage, info);
  const right = el('div', 'armory-right');
  right.append(tabs, grid, notice);
  root.replaceChildren(left, right);

  const tabButtons = new Map<Slot, HTMLButtonElement>();
  for (const s of SLOTS) {
    const b = el('button', 'armory-tab', SLOT_LABEL[s]);
    b.type = 'button';
    b.setAttribute('role', 'tab');
    b.onclick = () => { slot = s; hover = null; build(); };
    tabButtons.set(s, b);
    tabs.append(b);
  }
  tabs.append(counts);

  const equippedNow = (): Equipped => deps.wardrobe.state().equipped;
  /** What the preview wears: what is equipped, with the hovered or tried-on item of the open slot on top. */
  const previewEquipped = (): Equipped => {
    const e = { ...equippedNow() };
    for (const s of SLOTS) { const t = tryOn[s]; if (t) e[s] = t; }
    if (hover) { const c = COSMETIC_BY_ID.get(hover); if (c) e[c.slot] = hover; }
    return e;
  };
  const focusItem = (): Cosmetic | undefined => COSMETIC_BY_ID.get(hover ?? tryOn[slot] ?? equippedNow()[slot]);

  function renderInfo() {
    const st = deps.wardrobe.state();
    const c = focusItem();
    if (!c) { info.replaceChildren(); return; }
    const have = owns(st.unlocked, c), worn = equippedNow()[c.slot] === c.id;
    const name = el('h3', 'armory-name', c.name);
    const rar = el('span', `rarity r-${c.rarity}`, RARITY_NAME[c.rarity]);
    const head = el('div', 'armory-head');
    head.append(name, rar);
    const desc = el('p', 'armory-desc', c.desc);
    const status = el('p', have ? 'armory-status own' : 'armory-status lock');
    status.textContent = have ? (worn ? 'Equipped' : 'Unlocked') : `Locked · ${unlockLabel(c)}${unlockHint(c, st.level.level) ? ` · ${unlockHint(c, st.level.level)}` : ''}`;
    const act = el('button', 'primary armory-equip', worn ? 'Equipped' : have ? 'Equip' : 'Locked');
    act.type = 'button';
    act.disabled = worn || !have;
    act.onclick = () => void equip(c);
    info.replaceChildren(head, desc, status, act);
  }

  async function equip(c: Cosmetic) {
    delete tryOn[c.slot];
    hover = null;
    await deps.wardrobe.equip(c.slot, c.id);
    build();
  }

  function build() {
    const st = deps.wardrobe.state();
    for (const [s, b] of tabButtons) { b.setAttribute('aria-selected', String(s === slot)); b.tabIndex = s === slot ? 0 : -1; }
    const items = cosmeticsIn(slot);
    const have = items.filter((c) => owns(st.unlocked, c)).length;
    counts.textContent = `${have} / ${items.length}`;
    // Owned first (the worn one leading), then locked by what they ask for, so the next reward is near the top of the locked part.
    const worn = equippedNow()[slot];
    const order = [...items].sort((a, b) => Number(owns(st.unlocked, b)) - Number(owns(st.unlocked, a)) || Number(b.id === worn) - Number(a.id === worn) || items.indexOf(a) - items.indexOf(b));
    grid.replaceChildren(...order.map((c) => {
      const mine = owns(st.unlocked, c), isWorn = worn === c.id;
      const b = el('button', `cos-card r-${c.rarity}${mine ? '' : ' locked'}${isWorn ? ' worn' : ''}`);
      b.type = 'button';
      b.dataset.id = c.id;
      b.setAttribute('aria-pressed', String(isWorn));
      b.title = `${c.name}: ${c.desc}`;
      const art = el('canvas', 'cos-art');
      art.dataset.w = '120'; art.dataset.h = c.slot === 'title' || c.slot === 'nameColor' ? '40' : '64';
      const label = el('b', '', c.name);
      const sub = el('small', '', mine ? RARITY_NAME[c.rarity] : unlockLabel(c));
      b.append(art, label, sub);
      if (isWorn) b.append(el('i', 'cos-tag', 'Worn'));
      if (!mine) b.append(el('i', 'cos-lock'));
      b.onclick = () => { if (mine) void equip(c); else { tryOn[c.slot] = c.id; hover = null; renderInfo(); drawGrid(); } };
      b.onmouseenter = b.onfocus = () => { hover = c.id; renderInfo(); };
      b.onmouseleave = b.onblur = () => { hover = null; renderInfo(); };
      return b;
    }));
    notice.textContent = st.notice;
    notice.hidden = !st.notice;
    renderInfo();
    requestAnimationFrame(drawGrid);
  }

  /** Paints each card's art (the cards animate only where the art does: the name shimmer). */
  function drawGrid(now = performance.now()) {
    for (const b of grid.querySelectorAll<HTMLButtonElement>('.cos-card')) {
      const c = COSMETIC_BY_ID.get(b.dataset.id ?? '');
      const art = b.querySelector('canvas');
      if (c && art) drawItem(art, c, now);
    }
  }

  const fx = createFxStage();
  function frame(now: number) {
    raf = shown ? requestAnimationFrame(frame) : 0;
    if (!shown) return;
    const st = deps.wardrobe.state();
    const l = deps.loadout();
    const look = lookOfEquipped(previewEquipped());
    const calm = reducedMotion();
    drawPreview(view, {
      look, color: COLORS[l.color], gun: l.weapon, armor: l.armor, now: calm ? 0 : now,
      aim: calm ? Math.PI * 0.08 : Math.PI * 0.08 + Math.sin(now / 1700) * 0.4, scale: 2.2, walking: !calm && look.helmet === 'h_propeller',
      at: { x: 0.45, y: 0.56 },
    });
    const kfx = look.killFx;
    const ctx2 = fxView.getContext('2d');
    if (slot === 'killFx' && kfx !== DEFAULTS.killFx && !calm) fx(fxView, kfx, now);
    else if (ctx2 && fxView.width) ctx2.clearRect(0, 0, fxView.width, fxView.height);
    if (st.level.level < 0) return;
    // Shimmering names redraw while their tab is open.
    if (slot === 'nameColor' && !calm && Math.floor(now / 90) !== lastShimmer) { lastShimmer = Math.floor(now / 90); drawGrid(now); }
  }
  let lastShimmer = -1;

  deps.wardrobe.subscribe(() => { if (shown) build(); });
  build();
  return {
    show() { shown = true; build(); if (!raf) raf = requestAnimationFrame(frame); },
    hide() { shown = false; },
    refresh() { if (shown) build(); },
    /** Opens the armory on `slot`, with `id` highlighted (from the unlock reveal). */
    open(s: Slot, id?: string) { slot = s; if (id) hover = null; build(); },
  };
}
