/// <reference types="node" />
// Usage: node scripts/bench-flank.ts [--seeds 6] [--guns pistol,smg,shotgun,assault,sniper,lmg] [--verbose]
// How a bot answers a human who comes round its cover. A scripted human (cannot die, aims dead on, fires whenever he has a line) and a bot
// that cannot die either, on an open plaza with one bit of cover:
//   prior  - the human fights the bot from the west until it has hidden behind the wall from him, then walks round the wall (100 degrees
//            of arc about the bot) and fires once he has a line;
//   cover  - the bot sits in cover on the wall's east face from a human it saw west of the wall (its peek-and-hide pinned to the hide
//            phase until he shows), and he walks round the wall as in `prior`;
//   side   - the bot holds the wall's east face looking east with nobody seen; the human steps out from behind a blind 90 degrees off its facing;
//   behind - the same, 125 degrees off its facing (as far behind as the wall at its back leaves open).
// From the tick the human first has a clear line to the bot inside its view (T0) it measures the ms to: the bot facing him (within 12
// degrees), its first round, and it moving (40 px off its spot at T0); the human's hits on it and its on him in the 2 s after T0, and the share
// of those 2 s it stood still. "-" never (6 s).
import { parseArgs } from 'node:util';
import type { WeaponId } from '../src/shared/defs.ts';
import { PERSONALITY_IDS } from '../src/server/bot/intent.ts';
import { flank, type FlankResult, type Scenario, type Shape } from './lib/flank.ts';

const { values: args } = parseArgs({ options: { seeds: { type: 'string', default: '6' }, guns: { type: 'string', default: 'pistol,smg,shotgun,assault,sniper,lmg' }, verbose: { type: 'boolean', default: false }, shapes: { type: 'string', default: 'slab' }, scenarios: { type: 'string', default: 'prior,cover,side,behind' } } });
const seeds = Array.from({ length: Number(args.seeds) }, (_, i) => i + 1);
const guns = args.guns.split(',') as WeaponId[];

const med = (xs: (number | null)[]) => {
  const ok = xs.filter((x): x is number => x !== null).sort((a, b) => a - b);
  const never = xs.length - ok.length;
  const m = ok.length ? ok[Math.floor(ok.length / 2)]! : null;
  const p90 = ok.length ? ok[Math.min(ok.length - 1, Math.floor(ok.length * 0.9))]! : null;
  return `${m === null ? '-' : m.toFixed(0)}/${p90 === null ? '-' : p90.toFixed(0)}${never ? ` (${never} never)` : ''}`;
};

{
  console.log(`flank reaction, ms from the human's first line (median/p90), seeds 1..${seeds.length} x both sides`);
  console.log(`${'scenario'.padEnd(8)} ${'gun'.padEnd(8)} ${'persona'.padEnd(10)} ${'face'.padEnd(16)} ${'fire'.padEnd(16)} ${'move'.padEnd(16)} hits on/by bot in 2 s`);
  const all: Record<string, FlankResult[]> = {};
  const shapes = args.shapes.split(',') as Shape[];
  for (const scenario of args.scenarios.split(',') as Scenario[]) for (const gun of guns) for (const persona of PERSONALITY_IDS) {
    const rs: FlankResult[] = [];
    // Every shape is a cover scenario's: the others are laid out on the slab.
    for (const shape of scenario === 'cover' ? shapes : ['slab' as const]) for (const seed of seeds) for (const side of [1, -1] as const) {
      const res = flank(scenario, gun, persona, seed, side, 'assault', shape);
      rs.push(res);
      if (args.verbose) console.log(`   ${scenario} ${shape} ${gun} ${persona} seed ${seed} side ${side}`, JSON.stringify(res));
    }
    (all[scenario] ??= []).push(...rs.filter((x) => x.hid));
    const ok = rs.filter((x) => x.hid);
    const hits = (k: 'hitsOn' | 'hitsBy') => (ok.reduce((s, x) => s + x[k], 0) / Math.max(1, ok.length)).toFixed(1);
    console.log(`${scenario.padEnd(8)} ${gun.padEnd(8)} ${persona.padEnd(10)} ${med(ok.map((x) => x.face)).padEnd(16)} ${med(ok.map((x) => x.fire)).padEnd(16)} ${med(ok.map((x) => x.move)).padEnd(16)} ${hits('hitsOn')}/${hits('hitsBy')}${ok.length < rs.length ? `  (${rs.length - ok.length} never hid)` : ''}`);
  }
  for (const [s, rs] of Object.entries(all)) {
    const hits = (k: 'hitsOn' | 'hitsBy') => (rs.reduce((n, x) => n + x[k], 0) / Math.max(1, rs.length)).toFixed(1);
    const still = rs.filter((x) => x.face !== null).reduce((n, x) => n + (x.still ?? 0), 0) / Math.max(1, rs.filter((x) => x.face !== null).length);
    console.log(`ALL ${s.padEnd(7)} face ${med(rs.map((x) => x.face))}  fire ${med(rs.map((x) => x.fire))}  move ${med(rs.map((x) => x.move))}  hits on/by ${hits('hitsOn')}/${hits('hitsBy')}  standing ${(100 * still).toFixed(0)}% of 2 s  n=${rs.length}`);
  }
}
