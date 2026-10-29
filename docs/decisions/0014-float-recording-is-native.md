# 0014 — Float recording is native: Core Location sessions, an on-phone journal, iOS 18

Status: active. Implemented; device verification and release status
unconfirmed. Gates are in `docs/ios-release-runbook.md` (River Mode release
gates).

## Decision

A float's GPS track is recorded by native code, not by JavaScript:

- **Sessions.** At Start, with Eddy in the foreground, the recorder
  (`eddy-ios/modules/eddy-float-recorder/ios/FloatRecorder.swift`) creates a
  `CLServiceSession` (When In Use, full-accuracy purpose key `FloatTracking`)
  and a `CLBackgroundActivitySession`, and iterates
  `CLLocationUpdate.liveUpdates(.otherNavigation)`. The background activity
  session keeps Eddy in use with the phone locked and shows the blue location
  indicator, so Eddy asks for When In Use only and never for Always.
- **Relaunch.** The active float's id is kept in `UserDefaults`. When iOS
  relaunches Eddy mid-float, an app-delegate subscriber recreates both
  sessions and the updates in `didFinishLaunching`, before any JavaScript,
  as Core Location requires; queued fixes are then delivered.
- **Journal.** Every fix is appended, as it arrives, to a per-float
  newline-delimited JSON file (`FloatJournal.swift`) before JavaScript hears
  of it. Files are readable after first unlock (so recording works locked) and
  excluded from backups. A line torn by termination is skipped on read, and a
  failed append closes the handle so the next append ends the torn line
  first. The file is forced to flash (`F_FULLFSYNC`) every 30 fixes or 60 s,
  at stop and on entering the background: a process iOS relaunched in the
  background never sees "did enter background", and a phone that dies in a
  dry bag hours later must not lose everything since the relaunch. A journal
  write failure is held in the recorder's status until a later write
  succeeds, so River Mode keeps saying so rather than reading "recording".
- **Start is foreground-only, natively.** A start requested while Eddy is
  in the background is refused and reported as not in the foreground (a
  background activity session created there stays insufficiently in use);
  JS retries from the next foreground. A different float replaces the
  previous one with a clean last-fix time and flags.
- **The session is a checkpoint.** The JS session (`floatSession.ts`) saves
  `journalTo`, the byte offset it has applied, in the same write as the
  progress derived from those fixes. `src/float/recorder.ts` applies live
  batches only when they start exactly at that offset and otherwise reads the
  journal from it, so after any interruption the float ends where an
  uninterrupted one would (`float-recording.test.ts`). `restoreSession` keeps
  the tracker's state for the same reason; a real GPS gap is a gap in fix
  times, which `trackFix` already handles.
- **Ending drains the journal first.** Finish stops recording, waits for the
  stop, then applies the journal through its final offset on the same queue
  as live batches, and only then takes the recap (`floatRecorderSync.ts:
  finish`). A float finished while its journal was still being replayed is
  not saved short. If the journal cannot be read to its end, nothing is
  saved: the float stays active, recording restarts, and River Mode offers
  Try again or Stop tracking. Stopping the GPS and saving the recap are
  separate: Stop tracking records `trackingStoppedAt`, stops the recorder
  (and keeps it stopped across relaunches), keeps the journal, and the
  recap is saved, ended at the stop, once the journal reads.
- **Recovery judges endings on the whole journal.** Replay applies pages
  without judging an automatic end, then judges once after the last page
  (`floatRecorderSync.ts: readThrough`), so an early page cannot end a
  float that later pages show still going.
- **Precise location is asked for in Eddy.** With Precise Location off,
  Start shows Apple's temporary full-accuracy prompt (purpose key
  `FloatTracking`) and starts once it is allowed; Settings is offered only
  after it is declined (`floatPermissions.ts: preciseLocationAction`).
- **Status is reported.** River Mode's tracking line comes from Core
  Location's own diagnostics on updates and on the service session (Location
  Services off, denied, Precise Location off, not in use), not from a
  permission read (`floatRecording.ts: trackerState`).
- **Raw tracks are kept on the phone** after a float ends, so anything derived
  from them can be recomputed. Each is deleted with its recap; all are deleted
  with the account. They are never uploaded. Deletion is durable
  (`floatTrackDeletion.ts`): the intent is saved before the recap goes, a
  failed delete is reported and retried at every launch and foreground, and
  if the intent cannot be saved nothing is deleted.
- **Native sources are tracked by rule.** `eddy-ios/.gitignore` ignores
  `ios/`, so each local module needs explicit exceptions there and in
  `.easignore`. `scripts/check-easignore.py` fails when a module that
  declares Apple code has no tracked podspec and Swift, or when a native
  source on disk is untracked or not uploaded.
- **Minimum iOS 18.0**, the release that added `CLServiceSession` and the
  diagnostics. One recording path, no fallback.

## What it replaced, and why

Fixes used to go to an `expo-task-manager` JavaScript task: iOS had to start
the whole JS runtime to deliver each one in the background, and progress was
only as durable as a whole-session JSON write throttled to 15–30 s. Raw fixes
were discarded. Locked-phone tracking needed Always. Relaunch after a
swipe-away relied on significant-location-change and a moving geofence, both
of which lean on cell and Wi-Fi that Ozarks valleys often lack. Tracker
status was inferred from whether a start call threw.

## Consequences

- A new binary; phones below iOS 18 keep the previous store build.
- The Swift module was written against Apple's reference without a local
  Xcode build; its first compile is a release gate.
- `.easignore` admits the module's Swift sources (ADR 0004).
- `CLLocationUpdate.LiveConfiguration.maritime` ("vessels on water") arrived
  in iOS 27. Adopting it behind `#available` is a later change once the build
  image's SDK has it; `.otherNavigation` is Apple's configuration for
  non-road travel until then.
