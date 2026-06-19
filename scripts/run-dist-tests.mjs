import { readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

const root = process.argv[2] ?? 'dist';

function findTests(dir) {
  return readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry);
    const stat = statSync(path);
    if (stat.isDirectory()) return findTests(path);
    return entry.endsWith('.test.js') ? [path] : [];
  });
}

const tests = findTests(root).sort();
if (!tests.length) {
  console.error(`No built tests found under ${root}`);
  process.exit(1);
}

for (const test of tests) {
  const result = spawnSync(process.execPath, [test], { stdio: 'inherit' });
  if (result.status !== 0) process.exit(result.status ?? 1);
}
