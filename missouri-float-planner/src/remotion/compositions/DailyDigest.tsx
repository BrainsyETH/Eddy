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
import type { DailyDigestProps, RiverDigestEntry } from '../lib/types';
import { ConditionBadge } from '../components/ConditionBadge';
import { EddyMascot } from '../components/EddyMascot';
import { BrandFooter } from '../components/BrandFooter';

// 30 seconds at 30fps = 900 frames
// Timeline:
//   0-90  (0-3s):   Title + date
//  90-450 (3-15s):  River cards scroll (60 frames / 2s each)
// 450-600 (15-20s): Top pick highlight with weather
// 600-750 (20-25s): Eddy mascot + global quote
// 750-900 (25-30s): CTA footer

const RiverCard: React.FC<{
  river: RiverDigestEntry;
  index: number;
  startFrame: number;
}> = ({ river, index, startFrame }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const progress = spring({
    frame: Math.max(0, frame - startFrame),
    fps,
    config: { damping: 18, mass: 0.8, stiffness: 150 },
  });

  const translateX = interpolate(progress, [0, 1], [400, 0]);
  const opacity = interpolate(progress, [0, 0.5], [0, 1], {
    extrapolateRight: 'clamp',
  });

  const condColor = conditionColors[river.conditionCode];
  const trendEmoji =
    river.trendDirection === 'rising' ? '↑' :
    river.trendDirection === 'falling' ? '↓' : '→';

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 20,
        backgroundColor: 'rgba(255,255,255,0.1)',
        borderRadius: 20,
        padding: '20px 28px',
        transform: `translateX(${translateX}px)`,
        opacity,
        borderLeft: `6px solid ${condColor.bg}`,
      }}
    >
      <div style={{ flex: 1 }}>
        <div
          style={{
            fontFamily: 'Fredoka, sans-serif',
            fontSize: 30,
            fontWeight: 600,
            color: colors.white,
          }}
        >
          {river.name}
        </div>
        <div
          style={{
            fontFamily: 'Geist Sans, sans-serif',
            fontSize: 22,
            color: colors.sandbarTanLight,
            marginTop: 4,
          }}
        >
          {river.gaugeHeight.toFixed(1)} ft {trendEmoji}
        </div>
      </div>
      <div
        style={{
          backgroundColor: condColor.bg,
          color: condColor.text,
          fontFamily: 'Fredoka, sans-serif',
          fontSize: 18,
          fontWeight: 600,
          padding: '6px 16px',
          borderRadius: 12,
        }}
      >
        {condColor.label}
      </div>
    </div>
  );
};

export const DailyDigest: React.FC<DailyDigestProps> = (props) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const titleProgress = spring({
    frame,
    fps,
    config: { damping: 15, mass: 1, stiffness: 120 },
  });

  return (
    <AbsoluteFill
      style={{
        background: `linear-gradient(180deg, ${colors.riverTealDark} 0%, ${colors.riverTeal} 40%, ${colors.riverTealDark} 100%)`,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '80px 48px',
      }}
    >
      {/* Title + Date */}
      <Sequence from={0} durationInFrames={900}>
        <div
          style={{
            textAlign: 'center',
            transform: `scale(${titleProgress})`,
          }}
        >
          <div
            style={{
              fontFamily: 'Fredoka, sans-serif',
              fontSize: 48,
              fontWeight: 700,
              color: colors.white,
              textShadow: '3px 3px 0 rgba(0,0,0,0.2)',
            }}
          >
            Ozarks Float Report
          </div>
          <div
            style={{
              fontFamily: 'Geist Sans, sans-serif',
              fontSize: 28,
              color: colors.sandbarTanLight,
              marginTop: 8,
            }}
          >
            {props.date}
          </div>
        </div>
      </Sequence>

      {/* River cards */}
      <Sequence from={90} durationInFrames={360}>
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 16,
            width: '100%',
            maxWidth: 900,
          }}
        >
          {props.rivers.slice(0, 6).map((river, i) => (
            <RiverCard
              key={river.name}
              river={river}
              index={i}
              startFrame={i * 45}
            />
          ))}
        </div>
      </Sequence>

      {/* Top pick highlight */}
      <Sequence from={450} durationInFrames={150}>
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 16,
          }}
        >
          <div
            style={{
              fontFamily: 'Fredoka, sans-serif',
              fontSize: 28,
              color: colors.sunsetCoral,
              letterSpacing: 3,
              textTransform: 'uppercase',
              opacity: interpolate(frame, [450, 470], [0, 1], {
                extrapolateLeft: 'clamp',
                extrapolateRight: 'clamp',
              }),
            }}
          >
            ⭐ TOP PICK TODAY
          </div>
          <div
            style={{
              fontFamily: 'Fredoka, sans-serif',
              fontSize: 52,
              fontWeight: 700,
              color: colors.white,
              textShadow: '3px 3px 0 rgba(0,0,0,0.2)',
              opacity: interpolate(frame, [465, 490], [0, 1], {
                extrapolateLeft: 'clamp',
                extrapolateRight: 'clamp',
              }),
            }}
          >
            {props.topPickRiver}
          </div>
          <ConditionBadge
            conditionCode={props.topPickCondition}
            startFrame={480 - 450}
            size="lg"
          />
          <div
            style={{
              fontFamily: 'Geist Sans, sans-serif',
              fontSize: 24,
              color: colors.sandbarTanLight,
              marginTop: 8,
              opacity: interpolate(frame, [500, 520], [0, 1], {
                extrapolateLeft: 'clamp',
                extrapolateRight: 'clamp',
              }),
            }}
          >
            {props.weatherSummary}
          </div>
        </div>
      </Sequence>

      {/* Eddy mascot + global quote */}
      <Sequence from={600} durationInFrames={150}>
        <EddyMascot quote={props.globalQuote} startFrame={0} />
      </Sequence>

      {/* CTA Footer */}
      <Sequence from={750}>
        <BrandFooter startFrame={0} />
      </Sequence>
    </AbsoluteFill>
  );
};
