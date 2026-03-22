import React from 'react';
import { spring, useCurrentFrame, useVideoConfig, interpolate } from 'remotion';
import { colors } from '../lib/theme';
import { springPresets } from '../lib/spring-presets';

interface EddyMascotProps {
  quote: string;
  startFrame: number;
}

export const EddyMascot: React.FC<EddyMascotProps> = ({
  quote,
  startFrame,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const slideIn = spring({
    frame: Math.max(0, frame - startFrame),
    fps,
    config: springPresets.bouncy,
  });

  const quoteReveal = spring({
    frame: Math.max(0, frame - startFrame - 15),
    fps,
    config: springPresets.smooth,
  });

  const translateX = interpolate(slideIn, [0, 1], [-200, 0]);
  const quoteOpacity = interpolate(quoteReveal, [0, 1], [0, 1]);
  const quoteTranslateY = interpolate(quoteReveal, [0, 1], [30, 0]);

  // Gentle bobbing animation for the mascot
  const bobOffset = Math.sin((frame - startFrame) * 0.08) * 6;

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 24,
        padding: '0 48px',
      }}
    >
      {/* Otter mascot circle */}
      <div
        style={{
          width: 120,
          height: 120,
          borderRadius: '50%',
          backgroundColor: colors.sandbarTan,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 64,
          transform: `translateX(${translateX}px) translateY(${bobOffset}px)`,
          boxShadow: `4px 4px 0 ${colors.riverTealDark}`,
          border: `3px solid ${colors.white}`,
        }}
      >
        🦦
      </div>

      {/* Quote bubble */}
      <div
        style={{
          backgroundColor: 'rgba(255,255,255,0.15)',
          backdropFilter: 'blur(10px)',
          borderRadius: 20,
          padding: '24px 32px',
          maxWidth: 900,
          opacity: quoteOpacity,
          transform: `translateY(${quoteTranslateY}px)`,
        }}
      >
        <div
          style={{
            fontFamily: 'Geist Sans, sans-serif',
            fontSize: 28,
            color: colors.white,
            lineHeight: 1.5,
            textAlign: 'center',
            fontStyle: 'italic',
          }}
        >
          &ldquo;{quote}&rdquo;
        </div>
        <div
          style={{
            fontFamily: 'Fredoka, sans-serif',
            fontSize: 20,
            color: colors.sandbarTanLight,
            textAlign: 'center',
            marginTop: 12,
          }}
        >
          — Eddy the Otter
        </div>
      </div>
    </div>
  );
};
