// Shared brand copy + neutral accents for the social render pipeline.
//
// Centralizing these keeps clip/reel branding from drifting: every composition
// pulls the same CTA wording and the same "no live condition" accent instead of
// hardcoding its own. See RouteDraw's EVERGREEN_STYLE for the live-agnostic
// accent this mirrors.
import { colors } from "../design-tokens/colors";

/** Canonical call-to-action for "go plan a float" reels (RouteDraw,
 *  SectionGuide, ClipReel). Context-specific CTAs (e.g. TrendReel's
 *  "Full 7-day chart…") intentionally differ. */
export const PLAN_CTA = "Plan this float at eddy.guide";

/** Eyebrow / series-label accent (coral) — the small uppercase label every
 *  reel sets above the river name. */
export const BRAND_EYEBROW_COLOR = colors.accent[400];

/** Neutral water-teal accent for content NOT tied to a live gauge reading
 *  (clips, Favorite Floats). Mirrors RouteDraw's evergreen accent. */
export const NEUTRAL_ACCENT = colors.primary[300];

/** Soft teal glow paired with NEUTRAL_ACCENT for text shadows / halos. */
export const NEUTRAL_GLOW = "rgba(114,181,196,0.45)";
