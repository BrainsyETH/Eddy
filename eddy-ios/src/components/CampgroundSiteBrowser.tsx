import { useMemo, useState } from 'react';
import { useRouter } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { CampsiteAvailabilitySummary } from '@eddy/types';
import { useCampsiteSites } from '@/hooks/useCampsiteSites';
import { useObservationClock } from '@/hooks/useObservationClock';
import { checkedLabel } from '@/lib/campingHeatmap';
import { openExternalLink } from '@/lib/openExternalLink';
import { useTheme } from '@/theme/ThemeProvider';
import { fonts, type as t } from '@/theme/typography';
import { ControlIcon } from './ControlIcon';
import { FilterChips } from './FilterChips';
import { CampingNightPicker } from './map-sheet/CampingNightPicker';
import { CampsiteList } from './map-sheet/CampsiteList';
import { defaultNight, localToday, nightChoices, nightPhrase } from './map-sheet/availability';
import type { BookingAction } from './map-sheet/campgroundFacts';
import { Absent, LinkRow, Section } from './map-sheet/sections';
import { commonSiteFeatures, filterCounts, isBookable, listsRows, narrowingSiteFilters, sitesOnNight, type SiteFilter } from './map-sheet/siteList';

/** One site picker for the map tab and full access pages, including Favorites. */
export function CampgroundSiteBrowser({ availability, facilityId = availability?.facilityId, name, booking, riverSlug, active = true }: {
  availability: CampsiteAvailabilitySummary | null;
  // Identity survives an expired summary; its old counts must not be reused.
  facilityId?: string;
  name: string;
  booking: BookingAction | null;
  riverSlug?: string;
  active?: boolean;
}) {
  const router = useRouter();
  const now = useObservationClock();
  const { colors } = useTheme();
  const today = localToday();
  const nights = useMemo(() => nightChoices(availability, today), [availability, today]);
  // Only measured nights earn a calendar cell. Longer stays use the existing picker.
  const offered = nights.filter(night => night.mark !== 'none');
  const [selected, setSelected] = useState<string | null>(null);
  const selectedDate = selected ?? defaultNight(nights, today) ?? today;
  const selectedNight = nights.find(night => night.date === selectedDate) ?? null;
  const [filters, setFilters] = useState<SiteFilter[]>([]);
  const { sites, status, refresh } = useCampsiteSites(active ? facilityId : null);
  const entries = useMemo(() => {
    if (!sites) return [];
    const age = sites.fetchedAt ? now - Date.parse(sites.fetchedAt) : NaN;
    const fresh = Number.isFinite(age) && age >= 0 && age < 72 * 3600000;
    return sitesOnNight(sites.sites, sites.window.nights, selectedDate, now, fresh);
  }, [sites, selectedDate, now]);
  const counts = filterCounts(entries);
  const individualSites = sites?.facility.source === 'mo_state_parks';
  const showFilters = filters.length > 0 || listsRows(entries, individualSites);
  const activeFilters = showFilters ? filters : [];
  const takeable = entries.filter(isBookable);
  const filterOptions = narrowingSiteFilters(counts, filters, takeable.length);
  const commonFeatures = commonSiteFeatures(counts, takeable.length).filter(f => !filters.includes(f));
  const matches = activeFilters.length && status === 'ready'
    ? takeable.filter(entry => activeFilters.some(f => entry.tags.includes(f))).length : undefined;
  const phrase = selectedNight && (matches === undefined ? nightPhrase(selectedNight) : `${matches} matching ${matches === 1 ? 'site' : 'sites'}`);

  return <View>
    {selectedNight ? <Text accessibilityRole="header" style={[styles.nightStatus, { color: colors.text }]}>
      {[phrase, selectedNight.longLabel].filter(Boolean).join(' · ')}
    </Text> : null}
    {sites?.fetchedAt ? <Text style={[styles.checked, { color: colors.textSubtle }]}>{checkedLabel(sites.fetchedAt, now)}</Text> : null}
    {offered.length ? <CampingNightPicker nights={offered} selected={selectedDate} onSelect={setSelected} /> : null}
    {booking ? <Pressable onPress={() => void openExternalLink(booking.url)}
      accessibilityRole="link" accessibilityLabel={`${booking.label}. Opens in the browser.`}
      style={({ pressed }) => [styles.book, { borderColor: colors.interactive, opacity: pressed ? 0.6 : 1 }]}>
      <ControlIcon name="calendar-outline" size={16} color={colors.interactive} />
      <Text style={[styles.bookText, { color: colors.interactive }]}>{booking.label}</Text>
      <ControlIcon name="open-outline" size={14} color={colors.interactive} />
    </Pressable> : null}
    {facilityId ? <Section>
      {status === 'ready' && sites ? <>
        {commonFeatures.length ? <Text style={[styles.checked, { color: colors.textMuted }]}>{commonFeatures.join(' · ')}</Text> : null}
        {showFilters && filterOptions.length ? <FilterChips
          chips={filterOptions.map(f => ({ key: f, label: f, count: counts[f] }))}
          active={filters}
          onToggle={key => setFilters(current => current.includes(key as SiteFilter)
            ? current.filter(f => f !== key) : [...current, key as SiteFilter])}
          paddingHorizontal={0}
        /> : null}
        {activeFilters.length ? <Pressable accessibilityRole="button" onPress={() => setFilters([])} style={styles.clearFilters}>
          <Text style={[styles.bookText, { color: colors.interactive }]}>Clear filters</Text>
        </Pressable> : null}
        <CampsiteList campgroundName={name} now={now} reservationUrl={booking?.url}
          individualSites={individualSites}
          photoFacilityId={active && (individualSites || sites.facility.source === 'recreation_gov') ? sites.facility.id : undefined}
          entries={entries} filters={activeFilters} date={selectedDate} dateLabel={selectedNight?.longLabel}
        />
      </> : status === 'failed' ? <Pressable accessibilityRole="button" onPress={refresh} style={styles.clearFilters}>
        <Text style={[styles.bookText, { color: colors.interactive }]}>Couldn’t load sites. Retry</Text>
      </Pressable> : status === 'ready' ? <Absent>Individual site data is not available.</Absent>
        : <Absent>Loading sites…</Absent>}
      <LinkRow label="Choose a longer stay" symbol="campground" detail={selectedNight?.longLabel}
        onPress={() => router.push({ pathname: '/camping', params: { facility: facilityId, night: selectedDate, ...(riverSlug ? { river: riverSlug } : {}) } })} />
    </Section> : null}
  </View>;
}

const styles = StyleSheet.create({
  checked: { ...t.xs, fontFamily: fonts.body, marginTop: 8 },
  nightStatus: { ...t.base, fontFamily: fonts.heading, marginTop: 10 },
  book: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, minHeight: 44,
    paddingHorizontal: 12, paddingVertical: 10, marginTop: 12, borderRadius: 10, borderWidth: 1.5 },
  bookText: { ...t.sm, fontFamily: fonts.semibold, flexShrink: 1 },
  clearFilters: { minHeight: 44, justifyContent: 'center', alignSelf: 'flex-start' },
});
