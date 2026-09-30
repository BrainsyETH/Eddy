import { Linking, Pressable, ScrollView, Text, View, useWindowDimensions } from 'react-native';
import { useState } from 'react';
import { useTheme } from '@/theme/ThemeProvider';
import { textStyles } from '@/theme/typography';
import { useCampsitePhotos } from '@/hooks/useCampsitePhotos';
import { dateLabel, safeExternalUrl } from '@/lib/campingHeatmap';
import { campsiteStateLabel, type CampsiteStay } from '@/lib/campingStay';
import { campsiteTags } from './map-sheet/siteList';
import { CampsitePhotos } from './map-sheet/CampsitePhotos';
import { CampingMark } from './CampingGrid';
import { useScreenReaderEnabled } from '@/hooks/useScreenReaderEnabled';

export function CampingSiteCard({
  entry,
  facilityId,
  bookingUrl,
}: {
  entry: CampsiteStay;
  facilityId: string;
  bookingUrl?: string | null;
}) {
  const { colors } = useTheme();
  const { fontScale } = useWindowDimensions();
  const screenReader = useScreenReaderEnabled();
  const listNights = screenReader || fontScale >= 1.3;
  const photos = useCampsitePhotos(facilityId, entry.site.id);
  const [failed, setFailed] = useState(false);
  const site = entry.site;
  const name = site.name || 'Campsite';
  const tags = campsiteTags(site);
  const direct = safeExternalUrl(site.bookingUrl);
  const url = direct ?? safeExternalUrl(bookingUrl);
  const openCount = entry.nights.filter((n) => n.state === 'open').length;
  const status =
    entry.state === 'available'
      ? 'Available for your stay'
      : entry.state === 'unknown'
        ? 'Availability not updated'
        : entry.nights.every((n) => n.state === 'walk_up')
          ? 'First-come only'
          : openCount
            ? `${openCount} of ${entry.nights.length} nights open`
            : 'Unavailable for your stay';
  return (
    <View
      style={{
        backgroundColor: colors.card,
        borderRadius: 20,
        padding: 12,
        gap: 10,
      }}
    >
      {photos?.[site.id]?.length ? (
        <CampsitePhotos photos={photos[site.id]} label={name} large />
      ) : null}
      <Text style={[textStyles.cardTitle, { color: colors.text }]}>{name}</Text>
      {site.loop || tags.length ? (
        <Text style={[textStyles.caption, { color: colors.textMuted }]}>
          {[site.loop, ...tags].filter(Boolean).join(' · ')}
        </Text>
      ) : null}
      <Text style={[textStyles.body, { color: colors.text }]}>{status}</Text>
      {listNights ? <View style={{ gap: 8 }}>
        {entry.nights.map((n) => <Text key={n.date} style={[textStyles.body, { color: colors.text }]}>
          {dateLabel(n.date)}: {campsiteStateLabel[n.state]}
        </Text>)}
      </View> : <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ gap: 8 }}
      >
        {entry.nights.map((n) => (
          <View
            key={n.date}
            accessible
            accessibilityLabel={`${dateLabel(n.date)}: ${campsiteStateLabel[n.state]}`}
            style={{ width: 44, alignItems: 'center', gap: 6 }}
          >
            <Text
              maxFontSizeMultiplier={1.3}
              style={{ color: colors.textMuted, fontSize: 11 }}
            >
              {dateLabel(n.date, true)}
            </Text>
            <View style={{ width: 24, height: 18 }}>
              <CampingMark
                mark={
                  n.state === 'open'
                    ? 'open-3'
                    : n.state === 'reserved'
                      ? 'full'
                      : n.state === 'closed'
                        ? 'closed'
                        : n.state === 'walk_up'
                          ? 'no-reservable'
                          : n.state === 'not_yet_released'
                            ? 'nyr'
                            : 'unknown'
                }
              />
            </View>
          </View>
        ))}
      </ScrollView>}
      {url && (entry.state === 'available' || entry.state === 'unknown') ? (
        <Pressable
          accessibilityRole="link"
          accessibilityLabel={`${entry.state === 'available' ? (direct ? 'Book site' : 'Park reservations') : 'Check availability'} for ${name}`}
          style={{
            minHeight: 48,
            padding: 12,
            borderRadius: 12,
            backgroundColor: colors.interactive,
            alignItems: 'center',
            justifyContent: 'center',
          }}
          onPress={() => {
            setFailed(false);
            void Linking.openURL(url).catch(() => setFailed(true));
          }}
        >
          <Text style={[textStyles.body, { color: colors.onInteractive, textAlign: 'center' }]}>
            {entry.state === 'available'
              ? direct
                ? 'Book site ↗'
                : 'Park reservations ↗'
              : 'Check availability ↗'}
          </Text>
        </Pressable>
      ) : null}
      {failed ? (
        <Text style={{ color: colors.error }}>
          Couldn’t open the link. Try again.
        </Text>
      ) : null}
    </View>
  );
}
