/** Optional descriptive data, fetched separately from live campsite availability. */
export type CampsiteFactKey = 'setting' | 'access' | 'equipment' | 'amenities' | 'hookups' | 'arrival' | 'pets' | 'accessibility';
export interface CampsiteDetailFact {
  key: CampsiteFactKey;
  label: string;
  value: string;
}
export interface CampsiteDetails {
  source: 'Recreation.gov';
  sourceUrl: string;
  facts: CampsiteDetailFact[];
  notes: string[];
}
export interface CampsiteDetailsResponse {
  facilityId: string;
  siteId: string;
  /** Null means no supported descriptive source; errors remain retryable. */
  details: CampsiteDetails | null;
}
