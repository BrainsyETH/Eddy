// One saved float: river, both ends, distance and when it was saved, with a
// separate remove target. Shared by the saved list and the Floats tab.
//
// No float time and no conditions, deliberately. See floats.tsx: a saved stub
// is a memory of a stretch, and an old estimate printed as current would be a
// lie with a timestamp on it.

import { Pressable, StyleSheet, Text, View } from 'react-native';
import { ControlIcon } from '@/components/ControlIcon';
import type { SavedFloat } from '@/hooks/useSavedFloats';
import { radii } from '@/theme/layout';
import { useTheme } from '@/theme/ThemeProvider';
import { fonts, type as t } from '@/theme/typography';

/** "3 days ago" — the precision a share history deserves and no more. */
function savedAgo(iso: string): string {
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return '';
  const days = Math.floor((Date.now() - then) / 86_400_000);
  if (days <= 0) return 'Today';
  if (days === 1) return 'Yesterday';
  if (days < 30) return `${days} days ago`;
  const months = Math.round(days / 30);
  return `${months} month${months === 1 ? '' : 's'} ago`;
}

export function SavedFloatRow({
  float,
  onOpen,
  onForget,
  elevation,
}: {
  float: SavedFloat;
  onOpen: () => void;
  onForget: () => void;
  elevation: object;
}) {
  const { colors } = useTheme();

  return (
    <View style={[styles.row, { backgroundColor: colors.card }, elevation]}>
      <Pressable
        onPress={onOpen}
        style={({ pressed }) => [styles.rowMain, { opacity: pressed ? 0.6 : 1 }]}
        accessibilityRole="button"
        accessibilityLabel={`${float.putInName} to ${float.takeOutName} on the ${float.riverName}`}
      >
        <Text style={[styles.rowRiver, { color: colors.textMuted }]} numberOfLines={1}>
          {float.riverName}
        </Text>
        <Text style={[styles.rowSegment, { color: colors.text }]} numberOfLines={2}>
          {float.putInName} → {float.takeOutName}
        </Text>
        <Text style={[styles.rowMeta, { color: colors.textSubtle }]} numberOfLines={1}>
          {float.distanceLabel} · {savedAgo(float.savedAt)}
        </Text>
      </Pressable>

      {/* A sibling of the open target, not a child of it, and a full-height
          column — the same rule the star follows on a river row, for the same
          reason: two overlapping touch targets make a tap ambiguous. */}
      <Pressable
        onPress={onForget}
        style={({ pressed }) => [styles.forget, { opacity: pressed ? 0.5 : 1 }]}
        accessibilityRole="button"
        accessibilityLabel={`Remove ${float.putInName} to ${float.takeOutName}`}
      >
        <ControlIcon name="trash-outline" size={18} color={colors.textSubtle} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'stretch',
    marginHorizontal: 16,
    marginBottom: 9,
    borderRadius: radii.card,
    overflow: 'hidden',
  },
  rowMain: { flex: 1, minWidth: 0, padding: 13 },
  rowRiver: { ...t.xs, fontFamily: fonts.semibold },
  rowSegment: { ...t.sm, fontFamily: fonts.semibold, marginTop: 3 },
  rowMeta: { ...t.xs, fontFamily: fonts.body, marginTop: 3 },
  forget: { width: 52, alignItems: 'center', justifyContent: 'center' },
});
