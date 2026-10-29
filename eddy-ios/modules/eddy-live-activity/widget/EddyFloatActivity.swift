import ActivityKit
import SwiftUI
import WidgetKit

private let riverTeal = Color(red: 0.30, green: 0.78, blue: 0.73)
private let floatURL = URL(string: "eddy://float-mode")!

@main
struct EddyFloatActivityBundle: WidgetBundle {
  var body: some Widget {
    EddyFloatActivity()
    EddyRiverLevelWidget()
    EddyFavoritesWidget()
    EddyDamGenerationWidget()
    EddyDailyRiverReportWidget()
  }
}

struct EddyFloatActivity: Widget {
  var body: some WidgetConfiguration {
    ActivityConfiguration(for: FloatActivityAttributes.self) { context in
      FloatCard(context: context)
        .padding(14)
        .activityBackgroundTint(Color(red: 0.07, green: 0.12, blue: 0.12))
        .activitySystemActionForegroundColor(.white)
        .widgetURL(floatURL)
    } dynamicIsland: { context in
      let display = FloatDisplay(context: context)
      return DynamicIsland {
        DynamicIslandExpandedRegion(.leading) {
          Label("Eddy", systemImage: "water.waves")
            .font(.caption.weight(.semibold)).foregroundStyle(riverTeal)
        }
        DynamicIslandExpandedRegion(.trailing) {
          Text(display.shortStatus).font(.caption).foregroundStyle(display.tint)
        }
        DynamicIslandExpandedRegion(.bottom) {
          FloatCard(context: context, expanded: true)
        }
      } compactLeading: {
        Image(systemName: display.statusSymbol)
          .foregroundStyle(display.tint)
          .accessibilityLabel(display.shortStatus)
          // The compact and minimal regions are sized by the camera housing,
          // not by their content: Apple's layout gives them no room to grow,
          // so these few glyphs alone keep a Dynamic Type cap. The Lock Screen
          // card and the expanded Island adapt instead (FloatCard).
          .dynamicTypeSize(...DynamicTypeSize.xxxLarge)
      } compactTrailing: {
        // A bare old distance on the Island looks live: replace it with an
        // explicit status until the river position is reliable again.
        Text(display.reliable && display.hasMiles ? "\(context.state.milesText) mi" : display.compactStatus)
          .font(.caption.weight(.semibold)).monospacedDigit().foregroundStyle(display.tint)
          .lineLimit(1).minimumScaleFactor(0.7)
          .dynamicTypeSize(...DynamicTypeSize.xxxLarge)
      } minimal: {
        Image(systemName: display.statusSymbol)
          .foregroundStyle(display.tint).accessibilityLabel(display.shortStatus)
          .dynamicTypeSize(...DynamicTypeSize.xxxLarge)
      }
      .widgetURL(floatURL)
      .keylineTint(riverTeal)
    }
  }
}

private struct FloatDisplay {
  let context: ActivityViewContext<FloatActivityAttributes>
  var state: FloatActivityAttributes.ContentState { context.state }
  var stale: Bool { context.isStale || state.status == "stale" }
  var reliable: Bool { !stale && state.status == "live" }
  /// The app sends a dash when there is no distance to show (no confirmed
  /// position, or a start past the take-out); a dash needs no unit.
  var hasMiles: Bool { state.milesText != "—" }
  var tint: Color { reliable ? riverTeal : .orange }
  var shortStatus: String {
    if state.lastFixAt == nil { return "Finding your position" }
    if stale { return "Last known position" }
    switch state.status {
    case "resuming": return "Finding your position"
    case "uncertain": return "Checking your position"
    case "off-route": return "Away from mapped river"
    case "acquiring": return "Finding your position"
    default:
      if state.pastEnd { return "Past the take-out" }
      if state.atRiverEnd { return "End of mapped river" }
      if state.arrived { return "At the take-out" }
      return state.paused ? "Stopped · earlier pace" : "Live"
    }
  }
  var compactStatus: String {
    if stale && state.lastFixAt != nil { return "Stale" }
    switch state.status {
    case "off-route": return "Off route"
    case "uncertain": return "Checking"
    default: return "Finding"
    }
  }
  var statusSymbol: String {
    if stale && state.lastFixAt != nil { return "clock" }
    if reliable { return "water.waves" }
    // Off-route can have perfectly good GPS: don't show a crossed-out receiver.
    return state.status == "off-route" ? "arrow.turn.up.right" : "location"
  }
  var estimate: String {
    // An old zero-minute estimate must never masquerade as a fresh arrival.
    if !reliable && (state.arrived || state.atRiverEnd) { return "Open Eddy to check progress" }
    if reliable && state.pastEnd { return "Check your take-out in Eddy" }
    return state.estimateText
  }
}

private struct FloatCard: View {
  let context: ActivityViewContext<FloatActivityAttributes>
  var expanded = false
  @Environment(\.dynamicTypeSize) private var typeSize
  private var display: FloatDisplay { FloatDisplay(context: context) }
  private var state: FloatActivityAttributes.ContentState { context.state }

  var body: some View {
    // The Lock Screen clips a Live Activity at 160 pt. Five rows fit through
    // the largest non-accessibility size. At accessibility sizes the card
    // keeps what a glance needs (distance, estimate, whether the position is
    // current) stacked full width and drops the rest; ViewThatFits falls back
    // to distance and status alone when even that is too tall. No blanket
    // Dynamic Type cap: the essentials grow with the reader's setting.
    Group {
      if typeSize.isAccessibilitySize {
        ViewThatFits(in: .vertical) {
          accessibleCard(showEstimate: true)
          accessibleCard(showEstimate: false)
        }
      } else {
        standardCard
      }
    }
    .foregroundStyle(.white)
  }

  private var milesLine: String {
    if !display.hasMiles { return "No distance yet" }
    if !display.reliable { return "\(state.milesText) mi · last known" }
    return state.beyondText.isEmpty ? "\(state.milesText) mi left" : "\(state.milesText) mi to mapped end"
  }

  private func accessibleCard(showEstimate: Bool) -> some View {
    VStack(alignment: .leading, spacing: 2) {
      Text(milesLine)
        .font(.system(.title3, design: .rounded).weight(.semibold)).monospacedDigit()
        .lineLimit(1).minimumScaleFactor(0.5)
      if showEstimate {
        Text(display.estimate).font(.footnote.weight(.semibold))
          .lineLimit(2).minimumScaleFactor(0.6)
      }
      statusRow.lineLimit(1).minimumScaleFactor(0.6)
    }
    .frame(maxWidth: .infinity, alignment: .leading)
  }

  private var statusRow: some View {
    HStack(spacing: 4) {
      Image(systemName: display.reliable ? "location.fill" : display.statusSymbol)
        .accessibilityHidden(true)
      Text(display.shortStatus).lineLimit(1)
      if !display.reliable, let fix = state.lastFixAt {
        Text("·").accessibilityHidden(true)
        // The system redraws this age even while Eddy is suspended.
        Text(fix, style: .relative).monospacedDigit()
        Text("ago")
      }
    }
    .font(.caption2).foregroundStyle(display.tint)
    // One VoiceOver element ("Last known position, 3 min ago"), not four.
    .accessibilityElement(children: .combine)
  }

  private var standardCard: some View {
    VStack(alignment: .leading, spacing: 5) {
      HStack(spacing: 8) {
        if !expanded {
          Image("FloatOtter").resizable().scaledToFit().frame(width: 30, height: 30)
            .accessibilityHidden(true)
        }
        VStack(alignment: .leading, spacing: 1) {
          Text(state.riverName).font(.system(.subheadline, design: .rounded).weight(.semibold))
            .lineLimit(1).minimumScaleFactor(0.8)
          Text("To \(state.takeOutName)").font(.caption).foregroundStyle(.white.opacity(0.75))
            .lineLimit(1).minimumScaleFactor(0.8)
        }
        Spacer(minLength: 4)
        VStack(alignment: .trailing, spacing: 0) {
          Text(display.hasMiles ? "\(state.milesText) mi" : state.milesText)
            .font(.system(.title2, design: .rounded).weight(.semibold)).monospacedDigit()
            .lineLimit(1).minimumScaleFactor(0.7)
          Text(!display.hasMiles ? "no distance yet" : display.reliable ? (state.beyondText.isEmpty ? "river miles left" : "to mapped end") : "last known")
            .font(.caption2).foregroundStyle(.white.opacity(0.75))
        }
        .accessibilityElement(children: .combine)
      }
      if let progress = state.progress {
        ProgressView(value: progress).tint(display.tint)
          .accessibilityLabel("Float progress")
      }
      HStack(alignment: .firstTextBaseline, spacing: 6) {
        Text(display.estimate).font(.subheadline.weight(.semibold)).lineLimit(1).minimumScaleFactor(0.85)
        Spacer(minLength: 0)
        if let asOf = state.estimateAsOf {
          HStack(spacing: 3) {
            Text("As of")
            Text(asOf, style: .time)
          }.font(.caption2).foregroundStyle(.white.opacity(0.65))
            .accessibilityElement(children: .combine)
        }
      }
      // Fixed moving-time copy, never a countdown through a stop.
      if !state.beyondText.isEmpty {
        Text(state.beyondText).font(.caption2).foregroundStyle(.white.opacity(0.8)).lineLimit(1).minimumScaleFactor(0.8)
      } else if !state.estimateNote.isEmpty && !state.arrived && !state.pastEnd {
        Text(state.estimateNote).font(.caption2).foregroundStyle(.white.opacity(0.7)).lineLimit(1).minimumScaleFactor(0.8)
      }
      statusRow
    }
  }
}
