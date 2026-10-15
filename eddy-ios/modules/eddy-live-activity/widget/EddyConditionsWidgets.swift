import AppIntents
import SwiftUI
import WidgetKit

struct RiverGaugeEntity: AppEntity {
  static var typeDisplayRepresentation: TypeDisplayRepresentation = "Gauge station"
  static var defaultQuery = RiverGaugeQuery()
  var choice: WidgetGaugeChoice
  var id: String { choice.id }
  var displayRepresentation: DisplayRepresentation {
    DisplayRepresentation(title: "\(choice.riverName)", subtitle: "\(choice.stationName)")
  }
}
struct RiverGaugeQuery: EntityStringQuery {
  func entities(for identifiers: [String]) async throws -> [RiverGaugeEntity] {
    let catalog = ConditionsWidgetStore.configuration().catalog
    return identifiers.compactMap { id in
      if let choice = catalog.first(where: { $0.id == id }) { return RiverGaugeEntity(choice: choice) }
      // A national gauge can be unstarred after a small widget selected it.
      // Resolve its stable ID instead of silently switching to another river.
      let parts = id.split(separator: "|", maxSplits: 1, omittingEmptySubsequences: false)
      guard parts.count == 2, !parts[0].isEmpty else { return nil }
      let siteId = String(parts[0])
      return RiverGaugeEntity(choice: WidgetGaugeChoice(id: id, siteId: siteId, gaugeId: "", riverId: nil,
        riverSlug: parts[1].isEmpty ? nil : String(parts[1]), riverName: "Gauge station", stationName: siteId,
        primaryForRiver: false, defaultForGauge: true))
    }
  }
  func entities(matching string: String) async throws -> [RiverGaugeEntity] {
    try await suggestedEntities().filter {
      "\($0.choice.riverName) \($0.choice.stationName) \($0.choice.siteId)".localizedCaseInsensitiveContains(string)
    }
  }
  func suggestedEntities() async throws -> [RiverGaugeEntity] {
    let config = ConditionsWidgetStore.configuration()
    let ids = Set(config.favorites.map(\.id))
    return (config.favorites + config.catalog.filter { !ids.contains($0.id) }).map { RiverGaugeEntity(choice: $0) }
  }
  func defaultResult() async -> RiverGaugeEntity? {
    ConditionsWidgetStore.configuration().favorites.first.map { RiverGaugeEntity(choice: $0) }
  }
}
struct RiverGaugeIntent: WidgetConfigurationIntent {
  static var title: LocalizedStringResource = "River level"
  static var description = IntentDescription("Choose the river and station to keep on your Home Screen.")
  @Parameter(title: "Gauge station") var gauge: RiverGaugeEntity?
}

struct ConditionsEntry: TimelineEntry {
  var date: Date
  var choices: [WidgetGaugeChoice]
  var stations: [String: WidgetStationData]

  static func cached(_ choices: [WidgetGaugeChoice]) -> Self {
    var stations: [String: WidgetStationData] = [:]
    for choice in choices { stations[choice.siteId] = ConditionsWidgetStore.cached(choice.siteId) }
    return Self(date: Date(), choices: choices, stations: stations)
  }
  static func load(_ choices: [WidgetGaugeChoice]) async -> Self {
    let ids = Set(choices.map(\.siteId))
    let stations = await withTaskGroup(of: (String, WidgetStationData).self) { group in
      for id in ids { group.addTask { (id, await ConditionsWidgetLoader.load(siteId: id)) } }
      var loaded: [String: WidgetStationData] = [:]
      for await (id, data) in group { loaded[id] = data }
      return loaded
    }
    return Self(date: Date(), choices: choices, stations: stations)
  }
  var timeline: Timeline<Self> {
    let now = date.timeIntervalSince1970 * 1000
    let expirations = stations.values.flatMap { data in
      [data.snapshot?.validUntil, data.history?.cfs.trendValidUntil, data.history?.ft.trendValidUntil].compactMap { $0 }
    }
    // Local transitions remove stale colors/trends even if the next network
    // refresh fails. Fifteen minutes is a request; iOS controls the budget.
    let future = Set(expirations.filter { $0 > now }).sorted().map {
      Self(date: Date(timeIntervalSince1970: $0 / 1000 + 1), choices: choices, stations: stations)
    }
    return Timeline(entries: [self] + future, policy: .after(date.addingTimeInterval(900)))
  }
}

struct RiverLevelProvider: AppIntentTimelineProvider {
  private func choices(_ intent: RiverGaugeIntent) -> [WidgetGaugeChoice] {
    if let selected = intent.gauge?.choice { return [selected] }
    return Array(ConditionsWidgetStore.configuration().favorites.prefix(1))
  }
  func placeholder(in context: Context) -> ConditionsEntry { .cached([]) }
  func snapshot(for configuration: RiverGaugeIntent, in context: Context) async -> ConditionsEntry {
    .cached(choices(configuration))
  }
  func timeline(for configuration: RiverGaugeIntent, in context: Context) async -> Timeline<ConditionsEntry> {
    await ConditionsEntry.load(choices(configuration)).timeline
  }
}
struct FavoritesProvider: TimelineProvider {
  func placeholder(in context: Context) -> ConditionsEntry { .cached([]) }
  func getSnapshot(in context: Context, completion: @escaping (ConditionsEntry) -> Void) {
    completion(.cached(Array(ConditionsWidgetStore.configuration().favorites.prefix(3))))
  }
  func getTimeline(in context: Context, completion: @escaping (Timeline<ConditionsEntry>) -> Void) {
    Task {
      let choices = Array(ConditionsWidgetStore.configuration().favorites.prefix(3))
      let entry = await ConditionsEntry.load(choices)
      // An unstar/account deletion while requests were in flight wins over
      // an older timeline completion.
      let latest = Array(ConditionsWidgetStore.configuration().favorites.prefix(3))
      completion((latest == choices ? entry : ConditionsEntry.cached(latest)).timeline)
    }
  }
}

struct EddyRiverLevelWidget: Widget {
  var body: some WidgetConfiguration {
    AppIntentConfiguration(kind: ConditionsWidgetStore.riverKind, intent: RiverGaugeIntent.self, provider: RiverLevelProvider()) { entry in
      RiverLevelCard(entry: entry)
        .containerBackground(for: .widget) { WidgetCanvas() }
    }
    .configurationDisplayName("River level")
    .description("A gauge reading, its condition and the last 24 hours. Open Eddy once, then edit to choose a station.")
    .supportedFamilies([.systemSmall])
  }
}
struct EddyFavoritesWidget: Widget {
  var body: some WidgetConfiguration {
    StaticConfiguration(kind: ConditionsWidgetStore.favoritesKind, provider: FavoritesProvider()) { entry in
      FavoritesCard(entry: entry)
        .containerBackground(for: .widget) { WidgetCanvas() }
    }
    .configurationDisplayName("Your rivers")
    .description("Readings for your first three starred rivers or gauges in Eddy. Tap a row for the station.")
    .supportedFamilies([.systemMedium])
  }
}

private struct WidgetCanvas: View {
  @Environment(\.colorScheme) private var scheme
  var body: some View { Color(hex: scheme == .dark ? "#1A1814" : "#FAF8F4") }
}
private extension Color {
  init(hex: String) {
    let value = UInt64(hex.trimmingCharacters(in: CharacterSet(charactersIn: "#")), radix: 16) ?? 0x6B6459
    self.init(red: Double((value >> 16) & 255) / 255, green: Double((value >> 8) & 255) / 255, blue: Double(value & 255) / 255)
  }
}
private struct GaugeDisplay {
  var choice: WidgetGaugeChoice
  var data: WidgetStationData?
  var date: Date
  var snapshot: WidgetGaugeSnapshot? { data?.snapshot }
  var current: Bool { snapshot?.isCurrent(at: date) == true }
  var condition: WidgetCondition? { snapshot?.conditions.first { $0.riverSlug == choice.riverSlug } }
  var rated: Bool { current && condition != nil && condition?.code != "unknown" }
  // The large number uses the ladder's unit; missing stage must not look like
  // discharge graded against a feet threshold. Unrated stations prefer cfs.
  var unit: String { condition?.unit ?? (snapshot?.dischargeCfs != nil ? "cfs" : "ft") }
  var value: Double? { unit == "cfs" ? snapshot?.dischargeCfs : snapshot?.heightFt }
  var reading: String { value.map { format($0, unit: unit) } ?? "—" }
  var secondary: String? {
    let value = unit == "cfs" ? snapshot?.heightFt : snapshot?.dischargeCfs
    let otherUnit = unit == "cfs" ? "ft" : "cfs"
    return value.map { "\(format($0, unit: otherUnit)) \(otherUnit)" }
  }
  var status: String {
    guard let snapshot else { return "No reading" }
    if snapshot.suspect { return "Flagged reading" }
    if snapshot.validUntil == nil { return "Check in Eddy" }
    if !current { return "Older reading" }
    return rated ? condition!.label : "Not rated"
  }
  var series: WidgetSeries? {
    let series = unit == "cfs" ? data?.history?.cfs : data?.history?.ft
    // A fresh current reading does not make separately cached history fresh.
    guard let series, let until = series.trendValidUntil,
      until > date.timeIntervalSince1970 * 1000 else { return nil }
    return series
  }
  var trend: String? {
    guard current, let series, let until = series.trendValidUntil,
      until > date.timeIntervalSince1970 * 1000 else { return nil }
    return series.trend
  }
  func color(dark: Bool) -> Color {
    guard rated, let condition else { return .secondary }
    return Color(hex: dark ? condition.chipBorder : condition.ink)
  }
  private func format(_ value: Double, unit: String) -> String {
    value.formatted(.number.precision(.fractionLength(unit == "ft" ? 1 : 0)))
  }
}

private struct RiverLevelCard: View {
  let entry: ConditionsEntry
  @Environment(\.colorScheme) private var scheme
  var body: some View {
    if let choice = entry.choices.first {
      let display = GaugeDisplay(choice: choice, data: entry.stations[choice.siteId], date: entry.date)
      VStack(alignment: .leading, spacing: 3) {
        HStack(alignment: .top, spacing: 2) {
          VStack(alignment: .leading, spacing: 1) {
            Text(choice.riverName).font(.system(size: 13, weight: .semibold, design: .rounded)).lineLimit(1).minimumScaleFactor(0.8)
            Text(choice.stationName).font(.system(size: 10)).foregroundStyle(.secondary).lineLimit(1)
          }
          Spacer(minLength: 0)
          Image("GaugeOtter").resizable().scaledToFit().frame(width: 28, height: 28).accessibilityHidden(true)
        }
        HStack(alignment: .firstTextBaseline, spacing: 4) {
          Text(display.reading).font(.system(size: 28, weight: .semibold, design: .rounded)).monospacedDigit().minimumScaleFactor(0.65)
          Text(display.unit).font(.caption).foregroundStyle(.secondary)
        }.lineLimit(1)
        HStack(spacing: 4) {
          StatusPill(display: display)
          Spacer(minLength: 0)
          if let secondary = display.secondary {
            Text(secondary).font(.system(size: 10)).monospacedDigit().foregroundStyle(.secondary).lineLimit(1).minimumScaleFactor(0.7)
          }
        }
        Spacer(minLength: 0)
        if display.current, let series = display.series, series.points.count > 1 {
          WidgetSparkline(series: series).stroke(display.color(dark: scheme == .dark), style: StrokeStyle(lineWidth: 2, lineCap: .round, lineJoin: .round))
            .frame(height: 15).accessibilityLabel("Observed gauge history, last 24 hours")
        }
        HStack(spacing: 3) {
          if let trend = display.trend {
            Text(trend).font(.system(size: 9)).foregroundStyle(.secondary).lineLimit(1).minimumScaleFactor(0.8)
          }
          Spacer(minLength: 0)
          ObservationTime(snapshot: display.snapshot, compact: true)
        }
      }
      .widgetURL(choice.url)
      .accessibilityElement(children: .combine)
    } else {
      WidgetEmptyState(title: "Your river, at a glance", detail: "Open Eddy, then edit this widget to choose a gauge.")
        .widgetURL(URL(string: "eddy://favorites"))
    }
  }
}

private struct FavoritesCard: View {
  let entry: ConditionsEntry
  @Environment(\.colorScheme) private var scheme
  var body: some View {
    VStack(alignment: .leading, spacing: 6) {
      HStack {
        Text("Your rivers").font(.system(.subheadline, design: .rounded).weight(.semibold))
        Spacer()
        Text("EDDY").font(.system(size: 9, weight: .bold, design: .rounded)).tracking(1.5).foregroundStyle(.secondary)
        Image("GaugeOtter").resizable().scaledToFit().frame(width: 23, height: 23).accessibilityHidden(true)
      }
      if entry.choices.isEmpty {
        WidgetEmptyState(title: "Keep your rivers close", detail: "Star rivers or gauges in Eddy to see their readings here.")
      } else {
        ForEach(entry.choices) { choice in
          let display = GaugeDisplay(choice: choice, data: entry.stations[choice.siteId], date: entry.date)
          Link(destination: choice.url) {
            HStack(spacing: 8) {
              VStack(alignment: .leading, spacing: 1) {
                Text(choice.riverName).font(.system(size: 12, weight: .semibold, design: .rounded)).lineLimit(1)
                Text(choice.stationName).font(.system(size: 9)).foregroundStyle(.secondary).lineLimit(1)
              }.frame(maxWidth: .infinity, alignment: .leading)
              if display.current, let series = display.series, series.points.count > 1 {
                WidgetSparkline(series: series).stroke(display.color(dark: scheme == .dark), style: StrokeStyle(lineWidth: 1.5, lineCap: .round, lineJoin: .round))
                  .frame(width: 42, height: 18).accessibilityHidden(true)
              }
              VStack(alignment: .trailing, spacing: 1) {
                Text("\(display.reading) \(display.unit)").font(.system(size: 12, weight: .semibold, design: .rounded)).monospacedDigit().lineLimit(1)
                HStack(spacing: 3) {
                  Text(display.status).font(.system(size: 9)).foregroundStyle(display.color(dark: scheme == .dark)).lineLimit(1)
                  ObservationTime(snapshot: display.snapshot, compact: true)
                }
              }
            }
            .accessibilityElement(children: .combine)
          }.buttonStyle(.plain)
        }
        Spacer(minLength: 0)
      }
    }
    .widgetURL(URL(string: "eddy://favorites"))
  }
}

private struct StatusPill: View {
  let display: GaugeDisplay
  @Environment(\.colorScheme) private var scheme
  var body: some View {
    Text(display.status).font(.system(size: 10, weight: .semibold)).lineLimit(1).minimumScaleFactor(0.8)
      .foregroundStyle(display.color(dark: scheme == .dark))
      .padding(.horizontal, 6).padding(.vertical, 3)
      .background(display.color(dark: scheme == .dark).opacity(0.12), in: Capsule())
  }
}
private struct ObservationTime: View {
  let snapshot: WidgetGaugeSnapshot?
  var compact = false
  var body: some View {
    HStack(spacing: 2) {
      if let observed = snapshot?.observedDate {
        if !compact { Image(systemName: "clock") }
        Text(observed, style: .relative).monospacedDigit()
        Text("ago")
      } else { Text("Time unavailable") }
    }.font(.system(size: compact ? 8 : 10)).foregroundStyle(.secondary).lineLimit(1).minimumScaleFactor(0.8)
  }
}
private struct WidgetEmptyState: View {
  var title: String
  var detail: String
  var body: some View {
    VStack(alignment: .leading, spacing: 8) {
      Image(systemName: "water.waves").font(.title3).foregroundStyle(.secondary)
      Text(title).font(.system(.subheadline, design: .rounded).weight(.semibold))
      Text(detail).font(.caption2).foregroundStyle(.secondary)
    }.frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .leading)
  }
}
private struct WidgetSparkline: Shape {
  var series: WidgetSeries
  func path(in rect: CGRect) -> Path {
    let values = series.points.map(\.v)
    guard let low = values.min(), let high = values.max(), series.to > series.from else { return Path() }
    let span = max(high - low, 0.01)
    var path = Path()
    for (index, point) in series.points.enumerated() {
      let x = rect.minX + (point.t - series.from) / (series.to - series.from) * rect.width
      let y = high == low ? rect.midY : rect.maxY - 1 - (point.v - low) / span * max(0, rect.height - 2)
      let position = CGPoint(x: x, y: y)
      if index == 0 || point.breakBefore { path.move(to: position) } else { path.addLine(to: position) }
    }
    return path
  }
}
