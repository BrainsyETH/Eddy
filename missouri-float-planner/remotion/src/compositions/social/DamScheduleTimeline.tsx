import React, { useId } from 'react';
import { colors } from '../../../../shared/social-brand';
import { loopFrame } from './dam-story-motion';

const height = 48;
const gap = 4;
const radius = 5;
const sweepFrames = 120;
const sweepPadding = 48;

export function DamScheduleTimeline({ hours, width, frame }: { hours: readonly boolean[]; width: number; frame: number }) {
  const id = useId();
  const barWidth = (width - gap * (hours.length - 1)) / hours.length;
  const xForHour = (hour: number) => hour * (barWidth + gap);
  const activeHours = hours.flatMap((active, hour) => active ? [hour] : []);
  const start = xForHour(activeHours[0] ?? 0);
  const end = xForHour(activeHours[activeHours.length - 1] ?? 0) + barWidth;
  const progress = (loopFrame(frame) % sweepFrames) / sweepFrames;
  const shineX = start - sweepPadding + progress * (end - start + 2 * sweepPadding);

  return <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} style={{ display: 'block' }} aria-hidden="true">
    {hours.map((active, hour) => <rect
      data-dam-hour={hour}
      key={hour}
      x={xForHour(hour)} y={0} width={barWidth} height={height} rx={radius}
      fill={active ? colors.accent[500] : colors.secondary[200]}
    />)}
    {activeHours.length > 0 && <>
      <defs>
        <clipPath id={id}>
          {activeHours.map(hour => <rect key={hour} x={xForHour(hour)} y={0} width={barWidth} height={height} rx={radius} />)}
        </clipPath>
      </defs>
      <path clipPath={`url(#${id})`} d={`M${shineX} -10 L${shineX - 22} ${height + 10}`} stroke="white" strokeWidth="22" opacity="0.24" />
    </>}
  </svg>;
}
