import React from "react";
import {
  useCurrentFrame,
  useVideoConfig,
  spring,
  interpolate,
  Img,
  staticFile,
} from "remotion";

// Presentational variants (standard/canoe/favicon) plus the canonical condition
// moods from shared/condition-system.ts (green/yellow/flag/red/flood).
type EddyVariant =
  | "standard"
  | "canoe"
  | "flag"
  | "green"
  | "favicon"
  | "yellow"
  | "red"
  | "flood";

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
  // Canonical condition moods whose dedicated otters are not yet downloaded as
  // local assets — fall back to the closest existing otter until
  // eddy-{yellow,red,flood}.png are added (see DOWNLOAD_ASSETS.md). Once the
  // assets land, point these three lines at their own files for full host-face
  // parity with the app.
  yellow: "eddy/eddy-flag.png",
  red: "eddy/eddy-standard.png",
  flood: "eddy/eddy-standard.png",
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
