#!/usr/bin/env npx tsx
/**
 * Assemble ingest-ready dossiers for the 3rd batch from the research files +
 * gauge metadata, applying the OWNER-APPROVED final ladders (2026-07-13 sign-off):
 *   - Caddo, War Eagle, Mulberry, Crooked: activate with sourced ladders
 *     (danger anchors kept only where 2+ sources or high confidence; else null).
 *   - Bryant, Big River: OPTIMAL-ONLY (high/dangerous null) — owner call.
 *   - Big Piney: adopt moherp's key (higher than the old DB values) — owner call.
 *   - Kings: too_low/low only, HOLD inactive (no published optimal; only danger
 *     anchor is the NWS flood stage — not floater-danger).
 *
 * Ladders are defined EXPLICITLY here (not auto-mapped) because they are
 * safety-critical. Everything else (sections, metadata, gauges) comes from the
 * research/<slug>.json files. Emits scripts/ingestion/dossiers/<slug>.json.
 */
import * as fs from 'fs';
import * as path from 'path';

const RES = path.join(__dirname, 'research');
const OUT = path.join(__dirname, 'dossiers');
const gaugeMeta = JSON.parse(fs.readFileSync(path.join(RES, '_gauge_meta.json'), 'utf-8')) as Record<string, { name: string; lat: number; lon: number; drainageAreaSqMi: number }>;

type Anchor = { value: number; confidence: string; source: string; corroboratingSources?: string[] };
interface Cal { gauge: string; unit: string; keySource: string; anchors: Partial<Record<string, Anchor>>; }

// OWNER-APPROVED final ladders (2026-07-13).
const LADDERS: Record<string, Cal> = {
  'caddo-river': { gauge: '07359610', unit: 'ft', keySource: 'Caddo River Camping & Canoe Rental published gauge-height key (caddoriver.com), corroborated by American Whitewater + AR trip reports',
    anchors: {
      too_low: { value: 5.25, confidence: 'high', source: 'https://caddoriver.com/river-conditions' },
      low: { value: 5.4, confidence: 'high', source: 'https://caddoriver.com/river-conditions' },
      optimal_min: { value: 5.5, confidence: 'high', source: 'https://caddoriver.com/river-conditions' },
      optimal_max: { value: 6.1, confidence: 'high', source: 'https://caddoriver.com/river-conditions' },
      high: { value: 6.2, confidence: 'high', source: 'https://caddoriver.com/river-conditions', corroboratingSources: ['https://www.americanwhitewater.org/content/River/view/river-detail/91/main'] },
      dangerous: { value: 7.0, confidence: 'medium', source: 'https://caddoriver.com/river-conditions', corroboratingSources: ['https://www.americanwhitewater.org/content/River/view/river-detail/91/main', 'https://rivers.moherp.org/gauge/?gauge=07359610'] },
    } },
  'war-eagle-creek': { gauge: '07049000', unit: 'ft', keySource: 'Withrow Springs SP / AR Own Backyard / Arkansas Canoe Club gage-height float key (optimal band, 4 sources); danger omitted (single-source)',
    anchors: {
      too_low: { value: 1.8, confidence: 'medium', source: 'https://www.americanwhitewater.org/content/River/view/river-detail/2875/main' },
      low: { value: 2.0, confidence: 'high', source: 'https://www.arownbackyard.com/2024/07/02/floating-war-eagle-creek-hwy-23-to-hwy-45/' },
      optimal_min: { value: 2.5, confidence: 'medium', source: 'https://forums.arkansascanoeclub.com/viewtopic.php?t=28064' },
      optimal_max: { value: 3.5, confidence: 'high', source: 'https://www.arownbackyard.com/2024/07/02/floating-war-eagle-creek-hwy-23-to-hwy-45/' },
      // high == optimal_max (degenerate) and dangerous 4.0 is single-source → omitted (optimal-only).
    } },
  'mulberry': { gauge: '07252000', unit: 'ft', keySource: 'Turner Bend staff-gauge key transferred to USGS datum (optimal, 3 cross-checks) + American Whitewater USGS-gauge levels + NWS AHPS flood stages (danger)',
    anchors: {
      too_low: { value: 1.2, confidence: 'medium', source: 'https://www.turnerbend.com/WaterLevel.html' },
      low: { value: 1.5, confidence: 'medium', source: 'https://www.turnerbend.com/WaterLevel.html' },
      optimal_min: { value: 2.0, confidence: 'medium', source: 'https://www.turnerbend.com/WaterLevel.html', corroboratingSources: ['https://byrdsadventurecenter.com/mulberry-river/'] },
      optimal_max: { value: 3.5, confidence: 'medium', source: 'https://www.americanwhitewater.org/content/River/view/river-detail/103/main', corroboratingSources: ['https://www.turnerbend.com/WaterLevel.html'] },
      // high 6.0 LOW-confidence single-source → omitted.
      dangerous: { value: 8.0, confidence: 'medium', source: 'https://www.americanwhitewater.org/content/River/view/river-detail/103/main', corroboratingSources: ['https://water.noaa.gov/gauges/mlba4'] },
    } },
  'crooked-creek': { gauge: '07055607', unit: 'ft', keySource: 'AGFC Crooked Creek Water Trail + OzarkAnglers paddler-forum gage-height key (feet), cross-referenced with Float NWA cfs',
    anchors: {
      too_low: { value: 10.5, confidence: 'medium', source: 'https://forums.ozarkanglers.com/topic/44313-first-crooked-creek-float-water-level/' },
      optimal_min: { value: 10.5, confidence: 'medium', source: 'https://forums.ozarkanglers.com/topic/44313-first-crooked-creek-float-water-level/' },
      optimal_max: { value: 12.5, confidence: 'medium', source: 'https://www.agfc.com/things-to-do/water-trails/crooked-creek/' },
      high: { value: 13.0, confidence: 'medium', source: 'https://forums.ozarkanglers.com/topic/44313-first-crooked-creek-float-water-level/', corroboratingSources: ['https://www.agfc.com/things-to-do/water-trails/crooked-creek/'] },
      dangerous: { value: 13.5, confidence: 'medium', source: 'https://forums.ozarkanglers.com/topic/44313-first-crooked-creek-float-water-level/', corroboratingSources: ['https://www.agfc.com/things-to-do/water-trails/crooked-creek/'] },
    } },
  'bryant-creek': { gauge: '07058000', unit: 'cfs', keySource: 'moherp.com community trip-report calibration (optimal band); high/dangerous omitted per owner (no published recreational cutoff)',
    anchors: {
      too_low: { value: 200, confidence: 'medium', source: 'https://rivers.moherp.org/gauge/?gauge=07058000' },
      low: { value: 245, confidence: 'medium', source: 'https://rivers.moherp.org/gauge/?gauge=07058000' },
      optimal_min: { value: 300, confidence: 'high', source: 'https://rivers.moherp.org/gauge/?gauge=07058000' },
      optimal_max: { value: 600, confidence: 'medium', source: 'https://rivers.moherp.org/gauge/?gauge=07058000' },
    } },
  'big-river': { gauge: '07018500', unit: 'cfs', keySource: 'USGS day-of-year percentiles cross-checked with moherp live rating + OzarkAnglers seasonal normals (optimal band); high/dangerous omitted per owner',
    anchors: {
      too_low: { value: 90, confidence: 'medium', source: 'https://forums.ozarkanglers.com/waters/rivers/big-river/big-river-sections-r318/' },
      low: { value: 150, confidence: 'medium', source: 'https://forums.ozarkanglers.com/waters/rivers/big-river/big-river-sections-r318/' },
      optimal_min: { value: 200, confidence: 'medium', source: 'https://rivers.moherp.org/gauge/?gauge=07018500' },
      optimal_max: { value: 600, confidence: 'medium', source: 'https://forums.ozarkanglers.com/waters/rivers/big-river/big-river-sections-r318/' },
    } },
  'big-piney': { gauge: '06930000', unit: 'cfs', keySource: 'moherp.com published key for gauge 06930000 (owner-approved 2026-07-13, replacing the older conservative DB values)',
    anchors: {
      too_low: { value: 164, confidence: 'medium', source: 'https://rivers.moherp.org/gauge/?gauge=06930000' },
      low: { value: 309, confidence: 'medium', source: 'https://rivers.moherp.org/gauge/?gauge=06930000' },
      optimal_min: { value: 519, confidence: 'medium', source: 'https://rivers.moherp.org/gauge/?gauge=06930000' },
      optimal_max: { value: 1013, confidence: 'medium', source: 'https://rivers.moherp.org/gauge/?gauge=06930000' },
      high: { value: 1014, confidence: 'medium', source: 'https://rivers.moherp.org/gauge/?gauge=06930000', corroboratingSources: ['https://water.noaa.gov/gauges/06930000'] },
      dangerous: { value: 2049, confidence: 'medium', source: 'https://rivers.moherp.org/gauge/?gauge=06930000', corroboratingSources: ['https://water.noaa.gov/gauges/06930000'] },
    } },
  'kings-river': { gauge: '07050500', unit: 'ft', keySource: 'Kings River Outfitters / Trigger Gap published minimum-floatable levels (too_low/low only); HELD inactive — no published optimal band and the only danger anchor is the NWS flood stage',
    anchors: {
      too_low: { value: 3.2, confidence: 'high', source: 'https://kingsriverarkansas.com/access-points/' },
      low: { value: 3.5, confidence: 'high', source: 'https://kingsriverarkansas.com/access-points/' },
    } },
};

const HOLD = new Set(['kings-river']); // ingest but keep inactive

function gaugeRow(siteId: string, servesSections: string[], knownBias?: string) {
  const m = gaugeMeta[siteId];
  return {
    provider: 'usgs', siteId, name: m?.name ?? siteId,
    lat: m?.lat ?? null, lon: m?.lon ?? null,
    paramsAvailable: ['00060', '00065'],
    ...(m?.drainageAreaSqMi != null ? { drainageAreaSqMi: m.drainageAreaSqMi } : {}),
    servesSections,
    ...(knownBias ? { knownBias } : {}),
  };
}

for (const slug of Object.keys(LADDERS)) {
  const res = JSON.parse(fs.readFileSync(path.join(RES, `${slug}.json`), 'utf-8'));
  const cal = LADDERS[slug];
  const md = res.metadata ?? {};

  // sections (research) → dossier sections; attach the primary-gauge ladder to the first section.
  const sections = (res.sections ?? []).map((s: any, i: number) => {
    const base: any = {
      slug: s.slug,
      name: s.name,
      description: s.note ?? s.notes ?? s.difficulty ?? '',
      putIn: { name: s.putIn ?? '', lat: null, lon: null },
      takeOut: { name: s.takeOut ?? '', lat: null, lon: null },
      publishedLengthMiles: s.miles ?? null,
      representativeGauge: { siteId: cal.gauge },
    };
    if (i === 0) {
      base.thresholds = Object.entries(cal.anchors).map(([level, a]) => ({
        level, value: a!.value, unit: cal.unit,
        referenceGauge: cal.gauge, referenceGaugeIsPolled: true,
        confidence: a!.confidence, source: a!.source,
        ...(a!.corroboratingSources ? { corroboratingSources: a!.corroboratingSources } : {}),
      }));
    }
    return base;
  });

  // gauges[]: primary + any secondary from research
  const primaryServes = (res.sections ?? []).filter((s: any) => (s.primaryGaugeSiteId ?? cal.gauge) === cal.gauge).map((s: any) => s.slug);
  const gauges = [gaugeRow(cal.gauge, primaryServes.length ? primaryServes : (sections[0] ? [sections[0].slug] : []))];
  for (const sg of res.secondaryGauges ?? []) {
    const sid = sg.siteId;
    if (!sid || sid === cal.gauge) continue;
    const serves = (res.sections ?? []).filter((s: any) => s.primaryGaugeSiteId === sid).map((s: any) => s.slug);
    gauges.push(gaugeRow(sid, serves, sg.note ?? sg.relationship ?? sg.reason));
  }

  const dossier = {
    _status: HOLD.has(slug)
      ? `HELD-INACTIVE 2026-07-13: thin calibration (no published optimal band; danger anchor would be NWS flood stage). too_low/low ingested; complete + activate when an outfitter optimal/danger key exists.`
      : `SIGNED-OFF 2026-07-13 — owner-authorized go-live (3rd batch). ${md.difficultyRating ?? ''}`,
    name: res.name, slug, primaryGaugeSiteId: cal.gauge,
    state: res.state ?? md.state, country: md.country ?? 'US', timezone: md.timezone ?? 'America/Chicago',
    region: md.region ?? 'Ozarks', nhdFeatureId: null,
    difficultyRating: md.difficultyRating ?? 'Class I', description: md.description ?? '',
    // river_type must be one of the DB enum values (dam_tailwater | flatwater |
    // rain_flashy | snowmelt | spring_fed_float); research sometimes returns prose.
    riverType: ({ 'caddo-river': 'rain_flashy', 'big-river': 'spring_fed_float' } as Record<string, string>)[slug]
      ?? (['dam_tailwater', 'flatwater', 'rain_flashy', 'snowmelt', 'spring_fed_float'].includes(md.riverType) ? md.riverType : 'rain_flashy'),
    managingAuthority: md.managingAuthority ?? null,
    accessLaw: md.accessLaw ?? null,
    gauges, sections,
    weatherPoint: { city: md.weatherCity ?? null, lat: md.weatherLat ?? null, lon: md.weatherLon ?? null },
    alertSearchTerms: md.alertSearchTerms ?? [],
    accessPoints: [],
    research: { calibrationKeySource: cal.keySource, calibrationNotes: res.calibration?.notes ?? '', hazards: res.hazards ?? [] },
  };
  fs.writeFileSync(path.join(OUT, `${slug}.json`), JSON.stringify(dossier, null, 2));
  const t = sections[0]?.thresholds ?? [];
  console.log(`${slug.padEnd(16)} gauge=${cal.gauge} unit=${cal.unit} anchors=[${t.map((x: any) => `${x.level.replace('optimal_','opt_')}=${x.value}`).join(' ')}] sections=${sections.length} gauges=${gauges.length}${HOLD.has(slug) ? '  [HOLD]' : ''}`);
}
console.log('\nDone. Dry-run each with: npx tsx scripts/ingestion/ingest-dossier.ts <slug>');
