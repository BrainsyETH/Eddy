// eddy-ios/src/components/OfflineMapRow.tsx
// Taking a river's map offline — a line of text until you want it.
//
// ── Why this is not a button any more ───────────────────────────────────────
// This used to be a full-width coral CTA pinned under the map, which made
// "download 12 MB of tiles" the loudest thing on a screen whose actual job is
// showing where the river is and where you can get on it. It competed with the
// float plan for the one primary action a screen gets, and it shouted at every
// person who opened the Map tab to look at a river — most of whom are on wifi
// at home, days from needing it.
//
// So it is a quiet row that states what it is, and expands only when tapped.
//
// ── The copy ────────────────────────────────────────────────────────────────
// "Download for offline" tells you nothing about what survives losing signal,
// and the answer — the map, the put-ins, the hazards — is the entire reason to
// do it. So the description names those three things and then stops.
//
// It used to keep going: an aside about how much of the Ozarks has no signal,
// and a sentence about following the river corridor rather than a bounding box.
// The first is something anyone who floats here already knows, and the second is
// an engineering decision the size label already reports the outcome of. Neither
// belonged in a row you tap while deciding whether to press a button. Tile
// counts are gone from the storage line for the same reason — nobody outside
// this codebase has any idea how many tiles is a lot.
//
// ── Premium ─────────────────────────────────────────────────────────────────
// Offline maps are a paid feature, and the lock is shown BEFORE the tap rather
// than after it. Discovering a paywall at the end of an action you already
// committed to is the version of this that people resent. What is never gated:
// the map itself, conditions, readings, and hazards — see PaywallSheet for the
// full list and why safety data can never sit behind a wall.

import { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { RiverDetail } from '@eddy/types';
import { planOffline, type TileBudget } from '@eddy/offline';
import { useTheme } from '@/theme/ThemeProvider';
import { fonts, type as t } from '@/theme/typography';
import { offlineCompleteness, type RiverPackTally } from '@eddy/offline';
import { EddySymbol } from '@/components/EddySymbol';

interface Props {
  river: RiverDetail | null;
  /**
   * What is on disk for this river, or undefined for nothing.
   *
   * The tally rather than a boolean, because "partly saved" is a state a
   * boolean cannot hold — and because this component already computes the plan
   * (below), it can supply the expected region count itself for packs written
   * before that count was recorded in metadata. No plumbing needed.
   */
  tally: RiverPackTally | undefined;
  /** Non-null while THIS river is downloading; carries 0-100. */
  progressPercent: number | null;
  budget: TileBudget;
  /** Null until the entitlement check settles — the row stays quiet until then. */
  entitled: boolean | null;
  onDownload: () => void;
  onRemove: () => void;
  /** Opens the paywall. Called instead of onDownload when not entitled. */
  onUpgrade: () => void;
}

export function OfflineMapRow({
  river,
  tally,
  progressPercent,
  budget,
  entitled,
  onDownload,
  onRemove,
  onUpgrade,
}: Props) {
  const { colors } = useTheme();
  const [expanded, setExpanded] = useState(false);

  const plan = river ? planOffline(river) : null;
  const busy = progressPercent != null;

  const state = offlineCompleteness(tally, plan?.regions.length);
  const saved = state === 'complete';
  const partial = state === 'partial';

  const onPrimary = useCallback(() => {
    if (saved) {
      onRemove();
      return;
    }
    // Finishing a partial download does NOT re-check entitlement. To have a
    // partial you must have been entitled when you started it, and locking
    // someone out of completing a map already half on their phone — on the one
    // feature whose whole point is working when nothing else does — is the
    // version of this that generates support mail.
    if (partial) {
      onDownload();
      return;
    }
    if (entitled === false) {
      onUpgrade();
      return;
    }
    onDownload();
  }, [saved, partial, entitled, onDownload, onRemove, onUpgrade]);

  // A river with no geometry has nothing to download, and offering it anyway
  // produces a button that can only fail.
  if (!plan) return null;

  // A repair re-fetches only the missing regions and reuses what is on disk, so
  // the storage gate does not apply to it.
  const full = budget.remaining < plan.tileCount && state === 'absent';
  // Upgrading is the primary commercial action; downloading an entitled map is
  // a utility action. The shared row can represent either, so its colour follows
  // the action it will actually take.
  const upgradeAction = entitled === false && state === 'absent';
  const actionFill = upgradeAction ? colors.accentFill : colors.interactive;
  const actionInk = upgradeAction ? colors.onAccent : colors.onInteractive;

  const status = busy
    ? `Downloading… ${progressPercent}%`
    : partial
      ? 'Partly saved'
      : saved
        ? 'Saved on this phone'
        : full
          ? 'Storage full'
          : `About ${plan.sizeLabel}`;

  return (
    <View style={[styles.wrap, { borderTopColor: colors.border }]}>
      <Pressable
        onPress={() => setExpanded((prev) => !prev)}
        style={({ pressed }) => [styles.summary, { opacity: pressed ? 0.6 : 1 }]}
        accessibilityRole="button"
        accessibilityState={{ expanded }}
        accessibilityLabel={`Offline map, ${status}`}
      >
        <EddySymbol name="offlineMap" size={17} />
        <Text style={[styles.summaryText, { color: colors.textMuted }]} numberOfLines={1}>
          Offline map
        </Text>
        <Text style={[styles.summaryStatus, { color: colors.textSubtle }]} numberOfLines={1}>
          {status}
        </Text>
        {/* The lock rides on the collapsed row so the price of this is legible
            without opening it. */}
        {upgradeAction ? (
          <Ionicons name="lock-closed" size={13} color={colors.textSubtle} />
        ) : null}
        {busy ? (
          <ActivityIndicator size="small" color={colors.interactive} />
        ) : (
          <Ionicons
            name={expanded ? 'chevron-up' : 'chevron-down'}
            size={15}
            color={colors.textSubtle}
          />
        )}
      </Pressable>

      {expanded ? (
        <View style={styles.detail}>
          <Text style={[styles.description, { color: colors.textMuted }]}>
            {partial
              ? 'Some of this map did not save. Finish it while you have signal.'
              : saved
                ? 'Saved for bad service areas.'
                : 'Save this map offline for bad service areas.'}
          </Text>

          {/* The tile budget, shown only here. Mapbox caps offline tiles
              globally, so a download can be refused — and until this row
              existed the only way to learn the cap was to hit it. */}
          {budget.used > 0 ? (
            <View style={styles.budget}>
              <View style={[styles.budgetTrack, { backgroundColor: colors.border }]}>
                <View
                  style={[
                    styles.budgetFill,
                    {
                      // Clamped: a stale pack count can exceed the limit, and a
                      // >100% bar would overflow its own track.
                      width: `${Math.min(100, Math.round((budget.used / budget.limit) * 100))}%`,
                      backgroundColor:
                        budget.remaining === 0 ? colors.error : colors.interactive,
                    },
                  ]}
                />
              </View>
              <Text style={[styles.budgetText, { color: colors.textSubtle }]}>
                {budget.remaining === 0
                  ? 'Offline storage is full — remove a river to save another.'
                  : `Offline storage ${Math.min(100, Math.round((budget.used / budget.limit) * 100))}% full`}
              </Text>
            </View>
          ) : null}

          <Pressable
            onPress={onPrimary}
            disabled={busy || full}
            style={({ pressed }) => [
              styles.action,
              {
                borderColor: saved ? colors.border : actionFill,
                backgroundColor: saved ? 'transparent' : actionFill,
                opacity: pressed || busy || full ? 0.6 : 1,
              },
            ]}
            accessibilityRole="button"
          >
            {upgradeAction ? (
              <Ionicons name="lock-closed" size={15} color={actionInk} />
            ) : null}
            <Text
              style={[
                styles.actionText,
                { color: saved ? colors.textMuted : actionInk },
              ]}
            >
              {partial
                ? 'Finish saving this map'
                : saved
                  ? 'Remove from this phone'
                  : full
                    ? 'Not enough offline storage'
                    : entitled === false
                      ? 'Unlock with Eddy Premium'
                      : `Download ${plan.sizeLabel}`}
            </Text>
          </Pressable>

          {/* Only for a partial: someone who does not want to finish still
              needs a way to reclaim the space, and the primary action is
              spoken for. */}
          {partial ? (
            <Pressable onPress={onRemove} hitSlop={8} accessibilityRole="button">
              <Text style={[styles.removeInstead, { color: colors.textMuted }]}>
                Remove it instead
              </Text>
            </Pressable>
          ) : null}

        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  removeInstead: { ...t.xs, fontFamily: fonts.medium, textAlign: 'center', paddingVertical: 6 },
  wrap: { borderTopWidth: StyleSheet.hairlineWidth },
  summary: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 20,
    // 44pt of target height without a border or a fill — the row reads as text
    // and behaves as a control.
    paddingVertical: 12,
  },
  summaryText: { ...t.xs, fontFamily: fonts.semibold },
  summaryStatus: { ...t.xs, fontFamily: fonts.body, flex: 1 },
  detail: { paddingHorizontal: 20, paddingBottom: 14, gap: 12 },
  description: { ...t.xs, fontFamily: fonts.body },
  budget: { gap: 6 },
  budgetTrack: { height: 5, borderRadius: 999, overflow: 'hidden' },
  budgetFill: { height: '100%', borderRadius: 999 },
  budgetText: { ...t.xs, fontFamily: fonts.body },
  action: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
  },
  actionText: { ...t.sm, fontFamily: fonts.semibold },
});
