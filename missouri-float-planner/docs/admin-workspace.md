# Eddy admin workspace

## Access and deployment

The workspace uses a shared session gate above page data hooks. Direct subpage
visits load data only after authentication. A rejected (401) request can be
retried once after the same account signs in; forms remain mounted while the
session is renewed. Switching identity or role resets the workspace and cached
admin data instead of replaying the previous account's pending actions.

Named accounts sign in through Supabase Auth. The server verifies the user and
reads the service-only `admin_memberships` table. Role checks happen on every
request and default to Owner for unlisted endpoints. Roles are never taken from
user-editable profile metadata. Tokens contain an HMAC-protected user ID and
four-hour expiry; revoking membership takes effect on the next request. An
`access-revoked` response clears the workspace, admin cache and browser drafts
and returns to sign-in with an access-removed message. A `role-forbidden` response
refreshes the signed-in role without treating an ordinary denied action as logout.
Changing your own role/access requires an explicit warning and refreshes the
session immediately; the database still protects the final active owner.

Every named-account admin request depends on a membership database read with a
five-second timeout. A missing migration, database outage or timeout fails closed
with 503 across admin endpoints, including sign-out. The sign-out endpoint clears
the browser cookie even on an error; the UI accepts revoked/expired sessions
(403/401) as completed sign-out. A 503 sign-out still displays a retry message;
reload checks the cleared cookie. Keep recovery access available until staging
has verified the migration and named accounts. This dependency is part of deploy
ordering, not just a Team & access requirement.

| Role      | Working areas                                                                                  |
| --------- | ---------------------------------------------------------------------------------------------- |
| Owner     | All areas, access management, bans, operations, configuration, business overview               |
| Editor    | Places, gauges, geography, blog/guides, social content, images/clips; data quality read access |
| Moderator | Feedback/email, reports, float contributions; no account bans                                  |

`ADMIN_API_SECRET` is the signing secret (legacy fallback: `ADMIN_PASSWORD`).
Recovery sign-in uses `ADMIN_PASSWORD` and is explicitly identified as shared
Owner recovery in history. Set `ADMIN_ALLOW_RECOVERY_ACCESS=false` to disable
both new recovery sign-ins and previously issued recovery tokens.

Deployment order:

1. Review and apply `20261111025451_admin_workspace.sql` to the intended database.
   Move its actual production version from pending to applied in the migration
   ledger after applying; regenerate database types and run `make check-db`. The migration is additive, enables
   RLS, and grants its tables/functions only to service_role.
2. Deploy the web change and compilation workflow together. The report search,
   team, incident, and requested-job screens require that migration. Existing
   recovery sign-in remains usable before named accounts are configured.
3. In Team & access, add an existing verified Eddy email as Owner. The tool sends
   no invitations and creates no auth users. Verify named sign-in before
   disabling recovery. The database serializes membership updates and refuses
   removal/demotion of the final active Owner.
4. For external uptime, configure the same dedicated random `ADMIN_MONITOR_SECRET`
   in the web deployment and GitHub Actions secrets. Enable the repository variable
   `ADMIN_UPTIME_ENABLED=true`. The workflow then checks from outside Eddy and
   fails if readiness or pipeline freshness fails. It is a backstop, not an
   uptime monitor: GitHub starts scheduled workflows hours late and skips most
   occurrences of a frequent schedule, so expect a few checks a day. For prompt
   outage detection, point an external uptime service at the same endpoints
   (`docs/pipeline-monitoring.md`). This credential cannot run crons or perform
   admin writes. Review GitHub notification settings separately.

No credentials, memberships, production data, or deployment settings are created
by this code change. A configured endpoint is not proof an external check ran.
The Operations screen intentionally reports verification as unknown and links
actual workflow history. The serving commit comes from the running deployment's
Vercel environment; the latest attempted deployment has a separate history link.

## Working safely

- Blog publication is validated against the resulting row. Published requires
  a valid date no later than now, and a missing date becomes now. Scheduled
  requires a future date. The five-minute publication cron atomically publishes
  due posts and invalidates public caches. Scheduled times use the browser's
  labelled timezone; visibility can lag the chosen minute by up to five minutes.
- One category catalog includes River Guides. Metadata can be edited without
  touching structured guide data. Guide sections continue through the supported
  reviewed content workflow. Editors see instructions for requesting section corrections from an owner; the repository workflow link is owner-only. The generic rich-text body
  is hidden for structured guides because it does not drive their public layout.
- Blog and launch writes carry a version; conflicts retain the local draft.
  Blog preview renders the current unsaved fields through the same article/guide
  component as the public page. It is authenticated, noindex, and performs no write.
  Desktop/mobile preview changes the actual iframe viewport. Dynamic river data
  in a guide preview remains live.
- Blog browser-session drafts can be recovered after reload/Back. They are scoped
  to the signed-in account and removed on explicit sign-out. Other dirty editors
  use before-unload and in-app-link guards. These guards do not intercept every
  browser-history transition; do not describe all forms as autosaved.
- Reports/POIs apply search and filters before pagination. Matching totals are
  server counts. Search replaces the current URL entry; filters and pages add history entries for Back. POI river choices are independent of
  the results page. Bulk report payloads are intersected with visible selected
  records, and the bulk bar shows that same visible count. On narrow screens, opening a report focuses and scrolls to its details. Checkboxes and detail buttons are separate keyboard controls; changing filters, page or view clears selections. Reject/delete
  confirmations disclose permanent photo removal. Verified reports may return
  to review; rejected photos cannot be restored by changing their status.
- The mobile navigation uses a bounded native dialog with Escape/focus handling.
  Navigation and editor surfaces use the existing Eddy teal/sand palette. Pin up
  to four account-specific shortcuts from page headers.

## Jobs, incidents and audit history

Compilations use a client-generated UUID as an idempotency key. A repeated
request for the same job/input returns the existing job and never dispatches
again. Selection is preserved. The worker reports running and terminal outcomes,
with output and workflow links. An ambiguous dispatch or missing completion
update is **Unknown**, not Failed or Completed. Starting a new compilation is an
explicit action; inspect an uncertain previous run first.

Automatic job outcomes open/update one incident per job; only a confirmed
successful run closes it. Skips do not prove recovery. History distinguishes
first seen, last seen, recurrence count and recovery. Stalls/missed schedules
remain visible in the existing overview checks; an incident record cannot be
created by a job that never starts.

Authenticated mutation wrappers record actor, path, HTTP outcome and timestamp.
Supported record routes also take bounded before/after snapshots; domain-level
logs retain their specific change details. Snapshots are observations around a
request, not a database-wide transactional change feed. Upload bodies, login
passwords and provider credentials are excluded. Legacy rows may have no actor.
An audit write/read failure is returned as an explicit UI warning while preserving
the result of the original action. Do not describe this as a complete immutable
compliance ledger.

## Validation

`npm run typecheck`, `npm run lint`, and `npm test` cover the normal web checks.
`npm run test:admin-browser` runs local fixture journeys with Chromium/Playwright
and never sends production writes. Set `CHROMIUM_PATH` if Chromium is elsewhere;
`ADMIN_SMOKE_OUTPUT` controls screenshot/log output. App CI runs both admin
fixture suites on Node 20 and uploads browser screenshots/server logs; it uses
Playwright’s installed Chromium unless `CHROMIUM_PATH` is set. The browser suite covers
signing into a direct subpage, conflicts, discard, session renewal, filtering,
selection, moderation details, mobile navigation and request failure recovery.
Role fixtures also cover editor image deletion, revoked access on live requests
and reload, 403 sign-out, owner self-demotion, role refresh, search history,
keyboard toggling, narrow-screen detail focus and secondary-button hover colors.

`npm run test:admin-db` applies the migration to an ephemeral PGlite PostgreSQL
database with minimal fixtures. It exercises duplicate-member guidance, final-owner protection, stale writes,
public-role denial, incident recovery and search outside the first 50 records.
It does not replace staging checks against the complete Supabase schema.

Named membership changes, production migration execution, real GitHub rendering,
and external monitor credentials require environment-specific rollout checks.
