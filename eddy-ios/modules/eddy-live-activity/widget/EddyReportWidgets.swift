import AppIntents
import SwiftUI
import WidgetKit

struct DamEntity: AppEntity {
  static var typeDisplayRepresentation: TypeDisplayRepresentation = "Dam"
  static var defaultQuery = DamQuery()
  var choice: WidgetDamChoice
  var id: String { choice.id }
  var displayRepresentation: DisplayRepresentation {
    DisplayRepresentation(title: "\(choice.name)", subtitle: "\(choice.state)")
  }
}
struct DamQuery: EntityStringQuery {
  func entities(for identifiers: [String]) async throws -> [DamEntity] {
    identifiers.compactMap { id in WidgetDamChoice.catalog.first { $0.id == id }.map { DamEntity(choice: $0) } }
  }
  func suggestedEntities() async throws -> [DamEntity] { WidgetDamChoice.catalog.map { DamEntity(choice: $0) } }
  func entities(matching string: String) async throws -> [DamEntity] {
    try await suggestedEntities().filter { "\($0.choice.name) \($0.choice.state)".localizedCaseInsensitiveContains(string) }
  }
}
struct DamGenerationIntent: WidgetConfigurationIntent {
  static var title: LocalizedStringResource = "Dam generation"
  static var description = IntentDescription("Choose a powerhouse to see observed turbine flow and the posted schedule.")
  @Parameter(title: "Dam") var dam: DamEntity?
}
struct DamEntry: TimelineEntry {
  var date: Date
  var choice: WidgetDamChoice?
  var packet: WidgetDamPacket?
  var isPreview = false
  static func preview() -> Self {
    let now = Date()
    let choice = WidgetDamChoice(id: "swl-bull-shoals-dam", name: "Bull Shoals Dam", state: "AR")
    let moment = WidgetDamMoment(date: now.timeIntervalSince1970 * 1000, status: "Generating now",
      turbineCfs: 6600, observedAt: now.timeIntervalSince1970 * 1000, current: true,
      scheduleSummary: "Stops at 6 PM. Resumes tomorrow at 7 AM.", scheduleCurrent: true,
      scheduleCheckedAt: now.timeIntervalSince1970 * 1000)
    return Self(date: now, choice: choice, packet: WidgetDamPacket(version: 1, id: choice.id, name: choice.name, entries: [moment]), isPreview: true)
  }
}
struct DamGenerationProvider: AppIntentTimelineProvider {
  func placeholder(in context: Context) -> DamEntry { .preview() }
  func snapshot(for configuration: DamGenerationIntent, in context: Context) async -> DamEntry {
    if context.isPreview { return .preview() }
    let choice = configuration.dam?.choice
    let packet = choice.flatMap { SupplementaryWidgetStore.cached("api/dams/\($0.id)", as: WidgetDamPacket.self) }
    return DamEntry(date: Date(), choice: choice, packet: packet)
  }
  func timeline(for configuration: DamGenerationIntent, in context: Context) async -> Timeline<DamEntry> {
    let choice = configuration.dam?.choice
    let packet: WidgetDamPacket?
    if let choice { packet = await SupplementaryWidgetStore.dam(choice.id) } else { packet = nil }
    let now = Date()
    let dates = [now] + (packet?.entries.compactMap { moment -> Date? in
      let date = Date(timeIntervalSince1970: moment.date / 1000)
      return date > now ? date : nil
    } ?? [])
    return Timeline(entries: dates.map { DamEntry(date: $0, choice: choice, packet: packet) }, policy: .after(now.addingTimeInterval(900)))
  }
}
struct EddyDamGenerationWidget: Widget {
  var body: some WidgetConfiguration {
    AppIntentConfiguration(kind: ConditionsWidgetStore.damKind, intent: DamGenerationIntent.self, provider: DamGenerationProvider()) { entry in
      DamGenerationCard(entry: entry).dynamicTypeSize(...DynamicTypeSize.xxLarge)
        .containerBackground(for: .widget) { WidgetCanvas() }
    }
    .configurationDisplayName("Dam generation")
    .description("Observed turbine flow and the next posted schedule change. Edit to choose a dam.")
    .supportedFamilies([.systemMedium])
  }
}
private struct DamGenerationCard: View {
  let entry: DamEntry
  @Environment(\.dynamicTypeSize) private var typeSize
  var body: some View {
    if let choice = entry.choice {
      let moment = entry.packet?.moment(at: entry.date)
      VStack(alignment: .leading, spacing: 5) {
        HStack {
          Text(choice.name).font(.system(.subheadline, design: .rounded).weight(.semibold)).lineLimit(1)
          Spacer(minLength: 2)
          Image(systemName: "bolt.fill").foregroundStyle(.secondary).accessibilityHidden(true)
        }
        HStack(alignment: .top, spacing: 12) {
          VStack(alignment: .leading, spacing: 3) {
            Text(moment?.turbineCfs.map { $0.formatted(.number.precision(.fractionLength(0))) + " cfs" } ?? "— cfs")
              .font(.system(.title3, design: .rounded).weight(.semibold)).monospacedDigit().lineLimit(1).minimumScaleFactor(0.8)
              .foregroundStyle(moment?.current == true ? Color.primary : Color.secondary)
              .accessibilityLabel("Observed turbine flow, " + (moment?.turbineCfs.map { "\($0) cubic feet per second" } ?? "unavailable"))
            if typeSize <= .large { Text("Turbine flow").font(.caption2).foregroundStyle(.secondary) }
            Text(moment?.status ?? "Generation unavailable").font(.caption2).lineLimit(3)
          }.frame(maxWidth: .infinity, alignment: .leading)
          VStack(alignment: .leading, spacing: 3) {
            Text("Next scheduled change · CT").font(.caption2.weight(.semibold)).lineLimit(2)
            Text(moment?.scheduleSummary ?? "Open Eddy to check the schedule.").font(.caption2).lineLimit(4)
              .foregroundStyle(.secondary)
          }.frame(maxWidth: .infinity, alignment: .leading)
        }
        Spacer(minLength: 0)
        if entry.isPreview {
          Text("Sample data").font(.caption2).foregroundStyle(.secondary)
        } else if let at = moment?.observedAt {
          Text("Observed " + widgetObservationStamp(Date(timeIntervalSince1970: at / 1000), now: entry.date))
            .font(.caption2).foregroundStyle(.secondary).lineLimit(1)
        }
        if typeSize <= .large {
          Text("At the dam · schedules can change").font(.caption2).foregroundStyle(.secondary).lineLimit(1)
        }
      }.widgetURL(choice.url).accessibilityElement(children: .combine)
    } else {
      WidgetEmptyState(title: "Follow a powerhouse", detail: "Touch and hold, then Edit Widget to choose a dam.")
        .widgetURL(URL(string: "eddy://favorites"))
    }
  }
}

struct ReportRiverEntity: AppEntity {
  static var typeDisplayRepresentation: TypeDisplayRepresentation = "River"
  static var defaultQuery = ReportRiverQuery()
  var choice: WidgetGaugeChoice
  var id: String { choice.id }
  var displayRepresentation: DisplayRepresentation { DisplayRepresentation(title: "\(choice.riverName)", subtitle: "\(choice.stationName)") }
}
struct ReportRiverQuery: EntityStringQuery {
  static func eligible(_ choice: WidgetGaugeChoice) -> Bool { choice.primaryForRiver && !(choice.riverSlug ?? "").isEmpty }
  func entities(for identifiers: [String]) async throws -> [ReportRiverEntity] {
    try await RiverGaugeQuery().entities(for: identifiers).filter { Self.eligible($0.choice) }.map { ReportRiverEntity(choice: $0.choice) }
  }
  func suggestedEntities() async throws -> [ReportRiverEntity] {
    try await RiverGaugeQuery().suggestedEntities().filter { Self.eligible($0.choice) }.map { ReportRiverEntity(choice: $0.choice) }
  }
  func entities(matching string: String) async throws -> [ReportRiverEntity] {
    try await suggestedEntities().filter { $0.choice.riverName.localizedCaseInsensitiveContains(string) }
  }
}
struct DailyReportIntent: WidgetConfigurationIntent {
  static var title: LocalizedStringResource = "Daily river report"
  static var description = IntentDescription("Today's river condition, observed trend and weather forecast.")
  @Parameter(title: "River") var river: ReportRiverEntity?
}
struct ReportEntry: TimelineEntry {
  var date: Date
  var conditions: ConditionsEntry
  var forecast: WidgetForecastCache?
  static func preview() -> Self {
    let conditions = ConditionsEntry.preview()
    // Preview only, never written into the real forecast cache.
    let formatter = DateFormatter()
    formatter.locale = Locale(identifier: "en_US_POSIX")
    formatter.timeZone = TimeZone(identifier: "America/Chicago")
    formatter.dateFormat = "yyyy-MM-dd"
    return Self(date: conditions.date, conditions: conditions, forecast: WidgetForecastCache(
      retrievedAt: conditions.date.timeIntervalSince1970 * 1000,
      response: WidgetForecastResponse(river: conditions.choices.first?.riverSlug ?? "", location: "Akers, MO", forecast: [
        WidgetForecastDay(date: formatter.string(from: conditions.date), tempHigh: 74, tempLow: 51, condition: "Partly cloudy", precipitation: 20)
      ])))
  }
}
struct DailyReportProvider: AppIntentTimelineProvider {
  private func choices(_ intent: DailyReportIntent) -> [WidgetGaugeChoice] {
    if let choice = intent.river?.choice {
      ConditionsWidgetStore.remember(choice)
      return [choice]
    }
    return Array(ConditionsWidgetStore.configuration().favorites.filter { ReportRiverQuery.eligible($0) }.prefix(1))
  }
  func placeholder(in context: Context) -> ReportEntry { .preview() }
  func snapshot(for configuration: DailyReportIntent, in context: Context) async -> ReportEntry {
    if context.isPreview { return .preview() }
    let selected = choices(configuration)
    let forecast = selected.first?.riverSlug.flatMap { SupplementaryWidgetStore.cached("api/weather/\($0)/forecast", as: WidgetForecastCache.self) }
    return ReportEntry(date: Date(), conditions: .cached(selected), forecast: forecast)
  }
  func timeline(for configuration: DailyReportIntent, in context: Context) async -> Timeline<ReportEntry> {
    let selected = choices(configuration)
    async let conditionsTask = ConditionsEntry.load(selected)
    let forecast: WidgetForecastCache?
    if let slug = selected.first?.riverSlug { forecast = await SupplementaryWidgetStore.forecast(slug) } else { forecast = nil }
    let loaded = await conditionsTask
    let latest = choices(configuration)
    let conditions = latest == selected ? loaded : ConditionsEntry.cached(latest)
    let selectedForecast = latest == selected ? forecast : nil
    let now = Date()
    var dates = Set(conditions.timeline.entries.map(\.date).filter { $0 > now })
    if let selectedForecast, selectedForecast.expiresAt > now { dates.insert(selectedForecast.expiresAt) }
    var calendar = Calendar(identifier: .gregorian)
    calendar.timeZone = TimeZone(identifier: "America/Chicago")!
    if let midnight = calendar.date(byAdding: .day, value: 1, to: calendar.startOfDay(for: now)) { dates.insert(midnight) }
    let entries = ([now] + dates.sorted()).map { date in
      ReportEntry(date: date, conditions: ConditionsEntry(date: date, choices: conditions.choices, stations: conditions.stations), forecast: selectedForecast)
    }
    return Timeline(entries: entries, policy: .after(now.addingTimeInterval(900)))
  }
}
struct EddyDailyRiverReportWidget: Widget {
  var body: some WidgetConfiguration {
    AppIntentConfiguration(kind: ConditionsWidgetStore.reportKind, intent: DailyReportIntent.self, provider: DailyReportProvider()) { entry in
      DailyReportCard(entry: entry).dynamicTypeSize(...DynamicTypeSize.xxLarge)
        .containerBackground(for: .widget) { WidgetCanvas() }
    }
    .configurationDisplayName("Daily river report")
    .description("Today's gauge condition, trend and weather forecast for a river you choose.")
    .supportedFamilies([.systemMedium])
  }
}
private struct DailyReportCard: View {
  let entry: ReportEntry
  @Environment(\.dynamicTypeSize) private var typeSize
  var body: some View {
    if let choice = entry.conditions.choices.first {
      let display = GaugeDisplay(choice: choice, data: entry.conditions.stations[choice.siteId], date: entry.date)
      let weather = entry.forecast?.today(at: entry.date)
      VStack(alignment: .leading, spacing: 4) {
        HStack {
          Text(choice.riverName).font(.system(.subheadline, design: .rounded).weight(.semibold)).lineLimit(1)
          Spacer(minLength: 0)
          GaugeOtter().frame(width: 23, height: 23)
        }
        HStack(alignment: .top, spacing: 12) {
          VStack(alignment: .leading, spacing: 3) {
            Text("\(display.reading) \(display.unit)").font(.system(.title3, design: .rounded).weight(.semibold)).monospacedDigit().lineLimit(1)
            StatusPill(display: display)
            if typeSize <= .large, let trend = display.trend { Text(trend).font(.caption2).foregroundStyle(.secondary).lineLimit(1) }
          }.frame(maxWidth: .infinity, alignment: .leading)
          VStack(alignment: .leading, spacing: 3) {
            Text("Today's forecast").font(.caption2.weight(.semibold))
            if let weather {
              Text("H \(Int(weather.tempHigh))° · L \(Int(weather.tempLow))°F").font(.caption.weight(.semibold)).lineLimit(1)
              Text(weather.condition).font(.caption2).lineLimit(1)
              Text("\(Int(weather.precipitation))% rain chance").font(.caption2).foregroundStyle(.secondary).lineLimit(1)
            } else { Text("Forecast unavailable").font(.caption2).foregroundStyle(.secondary) }
          }.frame(maxWidth: .infinity, alignment: .leading)
        }
        Spacer(minLength: 0)
        HStack {
          Text(choice.stationName).lineLimit(1)
          Spacer(minLength: 0)
          ObservationTime(snapshot: display.snapshot, isPreview: entry.conditions.isPreview, now: entry.date)
        }.font(.caption2).foregroundStyle(.secondary)
        if typeSize <= .large, weather != nil, let location = entry.forecast?.response.location {
          Text("Forecast · \(location)").font(.caption2).foregroundStyle(.secondary).lineLimit(1)
        }
      }.widgetURL(URL(string: "eddy://river/\(choice.riverSlug ?? "")"))
        .accessibilityElement(children: .combine)
    } else {
      WidgetEmptyState(title: "Your daily river report", detail: "Open Eddy, then edit this widget to choose a river.")
        .widgetURL(URL(string: "eddy://favorites"))
    }
  }
}
