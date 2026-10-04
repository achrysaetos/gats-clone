import { ARMOR_IDS, COLOR_IDS, MODE_IDS, WEAPON_IDS, type ModeId } from '../shared/defs.ts';
import { parseLoadout, type Loadout } from '../shared/protocol.ts';

export type ServerInfo = { id: string; mode: ModeId; players: number; humans: number };
type Stats = { name: string; kills: number; deaths: number; score: number; games: number; best: number };
export type Account = { token: string; name: string };

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null;
const n = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : 0);

async function getJson(url: string, init?: RequestInit): Promise<unknown> {
  const res = await fetch(url, init);
  return res.json();
}

export async function fetchServers(): Promise<ServerInfo[]> {
  const data = await getJson('/api/servers');
  if (!Array.isArray(data)) return [];
  return data.flatMap((s): ServerInfo[] =>
    isObj(s) && (typeof s.id === 'string' || typeof s.id === 'number') && MODE_IDS.includes(s.mode as ModeId)
      ? [{ id: String(s.id), mode: s.mode as ModeId, players: n(s.players), humans: n(s.humans) }]
      : []);
}

export async function fetchStats(name: string): Promise<Stats | null> {
  const s = await getJson(`/api/stats/${encodeURIComponent(name)}`);
  if (!isObj(s) || typeof s.name !== 'string') return null;
  return { name: s.name, kills: n(s.kills), deaths: n(s.deaths), score: n(s.score), games: n(s.games), best: n(s.best) };
}

export async function authenticate(kind: 'login' | 'register', name: string, password: string): Promise<Account | { error: string }> {
  try {
    const r = await getJson(`/api/${kind}`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name, password }),
    });
    if (isObj(r) && typeof r.token === 'string' && typeof r.name === 'string') return { token: r.token, name: r.name };
    return { error: isObj(r) && typeof r.error === 'string' ? r.error : 'Unexpected server reply' };
  } catch {
    return { error: 'Could not reach server' };
  }
}

/** localStorage throws in some private modes and sandboxed frames; preferences are a convenience, never required. */
const store = {
  get(key: string): string | null {
    try { return localStorage.getItem(key); } catch { return null; }
  },
  set(key: string, value: string | null) {
    try {
      if (value === null) localStorage.removeItem(key);
      else localStorage.setItem(key, value);
    } catch {}
  },
};

export function loadAccount(): Account | null {
  const token = store.get('skirmish.token');
  const name = store.get('skirmish.account');
  return token && name ? { token, name } : null;
}

export function saveAccount(a: Account | null) {
  store.set('skirmish.token', a?.token ?? null);
  store.set('skirmish.account', a?.name ?? null);
}

export const loadName = () => store.get('skirmish.name') ?? '';
export const saveName = (name: string) => store.set('skirmish.name', name);

export function loadLoadout(): Loadout {
  let saved: unknown = null;
  try { saved = JSON.parse(store.get('skirmish.loadout') ?? 'null'); } catch {}
  return parseLoadout(saved) ?? { weapon: WEAPON_IDS[0], armor: ARMOR_IDS[1], color: COLOR_IDS[4] };
}

export const saveLoadout = (l: Loadout) => store.set('skirmish.loadout', JSON.stringify(l));
