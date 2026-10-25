import AppIntents
import Foundation

struct EddyRiverEntity: AppEntity {
  static var typeDisplayRepresentation: TypeDisplayRepresentation = "River"
  static var defaultQuery = EddyRiverQuery()
  var choice: EddyShortcutChoice
  var id: String { choice.id }
  var displayRepresentation: DisplayRepresentation { DisplayRepresentation(title: "\(choice.name)") }
}
struct EddyRiverQuery: EntityStringQuery {
  func entities(for identifiers: [String]) async throws -> [EddyRiverEntity] {
    EddyShortcutStore.catalog().rivers.filter { identifiers.contains($0.id) }.map { EddyRiverEntity(choice: $0) }
  }
  func entities(matching string: String) async throws -> [EddyRiverEntity] {
    try await suggestedEntities().filter { $0.choice.name.localizedCaseInsensitiveContains(string) }
  }
  func suggestedEntities() async throws -> [EddyRiverEntity] { EddyShortcutStore.catalog().rivers.map { EddyRiverEntity(choice: $0) } }
  func defaultResult() async -> EddyRiverEntity? { EddyShortcutStore.catalog().rivers.first.map { EddyRiverEntity(choice: $0) } }
}
struct EddyRouteEntity: AppEntity {
  static var typeDisplayRepresentation: TypeDisplayRepresentation = "Saved route"
  static var defaultQuery = EddyRouteQuery()
  var choice: EddyShortcutChoice
  var id: String { choice.id }
  var displayRepresentation: DisplayRepresentation { DisplayRepresentation(title: "\(choice.name)", subtitle: "\(choice.subtitle)") }
}
struct EddyRouteQuery: EntityStringQuery {
  func entities(for identifiers: [String]) async throws -> [EddyRouteEntity] {
    EddyShortcutStore.catalog().routes.filter { identifiers.contains($0.id) }.map { EddyRouteEntity(choice: $0) }
  }
  func entities(matching string: String) async throws -> [EddyRouteEntity] {
    try await suggestedEntities().filter { "\($0.choice.name) \($0.choice.subtitle)".localizedCaseInsensitiveContains(string) }
  }
  func suggestedEntities() async throws -> [EddyRouteEntity] { EddyShortcutStore.catalog().routes.map { EddyRouteEntity(choice: $0) } }
}
struct OpenMyRiverIntent: AppIntent {
  static var title: LocalizedStringResource = "Open my river"
  static var openAppWhenRun = true // Host only; compatible with iOS 18.
  @Parameter(title: "River") var river: EddyRiverEntity?
  @MainActor func perform() async throws -> some IntentResult {
    try EddyShortcutStore.request(kind: "river", entityId: river?.id)
    return .result()
  }
}
struct ReturnToFloatIntent: AppIntent {
  static var title: LocalizedStringResource = "Return to float"
  static var openAppWhenRun = true
  @MainActor func perform() async throws -> some IntentResult {
    try EddyShortcutStore.request(kind: "float", entityId: nil)
    return .result()
  }
}
struct PrepareSavedRouteIntent: AppIntent {
  static var title: LocalizedStringResource = "Prepare saved route"
  static var openAppWhenRun = true
  @Parameter(title: "Saved route") var route: EddyRouteEntity?
  @MainActor func perform() async throws -> some IntentResult {
    try EddyShortcutStore.request(kind: "route", entityId: route?.id)
    return .result()
  }
}
struct EddyAppShortcuts: AppShortcutsProvider {
  static var appShortcuts: [AppShortcut] {
    AppShortcut(intent: OpenMyRiverIntent(), phrases: ["Open my river in \(.applicationName)", "Open \(\.$river) in \(.applicationName)"], shortTitle: "Open my river", systemImageName: "water.waves")
    AppShortcut(intent: ReturnToFloatIntent(), phrases: ["Return to my float in \(.applicationName)"], shortTitle: "Return to float", systemImageName: "location.fill")
    AppShortcut(intent: PrepareSavedRouteIntent(), phrases: ["Prepare a saved route in \(.applicationName)"], shortTitle: "Prepare saved route", systemImageName: "map")
  }
  private static var observer: NSObjectProtocol?
  static func register() {
    updateAppShortcutParameters()
    guard observer == nil else { return }
    observer = NotificationCenter.default.addObserver(forName: EddyShortcutStore.changed, object: nil, queue: .main) { _ in
      updateAppShortcutParameters()
    }
  }
}
