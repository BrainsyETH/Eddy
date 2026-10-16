import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import type { SharedValue } from 'react-native-reanimated';
import type { FloatPlanState } from '@/hooks/useFloatPlan';
import { ControlIcon } from './ControlIcon';
import { MapSheet, type SheetMetrics } from './map-sheet/MapSheet';
import { SheetBody } from './map-sheet/SheetPager';
import type { Detent } from './map-sheet/sheetGeometry';
import { useTheme } from '@/theme/ThemeProvider';
import { fonts, textStyles, type as t } from '@/theme/typography';

/** Planning stays on the map; the full planner remains available by explicit tap. */
export function MapPlanSheet({ riverName, state, onClose, onOpenList, onOpenPlan, onDetentChange, metrics }: {
  riverName: string;
  state: FloatPlanState;
  onClose: () => void;
  onOpenList: () => void;
  onOpenPlan: () => void;
  onDetentChange: (detent: Detent, height: number) => void;
  metrics: SharedValue<SheetMetrics>;
}) {
  const { colors } = useTheme();
  const { putIn, plan, calculating, error } = state;
  const takeOut = state.step === 'result' ? state.takeOut : null;
  const title = takeOut ? 'Your float plan' : 'Choose your take-out';
  const button = (label: string, action: () => void) => <Pressable onPress={action} accessibilityRole="button"
    style={[styles.button, { backgroundColor: colors.selectionBg }]}>
    <Text style={[t.base, { fontFamily: fonts.semibold, color: colors.interactive }]}>{label}</Text>
    <ControlIcon name="chevron-forward" size={16} color={colors.interactive} />
  </Pressable>;
  return <MapSheet resetKey={`plan:${putIn?.id}:${takeOut?.id ?? 'choose'}`}
    initialDetent={takeOut ? 'half' : 'peek'} label={title} onClose={onClose} metrics={metrics} onDetentChange={onDetentChange}
    peek={<View style={styles.peek}>
      <View style={styles.row}>
        <View style={styles.grow}>
          <Text accessibilityRole="header" style={[textStyles.cardTitle, { color: colors.text }]}>{title}</Text>
          <Text style={[t.sm, { color: colors.textMuted }]}>{riverName}</Text>
        </View>
        <Pressable onPress={onClose} accessibilityRole="button" accessibilityLabel="Close map planner" style={styles.close}>
          <ControlIcon name="close" size={22} color={colors.textMuted} />
        </Pressable>
      </View>
      <Text style={[t.base, { color: colors.text }]}>{putIn?.name}{takeOut ? ` → ${takeOut.name}` : ''}</Text>
      {!takeOut ? <>
        <Text style={[t.sm, { color: colors.textMuted }]}>Tap a downstream access point on the map.</Text>
        {button('Choose from list', onOpenList)}
      </> : null}
    </View>}
  >
    <SheetBody><View style={styles.body}>
      {calculating ? <View style={styles.row}><ActivityIndicator color={colors.interactive} />
        <Text style={[t.sm, { color: colors.textMuted }]}>Building your plan…</Text></View> : null}
      {error ? <Text accessibilityRole="alert" style={[t.sm, { color: colors.text }]}>{error}</Text> : null}
      {takeOut && plan && !calculating && !error ? <>
        <Text style={[textStyles.sectionTitle, { color: colors.text }]}>{plan.distance.formatted}</Text>
        {plan.floatTime ? <Text style={[t.base, { color: colors.text }]}>{plan.floatTime.formatted}</Text>
          : <Text style={[t.sm, { color: colors.textMuted }]}>Float time unavailable</Text>}
        {plan.warnings.map(warning => <Text key={warning} style={[t.sm, { color: colors.text }]}>{warning}</Text>)}
        {button('View full plan', onOpenPlan)}
      </> : null}
      {takeOut && error ? button('Try again', state.retry) : null}
      {takeOut ? button('Change take-out', onOpenList) : null}
      {button('Change put-in', () => { state.goToStep('put-in'); onOpenPlan(); })}
    </View></SheetBody>
  </MapSheet>;
}
const styles = StyleSheet.create({
  peek: { gap: 10 },
  body: { paddingTop: 8, gap: 12 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  grow: { flex: 1 },
  close: { minHeight: 44, minWidth: 44, alignItems: 'center', justifyContent: 'center' },
  button: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, minHeight: 48, padding: 12, borderRadius: 12 },
});
