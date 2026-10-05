/// <reference types="node" />
import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { WallView } from '../src/shared/protocol.ts';
import { setInput, step } from '../src/shared/sim.ts';
import { snapshotFor } from '../src/shared/sim/snapshot.ts';
import { botThink, newBotMemory, type BotMemory } from '../src/server/bots.ts';
import { arenaFor } from '../src/server/bot/arena.ts';
import type { Intent, PersonalityId } from '../src/server/bot/intent.ts';
import { emptyWorld, setWalls, spawnAt, TICK_MS } from './helpers.ts';

const seeded = (seed: number) => { let x = seed; return () => ((x = (x * 16807) % 2147483647) / 2147483647); };
const QUICK_MS = 400;

type Fight = { persona: PersonalityId; seed: number; ticks: number; enemyAt?: { x: number; y: number }; walls?: (tick: number) => WallView[]; intent?: (enemy: number) => Intent };

/** The bot's position each tick of a fight with an enemy kept at full health, both alive throughout. */
function track(f: Fight): { x: number; y: number }[] {
  const w = emptyWorld();
  const bot = spawnAt(w, 1000, 1000, { loadout: { weapon: 'assault' } });
  const enemy = spawnAt(w, f.enemyAt?.x ?? 1400, f.enemyAt?.y ?? 1000);
  const r = seeded(f.seed);
  let mem: BotMemory = { ...newBotMemory(r), persona: f.persona, ...(f.intent && { intent: f.intent(enemy.id) }) };
  const at: { x: number; y: number }[] = [];
  for (let i = 0; i < f.ticks; i++) {
    if (f.walls) setWalls(w, f.walls(i));
    for (const p of [bot, enemy]) if (p.life.k === 'alive') p.life.hp = 100;
    const d = botThink(snapshotFor(w, bot.id), arenaFor(w), mem, r);
    mem = d.mem;
    setInput(w, bot.id, i + 1, d.input);
    step(w, TICK_MS);
    at.push({ x: bot.x, y: bot.y });
  }
  return at;
}

/** Milliseconds between successive turns back (heading change over 120°) of a moving body. */
function reversalGaps(at: readonly { x: number; y: number }[]): number[] {
  const gaps: number[] = [];
  let heading: number | null = null, last: number | null = null;
  for (let i = 1; i < at.length; i++) {
    const dx = at[i]!.x - at[i - 1]!.x, dy = at[i]!.y - at[i - 1]!.y;
    if (Math.hypot(dx, dy) < 1.5) continue;
    const h = Math.atan2(dy, dx);
    if (heading !== null && Math.abs(Math.atan2(Math.sin(h - heading), Math.cos(h - heading))) > (2 * Math.PI) / 3) {
      if (last !== null) gaps.push((i - last) * TICK_MS);
      last = i;
    }
    heading = h;
  }
  return gaps;
}

const quick = (gaps: number[]) => gaps.filter((g) => g < QUICK_MS - TICK_MS / 2);

test('a strafing bot boxed in by walls turns back no sooner than a person would', () => {
  const box = (gap: number): WallView[] => [
    { x: 800, y: 1000 - gap - 40, w: 400, h: 40, built: false, material: 'concrete' },
    { x: 800, y: 1000 + gap, w: 400, h: 40, built: false, material: 'concrete' },
  ];
  for (const gap of [110, 150, 200]) {
    for (const persona of ['aggressive', 'cautious'] as const) {
      for (let seed = 1; seed <= 4; seed++) {
        const gaps = reversalGaps(track({ persona, seed, ticks: 180, walls: () => box(gap) }));
        assert.deepEqual(quick(gaps), [], `${persona} seed ${seed}, walls ${gap}px off: turns back after ${gaps.map((g) => g.toFixed(0)).join(', ')}ms`);
      }
    }
  }
});

test('a cautious bot sways out from its peek and back with a beat at each end, never in a twitch', () => {
  for (let seed = 1; seed <= 6; seed++) {
    const at = track({
      persona: 'cautious', seed, ticks: 150, enemyAt: { x: 1650, y: 1000 }, walls: () => [{ x: 940, y: 860, w: 40, h: 100, built: false, material: 'concrete' }],
      intent: (target) => ({ k: 'peekAndHide', target, spot: { x: 1000, y: 910 }, peek: { x: 1000, y: 1000 }, phase: 'peek', phaseUntil: 1e9, since: 0, holdUntil: 1e9 }),
    });
    const gaps = reversalGaps(at);
    assert.ok(gaps.length >= 3, `seed ${seed}: sways back and forth (${gaps.length} turns)`);
    assert.deepEqual(quick(gaps), [], `seed ${seed}: turns back after ${gaps.map((g) => g.toFixed(0)).join(', ')}ms`);
  }
});

test('an enemy flickering in and out of sight does not walk a bot back and forth', () => {
  const blind: WallView = { x: 1180, y: 900, w: 40, h: 200, built: false, material: 'concrete' };
  for (const persona of ['aggressive', 'cautious', 'marksman'] as const) {
    for (let seed = 1; seed <= 4; seed++) {
      const gaps = reversalGaps(track({ persona, seed, ticks: 150, walls: (i) => (i > 30 && i % 3 === 0 ? [blind] : []) }));
      assert.deepEqual(quick(gaps), [], `${persona} seed ${seed}: turns back after ${gaps.map((g) => g.toFixed(0)).join(', ')}ms`);
    }
  }
});
