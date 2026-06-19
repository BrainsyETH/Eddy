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

// Vertical geometry. Two layouts share this frame:
//
//  • BAND (landscape sources): the footage is a centered 16:9 band. Earlier this
//    pinned the masthead to the top and the band+footer into the top ~55% of the
//    1080×1920 canvas, leaving the bottom ~46% as a dead teal void (the content
//    read as shoved up and off-center). The band is now CENTERED in the frame
//    with the masthead bracketing it above and the credit/CTA below, so the
//    composition is balanced and the masthead clears the Reels top chrome while
//    the footer clears the bottom caption/handle row.
//
//  • FULL-BLEED (vertical sources): the footage fills the frame behind scrims, so
//    there's no void — the masthead sits high and the footer low over the
//    scrims, framing the footage. That layout already reads well, so it keeps the
//    original positions.
const MASCOT_SIZE = 150;
const MEDIA_W = 1080;
const MEDIA_H = 608; // 16:9 at full canvas width (landscape sources)

// Full-bleed (vertical source) positions — masthead high / footer low over the
// full-frame footage + scrims.
const FB_MASTHEAD_TOP = 96;
const FB_CAPTION_TOP = 928;
const FB_FOOTER_TOP = 1040;

// Band (landscape source) positions — content centered in the frame so there's
// no lopsided bottom void. Band centered at ~y=992; masthead above, footer below.
const BAND_MASTHEAD_TOP = 300;
const BAND_MEDIA_TOP = 688; // 688→1296, centered in the 1920 canvas
const BAND_CAPTION_TOP = 1180; // over the lower band, above the footer
const BAND_FOOTER_TOP = 1320; // below the band, clear of the bottom handle/caption

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

  // Center the content for the landscape band; keep the high/low framing for
  // full-bleed (vertical) sources, which fill the frame.
  const mastheadTop = fullBleed ? FB_MASTHEAD_TOP : BAND_MASTHEAD_TOP;
  const captionTop = fullBleed ? FB_CAPTION_TOP : BAND_CAPTION_TOP;
  const footerTop = fullBleed ? FB_FOOTER_TOP : BAND_FOOTER_TOP;

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
        <div style={{ position: "absolute", top: BAND_MEDIA_TOP, left: 0, width: MEDIA_W, height: MEDIA_H, overflow: "hidden" }}>
          {children}
        </div>
      )}

      {/* Masthead — mascot + eyebrow + river name */}
      <div
        style={{
          position: "absolute",
          top: mastheadTop,
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
        <div style={{ position: "absolute", top: captionTop, left: 40, right: 40, display: "flex", justifyContent: "center" }}>
          <Captions cues={captions} />
        </div>
      ) : null}

      {/* Footer — credit + CTA, comfortably above the Reels bottom UI zone */}
      <div
        style={{
          position: "absolute",
          top: footerTop,
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
