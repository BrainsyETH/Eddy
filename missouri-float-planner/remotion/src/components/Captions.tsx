import React from "react";
import { useCurrentFrame, useVideoConfig } from "remotion";
import { fontFamilies } from "../design-tokens/fonts";
import { subtitleStyle, SURFACES, TYPE } from "../../../shared/social-brand";
import type { Caption } from "../lib/social-props";

/**
 * Active transcript phrase for the current frame, as a centered subtitle.
 * Subtitles are not a panel of the reel: they sit on the footage between the
 * masthead and the dock and must read as captions, not as a third card. So the
 * design system gives them a quiet wash under the words (subtitleStyle) and a
 * subtitle-sized body step — no rule, no offset shadow, no glow. The caller
 * positions it (ReelBrandFrame places it just above the media's lower edge).
 * Replaces the ffmpeg drawtext captions finalize-reel burned.
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
        ...subtitleStyle(),
        display: "inline-block",
        padding: "6px 16px",
        maxWidth: 820,
        fontFamily: fontFamilies.body,
        fontSize: TYPE.subtitle_media.size,
        fontWeight: TYPE.subtitle_media.weight,
        lineHeight: TYPE.subtitle_media.lineHeight,
        color: SURFACES.dark.ink,
        textAlign: "center",
      }}
    >
      {active.text}
    </span>
  );
};
