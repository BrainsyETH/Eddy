import ExpoModulesCore

/// The JS face of FloatRecorder and FloatJournal. See
/// modules/eddy-float-recorder/index.ts for the contract.
public final class EddyFloatRecorderModule: Module {
  public func definition() -> ModuleDefinition {
    Name("EddyFloatRecorder")
    Events("onFixes", "onStatus")

    OnCreate {
      Task { @MainActor [weak self] in
        FloatRecorder.shared.emit = { name, body in
          self?.sendEvent(name, body.mapValues { $0 as Any? })
        }
      }
    }

    OnDestroy {
      Task { @MainActor in
        FloatRecorder.shared.emit = nil
      }
    }

    AsyncFunction("start") { (sessionId: String, promise: Promise) in
      Task { @MainActor in
        promise.resolve(FloatRecorder.shared.start(sessionId: sessionId))
      }
    }

    AsyncFunction("stop") { (sessionId: String?, promise: Promise) in
      Task { @MainActor in
        promise.resolve(FloatRecorder.shared.stop(sessionId: sessionId))
      }
    }

    AsyncFunction("status") { (promise: Promise) in
      Task { @MainActor in
        promise.resolve(FloatRecorder.shared.status)
      }
    }

    AsyncFunction("read") { (sessionId: String, from: Double, maxBytes: Int, promise: Promise) in
      FloatJournal.shared.read(sessionId: sessionId, from: UInt64(max(0, from)), maxBytes: max(1024, maxBytes)) { result in
        switch result {
        case .success(let page):
          promise.resolve([
            "fixes": page.fixes.map { $0.dictionary },
            "next": Double(page.next),
            "end": Double(page.end),
          ])
        case .failure(let error):
          promise.reject("ERR_FLOAT_JOURNAL_READ", error.localizedDescription)
        }
      }
    }

    AsyncFunction("deleteJournal") { (sessionId: String, promise: Promise) in
      FloatJournal.shared.delete(sessionId: sessionId) { error in
        if let error {
          promise.reject("ERR_FLOAT_JOURNAL_DELETE", error.localizedDescription)
        } else {
          promise.resolve(nil)
        }
      }
    }

    AsyncFunction("deleteAllJournals") { (promise: Promise) in
      FloatJournal.shared.deleteAll { error in
        if let error {
          promise.reject("ERR_FLOAT_JOURNAL_DELETE", error.localizedDescription)
        } else {
          promise.resolve(nil)
        }
      }
    }

    AsyncFunction("journalSize") { (promise: Promise) in
      FloatJournal.shared.size { promise.resolve($0) }
    }
  }
}
