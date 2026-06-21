import React from "react";
import { OffthreadVideo, useCurrentFrame, useVideoConfig, interpolate } from "remotion";
import { ReelBrandFrame } from "../../components/ReelBrandFrame";
import { GENERIC_CTA, OZARK_PADDLING_LABEL, PLAN_CTA } from "../../lib/brand";
import type { ClipReelProps } from "../../lib/social-props";

/**
 * ClipReel — wraps a downloaded YouTube clip in the shared Eddy brand frame so
 * its branding matches the rest of the render pipeline (RouteDraw, SectionGuide,
 * …): mascot masthead, white river name, persistent watermark, canonical CTA,
 * and timed transcript captions over the footage. A clip has no live gauge
 * reading, so the frame uses the neutral brand accent. Vertical sources fill the
 * frame (full-bleed); landscape sources play as a centered 16:9 band over a
 * blurred full-bleed copy of themselves, so they fill the frame instead of
 * sitting in a dead teal void.
 */
export const ClipReel: React.FC<ClipReelProps> = ({
  videoUrl,
  riverName,
  creatorCredit,
  captions,
  sourceOrientation,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const videoFade = interpolate(frame, [0, 10], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // Tier 2: a clip with no known Eddy river (e.g. out-of-Missouri paddling)
  // still renders the same frame, but with a generic hero label + softer CTA
  // instead of a river name + "plan this float" page promise.
  const hasRiver = !!(riverName && riverName.trim());

  return (
    <ReelBrandFrame
      eyebrow="On the Water"
      title={hasRiver ? prettifyRiverName(riverName) : OZARK_PADDLING_LABEL}
      cta={hasRiver ? PLAN_CTA : GENERIC_CTA}
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
