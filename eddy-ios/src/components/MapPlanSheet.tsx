import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import type { SharedValue } from 'react-native-reanimated';
import type { FloatPlanState } from '@/hooks/useFloatPlan';
import { ControlIcon } from './ControlIcon';
import { PlanRouteFields } from './PlanRouteFields';
import { MapSheet, type SheetMetrics } from './map-sheet/MapSheet';
import { SheetBody } from './map-sheet/SheetPager';
import { CONTENT_BOTTOM_PAD, type Detent } from './map-sheet/sheetGeometry';
import { useTheme } from '@/theme/ThemeProvider';
import { fonts, textStyles, type as t } from '@/theme/typography';

/** The same route controls as Build a Route, with endpoint selection on the map. */
export function MapPlanSheet({ riverName, state, onClose, onChooseRiver, onChooseStep, onOpenList, onOpenPlan, onDetentChange, metrics }: {
  riverName: string;
  state: FloatPlanState;
  onClose: () => void;
  onChooseRiver: () => void;
  onChooseStep: (step: 'put-in' | 'take-out') => void;
  onOpenList: () => void;
  onOpenPlan: () => void;
  onDetentChange: (detent: Detent, height: number) => void;
  metrics: SharedValue<SheetMetrics>;
}) {
  const { colors } = useTheme();
  const { fontScale, height } = useWindowDimensions();
  // Keep the fields scrollable at large text sizes and on short screens.
  const scrollingFields = fontScale > 1.3 || height < 600;
  const [preview, setPreview] = useState<{ key: string; height: number } | null>(null);
  const { putIn, takeOut, plan, calculating, error, step } = state;
  const showingResult = step === 'result' && takeOut != null;
  const title = showingResult ? 'Your float plan' : 'Build a Route';
  const previewKey = `plan:${putIn?.id}:${showingResult ? takeOut.id : 'choose'}`;
  const hasPreviewBody = scrollingFields || showingResult;
  const previewHeight = preview?.key === previewKey ? preview.height : 0;
  const choosingPutIn = step === 'put-in';
  const hasOptions = (choosingPutIn ? state.putInOptions : state.takeOutOptions).length > 0;
  const fields = <View style={styles.fields}>
    <PlanRouteFields state={state} riverName={riverName} onChooseRiver={onChooseRiver}
      onChooseStep={onChooseStep} stacked={fontScale > 1.3} />
    {!showingResult ? <View style={[styles.hintRow, fontScale > 1.3 && styles.stacked]}>
      <Text style={[t.sm, fontScale <= 1.3 && styles.grow, { color: colors.textMuted }]}>
        {choosingPutIn ? 'Tap a put-in on the map.' : hasOptions
          ? 'Tap a downstream take-out on the map.' : 'No take-outs downstream. Change your put-in.'}
      </Text>
      {hasOptions ? <Pressable onPress={onOpenList} accessibilityRole="button"
        accessibilityLabel={`Choose ${choosingPutIn ? 'put-in' : 'take-out'} from list`}
        style={({ pressed }) => [styles.listButton, { opacity: pressed ? 0.6 : 1 }]}>
        <ControlIcon name="list" size={18} color={colors.interactive} />
        <Text style={[t.sm, { fontFamily: fonts.semibold, color: colors.interactive }]}>List</Text>
      </Pressable> : null}
    </View> : null}
  </View>;

  return <MapSheet resetKey={previewKey}
    label={title} onClose={onClose}
    metrics={metrics} onDetentChange={onDetentChange} peekPadding={0}
    previewReady={!hasPreviewBody || previewHeight > 0}
    // The result belongs to the glance too. Measuring only the route fields
    // left the estimate and CTA below the resting edge when loading finished.
    peekExtraHeight={hasPreviewBody ? previewHeight + CONTENT_BOTTOM_PAD : 0}
    peek={<>
      <View style={styles.header}>
        <Text accessibilityRole="header" style={[styles.title, styles.grow, { color: colors.text }]}>{title}</Text>
        <Pressable onPress={onClose} accessibilityRole="button" accessibilityLabel="Close map planner" style={styles.close}>
          <ControlIcon name="close" size={24} color={colors.textMuted} />
        </Pressable>
      </View>
      {!scrollingFields ? fields : null}
    </>}
  >
    <SheetBody>
      <View key={previewKey} collapsable={false}
        onLayout={event => setPreview({ key: previewKey, height: Math.ceil(event.nativeEvent.layout.height) })}>
        {scrollingFields ? fields : null}
        {showingResult ? <View style={styles.body}>
          {calculating ? <View style={styles.row}><ActivityIndicator color={colors.interactive} />
            <Text style={[t.sm, styles.grow, { color: colors.textMuted }]}>Building your plan…</Text></View> : null}
          {error ? <Text accessibilityRole="alert" style={[t.sm, { color: colors.text }]}>{error}</Text> : null}
          {plan && !calculating && !error ? <>
            <Text style={[textStyles.sectionTitle, { color: colors.text }]}>{plan.distance.formatted}</Text>
            <Text style={[t.base, { color: colors.text }]}>{plan.floatTime?.formatted ?? 'Float time unavailable'}</Text>
            {plan.warnings.map(warning => <Text key={warning} style={[t.sm, { color: colors.text }]}>{warning}</Text>)}
            <Pressable onPress={onOpenPlan} accessibilityRole="button"
              style={({ pressed }) => [styles.primaryButton, { backgroundColor: colors.accentFill, opacity: pressed ? 0.7 : 1 }]}>
              <Text style={[t.base, { fontFamily: fonts.semibold, color: colors.onAccent }]}>View full plan</Text>
            </Pressable>
          </> : null}
          {error ? <Pressable onPress={state.retry} accessibilityRole="button" style={styles.listButton}>
            <Text style={[t.base, { color: colors.interactive }]}>Try again</Text>
          </Pressable> : null}
        </View> : null}
      </View>
    </SheetBody>
  </MapSheet>;
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 20, paddingTop: 4, paddingBottom: 10 },
  title: { ...t['2xl'], fontFamily: fonts.display },
  fields: { paddingHorizontal: 20, paddingBottom: 12, gap: 6 },
  body: { paddingHorizontal: 20, paddingTop: 4, gap: 12 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  hintRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  stacked: { flexDirection: 'column', alignItems: 'stretch' },
  grow: { flex: 1, minWidth: 0 },
  close: { minHeight: 44, minWidth: 44, alignItems: 'center', justifyContent: 'center' },
  listButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, minHeight: 44, paddingHorizontal: 8 },
  primaryButton: { alignItems: 'center', justifyContent: 'center', minHeight: 48, padding: 12, borderRadius: 24 },
});
