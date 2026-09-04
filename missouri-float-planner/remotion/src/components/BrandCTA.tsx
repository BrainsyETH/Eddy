import React from "react";
import { interpolate } from "remotion";
import { fontFamilies } from "../design-tokens/fonts";
import { PLAN_CTA } from "../lib/brand";
import { buttonStyle, inkOn, SURFACES, TYPE, colors, type SocialTone } from "../../../shared/social-brand";

interface BrandCTAProps {
  /** Copy; defaults to the canonical PLAN_CTA. */
  text?: string;
  tone?: SocialTone;
  /** Button fill; coral by default. */
  fill?: string;
  /** Entrance (0..1): fades and settles the button up 8px. */
  progress?: number;
  /**
   * `button` (default) draws the coral block. `text` draws the copy as a plain
   * accent line — for a CTA that points at the caption ("Full report below ▼")
   * rather than at the site.
   */
  variant?: "button" | "text";
  /** Text variant colour. */
  color?: string;
  style?: React.CSSProperties;
}

/**
 * The call-to-action of the social design system — a coral, black-ruled,
 * hard-shadowed button — shared by every reel and drawn from the same tokens
 * the covers use, so no composition rolls its own CTA.
 */
export const BrandCTA: React.FC<BrandCTAProps> = ({
  text = PLAN_CTA,
  tone = "light",
  fill = colors.accent[500],
  progress = 1,
  variant = "button",
  color,
  style,
}) => {
  const lift = interpolate(progress, [0, 1], [8, 0]);
  if (variant === "text") {
    return (
      <span
        style={{
          opacity: progress,
          transform: `translateY(${lift}px)`,
          fontFamily: fontFamilies.display,
          fontSize: TYPE.button.size,
          fontWeight: TYPE.button.weight,
          color: color ?? SURFACES[tone].inkSecondary,
          whiteSpace: "nowrap",
          ...style,
        }}
      >
        {text}
      </span>
    );
  }
  return (
    <span
      style={{
        ...buttonStyle(tone, fill),
        opacity: progress,
        transform: `translateY(${lift}px)`,
        display: "inline-block",
        padding: "10px 16px",
        fontFamily: fontFamilies.display,
        fontSize: TYPE.button.size,
        fontWeight: TYPE.button.weight,
        color: inkOn(fill),
        whiteSpace: "nowrap",
        ...style,
      }}
    >
      {text}
    </span>
  );
};
