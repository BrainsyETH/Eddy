import React from "react";
import { useVideoConfig } from "remotion";
import { Captions } from "../../components/Captions";

/**
 * Spreads a beat's caption phrases across its voiceover, weighted by phrase
 * length so timing roughly tracks speech. Because it reads the beat's own
 * duration, captions stay in sync when a beat is resized to match its narration
 * — no hand-tuned per-caption timestamps to drift.
 */
export const AutoCaptions: React.FC<{
  phrases: string[];
  /** Silent lead-in before the first phrase (s). */
  lead?: number;
  /** Trailing gap after the last phrase, ~= the beat's animation padding (s). */
  tail?: number;
}> = ({ phrases, lead = 0.3, tail = 1.0 }) => {
  const { durationInFrames, fps } = useVideoConfig();
  const total = durationInFrames / fps;
  const span = Math.max(0.2, total - lead - tail);
  const weights = phrases.map((p) => Math.max(6, p.length));
  const sum = weights.reduce((a, b) => a + b, 0);

  let t = lead;
  const cues = phrases.map((p, i) => {
    const dur = (span * weights[i]) / sum;
    const cue = { start: t, end: t + dur, text: p };
    t += dur;
    return cue;
  });

  return <Captions cues={cues} />;
};
