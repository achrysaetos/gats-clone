import {
  ARMOR_IDS, COLOR_IDS, MODE_IDS, PERK_TIERS, WEAPON_IDS,
  type AbilityId, type ArmorId, type ColorId, type ModeId, type PerkId, type Tier, type WeaponId,
} from './defs.ts';

export type Loadout = { weapon: WeaponId; armor: ArmorId; color: ColorId };
export type Team = 'red' | 'blue' | null;

export type InputState = {
  up: boolean; down: boolean; left: boolean; right: boolean;
  angle: number;
  fire: boolean;
  /** Trigger presses since the connection opened. Monotonic, so a press and release between two samples still counts. */
  shots: number;
  reload: boolean;
  ability: boolean;
  aimDist: number;
};

export type ClientMsg =
  | { t: 'join'; name: string; loadout: Loadout; token?: string }
  | { t: 'input'; seq: number; input: InputState }
  | { t: 'perk'; tier: Tier; perk: PerkId }
  | { t: 'chat'; text: string }
  | { t: 'respawn'; loadout: Loadout };

export type PlayerView = {
  id: number; name: string; x: number; y: number; angle: number;
  hp: number; maxHp: number; armor: number; maxArmor: number;
  color: ColorId; weapon: WeaponId; team: Team;
  alive: boolean; hidden: boolean; shield: boolean; dashing: boolean;
  score: number; level: number;
  armorTier: ArmorId;
};

export type BulletView = { id: number; x: number; y: number; vx: number; vy: number; owner: number };
export type CrateView = { id: number; x: number; y: number; hp: number; size: number };
export type WallView = { x: number; y: number; w: number; h: number; built: boolean };
export type ThrownKind = 'grenade' | 'fragGrenade' | 'gasGrenade' | 'landMine' | 'gasCloud';
export type ThrownView = { id: number; kind: ThrownKind; x: number; y: number; r: number; owner: number };
export type ZoneView = { id: number; x: number; y: number; r: number; owner: Team; capturing: Team; progress: number };

export type Dash = { dirX: number; dirY: number; leftMs: number };

export type SelfView = {
  id: number; ammo: number; mag: number; reloading: boolean;
  /** 0..1 through the current reload, 0 when not reloading. */
  reloadFrac: number;
  /** Move speed without a dash, for predicting the local player's movement. */
  speed: number;
  perks: Partial<Record<Tier, PerkId>>;
  pendingTier: Tier | null;
  ability: AbilityId | null; abilityReadyIn: number;
  alive: boolean;
  /** The dash in progress, so the client can replay it from the server's position. */
  dash: Dash | null;
  respawnIn: number;
  kills: number; deaths: number;
  viewRadius: number;
};

/** `victim` is a player id for 'player' and a crate id for 'crate'; both come from the world's one id sequence. */
export type DamageKind = 'player' | 'crate';

export type GameEvent =
  | { e: 'kill'; killer: string; victim: string; killerId: number | null; victimId: number; weapon: string }
  | { e: 'dmg'; attacker: number | null; victim: number; amount: number; x: number; y: number; kind: DamageKind }
  | { e: 'impact'; x: number; y: number }
  | { e: 'boom'; x: number; y: number; r: number }
  | { e: 'shot'; x: number; y: number; angle: number; silenced: boolean; owner: number };

export type LeaderRow = { id: number; name: string; score: number; team: Team };
export type MatchView = { mode: ModeId; teamScore: { red: number; blue: number }; winner: string | null; restartIn: number };

export type Snapshot = {
  t: 'snap';
  tick: number;
  ackSeq: number;
  self: SelfView;
  players: PlayerView[];
  bullets: BulletView[];
  crates: CrateView[];
  thrown: ThrownView[];
  zones: ZoneView[];
  minimap: { x: number; y: number; team: Team }[];
  leaderboard: LeaderRow[];
  match: MatchView;
  events: GameEvent[];
};

/** Fields that change rarely; the wire omits each one while it is unchanged since the last snapshot sent to that client. */
export const STICKY_KEYS = ['crates', 'leaderboard', 'zones', 'match'] as const;
export type StickyKey = (typeof STICKY_KEYS)[number];
export type SnapshotWire = Omit<Snapshot, StickyKey> & Partial<Pick<Snapshot, StickyKey>>;

export type ServerMsg =
  | { t: 'welcome'; id: number; mode: ModeId; worldSize: number; walls: WallView[] }
  | { t: 'walls'; walls: WallView[] }
  | SnapshotWire
  | { t: 'chat'; from: string; text: string; team: Team }
  | { t: 'error'; message: string };

const oneOf = <T extends string>(xs: readonly T[], v: unknown): v is T => typeof v === 'string' && (xs as readonly string[]).includes(v);
const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null;
const num = (v: unknown, lo: number, hi: number) => (typeof v === 'number' && Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : null);

export function parseLoadout(v: unknown): Loadout | null {
  if (!isObj(v)) return null;
  if (!oneOf(WEAPON_IDS, v.weapon) || !oneOf(ARMOR_IDS, v.armor) || !oneOf(COLOR_IDS, v.color)) return null;
  return { weapon: v.weapon, armor: v.armor, color: v.color };
}

export const NAME_MAX = 16;

export function cleanName(v: unknown): string {
  const s = typeof v === 'string' ? v.replace(/[^\p{L}\p{N} _.\-]/gu, '').trim().slice(0, NAME_MAX) : '';
  return s || 'Unnamed';
}

function parseInput(v: unknown): InputState | null {
  if (!isObj(v)) return null;
  const angle = num(v.angle, -10, 10);
  const aimDist = num(v.aimDist, 0, 2000);
  const shots = num(v.shots ?? 0, 0, Number.MAX_SAFE_INTEGER);
  if (angle === null || aimDist === null || shots === null) return null;
  const b = (k: string) => v[k] === true;
  return {
    up: b('up'), down: b('down'), left: b('left'), right: b('right'), angle, aimDist,
    fire: b('fire'), shots: Math.floor(shots), reload: b('reload'), ability: b('ability'),
  };
}

export function parseClientMsg(raw: string): ClientMsg | null {
  let v: unknown;
  try { v = JSON.parse(raw); } catch { return null; }
  if (!isObj(v)) return null;
  switch (v.t) {
    case 'join': {
      const loadout = parseLoadout(v.loadout);
      if (!loadout) return null;
      return { t: 'join', name: cleanName(v.name), loadout, token: typeof v.token === 'string' ? v.token.slice(0, 128) : undefined };
    }
    case 'input': {
      const input = parseInput(v.input);
      const seq = num(v.seq, 0, Number.MAX_SAFE_INTEGER);
      return input && seq !== null ? { t: 'input', seq, input } : null;
    }
    case 'perk': {
      const tier = v.tier;
      if (tier !== 1 && tier !== 2 && tier !== 3) return null;
      return oneOf(PERK_TIERS[tier], v.perk) ? { t: 'perk', tier, perk: v.perk } : null;
    }
    case 'chat':
      return typeof v.text === 'string' && v.text.trim() ? { t: 'chat', text: v.text.trim().slice(0, 120) } : null;
    case 'respawn': {
      const loadout = parseLoadout(v.loadout);
      return loadout ? { t: 'respawn', loadout } : null;
    }
    default:
      return null;
  }
}

export const isMode = (v: unknown): v is ModeId => oneOf(MODE_IDS, v);
