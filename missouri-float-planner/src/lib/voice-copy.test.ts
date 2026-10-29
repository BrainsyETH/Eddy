import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { stripComments, walk } from './source-copy-sweep';

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
