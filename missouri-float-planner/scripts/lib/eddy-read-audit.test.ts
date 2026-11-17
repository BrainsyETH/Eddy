import assert from 'node:assert/strict';
import test from 'node:test';
import { auditReport, type AuditInput } from './eddy-read-audit';

const base: AuditInput = {
  rivers: [
    { slug: 'black', riverNote: 'Per-section hydro types: upper-lesterville=spring_fed_float.', hasRainLag: false, hasPrimaryGauge: true },
    { slug: 'current', riverNote: 'Spring-fed with a consistent base flow.', hasRainLag: true, hasPrimaryGauge: true },
    { slug: 'white', riverNote: null, hasRainLag: false, hasPrimaryGauge: false },
  ],
  sections: [
    { riverSlug: 'black', sectionSlug: 'upper-lesterville' },
    { riverSlug: 'current', sectionSlug: 'upper-current' },
    { riverSlug: 'current', sectionSlug: 'middle-current' },
  ],
  published: [
    { riverSlug: 'black', sectionSlug: null, modelUsed: 'claude-sonnet-4-6' },
    { riverSlug: 'black', sectionSlug: 'upper-lesterville', modelUsed: 'claude-sonnet-4-6' },
    { riverSlug: 'current', sectionSlug: null, modelUsed: 'claude-sonnet-4-6' },
    { riverSlug: 'current', sectionSlug: 'upper-current', modelUsed: null },
    { riverSlug: 'white', sectionSlug: null, modelUsed: null },
    // The statewide row and a retired river are not targets and must not count.
    { riverSlug: 'global', sectionSlug: null, modelUsed: 'claude-sonnet-4-6' },
    { riverSlug: 'beaver-tailwater', sectionSlug: null, modelUsed: null },
  ],
  knowledgeSections: { black: ['upper-lesterville'], current: ['upper-current', 'lower-current'] },
  knowledgeRivers: ['black', 'current'],
  log: null,
  logDays: 14,
};

test('published Reads are counted per target, against active rivers only', () => {
  const report = auditReport(base);
  assert.match(report, /Whole-river Reads written by the model: 2 of 3 \(67%\)/);
  assert.match(report, /code-written: white/);
  assert.match(report, /Section Reads written by the model:\s+1 of 2 \(50%\)/);
  assert.match(report, /model-written: black\/upper-lesterville/);
});

test('knowledge coverage is reported in both directions, and by what can reach a Read', () => {
  const report = auditReport(base);
  assert.match(report, /Active rivers with no "## " section: white/);
  assert.match(report, /Database sections with no "### " block: 1 of 3 \(33%\)\n\s+current\/middle-current/);
  assert.match(report, /"### " blocks matching no database section: current\/lower-current/);
  // upper-current has a block, but its Read is code-written, so it is not reachable.
  assert.match(report, /can reach a section Read today: 1 of 3 \(33%\)\n\s+black\/upper-lesterville/);
});

test('prompt inputs name the rivers behind each count', () => {
  const report = auditReport(base);
  assert.match(report, /River note is ingest bookkeeping or unrendered: 1 of 3 \(33%\)\n\s+black/);
  assert.match(report, /No river note at all: white/);
  assert.match(report, /No rain-to-river lag \(database or legacy map\): 2 of 3 \(67%\)\n\s+black, white/);
  assert.match(report, /No primary gauge: white/);
});

test('a missing log table is said plainly, and a present one is tallied by cause', () => {
  assert.match(auditReport(base), /eddy_generation_log does not exist in this project/);

  const report = auditReport({
    ...base,
    log: [
      { outcome: 'model', reason: null, modelUsed: 'claude-sonnet-4-6', cacheReadTokens: 1867 },
      { outcome: 'model', reason: null, modelUsed: 'claude-sonnet-4-6', cacheReadTokens: 0 },
      { outcome: 'fallback', reason: 'unsupported_section', modelUsed: null, cacheReadTokens: null },
      { outcome: 'fallback', reason: 'unsupported_section', modelUsed: null, cacheReadTokens: null },
      { outcome: 'fallback', reason: 'no_gauge', modelUsed: null, cacheReadTokens: null },
      { outcome: 'error', reason: 'model_error', modelUsed: 'claude-sonnet-4-6', cacheReadTokens: null },
    ],
  });
  assert.match(report, /GENERATION LOG \(last 14 days, 6 attempts\)/);
  assert.match(report, /fallback: unsupported_section\s+2 of 6 \(33%\)/);
  assert.match(report, /fallback: no_gauge\s+1 of 6 \(17%\)/);
  assert.match(report, /error: model_error\s+1 of 6 \(17%\)/);
  assert.match(report, /Model calls that read the prompt cache: 1 of 3 \(33%\)/);
});
