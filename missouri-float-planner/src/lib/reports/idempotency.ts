/** A failed lookup is unknown delivery, never permission to insert again. */
export class ReportLookupError extends Error {
  constructor(cause: unknown) {
    super('Unable to confirm report delivery', { cause });
    this.name = 'ReportLookupError';
  }
}

export async function findFiledReport(
  clientReportId: string | null | undefined,
  lookup: (id: string) => Promise<{ data: { id: string } | null; error: unknown }>,
): Promise<string | null> {
  // Older clients do not use this column and remain compatible.
  if (!clientReportId) return null;
  try {
    const { data, error } = await lookup(clientReportId);
    if (error) throw error;
    return data?.id ?? null;
  } catch (error) {
    throw new ReportLookupError(error);
  }
}
