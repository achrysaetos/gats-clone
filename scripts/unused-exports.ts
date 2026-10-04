import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '..');
const DIRS = ['src', 'test', 'scripts', '.claude/skills/verify/scripts'];

function tsFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) return tsFiles(path);
    return path.endsWith('.ts') ? [path] : [];
  });
}

const files = DIRS.flatMap((d) => tsFiles(join(ROOT, d)));
const sources = new Map(files.map((f) => [f, readFileSync(f, 'utf8')]));

const exportsOf = (src: string) =>
  [...src.matchAll(/^export\s+(?:async\s+)?(?:function\*?|const|let|type|interface|class|enum)\s+([A-Za-z_$][\w$]*)/gm)].map((m) => m[1]!);

const imported = new Set<string>();
for (const [file, src] of sources) {
  const bindings = [
    ...src.matchAll(/import\s+(?:type\s+)?\{([^}]*)\}\s*from\s*['"]([^'"]+)['"]/g),
    ...src.matchAll(/\{([^}]*)\}\s*=\s*await\s+import\(\s*['"]([^'"]+)['"]\s*\)/g),
  ];
  for (const [, names, spec] of bindings) {
    if (!spec!.startsWith('.')) continue;
    const target = resolve(dirname(file), spec!);
    for (const raw of names!.split(',')) {
      const name = raw.trim().replace(/^type\s+/, '').split(/\s+as\s+|\s*:\s*/)[0]!.trim();
      if (name) imported.add(`${target}#${name}`);
    }
  }
}

let count = 0;
for (const [file, src] of sources) {
  for (const name of exportsOf(src)) {
    if (imported.has(`${file}#${name}`)) continue;
    const localUses = (src.match(new RegExp(`(?<![\\w$.])${name.replace(/\$/g, '\\$')}(?![\\w$])`, 'g')) ?? []).length - 1;
    console.log(`${relative(ROOT, file)}\t${name}\t${localUses > 0 ? `used in module (${localUses})` : 'dead'}`);
    count++;
  }
}
console.log(`${count} exports with no importer`);
