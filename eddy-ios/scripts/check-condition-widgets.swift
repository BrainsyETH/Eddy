// Foundation contract checks for a Mac with Xcode/Swift. From eddy-ios:
// swiftc modules/eddy-live-activity/ios/ConditionWidgetData.swift \
//   scripts/check-condition-widgets.swift -o /tmp/eddy-widget-check
// /tmp/eddy-widget-check modules/eddy-live-activity/widget/ConditionsPreview.json
// This does not replace compiling the WidgetKit extension or device checks.
import Foundation

@main struct ConditionWidgetChecks {
  static func main() throws {
    let data = try Data(contentsOf: URL(fileURLWithPath: CommandLine.arguments[1]))
    let preview = try JSONDecoder().decode(ConditionsWidgetPreview.self, from: data)
    let now = Date(timeIntervalSince1970: 2_000_000_000)
    let shifted = preview.rebased(to: now)
    let choice = shifted.choices[0]
    var snapshot = shifted.stations[choice.siteId]!.snapshot!
    precondition(snapshot.isCurrent(at: now))
    precondition(snapshot.observedAt == now.timeIntervalSince1970 * 1000 - 600_000)
    precondition(shifted.stations[choice.siteId]!.history!.cfs.to == now.timeIntervalSince1970 * 1000)
    precondition(!snapshot.isCurrent(at: now.addingTimeInterval(6 * 3600)))

    let ms = now.timeIntervalSince1970 * 1000
    let warning = WidgetFloodAlerts.Warning(label: "Flash Flood Warning", expiresAt: ms + 1800_000, ink: "#000000", chipBorder: "#FFFFFF")
    let alerts = WidgetFloodAlerts(validUntil: ms + 900_000, warnings: [warning])
    precondition(alerts.warning(at: now)?.label == warning.label)
    precondition(alerts.isCurrent(at: now))
    precondition(!alerts.isCurrent(at: now.addingTimeInterval(900)))
    precondition(alerts.warning(at: now.addingTimeInterval(900)) != nil) // now needs reconfirmation
    precondition(alerts.warning(at: now.addingTimeInterval(1800)) == nil)
    var undated = alerts
    undated.warnings[0].expiresAt = nil
    precondition(!undated.isCurrent(at: now.addingTimeInterval(900)))
    snapshot.floodAlerts = alerts
    var next = snapshot
    next.floodAlerts = nil
    let offline = next.preservingUnavailableAlerts(from: snapshot)
    precondition(offline.floodAlerts?.validUntil == alerts.validUntil)
    precondition(offline.observedAt == next.observedAt)
    next.floodAlerts = WidgetFloodAlerts(validUntil: ms + 900_000, warnings: [])
    precondition(next.preservingUnavailableAlerts(from: snapshot).floodAlerts!.warnings.isEmpty)

    // Old cached/API snapshots decode without the additive alert field.
    var oldJSON = try JSONSerialization.jsonObject(with: JSONEncoder().encode(snapshot)) as! [String: Any]
    oldJSON.removeValue(forKey: "floodAlerts")
    let old = try JSONDecoder().decode(WidgetGaugeSnapshot.self, from: JSONSerialization.data(withJSONObject: oldJSON))
    precondition(old.floodAlerts == nil)
    precondition(old.observedAt == snapshot.observedAt)

    let suite = "eddy.widget-check.\(UUID().uuidString)"
    let defaults = UserDefaults(suiteName: suite)!
    defer { defaults.removePersistentDomain(forName: suite) }
    let memory = WidgetChoiceMemory(defaults: defaults)
    var national = choice
    national.id = "01234567|"
    national.siteId = "01234567"
    national.riverSlug = nil
    national.riverName = "Example River"
    national.stationName = "National station near town"
    let previous = ConditionsWidgetConfiguration(version: 1, catalog: [national], favorites: [national])
    memory.preserveRemoved(from: previous, in: .empty)
    precondition(memory.choice(national.id) == national)
    precondition(memory.choice("different-id") == nil)
    precondition(ConditionsWidgetConfiguration.empty.favorites.isEmpty)
    print("Widget preview, freshness, warning fallback, old snapshots and retained station names verified.")
  }
}
