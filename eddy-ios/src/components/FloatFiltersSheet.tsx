import { Fragment } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import {
  FLOAT_FILTER_GROUPS,
  floatFilterCount,
  type FloatFilterKey,
  type FloatSearchInput,
} from '@eddy/conditions/float-search';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import { useTheme } from '@/theme/ThemeProvider';
import { sheetControl } from '@/theme/palette';
import { fonts, type as t } from '@/theme/typography';

/** Route filters as a grouped list of switches (Settings-style), the same
 * groups and labels as the website's Filters panel. Changes apply as they
 * are toggled; Done dismisses and Reset restores the defaults. */
export function FloatFiltersSheet({
  input,
  onChange,
  onClose,
}: {
  input: FloatSearchInput;
  onChange: (patch: Partial<FloatSearchInput>) => void;
  onClose: () => void;
}) {
  const { colors } = useTheme();
  const reducedMotion = useReducedMotion();
  const count = floatFilterCount(input);
  const rows = (title: string) => [
    ...(title === 'Access'
      ? [{ key: 'publicOnly' as const, label: 'Public access only', on: input.publicOnly }]
      : []),
    ...FLOAT_FILTER_GROUPS.find((group) => group.title === title)!.filters.map((filter) => ({
      key: filter.key,
      label: filter.label,
      on: Boolean(input.filters?.[filter.key]),
    })),
  ];
  const toggle = (key: FloatFilterKey | 'publicOnly', on: boolean) =>
    key === 'publicOnly'
      ? onChange({ publicOnly: on })
      : onChange({ filters: { ...input.filters, [key]: on } });
  return (
    <Modal
      visible
      presentationStyle="pageSheet"
      animationType={reducedMotion ? 'none' : 'slide'}
      allowSwipeDismissal
      onRequestClose={onClose}
    >
      <SafeAreaProvider>
        <SafeAreaView
          style={[styles.screen, { backgroundColor: colors.sheetGrouped }]}
          accessibilityViewIsModal
          onAccessibilityEscape={onClose}
        >
          <View style={styles.header}>
            <Pressable
              onPress={() => onChange({ filters: undefined, publicOnly: true })}
              disabled={!count}
              accessibilityRole="button"
              accessibilityState={{ disabled: !count }}
              style={styles.reset}
            >
              <Text style={[t.base, { color: count ? colors.interactive : colors.textSubtle }]}>Reset</Text>
            </Pressable>
            <Text accessibilityRole="header" style={[styles.title, { color: colors.text }]}>
              Filters
            </Text>
            <Pressable
              onPress={onClose}
              accessibilityRole="button"
              accessibilityLabel="Done, close filters"
              style={[styles.done, sheetControl(colors)]}
            >
              <Text style={[t.sm, { color: colors.interactive, fontFamily: fonts.semibold }]}>Done</Text>
            </Pressable>
          </View>
          <ScrollView contentContainerStyle={styles.body}>
            {FLOAT_FILTER_GROUPS.map((group) => (
              <View key={group.title} style={styles.section}>
                <Text accessibilityRole="header" style={[styles.sectionTitle, { color: colors.textMuted }]}>
                  {group.title.toUpperCase()}
                </Text>
                <View style={[styles.group, { backgroundColor: colors.card }]}>
                  {rows(group.title).map((row, index) => (
                    <Fragment key={row.key}>
                      {index ? <View style={[styles.divider, { backgroundColor: colors.border }]} /> : null}
                      <View style={styles.row}>
                        <Text style={[t.base, styles.label, { color: colors.text }]}>{row.label}</Text>
                        <Switch
                          accessibilityLabel={row.label}
                          value={row.on}
                          onValueChange={(on) => toggle(row.key, on)}
                        />
                      </View>
                    </Fragment>
                  ))}
                </View>
              </View>
            ))}
          </ScrollView>
        </SafeAreaView>
      </SafeAreaProvider>
    </Modal>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, gap: 12 },
  reset: { minHeight: 44, minWidth: 64, justifyContent: 'center' },
  title: { ...t.lg, fontFamily: fonts.heading, flex: 1, textAlign: 'center' },
  done: { minHeight: 44, minWidth: 64, paddingHorizontal: 16, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  body: { paddingHorizontal: 16, paddingBottom: 32, gap: 24 },
  section: { gap: 8 },
  sectionTitle: { ...t.xs, fontFamily: fonts.semibold, letterSpacing: 0.6, paddingHorizontal: 16 },
  group: { borderRadius: 14, overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 50, paddingHorizontal: 16, paddingVertical: 8 },
  label: { flex: 1 },
  divider: { height: StyleSheet.hairlineWidth, marginLeft: 16 },
});
