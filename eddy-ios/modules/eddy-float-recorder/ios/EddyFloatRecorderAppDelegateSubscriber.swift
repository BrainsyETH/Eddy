import ExpoModulesCore
import UIKit

/// Resumes a float's recording at launch, before JavaScript exists. When iOS
/// relaunches Eddy in the background mid-float, Core Location requires the
/// sessions to be recreated immediately; waiting for the JS bundle would lose
/// the queued fixes' delivery window. See FloatRecorder.resumeIfActive.
public final class EddyFloatRecorderAppDelegateSubscriber: ExpoAppDelegateSubscriber {
  public func application(
    _ application: UIApplication,
    didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil
  ) -> Bool {
    MainActor.assumeIsolated {
      FloatRecorder.shared.resumeIfActive()
    }
    return true
  }

  /// iOS may end a backgrounded app without warning; put the journal on storage.
  public func applicationDidEnterBackground(_ application: UIApplication) {
    FloatJournal.shared.synchronize()
  }
}
