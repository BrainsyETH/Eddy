import ExpoModulesCore
import UIKit

/// Applies before React renders, including when a gate or error replaces the
/// entire navigator. Expo uses this factory for the initial root and reloads.
public final class EddyOrientationReactDelegateHandler: ExpoReactDelegateHandler {
  public override func createRootViewController() -> UIViewController? {
    MainActor.assumeIsolated {
      EddyPortraitRootViewController()
    }
  }
}

private final class EddyPortraitRootViewController: UIViewController {
  override var supportedInterfaceOrientations: UIInterfaceOrientationMask {
    .portrait
  }

  override var preferredInterfaceOrientationForPresentation: UIInterfaceOrientation {
    .portrait
  }

  // Keep autorotation enabled: UIKit must be able to restore portrait when a
  // landscape chart is dismissed. Full-screen modals supply their own mask;
  // do not restrict the app delegate's mask or lock orientation from JS.
  override var shouldAutorotate: Bool {
    true
  }
}
