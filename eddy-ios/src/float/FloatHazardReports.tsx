// eddy-ios/src/float/FloatHazardReports.tsx
// Report a hazard from Float Mode, and what became of the ones you reported
// on this river: waiting on the phone, sent for review, or not accepted (with
// the server's reason). Kept small on purpose: this is a float screen, not a
// hazard dashboard (#1448).

import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { ControlIcon } from '@/components/ControlIcon';
import type { FloatSession } from '@/lib/floatSession';
import { HAZARD_KINDS, type HazardReport } from '@/lib/hazardReportQueue';
import { useTheme } from '@/theme/ThemeProvider';
import { fonts, type as t } from '@/theme/typography';
import { HazardReportSheet } from './HazardReportSheet';
import { useHazardReports } from './hazardReports';

function statusLine(report: HazardReport): string {
  switch (report.status) {
    case 'waiting':
      return report.attempts === 0 ? 'Sending…' : 'Saved on your phone · sends when you have signal';
    case 'sent':
      return 'Sent for review';
    case 'refused':
      return `Not accepted: ${report.refusal ?? 'the report was refused'}`;
  }
}

export function FloatHazardReports({ session }: { session: FloatSession }) {
  const { colors } = useTheme();
  const [open, setOpen] = useState(false);
  const reports = useHazardReports().filter((report) => report.riverSlug === session.route.riverSlug).slice(0, 5);

  return (
    <View style={[styles.section, { borderColor: colors.border }]}>
      <Pressable
        onPress={() => setOpen(true)}
        style={({ pressed }) => [styles.button, { borderColor: colors.border, opacity: pressed ? 0.6 : 1 }]}
        accessibilityRole="button"
      >
        <ControlIcon name="warning-outline" size={18} color={colors.interactive} />
        <Text style={[styles.buttonText, { color: colors.interactive }]}>Report a hazard here</Text>
      </Pressable>

      {reports.map((report) => (
        <View key={report.id} style={styles.report} accessible accessibilityLabel={`${HAZARD_KINDS.find((k) => k.id === report.kind)?.label}. ${statusLine(report)}`}>
          <Text style={[styles.reportTitle, { color: colors.text }]}>
            {HAZARD_KINDS.find((k) => k.id === report.kind)?.label}
            {report.riverMile != null ? ` · mile ${report.riverMile.toFixed(1)}` : ''}
          </Text>
          <Text style={[styles.note, { color: report.status === 'refused' ? colors.error : colors.textMuted }]}>{statusLine(report)}</Text>
        </View>
      ))}

      {open ? <HazardReportSheet onClose={() => setOpen(false)} session={session} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  section: { gap: 8, paddingTop: 10, borderTopWidth: StyleSheet.hairlineWidth },
  button: { minHeight: 48, borderRadius: 12, borderWidth: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  buttonText: { ...t.base, fontFamily: fonts.semibold },
  report: { paddingVertical: 2 },
  reportTitle: { ...t.sm, fontFamily: fonts.semibold },
  note: { ...t.sm, fontFamily: fonts.body },
});
