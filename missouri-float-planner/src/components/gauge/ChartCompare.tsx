'use client';

// Last-year option shared by compact and expanded chart Options.
import Button from '@/components/ui/Button';
import type { LastYearStatus } from '@/hooks/useLastYearComparison';

interface ChartCompareProps {
  on: boolean;
  onChange: (on: boolean) => void;
  status: LastYearStatus;
  onRetry: () => void;
}

export default function ChartCompare({ on, onChange, status, onRetry }: ChartCompareProps) {
  const detail = !on || status === 'ready'
    ? 'Daily average'
    : status === 'failed'
      ? 'Couldn’t load last year'
      : status === 'empty'
        ? 'No data for last year'
        : 'Loading…';
  return (
    <div>
      <button
        type="button"
        role="switch"
        aria-checked={on}
        onClick={() => onChange(!on)}
        className="flex min-h-11 w-full items-center justify-between gap-4 rounded-lg p-2 text-left transition-colors hover:bg-[var(--color-surface-hover)] focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500"
      >
        <span className="min-w-0">
          <span className="block text-sm font-semibold" style={{ color: 'var(--color-text-primary)' }}>
            Last year
          </span>
          <span className="mt-0.5 block text-xs" style={{ color: 'var(--color-text-secondary)' }} aria-live="polite">
            {detail}
          </span>
        </span>
        <span
          aria-hidden="true"
          className={`relative inline-flex h-6 w-11 shrink-0 rounded-full border-2 border-transparent transition-colors duration-normal ease-in-out ${
            on ? 'bg-primary-500' : 'bg-neutral-300'
          }`}
        >
          <span
            className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform duration-normal ease-in-out ${
              on ? 'translate-x-5' : 'translate-x-0'
            }`}
          />
        </span>
      </button>
      {on && status === 'failed' && (
        <div className="px-2 pb-1">
          <Button variant="ghost" size="sm" onClick={onRetry}>
            Retry
          </Button>
        </div>
      )}
    </div>
  );
}
