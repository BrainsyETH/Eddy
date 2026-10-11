import { openExternalLink } from '@/lib/openExternalLink';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { useTheme } from '@/theme/ThemeProvider';
import { fonts, type as t } from '@/theme/typography';
import { ScenicImage } from './ScenicImage';
import { ControlIcon } from './ControlIcon';
import { riverGuideUrl, type RiverGuideSummary } from '@/lib/riverGuides';
import { useRiverGuides } from '@/hooks/useRiverGuides';

export function RiverGuideCard({ guide, compact = false }: { guide: RiverGuideSummary; compact?: boolean }) {
  const { colors } = useTheme();
  const open = () => openExternalLink(riverGuideUrl(guide.slug), () => {
    Alert.alert('Couldn’t open the guide', 'Please try again in a moment.');
  });
  return (
    <Pressable onPress={() => void open()} accessibilityRole="link"
      accessibilityLabel={`${guide.title}. Read the full guide on eddy.guide.`}
      style={({ pressed }) => [styles.card, { backgroundColor: colors.card, borderColor: colors.border, opacity: pressed ? 0.75 : 1 }]}>
      {!compact && guide.featuredImageUrl ? <ScenicImage source={{ uri: guide.featuredImageUrl }} imageWidth={750} style={styles.photo} accessibilityIgnoresInvertColors /> : null}
      <View style={styles.copy}>
        <Text style={[styles.eyebrow, { color: colors.interactive }]}>RIVER GUIDE{guide.readTimeMinutes ? ` · ${guide.readTimeMinutes} MIN READ` : ''}</Text>
        <Text style={[styles.title, { color: colors.text }]}>{guide.title}</Text>
        {!compact && guide.description ? <Text style={[styles.body, { color: colors.textMuted }]} numberOfLines={3}>{guide.description}</Text> : null}
        <View style={styles.action}>
          <Text style={[styles.link, { color: colors.interactive }]}>Read the guide</Text>
          <ControlIcon name="open-outline" size={16} color={colors.interactive} />
        </View>
      </View>
    </Pressable>
  );
}

/** No fabricated URL: a river links only to an actual published article. */
export function RiverGuideLink({ riverSlug }: { riverSlug: string }) {
  const { guides } = useRiverGuides();
  const guide = guides?.find(item => item.riverSlug === riverSlug);
  return guide ? <RiverGuideCard guide={guide} compact /> : null;
}

const styles = StyleSheet.create({
  card: { borderWidth: 1, borderRadius: 18, overflow: 'hidden', marginBottom: 16 },
  photo: { width: '100%', aspectRatio: 2 },
  copy: { padding: 16, gap: 8 },
  eyebrow: { ...t.xs, fontFamily: fonts.semibold, letterSpacing: 0.8 },
  title: { ...t.xl, fontFamily: fonts.display },
  body: { ...t.sm, fontFamily: fonts.body },
  action: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 8 },
  link: { ...t.sm, fontFamily: fonts.semibold },
});
