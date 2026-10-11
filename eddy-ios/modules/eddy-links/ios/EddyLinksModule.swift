import ExpoModulesCore
import UIKit

public final class EddyLinksModule: Module {
  public func definition() -> ModuleDefinition {
    Name("EddyLinks")

    AsyncFunction("openUniversalLink") { (value: String, promise: Promise) in
      guard let url = URL(string: value), url.scheme == "https" else {
        promise.resolve(false)
        return
      }
      // Unlike canOpenURL(https:), this checks the actual universal-link
      // handoff. No installed handler (or a user-disabled association) returns
      // false without launching Safari; JavaScript then opens the sheet.
      UIApplication.shared.open(url, options: [.universalLinksOnly: true]) { opened in
        promise.resolve(opened)
      }
    }
    .runOnQueue(.main)
  }
}
