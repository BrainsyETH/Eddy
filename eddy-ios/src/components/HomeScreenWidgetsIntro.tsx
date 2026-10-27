// In-app discovery for the Home Screen widgets. This is a guide, not a fake
// "Add widget" action: only iOS can display the widget gallery.
// Keep it available to signed-out users and independent of alert permissions.

import { useEffect, useState } from 'react';
import { requireOptionalNativeModule } from 'expo';
import { Image, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { ControlIcon } from '@/components/ControlIcon';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import {
  hasSeenWidgetGuide,
  markWidgetGuideSeen,
  WIDGET_GUIDE,
  widgetGuideSteps,
  type WidgetGuideKind,
} from '@/lib/widgetOnboarding';
import { useTheme } from '@/theme/ThemeProvider';
import { sheetControl } from '@/theme/palette';
import { fonts, textStyles, type as t } from '@/theme/typography';

// Do not promote widgets to users whose installed native binary predates the
// WidgetKit extension. An OTA can carry this screen, not the extension.
// Match ConditionsWidgetSync's optional bridge checks; never require the module.
const nativeWidgetLayoutVersion = (() => {
  if (Platform.OS !== 'ios') return 0;
  try {
    const bridge = requireOptionalNativeModule<{
      widgetLayoutVersion?: () => number;
      readWidgetConfiguration?: () => Promise<string | null>;
      setWidgetConfiguration?: (json: string) => Promise<void>;
    }>('EddyLiveActivity');
    return bridge?.readWidgetConfiguration && bridge?.setWidgetConfiguration ? (bridge.widgetLayoutVersion?.() ?? 1) : 0;
  } catch {
    return 0;
  }
})();
const nativeWidgetsAvailable = nativeWidgetLayoutVersion > 0;

export function HomeScreenWidgetsIntro() {
  const { colors } = useTheme();
  const [seen, setSeen] = useState<boolean | null>(null);
  const [guideOpen, setGuideOpen] = useState(false);

  useEffect(() => {
    if (!nativeWidgetsAvailable) return;
    let active = true;
    void hasSeenWidgetGuide().then((value) => {
      if (active) setSeen(value);
    });
    return () => { active = false; };
  }, []);

  if (!nativeWidgetsAvailable || seen === null) return null;

  const acknowledge = () => {
    setSeen(true);
    // A read/write failure doesn't stop the user from seeing the guide.
    void markWidgetGuideSeen().catch(() => {});
  };
  const open = () => {
    acknowledge();
    setGuideOpen(true);
  };
  const close = () => setGuideOpen(false);

  return (
    <View>
      {seen ? (
        <Pressable
          onPress={open}
          accessibilityRole="button"
          accessibilityLabel="River Widgets. Set up a river level widget."
          style={({ pressed }) => [
            styles.compactRow,
            { borderBottomColor: colors.border, opacity: pressed ? 0.7 : 1 },
          ]}
        >
          <ControlIcon name="grid-outline" size={20} color={colors.interactive} />
          <View style={styles.compactCopy}>
            <Text style={[styles.compactTitle, { color: colors.text }]}>River widgets</Text>
          </View>
          <ControlIcon name="chevron-forward" size={17} color={colors.textMuted} />
        </Pressable>
      ) : (
        <View style={[styles.invitation, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={styles.invitationRow}>
            <View style={[styles.invitationIcon, { backgroundColor: colors.selectionBg }]}>
              <ControlIcon name="grid-outline" size={24} color={colors.interactive} />
            </View>
            <View style={styles.invitationCopy}>
              <Text style={[styles.invitationTitle, { color: colors.text }]}>
                River widgets
              </Text>
            </View>
            <Pressable
              onPress={acknowledge}
              accessibilityRole="button"
              accessibilityLabel="Dismiss widget introduction"
              style={styles.dismiss}
            >
              <ControlIcon name="close" size={18} color={colors.textMuted} />
            </Pressable>
          </View>
          <Pressable
            onPress={open}
            accessibilityRole="button"
            accessibilityLabel="Learn how to add Eddy widgets"
            style={styles.learn}
          >
            <Text style={[styles.learnText, { color: colors.interactive }]}>Set up widgets</Text>
            <ControlIcon name="chevron-forward" size={16} color={colors.interactive} />
          </Pressable>
        </View>
      )}

      {guideOpen ? <WidgetSetupGuide onClose={close} /> : null}
    </View>
  );
}

function WidgetSetupGuide({ onClose }: { onClose: () => void }) {
  const { colors } = useTheme();
  const reducedMotion = useReducedMotion();
  const [kind, setKind] = useState<WidgetGuideKind>('river');
  const kinds: WidgetGuideKind[] = nativeWidgetLayoutVersion >= 4 ? ['river', 'lock', 'favorites', 'dam', 'report']
    : nativeWidgetLayoutVersion >= 2 ? ['river', 'favorites', 'dam', 'report'] : ['river', 'favorites'];

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
          edges={['top', 'bottom']}
          style={[styles.sheet, { backgroundColor: colors.sheetGrouped }]}
          accessibilityViewIsModal
          onAccessibilityEscape={onClose}
        >
          <View style={[styles.sheetHeader, { borderBottomColor: colors.border }]}>
            <Text accessibilityRole="header" style={[styles.sheetTitle, { color: colors.text }]}>
              Widgets
            </Text>
            <Pressable
              onPress={onClose}
              accessibilityRole="button"
              accessibilityLabel="Close widget setup guide"
              style={[styles.done, sheetControl(colors)]}
            >
              <Text style={[styles.doneText, { color: colors.interactive }]}>Done</Text>
            </Pressable>
          </View>
          <ScrollView contentContainerStyle={styles.sheetContent}>
            <View style={styles.choiceRow}>
              {kinds.map((variant) => {
                const item = WIDGET_GUIDE[variant];
                const selected = kind === variant;
                return (
                  <Pressable
                    key={variant}
                    onPress={() => setKind(variant)}
                    accessibilityRole="button"
                    accessibilityState={{ selected }}
                    accessibilityLabel={item.title + ', ' + item.size + ' widget'}
                    style={({ pressed }) => [
                      styles.choice,
                      {
                        backgroundColor: selected ? colors.selectionBg : colors.card,
                        borderColor: selected ? colors.interactive : colors.border,
                        opacity: pressed ? 0.8 : 1,
                      },
                    ]}
                  >
                    <Text style={[styles.choiceSize, { color: selected ? colors.selectionText : colors.textMuted }]}>
                      {item.size.toUpperCase()}
                    </Text>
                    <Text style={[styles.choiceName, { color: colors.text }]}>{item.title}</Text>
                  </Pressable>
                );
              })}
            </View>

            <WidgetIllustration kind={kind} />

            <Text accessibilityRole="header" style={[styles.stepsHeading, { color: colors.text }]}>
              How to add it
            </Text>
            {widgetGuideSteps(kind, nativeWidgetLayoutVersion).map((step, index) => (
              <View key={step} style={styles.stepRow}>
                <View style={[styles.stepNumber, { backgroundColor: colors.selectionBg }]}>
                  <Text style={[styles.stepNumberText, { color: colors.selectionText }]}>
                    {index + 1}
                  </Text>
                </View>
                <Text style={[styles.stepText, { color: colors.text }]}>{step}</Text>
              </View>
            ))}
          </ScrollView>
        </SafeAreaView>
      </SafeAreaProvider>
    </Modal>
  );
}

function WidgetIllustration({ kind }: { kind: WidgetGuideKind }) {
  const { colors } = useTheme();
  const isSmall = kind === 'river';
  const visual = nativeWidgetLayoutVersion >= 3;

  if (kind === 'lock') return <View accessible accessibilityLabel="Example Lock Screen gauge: Current River, 1,240 cfs, rising, observed 15 minutes ago. Sample data."
    style={[styles.previewStage, { backgroundColor: colors.selectionBg }]}>
    <View style={{ gap: 3 }}>
      <Text style={[t.sm, { color: colors.text, fontFamily: fonts.heading }]}>Current River</Text>
      <Text style={[t.xl, { color: colors.text, fontFamily: fonts.heading }]}>1,240 cfs ↑</Text>
      <Text style={[t.xs, { color: colors.textMuted }]}>15 min ago</Text>
    </View>
    <Text style={[styles.previewCaption, { color: colors.textMuted }]}>Sample data</Text>
  </View>;

  return (
    <View style={[styles.previewStage, { backgroundColor: colors.selectionBg }]}>
      <View
        accessible
        accessibilityLabel={isSmall
          ? 'Illustrative small River level widget, sample river reading, not live data'
          : 'Illustrative ' + WIDGET_GUIDE[kind].title + ' widget, sample data, not live data'}
        style={[
          styles.previewWidget,
          isSmall ? styles.previewSmall : styles.previewMedium,
          { backgroundColor: colors.cardRaised, borderColor: colors.border },
        ]}
      >
        <View style={styles.previewHeader}>
          <Text style={[styles.previewHeading, { color: colors.text }]}>
            {isSmall ? 'Current River' : visual && kind === 'dam' ? 'Bull Shoals Dam' : WIDGET_GUIDE[kind].title}
          </Text>
          <Image
            source={visual && kind === 'dam' ? require('../../assets/eddy/eddy-dam.png')
              : visual && kind === 'report' ? require('../../assets/eddy/eddy-river.png')
                : require('../../assets/eddy/eddy-checking-gauge.png')}
            style={styles.previewOtter}
            accessible={false}
          />
        </View>
        {isSmall ? (
          <>
            <Text style={[t.xs, { color: colors.textMuted }]}>Akers, MO</Text>
            <Text style={[styles.previewNumber, visual && styles.previewHero, { color: colors.text }]}>123 <Text style={t.xs}>CFS</Text></Text>
          </>
        ) : visual && kind === 'dam' ? (
          <View style={styles.previewVisualRow}>
            <View style={styles.previewMetric}>
              <Text style={[t.xs, { color: colors.textMuted }]}>Turbine flow</Text>
              <Text style={[styles.previewNumber, { color: colors.text }]}>6,600</Text>
              <Text style={[t.xs, { color: colors.textMuted }]}>CFS · Generating</Text>
            </View>
            <View style={styles.previewChart}>
              <Text style={[t.xs, { color: colors.textMuted }]}>Today · CT · MW</Text>
              <View style={styles.previewBars}>
                {Array.from({ length: 24 }, (_, hour) => (
                  <View key={hour} style={{ flex: 1, height: hour >= 7 && hour < 18 ? (hour >= 13 ? 34 : 18) : 3,
                    backgroundColor: hour >= 7 && hour < 18 ? colors.accentFill : colors.border, borderRadius: 2 }} />
                ))}
              </View>
              <View style={styles.previewAxis}>
                {['12a', '6a', '12p', '6p', '12a'].map((label, index) => <Text key={index} style={[t.xs, { color: colors.textMuted }]}>{label}</Text>)}
              </View>
            </View>
          </View>
        ) : visual && kind === 'report' ? (
          <View style={styles.previewVisualRow}>
            <View style={styles.previewMetric}>
              <Text style={[styles.previewHeading, { color: colors.text }]}>Current River</Text>
              <Text style={[styles.previewNumber, { color: colors.text }]}>250 <Text style={t.xs}>CFS</Text></Text>
              <Text style={[t.xs, { color: colors.textMuted }]}>Akers, MO</Text>
            </View>
            <View style={[styles.previewWeather, { backgroundColor: colors.selectionBg }]}>
              <Text style={[t.xs, { color: colors.textMuted }]}>Forecast · °F</Text>
              <View style={styles.previewAxis}>
                <ControlIcon name="partly-sunny-outline" size={24} color={colors.text} />
                <Text style={[styles.previewNumber, { color: colors.text }]}>74°</Text>
              </View>
              <View style={styles.previewAxis}>
                <Text style={[t.xs, { color: colors.textMuted }]}>↓51°</Text>
                <ControlIcon name="water" size={12} color={colors.textMuted} />
                <Text style={[t.xs, { color: colors.textMuted }]}>20%</Text>
              </View>
            </View>
          </View>
        ) : (
          <>
            {(kind === 'dam' ? [
              ['Bull Shoals Dam', '6,600 cfs'],
              ['Turbine flow', 'Generating now'],
              ['Next scheduled change · CT', 'Stops at 6 PM'],
            ] : kind === 'report' ? [
              ['Current River', '250 cfs'],
              ['Observed trend', 'Steady'],
              ['Today’s forecast', '74° / 51°F'],
            ] : [
              ['Current River', '123 cfs'],
              ['Big River', '456 cfs'],
              ['Huzzah Creek', '789 cfs'],
            ]).map(([name, reading]) => (
              <View key={name} style={styles.previewReading}>
                <Text style={[styles.previewReadingText, { color: colors.text }]}>{name}</Text>
                <Text style={[styles.previewReadingText, { color: colors.textMuted }]}>{reading}</Text>
              </View>
            ))}
          </>
        )}
      </View>
      <Text style={[styles.previewCaption, { color: colors.textMuted }]}>
        Sample data
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  invitation: {
    borderRadius: 18, borderWidth: 1, marginHorizontal: 16, marginBottom: 12,
    paddingLeft: 14, paddingRight: 6, paddingTop: 12, paddingBottom: 4,
  },
  invitationRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  invitationIcon: {
    width: 44, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center',
  },
  invitationCopy: { flex: 1, minWidth: 0, paddingTop: 1 },
  invitationTitle: { ...t.sm, fontFamily: fonts.semibold },
  dismiss: { width: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  learn: {
    minHeight: 44, marginLeft: 54, paddingRight: 10,
    flexDirection: 'row', gap: 4, alignItems: 'center',
  },
  learnText: { ...t.sm, fontFamily: fonts.semibold },
  compactRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    minHeight: 60, paddingVertical: 8, marginHorizontal: 16, marginBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  compactCopy: { flex: 1, gap: 2 },
  compactTitle: { ...t.sm, fontFamily: fonts.semibold },
  sheet: { flex: 1 },
  sheetHeader: {
    paddingLeft: 20, paddingRight: 12, paddingVertical: 12,
    flexDirection: 'row', alignItems: 'center', gap: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  sheetTitle: { ...textStyles.sectionTitle, flex: 1 },
  done: { minHeight: 44, paddingHorizontal: 16, borderRadius: 22, justifyContent: 'center' },
  doneText: { ...t.sm, fontFamily: fonts.semibold },
  sheetContent: { paddingHorizontal: 20, paddingTop: 18, paddingBottom: 40 },
  choiceRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  choice: { flexBasis: 135, flexGrow: 1, minHeight: 56, borderRadius: 14, borderWidth: 1.5, padding: 10, justifyContent: 'center', gap: 3 },
  choiceSize: { ...t.xs, fontFamily: fonts.semibold },
  choiceName: { ...t.sm, fontFamily: fonts.semibold },
  previewStage: { borderRadius: 20, padding: 16, marginTop: 14, alignItems: 'center' },
  previewWidget: { borderRadius: 19, padding: 13, borderWidth: 1, justifyContent: 'space-between' },
  previewSmall: { width: 168, maxWidth: '100%', minHeight: 142 },
  previewMedium: { width: 306, maxWidth: '100%', minHeight: 145 },
  previewHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 },
  previewHeading: { ...t.sm, fontFamily: fonts.semibold, flexShrink: 1 },
  previewOtter: { width: 26, height: 26 },
  previewNumber: { ...t['2xl'], fontFamily: fonts.semibold },
  previewHero: { ...t['3xl'], fontFamily: fonts.monoMedium },
  previewVisualRow: { flexDirection: 'row', gap: 12, alignItems: 'flex-start', marginTop: 8 },
  previewMetric: { flex: 1, gap: 3 },
  previewChart: { flex: 1.4, gap: 4 },
  previewBars: { flexDirection: 'row', alignItems: 'flex-end', height: 40, gap: 2 },
  previewAxis: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 2 },
  previewWeather: { flex: 1, borderRadius: 12, padding: 8, gap: 3 },
  previewReading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  previewReadingText: { ...t.xs, fontFamily: fonts.medium, flexShrink: 1 },
  previewCaption: { ...t.xs, marginTop: 10, textAlign: 'center' },
  stepsHeading: { ...textStyles.sectionTitle, marginTop: 20, marginBottom: 12 },
  stepRow: { flexDirection: 'row', gap: 12, marginBottom: 12 },
  stepNumber: { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  stepNumberText: { ...t.sm, fontFamily: fonts.semibold },
  stepText: { ...t.sm, flex: 1, paddingTop: 4 },
});
