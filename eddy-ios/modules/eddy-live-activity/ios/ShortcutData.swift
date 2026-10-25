import Foundation

// Compiled into both the host target and module. Only navigation metadata is
// stored here. The current JS account validates the identifier before opening.
struct EddyShortcutChoice: Codable {
  var id: String
  var name: String
  var subtitle: String
}
struct EddyShortcutCatalog: Codable {
  var version: Int
  var rivers: [EddyShortcutChoice]
  var routes: [EddyShortcutChoice]
}
enum EddyShortcutStore {
  static let changed = Notification.Name("eddy.shortcuts.catalogChanged")
  static let requested = Notification.Name("eddy.shortcuts.requested")
  private static let catalogKey = "eddy.shortcuts.catalog.v1"
  private static let requestKey = "eddy.shortcuts.request.v1"
  static func catalog() -> EddyShortcutCatalog {
    if let json = UserDefaults.standard.string(forKey: catalogKey),
       let value = try? JSONDecoder().decode(EddyShortcutCatalog.self, from: Data(json.utf8)), value.version == 1 { return value }
    return EddyShortcutCatalog(version: 1, rivers: [], routes: [])
  }
  static func setCatalog(_ json: String) throws {
    let value = try JSONDecoder().decode(EddyShortcutCatalog.self, from: Data(json.utf8))
    guard value.version == 1, json != UserDefaults.standard.string(forKey: catalogKey) else { return }
    UserDefaults.standard.set(json, forKey: catalogKey)
    NotificationCenter.default.post(name: changed, object: nil)
  }
  @MainActor static func request(kind: String, entityId: String?) throws {
    var value: [String: Any] = ["version": 1, "kind": kind, "createdAt": Date().timeIntervalSince1970 * 1000]
    if let entityId { value["entityId"] = entityId }
    let data = try JSONSerialization.data(withJSONObject: value)
    UserDefaults.standard.set(String(decoding: data, as: UTF8.self), forKey: requestKey)
    NotificationCenter.default.post(name: requested, object: nil)
  }
  @MainActor static func takeRequest() -> String? {
    let json = UserDefaults.standard.string(forKey: requestKey)
    UserDefaults.standard.removeObject(forKey: requestKey)
    return json
  }
}
