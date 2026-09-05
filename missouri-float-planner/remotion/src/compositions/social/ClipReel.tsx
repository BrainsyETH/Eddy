import React from "react";
import { OffthreadVideo } from "remotion";
import { ReelBrandFrame } from "../../components/ReelBrandFrame";
import {
  HIGH_WATER_LABEL,
  NEUTRAL_ACCENT,
  OZARK_PADDLING_LABEL,
  SAFETY_DETAIL,
  WARNING_ACCENT,
} from "../../lib/brand";
import { LABELS } from "../../../../shared/social-brand";
import type { ClipReelProps } from "../../lib/social-props";

/**
 * ClipReel — wraps a downloaded YouTube clip in the shared Eddy brand frame so
 * its branding matches the rest of the render pipeline (RouteDraw, Digest,
 * Trend, Eddy Says): the series-label masthead, the ruled media card, the dock
 * with creator/safety context, and timed transcript captions over the footage.
 * A clip has no live gauge reading, so the frame uses the neutral brand accent.
 * Ordinary clips use the light editorial surface: the video replaces the
 * route/chart/illustration stage inside a ruled card. High-water clips alone
 * use the dark severity surface, where vertical sources may fill the frame and
 * landscape sources sit over a dimmed copy of themselves.
 */
export const ClipReel: React.FC<ClipReelProps> = ({
  videoUrl,
  riverName,
  creatorCredit,
  captions,
  sourceOrientation,
  category,
}) => {
  // Tier 2: a clip with no known Eddy river (e.g. out-of-Missouri paddling)
  // still renders the same frame, but with a generic hero label instead of a
  // river name. The visual does not draw a fake button: Reels are not
  // interactive canvases, and the real destination belongs in the caption.
  const hasRiver = !!(riverName && riverName.trim());

  // High-water safety PSA: the alarm look (orange "HIGH WATER" pill, warning
  // rule on the cards) with the safety payload in the dock. The
  // hero title falls back to a neutral, universal line (not "Ozark Paddling")
  // because flood clips are often out-of-region.
  const isHighWater = category === "high_water";
  const label = isHighWater ? LABELS.highWater : LABELS.clip;
  const title = hasRiver
    ? prettifyRiverName(riverName)
    : isHighWater
      ? HIGH_WATER_LABEL
      : OZARK_PADDLING_LABEL;
  const accent = isHighWater ? WARNING_ACCENT : NEUTRAL_ACCENT;

  return (
    <ReelBrandFrame
      label={label}
      labelFill={isHighWater ? WARNING_ACCENT : undefined}
      title={title}
      detail={isHighWater ? SAFETY_DETAIL : undefined}
      accent={accent}
      tone={isHighWater ? "dark" : "light"}
      creatorCredit={creatorCredit}
      captions={captions}
      fullBleed={sourceOrientation === "portrait"}
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
      {/* No fade-in: frame 0 is the thumbnail, and a thumbnail of an empty
          card is the black-first-frame problem the cover exists to solve. */}
      <OffthreadVideo src={videoUrl} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
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
