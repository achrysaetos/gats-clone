/// <reference types="node" />
import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { WeaponId } from '../src/shared/defs.ts';
import { step } from '../src/shared/sim.ts';
import { effectiveStats } from '../src/shared/sim/stats.ts';
import { rand, type Player, type World } from '../src/shared/sim/world.ts';
import { newBotMemory, type BotMemory } from '../src/server/bots.ts';
import { TACTICAL_TICKS, thinkBots } from '../src/server/bot/tick.ts';
import { emptyWorld, spawnAt, TICK_MS } from './helpers.ts';

/** A bot and enemies that never fall (humans in heavy armor, healed every tick), and a tick that says whether the bot thought on a snapshot. */
function duel(weapon: WeaponId, foes: readonly { x: number; y: number }[]) {
  const w: World = emptyWorld();
  const r = () => rand(w);
  const bot = spawnAt(w, 1000, 1000, { kind: 'bot', loadout: { weapon } });
  const enemies: Player[] = foes.map((f) => spawnAt(w, f.x, f.y, { kind: 'human', loadout: { armor: 'heavy' } }));
  const mems = new Map<number, BotMemory>([[bot.id, newBotMemory(r)]]);
  const tick = () => {
    let thought = false;
    thinkBots(w, mems, r, { respawn: false, onDecision: (_id, snap) => { thought ||= snap !== null; } });
    for (const e of enemies) if (e.life.k === 'alive') e.life.hp = effectiveStats(e).maxHp;
    step(w, TICK_MS);
    const keys = bot.input.up || bot.input.down || bot.input.left || bot.input.right;
    return { thought, fired: w.events.some((e) => e.e === 'shot' && e.owner === bot.id), keys };
  };
  return { w, bot, enemies, tick };
}

test('an enemy stepping back into view wakes a bot at once, even when another left its view since it last thought', () => {
  const { w, bot, enemies: [, other], tick } = duel('pistol', [{ x: 1350, y: 1000 }, { x: 650, y: 1000 }]);
  for (let i = 0; i < 40; i++) tick();
  // Just past a scheduled think: `other` walks out of view, and a tick later back in.
  while ((w.tick + bot.id) % TACTICAL_TICKS !== 1) tick();
  other!.x = 5500;
  assert.equal(tick().thought, false, 'an enemy leaving is no news');
  other!.x = 650;
  assert.equal(tick().thought, true, 'an enemy coming into view wakes it');
});

test('a planted sniper thinks again the tick after its round leaves, and not on every tick its trigger is held while the bolt cycles', () => {
  const { tick } = duel('sniper', [{ x: 1550, y: 1000 }]);
  const ticks = Array.from({ length: 300 }, tick);
  const shots = ticks.flatMap((t, i) => (t.fired ? [i] : []));
  assert.ok(shots.length >= 4, `fires a few rounds in ten seconds: ${shots.length}`);
  for (const s of shots.filter((s) => s + 3 < ticks.length)) {
    assert.ok(ticks[s + 1]!.thought, `thinks the tick after its round at ${s} leaves`);
    assert.ok(ticks.slice(s + 1, s + 4).some((t) => t.keys), `moves off its spot after the round at ${s}`);
  }
  const thinks = ticks.filter((t) => t.thought).length;
  assert.ok(thinks <= ticks.length / TACTICAL_TICKS + 2 * shots.length + 10, `${thinks} thinks in ${ticks.length} ticks with ${shots.length} rounds fired`);
});
