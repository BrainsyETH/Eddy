import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';

import {
  type AuditException,
  MAX_EXCEPTION_DAYS,
  evaluateAudit,
  exceptionProblems,
  rootAdvisories,
} from './audit-policy';

const ZOD_PATHS = [
  'node_modules/@coinbase/cdp-sdk/node_modules/zod',
  'node_modules/@coinbase/x402/node_modules/zod',
  'node_modules/@x402/core/node_modules/zod',
  'node_modules/@x402/evm/node_modules/zod',
  'node_modules/@x402/extensions/node_modules/zod',
];

const zodAdvisory = {
  source: 1243066,
  name: 'zod',
  dependency: 'zod',
  title: 'Zod can exhaust memory while validating oversized constrained collections',
  url: 'https://github.com/advisories/GHSA-mrhx-c7xc-m3w5',
  severity: 'high',
  range: '<4.6.6',
};

// The shape of `npm audit --omit=dev --json` on 2026-10-27, trimmed.
function report(extra: Record<string, unknown> = {}, zodNodes = ZOD_PATHS) {
  return {
    auditReportVersion: 2,
    vulnerabilities: {
      zod: { severity: 'high', via: [zodAdvisory], nodes: zodNodes },
      '@x402/core': { severity: 'high', via: ['zod'], nodes: ['node_modules/@x402/core'] },
      '@x402/svm': { severity: 'high', via: ['@x402/core'], nodes: ['node_modules/@x402/svm'] },
      'sanitize-html': {
        severity: 'moderate',
        via: [{ source: 1242620, name: 'sanitize-html', url: 'https://github.com/advisories/GHSA-x3q4-9hxx-gx8m', severity: 'moderate', title: 'XSS' }],
        nodes: ['node_modules/sanitize-html'],
      },
      ...extra,
    },
  };
}

const exception: AuditException = {
  advisory: 'GHSA-mrhx-c7xc-m3w5',
  package: 'zod',
  paths: ZOD_PATHS,
  owner: 'BrainsyETH',
  reviewed: '2026-10-27',
  expires: '2026-11-26',
  reason: 'upstream requires Zod 3',
  tracking: 'https://github.com/colinhacks/zod/issues/6653',
};

const TODAY = '2026-10-27';

test('the reviewed zod advisory passes, and chain packages are not judged on their own', () => {
  const verdict = evaluateAudit(report(), [exception], TODAY);
  assert.deepEqual(verdict.failures, []);
  assert.deepEqual(verdict.excepted.map((a) => a.id), ['GHSA-mrhx-c7xc-m3w5']);
  assert.deepEqual(verdict.ignored.map((a) => a.package), ['sanitize-html']);
});

test('without an exception, the same report fails exactly as npm audit --audit-level=high did', () => {
  const { failures } = evaluateAudit(report(), [], TODAY);
  assert.equal(failures.length, 1);
  assert.match(failures[0], /GHSA-mrhx-c7xc-m3w5 in zod/);
});

test('a new advisory on a package inside the excepted chain still fails', () => {
  const coreAdvisory = { source: 1, name: '@x402/core', url: 'https://github.com/advisories/GHSA-aaaa-bbbb-cccc', severity: 'critical', title: 'new' };
  const { failures } = evaluateAudit(
    report({ '@x402/core': { severity: 'critical', via: [coreAdvisory, 'zod'], nodes: ['node_modules/@x402/core'] } }),
    [exception],
    TODAY,
  );
  assert.equal(failures.length, 1);
  assert.match(failures[0], /critical GHSA-aaaa-bbbb-cccc in @x402\/core/);
});

test('the excepted advisory reaching a new copy of zod fails', () => {
  const { failures } = evaluateAudit(report({}, [...ZOD_PATHS, 'node_modules/zod']), [exception], TODAY);
  assert.equal(failures.length, 1);
  assert.match(failures[0], /paths its exception does not cover:\n {2}node_modules\/zod$/);
});

test('an expired exception fails even while it still matches', () => {
  const { failures } = evaluateAudit(report(), [exception], '2026-11-27');
  assert.ok(failures.some((f) => /expired on 2026-11-26/.test(f)), failures.join('\n'));
  assert.deepEqual(evaluateAudit(report(), [exception], '2026-11-26').failures, [], 'valid through its expiry date');
});

test('an exception cannot be set further out than the review window', () => {
  const tooLong = { ...exception, expires: '2027-06-01' };
  assert.ok(exceptionProblems([tooLong], TODAY).some((p) => p.includes(`within ${MAX_EXCEPTION_DAYS} days`)));
});

test('an exception without an owner is rejected', () => {
  const { owner: _owner, ...unowned } = exception;
  assert.ok(exceptionProblems([unowned as AuditException], TODAY).some((p) => p.endsWith('missing owner')));
});

test('an exception that no longer matches must be deleted', () => {
  const clean = { auditReportVersion: 2, vulnerabilities: {} };
  const { failures } = evaluateAudit(clean, [exception], TODAY);
  assert.deepEqual(failures, ['GHSA-mrhx-c7xc-m3w5 (zod) no longer appears in the audit. Delete its exception']);
});

test('an npm error or a non-report is never read as a clean audit', () => {
  assert.throws(() => rootAdvisories({ error: { code: 'ENOLOCK' } }), /returned an error/);
  assert.throws(() => rootAdvisories({}), /auditReportVersion 2/);
});

test('the committed exception file is well formed', () => {
  const committed = JSON.parse(
    readFileSync(path.resolve(process.cwd(), 'scripts/security/audit-exceptions.json'), 'utf8'),
  ) as AuditException[];
  // Checked against its own review date, so this test does not start failing on
  // the expiry day: the CI audit job is what enforces the calendar.
  for (const e of committed) {
    assert.deepEqual(exceptionProblems([e], e.reviewed), [], `${e.advisory} (${e.package})`);
  }
});
