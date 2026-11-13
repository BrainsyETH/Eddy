import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { NearbyService } from '@eddy/types';
import { ControlIcon } from '@/components/ControlIcon';
import { CampgroundThumbnail } from '@/components/CampgroundThumbnail';
import { EddySymbol, type EddySymbolName } from '@/components/EddySymbol';
import { openExternalLink } from '@/lib/openExternalLink';
import { serviceContactActions } from '@/lib/serviceContactActions';
import { useTheme } from '@/theme/ThemeProvider';
import { sheetControl } from '@/theme/palette';
import { fonts, type as t } from '@/theme/typography';
import { FoldedProse } from './sections';

/** A business and its actions stay together, without making its name a dead link. */
export function ServiceContactRow({ service, symbol, onOpenCamping, imageUrl }: {
  service: NearbyService;
  symbol: EddySymbolName;
  onOpenCamping?: (() => void) | null;
  imageUrl?: string | null;
}) {
  const { colors } = useTheme();
  const actions = serviceContactActions(service);
  const isCamping = symbol === 'campground';
  const location = service.relationship === 'same_place'
    ? 'At this access'
    : service.relationship === 'located_at' ? 'At this location' : service.distance;
  const heading = (
    <>
      {!isCamping ? <EddySymbol name={symbol} size={24} /> : null}
      <View style={styles.identity}>
        <Text style={[styles.name, { color: colors.text }]}>{service.name}</Text>
        {onOpenCamping ? (
          <Text style={[styles.meta, { color: colors.interactive }]}>View camping</Text>
        ) : location ? <Text style={[styles.meta, { color: colors.textMuted }]}>{location}</Text> : null}
      </View>
      {onOpenCamping ? <ControlIcon name="chevron-forward" size={16} color={colors.interactive} /> : null}
    </>
  );

  return (
    <View style={[styles.card, isCamping && styles.withThumbnail, { backgroundColor: colors.scheme === 'dark' ? colors.card : colors.cardRaised, borderColor: colors.border }]}>
      {isCamping ? <CampgroundThumbnail url={imageUrl} /> : null}
      <View style={isCamping ? styles.content : undefined}>
        {onOpenCamping ? (
          <Pressable
            onPress={onOpenCamping}
            accessibilityRole="button"
            accessibilityLabel={`View camping at ${service.name}`}
            style={({ pressed }) => [styles.heading, styles.campingLink, { opacity: pressed ? 0.6 : 1 }]}
          >
            {heading}
          </Pressable>
        ) : <View style={styles.heading}>{heading}</View>}
        <FoldedProse lines={2} subject={`details about ${service.name}`}>{service.notes}</FoldedProse>
        {actions.length ? (
          <View style={styles.actions}>
            {actions.map((action) => (
              <Pressable
                key={action.label}
                accessibilityRole="link"
                accessibilityLabel={`${action.label}: ${service.name}`}
                onPress={() => void openExternalLink(action.url)}
                style={({ pressed }) => [styles.action, sheetControl(colors), { opacity: pressed ? 0.6 : 1 }]}
              >
                <ControlIcon name={action.label === 'Call' ? 'call-outline' : 'open-outline'} size={16} color={colors.interactive} />
                <Text style={[styles.actionText, { color: colors.interactive }]}>{action.label}</Text>
              </Pressable>
            ))}
          </View>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 8, marginTop: 8 },
  withThumbnail: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  content: { flex: 1, minWidth: 0 },
  heading: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  identity: { flex: 1, minWidth: 0 },
  name: { ...t.base, fontFamily: fonts.semibold },
  meta: { ...t.sm, fontFamily: fonts.body, marginTop: 2 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 6 },
  action: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, minHeight: 44, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8 },
  actionText: { ...t.sm, fontFamily: fonts.semibold, flexShrink: 1 },
  campingLink: { minHeight: 44 },
});
