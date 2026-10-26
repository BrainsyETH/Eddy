// Shared river and endpoint controls for Build a Route and the map planner.
import { Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import type { FloatPlanState } from '@/hooks/useFloatPlan';
import { useTheme } from '@/theme/ThemeProvider';
import { fonts, type as t } from '@/theme/typography';
import { ControlIcon } from './ControlIcon';
import { EddySymbol, type EddySymbolName } from './EddySymbol';

export function PlanRouteFields({
  state,
  riverName,
  onChooseRiver,
  onChooseStep,
  stacked,
  style,
}: {
  state: Pick<FloatPlanState, 'step' | 'putIn' | 'takeOut'>;
  riverName: string;
  onChooseRiver: () => void;
  onChooseStep: (step: 'put-in' | 'take-out') => void;
  stacked: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const { colors } = useTheme();
  /**
   * Each step wears Eddy's own mark for the thing it is asking about.
   *
   * A river is Eddy's river; both ends of the float are Eddy's access-point
   * mark, and they are deliberately THE SAME mark — a put-in and a take-out are
   * one kind of place, and inventing two drawings would claim a distinction the
   * data does not make. What separates them is the crumb's own text, which is
   * either the step's name or the place chosen for it.
   */
  const crumbs: {
    step: 'river' | 'put-in' | 'take-out';
    label: string;
    symbol: EddySymbolName;
    value?: string;
  }[] = [
    { step: 'river', label: 'River', symbol: 'river', value: riverName },
    { step: 'put-in', label: 'Put-in', symbol: 'accessPoint', value: state.putIn?.name },
    { step: 'take-out', label: 'Take-out', symbol: 'accessPoint', value: state.takeOut?.name },
  ];

  return (
    <View style={[styles.fields, stacked && styles.stacked, style]}>
      {crumbs.map((crumb, index) => {
        const current = crumb.step !== 'river' && state.step === crumb.step;
        // A step is reachable once the one before it has an answer. Nothing
        // below can be tapped into out of order, so the machine cannot be put
        // into a state where a take-out exists without a put-in.
        const reachable = index < 2 || Boolean(crumbs[index - 1].value);
        // Answered AND not the step being edited. A crumb you are standing in
        // is not done, however much data it holds.
        const done = Boolean(crumb.value) && !current;
        const ink = current
          ? colors.interactive
          : reachable
            ? colors.text
            : colors.textSubtle;
        return (
          <Pressable
            key={crumb.step}
            disabled={!reachable}
            onPress={() =>
              crumb.step === 'river' ? onChooseRiver() : onChooseStep(crumb.step)
            }
            /* ── A chip, not three columns of grey text ──────────────
               Changing the put-in is the single most common correction anybody
               makes in this flow, and the control for it was three stacked
               12pt labels whose only signal that they could be tapped was a
               colour change — which is to say, no signal at all for anyone not
               comparing two of them side by side, and none whatsoever for
               anyone who cannot distinguish the two greys.

               A bordered chip reads as a control at a glance.

               ── The mark took the checkmark's slot ──────────────────
               A checkmark used to lead an answered crumb, and it cannot share
               the leading position with the symbol: a third of a phone's width
               minus a 15pt mark, a 13pt tick and two gaps leaves about eight
               characters for a place called Meramec State Park. The state is
               still carried without colour — an answered crumb reads the place
               and an unanswered one reads the step, which is a stronger signal
               than a tick was, and its mark is dimmed until it has an answer. */
            style={({ pressed }) => [
              styles.crumb,
              stacked && styles.crumbStacked,
              {
                borderColor: current
                  ? colors.interactive
                  : reachable
                    ? colors.border
                    : 'transparent',
                backgroundColor: current ? colors.selectionBg : 'transparent',
                opacity: pressed && reachable ? 0.6 : 1,
              },
            ]}
            accessibilityRole="button"
            accessibilityLabel={`${crumb.label}${crumb.value ? `: ${crumb.value}` : ', not chosen yet'}`}
            accessibilityHint={reachable ? `Change ${crumb.label.toLowerCase()}` : undefined}
            accessibilityState={{ selected: current, disabled: !reachable }}
          >
            <EddySymbol
              name={crumb.symbol}
              size={15}
              style={{ opacity: done || current ? 1 : 0.45 }}
            />
            <View style={styles.crumbText}>
              <Text style={[styles.crumbLabel, { color: ink }]}>{crumb.label}</Text>
              <Text style={[styles.crumbValue, { color: ink }]} numberOfLines={stacked ? undefined : 2}>
                {crumb.value ?? (crumb.step === 'put-in' ? 'Where you launch' : 'Where you finish')}
              </Text>
            </View>
            {stacked && reachable ? <ControlIcon name="chevron-forward" size={17} color={ink} /> : null}
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  fields: { flexDirection: 'row', gap: 8 },
  stacked: { flexDirection: 'column' },
  crumbStacked: { flex: 0, justifyContent: 'flex-start', paddingHorizontal: 12, gap: 12 },
  crumb: {
    flex: 1,
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingHorizontal: 8,
    paddingVertical: 10,
    minHeight: 60,
    borderRadius: 12,
    borderWidth: 1,
  },
  crumbText: { flex: 1, minWidth: 0, gap: 3 },
  crumbLabel: { ...t.sm, fontFamily: fonts.semibold },
  crumbValue: { ...t.sm, fontFamily: fonts.body },
});
