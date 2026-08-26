// src/components/dam/TailwaterStatusRow.tsx
// One quiet row of dam operations, directly under the live condition card on a
// hydropower tailwater's river page.
//
// ── Why it is subordinate, and stays that way ───────────────────────────────
// The condition pill above is Eddy's verdict about FLOATING, and it remains the
// only coloured judgement on the page. This row is fact: what the powerhouse is
// doing, and what the water below the dam has done in the last few hours. It
// borrows nothing from CONDITION_SYSTEM — no chip, no dot, no ladder ink —
// because a second coloured badge under the first reads as a second rating, and
// a reader would then have to decide which one to believe.
//
// ── Why the whole row is the link ───────────────────────────────────────────
// A "details" link floating inside a bordered box is two targets for one
// destination, and the smaller one is the one on a phone. The row is a single
// anchor whose accessible name is computed from its text — which is why the
// headline always names the dam rather than leaning on a "Tailwater update"
// eyebrow, and why nothing here sets an aria-label: doing so would REPLACE that
// computed name and drop the lines below the headline, which is exactly what
// went wrong on the iOS side.
//
// ── Why a divider and not a card ────────────────────────────────────────────
// It shipped as a rounded bordered box directly beneath GaugeSummary, which is
// itself a rounded bordered box — a second outline stacked on the first, which
// reads as another object competing with the reading rather than as a line
// qualifying it. A hairline rule and no fill is the quiet version.
//
// Server component, fed by the riverDam the page already fetched inside its
// existing Promise.all, so it costs no request and no client-side flash.

import Link from 'next/link';
import { ChevronRight, Waves, Zap } from 'lucide-react';
import type { DamSnapshot } from '@/lib/data/dams';
import { buildTailwaterStatus } from '@shared/tailwater-status';

export default function TailwaterStatusRow({ dam }: { dam: DamSnapshot }) {
  const status = buildTailwaterStatus(dam);
  // Null for a flood-control project with no powerhouse — every sentence this
  // row can produce is about turbines. See buildTailwaterStatus.
  if (!status) return null;

  const Icon = status.tone === 'generating' ? Zap : Waves;

  return (
    <Link
      href={`/dams/${status.damId}`}
      className="group flex w-full items-start gap-3 border-t border-neutral-200 pt-3 no-underline"
    >
      <Icon className="mt-0.5 h-4 w-4 shrink-0 text-primary-700" aria-hidden />

      <div className="min-w-0 flex-1">
        <div className="text-sm font-semibold text-neutral-900 transition-colors group-hover:text-primary-800">
          {status.headline}
        </div>

        {status.supporting.map((line) => (
          <div key={line} className="mt-0.5 text-sm text-neutral-600">
            {line}
          </div>
        ))}
      </div>

      <ChevronRight
        className="mt-0.5 h-4 w-4 shrink-0 text-neutral-400 transition-colors group-hover:text-primary-700"
        aria-hidden
      />
    </Link>
  );
}
