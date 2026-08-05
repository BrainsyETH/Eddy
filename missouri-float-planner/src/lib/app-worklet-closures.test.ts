import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

// A module-scope worklet must be DECLARED BEFORE any worklet that calls it.
//
// ── Why this is a test and not a review note ──────────────────────────────
// Nothing else catches it. It type-checks, it lints, it bundles, and it throws
// "undefined is not a function" on the UI thread at the moment a finger lifts.
//
// react-native-worklets/plugin rewrites a `function` DECLARATION into a `var`
// assigned from an immediately-invoked factory, and the closure is passed into
// that factory as arguments — so it is captured when the line is evaluated, not
// when the worklet runs:
//
//   var settleTarget = function …Factory(_ref) {…}({ …, stepFrom, nearest });
//   var nearest  = function …Factory(_ref2) {…}({…});   // ← later in the file
//   var stepFrom = function …Factory(_ref3) {…}({…});
//
// `var` hoists the binding but not the value. A helper declared further down the
// file is therefore captured as `undefined`, permanently, into
// `settleTarget.__closure` — and the call site fails only once the worklet
// actually reaches that branch. sheetGeometry's `nearest` sat on the path taken
// by every slow release of the sheet, so it fired on the common case.
//
// Ordinary functions do not have this problem, and neither do worklets defined
// inside a component or hook: by the time those are created the module has
// finished evaluating. This is specifically about module scope.
//
// Lives here because the Expo app has no test runner of its own — the same
// arrangement as app-theme.test.ts, which is also a structural invariant read
// out of the app's source as text.
const APP = join(process.cwd(), '../eddy-ios');

/** Every .ts and .tsx under app/ and src/. */
function sourceFiles(): string[] {
  const out: string[] = [];
  const walk = (dir: string) => {
    for (const entry of readdirSync(join(APP, dir), { withFileTypes: true })) {
      const rel = `${dir}/${entry.name}`;
      if (entry.isDirectory()) walk(rel);
      else if (entry.name.endsWith('.ts') || entry.name.endsWith('.tsx')) out.push(rel);
    }
  };
  walk('app');
  walk('src');
  return out;
}

interface Worklet {
  name: string;
  /** 0-based line of the declaration. */
  line: number;
  /** The declaration's own lines, signature included. */
  body: string;
}

/**
 * Module-scope `function` declarations whose first statement is `'worklet'`.
 *
 * Column-zero `function` is what makes it module scope — a nested or assigned
 * function is indented, and a worklet inside a component is captured after the
 * module has evaluated, so neither is at risk. The directive is matched at
 * exactly two spaces of indent for the same reason: it has to be this
 * function's first statement rather than one belonging to a callback inside it.
 */
function moduleWorklets(source: string): Worklet[] {
  const lines = source.split('\n');
  const starts: { name: string; line: number }[] = [];
  for (const [i, line] of lines.entries()) {
    const match = /^(?:export )?function (\w+)\s*[(<]/.exec(line);
    if (match) starts.push({ name: match[1], line: i });
  }
  const out: Worklet[] = [];
  for (const [i, start] of starts.entries()) {
    const end = starts[i + 1]?.line ?? lines.length;
    const body = lines.slice(start.line, end).join('\n');
    if (/\n {2}'worklet';/.test(body)) out.push({ ...start, body });
  }
  return out;
}

test('a module-scope worklet is declared before every worklet that calls it', () => {
  const offenders: string[] = [];
  for (const file of sourceFiles()) {
    const worklets = moduleWorklets(readFileSync(join(APP, file), 'utf8'));
    if (worklets.length < 2) continue;
    for (const caller of worklets) {
      for (const callee of worklets) {
        if (callee.name === caller.name || callee.line < caller.line) continue;
        // The signature is skipped so a recursive-looking match on the
        // declaration itself cannot register as a call.
        const calls = caller.body.slice(caller.body.indexOf('\n'));
        if (new RegExp(`\\b${callee.name}\\s*\\(`).test(calls)) {
          offenders.push(
            `${file}: ${caller.name} (line ${caller.line + 1}) calls ${callee.name}, ` +
              `declared later at line ${callee.line + 1} — move ${callee.name} above it`,
          );
        }
      }
    }
  }
  assert.deepEqual(
    offenders,
    [],
    `worklet closure captures undefined:\n${offenders.join('\n')}\n\n` +
      'The plugin captures a worklet\'s closure when its line is evaluated, so a ' +
      'helper declared further down the file is captured as undefined and the ' +
      'call throws "undefined is not a function" on the UI thread. See the ' +
      'header of this test.',
  );
});
