// Shared brand copy + neutral accents for the social render pipeline.
//
// Centralizing these keeps clip/reel branding from drifting: every composition
// pulls the same CTA wording and the same "no live condition" accent instead of
// hardcoding its own. See RouteDraw's EVERGREEN_STYLE for the live-agnostic
// accent this mirrors.
import { colors } from "../design-tokens/colors";
import { CONDITION_SYSTEM } from "../../../shared/condition-system";

/** Canonical call-to-action for "go plan a float" reels (RouteDraw,
 *  SectionGuide, ClipReel). Context-specific CTAs (e.g. TrendReel's
 *  "Full 7-day chart…") intentionally differ. */
export const PLAN_CTA = "Plan this float at eddy.guide";

/** Tier-2 hero label for clips not tied to one of Eddy's known rivers (e.g.
 *  out-of-Missouri paddling content). Stands in for the river name in the
 *  ClipReel masthead so the frame stays branded without naming a river we
 *  don't cover. */
export const OZARK_PADDLING_LABEL = "Ozark Paddling";

/** Tier-2 CTA — softer than PLAN_CTA because there's no specific river/float
 *  page to send the viewer to. */
export const GENERIC_CTA = "Find your next float at eddy.guide";

/** Eyebrow / series-label accent (coral) — the small uppercase label every
 *  reel sets above the river name. */
export const BRAND_EYEBROW_COLOR = colors.accent[400];

/** Neutral water-teal accent for content NOT tied to a live gauge reading
 *  (clips, Favorite Floats). Mirrors RouteDraw's evergreen accent. */
export const NEUTRAL_ACCENT = colors.primary[300];

/** Soft teal glow paired with NEUTRAL_ACCENT for text shadows / halos. */
export const NEUTRAL_GLOW = "rgba(114,181,196,0.45)";

// ─── High-water safety category ──────────────────────────────────────────────
// A distinct look for flood / high-water clips: the shock-value footage is the
// hook, and the payload is Eddy's core value — know the live level before you go.

/** Safety-PSA CTA for the high-water clip category. Points straight at the live
 *  gauge (the whole reason the clip is scary). Kept here, next to PLAN_CTA /
 *  GENERIC_CTA, so the safety wording is centralized and never drifts. */
export const SAFETY_CTA = "Know your river levels — check the gauge at eddy.guide";

/** Hero-title fallback for a high-water clip with no known Eddy river. Flood
 *  footage is frequently out-of-region, so it must NOT fall back to the
 *  Missouri-specific OZARK_PADDLING_LABEL — a neutral, universal line instead. */
export const HIGH_WATER_LABEL = "When Rivers Rise";

/** Warning accent for the high-water category — the eyebrow, title glow, and CTA
 *  color. Derived from the CANONICAL "high water" condition (never hardcode a
 *  condition hex — see the brand rule in shared/condition-system.ts) so the
 *  clip's alarm color is the same orange a follower already learned from the
 *  gauge alert reels. Swap to CONDITION_SYSTEM.dangerous for the stronger red
 *  "Flood" read. */
export const WARNING_ACCENT = CONDITION_SYSTEM.high.solid; // canonical high-water orange
export const WARNING_GLOW = CONDITION_SYSTEM.high.glow;
