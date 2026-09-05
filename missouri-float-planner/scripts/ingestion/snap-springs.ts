#!/usr/bin/env npx tsx
/**
 * Place the mile-by-mile guide's springs on the map.
 *
 * ── WHAT THIS DOES ────────────────────────────────────────────────────────
 *
 * `floatmissouri_mile_markers.json` knows about springs the database does not,
 * but it knows them only as a RIVER MILE and a sentence of prose. This turns
 * that into `points_of_interest` rows with real coordinates, in four stages,
 * each of which can refuse:
 *
 *   1. EXTRACT   — read the prose, keep the sentences that actually assert a
 *                  named spring on the channel (src/lib/pois/spring-extract).
 *   2. ALIGN     — put the guide's mile numbers on the database's mile axis,
 *                  using access points both sources name (src/lib/pois/mile-axis).
 *   3. SNAP      — convert a mile to a position by interpolating between access
 *                  points, not by dividing by length (src/lib/geo/mile-index).
 *   4. DEDUPE    — drop what the source, the curated POIs or the access layer
 *                  already covers (src/lib/pois/spring-dedupe).
 *
 * ── DRY RUN BY DEFAULT ────────────────────────────────────────────────────
 *
 *   npx tsx scripts/ingestion/snap-springs.ts              # report only
 *   npx tsx scripts/ingestion/snap-springs.ts --json out.json
 *   npx tsx scripts/ingestion/snap-springs.ts --apply      # writes; needs the pin
 *
 * `--apply` goes through `getScriptClient({ write: true })`, so it refuses
 * unless `EXPECTED_SUPABASE_REF` names the project the credentials resolve to.
 * See scripts/ingestion/README.md, guardrail #5.
 *
 * ── THE GATES, AND WHY THEY ARE WHERE THEY ARE ────────────────────────────
 *
 * A pin on a map is a promise that something is there. Every threshold below
 * exists to keep this script from making one it cannot keep, and each is
 * reported per river so a refusal can be read rather than guessed at:
 *
 *   MIN_AXIS_INLIERS   The mile-axis offset must be agreed by three matched
 *                      access points. Two agreeing pairs happen by chance on a
 *                      river with twenty access points.
 *   MAX_BRACKET_MI     A spring must fall between two access points no more
 *                      than this far apart. Leave-one-out over all 350 approved
 *                      access points puts the median error at ~130 m inside a
 *                      12-mile bracket and ~490 m beyond 20, and an unbracketed
 *                      mile — one past the last access point — is extrapolation
 *                      off the end of a line and is always refused.
 *   MIN_CONTROLS       A river needs enough access points to interpolate at all.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { getScriptClient } from '../lib/db';
import {
  buildMileIndex,
  interpolateAlong,
  mileToFraction,
  type MileControl,
} from '../../src/lib/geo/mile-index';
import { alignMileAxis, pairAccessByName } from '../../src/lib/pois/mile-axis';
// The guide-id → slug table, shared with the social path so the two cannot
// disagree about which river a marker belongs to. Its header explains why a
// table rather than the suffix rule that used to live in section-picker.ts.
import { guideRiverSlug } from '../../src/lib/pois/guide-rivers';
import { extractSprings, type SpringMarker } from '../../src/lib/pois/spring-extract';
import {
  dedupeSprings,
  type CandidateRow,
} from '../../src/lib/pois/spring-dedupe';

const MIN_AXIS_INLIERS = 3;
const MAX_BRACKET_MI = 20;
const MIN_CONTROLS = 4;


interface RiverRow {
  id: string;
  slug: string;
  geom: { coordinates: [number, number][] } | null;
}

interface Snapped extends CandidateRow {
  riverId: string;
  sourceMile: number;
  lat: number;
  lng: number;
  side: string | null;
  isPrivate: boolean;
  bracketMiles: number;
  sourceText: string;
}

async function main() {
  const args = process.argv.slice(2);
  const apply = args.includes('--apply');
  const jsonAt = args.indexOf('--json');
  const jsonOut = jsonAt >= 0 ? args[jsonAt + 1] : null;

  const supabase = getScriptClient({ script: 'snap-springs', write: apply });

  const markers: SpringMarker[] = JSON.parse(
    readFileSync(join(process.cwd(), 'floatmissouri_mile_markers.json'), 'utf8'),
  );

  // ── Rivers, with geometry ─────────────────────────────────────────────
  // PostgREST renders a PostGIS `geometry` column as GeoJSON, so `geom` arrives
  // as `{ type: 'LineString', coordinates: [[lng, lat], …] }` — the same shape
  // `interpolateAlong` walks, in the same axis order.
  const { data: riverData, error: riverErr } = await supabase
    .from('rivers')
    .select('id, slug, geom');
  if (riverErr) throw new Error(`rivers: ${riverErr.message}`);
  const rivers = (riverData ?? []) as unknown as RiverRow[];

  const bySlug = new Map<string, RiverRow>();
  for (const r of rivers) bySlug.set(r.slug, r);

  // ── Access points: mile, name, and true position along the line ───────
  const { data: apRows, error: apErr } = await supabase
    .from('access_points')
    .select('name, river_mile_downstream, river_id, location_snap, location_orig')
    .eq('approved', true)
    .not('river_mile_downstream', 'is', null);
  if (apErr) throw new Error(`access_points: ${apErr.message}`);

  const idToSlug = new Map(rivers.map((r) => [r.id, r.slug]));
  const accessBySlug = new Map<
    string,
    { name: string; mile: number; lng: number; lat: number }[]
  >();
  for (const row of apRows ?? []) {
    const r = row as Record<string, unknown>;
    const slug = idToSlug.get(String(r.river_id));
    if (!slug) continue;
    const pt = (r.location_snap ?? r.location_orig) as
      | { coordinates?: [number, number] }
      | null;
    if (!pt?.coordinates) continue;
    const list = accessBySlug.get(slug) ?? [];
    list.push({
      name: String(r.name),
      mile: Number(r.river_mile_downstream),
      lng: pt.coordinates[0],
      lat: pt.coordinates[1],
    });
    accessBySlug.set(slug, list);
  }

  // ── Curated POIs already in the table ─────────────────────────────────
  const { data: poiRows, error: poiErr } = await supabase
    .from('points_of_interest')
    .select('name, river_id, river_mile, type');
  if (poiErr) throw new Error(`points_of_interest: ${poiErr.message}`);
  const curated = (poiRows ?? []).map((row) => {
    const r = row as Record<string, unknown>;
    return {
      riverSlug: r.river_id ? (idToSlug.get(String(r.river_id)) ?? null) : null,
      name: String(r.name),
      mile: r.river_mile == null ? null : Number(r.river_mile),
    };
  });

  // ── Per-river: align the axis, build the index, snap the springs ──────
  const snapped: Snapped[] = [];
  const refusals: string[] = [];
  const riverNotes: string[] = [];

  const guideByRiver = new Map<string, SpringMarker[]>();
  for (const m of markers) {
    const list = guideByRiver.get(m.river_id) ?? [];
    list.push(m);
    guideByRiver.set(m.river_id, list);
  }

  for (const [guideId, guideMarkers] of [...guideByRiver].sort()) {
    const springs = guideMarkers.filter(
      (m) => m.feature_type === 'spring' || m.has_spring,
    );
    if (springs.length === 0) continue;

    const slug = guideRiverSlug(guideId);
    if (!slug) {
      refusals.push(`${guideId}: ${springs.length} spring marker(s) — no river in the database`);
      continue;
    }
    const river = bySlug.get(slug);
    const access = accessBySlug.get(slug) ?? [];
    if (!river?.geom?.coordinates?.length) {
      refusals.push(`${slug}: ${springs.length} spring marker(s) — river has no geometry`);
      continue;
    }
    if (access.length < MIN_CONTROLS) {
      refusals.push(
        `${slug}: ${springs.length} spring marker(s) — only ${access.length} access points to interpolate between`,
      );
      continue;
    }

    // Align the guide's miles onto the database's.
    const guideAccess = guideMarkers
      .filter((m) => m.feature_type === 'access' || (m as { is_access_point?: boolean }).is_access_point)
      .map((m) => ({ mile: m.mile, description: m.description }));
    const alignment = alignMileAxis(pairAccessByName(guideAccess, access));
    if (!alignment || alignment.inliers < MIN_AXIS_INLIERS) {
      refusals.push(
        `${slug}: ${springs.length} spring marker(s) — mile axis not established ` +
          `(${alignment?.inliers ?? 0} agreeing access points, need ${MIN_AXIS_INLIERS})`,
      );
      continue;
    }

    const coords = river.geom.coordinates;
    const controls: MileControl[] = access.map((a) => ({
      mile: a.mile,
      fraction: locateAlong(coords, [a.lng, a.lat]),
    }));
    const index = buildMileIndex(controls);

    riverNotes.push(
      `${slug}: offset ${alignment.offsetMiles >= 0 ? '+' : ''}${alignment.offsetMiles} mi ` +
        `(${alignment.inliers}/${alignment.samples} agree, spread ${alignment.spreadMiles} mi), ` +
        `${index.controls.length} control points`,
    );

    for (const marker of springs) {
      const extraction = extractSprings(marker);
      for (const r of extraction.rejected) {
        refusals.push(`${slug} @${marker.mile}: ${r.reason}`);
      }
      for (const u of extraction.unnamed) {
        refusals.push(`${slug} @${marker.mile}: unnamed spring held for review — “${u.sourceText}”`);
      }
      for (const cand of extraction.named) {
        const dbMile = cand.mile + alignment.offsetMiles;
        const fix = mileToFraction(index, dbMile);
        if (!fix) {
          refusals.push(`${slug} @${marker.mile}: ${cand.name} — no usable mile index`);
          continue;
        }
        if (fix.bracketMiles === null) {
          refusals.push(
            `${slug} @${marker.mile}: ${cand.name} — mile ${dbMile.toFixed(1)} is past the ` +
              `outermost access point; position would be extrapolated`,
          );
          continue;
        }
        if (fix.bracketMiles > MAX_BRACKET_MI) {
          refusals.push(
            `${slug} @${marker.mile}: ${cand.name} — nearest access points are ` +
              `${fix.bracketMiles.toFixed(1)} mi apart (limit ${MAX_BRACKET_MI})`,
          );
          continue;
        }
        const pt = interpolateAlong(coords, fix.fraction);
        if (!pt) continue;
        snapped.push({
          riverSlug: slug,
          riverId: river.id,
          name: cand.name,
          mile: Math.round(dbMile * 10) / 10,
          sourceMile: cand.mile,
          lng: Math.round(pt[0] * 1e6) / 1e6,
          lat: Math.round(pt[1] * 1e6) / 1e6,
          side: cand.side,
          isPrivate: cand.isPrivate,
          bracketMiles: Math.round(fix.bracketMiles * 10) / 10,
          sourceText: cand.sourceText,
        });
      }
    }
  }

  // ── Dedupe ────────────────────────────────────────────────────────────
  const accessForDedupe = [...accessBySlug].flatMap(([slug, list]) =>
    list.map((a) => ({ riverSlug: slug, name: a.name, mile: a.mile })),
  );
  const { kept, dropped } = dedupeSprings(snapped, curated, accessForDedupe);

  // ── Report ────────────────────────────────────────────────────────────
  console.log('\n═══ mile axes ═══');
  riverNotes.forEach((n) => console.log('  ' + n));

  console.log(`\n═══ ${kept.length} springs to write ═══`);
  for (const s of kept) {
    console.log(
      `  ${s.riverSlug.padEnd(17)} mi ${String(s.mile).padStart(6)}  ` +
        `${s.lat.toFixed(5)},${s.lng.toFixed(5)}  ±${s.bracketMiles}mi  ` +
        `${s.name}${s.isPrivate ? '  [private]' : ''}`,
    );
  }

  console.log(`\n═══ ${dropped.length} redundant ═══`);
  for (const d of dropped) {
    console.log(`  ${d.row.riverSlug.padEnd(17)} ${d.row.name} — ${d.reason} (${d.against})`);
  }

  console.log(`\n═══ ${refusals.length} not placed ═══`);
  for (const r of refusals) console.log('  ' + r);

  if (jsonOut) {
    writeFileSync(jsonOut, JSON.stringify({ kept, dropped, refusals, riverNotes }, null, 2));
    console.log(`\nWrote ${jsonOut}`);
  }

  if (!apply) {
    console.log('\nDry run. Re-run with --apply (and EXPECTED_SUPABASE_REF set) to write.');
    return;
  }

  // ── Apply ─────────────────────────────────────────────────────────────
  //
  // The migration that adds `position_source` has to be in front of this run.
  // Without it every insert below fails on an unknown column, which is a loud
  // enough failure — but it fails 22 times after the report has already
  // printed, and the operator has to read past the results to find out nothing
  // was written. One probe, one sentence, no partial run.
  {
    const probe = await supabase
      .from('points_of_interest')
      .select('position_source')
      .limit(1);
    if (probe.error) {
      throw new Error(
        'points_of_interest.position_source is missing — apply migration ' +
          '20260905125455_a_spring_is_a_spring_and_a_cabin_is_not.sql first. ' +
          'Without it these rows cannot record that their positions are derived, ' +
          `and every one would read as surveyed. (${probe.error.message})`,
      );
    }
  }

  let written = 0;
  for (const s of kept) {
    const description = s.sourceText.slice(0, 500);
    const { error } = await supabase.from('points_of_interest').insert({
      river_id: s.riverId,
      name: s.name,
      slug: `${s.riverSlug}-${slugify(s.name)}`,
      type: 'spring',
      source: 'floatmissouri_mile_markers',
      description,
      latitude: s.lat,
      longitude: s.lng,
      river_mile: s.mile,
      active: true,
      is_on_water: true,
      // ── THE FIELD THAT KEEPS THIS HONEST ────────────────────────────
      // Every row this script writes has an INTERPOLATED position, and
      // `toSpring` reads a missing value as 'surveyed' — correct for the rows
      // that predate the column, and a lie about every row here. Without this
      // line the whole approximate/surveyed distinction collapses silently:
      // the pins draw, the callouts read as confident, and nothing fails.
      // It is also what gates `positionBracketMiles`, so omitting it throws
      // away the error bar as well as the label.
      position_source: 'derived_from_river_mile',
      raw_data: {
        source_mile: s.sourceMile,
        side: s.side,
        private: s.isPrivate,
        bracket_miles: s.bracketMiles,
        position: 'interpolated from river mile between access points',
        source_text: s.sourceText,
      },
    });
    if (error) {
      console.error(`  ✗ ${s.name}: ${error.message}`);
      continue;
    }
    written += 1;
  }
  console.log(`\nWrote ${written}/${kept.length} springs.`);
}

function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[’']/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

/**
 * Where a point sits along a line, 0–1 — the inverse of `interpolateAlong`.
 *
 * Planar over degrees, matching `ST_LineLocatePoint`, for the reason spelled
 * out in `mile-index.ts`: these fractions are the calibration, and measuring
 * them differently from the way the interpolation walks the line would bake a
 * latitude-dependent error into every result.
 */
function locateAlong(
  coords: readonly (readonly [number, number])[],
  p: readonly [number, number],
): number {
  let best = { dist: Infinity, along: 0 };
  let cum = 0;
  let total = 0;
  for (let i = 1; i < coords.length; i += 1) {
    total += Math.hypot(coords[i][0] - coords[i - 1][0], coords[i][1] - coords[i - 1][1]);
  }
  for (let i = 1; i < coords.length; i += 1) {
    const a = coords[i - 1];
    const b = coords[i];
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const segLen = Math.hypot(dx, dy);
    let t = 0;
    if (segLen > 0) {
      t = ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / (segLen * segLen);
      t = Math.max(0, Math.min(1, t));
    }
    const px = a[0] + dx * t;
    const py = a[1] + dy * t;
    const d = Math.hypot(p[0] - px, p[1] - py);
    if (d < best.dist) best = { dist: d, along: cum + segLen * t };
    cum += segLen;
  }
  return total === 0 ? 0 : best.along / total;
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
