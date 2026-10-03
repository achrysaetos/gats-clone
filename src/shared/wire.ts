import { STICKY_KEYS, type Snapshot, type SnapshotWire } from './protocol.ts';

/** Decimal places kept per number field on the wire; any other non-integer keeps one. */
const DECIMALS: Readonly<Record<string, number>> = { angle: 2, progress: 2, vx: 0, vy: 0, abilityReadyIn: 0, respawnIn: 0, restartIn: 0 };

const round = (key: string, v: unknown) => {
  if (typeof v !== 'number' || Number.isInteger(v)) return v;
  const f = 10 ** (DECIMALS[key] ?? 1);
  return Math.round(v * f) / f;
};

const stringify = (v: unknown) => JSON.stringify(v, round);

/**
 * One per connection. Rounds numbers to what the client can show, and omits each sticky field whose wire form is
 * identical to the one this connection was last sent; the client keeps the last value it got.
 */
export function makeSnapshotEncoder(): (snap: Snapshot) => string {
  const lastSent = new Map<string, string>();
  return (snap) => {
    // Minimap dots are a few pixels wide over the whole world, so whole units are plenty.
    const wire: SnapshotWire = { ...snap, minimap: snap.minimap.map((m) => ({ ...m, x: Math.round(m.x), y: Math.round(m.y) })) };
    for (const key of STICKY_KEYS) {
      const json = stringify(snap[key]);
      if (lastSent.get(key) === json) delete wire[key];
      else lastSent.set(key, json);
    }
    return stringify(wire);
  };
}

/** Rebuilds a full snapshot from a wire one and the previous full snapshot; null if a sticky field was never received. */
export function fillSnapshot(wire: SnapshotWire, last: Snapshot | null): Snapshot | null {
  const crates = wire.crates ?? last?.crates;
  const leaderboard = wire.leaderboard ?? last?.leaderboard;
  const zones = wire.zones ?? last?.zones;
  const match = wire.match ?? last?.match;
  if (!crates || !leaderboard || !zones || !match) return null;
  return { ...wire, crates, leaderboard, zones, match };
}
