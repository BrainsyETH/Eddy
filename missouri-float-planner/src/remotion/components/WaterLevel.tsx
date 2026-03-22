import React from 'react';
import { interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion';
import { colors, conditionColors } from '../lib/theme';
import { springPresets } from '../lib/spring-presets';
import type { ConditionCode } from '../lib/types';

interface WaterLevelProps {
  gaugeHeight: number;
  optimalMin: number;
  optimalMax: number;
  dangerousLevel: number;
  conditionCode: ConditionCode;
  /** Frame at which the fill animation starts */
  startFrame: number;
}

export const WaterLevel: React.FC<WaterLevelProps> = ({
  gaugeHeight,
  optimalMin,
  optimalMax,
  dangerousLevel,
  conditionCode,
  startFrame,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // Normalize gauge height to 0-1 range (0 = empty, 1 = dangerous)
  const fillPercent = Math.min(Math.max(gaugeHeight / dangerousLevel, 0), 1);

  const fillProgress = spring({
    frame: Math.max(0, frame - startFrame),
    fps,
    config: springPresets.fill,
  });

  const currentFill = fillPercent * fillProgress;

  // Optimal range markers (normalized)
  const optMinNorm = optimalMin / dangerousLevel;
  const optMaxNorm = optimalMax / dangerousLevel;

  // Wave animation
  const waveOffset = interpolate(frame, [0, 120], [0, 360], {
    extrapolateRight: 'extend',
  });

  const condColor = conditionColors[conditionCode];

  return (
    <div
      style={{
        width: 280,
        height: 600,
        borderRadius: 24,
        border: `4px solid ${colors.warmStone}`,
        backgroundColor: colors.warmWhite,
        position: 'relative',
        overflow: 'hidden',
        boxShadow: `6px 6px 0 ${colors.warmStone}`,
      }}
    >
      {/* Optimal range band */}
      <div
        style={{
          position: 'absolute',
          bottom: `${optMinNorm * 100}%`,
          height: `${(optMaxNorm - optMinNorm) * 100}%`,
          width: '100%',
          backgroundColor: 'rgba(78, 184, 107, 0.15)',
          borderTop: `2px dashed ${colors.trailGreen}`,
          borderBottom: `2px dashed ${colors.trailGreen}`,
          zIndex: 1,
        }}
      />

      {/* Water fill */}
      <div
        style={{
          position: 'absolute',
          bottom: 0,
          width: '100%',
          height: `${currentFill * 100}%`,
          backgroundColor: condColor.bg,
          opacity: 0.85,
          transition: 'background-color 0.3s',
          zIndex: 2,
        }}
      >
        {/* Wave SVG overlay */}
        <svg
          viewBox="0 0 280 20"
          style={{
            position: 'absolute',
            top: -18,
            left: 0,
            width: '100%',
            height: 20,
          }}
        >
          <path
            d={`M0,10 Q35,${2 + 8 * Math.sin((waveOffset * Math.PI) / 180)} 70,10 T140,10 T210,10 T280,10 V20 H0 Z`}
            fill={condColor.bg}
            opacity={0.85}
          />
        </svg>
      </div>

      {/* Current reading marker */}
      {fillProgress > 0.5 && (
        <div
          style={{
            position: 'absolute',
            bottom: `${currentFill * 100}%`,
            right: 12,
            transform: 'translateY(50%)',
            backgroundColor: colors.white,
            padding: '4px 12px',
            borderRadius: 8,
            border: `2px solid ${condColor.bg}`,
            fontFamily: 'Fredoka, sans-serif',
            fontSize: 20,
            fontWeight: 600,
            color: condColor.bg,
            zIndex: 3,
            boxShadow: `2px 2px 0 ${colors.warmStone}`,
          }}
        >
          {gaugeHeight.toFixed(1)} ft
        </div>
      )}
    </div>
  );
};
