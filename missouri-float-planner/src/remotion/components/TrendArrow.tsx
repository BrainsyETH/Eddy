import React from 'react';
import { spring, useCurrentFrame, useVideoConfig, interpolate } from 'remotion';
import { colors } from '../lib/theme';
import { springPresets } from '../lib/spring-presets';
import type { TrendDirection } from '../lib/types';

interface TrendArrowProps {
  direction: TrendDirection;
  startFrame: number;
}

const arrowConfig: Record<TrendDirection, { rotation: number; label: string; color: string }> = {
  rising: { rotation: -45, label: 'RISING', color: colors.sunsetCoral },
  falling: { rotation: 45, label: 'FALLING', color: colors.riverTealLight },
  stable: { rotation: 0, label: 'STABLE', color: colors.trailGreen },
};

export const TrendArrow: React.FC<TrendArrowProps> = ({ direction, startFrame }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const progress = spring({
    frame: Math.max(0, frame - startFrame),
    fps,
    config: springPresets.snappy,
  });

  const scale = interpolate(progress, [0, 1], [0, 1]);
  const { rotation, label, color } = arrowConfig[direction];

  // Gentle pulse for the arrow
  const pulse = 1 + Math.sin((frame - startFrame) * 0.1) * 0.05;

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 16, transform: `scale(${scale})` }}>
      <div
        style={{
          width: 48,
          height: 48,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          transform: `rotate(${rotation}deg) scale(${pulse})`,
        }}
      >
        <svg width="40" height="40" viewBox="0 0 40 40">
          <path
            d="M20 4L34 28H6L20 4Z"
            fill={color}
            stroke={colors.white}
            strokeWidth={2}
          />
        </svg>
      </div>
      <div
        style={{
          fontFamily: 'Fredoka, sans-serif',
          fontSize: 24,
          fontWeight: 600,
          color,
          letterSpacing: 2,
        }}
      >
        {label}
      </div>
    </div>
  );
};
