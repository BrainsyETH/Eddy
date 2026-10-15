import type { RawFinding, TrustCheck, TrustCheckContext } from '../types';
import { mustRows } from '../db';
import { facilityBookingUrl } from '../../camping/booking';
import { safeCampingUrl } from '../../camping/overview';
import { resolveHorizon, PLANNING_NIGHTS } from '../../camping/window';
import { nextCampingDate } from '../../../../shared/camping-stay';

export interface CampingFacility {
  id: string;
  display_name: string;
  enabled: boolean;
  source: string;
  source_facility_id: string;
  source_loop: string | null;
  last_synced_at: string | null;
  nearby_services: { reservation_url: string | null } | null;
  nps_campgrounds: { reservation_url: string | null } | null;
  observations: { count: number }[];
}
export interface CampingObservation {
  facility_id: string;
  date: string;
  status: string;
  fetched_at: string;
}

/** Stable per-facility findings. A missing row is coverage, never a claim of closure. */
export function campingInventoryFindings(
  facilities: CampingFacility[],
  observations: CampingObservation[],
): RawFinding[] {
  const findings: RawFinding[] = [];
  for (const facility of facilities.filter((f) => f.enabled)) {
    const raise = (
      ruleKey: string,
      title: string,
      detail: string,
      evidence: Record<string, unknown> = {},
    ) =>
      findings.push({
        entityType: 'global',
        entityKey: `campground:${facility.id}`,
        ruleKey,
        title: `${facility.display_name}: ${title}`,
        detail,
        evidence: {
          facilityId: facility.id,
          source: facility.source,
          ...evidence,
        },
      });
    const storedUrl =
      safeCampingUrl(facility.nearby_services?.reservation_url) ??
      safeCampingUrl(facility.nps_campgrounds?.reservation_url);
    if (!facilityBookingUrl(facility, storedUrl)) {
      raise(
        'camping_missing_reservation_url',
        'no usable reservation URL',
        'This tracked campground has no provider reservation destination in the camping overview. Verify and add its official reservation URL.',
      );
    }
    if (facility.last_synced_at && facility.observations[0]?.count === 0) {
      raise(
        'camping_synced_without_observations',
        'synced without any observations',
        'The enabled facility has been attempted but has no campsite_availability rows. A successful queue stamp does not establish that inventory was measured.',
        { lastSyncedAt: facility.last_synced_at },
      );
    }
    const rows = observations.filter((r) => r.facility_id === facility.id);
    // Inspect the newest provider snapshot, so retained older rows cannot fill
    // holes in a newly truncated response. Unobserved leading/trailing dates are
    // not assumed to be in season or released.
    const latest = Math.max(...rows.map((r) => Date.parse(r.fetched_at)));
    const dates = [
      ...new Set(
        rows
          .filter((r) => Date.parse(r.fetched_at) === latest)
          .map((r) => r.date),
      ),
    ].sort();
    if (dates.length < 2) continue;
    const present = new Set(dates);
    const missing: string[] = [];
    for (
      let date = dates[0];
      date < dates[dates.length - 1];
      date = nextCampingDate(date)
    ) {
      if (!present.has(date)) missing.push(date);
    }
    if (missing.length)
      raise(
        'camping_calendar_gaps',
        `${missing.length} unobserved calendar nights`,
        'The latest calendar has missing dates inside its observed range. Explicit closed and not-yet-released rows count as observations; absent rows do not. Verify provider range limits and season boundaries before repairing the sync.',
        {
          startDate: dates[0],
          endDate: dates[dates.length - 1],
          missingDates: missing,
          fetchedAt: new Date(latest).toISOString(),
        },
      );
  }
  return findings;
}

export const campingInventoryCheck: TrustCheck = {
  id: 'camping_inventory',
  title: 'Camping links, observations and calendar coverage',
  cadence: 'daily',
  async run(ctx: TrustCheckContext) {
    const facilities: CampingFacility[] = [];
    const observations: CampingObservation[] = [];
    const pageSize = 900;
    for (let offset = 0; ; offset += pageSize) {
      if (Date.now() >= ctx.deadlineMs)
        return { scopeCount: facilities.length, findings: [], partial: true };
      const page = await mustRows<CampingFacility>(
        ctx.supabase
          .from('campsite_facilities')
          .select(
            'id,display_name,enabled,source,source_facility_id,source_loop,last_synced_at,nearby_services(reservation_url),nps_campgrounds(reservation_url),observations:campsite_availability(count)',
          )
          .eq('enabled', true)
          .order('id')
          .range(offset, offset + pageSize - 1),
        'camping inventory facilities',
      );
      facilities.push(...page);
      if (page.length < pageSize) break;
    }
    if (!facilities.length) return { scopeCount: 0, findings: [] };
    const window = resolveHorizon(ctx.now, PLANNING_NIGHTS);
    for (let offset = 0; ; offset += pageSize) {
      if (Date.now() >= ctx.deadlineMs)
        return { scopeCount: facilities.length, findings: [], partial: true };
      const page = await mustRows<CampingObservation>(
        ctx.supabase
          .from('campsite_availability')
          .select('facility_id,date,status,fetched_at')
          .in(
            'facility_id',
            facilities.map((f) => f.id),
          )
          .in('date', window.nights)
          .order('facility_id')
          .order('date')
          .range(offset, offset + pageSize - 1),
        'camping inventory observations',
      );
      observations.push(...page);
      if (page.length < pageSize) break;
    }
    return {
      scopeCount: facilities.length,
      findings: campingInventoryFindings(facilities, observations),
    };
  },
};
