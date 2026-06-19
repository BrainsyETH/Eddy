import React from "react";
import { useCurrentFrame, useVideoConfig } from "remotion";
import { fontFamilies } from "../design-tokens/fonts";
import type { Caption } from "../lib/social-props";

/**
 * Timed transcript captions rendered over the clip — the active phrase for the
 * current frame, centered near the bottom of the media it's placed in. Geist for
 * legibility, with a heavy shadow so it stays readable over bright water footage
 * on muted autoplay feeds. Replaces the ffmpeg drawtext captions the old
 * finalize-reel path burned in.
 */
export const Captions: React.FC<{ cues: Caption[] }> = ({ cues }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = frame / fps;
  const active = cues.find((c) => t >= c.start && t < c.end);
  if (!active) return null;

  return (
    <div
      style={{
        position: "absolute",
        left: 40,
        right: 40,
        bottom: 28,
        display: "flex",
        justifyContent: "center",
      }}
    >
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
    </div>
  );
};
