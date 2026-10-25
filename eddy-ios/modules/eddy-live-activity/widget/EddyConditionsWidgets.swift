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
      if let choice = catalog.first(where: { $0.id == id }) ?? ConditionsWidgetStore.rememberedChoice(id) {
        ConditionsWidgetStore.remember(choice)
        return RiverGaugeEntity(choice: choice)
      }
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
  // Entry-only presentation context; never serialized with cached readings.
  var isPreview = false

  static func preview() -> Self {
    let date = Date()
    guard let url = Bundle.main.url(forResource: "ConditionsPreview", withExtension: "json"),
      let data = try? Data(contentsOf: url),
      let example = try? JSONDecoder().decode(ConditionsWidgetPreview.self, from: data) else {
      return Self(date: date, choices: [], stations: [:], isPreview: true)
    }
    let preview = example.rebased(to: date)
    return Self(date: date, choices: preview.choices, stations: preview.stations, isPreview: true)
  }
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
    var expirations = stations.values.flatMap { data in
      [data.snapshot?.validUntil, data.history?.cfs.trendValidUntil, data.history?.ft.trendValidUntil].compactMap { $0 }
        + (data.snapshot?.floodAlerts?.transitionDates ?? [])
    }
    if let midnight = Calendar.current.date(byAdding: .day, value: 1, to: Calendar.current.startOfDay(for: date)) {
      expirations.append(midnight.timeIntervalSince1970 * 1000)
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
    if let selected = intent.gauge?.choice {
      ConditionsWidgetStore.remember(selected)
      return [selected]
    }
    return Array(ConditionsWidgetStore.configuration().favorites.prefix(1))
  }
  func placeholder(in context: Context) -> ConditionsEntry { .preview() }
  func snapshot(for configuration: RiverGaugeIntent, in context: Context) async -> ConditionsEntry {
    context.isPreview ? .preview() : .cached(choices(configuration))
  }
  func timeline(for configuration: RiverGaugeIntent, in context: Context) async -> Timeline<ConditionsEntry> {
    await ConditionsEntry.load(choices(configuration)).timeline
  }
}
struct FavoritesIntent: WidgetConfigurationIntent {
  static var title: LocalizedStringResource = "Your rivers"
  static var description = IntentDescription("Choose up to three stations. Empty slots follow your Favorites in Eddy.")
  @Parameter(title: "First station") var first: RiverGaugeEntity?
  @Parameter(title: "Second station") var second: RiverGaugeEntity?
  @Parameter(title: "Third station") var third: RiverGaugeEntity?
}
struct FavoritesProvider: AppIntentTimelineProvider {
  private func choices(_ intent: FavoritesIntent) -> [WidgetGaugeChoice] {
    let selected = [intent.first?.choice, intent.second?.choice, intent.third?.choice]
    selected.compactMap { $0 }.forEach { ConditionsWidgetStore.remember($0) }
    return widgetFavoriteChoices(selected: selected, favorites: ConditionsWidgetStore.configuration().favorites)
  }
  func placeholder(in context: Context) -> ConditionsEntry { .preview() }
  func snapshot(for configuration: FavoritesIntent, in context: Context) async -> ConditionsEntry {
    context.isPreview ? .preview() : .cached(choices(configuration))
  }
  func timeline(for configuration: FavoritesIntent, in context: Context) async -> Timeline<ConditionsEntry> {
    let selected = choices(configuration)
    let entry = await ConditionsEntry.load(selected)
    let latest = choices(configuration)
    return (latest == selected ? entry : ConditionsEntry.cached(latest)).timeline
  }
}

struct EddyRiverLevelWidget: Widget {
  var body: some WidgetConfiguration {
    AppIntentConfiguration(kind: ConditionsWidgetStore.riverKind, intent: RiverGaugeIntent.self, provider: RiverLevelProvider()) { entry in
      RiverLevelWidgetView(entry: entry)
        .dynamicTypeSize(...DynamicTypeSize.xxLarge)
        .containerBackground(for: .widget) { WidgetCanvas() }
    }
    .configurationDisplayName("River level")
    .description("A gauge reading, its condition and the last 24 hours. Open Eddy once, then edit to choose a station.")
    .supportedFamilies([.systemSmall, .accessoryRectangular])
  }
}

private struct RiverLevelWidgetView: View {
  let entry: ConditionsEntry
  @Environment(\.widgetFamily) private var family
  var body: some View {
    if family == .accessoryRectangular {
      LockScreenGauge(entry: entry)
    } else {
      RiverLevelCard(entry: entry)
    }
  }
}

private struct LockScreenGauge: View {
  let entry: ConditionsEntry
  var body: some View {
    if let choice = entry.choices.first {
      let display = GaugeDisplay(choice: choice, data: entry.stations[choice.siteId], date: entry.date)
      VStack(alignment: .leading, spacing: 1) {
        Text(choice.stationName).font(.headline).lineLimit(1)
          .accessibilityLabel("\(choice.riverName), \(choice.stationName)")
        HStack(spacing: 4) {
          Text("\(display.reading) \(display.unit)").font(.title3.bold()).monospacedDigit().minimumScaleFactor(0.8).lineLimit(1)
          if display.current, let direction = display.series?.direction {
            Image(systemName: direction == "rising" ? "arrow.up" : direction == "falling" ? "arrow.down" : "arrow.right")
              .accessibilityLabel(display.trend ?? direction)
          }
        }
        HStack(spacing: 4) {
          if display.confirmedWarning != nil || display.hasAlert || display.alertsUnavailable {
            Text(display.status)
          } else if display.snapshot?.suspect == true {
            Text("Flagged")
          } else if !display.current, display.snapshot != nil {
            Text("Older")
          }
          if let observed = display.snapshot?.observedDate {
            HStack(spacing: 0) {
              Text(observed, style: .relative)
              Text(" ago")
            }
            .accessibilityElement(children: .ignore)
            .accessibilityLabel("Observed \(observed.formatted(date: .complete, time: .shortened))")
          } else {
            Text("No reading")
          }
        }.font(.caption2).lineLimit(1)
      }
      .widgetURL(choice.url)
      .accessibilityElement(children: .combine)
    } else {
      Text("Choose a gauge").font(.headline)
        .widgetURL(URL(string: "eddy://favorites"))
    }
  }
}
struct EddyFavoritesWidget: Widget {
  var body: some WidgetConfiguration {
    AppIntentConfiguration(kind: ConditionsWidgetStore.favoritesKind, intent: FavoritesIntent.self, provider: FavoritesProvider()) { entry in
      FavoritesCard(entry: entry)
        .dynamicTypeSize(...DynamicTypeSize.xxLarge)
        .containerBackground(for: .widget) { WidgetCanvas() }
    }
    .configurationDisplayName("Your rivers")
    .description("Choose three river gauges, or follow your Favorites in Eddy. Touch and hold to edit.")
    .supportedFamilies([.systemMedium])
  }
}

struct WidgetCanvas: View {
  @Environment(\.colorScheme) private var scheme
  var body: some View { Color(hex: scheme == .dark ? "#1A1814" : "#FAF8F4") }
}
// Native counterparts of the existing iOS palette. Condition colors continue
// to come exclusively from the shared API snapshot, not these brand accents.
enum WidgetBrand {
  static func water(dark: Bool) -> Color { Color(hex: dark ? "#72B5C4" : "#1D525F") }
  static func panel(dark: Bool) -> Color { Color(hex: dark ? "#0F2D35" : "#EBF5F7") }
  static let coral = Color(hex: "#F07052")
}
struct WidgetArtwork: View {
  let name: String
  var body: some View {
    Image(name).resizable().widgetAccentedRenderingMode(.desaturated)
      .scaledToFit().accessibilityHidden(true)
  }
}
private extension Color {
  init(hex: String) {
    let value = UInt64(hex.trimmingCharacters(in: CharacterSet(charactersIn: "#")), radix: 16) ?? 0x6B6459
    self.init(red: Double((value >> 16) & 255) / 255, green: Double((value >> 8) & 255) / 255, blue: Double(value & 255) / 255)
  }
}
struct GaugeDisplay {
  var choice: WidgetGaugeChoice
  var data: WidgetStationData?
  var date: Date
  var snapshot: WidgetGaugeSnapshot? { data?.snapshot }
  var current: Bool { snapshot?.isCurrent(at: date) == true }
  var condition: WidgetCondition? { snapshot?.conditions.first { $0.riverSlug == choice.riverSlug } }
  var rated: Bool { current && condition != nil && condition?.code != "unknown" }
  var warning: WidgetFloodAlerts.Warning? { snapshot?.floodAlerts?.warning(at: date) }
  var confirmedWarning: WidgetFloodAlerts.Warning? {
    snapshot?.floodAlerts?.isCurrent(at: date) == true ? warning : nil
  }
  var hasAlert: Bool { warning != nil }
  var alertsUnavailable: Bool { snapshot?.floodAlerts?.hasUnavailableUndatedWarning(at: date) == true }
  // The large number uses the ladder's unit; missing stage must not look like
  // discharge graded against a feet threshold. Unrated stations prefer cfs.
  var unit: String { condition?.unit ?? (snapshot?.dischargeCfs != nil ? "cfs" : "ft") }
  var value: Double? { unit == "cfs" ? snapshot?.dischargeCfs : snapshot?.heightFt }
  var reading: String { value.map { format($0, unit: unit) } ?? "—" }
  var status: String {
    if let confirmedWarning { return confirmedWarning.label }
    if hasAlert { return "Check flood alerts" }
    if alertsUnavailable { return "Alerts unavailable" }
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
  func statusColor(dark: Bool) -> Color {
    if let confirmedWarning { return Color(hex: dark ? confirmedWarning.chipBorder : confirmedWarning.ink) }
    return hasAlert || alertsUnavailable ? .secondary : color(dark: dark)
  }
  private func format(_ value: Double, unit: String) -> String {
    value.formatted(.number.precision(.fractionLength(unit == "ft" ? 1 : 0)))
  }
}

private struct RiverLevelCard: View {
  let entry: ConditionsEntry
  @Environment(\.colorScheme) private var scheme
  @Environment(\.dynamicTypeSize) private var typeSize
  private func reading(_ display: GaugeDisplay, compact: Bool) -> some View {
    HStack(alignment: .firstTextBaseline, spacing: 5) {
      Text(display.reading).font(.system(compact ? .title : .largeTitle, design: .rounded).weight(.bold))
        .monospacedDigit().minimumScaleFactor(0.8)
        .foregroundStyle(display.current ? Color.primary : Color.secondary)
      Text(display.unit.uppercased()).font(.caption.weight(.semibold)).foregroundStyle(.secondary)
        .fixedSize()
    }.lineLimit(1)
  }
  var body: some View {
    if let choice = entry.choices.first {
      let display = GaugeDisplay(choice: choice, data: entry.stations[choice.siteId], date: entry.date)
      GeometryReader { geometry in
        let compact = typeSize > .large || geometry.size.height < 140 || display.hasAlert || display.alertsUnavailable
        VStack(alignment: .leading, spacing: 3) {
          HStack(alignment: .top, spacing: 2) {
            VStack(alignment: .leading, spacing: 1) {
              Text(choice.riverName).font(.system(.footnote, design: .rounded).weight(.semibold)).lineLimit(1)
              if choice.stationName != choice.riverName {
                Text(widgetStationLabel(choice)).font(.caption2).foregroundStyle(.secondary).lineLimit(1)
                  .accessibilityLabel(choice.stationName)
              }
            }
            Spacer(minLength: 0)
            if !compact { GaugeOtter().frame(width: 28, height: 28) }
          }
          reading(display, compact: compact)
          StatusPill(display: display)
          Spacer(minLength: 0)
          if !compact, display.current, let series = display.series, series.points.count > 1 {
            HStack(spacing: 4) {
              WidgetSparkline(series: series).stroke(display.color(dark: scheme == .dark), style: StrokeStyle(lineWidth: 2, lineCap: .round, lineJoin: .round))
                .frame(height: 18).accessibilityLabel("Observed gauge history, last 24 hours")
              if let trend = display.trend {
                Text(widgetShortTrend(trend)).font(.caption2).foregroundStyle(.secondary).lineLimit(1)
                  .fixedSize(horizontal: true, vertical: false).layoutPriority(1).accessibilityLabel(trend)
              }
            }
          }
          ObservationTime(snapshot: display.snapshot, isPreview: entry.isPreview, now: entry.date)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
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
  @Environment(\.dynamicTypeSize) private var typeSize
  var body: some View {
    GeometryReader { geometry in
      // Fixed-size widgets cannot grow vertically. At larger text sizes show
      // fewer, roomier rows and an explicit link to the remaining favorites.
      let expanded = typeSize > .large
      let limit = typeSize >= .xxLarge ? 1 : (expanded ? (geometry.size.height >= 138 ? 2 : 1) : 3)
      let visible = Array(entry.choices.prefix(limit))
      VStack(alignment: .leading, spacing: expanded ? 4 : 5) {
        HStack {
          Text("Your rivers").font(.system(.subheadline, design: .rounded).weight(.semibold))
          Spacer()
          Text("EDDY").font(.system(.caption2, design: .rounded).weight(.bold)).tracking(1.5).foregroundStyle(.secondary)
          GaugeOtter().frame(width: 23, height: 23)
        }
        if entry.choices.isEmpty {
          WidgetEmptyState(title: "Keep your rivers close", detail: "Star rivers or gauges in Eddy to see their readings here.")
        } else {
          ForEach(visible) { choice in
            let display = GaugeDisplay(choice: choice, data: entry.stations[choice.siteId], date: entry.date)
            Link(destination: choice.url) {
              FavoriteRow(display: display, expanded: expanded, isPreview: entry.isPreview)
            }.buttonStyle(.plain)
          }
          Spacer(minLength: 0)
          if entry.choices.count > visible.count {
            Link("\(entry.choices.count - visible.count) more in Eddy", destination: URL(string: "eddy://favorites")!)
              .font(.caption2).foregroundStyle(.secondary)
          }
        }
      }
      .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
    }
    .widgetURL(URL(string: "eddy://favorites"))
  }
}

private struct FavoriteRow: View {
  let display: GaugeDisplay
  let expanded: Bool
  let isPreview: Bool
  @Environment(\.colorScheme) private var scheme
  var body: some View {
    VStack(alignment: .leading, spacing: 1) {
      HStack(spacing: 6) {
        Text(display.choice.riverName).font(.system(.caption, design: .rounded).weight(.semibold)).lineLimit(1)
        Spacer(minLength: 0)
        if !expanded, display.current, let series = display.series, series.points.count > 1 {
          WidgetSparkline(series: series).stroke(display.color(dark: scheme == .dark), style: StrokeStyle(lineWidth: 1.5, lineCap: .round, lineJoin: .round))
            .frame(width: 32, height: 12).accessibilityHidden(true)
        }
        Text("\(display.reading) \(display.unit)").font(.system(.caption, design: .rounded).weight(.semibold))
          .monospacedDigit().lineLimit(1).fixedSize(horizontal: true, vertical: false)
          .foregroundStyle(display.current ? Color.primary : Color.secondary)
      }
      if expanded {
        Text(display.choice.stationName).font(.caption2).foregroundStyle(.secondary).lineLimit(1)
      }
      HStack(spacing: 4) {
        if !expanded {
          Text(display.choice.stationName).foregroundStyle(.secondary).lineLimit(1)
        }
        Spacer(minLength: 0)
        StatusText(display: display).foregroundStyle(display.statusColor(dark: scheme == .dark))
          .fixedSize(horizontal: true, vertical: false).layoutPriority(1)
        ObservationTime(snapshot: display.snapshot, isPreview: isPreview, now: display.date).layoutPriority(2)
      }.font(.caption2)
    }.accessibilityElement(children: .combine)
  }
}
struct GaugeOtter: View {
  var body: some View {
    WidgetArtwork(name: "GaugeOtter")
  }
}
private struct StatusText: View {
  let display: GaugeDisplay
  var body: some View {
    HStack(spacing: 3) {
      if display.hasAlert { Image(systemName: "exclamationmark.triangle.fill").accessibilityHidden(true) }
      Text(display.status)
    }
  }
}
struct StatusPill: View {
  let display: GaugeDisplay
  @Environment(\.colorScheme) private var scheme
  var body: some View {
    StatusText(display: display).font(.caption2.weight(.semibold)).lineLimit(2)
      .fixedSize(horizontal: false, vertical: true)
      .foregroundStyle(display.statusColor(dark: scheme == .dark))
      .padding(.horizontal, 6).padding(.vertical, 2)
      .background(display.statusColor(dark: scheme == .dark).opacity(0.12), in: RoundedRectangle(cornerRadius: 8))
  }
}
struct ObservationTime: View {
  let snapshot: WidgetGaugeSnapshot?
  var isPreview = false
  var now = Date()
  var body: some View {
    Group {
      if isPreview {
        Text("Sample data")
      } else if let observed = snapshot?.observedDate {
        Text(widgetObservationStamp(observed, now: now))
          .monospacedDigit().fixedSize(horizontal: true, vertical: false)
        .accessibilityLabel("Observed \(observed.formatted(date: .complete, time: .shortened))\(snapshot?.suspect == true ? ", flagged reading" : "")")
      } else { Text("No time").accessibilityLabel("Observation time unavailable") }
    }.font(.caption2).foregroundStyle(.secondary).lineLimit(1)
  }
}
struct WidgetEmptyState: View {
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
struct WidgetSparkline: Shape {
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
