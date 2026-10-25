import { useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import { fetchCondition, fetchRiverDetail } from '@/api/client';
import { readConditions, readRiver } from '@/lib/riverCache';
import { observationAgeHours, readingBand, type CachedCondition } from '@/lib/offline-cache';
import { useTheme } from '@/theme/ThemeProvider';
import { EssentialsButton, essentialsStyles as s } from './essentialsUi';

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
  const stamp = reading?.readingTimestamp && Number.isFinite(Date.parse(reading.readingTimestamp))
    ? new Date(reading.readingTimestamp).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : null;
  const primary = reading?.thresholdUnit === 'ft' ? reading.gaugeHeightFt : reading?.dischargeCfs;
  const unit = reading?.thresholdUnit === 'ft' ? 'ft' : 'cfs';
  return <View style={{ gap: 8 }}>
    {reading?.gaugeName ? <Text style={[s.title, { color: colors.text }]}>{reading.gaugeName}</Text> : null}
    <Text style={[s.body, { color: colors.text }]}>{reading && band !== 'expired' && primary != null
      ? `${primary.toLocaleString(undefined, { maximumFractionDigits: unit === 'ft' ? 2 : 0 })} ${unit}` : busy ? 'Loading…' : 'Reading unavailable'}</Text>
    {reading ? <Text style={[s.note, { color: colors.textMuted }]}>{[saved ? 'Saved' : null, stamp ?? 'Time unavailable', band === 'stale' ? 'Stale' : band === 'expired' ? 'Out of date' : null].filter(Boolean).join(' · ')}</Text> : null}
    {reading?.accuracyWarning ? <Text style={[s.note, { color: colors.error }]}>{reading.accuracyWarningReason || 'Reading may be unreliable'}</Text> : null}
    {error ? <Text style={[s.note, { color: colors.textMuted }]}>Refresh unavailable</Text> : null}
    <EssentialsButton label="Refresh" disabled={busy} onPress={() => setReload(n => n + 1)} />
  </View>;
}
