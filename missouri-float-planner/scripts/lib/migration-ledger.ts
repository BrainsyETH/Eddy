/**
 * The production migration ledger: supabase/production-migrations.txt.
 *
 * Pure functions only, so scripts/migration-ledger.test.ts can enforce the
 * ledger's rules in CI without credentials, and check-migration-drift.ts can
 * cross-check the same ledger against the live project when credentials are
 * present. The file's own header explains why a ledger exists at all.
 */

import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

/**
 * Migrations at or before this version were applied by hand under versions
 * unrelated to their filenames; the ledger starts after it. Must equal
 * LEGACY_REMOTE_THROUGH in check-migration-drift.ts — a test pins that.
 */
export const LEDGER_BASELINE = '20260729165052';

export const LEDGER_PATH = path.join('supabase', 'production-migrations.txt');
export const MIGRATIONS_DIR = path.join('supabase', 'migrations');

const VERSION = /^\d{14}$/;
const MIGRATION_FILE = /^(\d{14})_.+\.sql$/;

export interface Ledger {
  applied: string[];
  pending: string[];
}

export function parseLedger(text: string): Ledger {
  const ledger: Ledger = { applied: [], pending: [] };
  let section: keyof Ledger | null = null;
  const seen = new Map<string, keyof Ledger>();

  text.split(/\r?\n/).forEach((raw, index) => {
    const line = raw.replace(/#.*$/, '').trim();
    if (!line) return;
    const where = `${LEDGER_PATH}:${index + 1}`;

    if (line === '[applied]' || line === '[pending]') {
      section = line.slice(1, -1) as keyof Ledger;
      return;
    }
    if (line.startsWith('[')) throw new Error(`${where}: unknown section ${line}`);
    if (!section) throw new Error(`${where}: version before any [section]`);
    if (!VERSION.test(line)) throw new Error(`${where}: not a 14-digit version: ${line}`);
    if (line <= LEDGER_BASELINE) {
      throw new Error(`${where}: ${line} is at or before the legacy baseline ${LEDGER_BASELINE}; the ledger starts after it`);
    }

    const already = seen.get(line);
    if (already) throw new Error(`${where}: ${line} is listed twice (${already} and ${section})`);
    seen.set(line, section);

    const list = ledger[section];
    const previous = list[list.length - 1];
    if (previous && previous > line) {
      throw new Error(`${where}: ${line} is out of order after ${previous}; keep each section sorted ascending`);
    }
    list.push(line);
  });

  return ledger;
}

/** Versions of the local migration files after the baseline, sorted. */
export function localMigrationVersions(files: string[]): string[] {
  return files
    .map((name) => MIGRATION_FILE.exec(name)?.[1])
    .filter((version): version is string => Boolean(version) && version! > LEDGER_BASELINE)
    .sort();
}

/**
 * The three rules from the ledger's header. Returns one message per problem;
 * an empty array is a clean ledger.
 */
export function checkLedger(ledger: Ledger, local: string[]): string[] {
  const problems: string[] = [];
  const localSet = new Set(local);
  const applied = new Set(ledger.applied);
  const pending = new Set(ledger.pending);
  const newestApplied = ledger.applied[ledger.applied.length - 1] ?? null;

  for (const version of ledger.applied) {
    if (!localSet.has(version)) {
      problems.push(
        `applied version ${version} has no local migration file. Production recorded it under ` +
          `this version; rename the file that was applied as ${version} to match.`
      );
    }
  }

  for (const version of ledger.pending) {
    if (applied.has(version)) {
      problems.push(`${version} is listed as both applied and pending; keep one.`);
    }
    if (!localSet.has(version)) {
      problems.push(`pending version ${version} has no local migration file; remove the line or restore the file.`);
    }
  }

  if (newestApplied) {
    for (const version of local) {
      if (version >= newestApplied) continue;
      if (applied.has(version) || pending.has(version)) continue;
      problems.push(
        `${version} is older than the newest applied version ${newestApplied} but is in neither ` +
          `[applied] nor [pending]. If it has been applied, add it under [applied] (renaming the file ` +
          `if the recording assigned a different version); if not, add it under [pending] — ` +
          `\`supabase db push\` will refuse it without --include-all, and nothing else says so.`
      );
    }
  }

  return problems;
}

export interface LedgerDrift {
  /** Production has it; the ledger does not. Add it under [applied]. */
  missingFromLedger: string[];
  /** The ledger says applied; production does not have it. */
  missingFromRemote: string[];
}

/** Cross-check the ledger against the versions the live project reports. */
export function findLedgerDrift(remote: string[], ledger: Ledger): LedgerDrift {
  const remoteSet = new Set(remote.filter((version) => VERSION.test(version) && version > LEDGER_BASELINE));
  const applied = new Set(ledger.applied);
  return {
    missingFromLedger: [...remoteSet].filter((version) => !applied.has(version)).sort(),
    missingFromRemote: ledger.applied.filter((version) => !remoteSet.has(version)),
  };
}

/** Convenience for callers running from the web app root. */
export function readRepoLedger(root = process.cwd()): { ledger: Ledger; local: string[] } {
  const ledger = parseLedger(readFileSync(path.join(root, LEDGER_PATH), 'utf8'));
  const local = localMigrationVersions(readdirSync(path.join(root, MIGRATIONS_DIR)));
  return { ledger, local };
}
