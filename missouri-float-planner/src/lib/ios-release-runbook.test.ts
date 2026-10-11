// src/lib/ios-release-runbook.test.ts
// The release runbook's "Current release" must name the version app.json has.
//
// ── Why ───────────────────────────────────────────────────────────────────
// docs/ios-release-runbook.md opens with the release in progress, and agents
// and people read that line as current state. It said 1.2 / `1.2.0` for a
// month after app.json moved to 1.4.0, so the first thing anyone read about
// the release was wrong, and nothing noticed. A version bump is a one-line
// change that never touches the runbook unless something makes it.
//
// This checks only what the repository can know: the app.json version. The
// live App Store version is a fact about App Store Connect, so the runbook
// records it with a date by hand and this test does not look at it.

import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const REPO = join(process.cwd(), '..');

function currentReleaseSection(runbook: string): string {
  const start = runbook.indexOf('\n## Current release');
  assert.ok(start >= 0, 'runbook has no "## Current release" section');
  const next = runbook.indexOf('\n## ', start + 1);
  return runbook.slice(start, next < 0 ? undefined : next);
}

test('the runbook names the app.json version as the release in progress', () => {
  const appJson = JSON.parse(readFileSync(join(REPO, 'eddy-ios/app.json'), 'utf8'));
  const version: string = appJson.expo.version;
  const runbook = readFileSync(join(REPO, 'docs/ios-release-runbook.md'), 'utf8');
  const section = currentReleaseSection(runbook);

  const line = section.split('\n').find((l) => l.includes('**Release in progress:**'));
  assert.ok(line, 'Current release has no "**Release in progress:**" line');

  const claimed = /`eddy-ios\/app\.json` is `([^`]+)`/.exec(section)?.[1];
  assert.equal(
    claimed,
    version,
    `docs/ios-release-runbook.md says app.json is ${claimed ?? '(nothing)'}, ` +
      `but it is ${version}. Update the Current release section with the bump.`,
  );

  const [major, minor] = version.split('.');
  assert.match(
    line,
    new RegExp(`\\*\\*Release in progress:\\*\\* ${major}\\.${minor}\\b`),
    `the release-in-progress line should name ${major}.${minor}`,
  );
});
