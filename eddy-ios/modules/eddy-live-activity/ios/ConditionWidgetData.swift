import Foundation

struct WidgetGaugeChoice: Codable, Hashable, Identifiable {
  var id: String
  var siteId: String
  var gaugeId: String
  var riverId: String?
  var riverSlug: String?
  var riverName: String
  var stationName: String
  var primaryForRiver: Bool
  var defaultForGauge: Bool

  var url: URL {
    URL(string: "eddy://gauge")!.appendingPathComponent(siteId)
  }
}

struct ConditionsWidgetConfiguration: Codable, Equatable {
  var version: Int
  var catalog: [WidgetGaugeChoice]
  var favorites: [WidgetGaugeChoice]
  static let empty = Self(version: 1, catalog: [], favorites: [])
}

struct WidgetCondition: Codable {
  var riverSlug: String?
  var unit: String
  var code: String
  var label: String
  var solid: String
  var ink: String
  var chipBorder: String
}

struct WidgetGaugeSnapshot: Codable {
  var version: Int
  var siteId: String
  var observedAt: Double?
  var validUntil: Double?
  var heightFt: Double?
  var dischargeCfs: Double?
  var suspect: Bool
  var conditions: [WidgetCondition]

  var observedDate: Date? { observedAt.map { Date(timeIntervalSince1970: $0 / 1000) } }
  func isCurrent(at date: Date) -> Bool {
    guard let observedAt, let validUntil else { return false }
    let now = date.timeIntervalSince1970 * 1000
    return version == 1 && !suspect && observedAt <= now + 300_000 && validUntil > now
  }
}

struct WidgetSeries: Codable {
  struct Point: Codable { var t: Double; var v: Double; var breakBefore: Bool }
  var points: [Point]
  var from: Double
  var to: Double
  var observedAt: Double?
  var trend: String?
  var direction: String?
  var trendValidUntil: Double?
}
struct WidgetHistory: Codable {
  var cfs: WidgetSeries
  var ft: WidgetSeries
}

struct WidgetStationData: Codable {
  var snapshot: WidgetGaugeSnapshot?
  var history: WidgetHistory?
}

// Only public station metadata/readings and local favorites cross this group.
// Account tokens, float routes and location never enter the widget container.
enum ConditionsWidgetStore {
  static let riverKind = "EddyRiverLevel"
  static let favoritesKind = "EddyFavorites"
  private static let configurationKey = "eddy.conditions.configuration.v1"
  private static var defaults: UserDefaults? {
    guard let group = Bundle.main.object(forInfoDictionaryKey: "EddyWidgetAppGroup") as? String else { return nil }
    return UserDefaults(suiteName: group)
  }
  static var apiBase: URL? {
    guard let value = Bundle.main.object(forInfoDictionaryKey: "EddyWidgetAPIBaseURL") as? String,
      let url = URL(string: value), url.scheme == "https" else { return nil }
    return url
  }
  static func configuration() -> ConditionsWidgetConfiguration {
    guard let data = defaults?.data(forKey: configurationKey),
      let value = try? JSONDecoder().decode(ConditionsWidgetConfiguration.self, from: data), value.version == 1 else { return .empty }
    return value
  }
  static func configurationJSON() -> String? {
    guard let data = try? JSONEncoder().encode(configuration()) else { return nil }
    return String(data: data, encoding: .utf8)
  }
  static func setConfiguration(_ json: String) throws -> Bool {
    let data = Data(json.utf8)
    guard data.count < 500_000, let defaults else { return false }
    let value = try JSONDecoder().decode(ConditionsWidgetConfiguration.self, from: data)
    guard value.version == 1, value.favorites.count <= 3, value.catalog.count <= 1000,
      value != configuration() else { return false }
    defaults.set(try JSONEncoder().encode(value), forKey: configurationKey)
    return true
  }
  private static func cacheKey(_ siteId: String) -> String {
    "eddy.conditions.reading.v1.\(apiBase?.absoluteString ?? "").\(siteId)"
  }
  static func cached(_ siteId: String) -> WidgetStationData {
    guard let data = defaults?.data(forKey: cacheKey(siteId)),
      let value = try? JSONDecoder().decode(WidgetStationData.self, from: data) else {
      return WidgetStationData(snapshot: nil, history: nil)
    }
    return value
  }
  static func save(_ value: WidgetStationData, siteId: String) {
    if let data = try? JSONEncoder().encode(value) { defaults?.set(data, forKey: cacheKey(siteId)) }
  }
}

private struct GaugeEnvelope: Decodable {
  struct RawGauge: Decodable {
    var siteId: String
    var readingTimestamp: String?
    var gaugeHeightFt: Double?
    var dischargeCfs: Double?
    var readingSuspect: Bool
  }
  var gauge: RawGauge
  var widget: WidgetGaugeSnapshot?
  var snapshot: WidgetGaugeSnapshot {
    if let widget, widget.version == 1, widget.siteId == gauge.siteId { return widget }
    // Web and native deploy independently. Old API responses retain numbers
    // and observation time, with no invented condition or copied Swift ladder.
    let formatter = ISO8601DateFormatter()
    formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
    let timestamp = gauge.readingTimestamp ?? ""
    let observed = formatter.date(from: timestamp) ?? ISO8601DateFormatter().date(from: timestamp)
    return WidgetGaugeSnapshot(version: 1, siteId: gauge.siteId,
      observedAt: observed.map { $0.timeIntervalSince1970 * 1000 }, validUntil: nil,
      heightFt: gauge.gaugeHeightFt, dischargeCfs: gauge.dischargeCfs,
      suspect: gauge.readingSuspect, conditions: [])
  }
}
private struct HistoryEnvelope: Decodable { var widgetSeries: WidgetHistory? }
private enum WidgetRequestError: Error { case unavailable, removed }

enum ConditionsWidgetLoader {
  private static func request<T: Decodable>(_ url: URL, as type: T.Type) async throws -> T {
    var request = URLRequest(url: url)
    request.timeoutInterval = 8
    // Public, credential-free API. Do not inherit a web session's cookies.
    request.httpShouldHandleCookies = false
    let (data, response) = try await URLSession.shared.data(for: request)
    guard let response = response as? HTTPURLResponse else { throw WidgetRequestError.unavailable }
    if response.statusCode == 404 { throw WidgetRequestError.removed }
    guard response.statusCode == 200, data.count < 2_000_000 else { throw WidgetRequestError.unavailable }
    return try JSONDecoder().decode(T.self, from: data)
  }
  static func load(siteId: String) async -> WidgetStationData {
    var value = ConditionsWidgetStore.cached(siteId)
    guard let base = ConditionsWidgetStore.apiBase else { return value }
    let gaugeURL = base.appendingPathComponent("api/gauges").appendingPathComponent(siteId)
    var components = URLComponents(url: gaugeURL.appendingPathComponent("history"), resolvingAgainstBaseURL: false)!
    components.queryItems = [URLQueryItem(name: "days", value: "1"), URLQueryItem(name: "widget", value: "1")]
    // Both requests are bounded; a failed history request does not discard a
    // successful current reading (or renew the date on the cached history).
    async let detail = request(gaugeURL, as: GaugeEnvelope.self)
    async let history = request(components.url!, as: HistoryEnvelope.self)
    do {
      let envelope = try await detail
      guard envelope.gauge.siteId == siteId else { return value }
      value.snapshot = envelope.snapshot
    } catch WidgetRequestError.removed {
      value = WidgetStationData(snapshot: nil, history: nil)
      ConditionsWidgetStore.save(value, siteId: siteId)
      return value
    } catch { /* Original observation dates survive an offline refresh. */ }
    if let envelope = try? await history { value.history = envelope.widgetSeries }
    ConditionsWidgetStore.save(value, siteId: siteId)
    return value
  }
}
