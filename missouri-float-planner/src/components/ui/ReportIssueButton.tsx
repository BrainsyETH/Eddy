'use client';

// src/components/ui/ReportIssueButton.tsx
// The "something here is wrong" affordance, and the modal behind it.
//
// FeedbackModal has existed since early on and was mounted in exactly one place:
// the plan builder. So the pages carrying the claims people actually dispute —
// a river's condition, a gauge's reading, an access point's parking — had no way
// to dispute them. The report went to whichever surface happened to own the
// modal rather than to whichever surface was wrong.
//
// This is a button plus its own `isOpen`, so a server-rendered page can mount it
// without becoming a client component. The access-point and river pages both
// render on the server on purpose (crawlable, no fetch waterfall) and neither
// should give that up to hold one boolean.
//
// The context object is the whole point of putting it per-page: `type` + `id` +
// `name` land in the feedback row, so /admin/feedback shows WHICH gauge someone
// says is wrong rather than a paragraph that has to be read to find out.

import { useState } from 'react';
import { Flag } from 'lucide-react';
import FeedbackModal from '@/components/ui/FeedbackModal';
import type { FeedbackContext, FeedbackType } from '@/types/api';

export default function ReportIssueButton({
  context,
  defaultType,
  label = 'Report an issue',
  className,
}: {
  context: FeedbackContext;
  /** Pre-selects the type when the surface already knows it. */
  defaultType?: FeedbackType;
  label?: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={
          className ??
          'inline-flex items-center gap-1.5 text-xs font-medium text-neutral-500 hover:text-neutral-800 transition-colors'
        }
      >
        <Flag size={13} aria-hidden="true" />
        {label}
      </button>
      <FeedbackModal
        isOpen={open}
        onClose={() => setOpen(false)}
        context={context}
        defaultType={defaultType}
      />
    </>
  );
}
