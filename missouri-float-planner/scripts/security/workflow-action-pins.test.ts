import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const SHA_40 = /^[a-f0-9]{40}$/;

const appCI = readFileSync(
  path.resolve(process.cwd(), '../.github/workflows/app-ci.yml'),
  'utf8',
);

const auditWorkflow = readFileSync(
  path.resolve(process.cwd(), '../.github/workflows/dependency-audit.yml'),
  'utf8',
);

function workflowJob(workflow: string, label: string, name: string): string {
  const job = workflow.split(`\n  ${name}:\n`)[1]?.split(/\n  [\w-]+:\n/)[0];
  assert.ok(job, `${label} must emit the ${name} check`);
  return job;
}

const appCIJob = (name: string) => workflowJob(appCI, 'App CI', name);
const auditJob = () =>
  workflowJob(auditWorkflow, 'Dependency audit', 'dependency-audit');

function pullRequestFilters(workflow: string): string | undefined {
  const events = workflow.split('\njobs:\n')[0];
  return events.split('\n  pull_request:')[1]?.split(/\n  [\w-]+:/)[0];
}

test('third-party GitHub Actions are pinned to immutable commit SHAs', () => {
  const workflowDirectory = path.resolve(process.cwd(), '../.github/workflows');
  const workflowFiles = readdirSync(workflowDirectory).filter((file) =>
    /\.ya?ml$/.test(file),
  );
  const unpinned: string[] = [];
  let thirdPartyActionCount = 0;

  for (const file of workflowFiles) {
    const contents = readFileSync(path.join(workflowDirectory, file), 'utf8');

    contents.split('\n').forEach((line, index) => {
      const match = line.match(/^\s*uses:\s*([^\s#]+)(?:\s+#.*)?$/);
      if (!match) return;

      const reference = match[1];
      if (reference.startsWith('./')) return;

      thirdPartyActionCount += 1;
      const separator = reference.lastIndexOf('@');
      const revision = separator >= 0 ? reference.slice(separator + 1) : '';

      if (!SHA_40.test(revision)) {
        unpinned.push(`${file}:${index + 1} (${reference})`);
      }
    });
  }

  assert.ok(thirdPartyActionCount > 0, 'expected at least one third-party action');
  assert.deepEqual(
    unpinned,
    [],
    `unpinned third-party actions:\n${unpinned.join('\n')}`,
  );
});

test('App CI checks run on every pull request, independently', () => {
  for (const workflow of [appCI, auditWorkflow]) {
    assert.equal(
      pullRequestFilters(workflow)?.trim(),
      '',
      'PR filters can leave required checks permanently pending',
    );
  }

  const jobs: Array<[string, string]> = [
    ['lint-and-typecheck', appCIJob('lint-and-typecheck')],
    ['mobile-app', appCIJob('mobile-app')],
    ['dependency-audit', auditJob()],
  ];
  for (const [name, job] of jobs) {
    assert.doesNotMatch(job, /^    (?:needs|if):/m, `${name} must run even when another check fails`);
    assert.doesNotMatch(job, /^\s*continue-on-error:/m, `${name} must report failures`);
  }
});

test('the audit has its own workflow, so an advisory cannot turn App CI red', () => {
  assert.doesNotMatch(appCI, /npm audit/);
  assert.doesNotMatch(appCI, /\n  dependency-audit:\n/);
});

test('runtime audit reports failures without suppressing web tests or the iOS bundle', () => {
  const audit = auditJob();
  assert.match(audit, /^        run: npm audit --omit=dev --audit-level=high$/m);
  const sbomUpload = audit.indexOf('- name: Upload SBOM');
  const auditRun = audit.indexOf('- name: Reject high-severity runtime advisories');
  assert.ok(sbomUpload >= 0 && sbomUpload < auditRun, 'upload the SBOM before advisories can fail the job');

  const web = appCIJob('lint-and-typecheck');
  for (const command of ['npm run typecheck', 'npm run lint', 'npm test']) {
    assert.ok(web.includes(`run: ${command}`), `web check must run ${command}`);
  }
  assert.doesNotMatch(web, /run: npm audit/);
  assert.match(appCIJob('mobile-app'), /run: npx expo export --platform ios/);
});
