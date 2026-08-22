import type { RawFinding, TrustCheck } from '../types';

export interface CanonicalRiverMetadataRow {
  slug: string;
  weather_city: string | null;
  weather_lat: number | null;
  weather_lon: number | null;
  alert_search_terms: string[] | null;
  river_characteristics: Array<{ rain_lag_hours: number | null; rain_lag_note: string | null; drop_rate_note: string | null; river_note: string | null }> | null;
}

export function deriveRiverMetadataFindings(rows: CanonicalRiverMetadataRow[]): RawFinding[] {
  return rows.flatMap((row) => {
    const findings: RawFinding[] = [];
    if (!row.weather_city?.trim() || row.weather_lat == null || row.weather_lon == null) findings.push({
      entityType: 'river', entityKey: row.slug, ruleKey: 'canonical_weather_missing',
      title: `${row.slug}: canonical weather point is incomplete`,
      detail: 'rivers.weather_city, weather_lat, and weather_lon are required; no code fallback remains.',
    });
    if (!row.alert_search_terms?.some((term) => term.trim().length > 0)) findings.push({
      entityType: 'river', entityKey: row.slug, ruleKey: 'canonical_alert_terms_missing',
      title: `${row.slug}: canonical NWS alert terms are missing`,
      detail: 'rivers.alert_search_terms must contain at least one non-empty term; unmatched alerts are suppressed.',
    });
    const rc = row.river_characteristics?.[0];
    if (rc?.rain_lag_hours == null || !rc.rain_lag_note?.trim() || !rc.drop_rate_note?.trim()) findings.push({
      entityType: 'river', entityKey: row.slug, ruleKey: 'canonical_rain_lag_missing',
      title: `${row.slug}: canonical rain-lag metadata is incomplete`,
      detail: 'river_characteristics.rain_lag_hours, rain_lag_note, and drop_rate_note are required; Eddy omits rain-lag guidance when absent.',
    });
    if (!rc?.river_note?.trim()) findings.push({
      entityType: 'river', entityKey: row.slug, ruleKey: 'canonical_river_note_missing',
      title: `${row.slug}: canonical river note is missing`,
      detail: 'river_characteristics.river_note is required; no hardcoded local-color fallback remains.',
    });
    return findings;
  });
}

export const riverMetadataCheck: TrustCheck = {
  id: 'river_metadata', title: 'Canonical river metadata coverage', cadence: 'hourly',
  async run(ctx) {
    const { data, error } = await ctx.supabase.from('rivers')
      .select('slug, weather_city, weather_lat, weather_lon, alert_search_terms, river_characteristics(rain_lag_hours, rain_lag_note, drop_rate_note, river_note)')
      .eq('active', true).order('slug');
    if (error) throw new Error(`Failed to load canonical river metadata: ${error.message}`);
    const rows = (data ?? []) as CanonicalRiverMetadataRow[];
    return { scopeCount: rows.length, findings: deriveRiverMetadataFindings(rows) };
  },
};
