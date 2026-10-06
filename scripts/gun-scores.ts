/// <reference types="node" />
// Usage: node scripts/gun-scores.ts
// The balance lint's numbers: each gun on every axis, the same-stage pairs where one gun beats the other everywhere, and those it beats everywhere but one axis.
import { GUNS } from '../src/shared/defs.ts';
import { AXES, dominatedPairs, dominates, gunsOfStage, rangeBeyondView, scoreGun, TREE_ORDER, type Axis, type GunScore } from './lib/gunscore.ts';

const cell = (k: Axis, v: number) => (k === 'uptime' ? `${(v * 100).toFixed(0)}%` : k === 'moveMul' ? v.toFixed(2) : v.toFixed(0));
console.log('gun scores: dps is expected damage per second against a 24px body while the trigger is held (spread cone, pellets, bursts, blast on a hit, 0 past range)');
console.log(`  ${'gun'.padEnd(18)}${AXES.map((k) => k.padStart(Math.max(7, k.length + 1))).join('')}`);
for (const id of TREE_ORDER) {
  const s = scoreGun(id);
  console.log(`  ${`${'  '.repeat(GUNS[id].stage)}${GUNS[id].name}`.padEnd(18)}${AXES.map((k) => cell(k, s[k]).padStart(Math.max(7, k.length + 1))).join('')}`);
}

const better = (k: Axis, a: GunScore, b: GunScore) => (k === 'reloadMs' ? a[k] < b[k] : a[k] > b[k]);
for (const stage of [0, 1, 2] as const) {
  console.log(`\nstage ${stage}`);
  for (const [a, b] of dominatedPairs(stage)) console.log(`  DOMINATED  ${GUNS[a].name} beats ${GUNS[b].name} on every axis`);
  const ids = gunsOfStage(stage);
  for (const a of ids) for (const b of ids) {
    const [sa, sb] = [scoreGun(a), scoreGun(b)];
    if (a === b || dominates(sa, sb)) continue;
    const saving = AXES.filter((k) => better(k, sb, sa));
    if (saving.length === 1) console.log(`  near       ${GUNS[a].name} beats ${GUNS[b].name} on all but ${saving[0]} (${cell(saving[0]!, sa[saving[0]!])} vs ${cell(saving[0]!, sb[saving[0]!])})`);
  }
}

console.log('\nrange past the owner\'s horizontal view, no perks');
for (const o of rangeBeyondView()) console.log(`  ${GUNS[o.id].name.padEnd(16)} range ${o.range} > view ${o.view}`);
