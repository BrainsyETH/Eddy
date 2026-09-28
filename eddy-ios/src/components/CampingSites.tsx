import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import { useCampsiteSites } from '@/hooks/useCampsiteSites';
import { useTheme } from '@/theme/ThemeProvider';
import { CampsiteList } from '@/components/map-sheet/CampsiteList';
import { sitesOnNight } from '@/components/map-sheet/siteList';
import { checkedLabel, dateLabel } from '@/lib/campingHeatmap';

// Mount only after the person asks. Facility identity does not depend on fresh counts.
function LoadedSites({
  facilityId,
  date,
  bookingUrl,
}: {
  facilityId: string;
  date: string;
  bookingUrl?: string;
}) {
  const { colors } = useTheme();
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 60000);
    return () => clearInterval(timer);
  }, []);
  const { sites, status } = useCampsiteSites(facilityId);
  if (status === 'loading')
    return (
      <ActivityIndicator
        accessibilityLabel="Loading individual sites"
        color={colors.interactive}
      />
    );
  if (status === 'failed')
    return (
      <Text style={{ color: colors.textMuted }}>
        Sites could not load. Close and reopen to retry.
      </Text>
    );
  if (!sites?.sites.length)
    return (
      <Text style={{ color: colors.textMuted }}>
        Individual site data is not available.
      </Text>
    );
  const age = sites.fetchedAt ? now - Date.parse(sites.fetchedAt) : NaN;
  const stale = !Number.isFinite(age) || age < 0 || age >= 72 * 3600000;
  if (stale)
    return (
      <Text style={{ color: colors.textMuted }}>
        Individual site availability needs an update.{' '}
        {checkedLabel(sites.fetchedAt)}
      </Text>
    );
  return (
    <View>
      <Text style={{ color: colors.textMuted }}>
        {checkedLabel(sites.fetchedAt)}
      </Text>
      <CampsiteList
        entries={sitesOnNight(sites.sites, sites.window.nights, date)}
        filters={[]}
        date={date}
        dateLabel={dateLabel(date)}
        individualSites={sites.facility.source === 'mo_state_parks'}
        photoFacilityId={sites.facility.id}
        reservationUrl={bookingUrl}
      />
    </View>
  );
}
export function CampingSites({
  facilityId,
  date,
  bookingUrl,
  autoOpen = false,
}: {
  facilityId: string;
  date: string;
  bookingUrl?: string;
  autoOpen?: boolean;
}) {
  const { colors } = useTheme();
  const [open, setOpen] = useState(false);
  if (autoOpen)
    return (
      <LoadedSites
        facilityId={facilityId}
        date={date}
        bookingUrl={bookingUrl}
      />
    );
  return (
    <View>
      <Pressable
        onPress={() => setOpen((v) => !v)}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        style={{ minHeight: 44, justifyContent: 'center', paddingVertical: 10 }}
      >
        <Text style={{ color: colors.interactive }}>
          {open ? 'Hide individual sites' : 'View individual sites'}
        </Text>
      </Pressable>
      {open ? (
        <LoadedSites
          facilityId={facilityId}
          date={date}
          bookingUrl={bookingUrl}
        />
      ) : null}
    </View>
  );
}
