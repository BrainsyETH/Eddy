// eddy-ios/src/components/lake/LakeLevelChart.tsx
// The lake's week as one line, on the same scale the web lake page draws:
// the model is shared (lake-chart.ts), so the two cannot disagree about where
// the conservation pool sits or when it is too far off to draw.
//
// Not interactive. The level, its movement and its age are stated in words on
// the card above; this is the shape of the week, and VoiceOver gets that shape
// as a sentence.

import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Svg, { Line, Path } from 'react-native-svg';
import { lakeChartModel } from '@eddy/conditions/lake-chart';
import { useTheme } from '@/theme/ThemeProvider';
import { fonts, type as t } from '@/theme/typography';

const HEIGHT = 132;
const AXIS_WIDTH = 46;
const PAD_TOP = 8;
const PAD_BOTTOM = 6;

export function LakeLevelChart({ history, conservationFt, now, timeZone, datum }: {
  history: [string, number][];
  conservationFt?: number;
  now: number;
  timeZone: string;
  datum: string;
}) {
  const { colors } = useTheme();
  const [width, setWidth] = useState(0);
  const model = lakeChartModel(history, { conservationFt, now });
  if (!model) return null;

  const plotWidth = Math.max(0, width - AXIS_WIDTH);
  const plotHeight = HEIGHT - PAD_TOP - PAD_BOTTOM;
  const x = (ms: number) => AXIS_WIDTH + ((ms - model.t0) / (model.t1 - model.t0)) * plotWidth;
  const y = (position: number) => PAD_TOP + (1 - position) * plotHeight;
  const yFt = (ft: number) => y((ft - model.minFt) / (model.maxFt - model.minFt));
  const visible = model.points.filter((point) => point.t >= model.t0 && point.t <= model.t1);
  const line = visible.map((point, index) => `${index === 0 ? 'M' : 'L'}${x(point.t).toFixed(1)} ${yFt(point.ft).toFixed(1)}`).join(' ');
  const first = visible[0];
  const last = visible[visible.length - 1];
  const area = first && last ? `${line} L${x(last.t).toFixed(1)} ${HEIGHT - PAD_BOTTOM} L${x(first.t).toFixed(1)} ${HEIGHT - PAD_BOTTOM} Z` : '';
  const weekday = (ms: number) => new Date(ms).toLocaleDateString('en-US', { weekday: 'short', timeZone });
  const summary = first && last
    ? `Last 7 days. From ${first.ft.toFixed(2)} feet on ${weekday(first.t)} to ${last.ft.toFixed(2)} feet now.`
    : 'Last 7 days.';

  return (
    <View accessible accessibilityRole="image" accessibilityLabel={`Lake level chart. ${summary}${model.referenceNote ? ` ${model.referenceNote}.` : ''}`}>
      <Text style={[styles.caption, { color: colors.textSubtle }]}>Last 7 days · ft {datum}</Text>
      <View style={styles.plot} onLayout={(event) => setWidth(event.nativeEvent.layout.width)}>
        {width > 0 && visible.length > 1 ? (
          <Svg width={width} height={HEIGHT}>
            {model.valueTicks.map((tick) => (
              <Line key={tick.value} x1={AXIS_WIDTH} x2={width} y1={y(tick.position)} y2={y(tick.position)} stroke={colors.border} strokeWidth={StyleSheet.hairlineWidth} />
            ))}
            <Path d={area} fill={colors.interactive} opacity={0.12} />
            <Path d={line} stroke={colors.interactive} strokeWidth={2} fill="none" strokeLinejoin="round" strokeLinecap="round" />
            {model.referencePosition !== null ? (
              <Line x1={AXIS_WIDTH} x2={width} y1={y(model.referencePosition)} y2={y(model.referencePosition)} stroke={colors.textMuted} strokeWidth={1} strokeDasharray="4 4" />
            ) : null}
          </Svg>
        ) : null}
        {width > 0 ? model.valueTicks.map((tick) => (
          <Text key={tick.value} style={[styles.tick, { color: colors.textSubtle, top: y(tick.position) - 8 }]}>
            {tick.value.toFixed(model.maxFt - model.minFt < 3 ? 1 : 0)}
          </Text>
        )) : null}
      </View>
      <View style={styles.timeRow}>
        {model.timeTicks.map((tick) => (
          <Text key={tick.value} style={[styles.time, { color: colors.textSubtle }]}>{weekday(tick.value)}</Text>
        ))}
      </View>
      {model.referencePosition !== null && conservationFt !== undefined ? (
        <Text style={[styles.caption, { color: colors.textSubtle }]}>Dashed line: conservation pool {conservationFt.toFixed(0)} ft</Text>
      ) : model.referenceNote ? (
        <Text style={[styles.caption, { color: colors.textSubtle }]}>{model.referenceNote}.</Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  caption: { ...t.xs },
  plot: { height: HEIGHT, marginTop: 4 },
  tick: { ...t.xs, position: 'absolute', left: 0, width: AXIS_WIDTH - 6, textAlign: 'right', fontFamily: fonts.mono, fontVariant: ['tabular-nums'] },
  // The model's time ticks are evenly spaced across the window, so the row
  // spreads them edge to edge without redoing the scale.
  timeRow: { flexDirection: 'row', justifyContent: 'space-between', marginLeft: AXIS_WIDTH },
  time: { ...t.xs },
});
