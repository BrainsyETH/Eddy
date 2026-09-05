import React from "react";
import { fontFamilies } from "../design-tokens/fonts";
import { REEL_SAFE } from "../lib/reel-safe";
import { BrandCard } from "./BrandCard";
import { BrandCTA } from "./BrandCTA";
import { SURFACES, TYPE, colors, type SocialTone } from "../../../shared/social-brand";

interface ReelDockProps {
  tone?: SocialTone;
  /** Card border override (a condition colour on the dark tone). */
  accent?: string;
  /** Stat tiles, laid out in an equal-column grid. */
  tiles?: React.ReactNode[];
  /** The line under the tiles ("0.4 hr faster today"). */
  detail?: string;
  detailColor?: string;
  /** Button copy; omit for no CTA. */
  cta?: string;
  ctaFill?: string;
  /** CTA entrance (0..1). */
  ctaProgress?: number;
  /** `text` for a caption-pointing CTA ("Full report below ▼"). */
  ctaVariant?: "button" | "text";
  /** Growth line drawn under the card, at the very bottom of the safe zone. */
  followCta?: string;
  /** Anything else to stack above the detail row (a quote, a note). */
  children?: React.ReactNode;
  /** Bottom edge of the card. Defaults to sit just above the follow line. */
  bottom?: number;
  /** Bottom edge of the follow line (the Reels safe-zone floor by default). */
  followBottom?: number;
}

/**
 * The bottom card of a social reel: stat tiles, a detail line, the CTA button,
 * and the optional follow line beneath. Pinned above the Reels bottom chrome.
 */
export const ReelDock: React.FC<ReelDockProps> = ({
  tone = "light",
  accent,
  tiles,
  detail,
  detailColor,
  cta,
  ctaFill = colors.accent[500],
  ctaProgress = 1,
  ctaVariant = "button",
  followCta,
  children,
  bottom = REEL_SAFE.bottom + 52,
  followBottom = REEL_SAFE.bottom,
}) => {
  const s = SURFACES[tone];
  const columns = tiles?.length ?? 0;
  return (
    <>
      <div style={{ position: "absolute", left: REEL_SAFE.left, right: REEL_SAFE.right, bottom, zIndex: 15 }}>
        <BrandCard tone={tone} accent={accent}>
          {columns > 0 ? (
            <div style={{ display: "grid", gridTemplateColumns: `repeat(${columns}, 1fr)`, gap: 13 }}>{tiles}</div>
          ) : null}
          {children}
          {detail || cta ? (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: detail ? "space-between" : "flex-end",
                gap: 18,
                marginTop: columns > 0 || children ? 16 : 0,
                padding: "0 5px",
              }}
            >
              {detail ? (
                <span
                  style={{
                    fontSize: TYPE.detail.size,
                    fontWeight: TYPE.detail.weight,
                    color: detailColor ?? s.inkSecondary,
                  }}
                >
                  {detail}
                </span>
              ) : null}
              {cta ? <BrandCTA text={cta} tone={tone} fill={ctaFill} progress={ctaProgress} variant={ctaVariant} /> : null}
            </div>
          ) : null}
        </BrandCard>
      </div>
      {followCta ? (
        <div
          style={{
            position: "absolute",
            left: REEL_SAFE.left,
            right: REEL_SAFE.right,
            bottom: followBottom,
            zIndex: 15,
            opacity: ctaProgress,
            textAlign: "center",
            fontFamily: fontFamilies.display,
            fontSize: TYPE.follow.size,
            fontWeight: TYPE.follow.weight,
            color: tone === "light" ? colors.primary[700] : s.inkSecondary,
          }}
        >
          {followCta}
        </div>
      ) : null}
    </>
  );
};
