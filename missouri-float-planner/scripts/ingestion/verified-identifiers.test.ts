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

/** Every artifact concatenated. Used only for the global denylist. */
function corpus(): string {
  return artifacts()
    .map((a) => a.text)
    .join('\n');
}

/**
 * The artifact belonging to one dam, by the naming convention.
 *
 * Scoped rather than searched across everything, because "this id appears in
 * SOME file" is a much weaker claim than it looks: Norfork's release station
 * documented in Bull Shoals' artifact would satisfy a corpus search while
 * proving nothing about Norfork. The file a fact lives in is part of the fact.
 */
function artifactForDam(damId: string): Artifact | null {
  const name = `verified-identifiers-tailwater-${damId}.md`;
  return artifacts().find((a) => a.file === name) ?? null;
}

/**
 * Identifiers named under a heading that says DO NOT WIRE, mapped to the file
 * that denied them.
 *
 * Scoped by heading depth: the section ends at the next heading of the same or
 * shallower level, so `### 07055500 — …` subsections stay inside a `## … DO NOT
 * WIRE` block while the following `##` closes it.
 *
 * ── Why several patterns and not just USGS ids ────────────────────────────
 * An earlier version matched eight-digit numbers only, while the process doc
 * claimed the denylist covered release stations, CWMS locations and schedule
 * codes. It did not — a dead CWMS series could be documented as never-wire and
 * then wired, with a passing test and a document saying otherwise, which is
 * worse than no check because it reads as one. The patterns now cover the
 * shapes Eddy actually registers:
 *
 *   07055500              USGS site        eight digits, word-bounded, so
 *                                          parameter codes (00060), dates and
 *                                          migration timestamps do not match
 *   Bull_Shoals_Dam       CWMS location    underscore-joined words
 *   swl-bull-shoals-dam   release station  registry id
 *   `BSD`                 anything else    backticked, for codes too short or
 *                                          too common to pattern-match safely
 *
 * A false positive would need a wired identifier to be spelled identically to
 * a token inside a do-not-wire section — which is itself worth a look.
 */
function deniedIdentifiers(): Map<string, string> {
  const PATTERNS = [
    /\b\d{8}\b/g, // USGS site id
    /\b[A-Za-z]+(?:_[A-Za-z]+)+\b/g, // CWMS location, e.g. Bull_Shoals_Dam
    /\b[a-z]{3}-[a-z0-9-]+-dam\b/g, // registry/release station id
    /`([^`]+)`/g, // anything explicitly quoted
  ];

  const denied = new Map<string, string>();
  const harvest = (text: string, file: string) => {
    for (const re of PATTERNS) {
      for (const m of text.matchAll(re)) denied.set(m[1] ?? m[0], file);
    }
  };

  for (const { file, text } of artifacts()) {
    let depth: number | null = null;
    for (const line of text.split('\n')) {
      const heading = /^(#+)\s+(.*)$/.exec(line);
      if (heading) {
        const level = heading[1].length;
        if (depth !== null && level <= depth) depth = null;
        if (depth === null && /do not wire/i.test(heading[2])) depth = level;
        if (depth !== null) harvest(heading[2], file);
        continue;
      }
      if (depth === null) continue;
      harvest(line, file);
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

test('every wired tailwater identifier is recorded in THAT DAM\'s artifact', () => {
  for (const dam of tailwaterDams()) {
    const artifact = artifactForDam(dam.id);
    assert.ok(
      artifact,
      `${dam.id}: no verified-identifiers-tailwater-${dam.id}.md. A tailwater reaches production through ` +
        'the registry and hand-written migrations, so this file is the only record that its identifiers were checked.',
    );

    const tw = dam.tailwater!;
    for (const id of [tw.releaseStationId, ...tw.downstreamGaugeSiteIds]) {
      assert.ok(
        artifact.text.includes(id),
        `${dam.id}: "${id}" is wired but does not appear in ${artifact.file}. ` +
          'Verify it on its primary source and record it there, or remove it from the registry.',
      );
    }

    // These are the ones that silently fetch nothing when wrong: cdaLocation
    // goes straight into a CDA query parameter, where a typo is a 404 rather
    // than a type error. Optional on the type because a schedule-only dam
    // publishes no CWMS series; not optional here, because a tailwater's whole
    // claim is that Eddy knows what the dam released.
    const cdaLocation = dam.cdaLocation;
    assert.ok(cdaLocation, `${dam.id}: claims a tailwater but names no CWMS location to read its release from`);
    assert.ok(
      artifact.text.includes(cdaLocation),
      `${dam.id}: CWMS location "${cdaLocation}" is unrecorded in ${artifact.file}`,
    );
    if (dam.swpaCode) {
      assert.ok(
        artifact.text.includes(dam.swpaCode),
        `${dam.id}: SWPA project code "${dam.swpaCode}" is unrecorded in ${artifact.file}`,
      );
    }
  }
});

test('an identifier marked DO NOT WIRE is not wired', () => {
  // Global across every artifact, deliberately — unlike the per-dam checks
  // above. A denial is a decision about Eddy rather than a fact about one
  // project, and a station one tailwater ruled out is worth catching when
  // another wires it. Defence in depth, so the two scopes are not redundant.
  const denied = deniedIdentifiers();
  assert.ok(
    denied.size > 0,
    'no DO NOT WIRE section parsed — the denylist would be vacuous. Check the heading wording.',
  );

  for (const dam of tailwaterDams()) {
    const tw = dam.tailwater!;
    const wired = [
      tw.releaseStationId,
      ...tw.downstreamGaugeSiteIds,
      ...(dam.cdaLocation ? [dam.cdaLocation] : []),
      ...(dam.swpaCode ? [dam.swpaCode] : []),
    ];
    for (const id of wired) {
      const source = denied.get(id);
      assert.equal(
        source,
        undefined,
        `${dam.id}: "${id}" is wired, but ${source} lists it under DO NOT WIRE. ` +
          'That section records discontinued gauges, dead series and water-quality-only stations — read the reason there before changing either.',
      );
    }
  }
});

test('the denylist covers the stations this river would otherwise have used', () => {
  // Named explicitly, because a denylist that happens to be empty of the
  // dangerous cases still passes the test above. These five are the Bull
  // Shoals research's own proposals: three water-quality-only stations below
  // the dam, and two gauges discontinued in 1981 and earlier.
  const denied = deniedIdentifiers();
  for (const id of ['07054501', '07054502', '07054527', '07055000', '07055500']) {
    assert.ok(
      denied.has(id),
      `${id} is no longer recorded under a DO NOT WIRE heading — if it became wireable, say why there`,
    );
  }
});
