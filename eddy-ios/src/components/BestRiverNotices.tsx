import { useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import type { RiverAlert } from '@eddy/types';
import { recommendationNoticeSummary } from '@/lib/todayRecommendation';
import { PublicNoticeRow } from './CurrentAlertRows';
import { useTheme } from '@/theme/ThemeProvider';
import { fonts, textStyles, type as t } from '@/theme/typography';

/** A compact doorway to the complete notices, independent of headline length. */
export function BestRiverNotices({ notices, riverName }: { notices: RiverAlert[]; riverName: string }) {
  const { colors } = useTheme();
  const { fontScale } = useWindowDimensions();
  const [open, setOpen] = useState(false);
  const summary = recommendationNoticeSummary(notices);
  if (!summary) return null;
  const close = () => setOpen(false);

  return (
    <>
      <Pressable
        onPress={() => setOpen(true)}
        accessibilityRole="button"
        accessibilityLabel={`${riverName}: ${notices.length} agency ${notices.length === 1 ? 'notice' : 'notices'}. ${summary.notices[0].title}`}
        accessibilityHint="Opens the full notices for this river"
        style={({ pressed }) => [styles.row, { backgroundColor: colors.card, opacity: pressed ? 0.7 : 1 }]}
      >
        <Ionicons name="warning-outline" size={18} color={colors.text} />
        <Text numberOfLines={fontScale >= 1.3 ? undefined : 1} style={[styles.label, { color: colors.text }]}>
          {summary.label}
        </Text>
        {summary.additionalCount > 0 ? (
          <Text style={[styles.count, { color: colors.textMuted }]}>+{summary.additionalCount}</Text>
        ) : null}
        <Ionicons name="chevron-forward" size={16} color={colors.textSubtle} />
      </Pressable>
      <Modal visible={open} animationType="slide" presentationStyle="pageSheet" allowSwipeDismissal onRequestClose={close}>
        <SafeAreaView
          style={[styles.sheet, { backgroundColor: colors.bg }]}
          edges={['top', 'bottom']}
          onAccessibilityEscape={close}
        >
          <View style={styles.header}>
            <View style={styles.heading}>
              <Text accessibilityRole="header" style={[textStyles.sectionTitle, { color: colors.text }]}>Agency notices</Text>
              <Text style={[t.sm, { color: colors.textMuted }]}>{riverName}</Text>
            </View>
            <Pressable onPress={close} accessibilityRole="button" accessibilityLabel="Close agency notices" style={styles.close}>
              <Ionicons name="close" size={24} color={colors.text} />
            </Pressable>
          </View>
          <ScrollView contentContainerStyle={styles.content}>
            {summary.notices.map((notice) => <PublicNoticeRow key={notice.id} alert={notice} showBody />)}
          </ScrollView>
        </SafeAreaView>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  row: { minHeight: 44, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8 },
  label: { ...t.sm, fontFamily: fonts.semibold, flex: 1, minWidth: 0 },
  count: { ...t.xs, fontFamily: fonts.mono },
  sheet: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingLeft: 20, paddingRight: 12, paddingVertical: 12 },
  heading: { flex: 1, gap: 4 },
  close: { minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  content: { paddingTop: 4, paddingBottom: 24 },
});
