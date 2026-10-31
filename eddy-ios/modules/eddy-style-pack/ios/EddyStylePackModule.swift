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
// way @rnmapbox/maps holds and uses its own. Neither this nor the first version
// (a new manager per call on the module's background queue) has been seen to
// answer: on the 1.5.0 preview build and a simulator build every `status`
// call went unanswered past JavaScript's 8-second limit. `diagnose` exists to
// find out why instead of guessing; see its comment.
public final class EddyStylePackModule: Module {
  /// Bumped with every native change, so a log proves which code a binary runs.
  static let revision = "3-diagnose"

  private var manager: OfflineManager?

  public func definition() -> ModuleDefinition {
    Name("EddyStylePack")

    Constants(["revision": Self.revision])

    // Resolves the pack's counts, or nil only when the store CONFIRMS there is
    // no pack for this style (never downloaded, removed). A store that cannot
    // be read rejects, which JavaScript reads as `read-failed`: "couldn't
    // check" and "not saved" are different answers and the card says which.
    AsyncFunction("status") { (styleURL: String, promise: Promise) in
      let started = Date()
      NSLog("[EddyStylePack] status start revision=%@ main=%ld", Self.revision, Thread.isMainThread ? 1 : 0)
      guard let styleURI = StyleURI(rawValue: styleURL) else {
        promise.reject("ERR_STYLE_URI", "Not a style URI: \(styleURL)")
        return
      }
      let manager = self.manager ?? OfflineManager()
      self.manager = manager
      manager.stylePack(for: styleURI) { result in
        NSLog("[EddyStylePack] status stylePack answered after %ld ms: %@", Self.ms(since: started), Self.describe(result))
        switch result {
        case .success(let pack):
          promise.resolve(Self.counts(pack))
        case .failure:
          // A lookup error is not evidence that no pack exists: check the
          // full list. Mapbox calls back on a worker thread; go back to main,
          // where this module does all of its Mapbox work.
          DispatchQueue.main.async {
            manager.allStylePacks { all in
              NSLog("[EddyStylePack] status allStylePacks answered after %ld ms", Self.ms(since: started))
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

    // Diagnostics only: changes nothing, decides nothing. Asks the offline
    // store four separate questions at once and reports, for each, whether
    // and when it answered and what it said, waiting up to 30 seconds so a
    // slow answer is told apart from none. Questions: the style pack through
    // this module's shared manager, the same through a brand-new manager, the
    // full style-pack list, and the tile regions (the store @rnmapbox/maps
    // reads, which is known to answer). Every value is a string, so the report
    // reaches logs and Sentry intact.
    AsyncFunction("diagnose") { (styleURL: String, promise: Promise) in
      let started = Date()
      let token: String? = MapboxOptions.accessToken
      var report: [String: String] = [
        "revision": Self.revision,
        "accessToken": (token?.isEmpty == false) ? "set" : "missing",
        "styleURL": styleURL,
      ]
      var settled = false
      let questions = ["sharedManagerLookup", "newManagerLookup", "allStylePacks", "tileRegions"]
      func answer(_ key: String, _ value: String) {
        DispatchQueue.main.async {
          guard !settled else { return }
          report[key] = "\(value) (after \(Self.ms(since: started)) ms)"
          if questions.allSatisfy({ report[$0] != nil }) { finish() }
        }
      }
      func finish() {
        guard !settled else { return }
        settled = true
        for key in questions where report[key] == nil { report[key] = "no answer after 30000 ms" }
        NSLog("[EddyStylePack] diagnose %@", report.description)
        promise.resolve(report)
      }
      DispatchQueue.main.asyncAfter(deadline: .now() + 30) { finish() }

      guard let styleURI = StyleURI(rawValue: styleURL) else {
        for key in questions { report[key] = "not asked: not a style URI" }
        finish()
        return
      }
      let shared = self.manager ?? OfflineManager()
      self.manager = shared
      shared.stylePack(for: styleURI) { answer("sharedManagerLookup", Self.describe($0)) }
      let fresh = OfflineManager()
      fresh.stylePack(for: styleURI) { result in
        withExtendedLifetime(fresh) { answer("newManagerLookup", Self.describe(result)) }
      }
      shared.allStylePacks { result in
        switch result {
        case .success(let packs):
          let list = packs.map { "\($0.styleURI) \($0.completedResourceCount)/\($0.requiredResourceCount)" }
          answer("allStylePacks", "\(packs.count) pack(s): \(list.joined(separator: "; "))")
        case .failure(let error):
          answer("allStylePacks", "failed: \(String(describing: error))")
        }
      }
      TileStore.default.allTileRegions { result in
        switch result {
        case .success(let regions):
          let complete = regions.filter { $0.requiredResourceCount > 0 && $0.completedResourceCount >= $0.requiredResourceCount }
          answer("tileRegions", "\(regions.count) region(s), \(complete.count) complete")
        case .failure(let error):
          answer("tileRegions", "failed: \(String(describing: error))")
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

  private static func describe(_ result: Result<StylePack, Error>) -> String {
    switch result {
    case .success(let pack):
      return "found \(pack.completedResourceCount)/\(pack.requiredResourceCount)"
    case .failure(let error):
      return "failed: \(String(describing: error))"
    }
  }

  private static func ms(since start: Date) -> Int {
    return Int(Date().timeIntervalSince(start) * 1000)
  }
}
