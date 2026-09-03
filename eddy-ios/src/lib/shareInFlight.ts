// eddy-ios/src/lib/shareInFlight.ts
// One request per key while it is in flight; every concurrent asker gets it.
//
// Two places in the app collapse concurrent identical requests — the dam
// detail (useDams.ts, getSharedDam) and the river outlook (app/river/[slug].tsx)
// — and both had the same three rules written out by hand:
//
//   1. An asker that finds a request in flight for its key JOINS it, whatever
//      caused the ask: a re-render, a fast switch back, StrictMode's double
//      invocation in dev.
//   2. The entry is cleared BEFORE any downstream handler runs, so a caller
//      that reacts to a rejection by retrying starts a NEW request rather
//      than being handed the failed one again.
//   3. Nothing here takes a caller's abort signal. The answer belongs to
//      everyone who joined, so one screen unmounting must not kill the request
//      another is awaiting; each caller checks its own liveness before
//      applying a late answer.
//
// Written out twice, the rules drifted: the outlook's key omitted the river,
// so every river's primary-gauge request shared one entry. One helper, one
// set of executing tests (missouri-float-planner/src/lib/share-in-flight.test.ts,
// which is where the app's pure logic is covered), and the call sites keep
// only what is theirs — the key and the request.
//
// Pure: no imports, no state of its own. The caller owns the map, because the
// map's lifetime is the caller's decision (module-lifetime for the dams, a ref
// for the outlook effect).

export function shareInFlight<T>(
  inFlight: Map<string, Promise<T>>,
  key: string,
  start: () => Promise<T>,
): Promise<T> {
  const existing = inFlight.get(key);
  if (existing) return existing;

  const request = start().finally(() => {
    // Only this request's own entry. A slower retry that replaced the key
    // while this one was settling must not be evicted by it.
    if (inFlight.get(key) === request) inFlight.delete(key);
  });
  inFlight.set(key, request);
  return request;
}
