import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Eddy speaks as Eddy, not as a company.
 *
 * The iOS app had thirteen user-visible strings written in the first person
 * plural — "We'll watch the Current", "so we know which phone to notify",
 * "We could not work out a float". They read as a company rather than as the
 * guide the rest of the app is written as, and they were spread across enough
 * screens that a partial fix looked like a bug rather than a house style.
 *
 * This is the guard that keeps them from coming back. It is deliberately a
 * source sweep rather than a set of module imports: most of this copy lives
 * inline in screens, not in a `*Copy.ts` module, so importing would check only
 * the small share that has already been extracted.
 *
 * SCOPE — this bans first-person plural in *product* copy only.
 *
 * Legal, billing and subscription copy legitimately speaks as the company that
 * holds the contract, and an absolute ban would force "Eddy" into sentences
 * about who is billing you. No such string exists today, which is why the
 * allowlist below is empty; add a path to it when a genuine legal or billing
 * surface needs the company voice, rather than weakening the pattern.
 */
const COMPANY_VOICE_ALLOWED = new Set<string>([
  // e.g. '../eddy-ios/app/legal/terms.tsx'
]);

/**
 * Case-sensitive on purpose. A case-insensitive `\bus\b` matches the "US" in
 * locale and unit strings such as `en-US`, which are not copy at all.
 */
const FIRST_PERSON_PLURAL = /\b(?:[Ww]e|[Oo]ur|[Oo]urs|[Uu]s|[Oo]urselves)\b/;

/**
 * Blanks out `//` and block comments while leaving string and template
 * contents in place.
 *
 * Written as a state machine rather than a regex because both directions fail:
 * stripping `//` naively eats the rest of any line holding an `https://` URL,
 * and matching string literals directly would flag the prose inside comments —
 * this codebase's module headers quote the very strings they explain, so
 * `PushPrimer.tsx` describes itself as saying "we'll watch the gauge for you".
 */
function stripComments(source: string): string {
  type State = 'code' | 'line' | 'block' | "'" | '"' | '`';
  let state: State = 'code';
  let out = '';

  for (let i = 0; i < source.length; i += 1) {
    const char = source[i];
    const pair = source.slice(i, i + 2);

    if (state === 'code') {
      if (pair === '//') {
        state = 'line';
        i += 1;
        continue;
      }
      if (pair === '/*') {
        state = 'block';
        i += 1;
        continue;
      }
      if (char === "'" || char === '"' || char === '`') state = char;
      out += char;
      continue;
    }

    if (state === 'line') {
      if (char === '\n') {
        state = 'code';
        out += '\n';
      }
      continue;
    }

    if (state === 'block') {
      if (pair === '*/') {
        state = 'code';
        i += 1;
      } else if (char === '\n') {
        // Keep newlines so reported line numbers stay true to the file.
        out += '\n';
      }
      continue;
    }

    // Inside a string: an escape consumes the next character so that \' does
    // not close the literal.
    if (char === '\\') {
      out += source.slice(i, i + 2);
      i += 1;
      continue;
    }
    if (char === state) state = 'code';
    out += char;
  }

  return out;
}

function walk(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return walk(path);
    return /\.tsx?$/.test(entry.name) ? [path] : [];
  });
}

test('user-visible iOS copy does not speak in the first person plural', () => {
  // Manual recursion keeps this on the Node 20 floor used by CI; node:fs
  // globSync was added later. Same reason as safety-copy.test.ts.
  const files = [...walk('../eddy-ios/app'), ...walk('../eddy-ios/src')].filter(
    (file) => !COMPANY_VOICE_ALLOWED.has(file),
  );

  const offenders = files.flatMap((file) =>
    stripComments(readFileSync(file, 'utf8'))
      .split('\n')
      .map((line, index) => ({ line, number: index + 1 }))
      .filter(({ line }) => FIRST_PERSON_PLURAL.test(line))
      .map(({ line, number }) => `${file}:${number} — ${line.trim()}`),
  );

  assert.deepEqual(
    offenders,
    [],
    `Eddy speaks as Eddy. Rewrite these in the third person, or add the file to ` +
      `COMPANY_VOICE_ALLOWED if it is genuinely legal or billing copy:\n${offenders.join('\n')}`,
  );
});
