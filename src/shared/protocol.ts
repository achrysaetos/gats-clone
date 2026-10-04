import {
  ARMOR_IDS, COLOR_IDS, PERK_TIERS, WEAPON_IDS,
  type AbilityId, type ArmorId, type ColorId, type GunId, type ModeId, type PerkId, type Tier, type WeaponId,
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

export const VIEW_ASPECT = { min: 1, max: 16 / 9 } as const;
export const VIEW_PRELOAD_MARGIN = 64;
export const clampAspect = (aspect: number): number => Math.min(VIEW_ASPECT.max, Math.max(VIEW_ASPECT.min, aspect));
/** The world a player can see: the view radius across, and as much height as the screen's shape allows. Camera, server culling and bot sight all use it, so nobody is hit from off screen. */
export const viewExtents = (viewRadius: number, aspect: number): { halfW: number; halfH: number } => ({ halfW: viewRadius, halfH: viewRadius / clampAspect(aspect) });

export type ClientMsg =
  | { t: 'join'; name: string; loadout: Loadout; token?: string; aspect: number }
  | { t: 'view'; aspect: number }
  /** `viewAt` is the server time of the world the client was drawing when it sampled `input`, so the server can judge its shots against that world. */
  | { t: 'input'; seq: number; input: InputState; viewAt: number | null }
  | { t: 'perk'; tier: Tier; perk: PerkId }
  | { t: 'chat'; text: string }
  | { t: 'respawn'; loadout: Loadout };

export type PlayerView = {
  id: number; name: string; x: number; y: number; angle: number;
  hp: number; maxHp: number; armor: number; maxArmor: number;
  color: ColorId; gun: GunId; team: Team;
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
  | { e: 'shot'; x: number; y: number; angle: number; silenced: boolean; owner: number }
  | { e: 'slash'; x: number; y: number; angle: number; owner: number };

export type LeaderRow = { id: number; name: string; score: number; team: Team };
/** `mapChangeIn` counts down to the next map once it is close enough to announce, and is 0 otherwise. */
export type MatchView = { mode: ModeId; map: string; nextMap: string; mapChangeIn: number; teamScore: { red: number; blue: number }; winner: string | null; restartIn: number };

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
type StickyKey = (typeof STICKY_KEYS)[number];
export type SnapshotWire = Omit<Snapshot, StickyKey> & Partial<Pick<Snapshot, StickyKey>>;

export type ServerMsg =
  /** `account` is the signed-in account name, or null when the join had no token or an invalid or expired one. */
  | { t: 'welcome'; id: number; mode: ModeId; worldSize: number; walls: WallView[]; account: string | null }
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

const parseAspect = (v: unknown): number => num(v, VIEW_ASPECT.min, VIEW_ASPECT.max) ?? VIEW_ASPECT.max;

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
      return { t: 'join', name: cleanName(v.name), loadout, token: typeof v.token === 'string' ? v.token.slice(0, 128) : undefined, aspect: parseAspect(v.aspect) };
    }
    case 'view':
      return { t: 'view', aspect: parseAspect(v.aspect) };
    case 'input': {
      const input = parseInput(v.input);
      const seq = num(v.seq, 0, Number.MAX_SAFE_INTEGER);
      return input && seq !== null ? { t: 'input', seq, input, viewAt: num(v.viewAt, 0, Number.MAX_SAFE_INTEGER) } : null;
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
