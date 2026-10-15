/** Wire contract for the server's same-site stay search. Checkout is exclusive. */
export interface CampingStay {
  arrival: string;
  departure: string;
}
export type CampingNightState =
  'open' | 'reserved' | 'walk_up' | 'closed' | 'not_yet_released' | 'unknown';
export interface StaySite {
  id: string;
  name: string | null;
  loop: string | null;
  siteType: string | null;
  maxOccupancy: number | null;
  bookingUrl: string | null;
  nights: string;
}
export interface CampsiteStay {
  site: StaySite;
  nights: { date: string; state: CampingNightState }[];
  state: 'available' | 'first_come' | 'unavailable' | 'unknown';
}
export interface CampingStayResult extends CampingStay {
  facilityId: string;
  fetchedAt: string | null;
  /** Exactly the sites that are reservable and open on every occupied night. */
  availableSites: StaySite[];
  sites: CampsiteStay[];
  /** Missing observations cannot substantiate a whole-stay count. */
  summary: {
    sitesOpen: number;
    sitesReservable: number;
    sitesWalkUp: number;
    status: 'open' | 'full' | 'closed' | 'not_yet_released';
  } | null;
}
export function nextCampingDate(date: string, days = 1): string {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
function validDate(date: string): boolean {
  return (
    /^\d{4}-\d{2}-\d{2}$/.test(date) &&
    Number.isFinite(Date.parse(date)) &&
    new Date(`${date}T12:00:00Z`).toISOString().slice(0, 10) === date
  );
}
/** Reject invalid or overlong ranges instead of silently truncating them. */
export function stayNights(stay: CampingStay): string[] {
  if (
    !validDate(stay.arrival) ||
    !validDate(stay.departure) ||
    stay.departure <= stay.arrival
  )
    return [];
  const count =
    (Date.parse(stay.departure) - Date.parse(stay.arrival)) / 86400000;
  if (count > 90) return [];
  return Array.from({ length: count }, (_, i) =>
    nextCampingDate(stay.arrival, i),
  );
}
