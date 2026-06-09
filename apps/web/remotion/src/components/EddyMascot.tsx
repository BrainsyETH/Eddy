import React from "react";
import {
  useCurrentFrame,
  useVideoConfig,
  spring,
  interpolate,
  Img,
  staticFile,
} from "remotion";

type EddyVariant = "standard" | "canoe" | "flag" | "green" | "favicon";

interface EddyMascotProps {
  variant?: EddyVariant;
  size?: number;
  /** Delay before entrance animation in frames */
  delay?: number;
  /** Enable floating bob animation */
  float?: boolean;
}

const variantFiles: Record<EddyVariant, string> = {
  standard: "eddy/eddy-standard.png",
  canoe: "eddy/eddy-canoe.png",
  flag: "eddy/eddy-flag.png",
  green: "eddy/eddy-green.png",
  favicon: "eddy/eddy-favicon.png",
};

/**
 * Eddy the Otter mascot with spring entrance and optional floating animation.
 */
export const EddyMascot: React.FC<EddyMascotProps> = ({
  variant = "standard",
  size = 200,
  delay = 0,
  float: enableFloat = true,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const entrance = spring({
    frame: frame - delay,
    fps,
    config: { damping: 12, mass: 1, stiffness: 80 },
  });

  const translateY = interpolate(entrance, [0, 1], [100, 0]);
  const floatOffset = enableFloat
    ? Math.sin((frame - delay) / 15) * 6
    : 0;

  return (
    <div
      style={{
        opacity: entrance,
        transform: `translateY(${translateY + floatOffset}px)`,
      }}
    >
      <Img
        src={staticFile(variantFiles[variant])}
        style={{ width: size, height: "auto" }}
      />
    </div>
  );
};
