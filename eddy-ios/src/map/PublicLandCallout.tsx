// eddy-ios/src/map/PublicLandCallout.tsx
// What a tapped public-land parcel is, and what it is not.
//
// Parcels were visible and untappable: a tap fell through to the background,
// which closed whatever sheet was open, and the "callout repeats it" promise in
// RiverMap's docs had no callout behind it. This is that callout — the agency's
// name, its designation, the access class in words, and the one sentence the
// layer exists to carry: OWNERSHIP, NOT PERMISSION.
//
// A transparent Modal over the map, like the places sheet: a tap on the scrim,
// the close button or VoiceOver's escape gesture dismisses it, and nothing
// about the map changes.

import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { publicLandAccessLabel, publicLandAccessStyle, type PublicLandProperties } from '@eddy/types';
import { ControlIcon } from '@/components/ControlIcon';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import { useTheme } from '@/theme/ThemeProvider';
import { fonts, type as t } from '@/theme/typography';

interface Props {
  land: PublicLandProperties;
  onClose: () => void;
}

export function PublicLandCallout({ land, onClose }: Props) {
  const { colors } = useTheme();
  const reducedMotion = useReducedMotion();
  const access = publicLandAccessLabel(land.access);
  const swatch = publicLandAccessStyle(land.access);
  const detail = [land.designation, land.manager].filter(Boolean).join(' · ');
  return (
    <Modal visible transparent animationType={reducedMotion ? 'none' : 'fade'} onRequestClose={onClose}>
      {/* Tap-to-dismiss only. Hidden from VoiceOver: announced as a second
          "Close" button it duplicated the real one, and the escape gesture on
          the card below dismisses for VoiceOver users. */}
      <Pressable
        style={[styles.scrim, { backgroundColor: colors.scrim }]}
        onPress={onClose}
        accessible={false}
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
      />
      <SafeAreaView
        edges={['bottom']}
        style={styles.anchor}
        pointerEvents="box-none"
        accessibilityViewIsModal
        onAccessibilityEscape={onClose}
      >
        <View style={[styles.card, { backgroundColor: colors.sheet, borderColor: colors.border }]}>
          <View style={styles.head}>
            <View style={styles.titles}>
              <Text style={[styles.title, { color: colors.text }]} accessibilityRole="header">
                {land.name}
              </Text>
              {detail ? <Text style={[styles.detail, { color: colors.textMuted }]}>{detail}</Text> : null}
            </View>
            <Pressable
              onPress={onClose}
              hitSlop={8}
              style={styles.close}
              accessibilityRole="button"
              accessibilityLabel="Close"
            >
              <ControlIcon name="close" size={18} color={colors.textMuted} />
            </Pressable>
          </View>
          <View style={styles.access}>
            <View style={[styles.swatch, { backgroundColor: swatch.fill, borderColor: swatch.line }]} />
            <Text style={[styles.accessText, { color: colors.textBody }]}>{access}</Text>
          </View>
          <Text style={[styles.note, { color: colors.textMuted }]}>
            Public ownership, not permission. Check the agency&rsquo;s rules before you land, camp or
            portage here.
          </Text>
        </View>
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  scrim: StyleSheet.absoluteFill,
  anchor: { position: 'absolute', left: 0, right: 0, bottom: 0 },
  card: {
    marginHorizontal: 12,
    marginBottom: 12,
    padding: 16,
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    gap: 10,
  },
  head: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  titles: { flex: 1, gap: 2 },
  title: { ...t.lg, fontFamily: fonts.heading },
  detail: { ...t.sm, fontFamily: fonts.body },
  // 44pt, like every close control on the map's sheets.
  close: { width: 44, height: 44, marginTop: -10, marginRight: -10, alignItems: 'center', justifyContent: 'center' },
  access: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  swatch: { width: 14, height: 14, borderRadius: 3, borderWidth: 1.5 },
  accessText: { ...t.sm, fontFamily: fonts.medium },
  note: { ...t.sm, fontFamily: fonts.body },
});
