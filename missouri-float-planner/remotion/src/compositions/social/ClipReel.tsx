import React from "react";
import { OffthreadVideo, useCurrentFrame, useVideoConfig, interpolate } from "remotion";
import { ReelBrandFrame } from "../../components/ReelBrandFrame";
import type { ClipReelProps } from "../../lib/social-props";

/**
 * ClipReel — wraps a downloaded YouTube clip in the shared Eddy brand frame so
 * its branding matches the rest of the render pipeline (RouteDraw, SectionGuide,
 * …): mascot masthead, white river name, persistent watermark, canonical CTA.
 * A clip has no live gauge reading, so the frame uses the neutral brand accent.
 */
export const ClipReel: React.FC<ClipReelProps> = ({ videoUrl, riverName, creatorCredit }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const videoFade = interpolate(frame, [0, 10], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return (
    <ReelBrandFrame
      eyebrow="On the Water"
      title={riverName}
      creatorCredit={creatorCredit}
      frame={frame}
      fps={fps}
    >
      <OffthreadVideo
        src={videoUrl}
        style={{ width: "100%", height: "100%", objectFit: "cover", opacity: videoFade }}
      />
    </ReelBrandFrame>
  );
};

/** Composition duration in frames for a clip of the given length. */
export function getClipReelDuration(durationSecs: number, fps: number): number {
  return Math.max(1, Math.round((durationSecs || 13) * fps));
}
