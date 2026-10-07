import type { Snapshot } from '../../shared/protocol.ts';
import { canRespawn, respawn, setInput } from '../../shared/sim.ts';
import { build, upgrade } from '../../shared/sim/run.ts';
import { snapshotFor } from '../../shared/sim/snapshot.ts';
import { choosePick } from '../../shared/sim/stats.ts';
import type { World } from '../../shared/sim/world.ts';
import { botThink, randomLoadout, type BotDecision, type BotMemory } from '../bots.ts';
import { arenaFor } from './arena.ts';

export type BotTickOptions = {
  picks?: boolean;
  respawn?: boolean;
  onDecision?: (id: number, snap: Snapshot, before: BotMemory, d: BotDecision, respawned: boolean) => void;
};

export function thinkBots(w: World, mems: Map<number, BotMemory>, rand: () => number, { picks = true, respawn: revive = true, onDecision }: BotTickOptions = {}): { respawned: number[]; picked: number } {
  const arena = arenaFor(w);
  const respawned: number[] = [];
  let picked = 0;
  for (const [id, mem] of mems) {
    const snap = snapshotFor(w, id);
    const d = botThink(snap, arena, mem, rand);
    mems.set(id, d.mem);
    setInput(w, id, w.tick, d.input);
    if (d.build) build(w, id, d.build.kind, d.build.cx, d.build.cy, d.build.lv);
    if (d.upgrade) upgrade(w, id, d.upgrade.cx, d.upgrade.cy);
    if (picks && d.pick && choosePick(w, id, d.pick.level, d.pick.option)) picked++;
    const back = revive && canRespawn(w, id) && respawn(w, id, randomLoadout(rand));
    if (back) respawned.push(id);
    onDecision?.(id, snap, mem, d, back);
  }
  return { respawned, picked };
}
