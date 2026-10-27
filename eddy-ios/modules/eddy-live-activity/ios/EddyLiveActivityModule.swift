import ActivityKit
import ExpoModulesCore
import UIKit
import WidgetKit

// Foreground requests use a durable throttle so rapid app switching cannot
// burn WidgetKit's background budget. Configuration changes always bypass it.
private enum ConditionsWidgetReloader {
  private static let key = "eddy.conditions.foregroundReload.v1"
  private static let minimumInterval: TimeInterval = 15 * 60
  static func request(force: Bool) -> String {
    let now = Date().timeIntervalSince1970
    let defaults = UserDefaults.standard
    if !force && now - defaults.double(forKey: key) < minimumInterval { return "throttled" }
    defaults.set(now, forKey: key)
    WidgetCenter.shared.reloadTimelines(ofKind: ConditionsWidgetStore.riverKind)
    WidgetCenter.shared.reloadTimelines(ofKind: ConditionsWidgetStore.favoritesKind)
    WidgetCenter.shared.reloadTimelines(ofKind: ConditionsWidgetStore.damKind)
    WidgetCenter.shared.reloadTimelines(ofKind: ConditionsWidgetStore.reportKind)
    return "requested"
  }
}

private struct Snapshot: Decodable {
  var sessionId: String
  var state: FloatActivityAttributes.ContentState
}

public final class EddyLiveActivityModule: Module {
  // Touched only on the main actor: `sync`, `observeCurrentActivity` and
  // `invalidateObservation` all run there, and so does destruction below.
  @MainActor private var observation: Task<Void, Never>?
  @MainActor private var observedId: String?
  private var shortcutObserver: NSObjectProtocol?

  public func definition() -> ModuleDefinition {
    Name("EddyLiveActivity")
    Events("onActivityState", "onShortcut")
    OnCreate {
      self.shortcutObserver = NotificationCenter.default.addObserver(forName: EddyShortcutStore.requested, object: nil, queue: .main) { [weak self] _ in
        self?.sendEvent("onShortcut", [:])
      }
    }
    AsyncFunction("setShortcutCatalog") { (json: String) in
      try EddyShortcutStore.setCatalog(json)
    }
    AsyncFunction("takeShortcutRequest") { () -> String? in
      return await MainActor.run { EddyShortcutStore.takeRequest() }
    }
    Function("widgetLayoutVersion") { 4 }
    AsyncFunction("readWidgetConfiguration") { () -> String? in
      ConditionsWidgetStore.configurationJSON()
    }
    AsyncFunction("readWidgetDiagnostics") { () -> String in
      ConditionsWidgetDiagnostics.json()
    }
    AsyncFunction("refreshConditionsWidgets") { () -> String in
      ConditionsWidgetReloader.request(force: false)
    }
    AsyncFunction("setWidgetConfiguration") { (json: String) in
      if try ConditionsWidgetStore.setConfiguration(json) {
        _ = ConditionsWidgetReloader.request(force: true)
      }
    }
    OnDestroy {
      Task { @MainActor [weak self] in
        self?.observation?.cancel()
        self?.observation = nil
        self?.observedId = nil
      }
      if let observer = self.shortcutObserver { NotificationCenter.default.removeObserver(observer) }
      self.shortcutObserver = nil
    }
    AsyncFunction("sync") { (json: String?, allowStart: Bool, promise: Promise) in
      Task { @MainActor in
        do {
          let result = try await FloatActivities.sync(json, allowStart: allowStart) { activityId in
            self.invalidateObservation(for: activityId)
          }
          self.observeCurrentActivity()
          promise.resolve(result)
        } catch {
          // Presentation failure must never stop the GPS/session or expose data.
          promise.resolve("error")
        }
      }
    }
  }

  @MainActor
  private func invalidateObservation(for activityId: String) {
    guard observedId == activityId else { return }
    // Do this BEFORE Activity.end can emit .ended. Intentional cleanup is not
    // a user dismissal, including when an old session's card is reconciled.
    observedId = nil
    observation?.cancel()
    observation = nil
  }

  @MainActor
  private func observeCurrentActivity() {
    let activity = Activity<FloatActivityAttributes>.activities.first {
      $0.activityState == .active || $0.activityState == .stale
    }
    guard activity?.id != observedId else { return }
    observation?.cancel()
    observedId = activity?.id
    guard let activity else { return }
    observation = Task { @MainActor [weak self] in
      for await state in activity.activityStateUpdates {
        guard !Task.isCancelled, let self, self.observedId == activity.id else { return }
        // A swipe-away and the system's eight-hour expiry are told apart so
        // the app can say which happened; neither ends the float.
        if state == .dismissed {
          self.sendEvent("onActivityState", ["availability": "dismissed"])
          return
        }
        if state == .ended {
          self.sendEvent("onActivityState", ["availability": "expired"])
          return
        }
      }
    }
  }
}

@MainActor
private enum FloatActivities {
  private static let startedKey = "eddy.floatActivity.startedSession"
  private static let failedKey = "eddy.floatActivity.failedSession"

  static func sync(_ json: String?, allowStart: Bool, willEnd: (String) -> Void) async throws -> String {
    let decoder = JSONDecoder()
    decoder.dateDecodingStrategy = .millisecondsSince1970
    let snapshot: Snapshot?
    if let json {
      let data = Data(json.utf8)
      // Leave room for ActivityKit's static attributes alongside content.
      guard data.count < 3_800 else { return "error" }
      snapshot = try decoder.decode(Snapshot.self, from: data)
    } else {
      snapshot = nil
    }

    // Activity.activities survives process restarts. Never rely on a JS-held id.
    var matching: Activity<FloatActivityAttributes>?
    for activity in Activity<FloatActivityAttributes>.activities {
      let active = activity.activityState == .active || activity.activityState == .stale
      if let snapshot, active, activity.attributes.sessionId == snapshot.sessionId, matching == nil {
        matching = activity
      } else {
        // Expired/orphaned cards are deliberately removed on the next handover;
        // stale progress is not kept around as a completed-trip summary.
        willEnd(activity.id)
        await activity.end(nil, dismissalPolicy: .immediate)
      }
    }
    guard let snapshot else {
      UserDefaults.standard.removeObject(forKey: failedKey)
      return "idle"
    }
    // No usable fix yet means nothing to go stale: the card says it is
    // finding the position. A stale date in the past would mark a brand-new
    // card stale before any position existed.
    let content = ActivityContent(state: snapshot.state, staleDate: snapshot.state.staleAt)
    if let matching {
      UserDefaults.standard.set(snapshot.sessionId, forKey: startedKey)
      UserDefaults.standard.removeObject(forKey: failedKey)
      await matching.update(content)
      return matching.activityState == .active || matching.activityState == .stale ? "active" : "dismissed"
    }
    guard ActivityAuthorizationInfo().areActivitiesEnabled else { return "disabled" }

    // A missing activity may have been dismissed, expired, or ended by iOS.
    // Restoring a session/background callback never authorizes a new card.
    guard allowStart, UIApplication.shared.applicationState == .active else {
      if UserDefaults.standard.string(forKey: failedKey) == snapshot.sessionId { return "error" }
      return UserDefaults.standard.string(forKey: startedKey) == snapshot.sessionId ? "dismissed" : "idle"
    }
    do {
      _ = try Activity<FloatActivityAttributes>.request(
        attributes: FloatActivityAttributes(sessionId: snapshot.sessionId),
        content: content,
        pushType: nil
      )
      // A crash between request and this write is recoverable via activities.
      UserDefaults.standard.set(snapshot.sessionId, forKey: startedKey)
      UserDefaults.standard.removeObject(forKey: failedKey)
      return "active"
    } catch {
      // Keep the explanation through later fixes/relaunches until an explicit
      // retry succeeds. A failed start is neither idle nor a user dismissal.
      UserDefaults.standard.set(snapshot.sessionId, forKey: failedKey)
      throw error
    }
  }
}
