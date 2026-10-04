import { GUNS, isPerkId, PERK_INFO, pickOptions, type GunId, type PendingPick, type PerkId } from '../shared/defs.ts';
import type { Snapshot } from '../shared/protocol.ts';
import { selfOf } from './derive.ts';
import { chatEntries, type ChatEntry, type MutedNames } from './chatmute.ts';
import { OBJECTIVE_MS, objectiveFor, objectiveVisible, seconds, topScorers } from './derive.ts';
import { PERK_ICONS, iconSvg } from './icons.ts';
import { perkKeyLabel } from './input.ts';
import { $ } from './menu.ts';
import { TEAM_COLORS } from './palette.ts';
import { drawSilhouette } from './sprites.ts';
import type { ChatLine, ClientState, Session } from './state.ts';

const CHAT_VISIBLE_MS = 15000;

/** Tile labels short enough for a 58px tile. */
const PERK_SHORT: Record<PerkId, string> = {
  bipod: 'Bipod', optics: 'Optics', thermal: 'Thermal', ghillie: 'Ghillie', piercing: 'Piercing', extended: 'Ext. mag',
  grip: 'Grip', silencer: 'Silencer', lightweight: 'Light', longRange: 'Range', shield: 'Shield', thickSkin: 'Thick skin',
  firstAid: 'First aid', grenade: 'Grenade', fragGrenade: 'Frag', gasGrenade: 'Gas', landMine: 'Mine', knife: 'Knife',
  engineer: 'Engineer', dash: 'Dash',
};
const CHAT_LINES = 8;
const PODIUM_SIZE = 3;

export function createOverlays(onPick: (slot: number) => void, onRespawn: () => void, onToggleMute: (name: string) => void) {
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

  const perkTile = (perk: PerkId) => {
    const { name, desc } = PERK_INFO[perk];
    const icon = iconSvg(PERK_ICONS[perk], 'perk-icon');
    const label = document.createElement('b');
    label.textContent = PERK_SHORT[perk];
    const tip = document.createElement('span');
    tip.className = 'perk-tip';
    const tipName = document.createElement('strong');
    tipName.textContent = name;
    tip.append(tipName, desc);
    return { className: 'perk', aria: `${name}: ${desc}`, parts: [icon, label, tip] };
  };

  const gunTile = (gun: GunId) => {
    const { name, desc } = GUNS[gun];
    const art = document.createElement('canvas');
    art.width = 216;
    art.height = 68;
    drawSilhouette(art, gun, GUNS[gun].look.accent);
    const label = document.createElement('b');
    label.textContent = name;
    const detail = document.createElement('small');
    detail.textContent = desc;
    return { className: 'perk evolve', aria: `${name}: ${desc}`, parts: [art, label, detail] };
  };

  const renderPick = (pending: PendingPick | null, gun: GunId) => {
    const key = pending ? `${pending.level}|${gun}` : '';
    if (key === keys.perk) return;
    keys.perk = key;
    perkPanel.hidden = pending === null;
    if (pending === null) return;
    const options = pickOptions(pending, gun);
    const title = document.createElement('h2');
    const hint = document.createElement('span');
    hint.textContent = ` · press 1-${perkKeyLabel(options.length - 1)} or click`;
    title.append(pending.k === 'perk' ? `Level up · tier ${pending.tier} perk` : `Level up · evolve your ${GUNS[gun].name}`, hint);
    const list = document.createElement('div');
    list.className = 'perk-list';
    options.forEach((option, slot) => {
      const tile = isPerkId(option) ? perkTile(option) : gunTile(option);
      const b = document.createElement('button');
      b.type = 'button';
      b.className = tile.className;
      b.setAttribute('aria-label', tile.aria);
      const kbd = document.createElement('kbd');
      kbd.textContent = perkKeyLabel(slot);
      b.append(kbd, ...tile.parts);
      b.onclick = () => onPick(slot);
      list.append(b);
    });
    perkPanel.replaceChildren(title, list);
  };

  const sender = (name: string, label: string, title: string) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'chat-name';
    b.textContent = label;
    b.title = title;
    // A focused button would also take the Space that triggers the ability.
    b.onmousedown = (e) => e.preventDefault();
    b.onclick = () => onToggleMute(name);
    return b;
  };

  const renderChat = (lines: ChatLine[], muted: MutedNames, selfName: string | undefined, now: number, open: boolean) => {
    const entryAt = (e: ChatEntry) => (e.kind === 'said' ? e.line.at : e.at);
    const shown = chatEntries(lines, muted).slice(-CHAT_LINES).filter((e) => open || now - entryAt(e) < CHAT_VISIBLE_MS);
    const key = `${open}|${[...muted].join('\n')}|${shown.length}|${lines.at(-1)?.at ?? 0}`;
    if (key === keys.chat) return;
    keys.chat = key;
    chatLog.replaceChildren(...shown.map((e) => {
      const li = document.createElement('li');
      if (e.kind === 'muted') {
        const tag = document.createElement('span');
        tag.className = 'muted-tag';
        tag.textContent = 'muted';
        li.className = 'muted-line';
        li.append(sender(e.from, e.from, `Unmute ${e.from}`), tag);
        return li;
      }
      const l = e.line;
      if (!l.from) {
        li.className = 'system';
        li.append(l.text);
        return li;
      }
      const label = `${l.from}: `;
      const who = l.from === selfName ? Object.assign(document.createElement('b'), { textContent: label }) : sender(l.from, label, `Mute ${l.from}`);
      if (l.team) who.style.color = TEAM_COLORS[l.team];
      li.append(who, l.text);
      return li;
    }));
  };

  const renderBanner = (snap: Snapshot) => {
    const { winner, restartIn } = snap.match;
    const podium = topScorers(snap.leaderboard, PODIUM_SIZE);
    const key = winner === null ? '' : `${winner}|${seconds(restartIn)}|${podium.map((r) => `${r.id}:${r.score}`).join(',')}`;
    if (key === keys.banner) return;
    keys.banner = key;
    banner.hidden = winner === null;
    if (winner === null) return;
    const h = document.createElement('h2');
    h.textContent = `${winner} wins the round`;
    const list = document.createElement('ol');
    list.className = 'podium';
    list.append(...podium.map((r) => {
      const li = document.createElement('li');
      const name = document.createElement('span');
      name.textContent = r.name;
      if (r.team) name.style.color = TEAM_COLORS[r.team];
      const score = document.createElement('b');
      score.textContent = String(r.score);
      li.append(name, score);
      return li;
    }));
    const p = document.createElement('p');
    p.textContent = `Next round in ${seconds(restartIn)}s`;
    banner.replaceChildren(h, list, p);
  };

  const renderObjective = (state: ClientState, snap: Snapshot, now: number) => {
    if (state.phase === 'playing' && lastPhase !== 'playing') objectiveAt = now;
    lastPhase = state.phase;
    const team = snap.players.find((p) => p.id === snap.self.id)?.team ?? null;
    const show = objectiveVisible(state.phase, snap.match, now - objectiveAt);
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
    update(state: ClientState, s: Session, snap: Snapshot, now: number, muted: MutedNames) {
      const pending = snap.self.pending;
      const gun = selfOf(snap)?.gun;
      renderPick(state.phase === 'playing' && gun && pending?.level !== s.pickSentFor ? pending : null, gun ?? 'pistol');
      const selfName = snap.players.find((p) => p.id === snap.self.id)?.name ?? snap.leaderboard.find((r) => r.id === snap.self.id)?.name;
      renderChat(s.chat, muted, selfName, now, !chatInput.hidden);
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
