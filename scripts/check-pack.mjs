#!/usr/bin/env node
// TBP-744 — fail unless the folder about to be published is the built library.
//
// Every @nebulr-group/bridge-angular up to 0.8.0-beta.1 was published from the
// source folder, one level above ng-packagr's `dist/`: the tarball had
// `src/**/*.ts` and a package.json with no `module`, no typings and no `.`
// export, so no app could import it. CI stayed green because the install test
// packed `dist/` while the release published something else.
//
// Usage: node scripts/check-pack.mjs <folder that will be published>
// Packs the folder (dry run, the same file list `npm publish` would upload) and
// checks its package.json points at built entry points that are in the tarball.
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const dir = resolve(process.argv[2] ?? '.');
const problems = [];

const pkg = JSON.parse(readFileSync(resolve(dir, 'package.json'), 'utf8'));
const packed = JSON.parse(
  execFileSync('npm', ['pack', '--dry-run', '--json', '--ignore-scripts'], {
    cwd: dir,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'inherit'],
  }),
)[0];
const files = new Set(packed.files.map((f) => f.path));
const inTarball = (p) => typeof p === 'string' && files.has(p.replace(/^\.\//, ''));

if (pkg.name !== '@nebulr-group/bridge-angular') problems.push(`name is ${pkg.name}`);
if (!inTarball(pkg.module)) problems.push(`"module" (${pkg.module}) is not a file in the tarball`);
if (!inTarball(pkg.typings ?? pkg.types)) problems.push(`"typings" (${pkg.typings ?? pkg.types}) is not a file in the tarball`);

const root = pkg.exports?.['.'];
if (!root) {
  problems.push('package.json has no "." export');
} else {
  if (!inTarball(root.default)) problems.push(`exports["."].default (${root.default}) is not a file in the tarball`);
  if (!inTarball(root.types)) problems.push(`exports["."].types (${root.types}) is not a file in the tarball`);
}
if (!inTarball(pkg.exports?.['./styles.css']?.default)) problems.push('exports["./styles.css"] is not a file in the tarball');
if (![...files].some((f) => /^fesm2022\/.+\.mjs$/.test(f))) problems.push('no fesm2022/*.mjs bundle in the tarball');

const source = [...files].filter((f) => f.endsWith('.ts') && !f.endsWith('.d.ts'));
if (source.length) problems.push(`TypeScript source in the tarball (${source.length} files, e.g. ${source[0]})`);

if (problems.length) {
  console.error(`✖ ${dir} is not a publishable build of ${pkg.name}:`);
  for (const p of problems) console.error(`  - ${p}`);
  console.error('Publish bridge-angular/dist, the ng-packagr output (TBP-744).');
  process.exit(1);
}
console.log(`✔ ${pkg.name}@${pkg.version}: ${files.size} files, entry ${root.default}, typings ${pkg.typings ?? pkg.types}`);
