import React, { useId } from 'react';
import { scheduledBar } from '../../../../shared/dam-generation';
import { colors } from '../../../../shared/social-brand';
import type { DamStorySnapshot } from '../../../../shared/social-dam-schedule';
import { loopFrame } from './dam-story-motion';

const height = 96;
const baseline = 4;
const gap = 4;
const radius = 5;
const sweepFrames = 120;
const sweepPadding = 48;

export function DamScheduleTimeline({ snapshot, width, frame }: { snapshot: DamStorySnapshot; width: number; frame: number }) {
  const id = useId();
  const { hours, hourlyMw, capacityMw } = snapshot;
  const barWidth = (width - gap * (hours.length - 1)) / hours.length;
  const reference = capacityMw === null ? null : { schedulingCapacityMw: capacityMw };
  const bars = hours.map((active, index) => {
    const megawatts = hourlyMw[index];
    const fraction = scheduledBar(megawatts, reference)?.fraction ?? 0.12;
    const barHeight = active ? Math.max(baseline, height * fraction) : baseline;
    const shape = { x: index * (barWidth + gap), y: height - barHeight, width: barWidth, height: barHeight, rx: radius };
    const fill = active ? colors.primary[500] : megawatts > 0 ? colors.neutral[500] : colors.neutral[300];
    return { index, active, shape, fill };
  });
  const activeBars = bars.filter(bar => bar.active);
  const start = activeBars[0]?.shape.x ?? 0;
  const end = (activeBars.at(-1)?.shape.x ?? 0) + barWidth;
  const progress = (loopFrame(frame) % sweepFrames) / sweepFrames;
  const shineX = start - sweepPadding + progress * (end - start + 2 * sweepPadding);

  return <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} style={{ display: 'block' }} aria-hidden="true">
    {bars.map(({ index, shape, fill }) => <rect data-dam-hour={index} key={index} {...shape} fill={fill} />)}
    {activeBars.length > 0 && <>
      <defs>
        <clipPath id={id}>
          {activeBars.map(({ index, shape }) => <rect key={index} {...shape} />)}
        </clipPath>
      </defs>
      <path clipPath={`url(#${id})`} d={`M${shineX} -10 L${shineX - 22} ${height + 10}`} stroke="white" strokeWidth="22" opacity="0.24" />
    </>}
  </svg>;
}
