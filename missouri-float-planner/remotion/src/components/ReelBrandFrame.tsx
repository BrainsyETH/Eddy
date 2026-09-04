import React from "react";
import { AbsoluteFill, spring } from "remotion";
import { EddyMascot } from "./EddyMascot";
import { ReelMasthead } from "./ReelMasthead";
import { ReelDock } from "./ReelDock";
import { Captions } from "./Captions";
import { ENTRANCE } from "../lib/spring-presets";
import { REEL_SAFE } from "../lib/reel-safe";
import { NEUTRAL_ACCENT, PLAN_CTA } from "../lib/brand";
import { fontFamilies } from "../design-tokens/fonts";
import { CARD, MEDIA_SCRIM, SURFACES, colors } from "../../../shared/social-brand";
import type { Caption } from "../lib/social-props";

// Vertical geometry. Two layouts share this frame:
//
//  • BAND (landscape sources): the sharp 16:9 clip sits as a ruled, shadowed
//    card over a BLURRED, scaled, dimmed full-bleed copy of itself, so the
//    frame is full and immersive instead of a flat teal void. Scrims top +
//    bottom seat the masthead and dock inside the Reels safe zone.
//
//  • FULL-BLEED (vertical sources): the footage fills the frame behind the
//    scrims; the masthead sits high and the dock low over them.
//
// Either way this is the design system's OVER-MEDIA use of the dark tone: the
// ground is the footage + scrim, never the off-white, and the chrome (pill,
// wordmark, dock, button) is the same chrome every other reel draws.
const BAND_W = 1080 - REEL_SAFE.left - REEL_SAFE.right;
const BAND_H = Math.round((BAND_W * 9) / 16);
// Centred between the masthead's foot (~430) and the dock's top (~1290).
const BAND_TOP = 590;
const BAND_CAPTION_TOP = BAND_TOP + BAND_H - 90;
const FB_CAPTION_TOP = 1180;

interface ReelBrandFrameProps {
  /** Series label in the masthead pill ("On the Water", "High Water"). */
  label: string;
  /** Hero line — usually the river name. */
  title: string;
  /** Optional attribution in the dock (a channel name or "@handle"). */
  creatorCredit?: string;
  /** Button copy; defaults to the canonical PLAN_CTA. */
  cta?: string;
  /** Dock detail line (the safety payload on a high-water clip). */
  detail?: string;
  /** Category accent: the dock's rule and the media card's rule. Defaults to
   *  the neutral water teal (a clip has no live gauge reading). */
  accent?: string;
  /** Pill fill override (the warning orange on a high-water clip). */
  labelFill?: string;
  /** Timed transcript captions drawn over the lower media (optional). */
  captions?: Caption[];
  /** Full-bleed media instead of the centered 16:9 card — for VERTICAL sources. */
  fullBleed?: boolean;
  /** Full-bleed blurred copy of the media (e.g. a muted OffthreadVideo) drawn
   *  behind the media card. Ignored for `fullBleed` sources. */
  backdrop?: React.ReactNode;
  /** Current frame + fps, for staggered entrances. */
  frame: number;
  fps: number;
  /** The media itself (e.g. an OffthreadVideo); the frame positions it. */
  children: React.ReactNode;
}

/**
 * Eddy brand chrome for a media reel — the shared masthead, media card, dock
 * and CTA over footage — so a wrapped clip reads as part of the same system as
 * the Float Pick, Digest, Trend and Eddy Says reels.
 */
export const ReelBrandFrame: React.FC<ReelBrandFrameProps> = ({
  label,
  title,
  creatorCredit,
  cta = PLAN_CTA,
  detail,
  accent = NEUTRAL_ACCENT,
  labelFill,
  captions,
  fullBleed = false,
  backdrop,
  frame,
  fps,
  children,
}) => {
  const titleIn = spring({ frame: frame - 6, fps, config: ENTRANCE });
  const dockIn = spring({ frame: frame - 16, fps, config: ENTRANCE });
  const dark = SURFACES.dark;

  return (
    <AbsoluteFill style={{ backgroundColor: dark.ground, color: dark.ink, fontFamily: fontFamilies.body }}>
      {fullBleed ? (
        <AbsoluteFill style={{ overflow: "hidden" }}>{children}</AbsoluteFill>
      ) : backdrop ? (
        // Blurred, scaled, dimmed full-bleed copy of the footage so the
        // landscape clip fills the frame instead of a dead teal void.
        <AbsoluteFill style={{ overflow: "hidden" }}>
          <AbsoluteFill style={{ transform: "scale(1.18)", filter: "blur(44px) brightness(0.5) saturate(1.15)" }}>
            {backdrop}
          </AbsoluteFill>
        </AbsoluteFill>
      ) : null}

      {/* Scrims seat the masthead + dock legibly on the footage. */}
      <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: fullBleed ? 560 : 640, background: MEDIA_SCRIM.top }} />
      <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, height: fullBleed ? 1000 : 780, background: MEDIA_SCRIM.bottom }} />

      {!fullBleed ? (
        // Sharp landscape clip — a ruled, shadowed card, like every other panel.
        <div
          style={{
            position: "absolute",
            top: BAND_TOP,
            left: REEL_SAFE.left,
            width: BAND_W,
            height: BAND_H,
            overflow: "hidden",
            border: `${CARD.border}px solid ${accent}`,
            borderRadius: CARD.radius,
            boxShadow: `${CARD.offset}px ${CARD.offset}px 0 ${dark.shadow}`,
            background: colors.primary[900],
          }}
        >
          {children}
        </div>
      ) : null}

      <ReelMasthead
        pinned
        tone="dark"
        label={label}
        labelFill={labelFill}
        title={title}
        titleOpacity={titleIn}
        overMedia
        aside={<EddyMascot variant="canoe" size={96} delay={-30} float={false} />}
      />

      {captions && captions.length > 0 ? (
        <div
          style={{
            position: "absolute",
            top: fullBleed ? FB_CAPTION_TOP : BAND_CAPTION_TOP,
            left: REEL_SAFE.left + 24,
            right: REEL_SAFE.right + 24,
            display: "flex",
            justifyContent: "center",
            zIndex: 12,
          }}
        >
          <Captions cues={captions} />
        </div>
      ) : null}

      <ReelDock tone="dark" accent={accent} detail={detail} cta={cta} ctaProgress={dockIn}>
        {creatorCredit ? (
          <div style={{ fontSize: 22, fontWeight: 600, color: dark.inkSecondary, padding: "0 5px" }}>🎥 Clip via {creatorCredit}</div>
        ) : null}
      </ReelDock>
    </AbsoluteFill>
  );
};
