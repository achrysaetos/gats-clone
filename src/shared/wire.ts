import type { Cos } from './cosmetics.ts';
import { STICKY_KEYS, type PlayerView, type Snapshot, type SnapshotWire } from './protocol.ts';

const DECIMALS: Readonly<Record<string, number>> = { angle: 2, progress: 2, reloadFrac: 2, suppression: 2, vx: 0, vy: 0, dirX: 3, dirY: 3, abilityReadyIn: 0, respawnIn: 0, restartIn: 0, mapChangeIn: 0 };

const round = (key: string, v: unknown) => {
  if (typeof v !== 'number' || Number.isInteger(v)) return v;
  const f = 10 ** (DECIMALS[key] ?? 1);
  return Math.round(v * f) / f;
};

const stringify = (v: unknown) => JSON.stringify(v, round);

export function makeSnapshotEncoder(): (snap: Snapshot) => string {
  const lastSent = new Map<string, string>();
  return (snap) => {
    const wire: SnapshotWire = { ...snap, minimap: snap.minimap.map((m) => ({ ...m, x: Math.round(m.x), y: Math.round(m.y) })) };
    // Cosmetics change rarely, so they ride apart from the players and are resent only when the set in view changes.
    if (snap.players.some((p) => p.cos)) {
      const cos: Record<number, Cos> = {};
      wire.players = snap.players.map(({ cos: c, ...rest }) => { if (c) cos[rest.id] = c; return rest as PlayerView; });
      const json = stringify(cos);
      if (lastSent.get('cos') !== json) { lastSent.set('cos', json); wire.cos = cos; }
    } else if (lastSent.has('cos') && lastSent.get('cos') !== '{}') { lastSent.set('cos', '{}'); wire.cos = {}; }
    for (const key of STICKY_KEYS) {
      const json = stringify(snap[key]);
      if (lastSent.get(key) === json) delete wire[key];
      else lastSent.set(key, json);
    }
    return stringify(wire);
  };
}

export function fillSnapshot(wire: SnapshotWire, last: Snapshot | null): Snapshot | null {
  const crates = wire.crates ?? last?.crates;
  const leaderboard = wire.leaderboard ?? last?.leaderboard;
  const zones = wire.zones ?? last?.zones;
  const match = wire.match ?? last?.match;
  if (!crates || !leaderboard || !zones || !match) return null;
  const buildings = wire.buildings ?? last?.buildings, run = wire.run ?? last?.run, royale = wire.royale ?? last?.royale;
  const barrels = wire.barrels ?? last?.barrels;
  const airdrop = wire.airdrop !== undefined ? wire.airdrop : last?.airdrop;
  const { cos: sentCos, ...rest } = wire;
  const known: Record<number, Cos> = sentCos ?? Object.fromEntries((last?.players ?? []).filter((p) => p.cos).map((p) => [p.id, p.cos!]));
  const players = Object.keys(known).length ? wire.players.map((p) => (known[p.id] ? { ...p, cos: known[p.id] } : p)) : wire.players;
  return { ...rest, players, crates, leaderboard, zones, match, ...(buildings && { buildings }), ...(run && { run }), ...(royale && { royale }), ...(barrels && { barrels }), ...(airdrop !== undefined && { airdrop }) };
}
