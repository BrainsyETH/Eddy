import assert from 'node:assert/strict';
import test from 'node:test';
import { deriveKnowledgeFindings } from './eddy-knowledge';

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
