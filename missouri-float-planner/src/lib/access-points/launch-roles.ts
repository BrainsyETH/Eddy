// src/lib/access-points/launch-roles.ts
// Which roles mean "you can put a boat in here".
//
// One definition, because three consumers answer the same question and a
// disagreement between them is invisible until it is expensive:
//
//   scripts/ingestion/import-dossier-access-points.ts  writes is_float_endpoint
//   src/lib/trust/checks/float-endpoint-eligibility.ts reports on it
//   src/app/api/admin/access-points/...                offers a default for it
//
// If the importer thought a bridge was a launch and the check did not, every
// imported bridge would open a finding the moment it was approved — a check
// arguing with the pipeline that fed it.
//
// This is the ROLES axis of ADR 0008 (docs/decisions/0008-...), not a display
// category. `bridge` is here and it is the one worth defending: a low-water
// crossing is how a great many Ozarks floats actually start, ramp or no ramp.

export const LAUNCH_ROLES = ['access', 'boat_ramp', 'gravel_bar', 'bridge'] as const;

const LAUNCH_ROLE_SET: ReadonlySet<string> = new Set(LAUNCH_ROLES);

export function isLaunchRole(role: string): boolean {
  return LAUNCH_ROLE_SET.has(role);
}

/**
 * The launch roles a record actually carries.
 *
 * Falls back to the singular `type` when `types` is empty, matching how the
 * rest of the codebase reads a row that predates the roles axis — 97 approved
 * rows still have an empty array, which is why nothing may assume it is filled.
 * An empty result means "carries no launch role", NOT "is not a launch": an
 * unclassified row has not answered, and callers must keep those two apart.
 */
export function launchRolesOf(
  types: readonly (string | null)[] | null | undefined,
  type?: string | null,
): string[] {
  const roles = (types ?? []).filter((t): t is string => typeof t === 'string' && t.length > 0);
  const effective = roles.length > 0 ? roles : type ? [type] : [];
  return effective.filter(isLaunchRole);
}

/**
 * The default eligibility to OFFER for a record — never to apply silently.
 *
 * The column is opt-in (DEFAULT false, see 20260823190713) because offering a
 * launch where there is no ramp is a safety error. That makes this a
 * suggestion for a human to confirm or a pipeline to record deliberately, not
 * an inference anything should apply behind somebody's back.
 */
export function defaultFloatEndpoint(
  types: readonly (string | null)[] | null | undefined,
  type?: string | null,
): boolean {
  return launchRolesOf(types, type).length > 0;
}
