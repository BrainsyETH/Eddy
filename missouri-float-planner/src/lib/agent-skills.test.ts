// src/lib/agent-skills.test.ts
// The repository's agent skills exist once, are exposed to every tool, and
// name only paths that exist.
//
// ── Why ───────────────────────────────────────────────────────────────────
// Skills live in .agents/skills/<name>/SKILL.md (where Codex reads them) and
// are exposed to Claude Code as symlinks in .claude/skills/. A copy instead of
// a link would drift; a skill added to one side only would silently be
// missing for the other tool. And a skill is a set of instructions pointing at
// runbooks, scripts and ADRs: when one of those moves, the skill keeps sending
// agents to a file that is not there. Each of those is mechanical to check.

import assert from 'node:assert/strict';
import test from 'node:test';
import { existsSync, lstatSync, readFileSync, readdirSync, readlinkSync } from 'node:fs';
import { join } from 'node:path';

const REPO = join(process.cwd(), '..');
const CANONICAL = join(REPO, '.agents/skills');
const CLAUDE = join(REPO, '.claude/skills');

function dirs(path: string): string[] {
  if (!existsSync(path)) return [];
  return readdirSync(path).filter((name) => !name.startsWith('.'));
}

const skills = dirs(CANONICAL);

test('there is at least one skill to check', () => {
  assert.ok(skills.length > 0, '.agents/skills is empty or missing');
});

test('each skill has frontmatter naming its own directory, with a description', () => {
  for (const name of skills) {
    const text = readFileSync(join(CANONICAL, name, 'SKILL.md'), 'utf8');
    const front = /^---\n([\s\S]*?)\n---\n/.exec(text)?.[1];
    assert.ok(front, `${name}/SKILL.md has no frontmatter`);
    assert.match(front, new RegExp(`^name: ${name}$`, 'm'), `${name}: frontmatter name must be "${name}"`);
    assert.match(front, /^description: .{40,}$/m, `${name}: needs a real description`);
  }
});

test('every skill is exposed to Claude Code as a symlink, and nothing else is', () => {
  const linked = dirs(CLAUDE);
  assert.deepEqual([...linked].sort(), [...skills].sort(), '.claude/skills and .agents/skills list different skills');
  for (const name of linked) {
    const path = join(CLAUDE, name);
    assert.ok(lstatSync(path).isSymbolicLink(), `.claude/skills/${name} must be a symlink, not a copy`);
    assert.equal(readlinkSync(path), `../../.agents/skills/${name}`);
  }
});

test('repository paths a skill names exist', () => {
  const ROOTS = /^(docs|eddy-ios|missouri-float-planner|packages|scripts|\.github)\//;
  for (const name of skills) {
    const text = readFileSync(join(CANONICAL, name, 'SKILL.md'), 'utf8');
    for (const [, token] of text.matchAll(/`([^`\s]+)`/g)) {
      // Placeholders (<x.y>) and globs (**) are patterns, not paths.
      if (!ROOTS.test(token) || /[<>*]/.test(token)) continue;
      assert.ok(existsSync(join(REPO, token)), `${name}/SKILL.md names ${token}, which does not exist`);
    }
  }
});

test('the documented iOS development loop launches the installed dev client', () => {
  const makefile = readFileSync(join(REPO, 'Makefile'), 'utf8');
  assert.match(makefile, /^dev: guard-node[^\n]*\n\tcd \$\(MOBILE\) && npx expo start --dev-client$/m);

  const readme = readFileSync(join(REPO, 'eddy-ios/README.md'), 'utf8');
  const introStart = readme.indexOf('## Running it');
  const introEnd = readme.indexOf('### `react-native-svg', introStart);
  assert.ok(introStart >= 0 && introEnd > introStart, 'README quick start must be present');
  const quickstart = readme.slice(introStart, introEnd);
  assert.match(quickstart, /make run-ios/);
  assert.match(quickstart, /make dev/);
  assert.match(quickstart, /--dev-client/);
  assert.doesNotMatch(quickstart, /open in \*\*Expo Go\*\*/);
});
