import { hasLadder } from '@eddy/conditions/condition-ladder';
import { isReadingStale } from '@eddy/conditions/reading-staleness';
import { ReadingSummaryCard } from '@/components/ReadingSummaryCard';
import { readingAge } from '@/lib/readingCopy';
import { observedStamp } from '@/lib/observedStamp';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import { ControlIcon } from '@/components/ControlIcon';
import { fetchCondition, fetchRiverDetail } from '@/api/client';
import { readConditions, readRiver } from '@/lib/riverCache';
import { observationAgeHours, readingBand, type CachedCondition } from '@/lib/offline-cache';
import { useTheme } from '@/theme/ThemeProvider';
import { essentialsStyles as s } from './essentialsUi';

export function EssentialsConditions({ slug, now }: { slug: string; now: number }) {
  const { colors } = useTheme();
  const [reading, setReading] = useState<CachedCondition | null>(null);
  const [saved, setSaved] = useState(true);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState(false);
  const [reload, setReload] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    const load = async () => {
      setBusy(true); setError(false);
      try {
        const [river, conditions] = await Promise.all([readRiver(slug), readConditions()]);
        if (controller.signal.aborted) return;
        let id = river?.payload.river?.id ?? null;
        const cached = id ? conditions?.payload[id] : null;
        setReading(cached ?? null); setSaved(true);
        if (!id) id = (await fetchRiverDetail(slug, controller.signal)).id;
        if (id) {
          const next = await fetchCondition(id, controller.signal);
          if (!controller.signal.aborted) { setReading(next ? { ...next, cachedAt: new Date().toISOString() } : null); setSaved(false); }
        }
      } catch { if (!controller.signal.aborted) setError(true); }
      finally { if (!controller.signal.aborted) setBusy(false); }
    };
    void load();
    return () => controller.abort();
  }, [slug, reload]);
  const age = reading ? observationAgeHours(reading.readingTimestamp, reading.readingAgeHours, reading.cachedAt, now) : null;
  const band = readingBand(age);
  // Zone named, like the gauge and river screens (observedStamp.ts).
  const stamp = observedStamp(reading?.readingTimestamp);
  const primary = reading?.thresholdUnit === 'ft' ? reading.gaugeHeightFt : reading?.dischargeCfs;
  const unit = reading?.thresholdUnit === 'ft' ? 'ft' : 'cfs';
  const usable = reading && band !== 'expired' && primary != null && Number.isFinite(primary);
  const lastKnown = band !== 'fresh' || isReadingStale(age);
  const rated = reading?.code === 'dangerous' || (reading?.thresholds && hasLadder(reading.thresholds));
  return <View style={{ gap: 8 }}>
    {!reading && busy ? <Text style={[s.note, { color: colors.textMuted }]}>Loading conditions…</Text> : (
      <ReadingSummaryCard
        reading={usable ? { value: primary, unit } : null}
        verdict={rated ? { code: usable ? reading.code : 'unknown', lastKnown } : undefined}
        thresholds={reading?.thresholds}
        readingTimestamp={reading?.readingTimestamp}
        // The visible label only: passing the name as stationName as well
        // printed it a second time in the card's Station row.
        stationLabel={reading?.gaugeName}
        age={band === 'expired' && reading ? 'Reading is out of date' : readingAge(age)}
        ageWarning={!!reading && lastKnown}
        offline={!!reading && saved}
        details={[{ label: 'Observed', value: stamp }]}
        footerActions={<Pressable accessibilityRole="button" accessibilityLabel="Refresh conditions"
          accessibilityState={{ disabled: busy, busy }} disabled={busy} onPress={() => setReload(n => n + 1)}
          style={{ minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' }}>
          {busy ? <ActivityIndicator size="small" color={colors.interactive} />
            : <ControlIcon name="refresh-outline" size={20} color={colors.interactive} />}
        </Pressable>}
      >
        {reading?.accuracyWarning ? <Text style={[s.note, { color: colors.error }]}>{reading.accuracyWarningReason || 'Reading may be unreliable'}</Text> : null}
        {error ? <Text style={[s.note, { color: colors.textMuted }]}>Couldn’t refresh conditions.</Text> : null}
      </ReadingSummaryCard>
    )}
  </View>;
}
