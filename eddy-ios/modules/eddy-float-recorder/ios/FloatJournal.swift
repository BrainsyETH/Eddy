import Foundation

/// One raw GPS fix as Core Location delivered it. Written one JSON object per
/// line; the field names are the JS contract (modules/eddy-float-recorder/index.ts).
struct RecordedFix: Codable, Sendable {
  /// Milliseconds since 1970, from the fix itself (not when it was written).
  let t: Double
  let lng: Double
  let lat: Double
  /// Horizontal accuracy in metres.
  let acc: Double
  /// Metres per second; absent when Core Location had no valid speed.
  let spd: Double?
  /// Degrees from true north; absent when invalid.
  let crs: Double?
  let alt: Double?
  let vacc: Double?

  var dictionary: [String: Any] {
    var out: [String: Any] = ["t": t, "lng": lng, "lat": lat, "acc": acc]
    if let spd { out["spd"] = spd }
    if let crs { out["crs"] = crs }
    if let alt { out["alt"] = alt }
    if let vacc { out["vacc"] = vacc }
    return out
  }
}

/// The append-only record of every fix in a float: one file per float,
/// newline-delimited JSON, written as each fix arrives.
///
/// ── Why a log and not a snapshot ────────────────────────────────────────────
/// The JS session is a checkpoint derived from this log, saved with the byte
/// offset it has read up to. If iOS ends Eddy at any moment, nothing between
/// the last checkpoint and the end is lost: the next launch replays from the
/// offset. A line cut short by termination has no newline and is never read;
/// the next append starts a fresh line after it.
///
/// ── Durability ──────────────────────────────────────────────────────────────
/// Each append is a write(2) into the kernel: it survives the app being killed
/// or crashing. It is synchronised to storage when a float stops and when Eddy
/// leaves the foreground; only a power loss in between could cost the last
/// few seconds, which is what every recording app accepts in exchange for not
/// forcing a flash write every second.
///
/// ── Privacy ─────────────────────────────────────────────────────────────────
/// Raw positions stay on the phone: the directory is excluded from iCloud and
/// device backups, and files are readable after the first unlock so recording
/// continues while the phone is locked in a dry bag.
///
/// All file access runs on one serial queue, so offsets are consistent.
final class FloatJournal: @unchecked Sendable {
  static let shared = FloatJournal()

  private let queue = DispatchQueue(label: "guide.eddy.float-journal")
  private var handle: FileHandle?
  private var handleId: String?
  private let encoder = JSONEncoder()
  private let decoder = JSONDecoder()

  private var directory: URL {
    let base = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
    return base.appendingPathComponent("EddyFloatJournal", isDirectory: true)
  }

  /// Session ids come from JS; keep only characters that are safe in a file name.
  private func fileURL(_ sessionId: String) -> URL {
    let safe = String(sessionId.unicodeScalars.filter { CharacterSet.alphanumerics.contains($0) || $0 == "-" || $0 == "_" })
    return directory.appendingPathComponent("\(safe).ndjson")
  }

  private func ensureDirectory() throws {
    var url = directory
    if !FileManager.default.fileExists(atPath: url.path) {
      try FileManager.default.createDirectory(
        at: url,
        withIntermediateDirectories: true,
        attributes: [.protectionKey: FileProtectionType.completeUntilFirstUserAuthentication]
      )
    }
    var values = URLResourceValues()
    values.isExcludedFromBackup = true
    try url.setResourceValues(values)
  }

  /// Must run on `queue`.
  private func openHandle(_ sessionId: String) throws -> FileHandle {
    if let handle, handleId == sessionId { return handle }
    try closeHandle()
    try ensureDirectory()
    let url = fileURL(sessionId)
    if !FileManager.default.fileExists(atPath: url.path) {
      FileManager.default.createFile(
        atPath: url.path,
        contents: nil,
        attributes: [.protectionKey: FileProtectionType.completeUntilFirstUserAuthentication]
      )
    }
    let opened = try FileHandle(forWritingTo: url)
    let size = try opened.seekToEnd()
    // A line cut short by an earlier termination has no newline; end it, so it
    // stays one unreadable line instead of corrupting the next one.
    if size > 0, try lastByte(url, size: size) != 0x0A {
      try opened.write(contentsOf: Data([0x0A]))
    }
    handle = opened
    handleId = sessionId
    return opened
  }

  /// Must run on `queue`.
  private func closeHandle() throws {
    guard let handle else { return }
    self.handle = nil
    handleId = nil
    try handle.synchronize()
    try handle.close()
  }

  /// Append fixes; `done` gets the byte offsets the new lines occupy.
  func append(_ fixes: [RecordedFix], sessionId: String, done: @escaping @Sendable (Result<(from: UInt64, to: UInt64), Error>) -> Void) {
    queue.async {
      do {
        let handle = try self.openHandle(sessionId)
        let from = try handle.seekToEnd()
        var data = Data()
        for fix in fixes {
          data.append(try self.encoder.encode(fix))
          data.append(0x0A)
        }
        try handle.write(contentsOf: data)
        done(.success((from: from, to: from + UInt64(data.count))))
      } catch {
        done(.failure(error))
      }
    }
  }

  private func lastByte(_ url: URL, size: UInt64) throws -> UInt8? {
    let reader = try FileHandle(forReadingFrom: url)
    defer { try? reader.close() }
    try reader.seek(toOffset: size - 1)
    return try reader.read(upToCount: 1)?.first
  }

  /// Complete lines from `offset`, up to about `maxBytes`. `next` is the offset
  /// after the last complete line returned; `end` is the file size.
  func read(sessionId: String, from offset: UInt64, maxBytes: Int, done: @escaping @Sendable (Result<(fixes: [RecordedFix], next: UInt64, end: UInt64), Error>) -> Void) {
    queue.async {
      do {
        let url = self.fileURL(sessionId)
        guard FileManager.default.fileExists(atPath: url.path) else {
          done(.success((fixes: [], next: offset, end: 0)))
          return
        }
        let reader = try FileHandle(forReadingFrom: url)
        defer { try? reader.close() }
        let end = try reader.seekToEnd()
        guard offset < end else {
          done(.success((fixes: [], next: offset, end: end)))
          return
        }
        try reader.seek(toOffset: offset)
        let chunk = try reader.read(upToCount: maxBytes) ?? Data()
        guard let lastNewline = chunk.lastIndex(of: 0x0A) else {
          // A single line longer than maxBytes cannot happen with these
          // records; an unterminated tail is a write cut short. Either way
          // there is nothing complete to return yet.
          done(.success((fixes: [], next: offset, end: end)))
          return
        }
        let complete = chunk[chunk.startIndex...lastNewline]
        var fixes: [RecordedFix] = []
        for line in complete.split(separator: 0x0A, omittingEmptySubsequences: true) {
          // A torn line from a termination mid-write is skipped, not fatal.
          if let fix = try? self.decoder.decode(RecordedFix.self, from: Data(line)) { fixes.append(fix) }
        }
        done(.success((fixes: fixes, next: offset + UInt64(complete.count), end: end)))
      } catch {
        done(.failure(error))
      }
    }
  }

  /// Flush the open file to storage.
  func synchronize() {
    queue.async { try? self.handle?.synchronize() }
  }

  /// Close the open file once a float stops recording.
  func close() {
    queue.async { try? self.closeHandle() }
  }

  /// Delete one float's journal. A journal that is already gone counts as
  /// deleted; any other failure is reported, so the caller can retry it.
  func delete(sessionId: String, done: @escaping @Sendable (Error?) -> Void) {
    queue.async {
      if self.handleId == sessionId { try? self.closeHandle() }
      done(Self.remove(self.fileURL(sessionId)))
    }
  }

  /// Account deletion: every float's raw positions. Reported like delete.
  func deleteAll(done: @escaping @Sendable (Error?) -> Void) {
    queue.async {
      try? self.closeHandle()
      done(Self.remove(self.directory))
    }
  }

  private static func remove(_ url: URL) -> Error? {
    guard FileManager.default.fileExists(atPath: url.path) else { return nil }
    do {
      try FileManager.default.removeItem(at: url)
      return nil
    } catch {
      return error
    }
  }

  /// Bytes used by every journal, for the Storage screen.
  func size(done: @escaping @Sendable (Int) -> Void) {
    queue.async {
      let files = (try? FileManager.default.contentsOfDirectory(at: self.directory, includingPropertiesForKeys: [.fileSizeKey])) ?? []
      let total = files.reduce(0) { sum, url in sum + ((try? url.resourceValues(forKeys: [.fileSizeKey]).fileSize) ?? 0) }
      done(total)
    }
  }
}
