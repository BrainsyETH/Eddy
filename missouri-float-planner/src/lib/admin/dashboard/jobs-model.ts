export function jobOutcome(
  body: unknown,
  status: number,
): {
  status: 'ok' | 'partial' | 'error' | 'skipped';
  counters: Record<string, number>;
} {
  const counters: Record<string, number> = {};
  let partial = false,
    skipped = false;
  function inspect(value: unknown, prefix = '', depth = 0) {
    if (!value || typeof value !== 'object' || depth > 2) return;
    for (const [key, v] of Object.entries(value)) {
      if (!/^[a-zA-Z_]{1,40}$/.test(key)) continue;
      if (key === 'skipped' && v === true) skipped = true;
      if (
        (key === 'ok' && v === false) ||
        (key === 'error' && !!v) ||
        (/error|failed|givenUp/i.test(key) &&
          ((typeof v === 'number' && v > 0) ||
            (Array.isArray(v) && v.length > 0)))
      )
        partial = true;
      if (
        typeof v === 'number' &&
        Number.isFinite(v) &&
        Object.keys(counters).length < 30
      )
        counters[prefix + key] = v;
      else if (v && typeof v === 'object' && !Array.isArray(v))
        inspect(v, prefix + key + '.', depth + 1);
    }
  }
  inspect(body);
  // An explicit application outcome supersedes legacy response-key heuristics.
  // HTTP failures always win, including skipped work caused by unavailable locks.
  const explicit =
    body && typeof body === 'object' && 'monitoring_status' in body
      ? (body as { monitoring_status: unknown }).monitoring_status
      : undefined;
  const valid =
    explicit === 'ok' ||
    explicit === 'partial' ||
    explicit === 'error' ||
    explicit === 'skipped';
  return {
    status:
      status >= 400
        ? 'error'
        : valid
          ? explicit
          : partial
            ? 'partial'
            : skipped
              ? 'skipped'
              : 'ok',
    counters,
  };
}

/** Only known schedule variants enter the durable key; never raw request URLs. */
export function jobIdentity(job: string, url: URL): string {
  const source = url.searchParams.get('source');
  const parts = [job];
  if (source)
    parts.push(
      ['recreation_gov', 'mo_state_parks'].includes(source) ? source : 'other',
    );
  if (url.searchParams.get('slot') === '2') parts.push('slot2');
  if (url.searchParams.get('highFrequency') === '1')
    parts.push('high-frequency');
  if (url.searchParams.get('globalOnly') === '1') parts.push('global-only');
  return parts.join(':');
}
