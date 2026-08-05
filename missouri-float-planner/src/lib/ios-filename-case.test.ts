// src/lib/ios-filename-case.test.ts
// No two files in the app may differ only by letter case.
//
// ── Why this needs a test at all ──────────────────────────────────────────
// GaugeTabs.tsx and gaugeTabs.ts sat next to each other for a commit. On
// Linux — ext4, case-SENSITIVE — they are two files and everything compiles,
// which is what CI runs on and why every gate passed. On macOS, whose default
// APFS volume is case-INSENSITIVE, they are one file: TypeScript reports
// TS1149 and resolves imports to whichever it saw first, so five exports go
// missing and the app does not build.
//
// This is an iOS app. Every developer is on the platform where it breaks and
// no automated check was on the platform where it breaks. A filesystem-agnostic
// comparison is the only thing that closes that gap.
//
// The comparison strips the EXTENSION first, and that is the whole subtlety.
// The bug was gaugeTabs.ts beside GaugeTabs.tsx; fold those with extensions
// attached and they differ, so a naive check passes and the build still breaks.
// What collides is the module SPECIFIER: `./gaugeTabs` and `./GaugeTabs` are
// the same request, and resolution tries .ts then .tsx against it. So the
// basename is what has to be unique, case-insensitively, per directory.

import assert from 'node:assert/strict';
import test from 'node:test';
import { readdirSync } from 'node:fs';
import { join } from 'node:path';

const APP = join(process.cwd(), '../eddy-ios');
const ROOTS = ['app', 'src'];
const SKIP = new Set(['node_modules', '.expo', 'ios', 'android', 'dist']);

function walk(dir: string): { dir: string; names: string[] }[] {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return [];
  }
  const names = entries.filter((e) => !e.isDirectory()).map((e) => e.name);
  const out = [{ dir, names }];
  for (const entry of entries) {
    if (entry.isDirectory() && !SKIP.has(entry.name)) out.push(...walk(join(dir, entry.name)));
  }
  return out;
}

test('no two files in a directory differ only by case', () => {
  const clashes: string[] = [];

  for (const root of ROOTS) {
    for (const { dir, names } of walk(join(APP, root))) {
      const seen = new Map<string, string>();
      for (const name of names) {
        if (!/\.(ts|tsx|js|jsx)$/.test(name)) continue;
        const folded = name.replace(/\.(ts|tsx|js|jsx)$/, '').toLowerCase();
        const previous = seen.get(folded);
        if (previous && previous !== name) {
          clashes.push(`${dir.replace(APP, 'eddy-ios')}: ${previous} vs ${name}`);
        }
        seen.set(folded, name);
      }
    }
  }

  assert.deepEqual(
    clashes,
    [],
    `files differing only by case will not build on macOS:\n  ${clashes.join('\n  ')}`,
  );
});

test('the walk actually reached the app, so a green result means something', () => {
  // A path typo would make every assertion above pass over an empty list. This
  // is the guard on the guard.
  const files = walk(join(APP, 'src')).flatMap((entry) => entry.names);
  assert.ok(files.length > 50, `expected to scan the app's src/, saw ${files.length} files`);
});
