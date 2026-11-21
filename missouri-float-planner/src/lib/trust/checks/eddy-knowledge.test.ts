import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import {
  deriveKnowledgeFindings, deriveKnowledgeGaugeFindings, deriveReportingGaugeFindings, deriveRiverNoteFindings,
  putInGaugeByMile, putInGaugeByPoint, reportingSites,
  type KnowledgeGaugeInput, type PutIn, type PutInGaugeLink, type PutInSection,
} from './eddy-knowledge';

const GENERAL = 'Strainers are the number one hazard. Spring-fed rivers recover slowly.';

test('a river with no knowledge section is reported', () => {
  // The gap this covers is recorded in getKnowledgeForTarget()'s own warning:
  // Gasconade shipped without a section, so Eddy wrote about it from the
  // General Ozarks primer alone. That failure is silent by construction —
  // general knowledge produces confident prose, not an error.
  const findings = deriveKnowledgeFindings({
    activeRiverSlugs: ['current', 'gasconade'],
    knowledgeSlugs: ['current'],
    generalKnowledge: GENERAL,
  });

  assert.equal(findings.length, 1);
  assert.equal(findings[0].ruleKey, 'knowledge_missing_section');
  assert.equal(findings[0].entityKey, 'gasconade');
});

test('a river activated without a section is reported, whichever river it is', () => {
  // Active means rivers.active, which is what run() selects on. Big Sugar
  // Creek and the Illinois River have dossiers and no section; the day either
  // goes live without one, this fires.
  const findings = deriveKnowledgeFindings({
    activeRiverSlugs: ['big-sugar-creek', 'elk', 'illinois-river'],
    knowledgeSlugs: ['elk', 'current'],
    generalKnowledge: GENERAL,
  });
  assert.deepEqual(findings.map((f) => [f.ruleKey, f.entityKey]), [
    ['knowledge_missing_section', 'big-sugar-creek'],
    ['knowledge_missing_section', 'illinois-river'],
  ]);
});

test('full coverage produces nothing', () => {
  const findings = deriveKnowledgeFindings({
    activeRiverSlugs: ['current', 'jacks-fork'],
    knowledgeSlugs: ['current', 'jacks-fork', 'meramec'],
    generalKnowledge: GENERAL,
  });
  assert.deepEqual(findings, []);
});

test('extra knowledge sections for inactive rivers are not a finding', () => {
  // Knowledge written ahead of a launch is preparation, not drift.
  const findings = deriveKnowledgeFindings({
    activeRiverSlugs: ['current'],
    knowledgeSlugs: ['current', 'buffalo', 'st-francis'],
    generalKnowledge: GENERAL,
  });
  assert.deepEqual(findings, []);
});

// ── the missing-file case is separated on purpose ────────────────

test('a missing knowledge file raises one finding, not one per river', () => {
  // parseKnowledgeFile() swallows a read failure and returns empty sections with
  // only a console warning, so a deployment that lost the file is
  // indistinguishable from one whose file covers nothing. Filing thirteen
  // per-river findings would bury the single actual cause under its symptoms.
  const findings = deriveKnowledgeFindings({
    activeRiverSlugs: ['current', 'jacks-fork', 'meramec'],
    knowledgeSlugs: [],
    generalKnowledge: '',
  });

  assert.equal(findings.length, 1);
  assert.equal(findings[0].ruleKey, 'knowledge_file_missing');
  assert.equal(findings[0].entityType, 'repo');
});

test('a present file with a General block but no river sections is per-river', () => {
  // This one is real coverage drift, not an absent file, and it should name the
  // rivers so they can be fixed one at a time.
  const findings = deriveKnowledgeFindings({
    activeRiverSlugs: ['current', 'jacks-fork'],
    knowledgeSlugs: [],
    generalKnowledge: GENERAL,
  });

  assert.equal(findings.length, 2);
  assert.deepEqual(
    findings.map((f) => f.ruleKey),
    ['knowledge_missing_section', 'knowledge_missing_section'],
  );
});

test('whitespace-only general knowledge still counts as an absent file', () => {
  const findings = deriveKnowledgeFindings({
    activeRiverSlugs: ['current'],
    knowledgeSlugs: [],
    generalKnowledge: '   \n  ',
  });
  assert.equal(findings[0].ruleKey, 'knowledge_file_missing');
});

test('no active rivers produces no findings', () => {
  // Reconciliation refuses to act on this anyway via scopeCount, but the check
  // should not invent work either.
  const findings = deriveKnowledgeFindings({
    activeRiverSlugs: [],
    knowledgeSlugs: ['current'],
    generalKnowledge: GENERAL,
  });
  assert.deepEqual(findings, []);
});

// ── the stored river note ───────────────────────────────────────────

const PLACEHOLDER =
  'Per-section hydro types: wolf-pen-to-redding=undefined, redding-to-turner-bend=undefined. River-level default: rain_flashy.';

test('ingest bookkeeping in river_note is reported per river', () => {
  // Sixteen active rivers carried this on 2026-11-16, and the Read prompt
  // presented it as "Gauge notes:". It is data-shaped, so nothing failed.
  const findings = deriveRiverNoteFindings([
    { slug: 'mulberry', note: PLACEHOLDER },
    { slug: 'current', note: 'Spring-fed with a consistent base flow.' },
    { slug: 'kings-river', note: null },
  ]);

  assert.equal(findings.length, 1);
  assert.equal(findings[0].ruleKey, 'river_note_malformed');
  assert.equal(findings[0].entityKey, 'mulberry');
  assert.equal(findings[0].evidence?.defect, 'ingestion_placeholder');
});

test('a malformed note is still reported when the knowledge file is missing', () => {
  // Two separate causes. The single knowledge_file_missing finding must not
  // swallow a defect that lives in the database.
  const findings = deriveKnowledgeFindings({
    activeRiverSlugs: ['mulberry'],
    knowledgeSlugs: [],
    generalKnowledge: '',
    riverNotes: [{ slug: 'mulberry', note: PLACEHOLDER }],
  });

  assert.deepEqual(
    findings.map((f) => f.ruleKey).sort(),
    ['knowledge_file_missing', 'river_note_malformed'],
  );
});

test('omitting riverNotes leaves the knowledge-file rules unchanged', () => {
  const findings = deriveKnowledgeFindings({
    activeRiverSlugs: ['current'],
    knowledgeSlugs: ['current'],
    generalKnowledge: GENERAL,
  });
  assert.deepEqual(findings, []);
});

// ── gauges named in the file against river_gauges ───────────────────

test('a gauge the river is not linked to is reported, once per river', () => {
  const findings = deriveKnowledgeGaugeFindings([{
    slug: 'current',
    linkedSiteIds: ['07067000', '07064533'],
    primarySiteId: '07067000',
    fileGauges: [{ siteId: '07067000', confirmed: true }, { siteId: '07099999', confirmed: false }],
    reachTagSiteIds: ['07064533', '07088888'],
  }]);
  assert.equal(findings.length, 1);
  assert.equal(findings[0].ruleKey, 'knowledge_gauge_mismatch');
  assert.match(findings[0].detail ?? '', /names 07088888, 07099999, which river_gauges does not link to this river/);
});

test('the tag rule is about tags only: drafts, no blocks and an uncovered main gauge are not mismatches', () => {
  // A gauge with no block is knowledge_gauge_no_block, below.
  assert.deepEqual(deriveKnowledgeGaugeFindings([
    { slug: 'meramec', linkedSiteIds: ['07013000', '07019000'], primarySiteId: '07013000', fileGauges: [{ siteId: '07013000', confirmed: false }], reachTagSiteIds: [] },
    { slug: 'elk', linkedSiteIds: ['07188925'], primarySiteId: '07188925', fileGauges: [], reachTagSiteIds: [] },
    { slug: 'jacks-fork', linkedSiteIds: ['07065495', '07066000'], primarySiteId: '07066000', fileGauges: [{ siteId: '07065495', confirmed: true }], reachTagSiteIds: [] },
  ]), []);
});

// ── a gauge a Read reports from, with no block ──────────────────────

// The White as production held it on 2026-11-20, after 20261120142104: the
// Corps' release at Bull Shoals is the main gauge, three stretches name the
// gauge each put-in reads, and Norfork Dam is linked as a tributary with no
// mile. The file had no White gauge blocks at all.
const WHITE_LINKS: PutInGaugeLink[] = [
  { stationId: 'bull', siteId: 'swl-bull-shoals-dam', isPrimary: true, riverMile: 0.2, active: true, point: [-92.575, 36.365] },
  { stationId: 'norfork-gauge', siteId: '07057370', isPrimary: false, riverMile: 42.0, active: true, point: [-92.247, 36.248] },
  { stationId: 'calico', siteId: '07060500', isPrimary: false, riverMile: 60.7, active: true, point: [-92.144, 36.115] },
  { stationId: 'norfork-dam', siteId: 'swl-norfork-dam', isPrimary: false, riverMile: null, active: true, point: [-92.240, 36.249] },
];
const WHITE_SECTIONS: PutInSection[] = [
  { gaugeStationId: 'bull', start: 0, end: 24, sortOrder: 1 },
  { gaugeStationId: 'norfork-gauge', start: 24, end: 43, sortOrder: 2 },
  { gaugeStationId: 'calico', start: 43, end: 95, sortOrder: 3 },
];
// Jim Griffin, Ranchette, Red's Landing, Guion.
const WHITE_PUT_INS: PutIn[] = [
  { mile: 0.54, point: [-92.57, 36.36] },
  { mile: 26.88, point: [-92.38, 36.30] },
  { mile: 50.84, point: [-92.20, 36.20] },
  { mile: 90.46, point: [-91.94, 35.92] },
];

const river = (over: Partial<KnowledgeGaugeInput>): KnowledgeGaugeInput => ({
  slug: 'white', linkedSiteIds: WHITE_LINKS.map((l) => l.siteId!), primarySiteId: 'swl-bull-shoals-dam',
  fileGauges: [], reachTagSiteIds: [], ...over,
});

test('a put-in reads the stretch that holds it, on both paths', () => {
  assert.deepEqual(WHITE_PUT_INS.map((p) => putInGaugeByMile(p.mile!, WHITE_LINKS, WHITE_SECTIONS)?.siteId),
    ['swl-bull-shoals-dam', '07057370', '07060500', '07060500']);
  assert.deepEqual(WHITE_PUT_INS.map((p) => putInGaugeByPoint(p, WHITE_LINKS, WHITE_SECTIONS)?.siteId),
    ['swl-bull-shoals-dam', '07057370', '07060500', '07060500']);
  // Norfork Dam is linked but no put-in reads it, so it is not a reporting gauge.
  assert.deepEqual(reportingSites(WHITE_LINKS, WHITE_SECTIONS, WHITE_PUT_INS), [
    { siteId: 'swl-bull-shoals-dam', main: true, putIns: 1 },
    { siteId: '07057370', main: false, putIns: 1 },
    { siteId: '07060500', main: false, putIns: 2 },
  ]);
});

test('with no stretch, the stored mile reads the nearest gauge upstream, then downstream, then the main gauge', () => {
  const links: PutInGaugeLink[] = [
    { stationId: 'a', siteId: 'A', isPrimary: true, riverMile: null, active: true, point: [0, 0] },
    { stationId: 'b', siteId: 'B', isPrimary: false, riverMile: 10, active: true, point: [0, 1] },
    { stationId: 'c', siteId: 'C', isPrimary: false, riverMile: 30, active: true, point: [0, 2] },
    { stationId: 'd', siteId: 'D', isPrimary: false, riverMile: 20, active: false, point: [0, 1.5] },
  ];
  assert.equal(putInGaugeByMile(25, links, [])?.siteId, 'B', 'nearest upstream, skipping the inactive gauge');
  assert.equal(putInGaugeByMile(5, links, [])?.siteId, 'B', 'nothing upstream: nearest downstream');
  assert.equal(putInGaugeByMile(5, [links[0]], [])?.siteId, 'A', 'no mile anywhere: the main gauge');
  // A stretch naming a gauge that is not linked and active gives no gauge at all.
  assert.equal(putInGaugeByMile(25, links, [{ gaugeStationId: 'd', start: 20, end: 30, sortOrder: 1 }]), null);
  // The point path takes the nearest active gauge by distance, mile or not.
  assert.equal(putInGaugeByPoint({ mile: null, point: [0, 0.1] }, links, [])?.siteId, 'A');
  assert.equal(putInGaugeByPoint({ mile: 25, point: [0, 1.6] }, links, [])?.siteId, 'C');
});

test('a gauge the river reports from with no block is reported, even when the river has no blocks at all', () => {
  // The White on 2026-11-20. The old rule waited for the river to have a
  // confirmed block before checking its main gauge, so it said nothing.
  const findings = deriveReportingGaugeFindings([river({ reportingSites: reportingSites(WHITE_LINKS, WHITE_SECTIONS, WHITE_PUT_INS) })]);
  assert.equal(findings.length, 1);
  assert.equal(findings[0].ruleKey, 'knowledge_gauge_no_block');
  assert.equal(findings[0].entityKey, 'white');
  assert.equal(
    findings[0].detail,
    'EDDY_KNOWLEDGE.md has no confirmed "### Gauge:" block for 07057370 (read by 1 put-in); 07060500 (read by 2 put-ins); swl-bull-shoals-dam (the main gauge, read by 1 put-in). A Read from that gauge is not told where it sits or which water it speaks for.',
  );
});

test('a drafted block does not cover its gauge, and a confirmed one does', () => {
  const findings = deriveReportingGaugeFindings([river({
    reportingSites: reportingSites(WHITE_LINKS, WHITE_SECTIONS, WHITE_PUT_INS),
    fileGauges: [
      { siteId: 'swl-bull-shoals-dam', confirmed: true },
      { siteId: '07057370', confirmed: true },
      { siteId: '07060500', confirmed: false },
    ],
  })]);
  assert.match(findings[0].detail, /block for 07060500 \(read by 2 put-ins, its block is still \{unconfirmed\}\)\./);
  assert.deepEqual(findings[0].evidence?.confirmed, ['07057370', 'swl-bull-shoals-dam']);
});

test('a linked gauge no Read reports from needs no block', () => {
  // The Jacks Fork's main gauge has its block, and so do the two its put-ins
  // read. A fourth linked gauge nobody reads asks for nothing.
  const reporting = [
    { siteId: '07066000', main: true, putIns: 3 },
    { siteId: '07065495', main: false, putIns: 2 },
    { siteId: '07065200', main: false, putIns: 6 },
  ];
  assert.deepEqual(deriveReportingGaugeFindings([{
    slug: 'jacks-fork', linkedSiteIds: ['07066000', '07065495', '07065200', '07099999'], primarySiteId: '07066000',
    reportingSites: reporting, fileGauges: reporting.map((s) => ({ siteId: s.siteId, confirmed: true })), reachTagSiteIds: [],
  }]), []);
  // Without put-in data the main gauge alone counts.
  const elk = deriveReportingGaugeFindings([{ slug: 'elk', linkedSiteIds: ['07188925'], primarySiteId: '07188925', fileGauges: [], reachTagSiteIds: [] }]);
  assert.match(elk[0].detail, /block for 07188925 \(the main gauge\)\./);
});

test("the put-in mirror follows the migration that last defined get_river_condition_segment()", () => {
  // putInGaugeByMile/ByPoint copy the function's rules. When a migration
  // redefines it, re-read the new definition, bring the mirror in line, then
  // name the migration here.
  const dir = join(process.cwd(), 'supabase', 'migrations');
  const defining = readdirSync(dir)
    .filter((name) => name.endsWith('.sql'))
    .sort()
    .filter((name) => /function\s+(?:public\.)?get_river_condition_segment\s*\(/i.test(readFileSync(join(dir, name), 'utf8')));
  assert.equal(defining.at(-1), '20261117014151_flood_stage_resolves_station_first.sql');
});
