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
    let formatter = DateFormatter()
    formatter.locale = Locale(identifier: "en_US_POSIX")
    formatter.timeZone = TimeZone(identifier: "America/Chicago")
    formatter.dateFormat = "yyyy-MM-dd"
    let day = formatter.string(from: now)
    var calendar = Calendar(identifier: .gregorian)
    calendar.timeZone = formatter.timeZone
    let moment = WidgetDamMoment(date: now.timeIntervalSince1970 * 1000, status: "Generating now",
      turbineCfs: 6600, observedAt: now.timeIntervalSince1970 * 1000, current: true,
      scheduleSummary: "Stops at 6 PM. Resumes tomorrow at 7 AM.", scheduleCurrent: true,
      scheduleCheckedAt: now.timeIntervalSince1970 * 1000, generationKind: "generating",
      scheduleDate: day, scheduleHour: calendar.component(.hour, from: now) + 1)
    let hours = (1...24).map { hour in
      WidgetDamScheduleHour(hourEnding: hour, label: "\((hour - 1) % 12 == 0 ? 12 : (hour - 1) % 12) \(hour <= 12 ? "AM" : "PM")",
        megawatts: (8...18).contains(hour) ? ((14...17).contains(hour) ? 200 : 100) : 0)
    }
    return Self(date: now, choice: choice, packet: WidgetDamPacket(version: 1, id: choice.id, name: choice.name,
      entries: [moment], scheduleDays: [WidgetDamScheduleDay(date: day, hours: hours)]), isPreview: true)
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
    .description("Generation at the dam and today's hourly schedule. Edit to choose a dam.")
    .supportedFamilies([.systemMedium])
  }
}
private struct DamGenerationCard: View {
  let entry: DamEntry
  @Environment(\.dynamicTypeSize) private var typeSize
  @Environment(\.colorScheme) private var scheme
  var body: some View {
    if let choice = entry.choice {
      let moment = entry.packet?.moment(at: entry.date)
      GeometryReader { geometry in
        let compact = typeSize > .large || geometry.size.height < 135
        VStack(alignment: .leading, spacing: compact ? 4 : 7) {
          HStack(spacing: 7) {
            WidgetArtwork(name: "DamMark").frame(width: 25, height: 25)
            Text(choice.name).font(.system(.subheadline, design: .rounded).weight(.semibold)).lineLimit(1)
            Spacer(minLength: 0)
          }
          HStack(alignment: .top, spacing: 12) {
            VStack(alignment: .leading, spacing: 3) {
              Text("Turbine flow").font(.caption2).foregroundStyle(.secondary)
              HStack(alignment: .firstTextBaseline, spacing: 3) {
                Text(moment?.turbineCfs.map { $0.formatted(.number.precision(.fractionLength(0))) } ?? "—")
                  .font(.system(compact ? .title3 : .title2, design: .rounded).weight(.bold))
                  .monospacedDigit().minimumScaleFactor(0.8)
                Text("CFS").font(.caption2.weight(.semibold)).foregroundStyle(.secondary).fixedSize()
              }.lineLimit(1).foregroundStyle(moment?.current == true ? Color.primary : Color.secondary)
                .accessibilityLabel("Observed turbine flow, " + (moment?.turbineCfs.map { "\($0) cubic feet per second" } ?? "unavailable"))
              HStack(spacing: 3) {
                Image(systemName: moment?.current == true && moment?.generationKind == "generating" ? "bolt.fill" :
                  (moment?.current == true && moment?.generationKind == "not-generating"
                    ? (moment?.minimumFlow == true ? "drop" : "bolt.slash") : "questionmark.circle"))
                  .accessibilityHidden(true)
                Text(moment?.compactStatus ?? "Unavailable").lineLimit(2)
              }.font(.caption2.weight(.medium))
                .foregroundStyle(moment?.current == true ? WidgetBrand.water(dark: scheme == .dark) : Color.secondary)
                .accessibilityElement(children: .ignore).accessibilityLabel(moment?.status ?? "Generation unavailable")
            }.frame(width: geometry.size.width * 0.36, alignment: .leading)
            VStack(alignment: .leading, spacing: 4) {
              if let schedule = entry.packet?.todaySchedule(at: entry.date) {
                DamScheduleChart(day: schedule, currentHour: moment?.scheduleHour, compact: compact)
              } else {
                Text("Today’s schedule · CT").font(.caption2.weight(.semibold)).lineLimit(1)
                HStack(spacing: 6) {
                  Image(systemName: "calendar.badge.clock").font(.title3)
                  Text(entry.packet?.scheduleDays == nil && moment?.scheduleCurrent == true ? "Open schedule" : "Not posted today")
                    .font(.caption).lineLimit(2)
                }.foregroundStyle(.secondary).frame(maxWidth: .infinity, minHeight: compact ? 35 : 48, alignment: .leading)
              }
            }.frame(maxWidth: .infinity, alignment: .leading)
          }
          Spacer(minLength: 0)
          HStack(spacing: 4) {
            Text("At the dam").lineLimit(1)
            Spacer(minLength: 0)
            if entry.isPreview { Text("Sample data") }
            else if let at = moment?.observedAt {
              Text("Observed " + widgetObservationStamp(Date(timeIntervalSince1970: at / 1000), now: entry.date)).lineLimit(1)
            }
          }.font(.caption2).foregroundStyle(.secondary)
        }.frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
      }.widgetURL(choice.url)
    } else {
      WidgetEmptyState(title: "Follow a powerhouse", detail: "Touch and hold, then Edit Widget to choose a dam.")
        .widgetURL(URL(string: "eddy://favorites"))
    }
  }
}

private struct DamScheduleChart: View {
  let day: WidgetDamScheduleDay
  let currentHour: Int?
  let compact: Bool
  @Environment(\.colorScheme) private var scheme
  var body: some View {
    VStack(alignment: .leading, spacing: 3) {
      HStack(spacing: 3) {
        Text("Schedule · CT").fontWeight(.semibold)
        Spacer(minLength: 0)
        if day.minimumFlowOnly {
          Text("Minimum flow").foregroundStyle(.secondary)
        } else if day.hours.contains(where: { $0.megawatts != nil }) {
          Text("\(day.peak.formatted(.number.precision(.fractionLength(0)))) MW")
            .foregroundStyle(.secondary).accessibilityLabel("Schedule peak \(day.peak.formatted()) megawatts")
        }
      }.font(.caption2).lineLimit(1)
      HStack(alignment: .bottom, spacing: 2) {
        ForEach(day.hours) { hour in
          let selected = hour.hourEnding == currentHour
          let height = compact ? 29.0 : 40.0
          VStack(spacing: 2) {
            if selected {
              Image(systemName: "arrowtriangle.down.fill").font(.system(size: 5))
                .foregroundStyle(WidgetBrand.coral)
            }
            if let mw = hour.megawatts {
              RoundedRectangle(cornerRadius: 1.5)
                // Minimum flow is a low baseline like an idle hour, never a
                // generation bar.
                .fill(hour.generating ? WidgetBrand.water(dark: scheme == .dark) : Color.secondary.opacity(0.45))
                .frame(height: hour.generating ? max(5, height * mw / max(day.peak, 1)) : 3)
            } else {
              // A missing hour is hollow, visibly different from a zero bar.
              RoundedRectangle(cornerRadius: 1.5).strokeBorder(Color.secondary, style: StrokeStyle(lineWidth: 1, dash: [2]))
                .frame(height: height)
            }
          }.frame(maxWidth: .infinity, maxHeight: height + 7, alignment: .bottom)
            .accessibilityElement(children: .ignore)
            .accessibilityLabel("\(hour.label): " + (hour.megawatts == nil ? "schedule unavailable"
              : hour.minimumFlow == true ? "minimum flow scheduled"
              : "\(hour.megawatts!.formatted()) megawatts scheduled") + (selected ? ", current hour" : ""))
        }
      }
      HStack(spacing: 0) {
        Text("12a"); Spacer(minLength: 0); Text("6a"); Spacer(minLength: 0)
        Text("12p"); Spacer(minLength: 0); Text("6p"); Spacer(minLength: 0); Text("12a")
      }.font(.caption2).foregroundStyle(.secondary).accessibilityHidden(true)
    }.accessibilityElement(children: .contain).accessibilityLabel("Today's posted generation schedule, Central Time, subject to change")
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
  static var title: LocalizedStringResource = "Daily River Report"
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
    .configurationDisplayName("Daily River Report")
    .description("Today's gauge condition, trend and weather forecast for a river you choose.")
    .supportedFamilies([.systemMedium])
  }
}
private struct DailyReportCard: View {
  let entry: ReportEntry
  @Environment(\.dynamicTypeSize) private var typeSize
  @Environment(\.colorScheme) private var scheme
  var body: some View {
    if let choice = entry.conditions.choices.first {
      let display = GaugeDisplay(choice: choice, data: entry.conditions.stations[choice.siteId], date: entry.date)
      let weather = entry.forecast?.today(at: entry.date)
      GeometryReader { geometry in
        let compact = typeSize > .large || geometry.size.height < 140 || display.hasAlert || display.alertsUnavailable
        VStack(alignment: .leading, spacing: compact ? 3 : 5) {
          HStack(spacing: 6) {
            WidgetArtwork(name: "RiverMark").frame(width: 21, height: 21)
            Text("Daily River Report").font(.system(.caption, design: .rounded).weight(.semibold))
              .foregroundStyle(WidgetBrand.water(dark: scheme == .dark)).lineLimit(1)
            Spacer(minLength: 0)
          }
          HStack(alignment: .top, spacing: 12) {
            VStack(alignment: .leading, spacing: 3) {
              Text(choice.riverName).font(.system(.subheadline, design: .rounded).weight(.semibold)).lineLimit(1)
              HStack(alignment: .firstTextBaseline, spacing: 4) {
                Text(display.reading).font(.system(compact ? .title3 : .title2, design: .rounded).weight(.bold))
                  .monospacedDigit().minimumScaleFactor(0.8)
                Text(display.unit.uppercased()).font(.caption2.weight(.semibold)).foregroundStyle(.secondary).fixedSize()
              }.lineLimit(1).foregroundStyle(display.current ? Color.primary : Color.secondary)
              StatusPill(display: display)
              if !compact, display.current, let series = display.series, series.points.count > 1 {
                WidgetSparkline(series: series)
                  .stroke(display.color(dark: scheme == .dark), style: StrokeStyle(lineWidth: 2, lineCap: .round, lineJoin: .round))
                  .frame(height: 14).accessibilityLabel(display.trend ?? "Observed gauge history, last 24 hours")
              }
            }.frame(maxWidth: .infinity, alignment: .leading)
            ReportWeatherTile(weather: weather, location: entry.forecast?.response.location, compact: compact)
              .frame(width: geometry.size.width * 0.42)
          }
          Spacer(minLength: 0)
          HStack(spacing: 4) {
            if choice.stationName != choice.riverName {
              Text(widgetStationLabel(choice)).lineLimit(1).accessibilityLabel(choice.stationName)
            }
            Spacer(minLength: 0)
            ObservationTime(snapshot: display.snapshot, isPreview: entry.conditions.isPreview, now: entry.date)
          }.font(.caption2).foregroundStyle(.secondary)
        }.frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
      }.widgetURL(URL(string: "eddy://river/\(choice.riverSlug ?? "")"))
    } else {
      WidgetEmptyState(title: "Your daily river report", detail: "Open Eddy, then edit this widget to choose a river.")
        .widgetURL(URL(string: "eddy://favorites"))
    }
  }
}

private struct ReportWeatherTile: View {
  let weather: WidgetForecastDay?
  let location: String?
  let compact: Bool
  @Environment(\.colorScheme) private var scheme
  var body: some View {
    VStack(alignment: .leading, spacing: 3) {
      Text("Forecast · °F").font(.caption2.weight(.medium)).foregroundStyle(.secondary)
      if let weather {
        HStack(spacing: 5) {
          Image(systemName: widgetWeatherSymbol(weather.condition))
            .font(compact ? .title3 : .title2).foregroundStyle(WidgetBrand.water(dark: scheme == .dark))
            .accessibilityLabel(weather.condition)
          Text("\(Int(weather.tempHigh))°").font(.system(compact ? .title3 : .title2, design: .rounded).weight(.bold))
            .monospacedDigit().lineLimit(1).minimumScaleFactor(0.8).accessibilityLabel("High \(Int(weather.tempHigh)) degrees Fahrenheit")
        }
        HStack(spacing: 6) {
          Text("↓\(Int(weather.tempLow))°").accessibilityLabel("Low \(Int(weather.tempLow)) degrees Fahrenheit")
          Label("\(Int(weather.precipitation))%", systemImage: "drop.fill")
            .accessibilityLabel("\(Int(weather.precipitation)) percent chance of precipitation")
        }.font(.caption2).foregroundStyle(.secondary).lineLimit(1)
      } else {
        Image(systemName: "cloud").font(.title2).foregroundStyle(.secondary).accessibilityHidden(true)
        Text("Unavailable").font(.caption2).foregroundStyle(.secondary)
      }
    }.frame(maxWidth: .infinity, alignment: .leading).padding(compact ? 6 : 8)
      .background(WidgetBrand.panel(dark: scheme == .dark), in: RoundedRectangle(cornerRadius: 12))
      .accessibilityElement(children: .contain).accessibilityLabel("Weather forecast for \(location ?? "this river")")
  }
}
