import React from "react";
import { fontFamilies } from "../design-tokens/fonts";
import { REEL_SAFE } from "../lib/reel-safe";
import {
  colors,
  inkOn,
  pillStyle,
  SURFACES,
  TYPE,
  WORDMARK,
  type SocialTone,
} from "../../../shared/social-brand";

interface ReelMastheadProps {
  /** The series label in the coral pill ("Float Pick", "Eddy Says"). */
  label: string;
  /** Hero line — usually the river name. */
  title: string;
  /** Date, editorial tagline, or a one-line fact under the title. */
  subtitle?: string;
  subtitleItalic?: boolean;
  tone?: SocialTone;
  /** Pill fill; defaults to coral. Alerts pass the condition colour. */
  labelFill?: string;
  /** Pill entrance / hold opacity. Defaults to 1 so frame 0 is branded. */
  labelOpacity?: number;
  titleOpacity?: number;
  subtitleOpacity?: number;
  /** Title size override (the default TYPE.title fits two words of river name). */
  titleSize?: number;
  /** Hide the wordmark (only when the composition draws it elsewhere). */
  wordmark?: boolean;
  /**
   * Positioned: pin the masthead to the top of the Reels safe zone. Unset, it
   * renders in flow so a slide can stack it with other content.
   */
  pinned?: boolean;
  /** Something to draw on the pill's row, right of the wordmark's slot. */
  aside?: React.ReactNode;
  /** Over footage: a dark halo under the title so bright water can't wash it
   *  out. Off on solid grounds, where the system draws no glow. */
  overMedia?: boolean;
}

/**
 * The masthead every social reel opens with: series-label pill + eddy.guide
 * wordmark on one row, then the hero line and its subtitle, left-aligned inside
 * the Reels safe zone. Owned here so the type treatment can't drift between
 * compositions — a caller supplies content, tone and entrance opacities.
 */
export const ReelMasthead: React.FC<ReelMastheadProps> = ({
  label,
  title,
  subtitle,
  subtitleItalic = false,
  tone = "light",
  labelFill = colors.accent[500],
  labelOpacity = 1,
  titleOpacity = 1,
  subtitleOpacity = 1,
  titleSize = TYPE.title.size,
  wordmark = true,
  pinned = false,
  aside,
  overMedia = false,
}) => {
  const s = SURFACES[tone];
  const halo = overMedia ? "0 2px 0 rgba(15,45,53,0.55), 0 0 28px rgba(15,45,53,0.95)" : undefined;
  return (
    <div
      style={
        pinned
          ? { position: "absolute", top: REEL_SAFE.top, left: REEL_SAFE.left, right: REEL_SAFE.right, zIndex: 10 }
          : { width: "100%" }
      }
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16 }}>
        <span
          style={{
            ...pillStyle(tone, labelFill),
            opacity: labelOpacity,
            padding: "7px 16px",
            fontFamily: fontFamilies.display,
            fontSize: TYPE.label.size,
            fontWeight: TYPE.label.weight,
            color: inkOn(labelFill),
            letterSpacing: TYPE.label.tracking,
            textTransform: "uppercase",
            whiteSpace: "nowrap",
          }}
        >
          {label}
        </span>
        <span style={{ display: "flex", alignItems: "center", gap: 14 }}>
          {aside}
          {wordmark ? (
            <span
              style={{
                fontFamily: fontFamilies.display,
                fontSize: TYPE.wordmark.size,
                fontWeight: TYPE.wordmark.weight,
                color: s.wordmark,
              }}
            >
              {WORDMARK}
            </span>
          ) : null}
        </span>
      </div>
      <div
        style={{
          opacity: titleOpacity,
          marginTop: 20,
          fontFamily: fontFamilies.display,
          fontSize: titleSize,
          lineHeight: TYPE.title.lineHeight,
          fontWeight: TYPE.title.weight,
          letterSpacing: TYPE.title.tracking,
          color: s.ink,
          textShadow: halo,
        }}
      >
        {title}
      </div>
      {subtitle ? (
        <div
          style={{
            opacity: subtitleOpacity,
            marginTop: 8,
            fontSize: TYPE.subtitle.size,
            fontWeight: TYPE.subtitle.weight,
            fontStyle: subtitleItalic ? "italic" : "normal",
            color: s.inkSecondary,
            textShadow: halo,
          }}
        >
          {subtitle}
        </div>
      ) : null}
    </div>
  );
};
