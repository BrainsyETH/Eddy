import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import type {
  AccessPoint,
  FloatPlan,
  RiverListItem,
  VesselType,
} from '@eddy/shared/types/api';
import { CONDITION_COLORS } from '@eddy/shared/constants';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { BottomTabInset, Spacing } from '@/constants/theme';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';

type StepInfo = {
  label: string;
  hint: string;
};

const STEPS: Record<'river' | 'putIn' | 'takeOut' | 'vessel', StepInfo> = {
  river: { label: 'River', hint: 'Pick a river' },
  putIn: { label: 'Put-in', hint: 'Pick a put-in' },
  takeOut: { label: 'Take-out', hint: 'Pick a take-out' },
  vessel: { label: 'Vessel', hint: 'Pick a vessel' },
};

export default function PlanScreen() {
  const { session } = useAuth();

  const [rivers, setRivers] = useState<RiverListItem[] | null>(null);
  const [vessels, setVessels] = useState<VesselType[] | null>(null);
  const [accessPoints, setAccessPoints] = useState<AccessPoint[] | null>(null);
  const [accessPointsLoading, setAccessPointsLoading] = useState(false);

  const [riverId, setRiverId] = useState<string | null>(null);
  const [putInId, setPutInId] = useState<string | null>(null);
  const [takeOutId, setTakeOutId] = useState<string | null>(null);
  const [vesselId, setVesselId] = useState<string | null>(null);

  const [plan, setPlan] = useState<FloatPlan | null>(null);
  const [planLoading, setPlanLoading] = useState(false);
  const [planError, setPlanError] = useState<string | null>(null);

  const [saving, setSaving] = useState(false);
  const [savedCode, setSavedCode] = useState<string | null>(null);

  useEffect(() => {
    api.getRivers().then(({ rivers }) => setRivers(rivers)).catch(() => {});
    api
      .getVesselTypes()
      .then(({ vesselTypes }) => setVessels(vesselTypes))
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!riverId || !rivers) {
      setAccessPoints(null);
      return;
    }
    const river = rivers.find((r) => r.id === riverId);
    if (!river) return;
    setAccessPointsLoading(true);
    api
      .getRiverAccessPoints(river.slug)
      .then(({ accessPoints }) => {
        // Sort upstream → downstream so put-in/take-out pickers feel natural.
        setAccessPoints([...accessPoints].sort((a, b) => a.riverMile - b.riverMile));
      })
      .catch(() => setAccessPoints([]))
      .finally(() => setAccessPointsLoading(false));
  }, [riverId, rivers]);

  useEffect(() => {
    if (!riverId || !putInId || !takeOutId || !vesselId) {
      setPlan(null);
      setPlanError(null);
      return;
    }
    setPlanLoading(true);
    setPlanError(null);
    setSavedCode(null);
    api
      .getPlan({
        riverId,
        startId: putInId,
        endId: takeOutId,
        vesselTypeId: vesselId,
      })
      .then(({ plan }) => setPlan(plan))
      .catch((e) => {
        setPlanError(e instanceof Error ? e.message : 'Could not plan trip');
        setPlan(null);
      })
      .finally(() => setPlanLoading(false));
  }, [riverId, putInId, takeOutId, vesselId]);

  const putInOptions = useMemo(() => accessPoints ?? [], [accessPoints]);
  const takeOutOptions = useMemo(() => {
    if (!accessPoints || !putInId) return accessPoints ?? [];
    const putIn = accessPoints.find((ap) => ap.id === putInId);
    if (!putIn) return accessPoints;
    return accessPoints.filter(
      (ap) => ap.id !== putInId && ap.riverMile >= putIn.riverMile
    );
  }, [accessPoints, putInId]);

  const onPickRiver = useCallback((id: string) => {
    setRiverId(id || null);
    setPutInId(null);
    setTakeOutId(null);
  }, []);

  const onPickPutIn = useCallback((id: string) => {
    setPutInId(id || null);
    setTakeOutId(null);
  }, []);

  async function onSave() {
    if (!riverId || !putInId || !takeOutId || !vesselId) return;
    setSaving(true);
    try {
      const res = await api.savePlan({
        riverId,
        startId: putInId,
        endId: takeOutId,
        vesselTypeId: vesselId,
      });
      setSavedCode(res.shortCode);
    } catch (e) {
      Alert.alert(
        'Could not save plan',
        e instanceof Error ? e.message : 'Try again in a moment.'
      );
    } finally {
      setSaving(false);
    }
  }

  const selectedRiver = rivers?.find((r) => r.id === riverId) ?? null;
  const selectedPutIn = accessPoints?.find((ap) => ap.id === putInId) ?? null;
  const selectedTakeOut =
    accessPoints?.find((ap) => ap.id === takeOutId) ?? null;
  const selectedVessel = vessels?.find((v) => v.id === vesselId) ?? null;

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <ScrollView contentContainerStyle={styles.scroll}>
          <ThemedText type="title">Plan a Float</ThemedText>

          <Step
            step={STEPS.river}
            selectedLabel={selectedRiver?.name ?? null}
            onClear={selectedRiver ? () => onPickRiver('') : undefined}
            options={(rivers ?? []).map((r) => ({ id: r.id, label: r.name }))}
            loading={rivers === null}
            onPick={onPickRiver}
            disabled={false}
          />

          <Step
            step={STEPS.putIn}
            selectedLabel={
              selectedPutIn
                ? `${selectedPutIn.name} (mile ${selectedPutIn.riverMile})`
                : null
            }
            onClear={selectedPutIn ? () => onPickPutIn('') : undefined}
            options={putInOptions.map((ap) => ({
              id: ap.id,
              label: `${ap.name} · mile ${ap.riverMile}`,
            }))}
            loading={accessPointsLoading}
            onPick={onPickPutIn}
            disabled={!riverId}
            emptyHint={
              riverId
                ? 'No access points found for this river.'
                : 'Pick a river first.'
            }
          />

          <Step
            step={STEPS.takeOut}
            selectedLabel={
              selectedTakeOut
                ? `${selectedTakeOut.name} (mile ${selectedTakeOut.riverMile})`
                : null
            }
            onClear={selectedTakeOut ? () => setTakeOutId(null) : undefined}
            options={takeOutOptions.map((ap) => ({
              id: ap.id,
              label: `${ap.name} · mile ${ap.riverMile}`,
            }))}
            loading={accessPointsLoading}
            onPick={(id) => setTakeOutId(id)}
            disabled={!putInId}
            emptyHint={
              putInId ? 'No take-outs downstream.' : 'Pick a put-in first.'
            }
          />

          <Step
            step={STEPS.vessel}
            selectedLabel={selectedVessel?.name ?? null}
            onClear={selectedVessel ? () => setVesselId(null) : undefined}
            options={(vessels ?? []).map((v) => ({
              id: v.id,
              label: `${v.icon} ${v.name}`,
            }))}
            loading={vessels === null}
            onPick={(id) => setVesselId(id)}
            disabled={false}
          />

          {planLoading && (
            <View style={styles.center}>
              <ActivityIndicator />
            </View>
          )}

          {planError && (
            <ThemedView type="backgroundElement" style={styles.errorCard}>
              <ThemedText>Couldn&apos;t plan this float.</ThemedText>
              <ThemedText type="small">{planError}</ThemedText>
            </ThemedView>
          )}

          {plan && (
            <View style={styles.resultBlock}>
              <View
                style={[
                  styles.conditionBanner,
                  { backgroundColor: CONDITION_COLORS[plan.condition.code] },
                ]}
              >
                <ThemedText style={styles.conditionText}>
                  {plan.condition.label}
                </ThemedText>
              </View>
              <View style={styles.statsRow}>
                <Stat label="Distance" value={plan.distance.formatted} />
                {plan.floatTime && (
                  <Stat label="Float time" value={plan.floatTime.formatted} />
                )}
                <Stat label="Drive back" value={plan.driveBack.formatted} />
              </View>

              {plan.warnings.length > 0 && (
                <ThemedView type="backgroundElement" style={styles.warningCard}>
                  {plan.warnings.map((w, i) => (
                    <ThemedText key={i} type="small">
                      • {w}
                    </ThemedText>
                  ))}
                </ThemedView>
              )}

              {savedCode ? (
                <ThemedView type="backgroundElement" style={styles.savedCard}>
                  <ThemedText style={styles.semibold}>Saved!</ThemedText>
                  <ThemedText type="small">
                    Share code:{' '}
                    <ThemedText style={styles.semibold}>{savedCode}</ThemedText>
                  </ThemedText>
                  <ThemedText type="small">
                    {session
                      ? 'Find it later under Account → My saved plans.'
                      : 'Sign in on the Account tab to keep it in your list.'}
                  </ThemedText>
                </ThemedView>
              ) : (
                <Pressable
                  onPress={onSave}
                  disabled={saving}
                  style={({ pressed }) => [
                    styles.saveButton,
                    pressed && styles.pressed,
                  ]}
                >
                  <ThemedText style={styles.saveButtonText}>
                    {saving ? 'Saving…' : 'Save plan'}
                  </ThemedText>
                </Pressable>
              )}
            </View>
          )}
        </ScrollView>
      </SafeAreaView>
    </ThemedView>
  );
}

function Step({
  step,
  selectedLabel,
  onClear,
  options,
  loading,
  onPick,
  disabled,
  emptyHint,
}: {
  step: StepInfo;
  selectedLabel: string | null;
  onClear?: () => void;
  options: { id: string; label: string }[];
  loading: boolean;
  onPick: (id: string) => void;
  disabled: boolean;
  emptyHint?: string;
}) {
  return (
    <View style={[styles.stepBlock, disabled && styles.stepDisabled]}>
      <View style={styles.stepHeader}>
        <ThemedText type="small">{step.label}</ThemedText>
        {selectedLabel && onClear && (
          <Pressable onPress={onClear}>
            <ThemedText type="link">Change</ThemedText>
          </Pressable>
        )}
      </View>
      {selectedLabel ? (
        <ThemedView type="backgroundElement" style={styles.selectedCard}>
          <ThemedText style={styles.semibold}>{selectedLabel}</ThemedText>
        </ThemedView>
      ) : disabled ? (
        <ThemedText type="small">{emptyHint ?? step.hint}</ThemedText>
      ) : loading ? (
        <ActivityIndicator />
      ) : options.length === 0 ? (
        <ThemedText type="small">{emptyHint ?? 'No options available.'}</ThemedText>
      ) : (
        <View style={styles.optionList}>
          {options.map((opt) => (
            <Pressable
              key={opt.id}
              onPress={() => onPick(opt.id)}
              style={({ pressed }) => pressed && styles.pressed}
            >
              <ThemedView type="backgroundElement" style={styles.optionRow}>
                <ThemedText>{opt.label}</ThemedText>
              </ThemedView>
            </Pressable>
          ))}
        </View>
      )}
    </View>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <ThemedView type="backgroundElement" style={styles.stat}>
      <ThemedText type="small">{label}</ThemedText>
      <ThemedText style={styles.semibold}>{value}</ThemedText>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  safeArea: {
    flex: 1,
  },
  scroll: {
    paddingHorizontal: Spacing.four,
    paddingBottom: BottomTabInset + Spacing.four,
    gap: Spacing.three,
  },
  stepBlock: {
    gap: Spacing.two,
  },
  stepDisabled: {
    opacity: 0.6,
  },
  stepHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  selectedCard: {
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.three,
    borderRadius: Spacing.three,
  },
  optionList: {
    gap: Spacing.one,
  },
  optionRow: {
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two + 2,
    borderRadius: Spacing.two,
  },
  center: {
    alignItems: 'center',
    paddingVertical: Spacing.three,
  },
  resultBlock: {
    gap: Spacing.three,
    marginTop: Spacing.three,
  },
  conditionBanner: {
    borderRadius: Spacing.two,
    padding: Spacing.three,
  },
  conditionText: {
    color: '#fff',
    fontWeight: '600',
  },
  statsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
  },
  stat: {
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    borderRadius: Spacing.two,
    gap: 2,
  },
  warningCard: {
    padding: Spacing.three,
    borderRadius: Spacing.three,
    gap: Spacing.one,
  },
  errorCard: {
    padding: Spacing.three,
    borderRadius: Spacing.three,
    gap: Spacing.one,
  },
  savedCard: {
    padding: Spacing.three,
    borderRadius: Spacing.three,
    gap: Spacing.one,
  },
  saveButton: {
    backgroundColor: '#0E7490',
    borderRadius: Spacing.two,
    paddingVertical: Spacing.three,
    alignItems: 'center',
  },
  saveButtonText: {
    color: '#ffffff',
    fontWeight: '600',
  },
  pressed: {
    opacity: 0.7,
  },
  semibold: {
    fontWeight: '600',
  },
});
