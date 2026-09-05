import React from "react";
import { AbsoluteFill } from "remotion";
import { EddyMascot } from "./EddyMascot";
import { ReelMasthead } from "./ReelMasthead";
import { ReelDock } from "./ReelDock";
import { Captions } from "./Captions";
import { REEL_SAFE } from "../lib/reel-safe";
import { NEUTRAL_ACCENT, PLAN_CTA } from "../lib/brand";
import { fontFamilies } from "../design-tokens/fonts";
import { CARD, MEDIA_SCRIM, SURFACES, TYPE, colors, type SocialTone } from "../../../shared/social-brand";
import type { Caption } from "../lib/social-props";

// Vertical geometry. The default editorial treatment matches Float Pick,
// Eddy Says, Digest and Trend: cream ground, dark ink, a framed media stage and
// a white dock. High-water is the one sanctioned severity treatment and keeps
// the dark over-media layout.
//
//  • LIGHT / LANDSCAPE: a gently cropped, taller card gives the footage the
//    same visual weight as the chart / route stage in the other editorial reels.
//
//  • LIGHT / PORTRAIT: a narrower portrait card preserves more of the source.
//
//  • DARK severity: vertical footage may fill the canvas; landscape footage
//    keeps its 16:9 card over a dimmed copy, as before.
const CONTENT_W = 1080 - REEL_SAFE.left - REEL_SAFE.right;
const DARK_BAND_H = Math.round((CONTENT_W * 9) / 16);
const DARK_BAND_TOP = 590;
const LIGHT_LANDSCAPE = { top: 510, left: REEL_SAFE.left, width: CONTENT_W, height: 680 } as const;
const LIGHT_PORTRAIT = { top: 475, left: 225, width: 630, height: 760 } as const;
const DARK_CAPTION_TOP = DARK_BAND_TOP + DARK_BAND_H - 90;
const DARK_FULL_BLEED_CAPTION_TOP = 1180;

interface ReelBrandFrameProps {
  /** Series label in the masthead pill ("On the Water", "High Water"). */
  label: string;
  /** Hero line — usually the river name. */
  title: string;
  /** Optional attribution in the dock: the creator's Instagram "@handle" when
   *  known, else the YouTube channel name (resolve-credit.py decides). */
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
  /** Light for editorial clips; dark is reserved for severity content. */
  tone?: SocialTone;
  /** Timed transcript captions drawn over the lower media (optional). */
  captions?: Caption[];
  /** Full-bleed media instead of the centered 16:9 card — for VERTICAL sources. */
  fullBleed?: boolean;
  /** Full-bleed blurred copy of the media (e.g. a muted OffthreadVideo) drawn
   *  behind the media card. Ignored for `fullBleed` sources. */
  backdrop?: React.ReactNode;
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
  tone = "light",
  captions,
  fullBleed = false,
  backdrop,
  children,
}) => {
  // No entrances: frame 0 is the grid thumbnail and the first autoplay frame,
  // so the title, the credit and the button are all present from the start —
  // the same "honest frame zero" rule every other reel follows. The footage
  // is the only thing that moves.
  const surface = SURFACES[tone];
  const severity = tone === "dark";
  const useFullBleed = severity && fullBleed;
  const media = severity
    ? { top: DARK_BAND_TOP, left: REEL_SAFE.left, width: CONTENT_W, height: DARK_BAND_H }
    : fullBleed
      ? LIGHT_PORTRAIT
      : LIGHT_LANDSCAPE;
  const mediaAccent = severity ? accent : surface.rule;
  const creditLine = creatorCredit ? `🎥 Clip via ${creatorCredit}` : undefined;

  return (
    <AbsoluteFill style={{ backgroundColor: surface.ground, color: surface.ink, fontFamily: fontFamilies.body }}>
      {useFullBleed ? (
        <AbsoluteFill style={{ overflow: "hidden" }}>{children}</AbsoluteFill>
      ) : severity && backdrop ? (
        // Blurred, scaled, dimmed full-bleed copy of the footage so the
        // landscape clip fills the frame instead of a dead teal void.
        <AbsoluteFill style={{ overflow: "hidden" }}>
          <AbsoluteFill style={{ transform: "scale(1.18)", filter: "blur(44px) brightness(0.5) saturate(1.15)" }}>
            {backdrop}
          </AbsoluteFill>
        </AbsoluteFill>
      ) : null}

      {/* Scrims belong only to the severity/over-media treatment. */}
      {severity ? (
        <>
          <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: fullBleed ? 560 : 640, background: MEDIA_SCRIM.top }} />
          <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, height: fullBleed ? 1000 : 780, background: MEDIA_SCRIM.bottom }} />
        </>
      ) : null}

      {!useFullBleed ? (
        // The video is the editorial reel's central stage: one ruled, shadowed
        // card on the cream canvas, exactly like a chart, route or quote panel.
        <div
          style={{
            position: "absolute",
            top: media.top,
            left: media.left,
            width: media.width,
            height: media.height,
            overflow: "hidden",
            border: `${CARD.border}px solid ${mediaAccent}`,
            borderRadius: CARD.radius,
            boxShadow: `${CARD.offset}px ${CARD.offset}px 0 ${surface.shadow}`,
            background: severity ? colors.primary[900] : surface.surface,
          }}
        >
          {children}
        </div>
      ) : null}

      <ReelMasthead
        pinned
        tone={tone}
        label={label}
        labelFill={labelFill}
        title={title}
        overMedia={severity}
        aside={severity ? <EddyMascot variant="red" size={96} delay={-30} float={false} /> : undefined}
      />

      {captions && captions.length > 0 ? (
        <div
          style={{
            position: "absolute",
            top: severity
              ? fullBleed
                ? DARK_FULL_BLEED_CAPTION_TOP
                : DARK_CAPTION_TOP
              : media.top + media.height - 82,
            left: useFullBleed ? REEL_SAFE.left + 24 : media.left + 24,
            width: useFullBleed ? CONTENT_W - 48 : media.width - 48,
            display: "flex",
            justifyContent: "center",
            zIndex: 12,
          }}
        >
          <Captions cues={captions} />
        </div>
      ) : null}

      {/* The credit IS the dock's detail line — the slot beside the button that
          the other reels use for "0.4 hr faster today" — so the dock stays one
          row: credit left, button right. Only when the category already owns
          the detail line (the high-water safety payload) does the credit move
          to its own row above. An "@handle" credit is the creator's Instagram
          account; the caption tags the same handle. */}
      <ReelDock tone={tone} accent={severity ? accent : undefined} detail={detail ?? creditLine} cta={cta}>
        {detail && creditLine ? (
          <div
            style={{
              fontSize: TYPE.detail.size,
              fontWeight: TYPE.detail.weight,
              color: surface.inkSecondary,
              padding: "0 5px",
            }}
          >
            {creditLine}
          </div>
        ) : null}
      </ReelDock>
    </AbsoluteFill>
  );
};
