import { openExternalLink } from '@/lib/openExternalLink';
import { useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { useTheme } from '@/theme/ThemeProvider';
import { fonts, type as t } from '@/theme/typography';
import { ScenicImage } from './ScenicImage';
import { ControlIcon } from './ControlIcon';
import { riverGuideUrl, type RiverGuideSummary } from '@/lib/riverGuides';
import { useRiverGuides } from '@/hooks/useRiverGuides';

// ── The compact card sits on a blurred photo ────────────────────────────────
//
// The full card (Today's featured guide) leads with the guide's photo, sharp,
// above the copy. The compact card on the river screen has no room for that:
// it is one row among the condition cards, and a sharp photo there would be a
// second hero on a screen that already has one. But without any picture it was
// a grey box with an eyebrow and a link — the plainest card on the screen,
// for the one thing on it that is a piece of writing.
//
// So the compact card paints the photo UNDER the copy, blurred to a wash, with
// the same dark shade Eddy's Read uses so white text holds up on any scene.
// Blurred on purpose: sharp, the photo competes with the title; blurred, it is
// colour and light, and the title is what you read. A guide with no featured
// image borrows the river's own photo — the one Today and the Read card use —
// and a card with neither stays the plain card, in theme colours, rather than
// a dark slab with nothing behind it.

/** Matches ReadBackdrop in EddyReadCard: the shade white copy is read against. */
const PHOTO_SHADE_LIGHT = '#071c20';
const PHOTO_CARD_LIGHT = '#16352e';
const ON_PHOTO_TEXT = 'white';
const ON_PHOTO_KICKER = '#e2eee8';
const ON_PHOTO_MUTED = 'rgba(255,255,255,0.84)';
const BLUR_RADIUS = 18;

function GuideBackdrop({ uri, onError }: { uri: string; onError: () => void }) {
  const { colors, isDark } = useTheme();
  const shade = isDark ? colors.bg : PHOTO_SHADE_LIGHT;
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none" accessible={false}>
      <ScenicImage source={{ uri }} imageWidth={750} style={StyleSheet.absoluteFill}
        blurRadius={BLUR_RADIUS} accessible={false} accessibilityIgnoresInvertColors
        onError={onError} />
      <View style={[StyleSheet.absoluteFill, { backgroundColor: shade, opacity: 0.62 }]} />
    </View>
  );
}

export function RiverGuideCard({ guide, compact = false, featured = false, photoUrl }: {
  guide: RiverGuideSummary;
  compact?: boolean;
  featured?: boolean;
  /** A stand-in for the backdrop when the guide has no featured image. Compact only. */
  photoUrl?: string | null;
}) {
  const { colors, isDark } = useTheme();
  const [failedPhoto, setFailedPhoto] = useState<string | null>(null);
  const backdrop = compact ? (guide.featuredImageUrl ?? photoUrl ?? null) : null;
  const onPhoto = Boolean(backdrop) && backdrop !== failedPhoto;
  const open = () => openExternalLink(riverGuideUrl(guide.slug), () => {
    Alert.alert('Couldn’t open the guide', 'Please try again in a moment.');
  });
  return (
    <View style={!featured && styles.container}>
      <Pressable onPress={() => void open()} accessibilityRole="link"
        accessibilityLabel={`${guide.title}. Read the full guide on eddy.guide.`}
        style={({ pressed }) => [styles.card, onPhoto
          ? { backgroundColor: isDark ? colors.card : PHOTO_CARD_LIGHT, borderColor: 'transparent' }
          : { backgroundColor: colors.card, borderColor: colors.border },
          { opacity: pressed ? 0.75 : 1 }]}>
        {!compact && guide.featuredImageUrl ? <ScenicImage source={{ uri: guide.featuredImageUrl }} imageWidth={750} style={styles.photo} accessibilityLabel={guide.featuredImageAlt ?? guide.title} accessibilityIgnoresInvertColors /> : null}
        {onPhoto && backdrop ? <GuideBackdrop uri={backdrop} onError={() => setFailedPhoto(backdrop)} /> : null}
        <View style={styles.copy}>
          <Text style={[styles.eyebrow, { color: onPhoto ? ON_PHOTO_KICKER : colors.interactive }]}>{featured ? 'TODAY’S RIVER GUIDE' : 'RIVER GUIDE'}{guide.readTimeMinutes ? ` · ${guide.readTimeMinutes} MIN READ` : ''}</Text>
          <Text style={[styles.title, { color: onPhoto ? ON_PHOTO_TEXT : colors.text }]}>{guide.title}</Text>
          {!compact && guide.description ? <Text style={[styles.body, { color: colors.textMuted }]} numberOfLines={3}>{guide.description}</Text> : null}
          <View style={styles.action}>
            <Text style={[styles.link, { color: onPhoto ? ON_PHOTO_MUTED : colors.interactive }]}>Read the guide</Text>
            <ControlIcon name="open-outline" size={16} color={onPhoto ? ON_PHOTO_MUTED : colors.interactive} />
          </View>
        </View>
      </Pressable>
    </View>
  );
}

/**
 * No fabricated URL: a river links only to an actual published article.
 *
 * `photoUrl` is the river's own photo, for the backdrop of a guide that has
 * no featured image of its own.
 */
export function RiverGuideLink({ riverSlug, photoUrl }: { riverSlug: string; photoUrl?: string | null }) {
  const { guides } = useRiverGuides();
  const guide = guides?.find(item => item.riverSlug === riverSlug);
  return guide ? <RiverGuideCard guide={guide} compact photoUrl={photoUrl} /> : null;
}

const styles = StyleSheet.create({
  container: { marginBottom: 16 },
  card: { borderWidth: 1, borderRadius: 18, overflow: 'hidden' },
  photo: { width: '100%', aspectRatio: 2 },
  copy: { padding: 16, gap: 8 },
  eyebrow: { ...t.xs, fontFamily: fonts.semibold, letterSpacing: 0.8 },
  title: { ...t.xl, fontFamily: fonts.display },
  body: { ...t.sm, fontFamily: fonts.body },
  action: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 8 },
  link: { ...t.sm, fontFamily: fonts.semibold },
});
