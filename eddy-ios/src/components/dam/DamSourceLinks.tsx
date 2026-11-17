// eddy-ios/src/components/dam/DamSourceLinks.tsx
// Links out to the publishers' own pages for a dam's data.
//
// Every number on a dam screen is somebody else's — the Corps measures the
// release, Southwestern Power Administration posts the schedule — and this is
// the reader's way to the page it came from: to check Eddy against the source,
// and to have somewhere to go when a feed is down.
//
// Each link sits in the section it sources (see GenerationCard), so a plan is
// never offered as the source of a measurement. The page opens in the in-app
// browser, which keeps the dam screen underneath it.

import { Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import type { DamSourceLink } from '@eddy/types';
import { ControlIcon } from '@/components/ControlIcon';
import { openExternalLink } from '@/lib/openExternalLink';
import { useTheme } from '@/theme/ThemeProvider';
import { fonts, type as t } from '@/theme/typography';

export function DamSourceLinks({
  links,
  style,
  compact = false,
}: {
  /** Already filtered to drawable links — see damSourceLink in lib/damSourceLinks. */
  links: DamSourceLink[];
  style?: StyleProp<ViewStyle>;
  /** Quiet attribution alongside an observation or schedule check time. */
  compact?: boolean;
}) {
  const { colors } = useTheme();
  if (links.length === 0) return null;

  return (
    <View style={[styles.row, style]}>
      {links.map((link) => (
        <Pressable
          key={link.kind}
          onPress={() => void openExternalLink(link.url)}
          style={({ pressed }) => [styles.link, { opacity: pressed ? 0.6 : 1 }]}
          accessibilityRole="link"
          // The visible text is short ("SWPA schedule"); VoiceOver gets the
          // publisher in full, which is what says where the link goes.
          accessibilityLabel={`${link.label}, ${link.publisher}`}
          accessibilityHint="Opens the publisher’s page"
        >
          <Text style={[styles.text, compact && t.xs, { color: colors.interactive }]}>
            {compact && link.label === 'Corps of Engineers data' ? 'Corps data' : link.label}
          </Text>
          {/* The mark says this leaves Eddy, as it does on every other
              outbound row in the app. */}
          <ControlIcon name="open-outline" size={14} color={colors.interactive} />
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  // Shrinks inside a parent row (the card footer), so at the largest text
  // sizes a long label wraps within the card instead of running past its edge.
  row: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', columnGap: 20, flexShrink: 1, maxWidth: '100%' },
  // At least 44pt tall for the touch target; the text inside stays the card's
  // small size. At default sizes the minimum height is what spaces the link
  // from its neighbours. At large text sizes the line outgrows 44pt, and the
  // padding is then what keeps it off the text above and the rule below.
  link: { flexDirection: 'row', alignItems: 'center', gap: 5, minHeight: 44, paddingVertical: 8, flexShrink: 1 },
  text: { ...t.sm, fontFamily: fonts.medium, flexShrink: 1 },
});
