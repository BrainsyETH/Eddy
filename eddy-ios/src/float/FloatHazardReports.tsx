// eddy-ios/src/float/FloatHazardReports.tsx
// Report a hazard from River Mode, and what became of the ones you reported
// on this river: waiting on the phone, sent for review, or not accepted (with
// the server's reason). Kept small on purpose: this is a float screen, not a
// hazard dashboard (#1448).

import { useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { ControlIcon } from '@/components/ControlIcon';
import type { FloatSession } from '@/lib/floatSession';
import { HAZARD_KINDS, type HazardReport } from '@/lib/hazardReportQueue';
import { useTheme } from '@/theme/ThemeProvider';
import { fonts, type as t } from '@/theme/typography';
import { HazardReportSheet } from './HazardReportSheet';
import { HazardReportFeedback } from './HazardReportFeedback';
import { EddySymbol } from '@/components/EddySymbol';
import { removeHazardReport, retryHazardReport, useHazardReports } from './hazardReports';

function statusLine(report: HazardReport): string {
  switch (report.status) {
    case 'waiting':
      // "Sending…" would claim a send in progress that may not be: a fresh
      // report after a relaunch, or one in its cooldown, is simply waiting.
      return report.attempts === 0 ? 'Saved on your phone · sending when you have signal' : 'Saved on your phone · sends when you have signal';
    case 'sent':
      return 'Sent for review';
    case 'refused':
      return `Not accepted: ${report.refusal ?? 'the report was refused'}`;
    case 'failed':
      return 'Couldn’t send. Eddy stopped trying; tap Retry when you have signal.';
  }
}

export function FloatHazardReports({ session }: { session: FloatSession }) {
  const { colors } = useTheme();
  const [open, setOpen] = useState(false);
  const [reportedId, setReportedId] = useState<string | null>(null);
  const reports = useHazardReports().filter((report) => report.riverSlug === session.route.riverSlug).slice(0, 5);
  const remove = (report: HazardReport) => {
    const label = HAZARD_KINDS.find((k) => k.id === report.kind)?.label ?? 'this report';
    Alert.alert(
      report.status === 'sent' ? 'Remove from this list?' : 'Withdraw this report?',
      report.status === 'sent'
        ? `${label} has already been sent for review; this only removes it here.`
        : `${label} hasn’t been sent. Withdrawing it means it never will be.`,
      [
        { text: 'Keep', style: 'cancel' },
        { text: report.status === 'sent' ? 'Remove' : 'Withdraw', style: 'destructive', onPress: () => {
          void removeHazardReport(report.id).catch(() => Alert.alert('Could not remove', 'Please try again.'));
        } },
      ],
    );
  };

  return (
    <View style={[styles.section, { borderColor: colors.border }]}>
      <Pressable
        onPress={() => setOpen(true)}
        style={({ pressed }) => [styles.button, { borderColor: colors.border, opacity: pressed ? 0.6 : 1 }]}
        accessibilityRole="button"
      >
        <EddySymbol name="hazard" size={26} />
        <Text style={[styles.buttonText, { color: colors.interactive }]}>Report a hazard here</Text>
      </Pressable>

      {reportedId ? <HazardReportFeedback reportId={reportedId} onDismiss={() => setReportedId(null)} /> : null}

      {reports.map((report) => (
        <View key={report.id} style={styles.report}>
          <View style={styles.reportText} accessible accessibilityLabel={`${HAZARD_KINDS.find((k) => k.id === report.kind)?.label}. ${statusLine(report)}`}>
            <Text style={[styles.reportTitle, { color: colors.text }]}>
              {HAZARD_KINDS.find((k) => k.id === report.kind)?.label}
              {report.riverMile != null ? ` · mile ${report.riverMile.toFixed(1)}` : ''}
            </Text>
            <Text style={[styles.note, { color: report.status === 'refused' || report.status === 'failed' ? colors.error : colors.textMuted }]}>{statusLine(report)}</Text>
          </View>
          {report.status === 'failed' ? (
            <Pressable onPress={() => void retryHazardReport(report.id)} accessibilityRole="button" accessibilityLabel="Retry sending this report" style={styles.rowAction}>
              <Text style={[styles.note, { color: colors.interactive, fontFamily: fonts.semibold }]}>Retry</Text>
            </Pressable>
          ) : null}
          <Pressable onPress={() => remove(report)} accessibilityRole="button"
            accessibilityLabel={report.status === 'sent' ? 'Remove this report from the list' : 'Withdraw this report'} style={styles.rowAction}>
            <ControlIcon name="close" size={18} color={colors.textSubtle} />
          </Pressable>
        </View>
      ))}

      {open ? <HazardReportSheet onClose={(id) => { setOpen(false); if (id) setReportedId(id); }} session={session} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  section: { gap: 8, paddingTop: 10, borderTopWidth: StyleSheet.hairlineWidth },
  button: { minHeight: 48, borderRadius: 12, borderWidth: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  buttonText: { ...t.base, fontFamily: fonts.semibold },
  report: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 44 },
  reportText: { flex: 1, paddingVertical: 2 },
  rowAction: { minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  reportTitle: { ...t.sm, fontFamily: fonts.semibold },
  note: { ...t.sm, fontFamily: fonts.body },
});
