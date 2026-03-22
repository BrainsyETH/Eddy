import React from 'react';
import {
  AbsoluteFill,
  Sequence,
  interpolate,
  useCurrentFrame,
} from 'remotion';
import { colors, conditionColors } from '../lib/theme';
import type { GaugeAnimationProps } from '../lib/types';
import { RiverName } from '../components/RiverName';
import { ConditionBadge } from '../components/ConditionBadge';
import { WaterLevel } from '../components/WaterLevel';
import { GaugeReading } from '../components/GaugeReading';
import { TrendArrow } from '../components/TrendArrow';
import { EddyMascot } from '../components/EddyMascot';
import { BrandFooter } from '../components/BrandFooter';

// 20 seconds at 30fps = 600 frames
// Timeline:
//   0-90 (0-3s): River name + condition badge
//  90-240 (3-8s): Water level gauge fill + reading
// 240-360 (8-12s): Optimal range label + trend arrow
// 360-510 (12-17s): Eddy mascot + quote
// 510-600 (17-20s): CTA footer

export const GaugeAnimation: React.FC<GaugeAnimationProps> = (props) => {
  const frame = useCurrentFrame();
  const condColor = conditionColors[props.conditionCode];

  // Background gradient shifts based on condition
  const bgGradient = `linear-gradient(180deg, ${colors.riverTealDark} 0%, ${condColor.bg}44 50%, ${colors.riverTealDark} 100%)`;

  return (
    <AbsoluteFill
      style={{
        background: bgGradient,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '80px 48px',
      }}
    >
      {/* Top section: River name + condition */}
      <Sequence from={0}>
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 20,
          }}
        >
          <RiverName name={props.riverName} startFrame={0} />
          <ConditionBadge
            conditionCode={props.conditionCode}
            startFrame={15}
            size="lg"
          />
        </div>
      </Sequence>

      {/* Middle section: Gauge + reading */}
      <Sequence from={90}>
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 32,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 48 }}>
            <WaterLevel
              gaugeHeight={props.gaugeHeight}
              optimalMin={props.optimalMin}
              optimalMax={props.optimalMax}
              dangerousLevel={props.dangerousLevel}
              conditionCode={props.conditionCode}
              startFrame={0}
            />
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: 24,
              }}
            >
              <GaugeReading
                value={props.gaugeHeight}
                unit="ft"
                label="Gauge Height"
                startFrame={30}
              />
              {props.discharge !== null && (
                <GaugeReading
                  value={props.discharge}
                  unit="cfs"
                  label="Discharge"
                  startFrame={50}
                />
              )}
            </div>
          </div>

          {/* Optimal range label */}
          <Sequence from={150}>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 16,
                opacity: interpolate(
                  frame,
                  [240, 270],
                  [0, 1],
                  { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }
                ),
              }}
            >
              <div
                style={{
                  fontFamily: 'Geist Sans, sans-serif',
                  fontSize: 22,
                  color: colors.sandbarTanLight,
                }}
              >
                Optimal: {props.optimalMin}–{props.optimalMax} ft
              </div>
              <TrendArrow
                direction={props.trendDirection}
                startFrame={30}
              />
            </div>
          </Sequence>
        </div>
      </Sequence>

      {/* Eddy mascot + quote */}
      <Sequence from={360}>
        <EddyMascot quote={props.eddyQuote} startFrame={0} />
      </Sequence>

      {/* CTA Footer */}
      <Sequence from={510}>
        <BrandFooter startFrame={0} />
      </Sequence>
    </AbsoluteFill>
  );
};
