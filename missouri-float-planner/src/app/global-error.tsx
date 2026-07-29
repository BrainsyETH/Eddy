'use client';

// src/app/global-error.tsx
// The boundary above the root layout.
//
// ── Why error.tsx was not enough ───────────────────────────────────────────
//
// src/app/error.tsx catches throws inside a route segment, and it renders
// INSIDE the root layout — which means it cannot catch a throw in the root
// layout itself, and it never runs when one happens. The visitor gets Next's
// unstyled default error page and Sentry gets nothing, because nothing on that
// path reports.
//
// global-error.tsx replaces the whole document, <html> and <body> included,
// which is why it declares them. That is also why it cannot use anything from
// the root layout: no fonts, no providers, no shared chrome. Inline styles are
// deliberate — a stylesheet the layout failed to load is one of the ways to
// arrive here, so a Tailwind class is not a safe assumption. Same instinct as
// the iOS root ErrorBoundary reading the palette directly.
//
// It runs in production only; in dev Next shows its own overlay instead.

import * as Sentry from '@sentry/nextjs';
import { useEffect } from 'react';

export default function GlobalError({
  error,
}: {
  error: Error & { digest?: string };
}) {
  useEffect(() => {
    // No redaction here: beforeSend in src/instrumentation-client.ts runs over
    // everything this sends. One implementation of the table, on the way out.
    Sentry.captureException(error);
  }, [error]);

  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '2rem',
          backgroundColor: '#0f172a',
          color: '#f8fafc',
          fontFamily:
            'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
        }}
      >
        <div style={{ maxWidth: '28rem', textAlign: 'center' }} role="alert">
          <h1 style={{ fontSize: '1.5rem', fontWeight: 700, margin: '0 0 0.75rem' }}>
            Something went wrong
          </h1>
          {/* No error message, unlike error.tsx. A root-layout throw is not a
              handled condition, so its text can carry anything it was near —
              and Sentry already has the detail, redacted. */}
          <p style={{ margin: '0 0 1.5rem', lineHeight: 1.6, color: '#cbd5e1' }}>
            Eddy couldn&apos;t load this page. Reloading usually fixes it — river
            conditions are unaffected.
          </p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            style={{
              padding: '0.625rem 1.25rem',
              borderRadius: '0.5rem',
              border: 'none',
              cursor: 'pointer',
              fontSize: '1rem',
              fontWeight: 600,
              // Sunset coral with white text — the CTA pairing the rest of the
              // app uses. Literal because Tailwind may not have loaded.
              backgroundColor: '#F07052',
              color: '#FFFFFF',
            }}
          >
            Reload
          </button>
          {/* The one thing worth showing: it is what ties a support message to
              the event in Sentry. */}
          {error.digest && (
            <p style={{ fontSize: '0.75rem', color: '#94a3b8', marginTop: '1.5rem' }}>
              Error ID: {error.digest}
            </p>
          )}
        </div>
      </body>
    </html>
  );
}
