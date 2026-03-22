import React from 'react';
import { Composition } from 'remotion';
import { REEL_WIDTH, REEL_HEIGHT, REEL_FPS } from './lib/theme';
import type { GaugeAnimationProps, ConditionAlertProps, DailyDigestProps } from './lib/types';
import { GaugeAnimation } from './compositions/GaugeAnimation';
import { ConditionAlert } from './compositions/ConditionAlert';
import { DailyDigest } from './compositions/DailyDigest';

// Default props for Remotion Studio preview
const defaultGaugeProps: GaugeAnimationProps = {
  riverName: 'Upper Current',
  gaugeHeight: 3.2,
  discharge: 450,
  conditionCode: 'optimal',
  eddyQuote: 'Crystal clear and running perfect — this is the sweet spot for a lazy float down to Akers.',
  trendDirection: 'stable',
  optimalMin: 2.5,
  optimalMax: 4.0,
  dangerousLevel: 8.0,
  unit: 'ft',
};

const defaultAlertProps: ConditionAlertProps = {
  riverName: 'Eleven Point',
  previousCondition: 'okay',
  newCondition: 'optimal',
  gaugeHeight: 2.8,
  discharge: 320,
  eddyQuote: 'Just hit the sweet spot — grab your tubes and get down here before it changes.',
};

const defaultDigestProps: DailyDigestProps = {
  rivers: [
    { name: 'Upper Current', conditionCode: 'optimal', gaugeHeight: 3.2, trendDirection: 'stable' },
    { name: 'Jacks Fork', conditionCode: 'okay', gaugeHeight: 2.1, trendDirection: 'falling' },
    { name: 'Eleven Point', conditionCode: 'optimal', gaugeHeight: 2.8, trendDirection: 'rising' },
    { name: 'Meramec', conditionCode: 'high', gaugeHeight: 5.4, trendDirection: 'falling' },
    { name: 'Huzzah Creek', conditionCode: 'low', gaugeHeight: 1.3, trendDirection: 'stable' },
    { name: 'Big Piney', conditionCode: 'okay', gaugeHeight: 3.0, trendDirection: 'rising' },
  ],
  weatherSummary: '78°F, sunny with light breeze',
  topPickRiver: 'Eleven Point',
  topPickCondition: 'optimal',
  globalQuote: 'Two rivers running optimal today and the sun is shining — it\'s a good day to be on the water in the Ozarks.',
  date: 'March 22, 2026',
};

// Cast components to satisfy Remotion's LooseComponentType constraint
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const GaugeAnimationComp = GaugeAnimation as React.FC<any>;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const ConditionAlertComp = ConditionAlert as React.FC<any>;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const DailyDigestComp = DailyDigest as React.FC<any>;

export const RemotionRoot: React.FC = () => {
  return (
    <>
      <Composition
        id="GaugeAnimation"
        component={GaugeAnimationComp}
        durationInFrames={600}
        fps={REEL_FPS}
        width={REEL_WIDTH}
        height={REEL_HEIGHT}
        defaultProps={defaultGaugeProps}
      />
      <Composition
        id="ConditionAlert"
        component={ConditionAlertComp}
        durationInFrames={450}
        fps={REEL_FPS}
        width={REEL_WIDTH}
        height={REEL_HEIGHT}
        defaultProps={defaultAlertProps}
      />
      <Composition
        id="DailyDigest"
        component={DailyDigestComp}
        durationInFrames={900}
        fps={REEL_FPS}
        width={REEL_WIDTH}
        height={REEL_HEIGHT}
        defaultProps={defaultDigestProps}
      />
    </>
  );
};
