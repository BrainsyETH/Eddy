// Foundation contract checks for a Mac with Xcode/Swift. From eddy-ios:
// swiftc modules/eddy-live-activity/ios/ConditionWidgetData.swift \
//   modules/eddy-live-activity/ios/SupplementaryWidgetData.swift \
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
    let favorites = Array(shifted.choices.prefix(3))
    precondition(widgetFavoriteChoices(selected: [nil, nil, nil], favorites: favorites) == favorites)
    precondition(widgetFavoriteChoices(selected: [nil, favorites[0], nil], favorites: favorites).map(\.id)
      == [favorites[1].id, favorites[0].id, favorites[2].id])
    precondition(widgetFavoriteChoices(selected: [favorites[0], favorites[0], nil], favorites: []).count == 1)
    precondition(widgetFavoriteChoices(selected: [favorites[0], nil, nil], favorites: []).first == favorites[0])
    precondition(widgetShortTrend("Holding steady") == "Steady")
    precondition(widgetShortTrend("Rising slowly") == "Slow rise")
    var namedChoice = choice
    namedChoice.riverName = "Current River"
    namedChoice.stationName = "Current River at Akers, MO"
    precondition(widgetStationLabel(namedChoice) == "Akers, MO")
    namedChoice.stationName = "Current River near Van Buren"
    precondition(widgetStationLabel(namedChoice) == "Van Buren")
    namedChoice.stationName = "Current Riverbend"
    precondition(widgetStationLabel(namedChoice) == "Current Riverbend")
    precondition(widgetWeatherSymbol("Partly cloudy") == "cloud.sun.fill")
    precondition(widgetWeatherSymbol("Thunderstorms") == "cloud.bolt.rain.fill")
    precondition(widgetWeatherSymbol("Unknown") == "thermometer.medium")
    let formatter = DateFormatter()
    formatter.locale = Locale(identifier: "en_US_POSIX")
    formatter.timeZone = TimeZone(identifier: "America/Chicago")
    formatter.dateFormat = "yyyy-MM-dd"
    let day = formatter.string(from: now)
    let damMoment = WidgetDamMoment(date: now.timeIntervalSince1970 * 1000,
      status: "Generating now", turbineCfs: 6600, observedAt: now.timeIntervalSince1970 * 1000,
      current: true, scheduleSummary: "Stops at 6 PM", scheduleCurrent: true, scheduleCheckedAt: nil,
      generationKind: "generating", scheduleDate: day, scheduleHour: 13)
    let schedule = WidgetDamScheduleDay(date: day, hours: (1...24).map {
      WidgetDamScheduleHour(hourEnding: $0, label: "Hour \($0)", megawatts: $0 == 1 ? nil : 100)
    })
    var packet = WidgetDamPacket(version: 1, id: "example", name: "Example", entries: [damMoment], scheduleDays: [schedule])
    precondition(packet.todaySchedule(at: now)?.hours[0].megawatts == nil)
    precondition(packet.todaySchedule(at: now)?.peak == 100)
    precondition(packet.todaySchedule(at: now.addingTimeInterval(86_400)) == nil)
    packet.entries[0].scheduleCurrent = false
    precondition(packet.todaySchedule(at: now) == nil)
    packet.entries[0].scheduleCurrent = true
    packet.scheduleDays?[0].hours[0].megawatts = -1
    precondition(packet.todaySchedule(at: now) == nil)
    // Existing v1 API packets and cache records still decode without new fields.
    let legacyJSON = """
      {"version":1,"id":"example","name":"Example","entries":[{"date":1,"status":"Older reading","turbineCfs":6600,"current":false,"scheduleSummary":"Check schedule","scheduleCurrent":false}]}
      """
    let legacy = try JSONDecoder().decode(WidgetDamPacket.self, from: Data(legacyJSON.utf8))
    precondition(legacy.scheduleDays == nil && legacy.entries[0].generationKind == nil)
    precondition(legacy.todaySchedule(at: now) == nil)
    let forecast = WidgetForecastCache(retrievedAt: now.timeIntervalSince1970 * 1000,
      response: WidgetForecastResponse(river: "current", location: "Akers", forecast: [
        WidgetForecastDay(date: formatter.string(from: now), tempHigh: 74, tempLow: 51, condition: "Clear", precipitation: 20)
      ]))
    precondition(forecast.today(at: now)?.tempHigh == 74)
    precondition(forecast.today(at: now.addingTimeInterval(10_800)) == nil)
    precondition(forecast.today(at: now.addingTimeInterval(86_400)) == nil)
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
    undated.undatedWarningUntil = ms + 86_400_000
    precondition(!undated.isCurrent(at: now.addingTimeInterval(900)))
    precondition(undated.warning(at: now.addingTimeInterval(86_399)) != nil)
    precondition(!undated.hasUnavailableUndatedWarning(at: now.addingTimeInterval(86_399)))
    precondition(undated.warning(at: now.addingTimeInterval(86_400)) == nil)
    precondition(undated.hasUnavailableUndatedWarning(at: now.addingTimeInterval(86_400)))
    precondition(undated.transitionDates.contains(ms + 86_400_000))
    // An explicit later NWS expiry must still win over an old undated warning.
    var mixed = undated
    var dated = warning
    dated.expiresAt = ms + 172_800_000
    mixed.warnings.append(dated)
    precondition(mixed.warning(at: now.addingTimeInterval(86_400))?.expiresAt == dated.expiresAt)
    precondition(mixed.transitionDates.contains(ms + 172_800_000))
    snapshot.floodAlerts = alerts
    var next = snapshot
    next.floodAlerts = nil
    let offline = next.preservingUnavailableAlerts(from: snapshot)
    precondition(offline.floodAlerts?.validUntil == alerts.validUntil)
    precondition(offline.observedAt == next.observedAt)
    next.floodAlerts = WidgetFloodAlerts(validUntil: ms + 900_000, warnings: [])
    precondition(next.preservingUnavailableAlerts(from: snapshot).floodAlerts!.warnings.isEmpty)
    snapshot.floodAlerts = undated
    next.floodAlerts = nil
    next.observedAt = ms + 90_000_000 // new gauge reading, NWS lookup failed
    let failed = next.preservingUnavailableAlerts(from: snapshot)
    let failedAgain = next.preservingUnavailableAlerts(from: failed)
    precondition(failedAgain.floodAlerts?.undatedWarningUntil == undated.undatedWarningUntil)
    precondition(failedAgain.floodAlerts?.warning(at: now.addingTimeInterval(90_000)) == nil)
    precondition(failedAgain.floodAlerts!.hasUnavailableUndatedWarning(at: now.addingTimeInterval(90_000)))
    next.floodAlerts = WidgetFloodAlerts(validUntil: ms + 91_000_000, warnings: [])
    let cleared = next.preservingUnavailableAlerts(from: failedAgain)
    precondition(!cleared.floodAlerts!.hasUnavailableUndatedWarning(at: now.addingTimeInterval(90_000)))

    // Old alert payloads also retire undated reminders without inventing an age.
    var oldAlertsJSON = try JSONSerialization.jsonObject(with: JSONEncoder().encode(undated)) as! [String: Any]
    oldAlertsJSON.removeValue(forKey: "undatedWarningUntil")
    let oldAlerts = try JSONDecoder().decode(WidgetFloodAlerts.self, from: JSONSerialization.data(withJSONObject: oldAlertsJSON))
    precondition(oldAlerts.warning(at: now.addingTimeInterval(900)) == nil)
    precondition(oldAlerts.hasUnavailableUndatedWarning(at: now.addingTimeInterval(900)))

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
    // Diagnostics must preserve the last success across a failure and never
    // keep retired stations indefinitely in the shared defaults.
    ConditionsWidgetDiagnostics.started("07014000", endpoint: .detail, defaults: defaults)
    ConditionsWidgetDiagnostics.succeeded("07014000", endpoint: .detail, observedAt: ms, defaults: defaults)
    ConditionsWidgetDiagnostics.started("07014000", endpoint: .detail, defaults: defaults)
    ConditionsWidgetDiagnostics.failed("07014000", endpoint: .detail, code: "timeout", defaults: defaults)
    let diagnostic = ConditionsWidgetDiagnostics.read("07014000", defaults: defaults)
    precondition(diagnostic.detail.succeededAt != nil)
    precondition(diagnostic.detail.observedAt == ms)
    precondition(diagnostic.detail.error == "timeout")
    let retired = "eddy.conditions.requests.v1.example.retired"
    var ancient = WidgetStationDiagnostics(siteId: "retired")
    ancient.detail.start(at: ms - 40 * 86_400_000)
    defaults.set(try JSONEncoder().encode(ancient), forKey: retired)
    ConditionsWidgetDiagnostics.pruneRecords(defaults: defaults, now: ms)
    precondition(defaults.data(forKey: retired) == nil)
    let current = "eddy.conditions.requests.v1.example.current"
    var recent = WidgetStationDiagnostics(siteId: "current")
    recent.detail.start(at: ms - 29 * 86_400_000)
    defaults.set(try JSONEncoder().encode(recent), forKey: current)
    ConditionsWidgetDiagnostics.pruneRecords(defaults: defaults, now: ms)
    precondition(defaults.data(forKey: current) != nil)
    print("Widget preview, freshness, warning fallback, old snapshots, diagnostics retention and retained station names verified.")
  }
}
