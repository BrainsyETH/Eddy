import { useState } from 'react';
import { Text, View } from 'react-native';
import type { AccessPointGaugeStatus, MapGauge } from '@eddy/types';
import { gaugeFreshness } from '@eddy/conditions/gauge-freshness';
import { conditionLabel } from '@/theme/conditions';
import { GaugePicker } from '../GaugePicker';
import { gaugesForRiver, gaugeConditionCode } from '@/lib/gaugeCondition';
import { useTheme } from '@/theme/ThemeProvider';
import { fonts, type as t } from '@/theme/typography';
import { AccessGaugeReading } from './sections';

export function AccessGaugeSelector({ status, gauges, riverSlug, onOpenGauge, gaugeCount, pending, unavailableLabel }: {
  status: AccessPointGaugeStatus | null;
  gaugeCount: number;
  pending: boolean;
  unavailableLabel: string;
  gauges: MapGauge[];
  riverSlug: string;
  onOpenGauge: (siteId: string) => void;
}) {
  const { colors } = useTheme();
  const [pickedId, setPickedId] = useState<string | null>(null);
  const choices = gaugesForRiver(gauges, riverSlug);
  const picked = choices.find(gauge => gauge.id === pickedId);
  const code = picked ? gaugeFreshness(picked.readingTimestamp) === 'live'
    ? gaugeConditionCode(picked, riverSlug) : 'unknown' : status?.level ?? 'unknown';
  const shown = picked && picked.usgsSiteId ? {
    ...status, gaugeId: picked.id, gaugeName: picked.name, usgsId: picked.usgsSiteId,
    provider: picked.provider ?? 'usgs', cfs: picked.dischargeCfs, heightFt: picked.gaugeHeightFt,
    level: code, label: conditionLabel(code), lastUpdated: picked.readingTimestamp, trend: null,
  } : status;
  return <View>
    {gaugeCount > 1 ? shown && choices.length > 1 && choices.some(gauge => gauge.id === shown.gaugeId) ? (
      <GaugePicker gauges={choices} riverSlug={riverSlug} selectedId={shown.gaugeId} onSelect={setPickedId} />
    ) : <View style={{ minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 6 }}>
      <Text style={{ ...t.sm, fontFamily: fonts.semibold, color: colors.textMuted }}>Gauge: {pending ? 'Loading…' : 'Unavailable'}</Text>
      <Text style={{ ...t.xs, fontFamily: fonts.body, color: colors.textMuted }}>{gaugeCount} gauges</Text>
    </View> : null}
    <AccessGaugeReading status={shown} onOpenGauge={onOpenGauge} compact pending={pending || !shown} pendingLabel={pending ? undefined : unavailableLabel} />
  </View>;
}
