import React from "react";
import { AbsoluteFill, spring } from "remotion";
import { EddyMascot } from "./EddyMascot";
import { Watermark } from "./Watermark";
import { BrandCTA } from "./BrandCTA";
import { ENTRANCE } from "../lib/spring-presets";
import { colors } from "../design-tokens/colors";
import { fontFamilies } from "../design-tokens/fonts";
import { BRAND_EYEBROW_COLOR, NEUTRAL_ACCENT, NEUTRAL_GLOW, PLAN_CTA } from "../lib/brand";

// Vertical geometry tuned in #713/#714 so the readable masthead text clears the
// Reels TOP chrome (handle/sound) and the footer messaging clears the BOTTOM UI
// zone (caption + right-hand action rail). The mascot may sit slightly into the
// top chrome — it's decorative — while the eyebrow/title/CTA stay in the safe
// band. The bottom teal area is intentionally left to the platform UI.
const MASTHEAD_TOP = 96;
const MASCOT_SIZE = 150;
const MEDIA_TOP = 410;
const MEDIA_W = 1080;
const MEDIA_H = 608; // 16:9 at full canvas width
const FOOTER_TOP = 1040;

interface ReelBrandFrameProps {
  /** Small uppercase series-style eyebrow above the title (coral). */
  eyebrow: string;
  /** Hero line — usually the river name (white). */
  title: string;
  /** Optional attribution under the media (e.g. a channel name or "@handle"). */
  creatorCredit?: string;
  /** CTA copy; defaults to the canonical PLAN_CTA. */
  cta?: string;
  /** Current frame + fps, for staggered entrances. */
  frame: number;
  fps: number;
  /** Media band content (e.g. an OffthreadVideo); the frame positions it. */
  children: React.ReactNode;
}

/**
 * Eddy brand chrome for a media reel: mascot + eyebrow + title masthead, a
 * centered 16:9 media band, a credit + CTA footer, and the persistent
 * eddy.guide watermark — all from the shared design tokens, so a wrapped clip
 * reads as part of the same render pipeline as RouteDraw / SectionGuide.
 */
export const ReelBrandFrame: React.FC<ReelBrandFrameProps> = ({
  eyebrow,
  title,
  creatorCredit,
  cta = PLAN_CTA,
  frame,
  fps,
  children,
}) => {
  const eyebrowIn = spring({ frame, fps, config: ENTRANCE });
  const titleIn = spring({ frame: frame - 8, fps, config: ENTRANCE });
  const footerIn = spring({ frame: frame - 16, fps, config: ENTRANCE });

  return (
    <AbsoluteFill style={{ backgroundColor: colors.primary[900], fontFamily: fontFamilies.body }}>
      {/* Masthead — mascot + eyebrow + river name */}
      <div
        style={{
          position: "absolute",
          top: MASTHEAD_TOP,
          left: 0,
          right: 0,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
        }}
      >
        <EddyMascot variant="canoe" size={MASCOT_SIZE} />
        <div
          style={{
            opacity: eyebrowIn,
            fontFamily: fontFamilies.display,
            fontSize: 32,
            fontWeight: 500,
            color: BRAND_EYEBROW_COLOR,
            letterSpacing: 2,
            textTransform: "uppercase",
            marginTop: 8,
          }}
        >
          {eyebrow}
        </div>
        <div
          style={{
            opacity: titleIn,
            fontFamily: fontFamilies.display,
            fontSize: 58,
            fontWeight: 600,
            color: "#fff",
            textAlign: "center",
            padding: "0 120px",
            lineHeight: 1.05,
            marginTop: 14,
            textShadow: `0 0 30px ${NEUTRAL_GLOW}`,
          }}
        >
          {title}
        </div>
      </div>

      {/* Media band — 16:9 at full width */}
      <div style={{ position: "absolute", top: MEDIA_TOP, left: 0, width: MEDIA_W, height: MEDIA_H, overflow: "hidden" }}>
        {children}
      </div>

      {/* Footer — credit + CTA, comfortably above the Reels bottom UI zone */}
      <div
        style={{
          position: "absolute",
          top: FOOTER_TOP,
          left: 0,
          right: 0,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 16,
        }}
      >
        {creatorCredit ? (
          <div style={{ opacity: footerIn, color: colors.secondary[400], fontSize: 28 }}>🎥 Clip via {creatorCredit}</div>
        ) : null}
        <BrandCTA color={NEUTRAL_ACCENT} opacity={footerIn} text={cta} />
      </div>

      {/* Persistent eddy.guide mark — same component every other reel uses. */}
      <Watermark format="portrait" />
    </AbsoluteFill>
  );
};
