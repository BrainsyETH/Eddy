#!/usr/bin/env npx tsx
/**
 * scaffold-mo-dossiers.ts
 *
 * Emits schema-valid RiverDossier STUBS (see dossier.ts) for new Missouri
 * rivers, with the state-level scaffolding pre-filled and everything else
 * marked for research. Adding a new MO river = add a row to MO_RIVERS below and
 * re-run; existing dossier files are NOT overwritten (delete one to regenerate).
 *
 *   npx tsx scripts/ingestion/scaffold-mo-dossiers.ts
 *
 * A stub is a research WORKSHEET, not ingestable data:
 *   - identity is filled (state MO / America/Chicago / river_type / region)
 *   - accessLaw carries the shared MO navigability paragraph (research once/state)
 *   - gauges/sections/accessPoints are EMPTY; candidate gauges + reach hints go
 *     in research.openQuestions as LEADS (never fabricated USGS site numbers)
 * Hand the stub + research-prompt-missouri.md to the research pass to fill.
 */

import * as fs from 'fs';
import * as path from 'path';

const MO_ACCESS_LAW =
  'Missouri follows the "navigable in fact" doctrine: the public may float and ' +
  'wade streams navigable in fact, but streambeds/banks are frequently privately ' +
  'owned, so access is legal from public road crossings, public land, and ' +
  'established accesses, while portaging or camping on private gravel bars can be ' +
  'trespass. Navigability is decided stream by stream; there is no statewide list. ' +
  '(Shared Missouri paragraph — confirm the AGO/MDC citation once for the state.)';

interface MoRiverSeed {
  name: string;
  slug: string;
  region: string;
  riverType: string;
  difficultyRating: string;
  description: string;
  weatherCity: string;
  counties: string[];   // for alertSearchTerms + toVerify
  towns: string[];      // for alertSearchTerms
  gaugeLeads: string[]; // candidate USGS gauge LOCATIONS by name — NOT verified ids
  reachHint: string;
  note?: string;        // river-specific research caution
}

const MO_RIVERS: MoRiverSeed[] = [
  {
    name: 'Gasconade River', slug: 'gasconade', region: 'Ozarks',
    riverType: 'spring_fed_float', difficultyRating: 'Class I',
    description:
      'The longest river entirely within Missouri, a winding Ozark float stream ' +
      'draining the central Ozarks north to the Missouri River. Long floatable ' +
      'season; smallmouth fishing; many low-water access bridges.',
    weatherCity: 'Waynesville',
    counties: ['Texas', 'Pulaski', 'Phelps', 'Maries', 'Gasconade', 'Osage'],
    towns: ['Waynesville', 'Jerome', 'Vienna', 'Hermann'],
    gaugeLeads: [
      'Gasconade River near Hazelgreen', 'Gasconade River at Jerome',
      'Gasconade River near Rich Fountain',
    ],
    reachHint:
      'Long river — expect 2–3 calibration reaches (upper near Hazelgreen, ' +
      'middle at Jerome, lower near Rich Fountain/Mouth).',
  },
  {
    name: 'Bourbeuse River', slug: 'bourbeuse', region: 'Ozarks',
    riverType: 'spring_fed_float', difficultyRating: 'Class I',
    description:
      'A slow, deeply meandering tributary of the Meramec in east-central ' +
      'Missouri. Low-gradient and forgiving; more lowland-slough character than ' +
      'the clear spring-fed Ozark floats — confirm whether spring_fed_float fits.',
    weatherCity: 'Union',
    counties: ['Phelps', 'Crawford', 'Gasconade', 'Franklin'],
    towns: ['Union', 'Bland', 'Noser Mill'],
    gaugeLeads: ['Bourbeuse River at Union', 'Bourbeuse River near High Gate'],
    reachHint: 'Likely one calibration reach; confirm gauge coverage.',
    note:
      'Low-gradient lowland river — verify the spring_fed_float archetype and ' +
      'speed curve fit; it may float slower than the clear Ozark streams.',
  },
  {
    name: 'Black River', slug: 'black', region: 'Ozarks',
    riverType: 'spring_fed_float', difficultyRating: 'Class I-II',
    description:
      'A clear, popular southeast-Missouri Ozark float river below the St. ' +
      'Francois Mountains. The Lesterville reach is a summer-float hotspot; ' +
      'gravel bars and bluffs.',
    weatherCity: 'Lesterville',
    counties: ['Reynolds', 'Wayne', 'Butler'],
    towns: ['Lesterville', 'Annapolis', 'Poplar Bluff'],
    gaugeLeads: [
      'Black River near Annapolis', 'Black River at Lesterville',
      'Black River near Poplar Bluff',
    ],
    reachHint: 'Upper (Lesterville) vs lower (below Clearwater Lake) — 2 reaches likely.',
    note: 'Clearwater Lake dam sits mid-river; the lower reach is a tailwater — ' +
      'confirm whether the lower reach is dam_tailwater rather than spring_fed_float.',
  },
  {
    name: 'St. Francis River', slug: 'st-francis', region: 'St. Francois Mountains',
    riverType: 'rain_flashy', difficultyRating: 'Class II-IV (upper whitewater)',
    description:
      "Missouri's premier whitewater: the upper St. Francis through the " +
      'Millstream Gardens / Silver Mines shut-ins (Tiemann Shut-ins) is ' +
      'rain-dependent Class II–IV that spikes and drops fast. Below the ' +
      'whitewater it mellows toward Wappapello Lake.',
    weatherCity: 'Fredericktown',
    counties: ['Madison', 'Iron', 'Wayne'],
    towns: ['Fredericktown', 'Silva'],
    gaugeLeads: [
      'St. Francis River near Roselle', 'St. Francis River near Patterson',
    ],
    reachHint:
      'Two very different reaches: UPPER whitewater (Millstream Gardens → Silver ' +
      'Mines, rain_flashy, safety-critical) and the calmer lower reach.',
    note:
      'SAFETY-CRITICAL and NOT spring-fed. The upper whitewater is the reason to ' +
      'add this river and the reason to treat it as rain_flashy: capture the ' +
      'American Whitewater gauge correlation (Roselle) and NWS flood stages ' +
      'carefully — this reach can be lethal at high water.',
  },
  {
    name: 'North Fork River', slug: 'north-fork-white', region: 'Ozarks',
    riverType: 'spring_fed_float', difficultyRating: 'Class I-II',
    description:
      'The North Fork of the White River, a classic spring-fed south-central ' +
      'Missouri float and wild-trout stream fed by Rainbow and Blue Springs. ' +
      'Clear, cold, and reliably floatable; small ledges/rapids.',
    weatherCity: 'West Plains',
    counties: ['Texas', 'Howell', 'Ozark', 'Douglas'],
    towns: ['Dora', 'Tecumseh', 'West Plains'],
    gaugeLeads: [
      'North Fork River near Tecumseh', 'Bryant Creek near Tecumseh',
    ],
    reachHint: 'Spring-fed reach above Norfork Lake; likely 1–2 reaches.',
  },
  {
    name: 'Elk River', slug: 'elk', region: 'Ozarks',
    riverType: 'spring_fed_float', difficultyRating: 'Class I',
    description:
      'A warm, popular summer float in the far-southwest Missouri corner ' +
      '(McDonald County) around Noel and Pineville. Gravel bars, bluffs, heavy ' +
      'summer traffic; more rain-influenced and warmer than the deep-Ozark springs.',
    weatherCity: 'Pineville',
    counties: ['McDonald'],
    towns: ['Noel', 'Pineville', 'Lanagan'],
    gaugeLeads: ['Elk River near Tiff City', 'Big Sugar Creek near Powell'],
    reachHint: 'Short river — likely one calibration reach (Pineville → Noel → Tiff City).',
  },
  {
    name: 'James River', slug: 'james', region: 'Ozarks',
    riverType: 'spring_fed_float', difficultyRating: 'Class I',
    description:
      'A southwest-Missouri float and smallmouth stream draining the Springfield ' +
      'plateau to Table Rock Lake. The Galena reach is the classic float; upper ' +
      'reaches near Springfield carry urban runoff.',
    weatherCity: 'Galena',
    counties: ['Greene', 'Christian', 'Stone'],
    towns: ['Galena', 'Hootentown', 'Springfield'],
    gaugeLeads: ['James River near Galena', 'James River at Springfield'],
    reachHint: 'Upper (near Springfield, urban) vs lower (Galena → Table Rock) — 2 reaches.',
    note: 'Upper reach carries Springfield urban runoff (flashier, water-quality ' +
      'notes); lower Galena reach is the recreational float. Note the divergence.',
  },
];

function stubFor(r: MoRiverSeed) {
  const alertSearchTerms = [
    r.name.toLowerCase(),
    ...r.counties.map((c) => `${c.toLowerCase()} county`),
    ...r.towns.map((t) => t.toLowerCase()),
  ];
  return {
    _status:
      `STUB — scaffold only, NOT researched. Identity + MO access law pre-filled; ` +
      `gauges/sections/accessPoints/thresholds are EMPTY and must be filled by the ` +
      `research pass (hand this file + research-prompt-missouri.md to research). ` +
      (r.note ? `River-specific caution: ${r.note}` : ''),
    name: r.name,
    slug: r.slug,
    state: 'MO',
    country: 'US',
    timezone: 'America/Chicago',
    region: r.region,
    nhdFeatureId: 'UNKNOWN',
    difficultyRating: r.difficultyRating,
    description: r.description,
    riverType: r.riverType,
    parkCode: undefined,
    managingAuthority:
      'Missouri Department of Conservation (state-managed accesses); ' +
      'streambed navigability per Missouri law',
    regulations: [],
    permits: [],
    accessLaw: {
      value: MO_ACCESS_LAW,
      source: 'https://mdc.mo.gov/ (MDC stream access) — confirm AGO citation once for MO',
      confidence: 'medium',
    },
    seasonalClosures: [],
    gauges: [],
    sections: [],
    accessPoints: [],
    weatherPoint: { city: r.weatherCity, lat: null, lon: null },
    alertSearchTerms,
    research: {
      date: null,
      sourcesConsulted: [],
      openQuestions: [
        `Reach division: ${r.reachHint}`,
        `Candidate gauges (LEADS — verify each site number on waterdata.usgs.gov): ${r.gaugeLeads.join('; ')}`,
        ...(r.note ? [`River-type / character check: ${r.note}`] : []),
      ],
      toVerify: [
        'NHD Permanent Identifier for the flowline (National Map NHDPlus_HR, MO HUC)',
        'USGS gauge site numbers for each representative gauge (verify on monitoring-location page)',
        'NWS AHPS action-stage / flood-stage (ft) per gauge — the danger-anchor second source',
        'MDC / outfitter floatability stage (ft) statements per reach',
        'Full MDC access-point list with coordinates (human places every point)',
        `County list for NWS alert terms (seeded: ${r.counties.join(', ')})`,
      ],
    },
  };
}

const outDir = path.join(__dirname, 'dossiers');
let written = 0;
let skipped = 0;
for (const r of MO_RIVERS) {
  const file = path.join(outDir, `${r.slug}.json`);
  if (fs.existsSync(file)) {
    console.log(`  ⏭️  ${r.slug}.json exists — skipping (delete to regenerate)`);
    skipped++;
    continue;
  }
  fs.writeFileSync(file, JSON.stringify(stubFor(r), null, 2) + '\n');
  console.log(`  ✅ wrote ${r.slug}.json`);
  written++;
}
console.log(`\nScaffolded ${written} MO dossier stub(s), skipped ${skipped}.`);
