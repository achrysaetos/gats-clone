import { badgeKey, CAREER, CAREER_IDS, CAREER_TIERS, KM_PX, MEDAL_IDS, MEDALS, type Badge, type CareerId, type MedalId } from '../shared/defs.ts';
import { careerArt, careerName, medalArt, medalSvg } from './medals.ts';

/**
 * A player's profile page (profile.html?name=...): their worn medal and career numbers, every lifetime track with the
 * highest rung reached and progress to the next, and every match medal with how often they have earned it.
 */
type ProfileJson = {
  name: string; kills: number; deaths: number; games: number; bestStreak: number; distance: number;
  medals: Partial<Record<MedalId, number>>; badges: Record<string, number>; firstSeen: number; featured: Badge | null;
};

const $ = (id: string) => document.getElementById(id)!;
const el = <K extends keyof HTMLElementTagNameMap>(tag: K, cls = '', text = ''): HTMLElementTagNameMap[K] => {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text) n.textContent = text;
  return n;
};

function count(p: ProfileJson, track: CareerId): number {
  const needs = CAREER[track].needs;
  if (needs === 'km') return Math.floor(p.distance / KM_PX);
  if (needs === 'kills' || needs === 'games' || needs === 'bestStreak') return p[needs];
  return p.medals[needs] ?? 0;
}

function trackCard(p: ProfileJson, track: CareerId): HTMLElement {
  const def = CAREER[track];
  const have = count(p, track);
  const top = [3, 2, 1, 0].find((t) => p.badges[badgeKey({ track, tier: t as Badge['tier'] })] !== undefined);
  const card = el('div', `career-card${top === undefined ? ' locked' : ''}`);
  const shown: Badge = { track, tier: (top ?? 0) as Badge['tier'] };
  card.innerHTML = medalSvg(careerArt(shown), 96, careerName(shown));
  card.append(el('b', '', top === undefined ? def.name : careerName(shown)));
  const next = def.at.find((n) => have < n);
  const line = el('span', 'career-line', next === undefined ? `Maxed · ${have.toLocaleString('en-US')} ${def.unit}` : `${have.toLocaleString('en-US')} / ${next.toLocaleString('en-US')} ${def.unit}`);
  const bar = el('i', 'career-bar');
  const from = top === undefined ? 0 : def.at[top]!;
  bar.style.setProperty('--v', next === undefined ? '100%' : `${Math.round(((have - from) / (next - from)) * 100)}%`);
  card.append(line, bar);
  if (top !== undefined) card.title = `${CAREER_TIERS[top]} · earned ${new Date(p.badges[badgeKey(shown)]!).toLocaleDateString()}`;
  return card;
}

function medalCard(p: ProfileJson, id: MedalId): HTMLElement {
  const n = p.medals[id] ?? 0;
  const card = el('div', `medal-card${n ? '' : ' locked'}`);
  card.innerHTML = medalSvg(medalArt(id), 72, MEDALS[id].name);
  card.append(el('b', '', MEDALS[id].name), el('span', 'medal-count', `×${n.toLocaleString('en-US')}`));
  card.title = `${MEDALS[id].desc} · +${MEDALS[id].score}`;
  return card;
}

function render(p: ProfileJson) {
  document.title = `${p.name} · Skirmish`;
  const head = $('profile-head');
  head.replaceChildren();
  const worn = el('div', 'profile-worn');
  if (p.featured) worn.innerHTML = medalSvg(careerArt(p.featured), 132, careerName(p.featured));
  const who = el('div', 'profile-who');
  who.append(el('h1', 'profile-name', p.name), el('p', 'profile-sub', p.featured ? `Wears ${careerName(p.featured)}` : 'No lifetime medal yet'));
  head.append(worn, who);
  const kd = p.deaths ? (p.kills / p.deaths).toFixed(2) : String(p.kills);
  const stats: [string, string][] = [
    ['Kills', p.kills.toLocaleString('en-US')], ['Deaths', p.deaths.toLocaleString('en-US')], ['K/D', kd],
    ['Matches', p.games.toLocaleString('en-US')], ['Best streak', String(p.bestStreak)], ['Walked', `${(p.distance / KM_PX).toFixed(1)} km`],
  ];
  $('profile-stats').replaceChildren(...stats.map(([label, value]) => {
    const d = el('div');
    d.append(el('dt', '', label), el('dd', '', value));
    return d;
  }));
  const earned = Object.keys(p.badges).length;
  $('career-count').textContent = `${earned} of ${CAREER_IDS.length * 4}`;
  $('career').replaceChildren(...CAREER_IDS.map((t) => trackCard(p, t)));
  $('medal-grid').replaceChildren(...MEDAL_IDS.map((id) => medalCard(p, id)));
}

async function load(name: string) {
  $('profile-status').textContent = 'Loading…';
  $('profile-body').hidden = true;
  try {
    const res = await fetch(`/api/profile/${encodeURIComponent(name)}`);
    if (res.status === 404) { $('profile-status').textContent = `No one called ${name} has played yet.`; return; }
    if (!res.ok) throw new Error(String(res.status));
    render(await res.json() as ProfileJson);
    $('profile-status').textContent = '';
    $('profile-body').hidden = false;
  } catch {
    $('profile-status').textContent = 'Could not load the profile. Try again in a moment.';
  }
}

const form = $('profile-search') as HTMLFormElement;
const input = $('profile-name-input') as HTMLInputElement;
form.addEventListener('submit', (e) => {
  e.preventDefault();
  const name = input.value.trim();
  if (!name) return;
  history.replaceState(null, '', `?name=${encodeURIComponent(name)}`);
  void load(name);
});
const asked = new URLSearchParams(location.search).get('name');
if (asked) { input.value = asked; void load(asked); } else $('profile-status').textContent = 'Look up a player by name.';
