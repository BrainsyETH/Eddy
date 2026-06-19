import React from "react";
import { AbsoluteFill, spring } from "remotion";
import { EddyMascot } from "./EddyMascot";
import { Watermark } from "./Watermark";
import { BrandCTA } from "./BrandCTA";
import { Captions } from "./Captions";
import { ENTRANCE } from "../lib/spring-presets";
import { colors } from "../design-tokens/colors";
import { fontFamilies } from "../design-tokens/fonts";
import { BRAND_EYEBROW_COLOR, NEUTRAL_ACCENT, NEUTRAL_GLOW, PLAN_CTA } from "../lib/brand";
import type { Caption } from "../lib/social-props";

// Vertical geometry tuned in #713/#714 so the readable masthead text clears the
// Reels TOP chrome (handle/sound) and the footer messaging clears the BOTTOM UI
// zone (caption + right-hand action rail). The mascot may sit slightly into the
// top chrome — it's decorative — while the eyebrow/title/CTA stay in the safe
// band. The bottom teal area is intentionally left to the platform UI.
const MASTHEAD_TOP = 96;
const MASCOT_SIZE = 150;
const MEDIA_TOP = 410;
const MEDIA_W = 1080;
const MEDIA_H = 608; // 16:9 at full canvas width (landscape sources)
const CAPTION_TOP = 928; // just above the footer, over the lower media
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
  /** Timed transcript captions drawn over the lower media (optional). */
  captions?: Caption[];
  /**
   * Full-bleed media instead of the centered 16:9 band — use for natively
   * VERTICAL sources so they fill the frame (with legibility scrims) rather than
   * being letterboxed into a small landscape band.
   */
  fullBleed?: boolean;
  /** Current frame + fps, for staggered entrances. */
  frame: number;
  fps: number;
  /** Media band content (e.g. an OffthreadVideo); the frame positions it. */
  children: React.ReactNode;
}

/**
 * Eddy brand chrome for a media reel: mascot + eyebrow + title masthead, the
 * media (centered 16:9 band for landscape sources, or full-bleed for vertical),
 * a credit + CTA footer, optional captions, and the persistent eddy.guide
 * watermark — all from the shared design tokens, so a wrapped clip reads as part
 * of the same render pipeline as RouteDraw / SectionGuide.
 */
export const ReelBrandFrame: React.FC<ReelBrandFrameProps> = ({
  eyebrow,
  title,
  creatorCredit,
  cta = PLAN_CTA,
  captions,
  fullBleed = false,
  frame,
  fps,
  children,
}) => {
  const eyebrowIn = spring({ frame, fps, config: ENTRANCE });
  const titleIn = spring({ frame: frame - 8, fps, config: ENTRANCE });
  const footerIn = spring({ frame: frame - 16, fps, config: ENTRANCE });

  return (
    <AbsoluteFill style={{ backgroundColor: colors.primary[900], fontFamily: fontFamilies.body }}>
      {/* Media — full-bleed for vertical sources, else the centered 16:9 band. */}
      {fullBleed ? (
        <>
          <AbsoluteFill style={{ overflow: "hidden" }}>{children}</AbsoluteFill>
          {/* Scrims keep the masthead + footer text legible over the footage. */}
          <div
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              right: 0,
              height: 480,
              background:
                "linear-gradient(to bottom, rgba(15,45,53,0.92) 0%, rgba(15,45,53,0.65) 45%, rgba(15,45,53,0) 100%)",
            }}
          />
          <div
            style={{
              position: "absolute",
              bottom: 0,
              left: 0,
              right: 0,
              height: 1080,
              background:
                "linear-gradient(to top, rgba(15,45,53,0.95) 0%, rgba(15,45,53,0.7) 38%, rgba(15,45,53,0) 100%)",
            }}
          />
        </>
      ) : (
        <div style={{ position: "absolute", top: MEDIA_TOP, left: 0, width: MEDIA_W, height: MEDIA_H, overflow: "hidden" }}>
          {children}
        </div>
      )}

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

      {/* Captions — active transcript phrase over the lower media */}
      {captions && captions.length > 0 ? (
        <div style={{ position: "absolute", top: CAPTION_TOP, left: 40, right: 40, display: "flex", justifyContent: "center" }}>
          <Captions cues={captions} />
        </div>
      ) : null}

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
