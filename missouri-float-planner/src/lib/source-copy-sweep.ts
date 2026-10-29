// Helpers for tests that sweep app source for user-visible copy
// (voice-copy.test.ts, flow-naming.test.ts). Kept out of any one test file so
// a second sweep does not re-run the first one's tests by importing it.

import { readdirSync } from 'node:fs';
import { join } from 'node:path';

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
export function stripComments(source: string): string {
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

export function walk(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return walk(path);
    return /\.tsx?$/.test(entry.name) ? [path] : [];
  });
}
