// src/lib/trust/registry.ts
// Every check the ledger knows how to run.
//
// Cadence lives here rather than in vercel.json on purpose. That file already
// declares 23 cron entries against a ceiling around 40, and a design where each
// check costs a slot would run out before the interesting checks were written.
// One cron path drains this list; adding a check is a one-line change here and
// costs nothing in Vercel's budget.

import type { TrustCheck } from './types';
import { validateRiverDataCheck } from './checks/validate-river-data';
import { riverGeometryCheck } from './checks/river-geometry';
import { eddyKnowledgeCheck } from './checks/eddy-knowledge';
import { floatSummaryCheck } from './checks/float-summary';
import { gaugeWiringCheck } from './checks/gauge-wiring';
import { usgsSiteDriftCheck } from './checks/usgs-site-drift';
import { serviceGeoConsistencyCheck } from './checks/service-geo-consistency';
import { floatEndpointEligibilityCheck } from './checks/float-endpoint-eligibility';
import { schemaInvariantsCheck } from './checks/schema-invariants';
import { ledgerHeartbeatCheck } from './checks/ledger-heartbeat';
import { knownRegressionsCheck } from './checks/known-regressions';

export const TRUST_CHECKS: readonly TrustCheck[] = [
  validateRiverDataCheck,
  riverGeometryCheck,
  eddyKnowledgeCheck,
  floatSummaryCheck,
  gaugeWiringCheck,
  usgsSiteDriftCheck,
  serviceGeoConsistencyCheck,
  floatEndpointEligibilityCheck,
  schemaInvariantsCheck,
  ledgerHeartbeatCheck,
  knownRegressionsCheck,
];

export function getCheck(id: string): TrustCheck | undefined {
  return TRUST_CHECKS.find((check) => check.id === id);
}

export const CADENCE_INTERVAL_MS: Record<TrustCheck['cadence'], number> = {
  hourly: 60 * 60 * 1000,
  daily: 24 * 60 * 60 * 1000,
};

export interface CheckDueInput {
  check: Pick<TrustCheck, 'id' | 'cadence'>;
  lastStartedAt: Date | null;
  now: Date;
}

/**
 * Whether a check has waited out its cadence.
 *
 * Deliberately generous: the tick runs hourly and cron firing times drift, so an
 * hourly check whose last run was 59 minutes and 50 seconds ago would be skipped
 * for a full extra hour by an exact comparison. The slack is a tenth of the
 * interval, which is enough to absorb the drift without letting a daily check
 * creep into running twice.
 */
export function isCheckDue(input: CheckDueInput): boolean {
  if (!input.lastStartedAt) return true;
  const interval = CADENCE_INTERVAL_MS[input.check.cadence];
  const elapsed = input.now.getTime() - input.lastStartedAt.getTime();
  return elapsed >= interval * 0.9;
}

/**
 * Least-recently-run first.
 *
 * This ordering IS the cursor, the same way `.order('last_synced_at')` is the
 * cursor in src/lib/camping/sync.ts. When the tick runs out of budget it stops
 * partway down the list, and the checks it did not reach sort to the front of
 * the next tick — so a slow check cannot starve the ones behind it.
 */
export function orderByStaleness<T extends { id: string }>(
  checks: readonly T[],
  lastStartedById: Map<string, Date | null>,
): T[] {
  return [...checks].sort((a, b) => {
    const aTime = lastStartedById.get(a.id)?.getTime() ?? 0;
    const bTime = lastStartedById.get(b.id)?.getTime() ?? 0;
    if (aTime !== bTime) return aTime - bTime;
    return a.id.localeCompare(b.id);
  });
}
