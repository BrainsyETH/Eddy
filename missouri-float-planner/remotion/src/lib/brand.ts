// Brand copy + accents for the social render pipeline.
//
// The words and colours themselves are owned by shared/social-brand.ts (the OG
// covers read the same file); this module re-exports them under the names the
// compositions have always used, and adds the two accents that need the
// condition system.
import { colors } from "../design-tokens/colors";
import { CONDITION_SYSTEM } from "../../../shared/condition-system";
import { CTA, HIGH_WATER_LABEL, OZARK_PADDLING_LABEL, SAFETY_DETAIL } from "../../../shared/social-brand";

export { HIGH_WATER_LABEL, OZARK_PADDLING_LABEL, SAFETY_DETAIL };

/** Canonical "go plan a float" button (RouteDraw, ClipReel). Short, because the
 *  masthead already carries the eddy.guide wordmark. */
export const PLAN_CTA = CTA.plan;

/** Tier-2 button — softer than PLAN_CTA because there's no specific river/float
 *  page to send the viewer to. */
export const GENERIC_CTA = CTA.find;

/** Neutral water-teal accent for content NOT tied to a live gauge reading
 *  (clips, Favorite Floats). */
export const NEUTRAL_ACCENT = colors.primary[300];

/** Warning accent for the high-water category — the pill, borders and dock
 *  rule. Derived from the CANONICAL "high water" condition (never hardcode a
 *  condition hex — see the brand rule in shared/condition-system.ts) so the
 *  clip's alarm colour is the same orange a follower already learned from the
 *  gauge alert reels. */
export const WARNING_ACCENT = CONDITION_SYSTEM.high.solid;
