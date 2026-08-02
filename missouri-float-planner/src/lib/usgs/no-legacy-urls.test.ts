import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';

// ── The legacy USGS host may be named in exactly one module ──────
//
// USGS decommissions waterservices.usgs.gov in Q1 2027. The migration off it
// was a four-call-site job across three directories only because the host name
// had been re-typed in each one — flow-providers/usgs.ts held two constants,
// flow-providers/usgs-historical.ts had its own pair, and three scripts inlined
// the site service. The abstraction held where it was used and leaked
// everywhere it wasn't.
//
// This test is the enforcement. It is not about tidiness: the next deprecation
// (and there will be one) should be a single-file change whose completeness can
// be proven mechanically rather than by remembering every place someone typed a
// URL.

const LEGACY_HOST = 'waterservices.usgs.gov';

/** The one module allowed to name it, relative to missouri-float-planner/. */
const ALLOWED = new Set([
  path.join('src', 'lib', 'flow-providers', 'usgs-legacy.ts'),
  // This test necessarily contains the string it forbids.
  path.join('src', 'lib', 'usgs', 'no-legacy-urls.test.ts'),
]);

const SEARCH_ROOTS = ['src', 'scripts', 'shared'];
const SKIP_DIRECTORIES = new Set(['node_modules', '.next', 'dist', 'build']);
const SOURCE_FILE = /\.(ts|tsx|js|jsx|mjs|cjs)$/;

function walk(directory: string, out: string[] = []): string[] {
  for (const entry of readdirSync(directory)) {
    if (SKIP_DIRECTORIES.has(entry)) continue;
    const full = path.join(directory, entry);
    if (statSync(full).isDirectory()) {
      walk(full, out);
    } else if (SOURCE_FILE.test(entry)) {
      out.push(full);
    }
  }
  return out;
}

test('only usgs-legacy.ts names the decommissioned USGS host', () => {
  const projectRoot = process.cwd();
  const offenders: string[] = [];
  let filesScanned = 0;

  for (const root of SEARCH_ROOTS) {
    const absoluteRoot = path.resolve(projectRoot, root);
    let files: string[];
    try {
      files = walk(absoluteRoot);
    } catch {
      continue; // a root that doesn't exist is not a failure
    }

    for (const file of files) {
      filesScanned += 1;
      const relative = path.relative(projectRoot, file);
      if (ALLOWED.has(relative)) continue;

      const contents = readFileSync(file, 'utf8');
      if (!contents.includes(LEGACY_HOST)) continue;

      // A prose mention in a comment is how the migration gets explained; it is
      // a fetch that must not exist. Flag only lines that aren't comments.
      contents.split('\n').forEach((line, index) => {
        if (!line.includes(LEGACY_HOST)) return;
        const trimmed = line.trim();
        if (trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('/*')) return;
        offenders.push(`${relative}:${index + 1}`);
      });
    }
  }

  // Guards the guard: a walk that silently found nothing would pass forever.
  assert.ok(filesScanned > 100, `expected to scan the source tree, saw ${filesScanned} files`);
  assert.deepEqual(
    offenders,
    [],
    `waterservices.usgs.gov is decommissioned Q1 2027 and may only be named in ` +
      `src/lib/flow-providers/usgs-legacy.ts. Found in:\n${offenders.join('\n')}`
  );
});

test('the allowed module still exists and exports both legacy URLs', async () => {
  // If usgs-legacy.ts is deleted (the intended end state) this test should be
  // deleted with it — but it must not pass vacuously in the meantime.
  const legacy = await import('@/lib/flow-providers/usgs-legacy');
  assert.match(legacy.LEGACY_IV_URL, /waterservices\.usgs\.gov/);
  assert.match(legacy.LEGACY_STAT_URL, /waterservices\.usgs\.gov/);
});
