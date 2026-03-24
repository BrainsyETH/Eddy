import React from "react";
import {
  useCurrentFrame,
  useVideoConfig,
  spring,
  interpolate,
} from "remotion";

interface SubtitleProps {
  text: string;
  /** Delay before appearing, in frames */
  delay?: number;
  /** Format affects positioning */
  format?: "landscape" | "portrait";
}

/**
 * Bottom-of-frame subtitle overlay for voiceover captions.
 * Styled with semi-transparent background for readability.
 */
export const Subtitle: React.FC<SubtitleProps> = ({
  text,
  delay = 0,
  format = "landscape",
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const progress = spring({
    frame: frame - delay,
    fps,
    config: { damping: 20, mass: 0.5 },
  });

  const translateY = interpolate(progress, [0, 1], [20, 0]);

  return (
    <div
      className="absolute left-0 right-0 flex justify-center"
      style={{
        bottom: format === "portrait" ? "12%" : "6%",
      }}
    >
      <div
        className="px-6 py-3 rounded-xl max-w-[85%] text-center"
        style={{
          background: "rgba(15, 45, 53, 0.85)",
          backdropFilter: "blur(8px)",
          opacity: progress,
          transform: `translateY(${translateY}px)`,
        }}
      >
        <p
          className="text-white font-medium leading-relaxed"
          style={{
            fontFamily: "'Geist Sans', system-ui, sans-serif",
            fontSize: format === "portrait" ? "1.125rem" : "1.25rem",
          }}
        >
          {text}
        </p>
      </div>
    </div>
  );
};
