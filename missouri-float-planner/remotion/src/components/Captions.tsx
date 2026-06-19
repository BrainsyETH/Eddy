import React from "react";
import { useCurrentFrame, useVideoConfig } from "remotion";
import { fontFamilies } from "../design-tokens/fonts";
import type { Caption } from "../lib/social-props";

/**
 * Active transcript phrase for the current frame, as a single centered line.
 * Geist with a heavy shadow so it stays readable over bright water footage on
 * muted autoplay feeds. The caller positions it (ReelBrandFrame places it just
 * above the footer). Replaces the ffmpeg drawtext captions finalize-reel burned.
 */
export const Captions: React.FC<{ cues: Caption[] }> = ({ cues }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = frame / fps;
  const active = cues.find((c) => t >= c.start && t < c.end);
  if (!active) return null;

  return (
    <span
      style={{
        fontFamily: fontFamilies.body,
        fontSize: 38,
        fontWeight: 700,
        color: "#fff",
        textAlign: "center",
        lineHeight: 1.2,
        maxWidth: 1000,
        textShadow: "0 2px 10px rgba(0,0,0,0.95), 0 0 4px rgba(0,0,0,0.9)",
      }}
    >
      {active.text}
    </span>
  );
};
