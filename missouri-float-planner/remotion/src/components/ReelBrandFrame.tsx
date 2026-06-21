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
//  • BAND (landscape sources): the sharp 16:9 clip is centered over a BLURRED,
//    scaled, dimmed full-bleed copy of itself, so the frame is full and
//    immersive instead of a flat teal void. Legibility scrims top + bottom seat
//    the masthead and credit/CTA inside the Reels safe zone — clear of the top
//    chrome, the bottom caption/handle row, and the 4:5 feed crop line.
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

// Band (landscape source) positions — the sharp 16:9 clip is centered over a
// blurred full-bleed copy of itself, with masthead above and credit/CTA below,
// all seated inside the Reels safe zone (top ~250, bottom ~420 of 1920).
const BAND_MASTHEAD_TOP = 312; // below the top chrome + the 4:5 feed crop line
const BAND_MEDIA_TOP = 656; // 656→1264, the 608-tall band centered in 1920
const BAND_CAPTION_TOP = 1150; // over the lower band, above the footer
const BAND_FOOTER_TOP = 1360; // below the band, clear of the bottom caption/UI

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
  /**
   * Full-bleed blurred copy of the media (e.g. a muted OffthreadVideo) drawn
   * behind the centered landscape band so the frame fills instead of showing a
   * dead teal void. Ignored for `fullBleed` sources (they fill the frame
   * directly); omit it to fall back to a flat-teal band.
   */
  backdrop?: React.ReactNode;
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
  backdrop,
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
        <>
          {backdrop ? (
            <>
              {/* Blurred, scaled, dimmed full-bleed copy of the footage so the
                  landscape clip fills the frame instead of a dead teal void. */}
              <AbsoluteFill style={{ overflow: "hidden" }}>
                <AbsoluteFill
                  style={{ transform: "scale(1.18)", filter: "blur(44px) brightness(0.5) saturate(1.15)" }}
                >
                  {backdrop}
                </AbsoluteFill>
              </AbsoluteFill>
              {/* Scrims seat the masthead + footer legibly in the safe zone. */}
              <div
                style={{
                  position: "absolute",
                  top: 0,
                  left: 0,
                  right: 0,
                  height: 600,
                  background:
                    "linear-gradient(to bottom, rgba(15,45,53,0.92) 0%, rgba(15,45,53,0.5) 55%, rgba(15,45,53,0) 100%)",
                }}
              />
              <div
                style={{
                  position: "absolute",
                  bottom: 0,
                  left: 0,
                  right: 0,
                  height: 760,
                  background:
                    "linear-gradient(to top, rgba(15,45,53,0.94) 0%, rgba(15,45,53,0.5) 52%, rgba(15,45,53,0) 100%)",
                }}
              />
            </>
          ) : null}
          {/* Sharp landscape clip — a clean 16:9 band centered over the backdrop. */}
          <div
            style={{
              position: "absolute",
              top: BAND_MEDIA_TOP,
              left: 0,
              width: MEDIA_W,
              height: MEDIA_H,
              overflow: "hidden",
              boxShadow: "0 0 70px rgba(0,0,0,0.55)",
            }}
          >
            {children}
          </div>
        </>
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
