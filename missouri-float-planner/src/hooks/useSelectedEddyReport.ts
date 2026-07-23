'use client';

import { useQuery } from '@tanstack/react-query';
import type { EddyUpdateResponse } from '@/app/api/eddy-update/[riverSlug]/route';
import type { GaugeUpdateResponse } from '@/app/api/gauge-update/[siteId]/route';
import type { EddyTakeSections } from '@/lib/eddy/take-sections';

export interface SelectedEddyReport {
  quoteText: string;
  summaryText: string | null;
  takeSections: EddyTakeSections | null;
  generatedAt: string;
}

interface UseSelectedEddyReportOptions {
  riverSlug: string;
  siteId: string | null;
  isPrimary: boolean;
  enabled: boolean;
}

/** Lazy, session-lived cache for the generated narrative behind Full report. */
export function useSelectedEddyReport({
  riverSlug,
  siteId,
  isPrimary,
  enabled,
}: UseSelectedEddyReportOptions) {
  const kind = isPrimary ? 'river' : 'gauge';
  const id = isPrimary ? riverSlug : siteId;

  return useQuery<SelectedEddyReport | null, Error>({
    queryKey: ['selected-eddy-report', kind, id],
    queryFn: async () => {
      if (!id) return null;
      if (isPrimary) {
        const response = await fetch(`/api/eddy-update/${encodeURIComponent(id)}`);
        if (!response.ok) throw new Error('Failed to load river report');
        const data: EddyUpdateResponse = await response.json();
        if (!data.available || !data.update) return null;
        return {
          quoteText: data.update.quoteText,
          summaryText: data.update.summaryText,
          takeSections: data.update.takeSections,
          generatedAt: data.update.generatedAt,
        };
      }

      const response = await fetch(`/api/gauge-update/${encodeURIComponent(id)}`);
      if (!response.ok) throw new Error('Failed to load gauge report');
      const data: GaugeUpdateResponse = await response.json();
      if (!data.available || !data.update) return null;
      return {
        quoteText: data.update.quoteText,
        summaryText: data.update.summaryText,
        takeSections: data.update.takeSections,
        generatedAt: data.update.generatedAt,
      };
    },
    enabled: enabled && Boolean(id),
    // A real report is stable for the session. An unavailable response is not
    // a report, so let an open panel retry after background regeneration.
    staleTime: (query) => query.state.data ? Infinity : 60 * 1000,
    gcTime: Infinity,
    refetchInterval: (query) => enabled && query.state.data == null ? 60 * 1000 : false,
    retry: 1,
    throwOnError: false,
  });
}
