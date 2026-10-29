import { useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Slider from '@react-native-community/slider';
import { floatDurationLabel } from '@/lib/floatPresentation';
import { useTheme } from '@/theme/ThemeProvider';
import { fonts, type as t } from '@/theme/typography';

/** Preview a touch drag locally; only a committed change invalidates search results. */
export function FloatDurationSlider({
  hours,
  perDay = false,
  onChange,
}: {
  hours: number;
  /** Multi-day trips choose hours on the water each day. */
  perDay?: boolean;
  onChange: (hours: number) => void;
}) {
  const { colors } = useTheme();
  const dragging = useRef(false);
  const [previewHours, setPreviewHours] = useState<number | null>(null);
  const displayedHours = previewHours ?? hours;
  const commit = (value: number) => {
    const next = Math.round(value * 2) / 2;
    setPreviewHours(null);
    if (next !== hours) onChange(next);
  };

  return (
    <View style={styles.group}>
      <Text style={[styles.duration, { color: colors.text }]}>
        About {floatDurationLabel(displayedHours * 60)}{perDay ? ' a day' : ''}
      </Text>
      <Slider
        style={styles.slider}
        minimumValue={0.5}
        maximumValue={12}
        step={0.5}
        value={hours}
        minimumTrackTintColor={colors.interactive}
        maximumTrackTintColor={colors.border}
        accessibilityLabel="Time on the river"
        accessibilityValue={{
          min: 0.5,
          max: 12,
          now: displayedHours,
          text: floatDurationLabel(displayedHours * 60),
        }}
        onSlidingStart={() => {
          dragging.current = true;
        }}
        onValueChange={(value) => {
          if (dragging.current) setPreviewHours(Math.round(value * 2) / 2);
          // VoiceOver adjustments can arrive without touch start/end events.
          else commit(value);
        }}
        onSlidingComplete={(value) => {
          dragging.current = false;
          commit(value);
        }}
      />
      <View style={styles.limits}>
        <Text style={[t.sm, { color: colors.textMuted }]}>30 min</Text>
        <Text style={[t.sm, { color: colors.textMuted }]}>12 hours</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  group: { gap: 8 },
  duration: { ...t['2xl'], fontFamily: fonts.semibold, fontVariant: ['tabular-nums'] },
  slider: { width: '100%', height: 44 },
  limits: { flexDirection: 'row', justifyContent: 'space-between', flexWrap: 'wrap' },
});
