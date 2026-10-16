// rnmapbox 10.3.5 starts one shared style load for every region. Queue at its
// native DispatchGroup boundary: JS createPack/resume and tile progress finish
// earlier than the style load. Keep listeners until that boundary too, so a
// late style failure is heard. This plugin requires a new iOS binary.
const fs = require('node:fs');
const path = require('node:path');
const MARKER = '// Eddy: serialize complete tile + style loads, on the main thread.';

const replacements = [
  ['  func startLoading(pack: TileRegionPack) {\n    let id = pack.name', `  ${MARKER}
  private var eddyPendingDownloads: [TileRegionPack] = []
  private var eddyActiveDownload: String? = nil

  func startLoading(pack: TileRegionPack) {
    guard eddyActiveDownload != pack.name,
          !eddyPendingDownloads.contains(where: { $0.name == pack.name }) else { return }
    eddyPendingDownloads.append(pack)
    eddyStartNextDownload()
  }

  private func eddyStartNextDownload() {
    guard eddyActiveDownload == nil, !eddyPendingDownloads.isEmpty else { return }
    let pack = eddyPendingDownloads.removeFirst()
    eddyActiveDownload = pack.name
    eddyLoadPack(pack: pack)
  }

  private func eddyFinishedDownload(_ name: String) {
    guard eddyActiveDownload == name else { return }
    eddyActiveDownload = nil
    eddyStartNextDownload()
  }

  private func eddyLoadPack(pack: TileRegionPack) {
    let id = pack.name`],
  ...['there are no bounds', 'there is no zoom range', 'there is no styleURI'].map(reason => [
    `RNMBXLogError("RNMBXOfflineModule.startLoading failed as ${reason} in pack")\n      return`,
    `RNMBXLogError("RNMBXOfflineModule.startLoading failed as ${reason} in pack")\n      eddyFinishedDownload(id)\n      return`,
  ]),
  ['      self.tileRegionPacks[id]!.state = downloadError ? .inactive : .complete', `      self.tileRegionPacks[id]!.state = downloadError ? .inactive : .complete
      // Send the terminal event only after BOTH loads settle, without throttling.
      // Tile counts alone must not unsubscribe the JS error listener.
      var payload = self._makeRegionStatusPayload(id, progress: lastProgress, state: self.tileRegionPacks[id]!.state, metadata: nil)
      payload["state"] = self.tileRegionPacks[id]!.state.rawValue
      self._sendEvent(Callbacks.progress.rawValue, event: RNMBXEvent(type: .offlineProgress, payload: payload))
      self.eddyFinishedDownload(id)`],
  ['self.offlinePackProgressDidChange(progress: progess, metadata: metadata, state: .complete)',
    'self.offlinePackProgressDidChange(progress: progess, metadata: metadata, state: .active)'],
  ['                self.tileRegionPacks[id]!.state = .complete',
    '                self.tileRegionPacks[id]!.state = .active'],
  ['                self.tileRegionPacks[id]!.state = .inactive',
    '                downloadError = true\n                self.tileRegionPacks[id]!.state = .inactive'],
  ['    RNMBXEvent(type: .offlineProgress, payload: self._makeRegionStatusPayload(name, progress: progress, state: state, metadata: nil))', `    var payload = self._makeRegionStatusPayload(name, progress: progress, state: state, metadata: nil)
    payload["state"] = state.rawValue
    return RNMBXEvent(type: .offlineProgress, payload: payload)`],
  ['    DispatchQueue.main.async {\n      if let pack = self.tileRegionPacks[name] {\n        pack.cancelables.forEach',
    '    DispatchQueue.main.async {\n      self.eddyPendingDownloads.removeAll { $0.name == name }\n      if let pack = self.tileRegionPacks[name] {\n        pack.cancelables.forEach'],
  ['    DispatchQueue.main.async {\n      guard let pack = self.tileRegionPacks[name] else {',
    '    DispatchQueue.main.async {\n      self.eddyPendingDownloads.removeAll { $0.name == name }\n      guard let pack = self.tileRegionPacks[name] else {'],
  ['      self.tileStore.removeTileRegion(forId: name)',
    '      pack.cancelables.forEach { $0.cancel() }\n      self.tileStore.removeTileRegion(forId: name)'],
  // A newly queued region does not exist in TileStore yet. Report its empty
  // counts rather than turning every progress poll into a native read error.
  ['      self.tileStore.tileRegion(forId: name) { result in', `      if self.eddyPendingDownloads.contains(where: { $0.name == name }),
         let pack = self.tileRegionPacks[name] {
        resolver(self._makeRegionStatusPayload(pack: pack))
        return
      }
      self.tileStore.tileRegion(forId: name) { result in`],
  // The card polls status while loading. Upstream replaces the struct and
  // drops its cancellation handles, so preserve them for pause/removal.
  ['                let pack = TileRegionPack(\n                  name: name,',
    '                var pack = TileRegionPack(\n                  name: name,'],
  ['                self.tileRegionPacks[name] = pack\n                resolver(self._makeRegionStatusPayload(pack: pack))',
    '                pack.cancelables = self.tileRegionPacks[name]?.cancelables ?? []\n                self.tileRegionPacks[name] = pack\n                resolver(self._makeRegionStatusPayload(pack: pack))'],
];

function patchOfflineModule(source) {
  if (source.includes(MARKER)) {
    if (!replacements.every(([, after]) => source.includes(after))) {
      throw new Error('Eddy offline patch is incomplete; reinstall @rnmapbox/maps and prebuild again.');
    }
    return source;
  }
  for (const [before, after] of replacements) {
    if (source.split(before).length !== 2) {
      throw new Error('Eddy offline patch no longer matches @rnmapbox/maps; review its native lifecycle before building.');
    }
    source = source.replace(before, after);
  }
  return source;
}

module.exports = function withSerialMapboxOffline(config) {
  const { withDangerousMod } = require('expo/config-plugins');
  return withDangerousMod(config, ['ios', async next => {
    const root = path.dirname(require.resolve('@rnmapbox/maps/package.json', { paths: [next.modRequest.projectRoot] }));
    const file = path.join(root, 'ios/RNMBX/Offline/RNMBXOfflineModule.swift');
    const source = fs.readFileSync(file, 'utf8');
    const patched = patchOfflineModule(source);
    if (source !== patched) fs.writeFileSync(file, patched);
    return next;
  }]);
};
module.exports.patchOfflineModule = patchOfflineModule;
