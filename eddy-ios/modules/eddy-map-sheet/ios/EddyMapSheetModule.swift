import ExpoModulesCore
import UIKit

public final class EddyMapSheetModule: Module {
  private var contrastObserver: NSObjectProtocol?

  public func definition() -> ModuleDefinition {
    Name("EddyMapSheet")
    View(MapSheetScrollBoundaryView.self) {}
    // Keep resolved palette strings available for Mapbox/SVG as well as UIKit.
    Events("onContrastChange")
    AsyncFunction("isIncreaseContrastEnabled") {
      UIAccessibility.isDarkerSystemColorsEnabled
    }.runOnQueue(.main)
    OnStartObserving {
      self.contrastObserver = NotificationCenter.default.addObserver(
        forName: UIAccessibility.darkerSystemColorsStatusDidChangeNotification,
        object: nil, queue: .main
      ) { [weak self] _ in
        self?.sendEvent("onContrastChange", ["enabled": UIAccessibility.isDarkerSystemColorsEnabled])
      }
    }
    OnStopObserving {
      if let observer = self.contrastObserver { NotificationCenter.default.removeObserver(observer) }
      self.contrastObserver = nil
    }
    OnDestroy {
      if let observer = self.contrastObserver { NotificationCenter.default.removeObserver(observer) }
      self.contrastObserver = nil
    }
  }
}

// UIKit's automatic edge effect can cover a translated sheet's entire scroller
// after a fast expansion. These scrollers already clear the native tab bar and
// have their own fixed/sticky headers, so they don't need a system edge veil.
// Scope this to each wrapped scroller; never change the tab bar's material or
// any scroll view elsewhere in the app.
final class MapSheetScrollBoundaryView: ExpoView {
  override func didAddSubview(_ subview: UIView) {
    super.didAddSubview(subview)
    hideScrollEdges(in: subview)
  }

  override func didMoveToWindow() {
    super.didMoveToWindow()
    hideScrollEdges(in: self)
  }

  override func layoutSubviews() {
    super.layoutSubviews()
    hideScrollEdges(in: self)
  }

  private func hideScrollEdges(in view: UIView) {
    if #available(iOS 26.0, *) {
      if let scrollView = view as? UIScrollView {
        scrollView.topEdgeEffect.isHidden = true
        scrollView.bottomEdgeEffect.isHidden = true
        scrollView.leftEdgeEffect.isHidden = true
        scrollView.rightEdgeEffect.isHidden = true
        return
      }
      // React Native's ScrollView component adds a wrapper around UIScrollView.
      for child in view.subviews {
        hideScrollEdges(in: child)
      }
    }
  }
}
