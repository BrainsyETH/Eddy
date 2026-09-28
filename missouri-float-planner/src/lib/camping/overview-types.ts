// Public camping overview contract. Kept in sync with @eddy/types by a type test.
export interface CampingPlaceRef {
  type: 'access_point' | 'nps_campground' | 'service';
  id: string;
}
export interface CampingObservation {
  date: string;
  sitesOpen: number;
  sitesReservable: number;
  status: 'open' | 'full' | 'closed' | 'not_yet_released';
  checkedAt: string;
}
export interface CampingPlace {
  id: string;
  name: string;
  place: CampingPlaceRef | null;
  location: { lat: number; lng: number } | null;
  riverSlugs: string[];
  displayGroup: { key: string; label: string };
  managingAgency: string | null;
  website: string | null;
  reservationUrl: string | null;
  firstCome: 'present' | 'none' | 'unknown';
  accessDestination: { riverSlug: string; accessId: string } | null;
}
export interface TrackedCampground extends CampingPlace {
  facilityId: string;
  serviceId: string | null;
  loopName: string | null;
  source: 'recreation_gov' | 'mo_state_parks';
  booking: { url: string; label: string } | null;
  latestObservationAt: string | null;
  // History is pruned, so absence cannot prove "never observed".
  freshness: 'fresh' | 'stale' | 'unknown';
  nights: CampingObservation[];
}
export interface CampingOverview {
  schemaVersion: 1;
  generatedAt: string;
  maxObservationAgeSeconds: number;
  timeZone: 'America/Chicago';
  horizon: { startDate: string; endDateExclusive: string; nights: string[] };
  weekend: {
    startDate: string;
    endDateExclusive: string;
    nights: string[];
    label: string;
  };
  tracked: TrackedCampground[];
  untracked: CampingPlace[];
}
