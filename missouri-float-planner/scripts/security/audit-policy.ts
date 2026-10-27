// ── Runtime dependency audit policy ──────────────────────────────────
//
// `npm audit --audit-level=high` has one setting: fail on anything. With one
// unfixable upstream advisory in the tree (see docs/x402.md), that made the
// dependency-audit check red on every run, and a check that is always red is a
// check nobody reads. A NEW high-severity advisory would have landed in the same
// red row as the known one and gone unnoticed.
//
// This replaces it with a narrow exception, under rules a reviewer wrote down
// before anyone needed them (CLAUDE.md, docs/x402.md):
//
//   - An exception names ONE advisory, ONE package, and the exact install paths
//     reviewed. The same advisory reaching a new copy of the package, anywhere
//     else in the tree, fails.
//   - It is judged on root advisories, not on the packages npm lists as merely
//     depending on one. A new advisory against @x402/core itself still fails
//     even though @x402/core sits on the excepted zod chain.
//   - It has an owner, and says what is exposed and what compensates
//     (docs/UX_SECURITY_SITE_AUDIT_2026-07.md set that bar).
//   - It expires. Expiry is enforced, and so is a cap on how far out a reviewer
//     may set it, so renewal is a fresh review rather than a date edit.
//   - An exception that no longer matches anything fails too. Left in place, a
//     stale one would quietly cover the same advisory if it came back.
//
// Pure logic only; scripts/check-audit.ts runs npm and prints the result.

export const BLOCKING_SEVERITIES = new Set(['high', 'critical']);

/** Longest an exception may run from its review date before it must be re-reviewed. */
export const MAX_EXCEPTION_DAYS = 45;

export type AuditException = {
  advisory: string;
  package: string;
  paths: string[];
  owner: string;
  reviewed: string;
  expires: string;
  reason: string;
  tracking: string;
};

export type AuditAdvisory = {
  id: string;
  package: string;
  severity: string;
  title: string;
  url: string;
  paths: string[];
};

type ViaObject = { name?: string; severity?: string; title?: string; url?: string; source?: number };

type AuditReport = {
  auditReportVersion?: number;
  error?: unknown;
  vulnerabilities?: Record<string, { nodes?: string[]; via?: Array<string | ViaObject> }>;
};

const DAY_MS = 86_400_000;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function advisoryId(via: ViaObject): string {
  const fromUrl = via.url?.match(/GHSA-[\w-]+/)?.[0];
  return fromUrl ?? `npm-${via.source ?? 'unknown'}`;
}

/** Root advisories in an `npm audit --json` (v2) report, one entry per advisory and package. */
export function rootAdvisories(report: AuditReport): AuditAdvisory[] {
  if (report.error) {
    throw new Error(`npm audit returned an error instead of a report: ${JSON.stringify(report.error)}`);
  }
  if (report.auditReportVersion !== 2 || !report.vulnerabilities) {
    throw new Error('expected an npm audit report (auditReportVersion 2); refusing to treat anything else as clean');
  }
  const advisories: AuditAdvisory[] = [];
  for (const [name, vulnerability] of Object.entries(report.vulnerabilities)) {
    for (const via of vulnerability.via ?? []) {
      // A string names another package in the chain. Its own entry carries the advisory.
      if (typeof via === 'string') continue;
      advisories.push({
        id: advisoryId(via),
        package: via.name ?? name,
        severity: via.severity ?? 'unknown',
        title: via.title ?? '',
        url: via.url ?? '',
        paths: [...(vulnerability.nodes ?? [])].sort(),
      });
    }
  }
  return advisories;
}

/** Problems with an exception file itself, independent of any report. */
export function exceptionProblems(exceptions: AuditException[], today: string): string[] {
  const problems: string[] = [];
  const seen = new Set<string>();
  for (const e of exceptions) {
    const label = `${e.advisory ?? '?'} (${e.package ?? '?'})`;
    for (const field of ['advisory', 'package', 'owner', 'reviewed', 'expires', 'reason', 'tracking'] as const) {
      if (typeof e[field] !== 'string' || e[field].trim() === '') problems.push(`${label}: missing ${field}`);
    }
    if (!Array.isArray(e.paths) || e.paths.length === 0) {
      problems.push(`${label}: must list the exact node_modules paths reviewed`);
    }
    if (!ISO_DATE.test(e.reviewed ?? '') || !ISO_DATE.test(e.expires ?? '')) {
      problems.push(`${label}: reviewed and expires must be YYYY-MM-DD`);
      continue;
    }
    const span = (Date.parse(e.expires) - Date.parse(e.reviewed)) / DAY_MS;
    if (span <= 0 || span > MAX_EXCEPTION_DAYS) {
      problems.push(`${label}: expiry must fall within ${MAX_EXCEPTION_DAYS} days of review (got ${span})`);
    }
    if (e.expires < today) {
      problems.push(`${label}: expired on ${e.expires}. Re-review it (docs/x402.md) or remove it`);
    }
    const key = `${e.advisory}\0${e.package}`;
    if (seen.has(key)) problems.push(`${label}: listed twice`);
    seen.add(key);
  }
  return problems;
}

export type AuditVerdict = {
  failures: string[];
  excepted: AuditAdvisory[];
  ignored: AuditAdvisory[];
};

export function evaluateAudit(report: AuditReport, exceptions: AuditException[], today: string): AuditVerdict {
  const failures = exceptionProblems(exceptions, today);
  const excepted: AuditAdvisory[] = [];
  const ignored: AuditAdvisory[] = [];
  const used = new Set<AuditException>();

  for (const advisory of rootAdvisories(report)) {
    if (!BLOCKING_SEVERITIES.has(advisory.severity)) {
      ignored.push(advisory);
      continue;
    }
    const exception = exceptions.find((e) => e.advisory === advisory.id && e.package === advisory.package);
    if (!exception) {
      failures.push(`${advisory.severity} ${advisory.id} in ${advisory.package}: ${advisory.title} ${advisory.url}`);
      continue;
    }
    used.add(exception);
    const unreviewed = advisory.paths.filter((p) => !exception.paths.includes(p));
    if (unreviewed.length > 0) {
      failures.push(
        `${advisory.id} in ${advisory.package} reached paths its exception does not cover:\n  ${unreviewed.join('\n  ')}`,
      );
      continue;
    }
    excepted.push(advisory);
  }

  for (const e of exceptions) {
    if (!used.has(e)) {
      failures.push(`${e.advisory} (${e.package}) no longer appears in the audit. Delete its exception`);
    }
  }
  return { failures, excepted, ignored };
}
