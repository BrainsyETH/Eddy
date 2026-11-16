import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { NearbyService } from '@eddy/types';
import { ControlIcon } from '@/components/ControlIcon';
import { CampgroundThumbnail } from '@/components/CampgroundThumbnail';
import { EddySymbol, type EddySymbolName } from '@/components/EddySymbol';
import { stripHtml } from '@/lib/accessCopy';
import { openExternalLink } from '@/lib/openExternalLink';
import { serviceContactActions } from '@/lib/serviceContactActions';
import { useTheme } from '@/theme/ThemeProvider';
import { fonts, type as t } from '@/theme/typography';

/** One compact summary row, with independent contact targets and optional details. */
export function ServiceContactRow({ service, symbol, onOpenCamping, imageUrl }: {
  service: NearbyService;
  symbol: EddySymbolName;
  onOpenCamping?: (() => void) | null;
  imageUrl?: string | null;
}) {
  const { colors } = useTheme();
  const [expanded, setExpanded] = useState(false);
  const actions = serviceContactActions(service);
  const notes = stripHtml(service.notes);
  const booking = actions.find(action => action.label === 'Book');
  const website = actions.find(action => action.label === 'Website');
  const primary = booking ?? website ?? actions[0];
  const inlineActions = actions.filter(action => action.label === 'Call' || action === (booking ?? website));
  const extraActions = actions.filter(action => !inlineActions.includes(action));
  const hasDetails = Boolean(notes || extraActions.length);
  const location = service.relationship === 'same_place'
    ? 'At this access'
    : service.relationship === 'located_at' ? 'At this location' : service.distance;
  const canOpen = hasDetails || Boolean(onOpenCamping || primary);
  const open = () => {
    if (hasDetails) setExpanded(value => !value);
    else if (onOpenCamping) onOpenCamping();
    else if (primary) void openExternalLink(primary.url);
  };
  const summary = <>
    {symbol === 'campground' ? <CampgroundThumbnail url={imageUrl} /> : <EddySymbol name={symbol} size={28} />}
    <View style={styles.identity}>
      <Text style={[styles.name, { color: colors.text }]}>{service.name}</Text>
      {location ? <Text style={[styles.meta, { color: colors.textMuted }]}>{location}</Text> : null}
    </View>
    {hasDetails ? <ControlIcon name={expanded ? 'chevron-up' : 'chevron-down'} size={14} color={colors.textMuted} />
      : onOpenCamping ? <ControlIcon name="chevron-forward" size={14} color={colors.textMuted} /> : null}
  </>;

  return <View style={[styles.card, { backgroundColor: colors.scheme === 'dark' ? colors.card : colors.cardRaised, borderColor: colors.border }]}>
    <View style={styles.row}>
      {canOpen ? <Pressable onPress={open}
        accessibilityRole={hasDetails || onOpenCamping ? 'button' : 'link'}
        accessibilityLabel={hasDetails ? `Details for ${service.name}` : onOpenCamping ? `View camping at ${service.name}` : `${primary?.label}: ${service.name}`}
        accessibilityState={hasDetails ? { expanded } : undefined}
        style={({ pressed }) => [styles.summary, { opacity: pressed ? 0.6 : 1 }]}>
        {summary}
      </Pressable> : <View style={styles.summary}>{summary}</View>}
      {inlineActions.map(action => <Pressable key={action.label} onPress={() => void openExternalLink(action.url)}
        accessibilityRole="link" accessibilityLabel={`${action.label}: ${service.name}`}
        style={({ pressed }) => [styles.contact, { opacity: pressed ? 0.6 : 1 }]}>
        <ControlIcon name={action.label === 'Call' ? 'call-outline' : action.label === 'Book' ? 'calendar-outline' : 'open-outline'} size={18} color={colors.interactive} />
      </Pressable>)}
    </View>
    {expanded && hasDetails ? <View style={[styles.details, { borderTopColor: colors.border }]}>
      {notes ? <Text style={[styles.notes, { color: colors.textBody }]}>{notes}</Text> : null}
      {onOpenCamping || extraActions.length ? <View style={styles.detailActions}>
        {onOpenCamping ? <Pressable onPress={onOpenCamping} accessibilityRole="button"
          accessibilityLabel={`View camping at ${service.name}`} style={styles.detailAction}>
          <Text style={[styles.actionText, { color: colors.interactive }]}>View camping</Text>
          <ControlIcon name="chevron-forward" size={16} color={colors.interactive} />
        </Pressable> : null}
        {extraActions.map(action => <Pressable key={action.label} onPress={() => void openExternalLink(action.url)}
          accessibilityRole="link" accessibilityLabel={`${action.label}: ${service.name}`} style={styles.detailAction}>
          <ControlIcon name="open-outline" size={16} color={colors.interactive} />
          <Text style={[styles.actionText, { color: colors.interactive }]}>{action.label}</Text>
        </Pressable>)}
      </View> : null}
    </View> : null}
  </View>;
}

const styles = StyleSheet.create({
  card: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 10, paddingVertical: 8, marginTop: 8 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  summary: { flex: 1, minWidth: 0, minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: 8 },
  identity: { flex: 1, minWidth: 0 },
  name: { ...t.sm, fontFamily: fonts.semibold },
  meta: { ...t.xs, fontFamily: fonts.body, marginTop: 2 },
  contact: { minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  details: { borderTopWidth: StyleSheet.hairlineWidth, marginTop: 8, paddingTop: 10, paddingBottom: 2 },
  notes: { ...t.sm, fontFamily: fonts.body },
  detailActions: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginTop: 4 },
  detailAction: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 6 },
  actionText: { ...t.sm, fontFamily: fonts.semibold },
});
