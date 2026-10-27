#!/usr/bin/env npx tsx
// Runtime dependency audit for CI's dependency-audit job: `npm run audit:runtime`.
// Fails on any high or critical advisory in production dependencies except a
// reviewed, expiring exception in scripts/security/audit-exceptions.json.
// The rules, and why they are this strict, are in scripts/security/audit-policy.ts.
//
//   npm run audit:runtime                      # runs npm audit
//   npm run audit:runtime -- --report a.json   # judges a saved `npm audit --omit=dev --json`

import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';

import { type AuditException, evaluateAudit } from './security/audit-policy';

const EXCEPTIONS_PATH = path.join(__dirname, 'security', 'audit-exceptions.json');

function readReport(): unknown {
  const flag = process.argv.indexOf('--report');
  if (flag >= 0) return JSON.parse(readFileSync(process.argv[flag + 1], 'utf8'));
  // npm audit exits non-zero whenever it finds anything, so the exit code says
  // nothing here. A missing or malformed report is rejected by the policy.
  const run = spawnSync('npm', ['audit', '--omit=dev', '--json'], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  if (run.error) throw run.error;
  try {
    return JSON.parse(run.stdout);
  } catch {
    throw new Error(`npm audit did not print a JSON report:\n${run.stderr || run.stdout}`);
  }
}

const exceptions = JSON.parse(readFileSync(EXCEPTIONS_PATH, 'utf8')) as AuditException[];
const today = new Date().toISOString().slice(0, 10);
const { failures, excepted, ignored } = evaluateAudit(readReport() as never, exceptions, today);

for (const a of excepted) {
  const e = exceptions.find((x) => x.advisory === a.id && x.package === a.package);
  console.log(`excepted until ${e?.expires}: ${a.severity} ${a.id} in ${a.package} (${a.paths.length} paths)`);
}
if (ignored.length > 0) {
  console.log(`below the blocking level: ${ignored.map((a) => `${a.severity} ${a.id} in ${a.package}`).join(', ')}`);
}
if (failures.length > 0) {
  console.error(`\nRuntime dependency audit failed:\n- ${failures.join('\n- ')}`);
  process.exit(1);
}
console.log('Runtime dependency audit passed.');
