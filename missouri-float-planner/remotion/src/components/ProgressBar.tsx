import React from "react";
import { useCurrentFrame, useVideoConfig } from "remotion";

interface ProgressBarProps {
  /** Position */
  position?: "top" | "bottom";
  /** Format */
  format?: "landscape" | "portrait";
}

/**
 * Thin progress bar showing tutorial progress.
 */
export const ProgressBar: React.FC<ProgressBarProps> = ({
  position = "top",
  format = "landscape",
}) => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();

  const progress = (frame / durationInFrames) * 100;

  return (
    <div
      className="absolute left-0 right-0 z-50"
      style={{
        [position]: 0,
        height: format === "portrait" ? 4 : 3,
      }}
    >
      <div
        className="h-full bg-accent-500"
        style={{
          width: `${progress}%`,
          transition: "width 33ms linear",
        }}
      />
    </div>
  );
};
