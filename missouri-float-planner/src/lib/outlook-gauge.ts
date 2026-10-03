/** Invalid IDs and missing links use the primary; infrastructure failures propagate. */
export async function resolveOutlookGauge<T>(
  requestedId: string | null,
  findRequested: (id: string) => Promise<T | null>,
  findPrimary: () => Promise<T | null>,
): Promise<T | null> {
  const validId = requestedId && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(requestedId);
  const requested = validId ? await findRequested(requestedId) : null;
  return requested ?? await findPrimary();
}
