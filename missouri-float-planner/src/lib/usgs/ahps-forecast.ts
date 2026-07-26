// src/lib/usgs/ahps-forecast.ts
// NWS AHPS forecast hydrographs, by NWS location id (LID).
//
// Extracted from src/app/api/usgs/mo-forecast/route.ts so the river outlook
// endpoint can reach the same parser rather than keeping a second copy of an
// XML regex. The route still owns the statewide fan-out and its response shape;
// only the per-LID fetch and parse live here.
//
// AHPS XML schema (relevant parts):
//   <site>
//     <forecast>
//       <datum>
//         <valid timezone="UTC">2026-05-08T12:00:00-00:00</valid>
//         <primary name="Stage" units="ft">5.42</primary>
//       </datum>
//       …
//     </forecast>
//   </site>

const AHPS_BASE = 'https://water.weather.gov/ahps2/hydrograph_to_xml.php';

export interface AhpsForecastDatum {
  dateTime: string;
  /**
   * ALWAYS feet. AHPS publishes stage only, which is why a cfs-rated river still
   * has to be graded against its foot ladder when reading these — never against
   * the discharge thresholds the live condition uses.
   */
  valueFt: number;
}

export function ahpsUrl(lid: string): string {
  return `${AHPS_BASE}?gage=${encodeURIComponent(lid)}&output=xml`;
}

export function parseForecastDatums(xml: string): AhpsForecastDatum[] {
  const block = xml.match(/<forecast[^>]*>([\s\S]*?)<\/forecast>/i)?.[1];
  if (!block) return [];
  const out: AhpsForecastDatum[] = [];
  const datumRegex = /<datum>([\s\S]*?)<\/datum>/gi;
  let m: RegExpExecArray | null;
  while ((m = datumRegex.exec(block)) !== null) {
    const inner = m[1];
    const valid = inner.match(/<valid[^>]*>([^<]+)<\/valid>/i)?.[1]?.trim();
    const primary = inner.match(/<primary[^>]*>([^<]+)<\/primary>/i)?.[1]?.trim();
    if (!valid || !primary) continue;
    const valueFt = parseFloat(primary);
    if (!Number.isFinite(valueFt)) continue;
    out.push({ dateTime: valid, valueFt });
  }
  return out;
}

/**
 * One gauge's forecast hydrograph. Returns [] rather than throwing: AHPS is a
 * third-party service and a river with no official forecast is an ordinary
 * state that the outlook already degrades to weather-only guidance for.
 */
export async function fetchAhpsForecast(lid: string): Promise<AhpsForecastDatum[]> {
  try {
    const res = await fetch(ahpsUrl(lid), {
      signal: AbortSignal.timeout(10_000),
      next: { revalidate: 3600 },
    });
    if (!res.ok) return [];
    return parseForecastDatums(await res.text());
  } catch {
    return [];
  }
}
