import type { CampingNightState, CampsiteStay } from './camping-stay';

/** Published operating rules, not an observation that a campsite is empty. */
export interface CampingSitePolicy {
  sourceUrl: string;
  checkedAt: string;
  reviewBy: string;
  periods: {
    startDate: string;
    endDateExclusive: string;
    bookingMethod: 'first_come' | 'reservation';
    operation: 'open' | 'closed';
  }[];
}

export function campingPolicyPeriod(policy: CampingSitePolicy | undefined, date: string, now: number) {
  if (!policy || !Number.isFinite(now) ||
    !(Date.parse(policy.checkedAt) <= now && now < Date.parse(policy.reviewBy))) return undefined;
  return policy.periods.find(p => p.startDate <= date && date < p.endDateExclusive);
}

/** A closure restricts a stay. First-come policy can fill an unknown, never
 * override a reported booking/closure or promise an empty reservable site. */
export function campingNightWithPolicy(
  observed: CampingNightState, date: string, policy: CampingSitePolicy | undefined, now: number,
): CampingNightState {
  const period = campingPolicyPeriod(policy, date, now);
  if (period?.operation === 'closed') return 'closed';
  if (observed === 'unknown' && period?.operation === 'open' && period.bookingMethod === 'first_come') return 'walk_up';
  return observed;
}

export function campingStayState(nights: readonly { state: CampingNightState }[]): CampsiteStay['state'] {
  if (!nights.length) return 'unknown';
  if (nights.every(n => n.state === 'open')) return 'available';
  if (nights.every(n => n.state === 'walk_up')) return 'first_come';
  if (nights.some(n => ['reserved', 'closed', 'not_yet_released'].includes(n.state))) return 'unavailable';
  return 'unknown';
}

/** Reapply rules when an observation expires, without giving old openings a
 * fresh timestamp. Keep the original state so expired rules can also fall away. */
export function currentPolicyStay(entry: CampsiteStay, observationsFresh: boolean, now: number): CampsiteStay {
  if (!entry.site.policy) return observationsFresh ? entry : {
    ...entry, state: 'unknown', nights: entry.nights.map(night => ({ ...night, state: 'unknown' })),
  };
  const nights = entry.nights.map(night => {
    const observedState = observationsFresh ? night.observedState ?? night.state : 'unknown';
    const state = campingNightWithPolicy(observedState, night.date, entry.site.policy, now);
    return { ...night, observedState, state };
  });
  return { ...entry, nights, state: campingStayState(nights) };
}

export function campingPolicyNote(entry: CampsiteStay, now: number): string | null {
  if (!entry.nights.length || !entry.nights.every(n =>
    campingPolicyPeriod(entry.site.policy, n.date, now)?.bookingMethod === 'first_come')) return null;
  return entry.nights.every(n => n.state === 'closed')
    ? 'First-come site when open'
    : 'First come · Space is not guaranteed';
}

/** Same words on the web and iPhone site cards. */
export function campingStayLabel(entry: CampsiteStay): string {
  if (entry.state === 'available') return 'Available for your stay';
  if (entry.state === 'first_come') return 'First come · No reservations';
  if (entry.nights.length && entry.nights.every(n => n.state === 'closed')) return 'Closed for your stay';
  if (entry.state === 'unknown') return 'Availability not updated';
  const open = entry.nights.filter(n => n.state === 'open').length;
  return open ? `${open} of ${entry.nights.length} nights open` : 'Unavailable for your stay';
}
