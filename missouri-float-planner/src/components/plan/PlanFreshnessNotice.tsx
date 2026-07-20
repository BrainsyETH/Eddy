'use client';

import { AlertTriangle, RefreshCw } from 'lucide-react';

export default function PlanFreshnessNotice({
  savedAt,
  isChecking,
  onRetry,
}: {
  savedAt: number;
  isChecking: boolean;
  onRetry?: () => void;
}) {
  const savedLabel = new Date(savedAt).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });

  return (
    <div
      role={isChecking ? 'status' : 'alert'}
      aria-live="polite"
      className="flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-950"
    >
      {isChecking ? (
        <RefreshCw className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 animate-spin" aria-hidden="true" />
      ) : (
        <AlertTriangle className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" aria-hidden="true" />
      )}
      <div className="min-w-0 flex-1">
        <p className="font-bold">
          {isChecking ? 'Checking live conditions…' : 'Live refresh failed — saved plan only'}
        </p>
        <p className="mt-0.5">
          Saved {savedLabel}. Conditions, hazards, access, and shuttle details may have changed.
        </p>
        {!isChecking && onRetry && (
          <button
            type="button"
            onClick={onRetry}
            className="mt-1.5 font-bold underline underline-offset-2 hover:text-amber-700"
          >
            Try live refresh again
          </button>
        )}
      </div>
    </div>
  );
}
