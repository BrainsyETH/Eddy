// Keeps the feedback contract identical across the web app, iOS app, and DB.
//
// This drift previously made the clients submit `gauge_recalibration` while
// production's CHECK constraint rejected it. The route reported a generic 500
// and the feedback table stayed empty, so this is a release invariant rather
// than a type-system nicety.

import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { FEEDBACK_TYPES as WEB_FEEDBACK_TYPES } from '@/types/api';
import { FEEDBACK_TYPES as APP_FEEDBACK_TYPES } from '../../../packages/eddy-types/index';

const API_ROUTE = join(process.cwd(), 'src/app/api/feedback/route.ts');
const API_ONLY_MIGRATION = join(
  process.cwd(),
  'supabase/migrations/20260731010000_feedback_api_only.sql',
);
const APP_FEEDBACK_SHEET = join(process.cwd(), '../eddy-ios/src/components/FeedbackSheet.tsx');
const APP_CLIENT = join(process.cwd(), '../eddy-ios/src/api/client.ts');
const APP_TYPES = join(process.cwd(), '../packages/eddy-types/index.ts');

function latestConstraintValues(): string[] {
  const migrationDir = join(process.cwd(), 'supabase/migrations');
  const constraints = readdirSync(migrationDir)
    .filter((file) => file.endsWith('.sql'))
    .sort()
    .flatMap((file) => {
      const sql = readFileSync(join(migrationDir, file), 'utf8');
      return [...sql.matchAll(
        /add\s+constraint\s+feedback_feedback_type_check\s+check\s*\(\s*feedback_type\s+in\s*\(([\s\S]*?)\)\s*\)/gi,
      )].map((match) => [...match[1].matchAll(/'([^']+)'/g)].map((value) => value[1]));
    });

  assert.ok(constraints.length > 0, 'expected a feedback_feedback_type_check migration');
  return constraints[constraints.length - 1];
}

test('web and iOS expose the same feedback types', () => {
  assert.deepEqual(APP_FEEDBACK_TYPES, WEB_FEEDBACK_TYPES);
});

test('the latest database CHECK accepts exactly the client feedback types', () => {
  assert.deepEqual(latestConstraintValues(), [...WEB_FEEDBACK_TYPES]);
});

test('feedback writes are API-only', () => {
  const route = readFileSync(API_ROUTE, 'utf8');
  const migration = readFileSync(API_ONLY_MIGRATION, 'utf8');

  assert.match(route, /const supabase = createAdminClient\(\)/);
  assert.doesNotMatch(route, /supabase\/server/);
  assert.match(migration, /drop policy if exists feedback_insert_policy/i);
  assert.match(migration, /drop policy if exists "Anyone can submit feedback"/i);
  assert.doesNotMatch(
    migration,
    /create\s+policy[\s\S]*?on\s+public\.feedback\s+for\s+insert/i,
    'the API-only migration must not recreate a client INSERT policy',
  );
});

test('feedback-specific app copy does not advertise anonymity', () => {
  const sheet = readFileSync(APP_FEEDBACK_SHEET, 'utf8');
  const client = readFileSync(APP_CLIENT, 'utf8');
  const clientFeedbackBlock = client.slice(
    client.indexOf('Send a feedback / report-issue submission.'),
    client.indexOf('// ── Community photos'),
  );
  const appTypes = readFileSync(APP_TYPES, 'utf8');
  const appTypesFeedbackBlock = appTypes.slice(
    appTypes.indexOf('// ── Feedback (POST /api/feedback)'),
    appTypes.indexOf('// ── River alerts'),
  );

  for (const source of [sheet, clientFeedbackBlock, appTypesFeedbackBlock]) {
    assert.doesNotMatch(source, /anonymous|anonymity|accountless|no account|unauthenticated/i);
  }
});
