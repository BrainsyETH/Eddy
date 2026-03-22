import React from 'react';
import { spring, useCurrentFrame, useVideoConfig, interpolate } from 'remotion';
import { colors } from '../lib/theme';
import { springPresets } from '../lib/spring-presets';

interface RiverNameProps {
  name: string;
  startFrame: number;
  color?: string;
}

export const RiverName: React.FC<RiverNameProps> = ({
  name,
  startFrame,
  color = colors.white,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const progress = spring({
    frame: Math.max(0, frame - startFrame),
    fps,
    config: springPresets.snappy,
  });

  const translateY = interpolate(progress, [0, 1], [60, 0]);
  const opacity = interpolate(progress, [0, 1], [0, 1]);

  return (
    <div
      style={{
        fontFamily: 'Fredoka, sans-serif',
        fontSize: 64,
        fontWeight: 700,
        color,
        transform: `translateY(${translateY}px)`,
        opacity,
        textShadow: '3px 3px 0 rgba(0,0,0,0.2)',
        textAlign: 'center',
        lineHeight: 1.1,
      }}
    >
      {name}
    </div>
  );
};
