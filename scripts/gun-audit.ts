/// <reference types="node" />
// Usage: node scripts/gun-audit.ts [--moving] [--old <defs.ts of an earlier roster, e.g. from git show>] [--set lmg.damage=14,smg.spread=0.1]
import { parseArgs } from 'node:util';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { GUNS, rulesOf, WORLD, type GunDef, type GunId } from '../src/shared/defs.ts';

const { values: args } = parseArgs({ options: { old: { type: 'string' }, moving: { type: 'boolean', default: false }, set: { type: 'string' } } });
for (const pair of args.set?.split(',') ?? []) {
  const [path, value] = pair.split('=');
  const [id, field] = path!.split('.') as [GunId, keyof GunDef];
  Object.assign(GUNS[id], { [field]: Number(value) });
}
const { AIM_BANDS, aimDps, aimKillMs, doctrineBreaches, HUMAN_HP, perfectKill, TREE_ORDER } = await import('./lib/gunscore.ts');
const old: Record<string, GunDef> = args.old ? (await import(pathToFileURL(resolve(args.old)).href)).GUNS : {};

const msPerRound = (g: GunDef) => (g.burst ? ((g.burst.count - 1) * g.burst.gapMs + g.fireMs) / g.burst.count : g.fireMs);
const pull = (g: GunDef) => g.pellets * (g.damage + (g.blast?.damage ?? 0));
const s = (ms: number) => (Number.isFinite(ms) ? (ms / 1000).toFixed(2) : '-');
const cols: [string, number][] = [
  ['gun', 18], ['dmg', 6], ['ms', 6], ['dps', 5], ['range', 6], ['view', 6], ['mag', 4], ['reload', 7], ['move', 5],
  ['bot', 9], ['botHvy', 9], ['human', 10], ['humHvy', 10], ...AIM_BANDS.map((d) => [`aim@${d}`, 8] as [string, number]),
  ...AIM_BANDS.map((d) => [`kill@${d}`, 8] as [string, number]), ['  was', 30],
];
const row = (cells: string[]) => cells.map((c, i) => (i === 0 || i === cols.length - 1 ? c.padEnd(cols[i]![1]) : c.padStart(cols[i]![1]))).join('');

console.log(`gun audit: hits/seconds for perfect aim to kill a ${WORLD.baseHp} HP bot and a ${HUMAN_HP} HP human, bare and in heavy armor;`);
console.log(`kill@d: a person's expected seconds to kill a bare person strafing at base speed d px off, standing to shoot (walking with --moving); aim@d: the same as damage per second; was: an earlier roster's per-pull damage / ms per round / range`);
console.log(row(cols.map(([c]) => c)));
for (const id of TREE_ORDER) {
  const g = GUNS[id], o = old[id];
  const k = (hp: number, armor: 'none' | 'heavy') => { const r = perfectKill(id, hp, armor); return `${r.hits}/${s(r.ms)}`; };
  console.log(row([
    `${'  '.repeat(g.stage)}${g.name}`, String(pull(g)), msPerRound(g).toFixed(0), ((pull(g) * 1000) / msPerRound(g)).toFixed(0),
    String(g.range), (WORLD.viewRadius * rulesOf(g).viewMul).toFixed(0), String(g.mag), String(g.reloadMs), g.moveMul.toFixed(2),
    k(WORLD.baseHp, 'none'), k(WORLD.baseHp, 'heavy'), k(HUMAN_HP, 'none'), k(HUMAN_HP, 'heavy'),
    ...AIM_BANDS.map((d) => aimDps(id, d, !args.moving).toFixed(0)), ...AIM_BANDS.map((d) => s(aimKillMs(id, d, !args.moving))),
    `  ${o ? `${pull(o)} / ${msPerRound(o).toFixed(0)}ms / ${o.range}` : 'new'}`,
  ]));
}

const breaches = doctrineBreaches();
console.log(`\n${breaches.length} doctrine breaches (DOCTRINE in scripts/lib/gunscore.ts)`);
for (const b of breaches) console.log(`  ${GUNS[b.id].name.padEnd(16)}${b.rule.padEnd(9)}${b.detail}`);
