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
  /** Campground-level photo; absent on older cached responses. */
  imageUrl?: string | null;
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
  /**
   * riverMile is the access point's mile on riverSlug, the river page's ruler.
   * Absent on older cached responses; null when the access has no mile.
   */
  accessDestination: { riverSlug: string; accessId: string; riverMile?: number | null } | null;
}
export interface TrackedCampground extends CampingPlace {
  facilityId: string;
  serviceId: string | null;
  loopName: string | null;
  source: 'recreation_gov' | 'mo_state_parks';
  booking: { url: string; label: string } | null;
  latestObservationAt: string | null;
  // Largest bookable inventory seen on any stored night checked within 30
  // days. A sizing baseline for coverage, not a claim about any one night.
  expectedReservable: number | null;
  // History is pruned, so absence cannot prove "never observed".
  freshness: 'fresh' | 'stale' | 'unknown';
  nights: CampingObservation[];
}
export interface CampingOverview {
  schemaVersion: 1;
  /** River identity is available even when live conditions cannot be loaded. */
  rivers?: { slug: string; name: string; path: string }[];
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
