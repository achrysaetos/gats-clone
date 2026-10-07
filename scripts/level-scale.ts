/// <reference types="node" />
// Usage: node scripts/level-scale.ts
// Plays ten 2-minute FFA rooms of bots and prints the share of lives whose score reaches each level the evolve and ability
// tiers sit at, under the pre-medal ladder scaled by each factor, and how often each medal was earned.
import { WORLD } from '../src/shared/defs.ts';
import { ROTATION } from '../src/shared/maps.ts';
import { addPlayer, step } from '../src/shared/sim.ts';
import { createWorld, rand } from '../src/shared/sim/world.ts';
import { newBotMemory, randomLoadout, type BotMemory } from '../src/server/bots.ts';
import { thinkBots } from '../src/server/bot/tick.ts';
const TICK = 1000 / 30;
const scores: number[] = [];
const medals = new Map<string, number>();
for (let i = 0; i < 10; i++) {
  const w = createWorld('FFA', i + 1, ROTATION.FFA[i % ROTATION.FFA.length]!);
  const r = () => rand(w);
  const bots = new Map<number, BotMemory>();
  for (let j = 0; j < WORLD.minPlayers; j++) bots.set(addPlayer(w, `bot${j}`, randomLoadout(r)).id, newBotMemory(r));
  for (let t = 0; t < 120_000; t += TICK) {
    thinkBots(w, bots, r); step(w, TICK);
    for (const ev of w.events) if (ev.e === 'medal') medals.set(ev.medal, (medals.get(ev.medal) ?? 0) + 1);
    for (const rec of w.lifeRecords.splice(0)) scores.push(rec.score);
  }
}
// The pre-medal ladder: first evolve at 200, ability at 400, hunted evolve at 550.
const reach = (s: number) => (scores.filter((x) => x >= s).length / scores.length * 100).toFixed(1);
for (const k of [1, 1.1, 1.25, 1.5]) console.log(`x${k}: evolve ${reach(200 * k)}%  ability ${reach(400 * k)}%  hunted ${reach(550 * k)}%`);
console.log(scores.length, 'lives', JSON.stringify(Object.fromEntries(medals)));
