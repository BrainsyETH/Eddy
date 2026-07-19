import React from "react";
import { OffthreadVideo, useCurrentFrame, useVideoConfig, interpolate } from "remotion";
import { ReelBrandFrame } from "../../components/ReelBrandFrame";
import {
  GENERIC_CTA,
  HIGH_WATER_LABEL,
  OZARK_PADDLING_LABEL,
  PLAN_CTA,
  SAFETY_CTA,
  WARNING_ACCENT,
  WARNING_GLOW,
} from "../../lib/brand";
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
  category,
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

  // High-water safety PSA: a distinct alarm look (orange "HIGH WATER" eyebrow +
  // warning accent) and a CTA pointing straight at the live gauge — the whole
  // reason the footage is scary. The hero title falls back to a neutral,
  // universal line (not "Ozark Paddling") because flood clips are often
  // out-of-region. Any other/absent category keeps the default paddling look.
  const isHighWater = category === "high_water";
  const eyebrow = isHighWater ? "HIGH WATER" : "On the Water";
  const title = hasRiver
    ? prettifyRiverName(riverName)
    : isHighWater
      ? HIGH_WATER_LABEL
      : OZARK_PADDLING_LABEL;
  const cta = isHighWater ? SAFETY_CTA : hasRiver ? PLAN_CTA : GENERIC_CTA;
  const accent = isHighWater
    ? { eyebrow: WARNING_ACCENT, cta: WARNING_ACCENT, glow: WARNING_GLOW }
    : undefined;

  return (
    <ReelBrandFrame
      eyebrow={eyebrow}
      title={title}
      cta={cta}
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
