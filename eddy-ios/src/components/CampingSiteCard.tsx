import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { CampsitePhoto } from '@eddy/types';
import { campingPolicyNote, campingStayLabel } from '@eddy/conditions/camping-policy';
import { useTheme } from '@/theme/ThemeProvider';
import { fonts, type as t } from '@/theme/typography';
import { useCampsitePhotos } from '@/hooks/useCampsitePhotos';
import { dateLabel, safeExternalUrl } from '@/lib/campingHeatmap';
import { campsiteDisplayLoop, campsiteDisplayName, campsiteStateLabel, type CampsiteStay } from '@/lib/campingStay';
import { openExternalLink } from '@/lib/openExternalLink';
import { campsiteTags } from './map-sheet/siteList';
import { CampsitePhotos } from './map-sheet/CampsitePhotos';
import { EddySymbol } from './EddySymbol';
import { ControlIcon } from './ControlIcon';

/** Shared by the campground stay sheet and the map's one-night site list. */
export function CampingSiteCard({ entry, facilityId, bookingUrl, now, campgroundName, photos: suppliedPhotos, hideLoop = false, dense = false }: {
  entry: CampsiteStay;
  facilityId?: string | null;
  bookingUrl?: string | null;
  now: number;
  campgroundName?: string;
  photos?: CampsitePhoto[];
  hideLoop?: boolean;
  dense?: boolean;
}) {
  const { colors } = useTheme();
  const fetchedPhotos = useCampsitePhotos(suppliedPhotos ? null : facilityId ?? null, entry.site.id);
  const photos = suppliedPhotos ?? fetchedPhotos?.[entry.site.id] ?? [];
  const [failed, setFailed] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const site = entry.site;
  const fullName = site.name || 'Campsite';
  const name = campsiteDisplayName(site.name, campgroundName);
  const loop = hideLoop ? null : campsiteDisplayLoop(site.loop, campgroundName);
  const tags = campsiteTags(site).map(tag => tag.startsWith('Sleeps ') ? `Up to ${tag.slice(7)} people` : tag);
  const direct = safeExternalUrl(site.bookingUrl);
  const url = direct ?? safeExternalUrl(bookingUrl);
  const bookingLabel = entry.state === 'unknown' ? 'Check availability' : direct ? 'Book site' : 'Park reservations';
  const status = entry.state === 'available'
    ? entry.nights.length === 1 ? 'Available' : `Available all ${entry.nights.length} nights`
    : campingStayLabel(entry);
  const policyNote = campingPolicyNote(entry, now);
  const policyUrl = safeExternalUrl(site.policy?.sourceUrl);
  const open = (target: string) => { setFailed(false); void openExternalLink(target, () => setFailed(true)); };
  return <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
    <View style={styles.row}>
      {photos.length ? <CampsitePhotos photos={photos} label={fullName} compact={!dense} /> : <View style={[styles.placeholder, dense && styles.smallPlaceholder, { backgroundColor: colors.cardRaised }]}>
        <EddySymbol name="campground" size={32} />
      </View>}
      <View style={styles.body}>
        <Pressable onPress={() => setExpanded(value => !value)} accessibilityRole="button"
          accessibilityLabel={`Details for ${fullName}`} accessibilityState={{ expanded }}
          accessibilityHint={[loop, ...tags, status, 'Shows photos and nightly availability'].filter(Boolean).join('. ')} style={styles.summary}>
          <View style={styles.nameRow}>
            <Text style={[styles.name, dense && styles.smallName, { color: colors.text }]}>{name}</Text>
            <ControlIcon name={expanded ? 'chevron-up' : 'chevron-down'} size={14} color={colors.textMuted} />
          </View>
          {loop || tags.length ? <Text style={[styles.meta, { color: colors.textMuted }]}>{[loop, ...tags].filter(Boolean).join(' · ')}</Text> : null}
        </Pressable>
        <View style={[styles.footer, dense && entry.state === 'available' && styles.bookingOnly]}>
        {!dense || entry.state !== 'available' ? <Text style={[styles.status, { color: entry.state === 'available' ? colors.success : colors.textBody }]}>{status}</Text> : null}
        {url && (entry.state === 'available' || entry.state === 'unknown') ? <Pressable onPress={() => open(url)}
          accessibilityRole="link" accessibilityLabel={`${bookingLabel} for ${fullName}`}
          accessibilityHint={direct ? 'Opens the site reservation page in your browser.' : 'Opens park reservations. Select this site and your dates there.'}
          style={styles.booking}>
          <Text style={[styles.bookingText, { color: colors.interactive }]}>{bookingLabel}</Text>
          <ControlIcon name="open-outline" size={15} color={colors.interactive} />
        </Pressable> : null}
        </View>
      </View>
    </View>
    {policyNote ? <Text style={[styles.meta, { color: colors.textMuted }]}>{policyNote}</Text> : null}
    {expanded ? <View style={[styles.details, { borderTopColor: colors.border }]}>
      {photos.length ? <CampsitePhotos photos={photos} label={fullName} large /> : null}
      {name !== fullName ? <Text style={[styles.meta, { color: colors.textMuted }]}>{fullName}</Text> : null}
      {entry.nights.map(night => <Text key={night.date} style={[styles.night, { color: colors.textBody }]}>
        {dateLabel(night.date)} · {campsiteStateLabel[night.state]}
      </Text>)}
      {!direct && url ? <Text style={[styles.meta, { color: colors.textMuted }]}>Select this site and your dates on the park’s reservation page.</Text> : null}
      {policyUrl ? <Pressable accessibilityRole="link" onPress={() => open(policyUrl)} style={styles.booking}>
        <Text style={[styles.bookingText, { color: colors.interactive }]}>Park’s camping rules</Text>
        <ControlIcon name="open-outline" size={15} color={colors.interactive} />
      </Pressable> : null}
    </View> : null}
    {failed ? <Text style={[styles.meta, { color: colors.error }]}>Couldn’t open the link. Try again.</Text> : null}
  </View>;
}
const styles = StyleSheet.create({
  card: { borderRadius: 14, borderWidth: StyleSheet.hairlineWidth, padding: 10, gap: 8 },
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  placeholder: { width: 88, height: 88, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  smallPlaceholder: { width: 68, height: 54 },
  body: { flex: 1, minWidth: 0, gap: 2 },
  summary: { minHeight: 44, gap: 3 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  name: { ...t.base, fontFamily: fonts.semibold, flex: 1 },
  smallName: { ...t.sm },
  meta: { ...t.xs, fontFamily: fonts.body },
  footer: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', columnGap: 8, rowGap: 0 },
  bookingOnly: { justifyContent: 'flex-end' },
  status: { ...t.xs, fontFamily: fonts.medium, flexShrink: 1 },
  booking: { minHeight: 44, minWidth: 44, flexDirection: 'row', alignItems: 'center', gap: 6 },
  bookingText: { ...t.sm, fontFamily: fonts.semibold, flexShrink: 1 },
  details: { borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 10, gap: 8 },
  night: { ...t.sm, fontFamily: fonts.body },
});
