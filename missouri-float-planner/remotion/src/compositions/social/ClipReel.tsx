import React from "react";
import { OffthreadVideo, useCurrentFrame, useVideoConfig, interpolate } from "remotion";
import { ReelBrandFrame } from "../../components/ReelBrandFrame";
import {
  DOWNLOAD_CTA,
  HIGH_WATER_LABEL,
  NEUTRAL_ACCENT,
  OZARK_PADDLING_LABEL,
  SAFETY_CTA,
  SAFETY_DETAIL,
  WARNING_ACCENT,
} from "../../lib/brand";
import { LABELS } from "../../../../shared/social-brand";
import type { ClipReelProps } from "../../lib/social-props";

/**
 * ClipReel — wraps a downloaded YouTube clip in the shared Eddy brand frame so
 * its branding matches the rest of the render pipeline (RouteDraw, Digest,
 * Trend, Eddy Says): the series-label masthead, the ruled media card, the dock
 * with the canonical CTA, and timed transcript captions over the footage. A clip
 * has no live gauge reading, so the frame uses the neutral brand accent.
 * Vertical sources fill the frame (full-bleed); landscape sources play as a
 * centered 16:9 card over a blurred full-bleed copy of themselves, so they fill
 * the frame instead of sitting in a dead teal void.
 */
export const ClipReel: React.FC<ClipReelProps> = ({
  videoUrl,
  riverName,
  creatorCredit,
  captions,
  sourceOrientation,
  category,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const videoFade = interpolate(frame, [0, 10], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // Tier 2: a clip with no known Eddy river (e.g. out-of-Missouri paddling)
  // still renders the same frame, but with a generic hero label instead of a
  // river name. Both tiers share the download button: a reposted clip has no
  // float page of its own to promise, so it sells the app.
  const hasRiver = !!(riverName && riverName.trim());

  // High-water safety PSA: the alarm look (orange "HIGH WATER" pill, warning
  // rule on the cards) and a button pointing straight at the live gauge — the
  // whole reason the footage is scary — with the safety payload beside it. The
  // hero title falls back to a neutral, universal line (not "Ozark Paddling")
  // because flood clips are often out-of-region.
  const isHighWater = category === "high_water";
  const label = isHighWater ? LABELS.highWater : LABELS.clip;
  const title = hasRiver
    ? prettifyRiverName(riverName)
    : isHighWater
      ? HIGH_WATER_LABEL
      : OZARK_PADDLING_LABEL;
  const cta = isHighWater ? SAFETY_CTA : DOWNLOAD_CTA;
  const accent = isHighWater ? WARNING_ACCENT : NEUTRAL_ACCENT;

  return (
    <ReelBrandFrame
      label={label}
      labelFill={isHighWater ? WARNING_ACCENT : undefined}
      title={title}
      cta={cta}
      detail={isHighWater ? SAFETY_DETAIL : undefined}
      accent={accent}
      creatorCredit={creatorCredit}
      captions={captions}
      fullBleed={sourceOrientation === "portrait"}
      frame={frame}
      fps={fps}
      backdrop={
        sourceOrientation === "portrait" ? undefined : (
          <OffthreadVideo
            src={videoUrl}
            muted
            style={{ width: "100%", height: "100%", objectFit: "cover" }}
          />
        )
      }
    >
      <OffthreadVideo
        src={videoUrl}
        style={{ width: "100%", height: "100%", objectFit: "cover", opacity: videoFade }}
      />
    </ReelBrandFrame>
  );
};

/**
 * River names reach the clip from the YouTube pipeline, which can pass a raw
 * slug ("jacks-fork") when its display-name lookup falls back. Prettify so the
 * on-screen title never shows a slug: "jacks-fork" -> "Jacks Fork". Already-clean
 * names ("Jacks Fork River", "Huzzah Creek") pass through unchanged.
 */
export function prettifyRiverName(name: string): string {
  return (name || "")
    .trim()
    .replace(/[-_]+/g, " ")
    .replace(/\s+/g, " ")
    .split(" ")
    .map((w) => (w ? w[0].toUpperCase() + w.slice(1) : w))
    .join(" ");
}

/** Composition duration in frames for a clip of the given length. */
export function getClipReelDuration(durationSecs: number, fps: number): number {
  return Math.max(1, Math.round((durationSecs || 13) * fps));
}
