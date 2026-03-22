import React from 'react';
import { spring, useCurrentFrame, useVideoConfig } from 'remotion';
import { conditionColors } from '../lib/theme';
import { springPresets } from '../lib/spring-presets';
import type { ConditionCode } from '../lib/types';

interface ConditionBadgeProps {
  conditionCode: ConditionCode;
  startFrame: number;
  size?: 'sm' | 'md' | 'lg';
}

const sizes = {
  sm: { fontSize: 18, padding: '6px 16px', borderRadius: 12 },
  md: { fontSize: 24, padding: '8px 24px', borderRadius: 16 },
  lg: { fontSize: 36, padding: '12px 36px', borderRadius: 20 },
};

export const ConditionBadge: React.FC<ConditionBadgeProps> = ({
  conditionCode,
  startFrame,
  size = 'md',
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const scale = spring({
    frame: Math.max(0, frame - startFrame),
    fps,
    config: springPresets.pop,
  });

  const { bg, text, label } = conditionColors[conditionCode];
  const s = sizes[size];

  return (
    <div
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: bg,
        color: text,
        fontFamily: 'Fredoka, sans-serif',
        fontSize: s.fontSize,
        fontWeight: 600,
        padding: s.padding,
        borderRadius: s.borderRadius,
        transform: `scale(${scale})`,
        letterSpacing: 1,
        boxShadow: `3px 3px 0 rgba(0,0,0,0.15)`,
      }}
    >
      {label}
    </div>
  );
};
