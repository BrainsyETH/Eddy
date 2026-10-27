import CoreLocation
import Foundation
import UIKit

/// Records the active float's GPS track, natively, independent of the UI and
/// of JavaScript. See docs/decisions/0014-float-recording-is-native.md.
///
/// ── Apple's pattern, followed exactly ───────────────────────────────────────
/// A float is a CLServiceSession (When In Use, with a full-accuracy purpose
/// key) plus a CLBackgroundActivitySession, created while Eddy is in the
/// foreground when the float starts, and CLLocationUpdate.liveUpdates for the
/// fixes. The background activity session keeps Eddy "in use" with the phone
/// locked, so no "Always" permission is needed, and it shows the blue
/// location indicator. If iOS terminates Eddy mid-float it relaunches it in
/// the background; the app delegate subscriber then recreates both sessions
/// and the updates immediately, and Core Location delivers what it queued.
///
/// ── What it does with a fix ─────────────────────────────────────────────────
/// Appends it to the float's journal (FloatJournal) before anything else, then
/// tells JS, which derives progress from the journal. A fix is never only in
/// memory: if nothing in JS is running, the journal still has it.
///
/// ── Status is reported, not inferred ────────────────────────────────────────
/// Every update and every service-session diagnostic carries Core Location's
/// own flags (denied, Location Services off, Precise Location off, not in
/// use, location unavailable, stationary). They are passed to JS as they
/// arrive; River Mode says what they say.
@MainActor
final class FloatRecorder {
  static let shared = FloatRecorder()

  /// The float being recorded, kept across launches so a relaunch resumes it.
  private static let activeKey = "eddy.floatRecorder.activeSession.v1"
  /// Matches NSLocationTemporaryUsageDescriptionDictionary in app.json.
  private static let accuracyPurposeKey = "FloatTracking"

  enum State: String {
    case idle, recording, failed
  }

  private(set) var sessionId: String?
  private(set) var state: State = .idle
  private var serviceSession: CLServiceSession?
  private var backgroundSession: CLBackgroundActivitySession?
  private var updatesTask: Task<Void, Never>?
  private var diagnosticsTask: Task<Void, Never>?
  private var lastFixTime: Date?
  /// Latest flags from location updates.
  private var updateFlags: [String: Bool] = [:]
  /// Latest flags from the service session's diagnostics.
  private var sessionFlags: [String: Bool] = [:]
  /// The last fix could not be written to the journal. Held, not one-shot:
  /// River Mode must keep saying so until a later fix is written, because a
  /// fix that is not on disk is not recorded, whatever the sessions report.
  private var journalFailed = false

  /// Set by the module while JS is listening; events are dropped otherwise
  /// (the journal still has every fix).
  var emit: ((String, [String: Any]) -> Void)?

  /// Held only while the temporary precise-location prompt is showing, with
  /// every caller waiting on that one prompt. A second request while it shows
  /// joins it rather than replacing the manager, which would release the
  /// prompt's owner and could leave the first caller waiting forever.
  private var accuracyManager: CLLocationManager?
  private var accuracyWaiters: [(Bool) -> Void] = []

  private init() {}

  /// Ask, inside Eddy, for precise location for this use: Apple's temporary
  /// full-accuracy prompt, with the FloatTracking purpose text. Resolves
  /// whether precise location is on afterwards. Start asks this way first and
  /// sends people to Settings only if it was declined.
  func requestPreciseLocation(done: @escaping (Bool) -> Void) {
    if accuracyManager != nil {
      accuracyWaiters.append(done)
      return
    }
    let manager = CLLocationManager()
    if manager.accuracyAuthorization == .fullAccuracy {
      done(true)
      return
    }
    accuracyManager = manager
    accuracyWaiters = [done]
    manager.requestTemporaryFullAccuracyAuthorization(withPurposeKey: Self.accuracyPurposeKey) { _ in
      Task { @MainActor in
        let recorder = FloatRecorder.shared
        // Only the prompt that is still current settles the waiters.
        guard recorder.accuracyManager === manager else { return }
        let full = manager.accuracyAuthorization == .fullAccuracy
        let waiters = recorder.accuracyWaiters
        recorder.accuracyManager = nil
        recorder.accuracyWaiters = []
        for waiter in waiters { waiter(full) }
      }
    }
  }

  var persistedSessionId: String? {
    UserDefaults.standard.string(forKey: Self.activeKey)
  }

  var status: [String: Any] {
    var out: [String: Any] = [
      "state": state.rawValue,
      "update": updateFlags,
      "session": sessionFlags,
    ]
    if let sessionId { out["sessionId"] = sessionId }
    if let lastFixTime { out["lastFixAt"] = lastFixTime.timeIntervalSince1970 * 1000 }
    if journalFailed { out["journalError"] = true }
    return out
  }

  /// Start recording a float. Only with Eddy in the foreground: a background
  /// activity session created in the background stays "insufficiently in
  /// use" until Eddy is next opened, and the persisted id would resume it the
  /// same way. JS checks its own app state, which can lag the native one, so
  /// the guard is here. A refused start is reported as failed for this float,
  /// so River Mode offers Retry and the next foreground tries again.
  /// Recording the same float again is a no-op; a different one replaces it.
  func start(sessionId: String) -> [String: Any] {
    if self.sessionId == sessionId, state == .recording { return status }
    guard UIApplication.shared.applicationState != .background else {
      return [
        "state": State.failed.rawValue,
        "sessionId": sessionId,
        "update": [String: Bool](),
        "session": [String: Bool](),
        "notInForeground": true,
      ]
    }
    if self.sessionId != nil { stopSessions() }
    // A different float starts clean: the previous float's last fix time
    // would drop this one's first fixes as out of order, and its flags are
    // not this float's status.
    reset()
    UserDefaults.standard.set(sessionId, forKey: Self.activeKey)
    begin(sessionId: sessionId)
    return status
  }

  /// Relaunched in the background (or the foreground) mid-float: recreate the
  /// sessions immediately, as Core Location requires, so queued fixes arrive.
  /// Not when permission was never decided: Apple says not to start location
  /// services at launch then, and a float cannot have started without it.
  func resumeIfActive() {
    guard sessionId == nil, let id = persistedSessionId else { return }
    let authorization = CLLocationManager().authorizationStatus
    guard authorization == .authorizedWhenInUse || authorization == .authorizedAlways else { return }
    begin(sessionId: id)
  }

  /// Stop recording. With an id, only if that float is the one recording.
  func stop(sessionId: String?) -> [String: Any] {
    if let sessionId, sessionId != self.sessionId, sessionId != persistedSessionId { return status }
    UserDefaults.standard.removeObject(forKey: Self.activeKey)
    stopSessions()
    FloatJournal.shared.close()
    self.sessionId = nil
    state = .idle
    reset()
    publishStatus()
    return status
  }

  /// Forget everything about the float that was recording: its last fix time,
  /// its flags and any journal failure. Shared by stop and by a start that
  /// replaces one float with another.
  private func reset() {
    updateFlags = [:]
    sessionFlags = [:]
    lastFixTime = nil
    journalFailed = false
  }

  private func begin(sessionId: String) {
    self.sessionId = sessionId
    state = .recording
    let service = CLServiceSession(authorization: .whenInUse, fullAccuracyPurposeKey: Self.accuracyPurposeKey)
    serviceSession = service
    backgroundSession = CLBackgroundActivitySession()

    diagnosticsTask = Task { @MainActor in
      do {
        for try await diagnostic in service.diagnostics {
          guard !Task.isCancelled else { return }
          self.sessionFlags = [
            "authorizationDenied": diagnostic.authorizationDenied,
            "authorizationDeniedGlobally": diagnostic.authorizationDeniedGlobally,
            "authorizationRestricted": diagnostic.authorizationRestricted,
            "authorizationRequestInProgress": diagnostic.authorizationRequestInProgress,
            "insufficientlyInUse": diagnostic.insufficientlyInUse,
            "fullAccuracyDenied": diagnostic.fullAccuracyDenied,
            "serviceSessionRequired": diagnostic.serviceSessionRequired,
          ]
          self.publishStatus()
        }
      } catch {
        // Diagnostics ending is not a recording failure; updates carry flags too.
      }
    }

    updatesTask = Task { @MainActor in
      do {
        for try await update in CLLocationUpdate.liveUpdates(.otherNavigation) {
          guard !Task.isCancelled else { return }
          self.handle(update, sessionId: sessionId)
        }
      } catch {
        guard !Task.isCancelled, self.sessionId == sessionId else { return }
        self.state = .failed
        self.publishStatus()
      }
    }
    publishStatus()
  }

  private func stopSessions() {
    updatesTask?.cancel()
    updatesTask = nil
    diagnosticsTask?.cancel()
    diagnosticsTask = nil
    backgroundSession?.invalidate()
    backgroundSession = nil
    serviceSession?.invalidate()
    serviceSession = nil
  }

  private func handle(_ update: CLLocationUpdate, sessionId: String) {
    let flags: [String: Bool] = [
      "authorizationDenied": update.authorizationDenied,
      "authorizationDeniedGlobally": update.authorizationDeniedGlobally,
      "authorizationRestricted": update.authorizationRestricted,
      "insufficientlyInUse": update.insufficientlyInUse,
      "locationUnavailable": update.locationUnavailable,
      "accuracyLimited": update.accuracyLimited,
      "serviceSessionRequired": update.serviceSessionRequired,
      "stationary": update.stationary,
    ]
    if flags != updateFlags {
      updateFlags = flags
      publishStatus()
    }
    guard let location = update.location, location.horizontalAccuracy >= 0 else { return }
    // A stationary update repeats the last fix; record each fix once.
    if let lastFixTime, location.timestamp <= lastFixTime { return }
    lastFixTime = location.timestamp
    let fix = RecordedFix(
      t: (location.timestamp.timeIntervalSince1970 * 1000).rounded(),
      lng: location.coordinate.longitude,
      lat: location.coordinate.latitude,
      acc: location.horizontalAccuracy,
      spd: location.speed >= 0 ? location.speed : nil,
      crs: location.course >= 0 ? location.course : nil,
      alt: location.verticalAccuracy >= 0 ? location.altitude : nil,
      vacc: location.verticalAccuracy >= 0 ? location.verticalAccuracy : nil
    )
    FloatJournal.shared.append([fix], sessionId: sessionId) { result in
      Task { @MainActor in
        // The float may have stopped while the write was queued.
        guard let recorder = FloatRecorder.recording(sessionId) else { return }
        switch result {
        case .success(let range):
          if recorder.journalFailed {
            // Writing works again: say so, the same way the failure was said.
            recorder.journalFailed = false
            recorder.publishStatus()
          }
          recorder.emit?("onFixes", [
            "sessionId": sessionId,
            "from": Double(range.from),
            "to": Double(range.to),
            "fixes": [fix.dictionary],
          ])
        case .failure:
          // The fix is not on disk, so JS must not count it either; the
          // journal is the record. Held in `status` (not spliced into one
          // event) so River Mode keeps saying so until a write succeeds.
          if !recorder.journalFailed {
            recorder.journalFailed = true
            recorder.publishStatus()
          }
        }
      }
    }
  }

  private static func recording(_ sessionId: String) -> FloatRecorder? {
    shared.sessionId == sessionId ? shared : nil
  }

  private func publishStatus() {
    emit?("onStatus", status)
  }
}
