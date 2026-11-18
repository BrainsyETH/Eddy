import React from 'react';
import { AbsoluteFill, useCurrentFrame } from 'remotion';
import { colors } from '../../../../shared/social-brand';
import { DamStoryScene } from './DamStoryScene';

/** Isolated artwork review; no schedule or live readings. */
export function DamStoryMotionStudy() {
  const frame = useCurrentFrame();
  return <AbsoluteFill style={{ background: colors.secondary[50], padding: 40 }}>
    <DamStoryScene frame={frame} active />
  </AbsoluteFill>;
}
