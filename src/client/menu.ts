import { ARMORS, ARMOR_IDS, COLORS, COLOR_IDS, GUNS, WEAPON_IDS } from '../shared/defs.ts';
import type { Loadout } from '../shared/protocol.ts';
import { authenticate, fetchStats, loadAccount, saveAccount, type Account, type ServerInfo } from './api.ts';
import type { MutedNames } from './chatmute.ts';
import { CONTROLS } from './input.ts';
import { drawSilhouette } from './sprites.ts';

export const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;

function el<K extends keyof HTMLElementTagNameMap>(tag: K, props: Partial<HTMLElementTagNameMap[K]> = {}, ...kids: (Node | string)[]): HTMLElementTagNameMap[K] {
  const node: HTMLElementTagNameMap[K] = Object.assign(document.createElement(tag), props);
  node.append(...kids);
  return node;
}

type LoadoutPicker = { refresh(): void };

export function mountLoadoutPicker(root: HTMLElement, get: () => Loadout, set: (l: Loadout) => void): LoadoutPicker {
  const weaponButtons = WEAPON_IDS.map((id) => {
    const w = GUNS[id];
    const art = el('canvas', { width: 120, height: 48, className: 'gun-art' });
    const b = el('button', { type: 'button', className: 'tile weapon', title: w.name },
      art, el('b', {}, w.name), el('small', {}, `${w.damage}${w.pellets > 1 ? `×${w.pellets}` : ''} dmg · ${w.mag} mag`));
    b.onclick = () => set({ ...get(), weapon: id });
    return [id, b, art] as const;
  });
  const colorButtons = COLOR_IDS.map((id) => {
    const b = el('button', { type: 'button', className: 'swatch', title: id, ariaLabel: id });
    b.style.setProperty('--swatch', COLORS[id]);
    b.onclick = () => set({ ...get(), color: id });
    return [id, b] as const;
  });
  const armorButtons = ARMOR_IDS.map((id) => {
    const a = ARMORS[id];
    const speed = Math.round((1 - a.speedMul) * 100);
    const meter = el('span', { className: 'meter' }, el('i'));
    meter.style.setProperty('--fill', `${(a.blockFrac / ARMORS.heavy.blockFrac) * 100}%`);
    const cost = a.blockFrac
      ? [el('small', {}, `+${Math.round(a.blockFrac * 100)}% dmg blocked`), el('small', {}, `−${speed}% speed`)]
      : [el('small', {}, 'Full speed')];
    const b = el('button', { type: 'button', className: 'tile armor' }, el('b', {}, a.name), meter, ...cost);
    b.onclick = () => set({ ...get(), armor: id });
    return [id, b] as const;
  });
  root.replaceChildren(
    el('h2', {}, 'Weapon'), el('div', { className: 'weapons' }, ...weaponButtons.map(([, b]) => b)),
    el('h2', {}, 'Color'), el('div', { className: 'swatches' }, ...colorButtons.map(([, b]) => b)),
    el('h2', {}, 'Armor'), el('div', { className: 'armors' }, ...armorButtons.map(([, b]) => b)),
  );
  const refresh = () => {
    const l = get();
    for (const [id, b, art] of weaponButtons) {
      b.ariaPressed = String(id === l.weapon);
      drawSilhouette(art, id, id === l.weapon ? COLORS[l.color] : '#c9ced8');
    }
    for (const [id, b] of colorButtons) b.ariaPressed = String(id === l.color);
    for (const [id, b] of armorButtons) b.ariaPressed = String(id === l.armor);
  };
  refresh();
  return { refresh };
}

export function renderControls(root: HTMLElement) {
  root.replaceChildren(...CONTROLS.flatMap(([key, what]) => [el('dt', {}, el('kbd', {}, key)), el('dd', {}, what)]));
}

export function renderMuted(root: HTMLElement, muted: MutedNames, unmute: (name: string) => void) {
  root.hidden = muted.size === 0;
  root.replaceChildren(el('h2', {}, 'Muted in chat'), el('ul', { className: 'muted-list' }, ...[...muted].map((name) => {
    const b = el('button', { type: 'button', className: 'link' }, 'Unmute');
    b.onclick = () => unmute(name);
    return el('li', {}, el('span', {}, name), b);
  })));
}

export function renderServers(root: HTMLElement, servers: ServerInfo[] | null, selected: string | null, pick: (id: string) => void) {
  if (servers === null) {
    root.replaceChildren(el('p', { className: 'muted' }, 'Could not load servers. Retrying…'));
    return;
  }
  if (!servers.length) {
    root.replaceChildren(el('p', { className: 'muted' }, 'No servers running.'));
    return;
  }
  root.replaceChildren(...servers.map((s) => {
    const b = el('button', { type: 'button', className: 'server' },
      el('span', { className: `mode mode-${s.mode.toLowerCase()}` }, s.mode),
      el('span', { className: 'server-name' }, `Room ${s.id}`),
      el('span', { className: 'count' }, `${s.players} players`, el('small', {}, ` · ${s.humans} human`)));
    b.ariaPressed = String(s.id === selected);
    b.onclick = () => pick(s.id);
    return b;
  }));
}

type SquadMenu = { code: string | null; selected: boolean; link: string | null; busy: boolean };

/** Starting a squad joins it at once; a squad from an invite link waits to be picked like any room. */
export function renderSquad(root: HTMLElement, squad: SquadMenu, on: { start(): void; pick(): void }) {
  const start = el('button', { type: 'button', id: 'squad-start', className: 'secondary', disabled: squad.busy }, squad.busy ? 'Starting…' : squad.code ? 'New squad' : 'Start a squad');
  start.onclick = on.start;
  const pitch = el('div', { className: 'squad-pitch' }, el('span', {}, 'Hold the core against the horde with up to three friends.'), start);
  if (!squad.code || !squad.link) { root.replaceChildren(pitch); return; }
  const room = el('button', { type: 'button', className: 'server', id: 'squad-room' },
    el('span', { className: 'mode mode-zom' }, 'ZOM'),
    el('span', { className: 'server-name' }, `Squad ${squad.code}`),
    el('span', { className: 'count' }, 'private'));
  room.ariaPressed = String(squad.selected);
  room.onclick = on.pick;
  const link = el('input', { id: 'squad-link', readOnly: true, value: squad.link, ariaLabel: 'Invite link' });
  const copy = el('button', { type: 'button', id: 'squad-copy' }, 'Copy link');
  copy.onclick = () => void copyText(link.value, copy);
  root.replaceChildren(room, el('div', { className: 'invite' }, link, copy), pitch);
}

async function copyText(text: string, button: HTMLButtonElement) {
  const label = button.textContent;
  let ok = false;
  try {
    await navigator.clipboard.writeText(text);
    ok = true;
  } catch {
    const scratch = el('textarea', { value: text });
    document.body.append(scratch);
    scratch.select();
    ok = document.execCommand('copy');
    scratch.remove();
  }
  button.textContent = ok ? 'Copied' : 'Copy failed';
  setTimeout(() => { button.textContent = label; }, 1600);
}

export function renderSquadChip(root: HTMLElement, code: string | null, link: string | null) {
  root.hidden = code === null;
  if (!code || !link) return;
  const copy = el('button', { type: 'button', id: 'squad-chip-copy' }, 'Copy invite link');
  // A focused button would also take the Space that triggers the ability.
  copy.onmousedown = (e) => e.preventDefault();
  copy.onclick = () => void copyText(link, copy);
  root.replaceChildren(el('span', {}, `Squad ${code}`), copy);
}

export function mountAccount(root: HTMLElement, onChange: (a: Account | null) => void): { current(): Account | null; expire(message: string): void } {
  let account = loadAccount();

  const showSignedIn = (a: Account) => {
    const stats = el('dl', { className: 'stats' }, el('dd', { className: 'muted' }, 'Loading stats…'));
    const out = el('button', { type: 'button', className: 'link' }, 'Log out');
    out.onclick = () => { account = null; saveAccount(null); onChange(null); showSignedOut(); };
    root.replaceChildren(el('h2', {}, 'Account'), el('p', {}, 'Signed in as ', el('b', {}, a.name), ' ', out), stats);
    fetchStats(a.name).then((s) => {
      if (!s) { stats.replaceChildren(el('dd', { className: 'muted' }, 'No games yet.')); return; }
      const kd = s.deaths ? (s.kills / s.deaths).toFixed(2) : String(s.kills);
      const cells: [string, string | number][] = [['Kills', s.kills], ['Deaths', s.deaths], ['K/D', kd], ['Score', s.score], ['Games', s.games], ['Best', s.best]];
      stats.replaceChildren(...cells.map(([k, v]) => el('div', {}, el('dt', {}, k), el('dd', {}, String(v)))));
    }).catch(() => stats.replaceChildren(el('dd', { className: 'muted' }, 'Stats unavailable.')));
  };

  const showSignedOut = (notice = '') => {
    const name = el('input', { placeholder: 'Account name', autocomplete: 'username', maxLength: 16, required: true });
    const pass = el('input', { type: 'password', placeholder: 'Password', autocomplete: 'current-password', required: true });
    const msg = el('p', { className: 'status', role: 'status' }, notice);
    const login = el('button', { type: 'submit' }, 'Log in');
    const register = el('button', { type: 'button', className: 'secondary' }, 'Register');
    const form = el('form', { className: 'auth' }, name, pass, el('div', { className: 'row' }, login, register), msg);
    const submit = async (kind: 'login' | 'register') => {
      if (!form.reportValidity()) return;
      msg.textContent = kind === 'login' ? 'Logging in…' : 'Creating account…';
      const r = await authenticate(kind, name.value, pass.value);
      if ('error' in r) { msg.textContent = r.error; return; }
      account = r;
      saveAccount(r);
      onChange(r);
      showSignedIn(r);
    };
    form.onsubmit = (e) => { e.preventDefault(); void submit('login'); };
    register.onclick = () => void submit('register');
    root.replaceChildren(el('h2', {}, 'Account'), el('p', { className: 'muted' }, 'Log in to keep stats across games.'), form);
  };

  if (account) showSignedIn(account);
  else showSignedOut();
  return {
    current: () => account,
    expire(message) {
      account = null;
      saveAccount(null);
      onChange(null);
      showSignedOut(message);
    },
  };
}
