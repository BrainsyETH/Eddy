# 0012 — One private trip archive for history, backup and optional contribution

Status: active design. Device verification and release status unconfirmed; gates
are in `docs/ios-release-runbook.md`.

Users can see a recap, keep it, recover it with Apple sign-in, and optionally let
Eddy study it. The contribution uses the same account-owned summary. There is no
anonymous upload endpoint or separate tracking identity.

## Measurements

`packages/eddy-geo/float-totals.ts` accumulates constant-size totals using the
same anchored stay-point rule as moving pace. Totals are persisted with the
active session independently of the 2,500-sample pace buffer. Discontinuous
intervals, acquisition time, the final unobserved tail and an unresolved brief
run are unknown, never inferred stops. Tracked distance sums continuous river
mile displacement; gaps do not invent distance. It remains a GPS-derived estimate.
Moving speed uses signed progress over classified moving time. Existing sessions
without totals retain their history but pre-upgrade time is unobserved.

Published trip times retain their total duration, including stops. The additive
`movingSpeedMph` field carries the condition model's separate moving estimate.
New iOS clients never fall back to the old ambiguous `speedMph` field. Withheld,
unknown or typical-water starts learn pace rather than implying a current model.

Ending stops tracking immediately. A local end journal precedes archive creation
and active-session removal. Replaying it keeps the original completion time and
trip id. If the disk rejects every write, durability cannot be promised: the
screen reports the failure and the process retries while open. Do not describe
that physical-storage failure as guaranteed recovery after a process kill.

## Storage and recovery

The local archive is one serialized AsyncStorage document with account scopes.
Guest data is adopted once at sign-in; aliases keep a late end journal associated
with the right account even after a later sign-out. Private saved-route metadata
migrates from `eddy.savedFloats.v1`; offline logistics stay local and are refetched
when a recovered route is opened. There is no silent 50-trip truncation.

Server rows in `float_archive` belong to a permanent authenticated user. The API
verifies the user; RLS limits reads to that permanent owner. Mutations use
service-only functions after strict allowlist validation. No raw positions,
route geometry or pace samples cross this API. Completed summaries are immutable.
Saved-route metadata can refresh; arrival-order updates apply to that metadata.
Deleting replaces a row with an empty tombstone; an old device cannot resurrect
it. Saving a route again creates a new record. Account deletion cascades both
archive tables and clears local history, active session and pending journal.
Deleting a private saved route does not revoke its public shared link.

A server lookup adds the nearest non-suspect observation within 30 minutes of
start from the nearest curated upstream gauge. Missing or failing history stays
null. No daily-mean or current-reading substitution. This is context from one
gauge, not proof of conditions along the entire route.

## Consent and review

Sharing defaults off. A recap captures the confirmed consent version when the
float ends; enabling later does not enroll older trips. The server accepts a
contribution only under the currently enabled version. Withdrawal rotates the
version and excludes all existing contributions atomically with respect to
uploads. Re-enabling does not revive old contributions. An offline withdrawal
turns off local participation immediately and remains queued until the server
confirms it; the UI reports that confirmation is pending.

`/admin/float-contributions` is a private review list without emails or account
identifiers in the response. Data is still account linked. It flags measurement
gaps, short observations, missing boats/water and unconfirmed arrival. There is
no automatic calibration, minimum-count claim, party deduplication or outfitter
reporting in this release. Actual field measurement validation comes first.

Deployment order: reviewed migration → web API and policy → new native binary,
with privacy answers updated before submission. New API fields are additive and
existing binaries retain their contract. The migration stays pending until an
authorized production apply is recorded; no production apply is implied by a PR.
