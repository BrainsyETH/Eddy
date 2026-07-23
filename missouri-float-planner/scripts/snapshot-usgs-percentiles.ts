#!/usr/bin/env npx tsx
import { createAdminClient } from '../src/lib/supabase/admin';

const STAT_URL = 'https://waterservices.usgs.gov/nwis/stat/';
const PARAMETER = '00060';

interface StatRow {
  month_nu: string;
  day_nu: string;
  p05_va?: string;
  p10_va?: string;
  p20_va?: string;
  p25_va?: string;
  p50_va?: string;
  p75_va?: string;
  p80_va?: string;
  p90_va?: string;
  p95_va?: string;
  begin_yr?: string;
  end_yr?: string;
  count_nu?: string;
}

function number(value?: string): number | null {
  if (!value || value === '-999999') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function dayOfYear(month: number, day: number): number {
  return Math.floor((Date.UTC(2024, month - 1, day) - Date.UTC(2024, 0, 0)) / 86_400_000);
}

async function fetchRows(siteNo: string) {
  const url = new URL(STAT_URL);
  url.searchParams.set('format', 'json');
  url.searchParams.set('sites', siteNo);
  url.searchParams.set('statReportType', 'daily');
  url.searchParams.set('statTypeCd', 'p05,p10,p20,p25,p50,p75,p80,p90,p95');
  url.searchParams.set('parameterCd', PARAMETER);
  const response = await fetch(url);
  if (!response.ok) throw new Error(`USGS ${siteNo}: ${response.status}`);
  const json = await response.json();
  const series = json?.value?.timeSeries?.find(
    (entry: { variable?: { variableCode?: Array<{ value?: string }> } }) =>
      entry.variable?.variableCode?.[0]?.value === PARAMETER,
  );
  const stats = (series?.values?.[0]?.value || []) as StatRow[];
  return stats.map((row) => ({
    site_no: siteNo,
    parameter_code: PARAMETER,
    day_of_year: dayOfYear(Number(row.month_nu), Number(row.day_nu)),
    p05: number(row.p05_va), p10: number(row.p10_va), p20: number(row.p20_va),
    p25: number(row.p25_va), p50: number(row.p50_va), p75: number(row.p75_va),
    p80: number(row.p80_va), p90: number(row.p90_va), p95: number(row.p95_va),
    begin_year: number(row.begin_yr), end_year: number(row.end_yr),
    count_years: number(row.count_nu), snapshotted_at: new Date().toISOString(),
  }));
}

async function main() {
  const admin = createAdminClient();
  const requested = process.argv.slice(2).filter((arg) => !arg.startsWith('-'));
  let sites = requested;
  if (!sites.length) {
    const { data, error } = await admin.from('gauge_stations')
      .select('usgs_site_id').eq('active', true).not('usgs_site_id', 'is', null);
    if (error) throw error;
    sites = Array.from(new Set((data || []).map((row) => row.usgs_site_id).filter(Boolean)));
  }

  for (const site of sites) {
    const rows = await fetchRows(site);
    for (let index = 0; index < rows.length; index += 500) {
      const { error } = await admin.from('usgs_daily_percentiles')
        .upsert(rows.slice(index, index + 500), { onConflict: 'site_no,parameter_code,day_of_year' });
      if (error) throw error;
    }
    console.log(`[USGS snapshot] ${site}: ${rows.length} days`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
