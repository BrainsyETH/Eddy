// src/lib/gauges/station-name.ts
// A USGS station's own catalog name, for page metadata. Shared by the gauge
// page and the fixed-chart share page so a link preview names the station
// rather than its site number.

import { createPublicCatalogClient } from '@/lib/supabase/public-read';

export async function getStationName(siteId: string): Promise<string | null> {
  const supabase = createPublicCatalogClient();
  const { data, error } = await supabase
    .from('gauge_stations')
    .select('name')
    .eq('usgs_site_id', siteId)
    .eq('active', true)
    .maybeSingle();
  if (error) throw error;
  return data?.name || null;
}
