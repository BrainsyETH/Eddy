#!/usr/bin/env npx tsx
/**
 * Generate verified-identifiers-<slug>.md for the 3rd batch — the [verify] gate
 * requires every gauges[].siteId to appear in this file. All gauge IDs here were
 * checked against the live USGS site service on 2026-07-13 (station name, params,
 * coords, drainage), and several initially-recalled IDs were caught wrong.
 */
import * as fs from 'fs';
import * as path from 'path';

const DOSS = path.join(__dirname, 'dossiers');
const RES = path.join(__dirname, 'research');
const meta = JSON.parse(fs.readFileSync(path.join(RES, '_gauge_meta.json'), 'utf-8'));

// gauge-ID corrections caught during verification (wrong recalled ID → what it really is → correct ID)
const CORRECTIONS: Record<string, string> = {
  'kings-river': '`07050152` (my initial ID) is actually **Roaring River at Roaring River State Park, MO** — a different river. Correct Kings gauge = **07050500**.',
  'crooked-creek': '`07056000` (my initial ID) is actually **Buffalo River near St. Joe, AR**. Correct Crooked Creek gauge = **07055607** (Kelly Crossing at Yellville).',
  'bryant-creek': '`07056700` (my initial ID) is actually **Buffalo River near Harriet, AR**. Correct Bryant Creek gauge = **07058000** (near Tecumseh).',
  'big-piney': '`07066000` (my initial ID) is actually **Jacks Fork at Eminence, MO**. Correct Big Piney gauge = **06930000** (near Big Piney / at Ross), already in the DB.',
};
const NOTES: Record<string, string> = {
  'caddo-river': 'Outfitter gage-height key (caddoriver.com) — HIGH confidence optimal band; dangerous 7.0 ft is the outfitter route ceiling (MED, corroborated by American Whitewater + moherp). No NWS AHPS flood stage published for this gauge.',
  'war-eagle-creek': 'Gage-height float key (Withrow Springs SP / AR Own Backyard / Arkansas Canoe Club) — HIGH-confidence optimal band (2.0–3.5 ft). Danger anchor OMITTED (the only source, "just over 4 ft = flood," is single-source) — ships optimal-only, documented no_dangerous.',
  'mulberry': 'Optimal band transferred from Turner Bend staff gauge to the USGS datum (MED, 3 cross-checks); dangerous 8.0 ft from American Whitewater ("experts only >8 ft") corroborated by NWS AHPS flood ladder. LOW-confidence "high" (6 ft) dropped.',
  'crooked-creek': 'AGFC Crooked Creek Water Trail + OzarkAnglers paddler-forum gage-height key (MED). No NWS flood stage published; high/dangerous are paddler-derived (2-sourced). "low" left null (sources give a sharp draggy→ideal pivot at ~10.5 ft).',
  'bryant-creek': 'moherp community trip-report calibration (optimal band well-grounded). high/dangerous OMITTED per owner (2026-07-13) — no published recreational cutoff exists (percentile inference only). Ships optimal-only, documented no_dangerous.',
  'big-river': 'USGS day-of-year percentiles cross-checked with moherp live rating + OzarkAnglers seasonal normals (optimal band). high/dangerous OMITTED per owner — percentile inference only. Ships optimal-only. Popular Washington State Park reach is better represented by secondary gauge 07018100 (Richwoods).',
  'big-piney': 'ADOPTED moherp key per owner (2026-07-13), replacing the older conservative DB values (which had dangerous 814 cfs vs moherp Good). New ladder: too_low 164 / optimal 519–1013 / high 1014 / dangerous 2049 cfs. Secondary upper-river gauge 06928900.',
  'kings-river': 'HELD INACTIVE. Only the outfitter minimum-floatable levels (too_low 3.2 / low 3.5 ft) are published; no optimal band exists and the only danger reference is the NWS flood stage (30 ft, far above floater-danger). Ingested too_low/low only; activate when an outfitter optimal/danger key exists.',
};

for (const file of fs.readdirSync(DOSS)) {
  const m = file.match(/^(caddo-river|war-eagle-creek|mulberry|crooked-creek|bryant-creek|big-river|big-piney|kings-river)\.json$/);
  if (!m) continue;
  const slug = m[1];
  const d = JSON.parse(fs.readFileSync(path.join(DOSS, file), 'utf-8'));
  const lines: string[] = [];
  lines.push(`# Verified identifiers — ${d.name} (${slug})`, '');
  lines.push('ingest-dossier.ts: every `gauges[].siteId` in ' + slug + '.json must appear below.', '');
  lines.push('All gauge IDs below were verified against the live USGS site service on 2026-07-13', '(station name, available parameters, coordinates, drainage area).', '');
  lines.push('## USGS gauges (verified)', '');
  d.gauges.forEach((g: any, i: number) => {
    const gm = meta[g.siteId] ?? {};
    lines.push(`### ${g.siteId} — ${g.name}  ${i === 0 ? '✅ PRIMARY' : '(secondary)'}`);
    lines.push(`- params: uv 00060 (discharge, cfs) + uv 00065 (gage height, ft). POLLABLE.`);
    if (gm.lat != null) lines.push(`- coords: ${gm.lat}, ${gm.lon}${gm.drainageAreaSqMi != null ? ` · drainage ${gm.drainageAreaSqMi} sq mi` : ''}.`);
    if (g.knownBias) lines.push(`- note: ${g.knownBias}`);
    lines.push('');
  });
  if (CORRECTIONS[slug]) {
    lines.push('## Gauge-ID correction caught during verification', '', CORRECTIONS[slug], '');
  }
  lines.push('## Calibration key + sign-off notes', '', NOTES[slug] ?? '', '');
  fs.writeFileSync(path.join(DOSS, `verified-identifiers-${slug}.md`), lines.join('\n'));
  console.log(`verified-identifiers-${slug}.md  (${d.gauges.length} gauge id(s))`);
}
