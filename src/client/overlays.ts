import { GUNS, isPerkId, PERK_INFO, pickOptions, type GunId, type PendingPick, type PerkId } from '../shared/defs.ts';
import type { Snapshot } from '../shared/protocol.ts';
import { selfOf } from './derive.ts';
import { chatEntries, type ChatEntry, type MutedNames } from './chatmute.ts';
import { clock, deathScreenArmed, deathText, nextObjectiveSeen, NO_OBJECTIVE_SEEN, OBJECTIVE_MS, objectiveFor, objectiveVisible, roundPodium, roundTimeLeft, seconds } from './derive.ts';
import { serverNow } from './interp.ts';
import { PERK_ICONS, iconSvg } from './icons.ts';
import { perkKeyLabel } from './input.ts';
import { $ } from './menu.ts';
import { TEAM_COLORS } from './palette.ts';
import { drawSilhouette } from './sprites.ts';
import type { ChatLine, ClientState, Session } from './state.ts';
import { outTillDawnText, reportRows, reportTitle, turretLine } from './zombies.ts';

const CHAT_VISIBLE_MS = 15000;

/** Tile labels short enough for a 58px tile. */
const PERK_SHORT: Record<PerkId, string> = {
  optics: 'Optics', thermal: 'Thermal', ghillie: 'Ghillie', piercing: 'Piercing', extended: 'Ext. mag',
  grip: 'Grip', silencer: 'Silencer', lightweight: 'Light', longRange: 'Range', quickReload: 'Reload', choke: 'Choke', shield: 'Shield', thickSkin: 'Thick skin',
  firstAid: 'First aid', grenade: 'Grenade', fragGrenade: 'Frag', gasGrenade: 'Gas', landMine: 'Mine', knife: 'Knife',
  engineer: 'Engineer', dash: 'Dash',
};
const CHAT_LINES = 8;
const PERK_DESC_HINT = 'Hover a choice to read what it does.';
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
  const deathCause = $('death-cause');
  const deathLost = $('death-lost');
  const respawn = $<HTMLButtonElement>('respawn');
  const report = $('report');
  const deathLoadout = $('loadout-death');
  respawn.onclick = onRespawn;
  const keys = { perk: '', chat: '', banner: '', death: '', objective: '', report: '' };
  let objectiveSeen = NO_OBJECTIVE_SEEN;
  let deathAt = -Infinity;

  const perkTile = (perk: PerkId) => {
    const { name, desc } = PERK_INFO[perk];
    const icon = iconSvg(PERK_ICONS[perk], 'perk-icon');
    const label = document.createElement('b');
    label.textContent = PERK_SHORT[perk];
    const line = document.createElement('small');
    line.className = 'perk-line';
    line.textContent = desc;
    return { className: 'perk', name, desc, parts: [icon, label, line] };
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
    return { className: 'perk evolve', name, desc, parts: [art, label, detail] };
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
    const desc = document.createElement('p');
    desc.className = 'perk-desc';
    const describe = (tile?: { name: string; desc: string }) => {
      if (!tile) return desc.replaceChildren(PERK_DESC_HINT);
      const name = document.createElement('strong');
      name.textContent = tile.name;
      desc.replaceChildren(name, ` · ${tile.desc}`);
    };
    describe();
    const list = document.createElement('div');
    list.className = 'perk-list';
    options.forEach((option, slot) => {
      const tile = isPerkId(option) ? perkTile(option) : gunTile(option);
      const b = document.createElement('button');
      b.type = 'button';
      b.className = tile.className;
      b.setAttribute('aria-label', `${tile.name}: ${tile.desc}`);
      const kbd = document.createElement('kbd');
      kbd.textContent = perkKeyLabel(slot);
      b.append(kbd, ...tile.parts);
      b.onclick = () => onPick(slot);
      b.onmouseenter = b.onfocus = () => describe(tile);
      b.onmouseleave = b.onblur = () => describe();
      list.append(b);
    });
    perkPanel.replaceChildren(title, desc, list);
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
    const { rows: podium, score: teamLine } = roundPodium(snap.match, snap.leaderboard, PODIUM_SIZE);
    const key = winner === null ? '' : `${winner.name}|${winner.note}|${teamLine}|${seconds(restartIn)}|${podium.map((r) => `${r.id}:${r.kills}`).join(',')}`;
    if (key === keys.banner) return;
    keys.banner = key;
    banner.hidden = winner === null;
    if (winner === null) return;
    const h = document.createElement('h2');
    h.textContent = `${winner.name} wins the round`;
    const note = document.createElement('p');
    note.textContent = winner.note ?? '';
    note.hidden = winner.note === null;
    const teamScore = document.createElement('p');
    teamScore.className = 'team-score';
    teamScore.textContent = teamLine ?? '';
    teamScore.hidden = teamLine === null;
    const list = document.createElement('ol');
    list.className = 'podium';
    list.append(...podium.map((r) => {
      const li = document.createElement('li');
      const name = document.createElement('span');
      name.textContent = r.name;
      if (r.team) name.style.color = TEAM_COLORS[r.team];
      const score = document.createElement('b');
      score.textContent = String(r.kills);
      li.append(name, score);
      return li;
    }));
    const p = document.createElement('p');
    p.textContent = `Next round in ${seconds(restartIn)}s`;
    banner.replaceChildren(h, note, teamScore, list, p);
  };

  const renderObjective = (state: ClientState, snap: Snapshot, now: number, clockNow: number | null) => {
    const team = snap.players.find((p) => p.id === snap.self.id)?.team ?? null;
    objectiveSeen = nextObjectiveSeen(objectiveSeen, state.phase, snap.match, team, now);
    const show = objectiveVisible(state.phase, snap.match, now - objectiveSeen.at);
    const key = show ? `${objectiveSeen.at}|${snap.match.mode}|${team}` : '';
    if (key === keys.objective) return;
    keys.objective = key;
    objective.hidden = !show;
    if (!show) return;
    objective.textContent = objectiveFor(snap.match.mode, team, roundTimeLeft(snap.match, clockNow)).banner;
    objective.style.animationDuration = `${OBJECTIVE_MS}ms`;
    objective.style.borderColor = team && !snap.run ? TEAM_COLORS[team] : '';
    objective.classList.toggle('siege', !!snap.run);
  };

  const renderReport = (snap: Snapshot, clockNow: number | null) => {
    const run = snap.run;
    const done = run?.phase === 'over' && run.report ? run.report : null;
    const left = done && run?.phaseEndsAt != null && clockNow !== null ? seconds(run.phaseEndsAt - clockNow) : null;
    const key = done ? `${done.won}|${done.night}|${left}|${done.players.map((p) => `${p.name}:${p.kills}:${p.revives}:${p.built}`).join(',')}|${turretLine(done)}` : '';
    if (key === keys.report) return;
    keys.report = key;
    report.hidden = !done;
    if (!done) return;
    report.classList.toggle('won', done.won);
    const h = document.createElement('h2');
    h.textContent = reportTitle(done);
    const length = document.createElement('p');
    length.textContent = `The run lasted ${clock(done.durationMs)}`;
    const table = document.createElement('table');
    const head = document.createElement('tr');
    for (const label of ['Player', 'Kills', 'Revives', 'Built']) head.append(Object.assign(document.createElement('th'), { textContent: label }));
    table.append(head, ...reportRows(done, snap.players.find((p) => p.id === snap.self.id)?.name).map((r) => {
      const tr = document.createElement('tr');
      if (r.you) tr.className = 'you';
      for (const v of [r.name, r.kills, r.revives, r.built]) tr.append(Object.assign(document.createElement('td'), { textContent: String(v) }));
      return tr;
    }));
    const turrets = turretLine(done);
    const next = document.createElement('p');
    next.textContent = left === null ? 'A fresh run starts soon' : `Next run in ${left}s`;
    report.replaceChildren(h, length, table, ...(turrets ? [Object.assign(document.createElement('p'), { textContent: turrets })] : []), next);
  };

  const renderDeath = (state: ClientState, snap: Snapshot, now: number) => {
    const dead = state.phase === 'dead';
    if (dead && death.hidden) deathAt = now;
    const inert = dead && !deathScreenArmed(deathAt, now);
    if (death.inert !== inert) death.inert = inert;
    const wait = seconds(snap.self.respawnIn);
    const run = snap.run;
    const key = dead ? `${state.kill?.killer}|${state.kill?.weapon}|${wait}|${run?.phase}|${run?.waveLeft}` : '';
    if (key === keys.death) return;
    keys.death = key;
    death.hidden = !dead;
    if (!dead) return;
    respawn.hidden = deathLoadout.hidden = !!run;
    if (run) {
      // Dawn gets everyone up, so a death this run can only be tonight's bleed-out; a night joiner has none.
      const text = outTillDawnText(run, snap.self.deaths > 0, snap.self.respawnIn);
      deathTitle.textContent = text.title;
      deathSub.textContent = text.sub;
      deathCause.hidden = deathLost.hidden = true;
      return;
    }
    const text = deathText(state.kill, state.loss);
    deathTitle.textContent = text.title;
    deathCause.textContent = text.cause;
    deathCause.hidden = !text.cause;
    deathLost.textContent = text.lost;
    deathLost.hidden = !text.lost;
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
      perkPanel.classList.toggle('siege', !!snap.run);
      // Build mode takes the number keys and the strip above the hints, so the dock waits until it is done.
      renderPick(state.phase === 'playing' && !s.building && gun && pending?.level !== s.pickSentFor ? pending : null, gun ?? 'pistol');
      const selfName = snap.players.find((p) => p.id === snap.self.id)?.name ?? snap.leaderboard.find((r) => r.id === snap.self.id)?.name;
      renderChat(s.chat, muted, selfName, now, !chatInput.hidden);
      renderBanner(snap);
      renderObjective(state, snap, now, serverNow(s.snaps, now));
      renderDeath(state, snap, now);
      renderReport(snap, serverNow(s.snaps, now));
    },
    reset() {
      keys.perk = keys.chat = keys.banner = keys.death = keys.objective = keys.report = '';
      objectiveSeen = NO_OBJECTIVE_SEEN;
      perkPanel.hidden = banner.hidden = death.hidden = objective.hidden = report.hidden = true;
      chatLog.replaceChildren();
      chatInput.hidden = true;
    },
  };
}
