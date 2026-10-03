import { PERK_INFO, PERK_TIERS, type Tier } from '../shared/defs.ts';
import type { Snapshot } from '../shared/protocol.ts';
import { seconds } from './derive.ts';
import { perkKeyLabel } from './input.ts';
import { $ } from './menu.ts';
import { TEAM_COLORS } from './render.ts';
import type { ChatLine, ClientState, Session } from './state.ts';

const CHAT_VISIBLE_MS = 15000;
const CHAT_LINES = 8;

/**
 * DOM layers over the canvas. Each region re-renders only when its key changes,
 * since this runs every animation frame.
 */
export function createOverlays(onPerk: (slot: number) => void, onRespawn: () => void) {
  const perkPanel = $('perk-panel');
  const chatLog = $('chat-log');
  const chatInput = $<HTMLInputElement>('chat-input');
  const banner = $('banner');
  const death = $('death');
  const deathTitle = $('death-title');
  const deathSub = $('death-sub');
  const respawn = $<HTMLButtonElement>('respawn');
  respawn.onclick = onRespawn;
  const keys = { perk: '', chat: '', banner: '', death: '' };

  const renderPerks = (tier: Tier | null) => {
    const key = String(tier);
    if (key === keys.perk) return;
    keys.perk = key;
    perkPanel.hidden = tier === null;
    if (tier === null) return;
    const title = document.createElement('h2');
    title.textContent = `Level up · choose a tier ${tier} perk`;
    const list = document.createElement('div');
    list.className = 'perk-list';
    PERK_TIERS[tier].forEach((perk, slot) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'perk';
      const kbd = document.createElement('kbd');
      kbd.textContent = perkKeyLabel(slot);
      const name = document.createElement('b');
      name.textContent = PERK_INFO[perk].name;
      const desc = document.createElement('span');
      desc.textContent = PERK_INFO[perk].desc;
      b.append(kbd, name, desc);
      b.onclick = () => onPerk(slot);
      list.append(b);
    });
    perkPanel.replaceChildren(title, list);
  };

  const renderChat = (lines: ChatLine[], now: number, open: boolean) => {
    const shown = lines.slice(-CHAT_LINES).filter((l) => open || now - l.at < CHAT_VISIBLE_MS);
    const key = `${open}|${shown.length}|${shown.at(-1)?.at ?? 0}`;
    if (key === keys.chat) return;
    keys.chat = key;
    chatLog.replaceChildren(...shown.map((l) => {
      const li = document.createElement('li');
      const who = document.createElement('b');
      who.textContent = l.from ? `${l.from}: ` : '';
      if (l.team) who.style.color = TEAM_COLORS[l.team];
      li.append(who, l.text);
      if (!l.from) li.className = 'system';
      return li;
    }));
  };

  const renderBanner = (snap: Snapshot) => {
    const { winner, restartIn } = snap.match;
    const key = winner === null ? '' : `${winner}|${seconds(restartIn)}`;
    if (key === keys.banner) return;
    keys.banner = key;
    banner.hidden = winner === null;
    if (winner === null) return;
    const h = document.createElement('h2');
    h.textContent = `${winner} wins the round`;
    const p = document.createElement('p');
    p.textContent = `Next round in ${seconds(restartIn)}s`;
    banner.replaceChildren(h, p);
  };

  const renderDeath = (state: ClientState, snap: Snapshot) => {
    const dead = state.phase === 'dead';
    const wait = seconds(snap.self.respawnIn);
    const key = dead ? `${state.killer}|${wait}` : '';
    if (key === keys.death) return;
    keys.death = key;
    death.hidden = !dead;
    if (!dead) return;
    deathTitle.textContent = state.killer ? `Eliminated by ${state.killer}` : 'You were eliminated';
    deathSub.textContent = wait > 0 ? `Respawn in ${wait}s. Change your loadout below.` : 'Ready. Change your loadout or jump back in.';
    respawn.disabled = wait > 0;
    respawn.textContent = wait > 0 ? `Respawn (${wait})` : 'Respawn';
  };

  return {
    get typing() { return !chatInput.hidden; },
    openChat() {
      chatInput.hidden = false;
      chatInput.value = '';
      chatInput.focus();
    },
    /** Closes the chat box and returns what was typed. */
    closeChat(): string {
      const text = chatInput.value.trim();
      chatInput.value = '';
      chatInput.hidden = true;
      chatInput.blur();
      return text;
    },
    update(state: ClientState, s: Session, snap: Snapshot, now: number) {
      const pending = snap.self.pendingTier;
      renderPerks(state.phase === 'playing' && pending !== s.perkSentFor ? pending : null);
      renderChat(s.chat, now, !chatInput.hidden);
      renderBanner(snap);
      renderDeath(state, snap);
    },
    reset() {
      keys.perk = keys.chat = keys.banner = keys.death = '';
      perkPanel.hidden = banner.hidden = death.hidden = true;
      chatLog.replaceChildren();
      chatInput.hidden = true;
    },
  };
}

export type Overlays = ReturnType<typeof createOverlays>;
