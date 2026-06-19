import React from "react";
import { fontFamilies } from "../design-tokens/fonts";
import { PLAN_CTA } from "../lib/brand";

interface BrandCTAProps {
  /** Accent color — a live condition color or a neutral brand accent. */
  color: string;
  /** Entrance opacity (0..1). */
  opacity?: number;
  /** Larger type in portrait reels. */
  isPortrait?: boolean;
  /** Override copy; defaults to the canonical PLAN_CTA. */
  text?: string;
  style?: React.CSSProperties;
}

/**
 * Canonical reel call-to-action — Fredoka text in the brand/condition accent.
 * Shared by SectionGuide, RouteDraw and ClipReel so every reel's CTA reads
 * identically instead of each composition rolling its own string + styling.
 */
export const BrandCTA: React.FC<BrandCTAProps> = ({
  color,
  opacity = 1,
  isPortrait = true,
  text = PLAN_CTA,
  style,
}) => (
  <div
    style={{
      opacity,
      fontFamily: fontFamilies.display,
      fontSize: isPortrait ? 28 : 22,
      color,
      letterSpacing: 0.5,
      textAlign: "center",
      ...style,
    }}
  >
    {text}
  </div>
);
