import ExpoModulesCore
import MapboxMaps

// River Mode's "Ready offline" needs positive evidence that the map STYLE
// (style JSON, sprites, glyphs) is on the phone, not only the tiles.
// @rnmapbox/maps exposes no style-pack status to JavaScript, so this reads it
// straight from the Maps SDK. See docs/decisions/0011.
//
// Uses OfflineManager.stylePack(for:completion:) and StylePack's
// requiredResourceCount / completedResourceCount (MapboxMaps v11). The default
// OfflineManager shares the store @rnmapbox/maps downloads into.
//
// One manager for the module's life, created and used on the main queue, the
// way @rnmapbox/maps holds and uses its own. The first version made a new
// OfflineManager per call on the module's background queue, and on a device
// (1.5.0 preview build, October 30, 2026) every call went unanswered past
// the 8-second limit, on two trips and across launches. Which of the two
// differences fixes it is unconfirmed until a build runs on a phone.
public final class EddyStylePackModule: Module {
  private var manager: OfflineManager?

  public func definition() -> ModuleDefinition {
    Name("EddyStylePack")

    // Resolves the pack's counts, or nil only when the store CONFIRMS there is
    // no pack for this style (never downloaded, removed). A store that cannot
    // be read rejects, which JavaScript reads as `read-failed`: "couldn't
    // check" and "not saved" are different answers and the card says which.
    AsyncFunction("status") { (styleURL: String, promise: Promise) in
      guard let styleURI = StyleURI(rawValue: styleURL) else {
        promise.reject("ERR_STYLE_URI", "Not a style URI: \(styleURL)")
        return
      }
      let manager = self.manager ?? OfflineManager()
      self.manager = manager
      manager.stylePack(for: styleURI) { result in
        switch result {
        case .success(let pack):
          promise.resolve(Self.counts(pack))
        case .failure:
          // A lookup error is not evidence that no pack exists: check the
          // full list. Mapbox calls back on a worker thread; go back to main,
          // where this module does all of its Mapbox work.
          DispatchQueue.main.async {
            manager.allStylePacks { all in
              switch all {
              case .success(let packs):
                if let pack = packs.first(where: { $0.styleURI == styleURL }) {
                  promise.resolve(Self.counts(pack))
                } else {
                  promise.resolve(nil)
                }
              case .failure(let error):
                promise.reject("ERR_STYLE_PACK_READ", error.localizedDescription)
              }
            }
          }
        }
      }
    }.runOnQueue(.main)
  }

  private static func counts(_ pack: StylePack) -> [String: Double] {
    return [
      "requiredResourceCount": Double(pack.requiredResourceCount),
      "completedResourceCount": Double(pack.completedResourceCount),
    ]
  }
}
