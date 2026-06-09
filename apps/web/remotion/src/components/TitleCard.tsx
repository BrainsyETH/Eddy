import React from "react";
import {
  useCurrentFrame,
  useVideoConfig,
  spring,
  interpolate,
} from "remotion";

interface TitleCardProps {
  title: string;
  subtitle?: string;
}

/**
 * Scene title overlay with Fredoka heading and spring animation.
 */
export const TitleCard: React.FC<TitleCardProps> = ({ title, subtitle }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const titleSpring = spring({ frame, fps, config: { damping: 15, mass: 0.8 } });
  const subtitleSpring = spring({
    frame: frame - 8,
    fps,
    config: { damping: 15, mass: 0.8 },
  });

  const titleY = interpolate(titleSpring, [0, 1], [40, 0]);
  const subtitleY = interpolate(subtitleSpring, [0, 1], [30, 0]);

  return (
    <div className="flex flex-col items-center justify-center text-center">
      <h1
        className="text-5xl font-bold tracking-tight text-white"
        style={{
          fontFamily: "'Fredoka', system-ui, sans-serif",
          opacity: titleSpring,
          transform: `translateY(${titleY}px)`,
        }}
      >
        {title}
      </h1>
      {subtitle && (
        <p
          className="mt-4 text-xl text-neutral-200"
          style={{
            fontFamily: "'Geist Sans', system-ui, sans-serif",
            opacity: Math.max(0, subtitleSpring),
            transform: `translateY(${subtitleY}px)`,
          }}
        >
          {subtitle}
        </p>
      )}
    </div>
  );
};
