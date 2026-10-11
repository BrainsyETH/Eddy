import ActivityKit
import Foundation

// Compiled from this same file in both the Expo module and widget extension.
struct FloatActivityAttributes: ActivityAttributes {
  struct ContentState: Codable, Hashable {
    var riverName: String
    var takeOutName: String
    var status: String
    var milesText: String
    var progress: Double?
    var estimateText: String
    var estimateNote: String
    var estimateAsOf: Date?
    var lastFixAt: Date?
    var staleAt: Date?
    var paused: Bool
    var arrived: Bool
    var atRiverEnd: Bool
    var pastEnd: Bool
    var beyondText: String
  }
  var sessionId: String
}
