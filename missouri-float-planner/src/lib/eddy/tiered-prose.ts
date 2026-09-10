/** The generated prose fields shared by the singular Eddy report routes. */
export interface GeneratedEddyProse {
  quoteText: string | null;
  summaryText: string | null;
  eddyRead: string | null;
}

export interface TieredEddyProse extends GeneratedEddyProse {
  available: boolean;
}

/**
 * Apply the public/Premium contract after live-condition safety has run.
 *
 * A public response exists only when it has a summary to show. An entitled
 * response may use either surviving generated field, but raw `eddyRead` can
 * never resurrect prose after both safety-checked fields were withheld.
 */
export function tierGeneratedEddyProse(
  entitled: boolean,
  prose: GeneratedEddyProse,
): TieredEddyProse {
  const summaryText = prose.summaryText?.trim() || null;
  const quoteText = prose.quoteText?.trim() || null;
  const safetyKeptProse = Boolean(summaryText || quoteText);
  const available = entitled ? safetyKeptProse : Boolean(summaryText);

  if (!available) {
    return { available: false, quoteText: null, summaryText: null, eddyRead: null };
  }

  return {
    available: true,
    quoteText: entitled ? quoteText : null,
    summaryText,
    eddyRead: entitled && safetyKeptProse ? prose.eddyRead?.trim() || null : null,
  };
}

/** Withhold a single Premium text field from a public representation. */
export function premiumText(entitled: boolean, value: string | null): string | null {
  return entitled ? value : null;
}
