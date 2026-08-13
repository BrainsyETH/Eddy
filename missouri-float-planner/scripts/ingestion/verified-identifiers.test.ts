// Make the identifier gate a gate.
//
// `ingest-dossier.ts` refuses to run when a dossier names a USGS site that is
// absent from `verified-identifiers-<slug>.md`, and that mechanical refusal is
// the only reason the artifact gets written honestly rather than after the
// fact. The tailwater path has no importer — a tailwater reaches production
// through the registry and hand-written migrations — so nothing read the
// artifact at all, and the first one produced was, in effect, self-graded: it
// was written by the same pass that chose the identifiers, and no code
// disagreed with it.
//
// These tests close that. They are deliberately about the REGISTRY rather than
// about migrations, because the registry is what every surface reads: a site id
// that never appears there cannot be fetched, and one that does appear there is
// live on the dam page, the river hub, /api/high-water and iOS.
//
// ── The denylist is the interesting half ──────────────────────────────────
// A verification artifact records two findings, and only one of them has ever
// been enforceable anywhere. "This id is real" is a fact about a station.
// "This id must never be wired" is a decision about Eddy — a discontinued
// gauge, or a water-quality station with no discharge — and it is exactly the
// finding that decays into prose nobody rereads.
//
// So the artifact's own "DO NOT WIRE" sections are parsed and enforced. The
// document and the mechanism are the same object, which is the only
// arrangement where they cannot drift apart. Writing 07055500 into the
// registry now fails a test that cites the file explaining why.

import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { USACE_DAMS } from '@/lib/flow-providers/usace-registry';

const DOSSIER_DIR = path.resolve(process.cwd(), 'scripts/ingestion/dossiers');

interface Artifact {
  file: string;
  text: string;
}

function artifacts(): Artifact[] {
  return readdirSync(DOSSIER_DIR)
    .filter((f) => f.startsWith('verified-identifiers-') && f.endsWith('.md'))
    .map((file) => ({ file, text: readFileSync(path.join(DOSSIER_DIR, file), 'utf8') }));
}

/** Every artifact concatenated — an identifier may be verified in any of them. */
function corpus(): string {
  return artifacts()
    .map((a) => a.text)
    .join('\n');
}

/**
 * USGS site ids named under a heading that says DO NOT WIRE, per artifact.
 *
 * Scoped by heading depth: the section ends at the next heading of the same or
 * shallower level, so `### 07055500 — …` subsections stay inside a `## … DO NOT
 * WIRE` block while the following `##` closes it. Eight digits exactly, with
 * word boundaries, which excludes parameter codes (00060), dates, and migration
 * timestamps.
 */
function deniedSiteIds(): Map<string, string> {
  const denied = new Map<string, string>();
  for (const { file, text } of artifacts()) {
    let depth: number | null = null;
    for (const line of text.split('\n')) {
      const heading = /^(#+)\s+(.*)$/.exec(line);
      if (heading) {
        const level = heading[1].length;
        if (depth !== null && level <= depth) depth = null;
        if (depth === null && /do not wire/i.test(heading[2])) depth = level;
        if (depth !== null) {
          for (const id of heading[2].match(/\b\d{8}\b/g) ?? []) denied.set(id, file);
        }
        continue;
      }
      if (depth === null) continue;
      for (const id of line.match(/\b\d{8}\b/g) ?? []) denied.set(id, file);
    }
  }
  return denied;
}

function tailwaterDams() {
  return Object.values(USACE_DAMS).filter((d) => d.tailwater);
}

test('the identifier artifacts are present and parseable', () => {
  // A silently empty corpus would make every assertion below vacuously pass,
  // which is the failure mode this whole file exists to prevent.
  const found = artifacts();
  assert.ok(found.length > 0, 'no verified-identifiers-*.md found — did the dossier directory move?');
  assert.ok(tailwaterDams().length > 0, 'no dam declares a tailwater — the checks below would be vacuous');
});

test('every wired tailwater identifier is recorded in a verification artifact', () => {
  const text = corpus();
  for (const dam of tailwaterDams()) {
    const tw = dam.tailwater!;
    const required = [tw.releaseStationId, ...tw.downstreamGaugeSiteIds];
    for (const id of required) {
      assert.ok(
        text.includes(id),
        `${dam.id}: "${id}" is wired in the registry but appears in no verified-identifiers-*.md. ` +
          'Verify it on its primary source and record it, or remove it from the registry.',
      );
    }
  }
});

test('every tailwater dam records its CWMS location and schedule code', () => {
  // The site ids above are the ones people check. These are the ones that
  // silently fetch nothing when wrong: cdaLocation goes straight into a CDA
  // query parameter, where a typo is a 404 rather than a type error.
  const text = corpus();
  for (const dam of tailwaterDams()) {
    // Optional on the type, because a SWPA-schedule-only dam publishes no CWMS
    // series at all. Not optional here: a tailwater's whole claim is that Eddy
    // knows what the dam released, and that number comes from CWMS.
    const cdaLocation = dam.cdaLocation;
    assert.ok(cdaLocation, `${dam.id}: claims a tailwater but names no CWMS location to read its release from`);
    assert.ok(
      text.includes(cdaLocation),
      `${dam.id}: CWMS location "${cdaLocation}" is unrecorded in any verification artifact`,
    );
    if (dam.swpaCode) {
      assert.ok(
        text.includes(dam.swpaCode),
        `${dam.id}: SWPA project code "${dam.swpaCode}" is unrecorded in any verification artifact`,
      );
    }
  }
});

test('an identifier marked DO NOT WIRE is not wired', () => {
  const denied = deniedSiteIds();
  assert.ok(
    denied.size > 0,
    'no DO NOT WIRE section parsed — the denylist would be vacuous. Check the heading wording.',
  );

  for (const dam of tailwaterDams()) {
    const tw = dam.tailwater!;
    for (const id of [tw.releaseStationId, ...tw.downstreamGaugeSiteIds]) {
      const source = denied.get(id);
      assert.equal(
        source,
        undefined,
        `${dam.id}: "${id}" is wired, but ${source} lists it under DO NOT WIRE. ` +
          'That section records discontinued gauges and water-quality-only stations — read the reason there before changing either.',
      );
    }
  }
});

test('the denylist covers the stations this river would otherwise have used', () => {
  // Named explicitly, because a denylist that happens to be empty of the
  // dangerous cases still passes the test above. These five are the Bull
  // Shoals research's own proposals: three water-quality-only stations below
  // the dam, and two gauges discontinued in 1981 and earlier.
  const denied = deniedSiteIds();
  for (const id of ['07054501', '07054502', '07054527', '07055000', '07055500']) {
    assert.ok(
      denied.has(id),
      `${id} is no longer recorded under a DO NOT WIRE heading — if it became wireable, say why there`,
    );
  }
});
