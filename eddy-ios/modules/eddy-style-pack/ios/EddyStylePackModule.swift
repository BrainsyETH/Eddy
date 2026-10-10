import ExpoModulesCore
import MapboxMaps

// Float Mode's "Ready offline" needs positive evidence that the map STYLE
// (style JSON, sprites, glyphs) is on the phone, not only the tiles.
// @rnmapbox/maps exposes no style-pack status to JavaScript, so this reads it
// straight from the Maps SDK. See docs/decisions/0011.
//
// Uses OfflineManager.stylePack(for:completion:) and StylePack's
// requiredResourceCount / completedResourceCount (MapboxMaps v11). The default
// OfflineManager shares the store @rnmapbox/maps downloads into.
public final class EddyStylePackModule: Module {
  public func definition() -> ModuleDefinition {
    Name("EddyStylePack")

    // Resolves the pack's counts, or nil when there is no pack for this style
    // (never downloaded, removed) or the URL is not a style URI. Never rejects:
    // "unknown" is an answer the caller already treats as "not ready".
    AsyncFunction("status") { (styleURL: String, promise: Promise) in
      guard let styleURI = StyleURI(rawValue: styleURL) else {
        promise.resolve(nil)
        return
      }
      let manager = OfflineManager()
      manager.stylePack(for: styleURI) { result in
        // The manager must outlive the lookup.
        withExtendedLifetime(manager) {
          switch result {
          case .success(let pack):
            promise.resolve([
              "requiredResourceCount": Double(pack.requiredResourceCount),
              "completedResourceCount": Double(pack.completedResourceCount),
            ])
          case .failure:
            promise.resolve(nil)
          }
        }
      }
    }
  }
}
