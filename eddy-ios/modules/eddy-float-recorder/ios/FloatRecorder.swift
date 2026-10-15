import CoreLocation
import Foundation

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
/// arrive; Float Mode says what they say.
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

  /// Set by the module while JS is attached; events are dropped otherwise
  /// (the journal still has every fix).
  var emit: ((String, [String: Any]) -> Void)?

  private init() {}

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
    return out
  }

  /// Start recording a float. Call only with Eddy in the foreground: a new
  /// background activity session cannot begin in the background. Recording
  /// the same float again is a no-op; a different one replaces it.
  func start(sessionId: String) -> [String: Any] {
    if self.sessionId == sessionId, state == .recording { return status }
    if self.sessionId != nil { stopSessions() }
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
    updateFlags = [:]
    sessionFlags = [:]
    lastFixTime = nil
    publishStatus()
    return status
  }

  private func begin(sessionId: String) {
    self.sessionId = sessionId
    state = .recording
    let service = CLServiceSession(authorization: .whenInUse, fullAccuracyPurposeKey: Self.accuracyPurposeKey)
    serviceSession = service
    backgroundSession = CLBackgroundActivitySession()

    diagnosticsTask = Task { @MainActor [weak self] in
      do {
        for try await diagnostic in service.diagnostics {
          guard let self, !Task.isCancelled else { return }
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

    updatesTask = Task { @MainActor [weak self] in
      do {
        for try await update in CLLocationUpdate.liveUpdates(.otherNavigation) {
          guard let self, !Task.isCancelled else { return }
          self.handle(update, sessionId: sessionId)
        }
      } catch {
        guard let self, !Task.isCancelled, self.sessionId == sessionId else { return }
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
          recorder.emit?("onFixes", [
            "sessionId": sessionId,
            "from": Double(range.from),
            "to": Double(range.to),
            "fixes": [fix.dictionary],
          ])
        case .failure:
          // The fix is not on disk, so JS must not count it either; the
          // journal is the record. Say so rather than drop it silently.
          var status = recorder.status
          status["journalError"] = true
          recorder.emit?("onStatus", status)
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
