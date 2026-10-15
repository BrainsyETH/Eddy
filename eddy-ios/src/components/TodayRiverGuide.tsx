import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { RiverGuideCard } from '@/components/RiverGuideCard';
import { SectionHead } from '@/components/SectionHead';
import { useObservationClock } from '@/hooks/useObservationClock';
import { useRiverGuides } from '@/hooks/useRiverGuides';
import { selectFeaturedRiverGuide } from '@/lib/riverGuides';
import { useTheme } from '@/theme/ThemeProvider';
import { fonts, type as t } from '@/theme/typography';

export function TodayRiverGuide({ refreshRevision }: { refreshRevision: number }) {
  const router = useRouter();
  const { colors } = useTheme();
  const { guides, loading, error, refresh } = useRiverGuides(refreshRevision);
  // Shared clock updates on focus, foreground, and each visible minute so an
  // overnight session advances without changing the feature during the day.
  const now = useObservationClock();
  const guide = selectFeaturedRiverGuide(guides ?? [], now);

  return (
    <View>
      <SectionHead title="River guides" action="See all" onAction={() => router.push('/river-guides')} />
      {guide ? <RiverGuideCard guide={guide} featured /> : (
        <View style={[styles.placeholder, { backgroundColor: colors.card, borderColor: colors.border }]}>
          {loading ? <ActivityIndicator accessibilityLabel="Loading today’s river guide" color={colors.interactive} /> : (
            <>
              <Text style={[styles.body, { color: colors.textMuted }]}>
                {error ? 'Couldn’t load today’s guide.' : 'River guides are on their way. Check back soon.'}
              </Text>
              {error ? <Pressable onPress={refresh} accessibilityRole="button" style={styles.retry}>
                <Text style={[styles.link, { color: colors.interactive }]}>Try again</Text>
              </Pressable> : null}
            </>
          )}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  placeholder: { borderWidth: StyleSheet.hairlineWidth, borderRadius: 18, padding: 16 },
  body: { ...t.sm, fontFamily: fonts.body },
  retry: { minHeight: 44, justifyContent: 'center' },
  link: { ...t.sm, fontFamily: fonts.semibold },
});
