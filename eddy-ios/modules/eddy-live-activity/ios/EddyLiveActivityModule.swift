import ActivityKit
import ExpoModulesCore
import UIKit

private struct Snapshot: Decodable {
  var sessionId: String
  var state: FloatActivityAttributes.ContentState
}

public final class EddyLiveActivityModule: Module {
  private var observation: Task<Void, Never>?
  private var observedId: String?

  public func definition() -> ModuleDefinition {
    Name("EddyLiveActivity")
    Events("onActivityState")
    OnDestroy {
      self.observation?.cancel()
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
        if state == .dismissed || state == .ended {
          self.sendEvent("onActivityState", ["availability": "dismissed"])
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
    let content = ActivityContent(state: snapshot.state, staleDate: snapshot.state.staleAt ?? Date())
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
