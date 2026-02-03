import React from "react";
import { useCurrentFrame, interpolate } from "remotion";
import { COLORS } from "../lib/constants";

interface WaterRippleProps {
  x?: number;
  y?: number;
  delay?: number;
  maxRadius?: number;
  color?: string;
}

/**
 * Animated water ripple effect
 */
export const WaterRipple: React.FC<WaterRippleProps> = ({
  x = 50,
  y = 50,
  delay = 0,
  maxRadius = 300,
  color = COLORS.skyBlue,
}) => {
  const frame = useCurrentFrame();
  const loopDuration = 90; // 3 seconds at 30fps
  
  // Create staggered ripples
  const ripples = [0, 30, 60].map((rippleDelay, index) => {
    const rippleFrame = (frame - delay - rippleDelay) % loopDuration;
    
    if (rippleFrame < 0) return null;
    
    const progress = rippleFrame / loopDuration;
    const radius = interpolate(progress, [0, 1], [0, maxRadius]);
    const opacity = interpolate(progress, [0, 0.2, 1], [0, 0.6, 0]);
    const strokeWidth = interpolate(progress, [0, 1], [4, 1]);

    return (
      <circle
        key={index}
        cx={`${x}%`}
        cy={`${y}%`}
        r={radius}
        fill="none"
        stroke={color}
        strokeWidth={strokeWidth}
        opacity={opacity}
      />
    );
  });

  return (
    <svg
      style={{
        position: "absolute",
        top: 0,
        left: 0,
        width: "100%",
        height: "100%",
        pointerEvents: "none",
      }}
    >
      {ripples}
    </svg>
  );
};
