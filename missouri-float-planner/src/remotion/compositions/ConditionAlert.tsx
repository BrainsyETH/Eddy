import React from 'react';
import {
  AbsoluteFill,
  Sequence,
  spring,
  useCurrentFrame,
  useVideoConfig,
  interpolate,
} from 'remotion';
import { colors, conditionColors } from '../lib/theme';
import type { ConditionAlertProps } from '../lib/types';
import { RiverName } from '../components/RiverName';
import { ConditionBadge } from '../components/ConditionBadge';
import { EddyMascot } from '../components/EddyMascot';
import { BrandFooter } from '../components/BrandFooter';

// 15 seconds at 30fps = 450 frames
// Timeline:
//   0-60  (0-2s):  Flash/pulse attention grab
//  60-150 (2-5s):  "CONDITION CHANGE" header + river name
// 150-270 (5-9s):  Previous → New condition transition
// 270-360 (9-12s): Gauge reading + Eddy quote
// 360-450 (12-15s): CTA footer

export const ConditionAlert: React.FC<ConditionAlertProps> = (props) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const newCondColor = conditionColors[props.newCondition];
  const prevCondColor = conditionColors[props.previousCondition];

  // Flash pulse for first 2 seconds
  const flashOpacity =
    frame < 60
      ? interpolate(
          Math.sin(frame * 0.5),
          [-1, 1],
          [0.3, 1]
        )
      : 0;

  // Background transitions from old condition color to new
  const bgTransition =
    frame < 150
      ? prevCondColor.bg
      : frame < 210
        ? interpolate(
            frame,
            [150, 210],
            [0, 1],
            { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }
          ) > 0.5
          ? newCondColor.bg
          : prevCondColor.bg
        : newCondColor.bg;

  // Arrow animation between conditions
  const arrowProgress = spring({
    frame: Math.max(0, frame - 180),
    fps,
    config: { damping: 15, mass: 1, stiffness: 100 },
  });

  return (
    <AbsoluteFill
      style={{
        background: `linear-gradient(180deg, ${colors.riverTealDark} 0%, ${bgTransition}66 50%, ${colors.riverTealDark} 100%)`,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '80px 48px',
      }}
    >
      {/* Flash overlay */}
      {frame < 60 && (
        <AbsoluteFill
          style={{
            backgroundColor: newCondColor.bg,
            opacity: flashOpacity,
            zIndex: 10,
          }}
        />
      )}

      {/* "CONDITION CHANGE" header */}
      <Sequence from={60}>
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 24,
          }}
        >
          <div
            style={{
              fontFamily: 'Fredoka, sans-serif',
              fontSize: 36,
              fontWeight: 700,
              color: colors.sunsetCoral,
              letterSpacing: 4,
              textTransform: 'uppercase',
              textShadow: '2px 2px 0 rgba(0,0,0,0.2)',
              opacity: interpolate(frame, [60, 80], [0, 1], {
                extrapolateLeft: 'clamp',
                extrapolateRight: 'clamp',
              }),
            }}
          >
            ⚡ CONDITION CHANGE
          </div>
          <RiverName name={props.riverName} startFrame={10} />
        </div>
      </Sequence>

      {/* Condition transition */}
      <Sequence from={150}>
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 32,
          }}
        >
          {/* Previous condition */}
          <div style={{ opacity: 0.6 }}>
            <ConditionBadge
              conditionCode={props.previousCondition}
              startFrame={0}
              size="md"
            />
          </div>

          {/* Arrow */}
          <div
            style={{
              fontSize: 56,
              transform: `scale(${arrowProgress})`,
              lineHeight: 1,
            }}
          >
            ↓
          </div>

          {/* New condition */}
          <ConditionBadge
            conditionCode={props.newCondition}
            startFrame={30}
            size="lg"
          />

          {/* Gauge reading */}
          <div
            style={{
              fontFamily: 'Fredoka, sans-serif',
              fontSize: 48,
              fontWeight: 700,
              color: colors.white,
              marginTop: 16,
              opacity: interpolate(frame, [220, 250], [0, 1], {
                extrapolateLeft: 'clamp',
                extrapolateRight: 'clamp',
              }),
              textShadow: '3px 3px 0 rgba(0,0,0,0.2)',
            }}
          >
            {props.gaugeHeight.toFixed(1)} ft
            {props.discharge !== null && (
              <span style={{ fontSize: 28, marginLeft: 16, opacity: 0.8 }}>
                ({props.discharge.toFixed(0)} cfs)
              </span>
            )}
          </div>
        </div>
      </Sequence>

      {/* Eddy quote */}
      <Sequence from={270}>
        <EddyMascot quote={props.eddyQuote} startFrame={0} />
      </Sequence>

      {/* CTA Footer */}
      <Sequence from={360}>
        <BrandFooter startFrame={0} />
      </Sequence>
    </AbsoluteFill>
  );
};
