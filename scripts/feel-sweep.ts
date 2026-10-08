/// <reference types="node" />
// Usage: node scripts/feel-sweep.ts flinch.spreadAdd=0.3,flinch.ms=400 [...more sets]
// Prints the doctrine breaches and the class kill matrix at close and mid range for each set of FEEL values, measured without editing defs.ts.
import { FEEL } from '../src/shared/defs.ts';

const base = JSON.stringify(FEEL);
const { classKillMatrix, doctrineBreaches } = await import('./lib/gunscore.ts');

function apply(set: string) {
  Object.assign(FEEL, JSON.parse(base));
  for (const pair of set.split(',').filter(Boolean)) {
    const [path, value] = pair.split('=');
    const keys = path!.split('.');
    const leaf = keys.pop()!;
    const at = keys.reduce<Record<string, unknown>>((o, k) => o[k] as Record<string, unknown>, FEEL as unknown as Record<string, unknown>);
    at[leaf] = Number(value);
  }
}

for (const set of process.argv.length > 2 ? process.argv.slice(2) : ['']) {
  apply(set);
  const m = classKillMatrix();
  const breaches = doctrineBreaches();
  console.log(`${set || 'as defined'}: ${breaches.length} breaches ${breaches.map((b) => `${b.id} ${b.rule}`).join('; ')}`);
  for (const d of [70, 200, 400] as const) console.log(`  s0@${d} ${Object.entries(m[0]).map(([c, r]) => `${c} ${r[d].toFixed(2)}`).join(' ')}`);
}
