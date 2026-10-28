import { Pressable, StyleSheet, Text, View } from 'react-native';
import { ControlIcon } from '@/components/ControlIcon';
import { EddySymbol } from '@/components/EddySymbol';
import { useAnnounce } from '@/hooks/useAnnounce';
import { hazardReportFeedback } from '@/lib/hazardReportQueue';
import { useTheme } from '@/theme/ThemeProvider';
import { fonts, type as t } from '@/theme/typography';
import { retryHazardReport, useHazardReports } from './hazardReports';

/** Stays visible until dismissed, and follows saved → received/rejected without claiming delivery early. */
export function HazardReportFeedback({ reportId, onDismiss }: { reportId: string; onDismiss: () => void }) {
  const { colors } = useTheme();
  const report = useHazardReports().find(item => item.id === reportId);
  const feedback = report ? hazardReportFeedback(report) : null;
  useAnnounce(feedback?.message);
  if (!feedback) return null;
  return (
    <View style={[styles.banner, { backgroundColor: colors.cardRaised, borderColor: colors.borderStrong }]}>
      <EddySymbol name="hazard" size={26} />
      <View style={styles.copy}>
        <Text style={[styles.message, { color: feedback.error ? colors.error : colors.text }]}>{feedback.message}</Text>
        {feedback.retry ? <Pressable onPress={() => void retryHazardReport(reportId)} accessibilityRole="button" style={styles.retry}>
          <Text style={[styles.message, { color: colors.interactive, fontFamily: fonts.semibold }]}>Retry</Text>
        </Pressable> : null}
      </View>
      <Pressable onPress={onDismiss} accessibilityRole="button" accessibilityLabel="Dismiss report status" style={styles.dismiss}>
        <ControlIcon name="close" size={18} color={colors.textMuted} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingLeft: 12, paddingVertical: 8, borderWidth: 1, borderRadius: 12 },
  copy: { flex: 1 },
  message: { ...t.sm, fontFamily: fonts.body },
  dismiss: { minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  retry: { minHeight: 44, justifyContent: 'center' },
});
