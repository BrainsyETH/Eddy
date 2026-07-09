import React from "react";
import { Easing } from "remotion";
import {
  TransitionSeries,
  linearTiming,
  springTiming,
  type TransitionPresentation,
} from "@remotion/transitions";
import { slide } from "@remotion/transitions/slide";
import { fade } from "@remotion/transitions/fade";
import { MONTAGE_TRANSITION_FRAMES } from "./voiceover";

/**
 * A single montage beat: its full length in frames and the scene to render.
 * `content` may include the beat's own <Audio> — during the brief transition
 * overlap both adjacent beats are mounted, but each beat's narration has already
 * ended inside its animation padding, so the two never talk over each other.
 */
export interface MontageScene {
  durationInFrames: number;
  content: React.ReactNode;
}

/**
 * Default look: a steady left-to-right push through the feature beats, then a
 * soft dissolve into the final beat (the CTA) so the montage settles instead of
 * flinging the call-to-action on screen. Callers can override per index.
 */
export function defaultPresentation(index: number, count: number): TransitionPresentation<Record<string, unknown>> {
  const isLast = index === count - 1;
  return isLast ? fade() : slide({ direction: "from-right" });
}

interface MontageProps {
  scenes: MontageScene[];
  /** Overlap length of each transition. Shorter = punchier, longer = softer. */
  transitionFrames?: number;
  /** Presentation per transition (index is the incoming beat, 1..n-1). */
  presentationForIndex?: (index: number, count: number) => TransitionPresentation<Record<string, unknown>>;
  /**
   * Spring the transitions (momentum) instead of eased-linear. Both consume
   * exactly `transitionFrames`, so the montage duration math is unchanged.
   */
  spring?: boolean;
}

/**
 * Stitches feature beats into one continuous montage: adjacent beats overlap by
 * `transitionFrames` and blend (slide/fade) instead of hard-cutting, so the reel
 * reads as a single moving piece rather than five separate slides.
 *
 * Duration note: N beats with N-1 transitions run for
 *   sum(beat durations) - (N-1) * transitionFrames
 * frames, because every transition overlaps the two beats it joins. Register the
 * composition with the matching *MontageFrames helper in voiceover.ts or the
 * timeline will end early / leave a blank tail.
 */
export const Montage: React.FC<MontageProps> = ({
  scenes,
  transitionFrames = MONTAGE_TRANSITION_FRAMES,
  presentationForIndex = defaultPresentation,
  spring = false,
}) => {
  const timing = spring
    ? springTiming({ config: { damping: 200 }, durationInFrames: transitionFrames })
    : linearTiming({ durationInFrames: transitionFrames, easing: Easing.inOut(Easing.cubic) });

  const children: React.ReactNode[] = [];
  scenes.forEach((scene, i) => {
    if (i > 0) {
      children.push(
        <TransitionSeries.Transition
          key={`transition-${i}`}
          timing={timing}
          presentation={presentationForIndex(i, scenes.length)}
        />
      );
    }
    children.push(
      <TransitionSeries.Sequence key={`beat-${i}`} durationInFrames={scene.durationInFrames}>
        {scene.content}
      </TransitionSeries.Sequence>
    );
  });

  return <TransitionSeries>{children}</TransitionSeries>;
};

/** Frames a montage of the given beat lengths actually occupies (with overlaps). */
export function montageFrames(beatFrames: number[], transitionFrames: number = MONTAGE_TRANSITION_FRAMES): number {
  const total = beatFrames.reduce((sum, f) => sum + f, 0);
  const overlaps = Math.max(0, beatFrames.length - 1) * transitionFrames;
  return Math.max(1, total - overlaps);
}
