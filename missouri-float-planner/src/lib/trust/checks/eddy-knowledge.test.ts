import assert from 'node:assert/strict';
import test from 'node:test';
import { deriveKnowledgeFindings, deriveKnowledgeGaugeFindings, deriveRiverNoteFindings } from './eddy-knowledge';

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

test('a river with confirmed blocks but none for its main gauge is reported', () => {
  // The state the Jacks Fork would be in if Eminence became the main gauge
  // and only the Alley Spring block had been confirmed.
  const findings = deriveKnowledgeGaugeFindings([{
    slug: 'jacks-fork',
    linkedSiteIds: ['07065495', '07066000'],
    primarySiteId: '07066000',
    fileGauges: [{ siteId: '07065495', confirmed: true }, { siteId: '07066000', confirmed: false }],
    reachTagSiteIds: [],
  }]);
  assert.match(findings[0].detail ?? '', /has confirmed gauge blocks but none for its main gauge 07066000/);
});

test('drafts alone, no blocks at all, and a covered main gauge are all quiet', () => {
  assert.deepEqual(deriveKnowledgeGaugeFindings([
    { slug: 'meramec', linkedSiteIds: ['07013000', '07019000'], primarySiteId: '07013000', fileGauges: [{ siteId: '07013000', confirmed: false }], reachTagSiteIds: [] },
    { slug: 'elk', linkedSiteIds: ['07188925'], primarySiteId: '07188925', fileGauges: [], reachTagSiteIds: [] },
    { slug: 'niangua', linkedSiteIds: ['06923250', '06923950'], primarySiteId: '06923250', fileGauges: [{ siteId: '06923250', confirmed: true }, { siteId: '06923950', confirmed: true }], reachTagSiteIds: [] },
  ]), []);
});
