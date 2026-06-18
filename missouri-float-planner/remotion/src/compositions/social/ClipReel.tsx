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

// Reels UI (caption, username, audio, right-side action rail) covers roughly the
// bottom ~35% and right ~15% on both Instagram and Facebook. All messaging and
// branding is kept above y≈1240 and horizontally centered/narrow so it stays
// visible across every Reel surface. The bottom teal band is intentionally clear
// (the platform UI fills it).
const SAFE_BOTTOM_Y = 1240;

/**
 * ClipReel — wraps a downloaded YouTube clip in the Eddy branded frame, laid out
 * to keep all text/logos inside the Reels title-safe area.
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
      {/* Top brand cluster — well clear of the top edge */}
      <div
        style={{
          position: "absolute",
          top: 96,
          left: 0,
          right: 0,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
        }}
      >
        <EddyMascot variant="canoe" size={150} />
        <div style={{ color: "#fff", fontSize: 46, fontWeight: 600, marginTop: 2, letterSpacing: 0.5 }}>
          eddy.guide
        </div>
        <div
          style={{
            color: colors.secondary[300],
            fontSize: 58,
            fontWeight: 600,
            marginTop: 22,
            textAlign: "center",
            padding: "0 120px",
            lineHeight: 1.05,
          }}
        >
          {riverName}
        </div>
      </div>

      {/* Source clip band — 16:9 at full width, raised so messaging clears the UI */}
      <div style={{ position: "absolute", top: 410, left: 0, width: 1080, height: 608, overflow: "hidden", opacity: videoFade }}>
        <OffthreadVideo src={videoUrl} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
      </div>

      {/* Messaging — directly below the clip, comfortably ABOVE the Reels bottom UI zone */}
      <div
        style={{
          position: "absolute",
          top: 1040,
          left: 0,
          right: 0,
          maxHeight: SAFE_BOTTOM_Y - 1040,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 16,
        }}
      >
        {creatorCredit ? (
          <div style={{ color: colors.secondary[400], fontSize: 28 }}>🎥 Clip via {creatorCredit}</div>
        ) : null}
        <div
          style={{
            backgroundColor: colors.accent[500],
            color: "#fff",
            fontSize: 36,
            fontWeight: 600,
            padding: "14px 30px",
            borderRadius: 999,
            maxWidth: 820,
            textAlign: "center",
          }}
        >
          Plan your float trip at eddy.guide
        </div>
      </div>
    </AbsoluteFill>
  );
};

/** Composition duration in frames for a clip of the given length. */
export function getClipReelDuration(durationSecs: number, fps: number): number {
  return Math.max(1, Math.round((durationSecs || 13) * fps));
}
