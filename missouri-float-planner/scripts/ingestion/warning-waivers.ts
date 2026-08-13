// Warnings a river is allowed to carry into production, and why.
//
// ── Why waivers instead of "no warnings" ───────────────────────────────────
// Errors and warnings are different claims. An error means the condition badge
// or core UX is broken. A warning very often means an intentional absence —
// no weather point yet, no regulation geometry, no campground found, a badge a
// regime deliberately does not have. Eddy already ships some on purpose:
// no_dangerous and no_too_low are left live on spring-fed rivers.
//
// So a blanket "activate with zero warnings" rule cannot be obeyed, and a rule
// that cannot be obeyed gets ignored — which is warning fatigue by a longer
// road. The rule that works is: every warning still standing at activation was
// LOOKED AT by someone who wrote down why it stays.
//
// ── Why a file and not a comment ───────────────────────────────────────────
// A waiver with no expiry is a comment. `reviewBy` is the whole mechanism: an
// expired waiver stops suppressing its warning and the finding comes back,
// loudly, in the next activation run. "We'll fix the weather point later"
// becomes a dated commitment rather than a sentence nobody re-reads.
//
// Keep this in the repo rather than the database on purpose. A waiver is a
// judgement about a river, it belongs in review alongside the change that
// needed it, and its history is worth having in git.

export interface WarningWaiver {
  /** rivers.slug the waiver applies to. */
  riverSlug: string;
  /** validate_river_data() check_name being waived. */
  checkName: string;
  /** Why this warning is acceptable here. Not "known issue" — the actual reason. */
  reason: string;
  /** Who decided. A person, so there is someone to ask. */
  owner: string;
  /** ISO date. After this, the waiver stops applying and the warning returns. */
  reviewBy: string;
}

export const WARNING_WAIVERS: WarningWaiver[] = [
  // None yet. The Bull Shoals tailwater will need at least
  // missing_weather_point and missing_alert_terms waived or filled before it
  // activates, and tailwater_gauge_post_confluence waived permanently-ish —
  // that one is a true statement about the river, not a defect: 07057370 does
  // carry Norfork's water, and saying so every time is the point.
];

export function isWaived(
  riverSlug: string,
  checkName: string,
  today: string,
  waivers: readonly WarningWaiver[] = WARNING_WAIVERS,
): WarningWaiver | null {
  const hit = waivers.find((w) => w.riverSlug === riverSlug && w.checkName === checkName);
  if (!hit) return null;
  // Expired waivers do not suppress. Comparing ISO dates as strings is exact
  // for YYYY-MM-DD and avoids dragging a timezone into a calendar question.
  if (hit.reviewBy < today) return null;
  return hit;
}

/** Waivers past their review date, whether or not their warning still fires. */
export function expiredWaivers(
  today: string,
  waivers: readonly WarningWaiver[] = WARNING_WAIVERS,
): WarningWaiver[] {
  return waivers.filter((w) => w.reviewBy < today);
}
