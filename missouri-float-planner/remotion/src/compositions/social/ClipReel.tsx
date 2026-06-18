import React from "react";
import {
  AbsoluteFill,
  OffthreadVideo,
  useCurrentFrame,
  interpolate,
} from "remotion";
import { EddyMascot } from "../../components/EddyMascot";
import { colors } from "../../design-tokens/colors";
import type { ClipReelProps } from "../../lib/social-props";

const FONT = "'Fredoka', system-ui, sans-serif";

/**
 * ClipReel — wraps a downloaded YouTube clip in the Eddy branded frame:
 * otter + wordmark + river name on top, the source clip in a centered band,
 * a CTA and creator credit on the bottom. 1080x1920, duration = clip length.
 */
export const ClipReel: React.FC<ClipReelProps> = ({
  videoUrl,
  riverName,
  creatorCredit,
}) => {
  const frame = useCurrentFrame();
  const videoFade = interpolate(frame, [0, 10], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return (
    <AbsoluteFill style={{ backgroundColor: colors.primary[900], fontFamily: FONT }}>
      {/* Top brand band: otter + wordmark + river name */}
      <div
        style={{
          position: "absolute",
          top: 48,
          left: 0,
          right: 0,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
        }}
      >
        <EddyMascot variant="canoe" size={180} />
        <div style={{ color: "#fff", fontSize: 46, fontWeight: 600, marginTop: 4, letterSpacing: 0.5 }}>
          eddy.guide
        </div>
        <div
          style={{
            color: colors.secondary[300],
            fontSize: 58,
            fontWeight: 600,
            marginTop: 28,
            textAlign: "center",
            padding: "0 48px",
            lineHeight: 1.1,
          }}
        >
          {riverName}
        </div>
      </div>

      {/* Source clip band — 1080x608 (16:9) centered at y=746 */}
      <div style={{ position: "absolute", top: 746, left: 0, width: 1080, height: 608, overflow: "hidden", opacity: videoFade }}>
        <OffthreadVideo src={videoUrl} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
      </div>

      {/* Bottom brand band: CTA + creator credit */}
      <div
        style={{
          position: "absolute",
          bottom: 150,
          left: 0,
          right: 0,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 22,
        }}
      >
        <div
          style={{
            backgroundColor: colors.accent[500],
            color: "#fff",
            fontSize: 40,
            fontWeight: 600,
            padding: "16px 34px",
            borderRadius: 999,
          }}
        >
          Plan your float trip at eddy.guide
        </div>
        {creatorCredit ? (
          <div style={{ color: colors.secondary[400], fontSize: 30 }}>🎥 Clip via {creatorCredit}</div>
        ) : null}
      </div>
    </AbsoluteFill>
  );
};

/** Composition duration in frames for a clip of the given length. */
export function getClipReelDuration(durationSecs: number, fps: number): number {
  return Math.max(1, Math.round((durationSecs || 13) * fps));
}
