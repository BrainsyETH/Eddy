import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { CampsiteAvailabilitySummary } from '@eddy/types';
import { useTheme } from '@/theme/ThemeProvider';
import { fonts, type as t } from '@/theme/typography';
import { CampgroundSiteBrowser } from './CampgroundSiteBrowser';
import { ControlIcon } from './ControlIcon';
import { EddySymbol } from './EddySymbol';
import { CampgroundAvailability } from './map-sheet/CampgroundAvailability';
import type { BookingAction } from './map-sheet/campgroundFacts';

/** Keep the page compact until the reader chooses to browse this campground. */
export function AccessCampingSites({ availability, facilityId, name, today, age, booking, riverSlug }: {
  availability: CampsiteAvailabilitySummary | null;
  facilityId?: string;
  name: string;
  today: string;
  age?: string;
  booking: BookingAction | null;
  riverSlug: string;
}) {
  const { colors } = useTheme();
  const [open, setOpen] = useState(false);
  return <View>
    {!open ? <>
      <CampgroundAvailability wrapText style={styles.chart} availability={availability} name={name} today={today}
        pending={!availability} pendingLabel="Availability out of date" />
      {age && age !== 'Time unknown' ? <Text style={[styles.checked, { color: colors.textMuted }]}>Checked {age}</Text> : null}
    </> : null}
    {facilityId ? <View style={styles.content}>
      <Pressable accessibilityRole="button" accessibilityState={{ expanded: open }}
        accessibilityLabel={`${open ? 'Hide sites' : 'Choose a site'} at ${name}`}
        onPress={() => setOpen(value => !value)}
        style={({ pressed }) => [styles.choose, { borderColor: colors.border, backgroundColor: colors.card, opacity: pressed ? 0.6 : 1 }]}>
        <EddySymbol name="campground" size={24} />
        <Text style={[styles.chooseText, { color: colors.interactive }]}>{open ? 'Hide sites' : 'Choose a site'}</Text>
        <ControlIcon name={open ? 'chevron-up' : 'chevron-down'} size={18} color={colors.interactive} />
      </Pressable>
      {open ? <CampgroundSiteBrowser availability={availability} facilityId={facilityId} name={name}
        booking={booking} riverSlug={riverSlug} /> : null}
    </View> : null}
  </View>;
}

const styles = StyleSheet.create({
  chart: { marginHorizontal: 16, marginTop: 8, marginBottom: 4 },
  checked: { ...t.xs, fontFamily: fonts.body, paddingHorizontal: 20, marginTop: 8 },
  content: { paddingHorizontal: 16, marginTop: 12 },
  choose: { minHeight: 48, paddingVertical: 10, paddingHorizontal: 12, borderWidth: 1, borderRadius: 12,
    flexDirection: 'row', alignItems: 'center', gap: 8 },
  chooseText: { ...t.sm, fontFamily: fonts.semibold, flex: 1 },
});
