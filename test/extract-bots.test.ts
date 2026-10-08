import assert from 'node:assert/strict';
import { test } from 'node:test';
import { EXT } from '../src/shared/defs.ts';
import { addPlayer, step } from '../src/shared/sim.ts';
import { createWorld, rand } from '../src/shared/sim/world.ts';
import { newBotMemory, randomLoadout, type BotMemory } from '../src/server/bots.ts';
import { thinkBots } from '../src/server/bot/tick.ts';
import { TICK_MS } from './helpers.ts';

/** Plays bot-only 4v4 Vault from `seed` until an attacker extracts or two rounds pass, noting each state the case went through. */
function play(seed: number) {
  const w = createWorld('EXT', seed, 'vault');
  const r = () => rand(w);
  const bots = new Map<number, BotMemory>();
  for (let i = 0; i < 8; i++) bots.set(addPlayer(w, `bot${i}`, randomLoadout(r), { team: i % 2 ? 'blue' : 'red' }).id, newBotMemory(r));
  const seen = new Set<string>();
  for (let t = 0; t < 2 * (EXT.roundMs + EXT.breakMs); t += TICK_MS) {
    thinkBots(w, bots, r);
    step(w, TICK_MS);
    const x = w.extract!;
    seen.add(x.case.k);
    if (x.phase.k === 'break' && x.phase.why === 'extracted') return { seen, at: w.now, round: x.round, winner: x.phase.winner };
  }
  return { seen, at: null, round: w.extract!.round, winner: null };
}

test('bot attackers hack the terminal, pick up the case and fly it out in a bot-only match', () => {
  const tries = [1, 2, 3].map(play);
  const won = tries.find((t) => t.at !== null);
  assert.ok(won, `no extraction in two rounds on any seed: ${tries.map((t) => [...t.seen].join('>')).join(' | ')}`);
  assert.deepEqual([...won.seen].sort(), ['carried', 'hacking', 'ready'], 'the hack completed and the case was carried');
  assert.equal(won.winner, won.round % 2 === 1 ? 'red' : 'blue', 'the round went to that round\'s attackers');
  assert.ok(won.at! - (won.round - 1) * (EXT.roundMs + EXT.breakMs) < EXT.roundMs, 'inside the round\'s clock');
});
