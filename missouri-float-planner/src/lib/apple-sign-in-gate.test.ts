// src/lib/apple-sign-in-gate.test.ts
// The Apple sign-in button is gated on there BEING accounts, not on the
// anonymous bootstrap having succeeded.
//
// ── The bug this pins ─────────────────────────────────────────────────────
// AppleSignInButton shipped gated on `unavailable` from useSession. That flag
// is raised for three unrelated reasons — Supabase unconfigured, anonymous
// sign-ins switched off in the dashboard (422 anonymous_provider_disabled), and
// the first launch having no signal — and it is never lowered again for the
// life of the session. Apple sign-in works perfectly well in the last two.
//
// So a single offline cold start removed the button from the Alerts tab AND
// emptied AlertSignInSheet, leaving a screen that reads "Sign in to set alerts"
// with nothing on it to press, until the process was killed. The failure is
// invisible in every normal run, which is why it is worth a test rather than a
// comment.
//
// ── Why structural ────────────────────────────────────────────────────────
// This is a React component and the web suite has no renderer — it is the only
// runner the Expo app has, and it runs pure logic. Reading the source is the
// available tool, and the same one ios-routes, app-camera-stop and
// app-worklet-closures already use for constraints that live in a component.
//
// The patterns below match CODE, not prose: the header of the component
// discusses `unavailable` at length on purpose, and an assertion that broke on
// the explanation would be an assertion against writing it down.

import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const APP = join(process.cwd(), '../eddy-ios');
const BUTTON = join(APP, 'src/components/AppleSignInButton.tsx');
const SESSION = join(APP, 'src/hooks/useSession.tsx');

test('the button reads accountsConfigured, not unavailable', () => {
  const source = readFileSync(BUTTON, 'utf8');
  assert.match(
    source,
    /const\s*\{[^}]*\baccountsConfigured\b[^}]*\}\s*=\s*useSession\(\)/,
    'AppleSignInButton must take accountsConfigured off useSession',
  );
  assert.doesNotMatch(
    source,
    /const\s*\{[^}]*\bunavailable\b[^}]*\}\s*=\s*useSession\(\)/,
    'gating on `unavailable` hides the button after one offline launch',
  );
});

test('the early return is the accountsConfigured one', () => {
  const source = readFileSync(BUTTON, 'utf8');
  assert.match(source, /if\s*\(\s*!accountsConfigured\s*\)\s*return null/);
  assert.doesNotMatch(
    source,
    /if\s*\(\s*unavailable\s*\)\s*return/,
    'a transient bootstrap failure must not remove the control',
  );
});

test('accountsConfigured is build configuration, not session state', () => {
  // It has to be constant for the life of the process. Deriving it from any
  // piece of state — including `unavailable` — would reintroduce the bug with a
  // new name, since the whole failure is a flag that goes true and stays true.
  const source = readFileSync(SESSION, 'utf8');
  assert.match(
    source,
    /accountsConfigured:\s*isSupabaseConfigured/,
    'accountsConfigured must come straight from the Supabase build config',
  );
  assert.doesNotMatch(
    source,
    /accountsConfigured:\s*!?\s*unavailable/,
    'deriving it from `unavailable` is the same bug wearing the new name',
  );
});

test('useSession still exposes both, because they answer different questions', () => {
  // `unavailable` is not wrong and is not being removed — it correctly reports
  // that the anonymous bootstrap failed, which is what the local-only paths
  // read it for. The fix is that a sign-in control asks the other question.
  const source = readFileSync(SESSION, 'utf8');
  assert.match(source, /^\s*unavailable: boolean;/m);
  assert.match(source, /^\s*accountsConfigured: boolean;/m);
});
