import { radii } from '@/theme/layout';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { BlurView } from 'expo-blur';
import { Ionicons } from '@expo/vector-icons';
import type { RiverListItem } from '@eddy/types';
import type { EddySays } from '@/lib/eddySays';
import { writtenAge } from '@/lib/eddySays';
import { conditionOpaqueBg, conditionChipBorder, conditionInk, conditionLabel } from '@/theme/conditions';
import { useTheme } from '@/theme/ThemeProvider';
import { PremiumReadPreview } from '@/components/PremiumReadPreview';
import Svg, { Defs, LinearGradient, Stop, Rect } from 'react-native-svg';
import { fonts, type as t } from '@/theme/typography';

interface Props {
  river: RiverListItem;
  says: Pick<EddySays, 'generatedAt'>;
  onPress: () => void;
  photoUrl?: string | null;
  premiumUserId?: string | null;
  onUnlock?: () => void;
  refreshRevision?: number;
  compact?: boolean;
  standalone?: boolean;
}

const BLUR_INTENSITY = 34;

function ReadBackdrop({ photoUrl }: { photoUrl?: string | null }) {
  return <>
    {photoUrl ? <Image source={{ uri: photoUrl }} style={StyleSheet.absoluteFill}
      contentFit="cover" cachePolicy="memory-disk" transition={120}
      recyclingKey={photoUrl} accessibilityIgnoresInvertColors accessible={false} /> : null}
    <Svg width="100%" height="100%" style={StyleSheet.absoluteFill} pointerEvents="none">
      <Defs><LinearGradient id="readShade" x1="0" y1="0" x2="0" y2="1"><Stop offset="0" stopColor="#071c20" stopOpacity={0.66} /><Stop offset="0.45" stopColor="#071c20" stopOpacity={0.65} /><Stop offset="1" stopColor="#071c20" stopOpacity={0.94} /></LinearGradient></Defs>
      <Rect width="100%" height="100%" fill="url(#readShade)" />
    </Svg>
  </>;
}

/** Reserve the card's layout without presenting an unvalidated Read or verdict. */
export function EddyReadPlaceholder() {
  const { elevation } = useTheme();
  return <View accessible accessibilityLabel="Loading Eddy’s Read" accessibilityState={{ busy: true }}
    style={[styles.card, styles.compact,
      { backgroundColor: '#16352e', borderColor: 'transparent' }, elevation(1)]}>
    <ReadBackdrop />
    <View style={styles.content} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <View style={styles.head}>
        <Text style={[styles.kicker, { color: '#e2eee8' }]}>EDDY&apos;S READ</Text>
        <View style={[styles.pill, { opacity: 0 }]}><Text style={styles.pillText}>Pending</Text></View>
      </View>
      <Text style={[styles.name, { color: 'white' }]}>{' '}</Text>
      <BlurredReadPreview lines={7} />
      <View style={styles.foot}><View style={{ minHeight: 44 }} /></View>
    </View>
  </View>;
}

export function BlurredReadPreview({ lines = 3 }: { lines?: number }) {
  const { colors, isDark } = useTheme();
  return (
    <View
      style={styles.blurWrap}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      <View style={styles.readShape}>
        {Array.from({ length: lines }, (_, index) => (
          <View
            key={index}
            style={[
              styles.readLine,
              index === lines - 1 ? styles.readLineLast : null,
              { backgroundColor: colors.textMuted },
            ]}
          />
        ))}
      </View>
      <BlurView
        intensity={BLUR_INTENSITY}
        tint={isDark ? 'dark' : 'light'}
        style={styles.blurOverlay}
        pointerEvents="none"
      />
    </View>
  );
}

/** Public metadata stays immediate. Premium excerpts use the authenticated report endpoint. */
export function EddyReadCard({ river, says, onPress, onUnlock, compact = false, standalone = false, photoUrl, premiumUserId, refreshRevision = 0 }: Props) {
  const { elevation } = useTheme();
  const code = river.currentCondition?.code ?? 'unknown';
  const age = writtenAge(says.generatedAt);
  const action = 'View full read';

  return (
    <Pressable
      onPress={onPress}
      // Keep the named heading action, excerpt and Retry individually accessible.
      accessible={false}
      style={[
        styles.card,
        compact ? styles.compact : null,
        standalone ? styles.standalone : null,
        { backgroundColor: '#16352e', borderColor: 'transparent' },
        elevation(1),
      ]}
    >
      <ReadBackdrop photoUrl={photoUrl} />
      <View style={styles.content}>
      <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={`Eddy's Read for ${river.name}. ${conditionLabel(code)}. ${action}`}>
      <View style={styles.head}>
        <Text style={[styles.kicker, { color: '#e2eee8' }]}>EDDY&apos;S READ</Text>
        <View style={[styles.pill, { backgroundColor: conditionOpaqueBg(code), borderColor: conditionChipBorder(code) }]}>
          <Text style={[styles.pillText, { color: conditionInk(code) }]}>{conditionLabel(code)}</Text>
        </View>
      </View>
      <Text style={[styles.name, { color: 'white' }]}>{river.name}</Text>
      </Pressable>
      {premiumUserId ? <PremiumReadPreview onPhoto key={premiumUserId} slug={river.slug} revision={String(refreshRevision)} /> : onUnlock ? (
        <Pressable
          onPress={event => { event.stopPropagation(); onUnlock(); }}
          accessibilityRole="button"
          accessibilityLabel={`Unlock Eddy's Read for ${river.name} with Premium`}
          accessibilityHint="Opens Premium subscription options"
          style={({ pressed }) => [styles.lockedPreview, { opacity: pressed ? 0.75 : 1 }]}
        >
          <BlurredReadPreview lines={7} />
          <View pointerEvents="none" style={styles.lockOverlay}>
            <View style={styles.lockBadge}>
              <Ionicons name="lock-closed" size={22} color="white" />
            </View>
          </View>
        </Pressable>
      ) : <BlurredReadPreview lines={7} />}
      <View style={styles.foot}>
        {age && !premiumUserId ? <Text style={[styles.age, { color: '#d2e1db' }]}>{age}</Text> : <View />}
        <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={`View full Read for ${river.name}`} style={[styles.footAction, { minHeight: 44 }]}>
          <Text style={[styles.footActionText, { color: 'white' }]}>{action}</Text>
          <Ionicons name="chevron-forward" size={15} color="white" />
        </Pressable>
      </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: { marginHorizontal: 16, marginBottom: 10, borderWidth: StyleSheet.hairlineWidth, borderRadius: radii.feature, overflow: 'hidden' },
  content: { padding: 20, minHeight: 290, justifyContent: 'flex-start' },
  compact: { width: '100%', minHeight: 190, marginHorizontal: 0, marginBottom: 0 },
  standalone: { width: 'auto', height: 'auto', minHeight: 190, marginHorizontal: 0, marginBottom: 0 },
  head: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  kicker: { ...t.xs, fontFamily: fonts.heading, letterSpacing: 0.7 },
  name: { ...t['2xl'], fontFamily: fonts.heading, marginTop: 4 },
  pill: { alignSelf: 'flex-start', marginLeft: 'auto', borderWidth: 1, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 3 },
  pillText: { ...t.xs, fontFamily: fonts.semibold },
  blurWrap: { position: 'relative', overflow: 'hidden', borderRadius: 8, marginTop: 11 },
  readShape: { gap: 7, paddingVertical: 3 },
  readLine: { height: 8, borderRadius: 4, opacity: 0.45 },
  readLineLast: { width: '68%' },
  blurOverlay: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0 },
  lockedPreview: { minHeight: 44 },
  lockOverlay: { ...StyleSheet.absoluteFillObject, top: 11, alignItems: 'center', justifyContent: 'center' },
  lockBadge: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: '#16352e', borderWidth: 1, borderColor: '#d2e1db' },
  foot: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginTop: 'auto', paddingTop: 10 },
  footAction: { flexDirection: 'row', alignItems: 'center', gap: 4, flexShrink: 1 },
  footActionText: { ...t.xs, fontFamily: fonts.semibold, flexShrink: 1 },
  age: { ...t.xs, fontFamily: fonts.body },
});
