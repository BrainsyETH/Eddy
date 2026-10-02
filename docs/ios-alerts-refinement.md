# Alerts refinement

Quiet hours and existing-alert editing now use a shared root modal stack. Public
URLs stay `/alerts/quiet-hours` and `/alerts/:id`. Warm launches retain their source
tab/detail history; Close/Cancel on a cold launch falls back to Settings or Alerts.

Quiet hours has a read-only summary row and an explicit, guarded Save. Opening
never enables it. Native time controls use wall-clock minutes in the account's
zone, preserve existing off-grid values, and select new times in 15-minute steps.
Equal bounds are rejected inline. The timezone mismatch and phone-time action,
signed-out state, load retry, save retry, and dismissal protection remain visible.
Only rising-water warning events bypass quiet hours when that exception is on;
custom thresholds do not. Suppressed pushes are not queued or represented by a
notification-history feed. Delivery policy is unchanged.

Editing reuses the creation footer and protects trigger drafts. Status changes
still save immediately and are not draft changes. Parent deletion names and
optimistically removes its gauge children in the same operation. Failed writes
retain the form; already-met thresholds remain visible after saving.

The public Alerts segments retain their header while loading. Each source has
its own last-success timestamp, stale-results warning, and retry. Focus/foreground
refresh only sources older than 15 minutes; pull-to-refresh remains available.
Names/thresholds wrap. Swipe backgrounds stretch to content height with existing
bottom margins, rather than using fixed row heights.

## Device acceptance checks

No iOS simulator is available in the implementation environment. Before release:

- Open both sheets from Alerts and Settings, and edit from a notification's
  detail page. Save/Cancel/swipe returns to the exact source. Test cold links too.
- With Quiet off, open and dismiss without enabling. Turn it on, edit From/Until,
  Cancel/keep/discard, and Save. Equal times block Save without moving either time.
- Verify 12/24-hour display, quarter-hour selection, an existing 10:07 PM setting,
  overnight windows, and account/phone timezone mismatch including the correction.
- Signed out: sign in or Close. Offline initial load: Retry without fake defaults.
  Offline save: preserve edits and allow retry. Rapid Save makes one request;
  pending writes prevent dismissal.
- Edit a trigger, immediately pause, then Cancel edits: pause persists. Check
  threshold-already-met feedback, one-time rearming, and failed status/save writes.
- Delete a parent with gauge children; confirm the named count and no orphan rows.
  Fail the delete and verify the complete group returns.
- Switch public segments while loading. Return after 15 minutes and after an
  overnight background. Check source-specific last-checked/error states and Retry.
- Small phone, largest Dynamic Type, light/dark, VoiceOver: footer remains reachable,
  long river/gauge/threshold labels wrap, and swipe-delete fills the full group.

No dependencies or native configuration were changed. Time picker support must
already exist in the installed binary from the earlier native-control update;
a successful JS export does not prove that binary includes it.
