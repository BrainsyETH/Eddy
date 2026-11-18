// scripts/lib/test-files.ts
// Reads test-files.txt, the list of web test files `npm test` runs.
//
// Shared by the runner (scripts/run-tests.ts) and by the test that checks the
// list is complete (src/lib/trust/registered-tests.test.ts), so the two cannot
// disagree about what a line means.

import { readFileSync } from 'node:fs';
import path from 'node:path';

export const TEST_FILES_MANIFEST = 'test-files.txt';

/** The file paths in a manifest: one per line, `#` comments and blanks ignored. */
export function parseTestFiles(text: string): string[] {
  return text
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith('#'));
}

/** The listed test files, in file order, read from the web root. */
export function readTestFiles(projectRoot: string = process.cwd()): string[] {
  return parseTestFiles(readFileSync(path.join(projectRoot, TEST_FILES_MANIFEST), 'utf8'));
}
