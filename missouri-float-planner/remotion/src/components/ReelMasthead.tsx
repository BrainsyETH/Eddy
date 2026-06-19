import React from "react";
import { fontFamilies } from "../design-tokens/fonts";
import { BRAND_EYEBROW_COLOR } from "../lib/brand";

interface ReelMastheadProps {
  /** Uppercase series-label eyebrow (coral). Omit for no eyebrow. */
  eyebrow?: string;
  /** Hero line — the river name (white, glowing). */
  title: string;
  /** Date or editorial tagline under the title. */
  subtitle?: string;
  /** Glow color for the title text-shadow (live condition or neutral accent). */
  glow: string;
  isPortrait: boolean;
  eyebrowOpacity?: number;
  titleOpacity?: number;
  subtitleOpacity?: number;
  /** Italicize the subtitle (editorial taglines vs. plain dates). */
  subtitleItalic?: boolean;
}

/**
 * The eyebrow + river-name + date/tagline masthead shared by the float reels
 * (RouteDraw, SectionGuide, ClipReel via ReelBrandFrame). Extracted so the
 * masthead can't drift between compositions — the caller supplies positioning,
 * content and entrance opacities; the type treatment lives here.
 */
export const ReelMasthead: React.FC<ReelMastheadProps> = ({
  eyebrow,
  title,
  subtitle,
  glow,
  isPortrait,
  eyebrowOpacity = 1,
  titleOpacity = 1,
  subtitleOpacity = 1,
  subtitleItalic = false,
}) => (
  <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
    {eyebrow ? (
      <div
        style={{
          opacity: eyebrowOpacity,
          fontFamily: fontFamilies.display,
          fontSize: isPortrait ? 40 : 30,
          fontWeight: 500,
          color: BRAND_EYEBROW_COLOR,
          letterSpacing: 1,
          textTransform: "uppercase",
        }}
      >
        {eyebrow}
      </div>
    ) : null}
    <div
      style={{
        opacity: titleOpacity,
        fontFamily: fontFamilies.display,
        fontSize: isPortrait ? 74 : 56,
        fontWeight: 600,
        color: "#fff",
        textAlign: "center",
        textShadow: `0 0 30px ${glow}`,
      }}
    >
      {title}
    </div>
    {subtitle ? (
      <div
        style={{
          opacity: subtitleOpacity,
          fontFamily: fontFamilies.body,
          fontSize: isPortrait ? 28 : 22,
          color: "rgba(255,255,255,0.55)",
          textAlign: "center",
          padding: "0 60px",
          fontStyle: subtitleItalic ? "italic" : "normal",
        }}
      >
        {subtitle}
      </div>
    ) : null}
  </div>
);
