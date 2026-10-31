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
run are unknown, never inferred stops. Tracked distance sums absolute river-mile
displacement in classified moving intervals, including upstream travel, plus
the river between the two confirmed positions on either side of a GPS gap that
tracking reacquired (`reacquired` in `river-progress.ts`), when crossing it took
no more than the tracker's top river speed. That gap's time stays unknown.
Confirmed stops discard GPS wobble; relocations (a wrong match corrected) and
unresolved final movement add no distance. It remains a GPS-derived estimate.
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

Malformed current or legacy history is copied to a separate local recovery key
before creating an empty archive. The history screen explains that unsynced trips
may be missing; account backup can restore previously uploaded records. Temporary
storage errors remain retryable and do not reset history. Future archive versions
require an app update. Recovery copies never upload, survive another recovery, and
are removed on trip or account deletion because unreadable contents cannot be
safely scoped to a single trip.

Server rows in `float_archive` belong to a permanent authenticated user. The API
verifies the user; RLS limits reads to that permanent owner. Mutations use
service-only functions after strict allowlist validation. No raw positions,
route geometry or pace samples cross this API. Completed summaries are immutable.
Both mutation functions remain `SECURITY INVOKER`. Their permanent-account guard
needs column-level `SELECT (id, is_anonymous)` on `auth.users` for `service_role`.
The account-read grant migration supplies exactly that access, without granting
email/password reads or any new client-role privileges. Database tests start
without this grant, reproduce 42501 for both functions, then apply it before
testing uploads, consent, guest rejection and isolation. The migration ledger
records whether production has received it.
New summaries keep `putInId`/`putInName` for a confirmed launch access or null.
Optional `startNote` (1–240 characters) describes the recorded origin separately;
no raw positions are added. Older completed records are not rewritten. Legacy
active sessions keep their progress checkpoint but do not gain a launch claim
from a planned access alone. History opens a normal tab detail using the same
recap content as the root presentation shown immediately after tracking.
Saved-route metadata can refresh; arrival-order updates apply to that metadata.
Deleting replaces a row with an empty tombstone; an old device cannot resurrect
it. Saving a route again creates a new record. Account deletion cascades both
archive tables and clears local history, active session and pending journal.
Deleting a private saved route does not revoke its public shared link.

Backup POST returns one ordered result per input row. Invalid trips stay local
with a visible refusal and manual retry; other rows and subsequent batches still
upload, and cloud restore continues. Batches are bounded by serialized size as
well as row count (the server refuses bodies over 100,000 characters); a 413
halves the batch down to the oversized row, which is marked too large to back
up rather than resent forever. A server row the client cannot read is skipped
on merge, never written, so one bad row cannot empty the local history into a
recovery copy. The periodic timer and the post-edit debounce upload only; the
full history is read back on foreground, sign-in and manual sync. Acknowledgements persist after each batch,
without clearing edits made during the request. Network, authentication, storage
and server failures remain retryable with 1–15 minute exponential backoff while
the app is open; manual sync can retry immediately. Deploy this response contract
before the new binary. An unrecognized response stays pending rather than falsely
claiming a successful backup. Before sending a `startNote`, the app checks the
authenticated `GET ?capabilities=1` response for support. An older API leaves the
whole upload pending for retry; the note is never stripped to obtain an immutable
backup acknowledgement. Deploy the accepting validator and capability response
together before the binary. The field lives in the existing JSON payload, so it
needs no database migration.

Recaps also carry optional recap context (`docs/float-history-card-plan.md`):
`startCondition` (the planner's condition at Start, with the gauge that set it
and that reading's time; its `usgsSiteId` is null for a gauge that is not a
USGS site, as dam tailwaters' are), `riverSpan` (the route index's calibrated
access-point span, with a `calibration` hash naming the mile system it was
taken in, so floats from before and after a recalibration of access-point
miles are never summed onto one strip), `coveredMiles` (the river intervals
the tracker credited, at most 32, sorted and disjoint) and `startWeather`
(temperature and last-hour rain at the put-in, never coordinates). They share one capability flag,
`recapContext`, under the same rule as `startNote`: an older API leaves the
upload pending and nothing is stripped. Every new recap carries `coveredMiles`,
so deploy the accepting validator and capability response before the app
change reaches devices, whether by binary or OTA update. Like `startNote`, it
needs no database migration.

A server lookup adds the nearest non-suspect observation within 30 minutes of
start from the nearest curated upstream gauge. Missing or failing history stays
null. No daily-mean or current-reading substitution. This is context from one
gauge, not proof of conditions along the entire route. On first upload it also
records that gauge's `usgsSiteId` and, from its own ladder and flood stage, a
`conditionCode`: the fallback for recaps without a `startCondition`. Rows
already stored are not backfilled.
Existing completed IDs are checked within the authenticated owner's archive so
retries skip gauge enrichment; the write function still enforces immutability and
deletion tombstones against concurrent requests.

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


### Route and weather recap presentation (2026-10-31)

The recap centers the individual float's start-to-take-out stretch instead of
whole-river/lifetime exploration. New summaries optionally persist
`routeSnapshot` (start mile, take-out mile, start name, calibration, original
map-anchor IDs/miles and optional download key) and the start
observation's `conditionIcon`. These are bounded summary fields, not coordinate
arrays. The API validates them strictly and advertises `recapRouteWeather`;
clients wait for that capability before uploading either addition. Map anchors
and the download key also require `recapMapCalibration`. At most 128 accepted
calibration anchors are retained, limited to the stretch and its bracketing
neighbors. Anchor entries contain only IDs and miles; coordinates remain rejected.
Older servers
must not receive a stripped summary, since completed rows are immutable.

Progress uses the saved denominator. Only confirmed arrival earns 100%; limited
tracking can preserve arrival while suppressing an unconfirmed percentage. Map
geometry uses the original calibration: saved anchor miles reconstruct it on
the public river line, or an original downloaded package supplies it. A change
to unrelated access points does not invalidate the map. Missing required anchors
or incompatible geometry are explained without inventing coverage. Older
snapshots without anchors still require the full calibration hash. Orange coverage is the existing
credited intervals, including bounded gap estimates; no additional gaps are
filled. Older summaries retain their available measurements without invented
route snapshots or sky conditions. Detailed display/fallback rules and native
verification cases live in the iOS README's River Mode section.
