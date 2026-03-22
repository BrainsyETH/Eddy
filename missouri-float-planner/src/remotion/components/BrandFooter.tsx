import React from 'react';
import { spring, useCurrentFrame, useVideoConfig, interpolate } from 'remotion';
import { colors } from '../lib/theme';
import { springPresets } from '../lib/spring-presets';

interface BrandFooterProps {
  startFrame: number;
}

export const BrandFooter: React.FC<BrandFooterProps> = ({ startFrame }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const progress = spring({
    frame: Math.max(0, frame - startFrame),
    fps,
    config: springPresets.smooth,
  });

  const opacity = interpolate(progress, [0, 1], [0, 1]);
  const translateY = interpolate(progress, [0, 1], [40, 0]);

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 12,
        opacity,
        transform: `translateY(${translateY}px)`,
        padding: '32px 0',
      }}
    >
      <div
        style={{
          fontFamily: 'Fredoka, sans-serif',
          fontSize: 32,
          fontWeight: 700,
          color: colors.sunsetCoral,
          textShadow: '2px 2px 0 rgba(0,0,0,0.15)',
        }}
      >
        Plan your float →
      </div>
      <div
        style={{
          fontFamily: 'Fredoka, sans-serif',
          fontSize: 44,
          fontWeight: 700,
          color: colors.white,
          letterSpacing: 2,
          textShadow: '3px 3px 0 rgba(0,0,0,0.2)',
        }}
      >
        eddy.guide
      </div>
    </div>
  );
};
