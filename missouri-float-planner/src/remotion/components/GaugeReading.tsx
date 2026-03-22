import React from 'react';
import { spring, useCurrentFrame, useVideoConfig, interpolate } from 'remotion';
import { colors } from '../lib/theme';
import { springPresets } from '../lib/spring-presets';

interface GaugeReadingProps {
  value: number;
  unit: string;
  label: string;
  startFrame: number;
}

export const GaugeReading: React.FC<GaugeReadingProps> = ({
  value,
  unit,
  label,
  startFrame,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const progress = spring({
    frame: Math.max(0, frame - startFrame),
    fps,
    config: springPresets.smooth,
  });

  // Animate the number counting up
  const displayValue = interpolate(progress, [0, 1], [0, value]);
  const opacity = interpolate(progress, [0, 0.3], [0, 1], {
    extrapolateRight: 'clamp',
  });

  return (
    <div style={{ textAlign: 'center', opacity }}>
      <div
        style={{
          fontFamily: 'Fredoka, sans-serif',
          fontSize: 72,
          fontWeight: 700,
          color: colors.white,
          textShadow: '3px 3px 0 rgba(0,0,0,0.2)',
        }}
      >
        {displayValue.toFixed(1)}
        <span style={{ fontSize: 36, fontWeight: 500, marginLeft: 8 }}>
          {unit}
        </span>
      </div>
      <div
        style={{
          fontFamily: 'Geist Sans, sans-serif',
          fontSize: 22,
          color: colors.sandbarTanLight,
          marginTop: 4,
          letterSpacing: 2,
          textTransform: 'uppercase',
        }}
      >
        {label}
      </div>
    </div>
  );
};
