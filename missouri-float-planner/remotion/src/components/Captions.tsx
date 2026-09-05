import React from "react";
import { useCurrentFrame, useVideoConfig } from "remotion";
import { fontFamilies } from "../design-tokens/fonts";
import { captionChipStyle, SURFACES, TYPE } from "../../../shared/social-brand";
import type { Caption } from "../lib/social-props";

/**
 * Active transcript phrase for the current frame, as a single centered chip.
 * Drawn with the social design system's caption chip — the dark tone's tile
 * surface, its rule, a hard offset shadow — so a spoken line over footage is a
 * panel of the same system as the masthead and dock above and below it, not
 * white type in a glow (which the system does not draw). The caller positions
 * it (ReelBrandFrame places it just above the dock). Replaces the ffmpeg
 * drawtext captions finalize-reel burned.
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
        ...captionChipStyle(),
        display: "inline-block",
        padding: "10px 22px",
        maxWidth: 940,
        fontFamily: fontFamilies.body,
        fontSize: TYPE.caption.size,
        fontWeight: TYPE.caption.weight,
        lineHeight: TYPE.caption.lineHeight,
        color: SURFACES.dark.ink,
        textAlign: "center",
      }}
    >
      {active.text}
    </span>
  );
};
