import Foundation

func widgetFavoriteChoices(selected: [WidgetGaugeChoice?], favorites: [WidgetGaugeChoice]) -> [WidgetGaugeChoice] {
  // Reserve explicit picks before filling empty slots, so an automatic first
  // row cannot swallow a configured second row. Duplicate picks render once.
  let reserved = Set(selected.compactMap { $0?.id })
  var automatic = favorites.filter { !reserved.contains($0.id) }.makeIterator()
  var seen = Set<String>()
  return selected.prefix(3).compactMap { picked in
    guard let choice = picked ?? automatic.next(), seen.insert(choice.id).inserted else { return nil }
    return choice
  }
}
func widgetShortTrend(_ trend: String) -> String {
  switch trend.lowercased() {
  case "holding steady": return "Steady"
  case "rising slowly": return "Slow rise"
  case "rising fast": return "Fast rise"
  case "falling slowly": return "Slow fall"
  case "falling fast": return "Fast fall"
  default: return trend
  }
}
func widgetObservationStamp(_ observed: Date, now: Date) -> String {
  if Calendar.current.isDate(observed, inSameDayAs: now) {
    return observed.formatted(date: .omitted, time: .shortened)
  }
  return observed.formatted(.dateTime.month(.abbreviated).day().year())
}

struct WidgetDamChoice: Codable, Hashable, Identifiable {
  var id: String
  var name: String
  var state: String
  var url: URL { URL(string: "eddy://dam/\(id)")! }
  static var catalog: [Self] {
    guard let url = Bundle.main.url(forResource: "DamWidgetCatalog", withExtension: "json"),
      let data = try? Data(contentsOf: url), let values = try? JSONDecoder().decode([Self].self, from: data) else { return [] }
    return values
  }
}
struct WidgetDamMoment: Codable {
  var date: Double
  var status: String
  var turbineCfs: Double?
  var observedAt: Double?
  var current: Bool
  var scheduleSummary: String
  var scheduleCurrent: Bool
  var scheduleCheckedAt: Double?
}
struct WidgetDamPacket: Codable {
  var version: Int
  var id: String
  var name: String
  var entries: [WidgetDamMoment]
  func moment(at date: Date) -> WidgetDamMoment? {
    entries.last { $0.date <= date.timeIntervalSince1970 * 1000 }
  }
  func valid(for id: String) -> Bool {
    version == 1 && self.id == id && !entries.isEmpty && entries.count <= 30
      && entries.allSatisfy { $0.date.isFinite }
      && zip(entries, entries.dropFirst()).allSatisfy { pair in pair.0.date < pair.1.date }
      && entries.last?.current == false && entries.last?.scheduleCurrent == false
  }
}
struct WidgetForecastDay: Codable {
  var date: String
  var tempHigh: Double
  var tempLow: Double
  var condition: String
  var precipitation: Double
}
struct WidgetForecastResponse: Codable {
  var river: String
  var location: String
  var forecast: [WidgetForecastDay]
}
struct WidgetForecastCache: Codable {
  var retrievedAt: Double
  var response: WidgetForecastResponse
  var expiresAt: Date { Date(timeIntervalSince1970: retrievedAt / 1000 + 10_800) }
  func today(at date: Date) -> WidgetForecastDay? {
    guard date < expiresAt, date.timeIntervalSince1970 * 1000 >= retrievedAt - 300_000 else { return nil }
    let formatter = DateFormatter()
    formatter.locale = Locale(identifier: "en_US_POSIX")
    formatter.timeZone = TimeZone(identifier: "America/Chicago")
    formatter.dateFormat = "yyyy-MM-dd"
    return response.forecast.first { $0.date == formatter.string(from: date)
      && $0.tempHigh.isFinite && $0.tempLow.isFinite && (0...100).contains($0.precipitation) }
  }
}
// Independent cache keys include the API environment. Failed requests never
// stamp old forecasts with a new retrieval time. 404 removes retired data.
enum SupplementaryWidgetStore {
  private static func key(_ path: String) -> String {
    "eddy.widgets.extra.v1.\(ConditionsWidgetStore.apiBase?.absoluteString ?? "").\(path)"
  }
  static func cached<T: Decodable>(_ path: String, as type: T.Type) -> T? {
    guard let data = ConditionsWidgetStore.sharedDefaults?.data(forKey: key(path)) else { return nil }
    return try? JSONDecoder().decode(type, from: data)
  }
  private static func save<T: Encodable>(_ value: T, path: String) {
    guard let data = try? JSONEncoder().encode(value) else { return }
    ConditionsWidgetStore.sharedDefaults?.set(data, forKey: key(path))
  }
  static func dam(_ id: String) async -> WidgetDamPacket? {
    let path = "api/dams/\(id)"
    let previous = cached(path, as: WidgetDamPacket.self)
    guard let base = ConditionsWidgetStore.apiBase,
      var url = URLComponents(url: base.appendingPathComponent(path), resolvingAgainstBaseURL: false) else { return previous }
    url.queryItems = [URLQueryItem(name: "widget", value: "1")]
    do {
      let packet = try await ConditionsWidgetLoader.request(url.url!, as: WidgetDamPacket.self, timeout: 15)
      guard packet.valid(for: id) else { return previous }
      save(packet, path: path)
      return packet
    } catch WidgetRequestError.removed {
      ConditionsWidgetStore.sharedDefaults?.removeObject(forKey: key(path))
      return nil
    } catch { return previous }
  }
  static func forecast(_ slug: String) async -> WidgetForecastCache? {
    let path = "api/weather/\(slug)/forecast"
    let previous = cached(path, as: WidgetForecastCache.self)
    guard let base = ConditionsWidgetStore.apiBase else { return previous }
    do {
      let response = try await ConditionsWidgetLoader.request(base.appendingPathComponent(path), as: WidgetForecastResponse.self, timeout: 12)
      guard response.river == slug else { return previous }
      let value = WidgetForecastCache(retrievedAt: Date().timeIntervalSince1970 * 1000, response: response)
      save(value, path: path)
      return value
    } catch WidgetRequestError.removed {
      ConditionsWidgetStore.sharedDefaults?.removeObject(forKey: key(path))
      return nil
    } catch { return previous }
  }
}
