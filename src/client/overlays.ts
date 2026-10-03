import { PERK_INFO, PERK_TIERS, type PerkId, type Tier } from '../shared/defs.ts';
import type { Snapshot } from '../shared/protocol.ts';
import { objectiveFor, seconds } from './derive.ts';
import { perkKeyLabel } from './input.ts';
import { $ } from './menu.ts';
import { TEAM_COLORS } from './render.ts';
import type { ChatLine, ClientState, Session } from './state.ts';

const CHAT_VISIBLE_MS = 15000;
const OBJECTIVE_MS = 4000;

/** Tile face: a plain BMP symbol (not emoji, so every tile renders at one size) and a name short enough for 58px. */
const PERK_TILE: Record<PerkId, [glyph: string, short: string]> = {
  bipod: ['⊥', 'Bipod'], optics: ['◎', 'Optics'], thermal: ['◉', 'Thermal'], ghillie: ['♣', 'Ghillie'],
  piercing: ['➤', 'Piercing'], extended: ['▤', 'Ext. mag'], grip: ['✥', 'Grip'], silencer: ['◌', 'Silencer'],
  lightweight: ['»', 'Light'], longRange: ['⟶', 'Range'], shield: ['◗', 'Shield'], thickSkin: ['✚', 'Thick skin'],
  firstAid: ['♥', 'First aid'], grenade: ['●', 'Grenade'], fragGrenade: ['✸', 'Frag'], gasGrenade: ['☁', 'Gas'],
  landMine: ['⊗', 'Mine'], knife: ['†', 'Knife'], engineer: ['▦', 'Engineer'], dash: ['⇥', 'Dash'],
};
const CHAT_LINES = 8;

export function createOverlays(onPerk: (slot: number) => void, onRespawn: () => void) {
  const perkPanel = $('perk-panel');
  const chatLog = $('chat-log');
  const chatInput = $<HTMLInputElement>('chat-input');
  const banner = $('banner');
  const objective = $('objective');
  const death = $('death');
  const deathTitle = $('death-title');
  const deathSub = $('death-sub');
  const respawn = $<HTMLButtonElement>('respawn');
  respawn.onclick = onRespawn;
  const keys = { perk: '', chat: '', banner: '', death: '', objective: '' };
  let lastPhase: ClientState['phase'] = 'menu';
  let objectiveAt = -Infinity;

  const renderPerks = (tier: Tier | null) => {
    const key = String(tier);
    if (key === keys.perk) return;
    keys.perk = key;
    perkPanel.hidden = tier === null;
    if (tier === null) return;
    const perks = PERK_TIERS[tier];
    const title = document.createElement('h2');
    const hint = document.createElement('span');
    hint.textContent = ` · press 1-${perkKeyLabel(perks.length - 1)} or click`;
    title.append(`Level up · tier ${tier} perk`, hint);
    const list = document.createElement('div');
    list.className = 'perk-list';
    perks.forEach((perk, slot) => {
      const { name, desc } = PERK_INFO[perk];
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'perk';
      b.setAttribute('aria-label', `${name}: ${desc}`);
      const kbd = document.createElement('kbd');
      kbd.textContent = perkKeyLabel(slot);
      const icon = document.createElement('span');
      icon.className = 'perk-icon';
      const [glyph, short] = PERK_TILE[perk];
      icon.textContent = glyph;
      const label = document.createElement('b');
      label.textContent = short;
      const tip = document.createElement('span');
      tip.className = 'perk-tip';
      const tipName = document.createElement('strong');
      tipName.textContent = name;
      tip.append(tipName, desc);
      b.append(kbd, icon, label, tip);
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

  const renderObjective = (state: ClientState, snap: Snapshot, now: number) => {
    if (state.phase === 'playing' && lastPhase !== 'playing') objectiveAt = now;
    lastPhase = state.phase;
    const team = snap.players.find((p) => p.id === snap.self.id)?.team ?? null;
    const show = state.phase === 'playing' && now - objectiveAt < OBJECTIVE_MS;
    const key = show ? `${objectiveAt}|${snap.match.mode}|${team}` : '';
    if (key === keys.objective) return;
    keys.objective = key;
    objective.hidden = !show;
    if (!show) return;
    objective.textContent = objectiveFor(snap.match.mode, team).banner;
    objective.style.animationDuration = `${OBJECTIVE_MS}ms`;
    objective.style.borderColor = team ? TEAM_COLORS[team] : '';
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
      renderObjective(state, snap, now);
      renderDeath(state, snap);
    },
    reset() {
      keys.perk = keys.chat = keys.banner = keys.death = keys.objective = '';
      lastPhase = 'menu';
      perkPanel.hidden = banner.hidden = death.hidden = objective.hidden = true;
      chatLog.replaceChildren();
      chatInput.hidden = true;
    },
  };
}

export type Overlays = ReturnType<typeof createOverlays>;
