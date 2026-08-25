#!/usr/bin/env npx tsx
/**
 * Build river geometry for a dam tailwater — an NHD main stem sliced between
 * two named points.
 *
 * WHY THIS IS NOT `import-nhd-rivers-from-tnm.ts`
 *
 * That script takes a whole named main stem out of a HUC8 and stores it. That
 * is the right answer for a river whose identity IS the whole named stem: the
 * Current River is the Current River from headwaters to mouth.
 *
 * A tailwater is a slice. NHD calls the water above Bull Shoals Lake, the lake
 * itself, and the trout water below the dam all "White River" — one continuous
 * flowline through three completely different rivers. Storing the whole thing
 * would put a 45-mile reservoir inside a river Eddy describes as a float. So a
 * tailwater spec carries a `from` and a `to`, and the flowline is sliced
 * between them.
 *
 * The endpoints are not arbitrary. Each one is a real feature with a source
 * recorded beside it — the dam CWMS publishes coordinates for, or the boundary
 * the managing agency states its fishery ends at.
 *
 * The download, filter and dissolve are shared with the whole-stem importer
 * (scripts/lib/nhd.ts) so the bridging tolerance that keeps NHD digitization
 * gaps from splitting a river exists in exactly one place.
 *
 * Run:  npx tsx scripts/ingestion/build-tailwater-geometry.ts
 *       npx tsx scripts/ingestion/build-tailwater-geometry.ts white
 *       npx tsx scripts/ingestion/build-tailwater-geometry.ts --out tmp/tw.sql
 *
 * Writes nothing to the database, ever. It emits SQL for a migration to carry,
 * because a tailwater's geometry is a reviewable artifact and not something to
 * regenerate on a whim: `rivers.geom` is what every access-point river-mile is
 * measured against, so re-deriving it silently would move every mile on the
 * river.
 */

import { mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import {
  simplify,
  lineString as turfLine,
  lineSlice,
  length as turfLength,
  point as turfPoint,
  nearestPointOnLine,
} from '@turf/turf';
import type { Feature, LineString } from 'geojson';
import { SIMPLIFY_TOLERANCE_DEG, dissolveLongest, loadFlowlines } from '../lib/nhd';

/** A named endpoint, with where its coordinates came from. */
interface Anchor {
  label: string;
  lon: number;
  lat: number;
  source: string;
}

/** Everything the rivers row needs that geometry does not supply. */
interface TailwaterMeta {
  name: string;
  description: string;
  difficultyRating: string;
  region: string;
  state: string;
  timezone: string;
  /** Always 'dam_tailwater' here — that is what makes it a tailwater. */
  riverType: 'dam_tailwater';
  /** USACE_DAMS registry id of the dam whose release drives this river. */
  controllingDamId: string;
  weather: { city: string; lat: number; lon: number };
  alertSearchTerms: string[];
}

interface TailwaterSpec {
  slug: string;
  gnisNames: string[];
  hucs: string[];
  from: Anchor;
  to: Anchor;
  /** Sanity bound: fail loudly if the slice is not roughly this long. */
  expectMiles: [number, number];
  meta: TailwaterMeta;
}

const TAILWATERS: TailwaterSpec[] = [
  {
    slug: 'white',
    gnisNames: ['White River'],
    // 11010003 is Bull Shoals Lake (the dam and the water down past Cotter),
    // 11010004 picks up Norfork through Calico Rock and Guion. Both pulled
    // from the huc_cd of the USGS gauges on each stretch.
    hucs: ['11010003', '11010004'],
    from: {
      label: 'Bull Shoals Dam',
      lon: -92.574845,
      lat: 36.3657191,
      source: 'CWMS /locations?office=SWL, location Bull_Shoals_Dam',
    },
    to: {
      label: 'Guion (AR Hwy 58 bridge)',
      lon: -91.94444,
      lat: 35.92806,
      source:
        'AGFC states the trout fishery runs "from Bull Shoals Dam to the ' +
        'Arkansas Highway 58 Bridge at Guion". Anchored on USGS 07060790 ' +
        '"Rocky Bayou at Guion" (35°55\'41"N 91°56\'40"W), whose mouth is at Guion.',
    },
    expectMiles: [65, 95],
    meta: {
      name: 'White River',
      description:
        'The White River below Bull Shoals Dam — Arkansas’s flagship trout ' +
        'tailwater, cold year-round and running at whatever the Corps releases. ' +
        'Ninety miles of shoals and long pools from the dam past Cotter, Buffalo ' +
        'City and Norfork down to the Highway 58 bridge at Guion, where the Game ' +
        'and Fish Commission’s trout water ends. Eight generators can take the ' +
        'river from a wadeable 800 cfs to over 20,000 cfs in an hour, under a ' +
        'clear sky and with no rain anywhere in the basin.',
      difficultyRating: 'Class I',
      region: 'Ozarks',
      state: 'AR',
      timezone: 'America/Chicago',
      riverType: 'dam_tailwater',
      controllingDamId: 'swl-bull-shoals-dam',
      weather: { city: 'Cotter', lat: 36.2812, lon: -92.5266 },
      alertSearchTerms: [
        'white river',
        'bull shoals',
        'baxter county',
        'marion county',
        'izard county',
        'stone county',
      ],
    },
  },
  {
    slug: 'norfork-tailwater',
    gnisNames: ['North Fork River', 'North Fork White River'],
    hucs: ['11010006'],
    from: {
      label: 'Norfork Dam',
      lon: -92.23786,
      lat: 36.24863,
      source: 'CWMS /locations?office=SWL, location Norfork_Dam',
    },
    to: {
      label: 'White River confluence',
      lon: -92.2898,
      lat: 36.2108,
      source:
        'Downstream end of the existing north-fork-white geometry in ' +
        'production, which reaches the confluence. AGFC manages the trout ' +
        'fishery from Norfork Dam to the White River confluence.',
    },
    expectMiles: [3.5, 6.5],
    meta: {
      name: 'Norfork Tailwater',
      description:
        'Not quite five miles of the North Fork River between Norfork Dam and ' +
        'the White River — small, cold and catch-and-release from end to end. ' +
        'A siphon holds a steady 185 cfs whenever the two generators are idle, ' +
        'which is what makes it wadeable; when a unit comes on, the river ' +
        'roughly quadruples. Named for the tailwater rather than the river ' +
        'because Eddy already carries the North Fork River above Norfork Lake, ' +
        'in Missouri, and they are not the same water.',
      difficultyRating: 'Class I',
      region: 'Ozarks',
      state: 'AR',
      timezone: 'America/Chicago',
      riverType: 'dam_tailwater',
      controllingDamId: 'swl-norfork-dam',
      weather: { city: 'Norfork', lat: 36.2076, lon: -92.2793 },
      alertSearchTerms: [
        'norfork tailwater',
        'north fork river',
        'norfork dam',
        'baxter county',
      ],
    },
  },
  {
    slug: 'taneycomo',
    gnisNames: ['White River'],
    hucs: ['11010003'],
    from: {
      label: 'Table Rock Dam',
      lon: -93.3110611,
      lat: 36.5953888,
      source: 'CWMS /locations?office=SWL, location Table_Rock_Dam',
    },
    to: {
      label: 'Powersite Dam (Ozark Beach)',
      lon: -93.12586,
      lat: 36.65961,
      source:
        'USGS 07053820 "Lake Taneycomo at Ozark Beach Dam" ' +
        '(36°39\'34.6"N 93°07\'33.1"W). Powersite impounds Taneycomo and is ' +
        'its downstream limit; it is Liberty Utilities\' and not in the ' +
        'USACE registry.',
    },
    expectMiles: [17, 28],
    meta: {
      name: 'Lake Taneycomo',
      description:
        'Twenty-three miles of the White River between Table Rock Dam and ' +
        'Powersite Dam at Forsyth — a lake by name and by law, a cold ' +
        'tailwater in practice. The top few miles below the dam fish and wade ' +
        'like a river at 53 °F in August; the bottom half is flatwater backed ' +
        'up behind Powersite. Four generators drive the whole thing, and the ' +
        'tailwater below the dam swings eight feet between idle and full ' +
        'generation — the largest, fastest move Eddy measures anywhere.',
      difficultyRating: 'Class I',
      region: 'Ozarks',
      state: 'MO',
      timezone: 'America/Chicago',
      riverType: 'dam_tailwater',
      controllingDamId: 'swl-table-rock-dam',
      weather: { city: 'Branson', lat: 36.6437, lon: -93.2185 },
      alertSearchTerms: [
        'lake taneycomo',
        'taneycomo',
        'table rock dam',
        'taney county',
      ],
    },
  },
];

function sqlQuote(s: string): string {
  return "'" + s.replace(/'/g, "''") + "'";
}

async function main() {
  const args = process.argv.slice(2);
  const outIdx = args.indexOf('--out');
  const outPath = outIdx >= 0 ? args[outIdx + 1] : null;
  const slugArgs = args.filter((a, i) => !a.startsWith('--') && (outIdx < 0 || i !== outIdx + 1));
  const specs = slugArgs.length
    ? TAILWATERS.filter((t) => slugArgs.includes(t.slug))
    : TAILWATERS;
  const unknown = slugArgs.filter((s) => !TAILWATERS.some((t) => t.slug === s));
  if (unknown.length) throw new Error(`Unknown tailwater slug(s): ${unknown.join(', ')}`);

  const cacheDir = join(process.cwd(), 'tmp', 'nhd');
  mkdirSync(cacheDir, { recursive: true });
  const log = (msg: string) => process.stderr.write(msg + '\n');

  log('Tailwater geometry');
  log('='.repeat(64));

  const wantedNames = new Set(specs.flatMap((s) => s.gnisNames));
  const flowByHuc = await loadFlowlines(
    specs.flatMap((s) => s.hucs),
    wantedNames,
    cacheDir,
    log,
  );

  const sqlChunks: string[] = [
    '-- Generated by scripts/ingestion/build-tailwater-geometry.ts',
    '-- Source: USGS National Map NHD HR HUC8 shapefiles, sliced between',
    '-- named endpoints. See each tailwater dossier under',
    '-- scripts/ingestion/dossiers/ for endpoint provenance.',
    '',
  ];

  for (const spec of specs) {
    const matches = spec.hucs.flatMap((huc) =>
      (flowByHuc.get(huc) ?? []).filter((f) => spec.gnisNames.includes(f.properties.gnis_name!)),
    );
    if (!matches.length) {
      log(`  ${spec.slug}: no perennial matches in HUC(s) ${spec.hucs.join('+')}`);
      continue;
    }
    const merged = dissolveLongest(matches);
    if (merged.length < 2) {
      log(`  ${spec.slug}: dissolve produced no chain`);
      continue;
    }
    const full: Feature<LineString> = turfLine(merged);
    const fullMiles = turfLength(full, { units: 'miles' });

    const fromPt = turfPoint([spec.from.lon, spec.from.lat]);
    const toPt = turfPoint([spec.to.lon, spec.to.lat]);
    // How far each anchor sits off the flowline. A dam is a structure ON the
    // river, so a large offset means the anchor or the flowline is wrong and
    // the slice would start somewhere arbitrary.
    const fromSnap = nearestPointOnLine(full, fromPt, { units: 'miles' });
    const toSnap = nearestPointOnLine(full, toPt, { units: 'miles' });
    const offFromMi = fromSnap.properties.dist ?? 0;
    const offToMi = toSnap.properties.dist ?? 0;

    const sliced = lineSlice(fromPt, toPt, full) as Feature<LineString>;
    const slicedMiles = turfLength(sliced, { units: 'miles' });

    const simplified = simplify(sliced, {
      tolerance: SIMPLIFY_TOLERANCE_DEG,
      highQuality: true,
    }) as Feature<LineString>;
    const coords = simplified.geometry.coordinates.map((c) => [
      Number(c[0].toFixed(6)),
      Number(c[1].toFixed(6)),
    ]);

    log('');
    log(`  ${spec.slug}`);
    log(`    full stem      ${matches.length} segs, ${fullMiles.toFixed(1)} mi`);
    log(`    from           ${spec.from.label} (${offFromMi.toFixed(3)} mi off line)`);
    log(`    to             ${spec.to.label} (${offToMi.toFixed(3)} mi off line)`);
    log(`    sliced         ${slicedMiles.toFixed(2)} mi → ${coords.length} pts`);

    const [wantMin, wantMax] = spec.expectMiles;
    if (slicedMiles < wantMin || slicedMiles > wantMax) {
      throw new Error(
        `${spec.slug}: slice is ${slicedMiles.toFixed(2)} mi, expected ` +
          `${wantMin}-${wantMax}. The anchors or the dissolved stem are wrong — ` +
          `refusing to emit geometry that would silently misplace every river mile.`,
      );
    }
    // lineSlice returns the slice oriented along the input line, and NHD
    // flowlines are digitized downstream, so coords[last] is the downstream
    // end. Assert it rather than trust it: a reversed river makes every
    // access-point mile count from the wrong end.
    const head = coords[0];
    const tail = coords[coords.length - 1];
    const headToFrom = Math.hypot(head[0] - spec.from.lon, head[1] - spec.from.lat);
    const tailToFrom = Math.hypot(tail[0] - spec.from.lon, tail[1] - spec.from.lat);
    if (headToFrom > tailToFrom) {
      throw new Error(
        `${spec.slug}: slice runs downstream→upstream (head is nearer ${spec.to.label} ` +
          `than ${spec.from.label}). Geometry must start at the dam.`,
      );
    }

    const wkt = `LINESTRING(${coords.map((c) => `${c[0]} ${c[1]}`).join(', ')})`;
    const [dLon, dLat] = tail;
    const lengthMiles = Math.round(slicedMiles * 100) / 100;

    writeFileSync(
      join(cacheDir, `${spec.slug}.geojson`),
      JSON.stringify({ type: 'Feature', properties: { slug: spec.slug }, geometry: simplified.geometry }),
    );

    const m = spec.meta;
    sqlChunks.push(
      `-- ── ${m.name} (${spec.slug}) ${'─'.repeat(Math.max(0, 46 - m.name.length))}`,
      `-- ${spec.from.label} → ${spec.to.label}, ${lengthMiles} mi, ${coords.length} vertices`,
      `--   from: ${spec.from.source}`,
      `--   to:   ${spec.to.source}`,
      `--`,
      `-- active = false. No agency publishes a rating mapping release to`,
      `-- wade/float safety on this river, so river_gauges.level_* stay NULL,`,
      `-- and validate_river_data() raises missing_thresholds as an ERROR for`,
      `-- an ACTIVE river whose primary gauge has no ladder. Inactive is the`,
      `-- honest state, not a half-finished one.`,
      `INSERT INTO rivers (`,
      `    name, slug, geom, length_miles, downstream_point, direction_verified,`,
      `    geometry_starts_at_headwaters, description, difficulty_rating, region,`,
      `    state, country, timezone, river_type, controlling_dam_id, active,`,
      `    weather_city, weather_lat, weather_lon, alert_search_terms`,
      `) VALUES (`,
      `    ${sqlQuote(m.name)}, ${sqlQuote(spec.slug)},`,
      `    ST_GeomFromText(${sqlQuote(wkt)}, 4326),`,
      `    ${lengthMiles}, ST_SetSRID(ST_MakePoint(${dLon}, ${dLat}), 4326), true,`,
      `    true, ${sqlQuote(m.description)},`,
      `    ${sqlQuote(m.difficultyRating)}, ${sqlQuote(m.region)},`,
      `    ${sqlQuote(m.state)}, 'US', ${sqlQuote(m.timezone)},`,
      `    ${sqlQuote(m.riverType)}, ${sqlQuote(m.controllingDamId)}, false,`,
      `    ${sqlQuote(m.weather.city)}, ${m.weather.lat}, ${m.weather.lon},`,
      `    ARRAY[${m.alertSearchTerms.map(sqlQuote).join(', ')}]::text[]`,
      `)`,
      `ON CONFLICT (slug) DO UPDATE SET`,
      `    geom = EXCLUDED.geom,`,
      `    length_miles = EXCLUDED.length_miles,`,
      `    downstream_point = EXCLUDED.downstream_point,`,
      `    direction_verified = EXCLUDED.direction_verified,`,
      `    geometry_starts_at_headwaters = EXCLUDED.geometry_starts_at_headwaters,`,
      `    description = EXCLUDED.description,`,
      `    river_type = EXCLUDED.river_type,`,
      `    controlling_dam_id = EXCLUDED.controlling_dam_id,`,
      `    weather_city = EXCLUDED.weather_city,`,
      `    weather_lat = EXCLUDED.weather_lat,`,
      `    weather_lon = EXCLUDED.weather_lon,`,
      `    alert_search_terms = EXCLUDED.alert_search_terms;`,
      '',
    );
  }

  const sql = sqlChunks.join('\n') + '\n';
  if (outPath) {
    writeFileSync(outPath, sql);
    log(`\nWrote ${sql.length} bytes to ${outPath}`);
  } else {
    process.stdout.write(sql);
  }
  log('\nDone. Nothing was written to the database.');
}

main().catch((e) => {
  console.error('FATAL:', e);
  process.exit(1);
});
