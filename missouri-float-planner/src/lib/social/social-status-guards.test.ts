// Every social_posts status list that includes 'publishing' is asking "may
// this have gone out?" — and must therefore include 'unknown' too, or spread
// MAY_HAVE_PUBLISHED. A list naming publishing without unknown stops
// protecting a post the moment the reaper marks it unknown.

import assert from 'node:assert/strict';
import test from 'node:test';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) out.push(...sourceFiles(path));
    else if (/\.(ts|tsx)$/.test(name) && !/\.test\.tsx?$/.test(name)) out.push(path);
  }
  return out;
}

test("no status list names 'publishing' without 'unknown'", () => {
  const offenders: string[] = [];
  for (const file of sourceFiles('src')) {
    const source = readFileSync(file, 'utf8');
    for (const match of source.matchAll(/\.in\(\s*'status'\s*,\s*\[([^\]]*)\]/g)) {
      const list = match[1];
      if (/'publishing'/.test(list) && !/'unknown'|MAY_HAVE_PUBLISHED/.test(list)) {
        const line = source.slice(0, match.index).split('\n').length;
        offenders.push(`${relative('.', file)}:${line}`);
      }
    }
  }
  assert.deepEqual(offenders, [], 'Spread MAY_HAVE_PUBLISHED from lib/social/publish-outcome.ts');
});
