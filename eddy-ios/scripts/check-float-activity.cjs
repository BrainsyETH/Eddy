// Run after `expo prebuild --platform ios --no-install`. Verifies generated
// target structure, resources, versions and idempotence, not Swift compilation.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const xcode = require('xcode');
const plist = require('@expo/plist').default;
const { configureProject } = require('../plugins/withFloatActivity');
const root = path.resolve(__dirname, '..');
const config = require('../app.json').expo;
const project = xcode.project(path.join(root, 'ios/Eddy.xcodeproj/project.pbxproj')).parseSync();
const objects = project.hash.project.objects;
const entries = (section) => Object.entries(section).filter(([key]) => !key.endsWith('_comment'));
const targets = entries(objects.PBXNativeTarget).filter(([, t]) => t.name.replaceAll('"', '') === 'EddyFloatActivity');
assert.equal(targets.length, 1, 'one extension');
const [id, target] = targets[0];
const host = project.getFirstTarget().firstTarget;
const hostSources = host.buildPhases.flatMap(({ value }) => objects.PBXSourcesBuildPhase?.[value]?.files ?? [])
  .map(({ value }) => objects.PBXFileReference[objects.PBXBuildFile[value].fileRef].path.replaceAll('"', ''));
for (const name of ['EddyAppShortcuts.swift', 'ShortcutData.swift']) {
  assert.equal(hostSources.filter(file => file === name).length, 1, 'App Intents metadata is compiled in the host once');
}
assert.match(fs.readFileSync(path.join(root, 'ios/Eddy/AppDelegate.swift'), 'utf8'), /EddyAppShortcuts\.register\(\)/);
assert.equal(host.dependencies.filter(({ value }) => objects.PBXTargetDependency[value]?.target === id).length, 1, 'host builds the extension');
const embedded = host.buildPhases.flatMap(({ value }) => objects.PBXCopyFilesBuildPhase?.[value]?.files ?? []);
assert.equal(embedded.filter(({ value }) => objects.PBXBuildFile[value].fileRef === target.productReference).length, 1, 'host embeds the appex once');
const files = (kind) => target.buildPhases.flatMap(({ value }) => objects[kind]?.[value]?.files ?? []).map(({ value }) => objects.PBXFileReference[objects.PBXBuildFile[value].fileRef].path.replaceAll('"', ''));
assert.deepEqual(files('PBXSourcesBuildPhase').sort(), ['ConditionWidgetData.swift', 'EddyConditionsWidgets.swift', 'EddyFloatActivity.swift', 'EddyReportWidgets.swift', 'FloatActivityAttributes.swift', 'SupplementaryWidgetData.swift']);
assert.deepEqual(files('PBXResourcesBuildPhase').sort(), ['Assets.xcassets', 'ConditionsPreview.json', 'DamWidgetCatalog.json', 'PrivacyInfo.xcprivacy']);
const hostInfo = plist.parse(fs.readFileSync(path.join(root, 'ios/Eddy/Info.plist'), 'utf8'));
assert.equal(hostInfo.NSSupportsLiveActivities, true);
const group = `group.${config.ios.bundleIdentifier}.widgets`;
assert.equal(hostInfo.EddyWidgetAppGroup, group);
const extensionInfo = plist.parse(fs.readFileSync(path.join(root, 'ios/EddyFloatActivity/EddyFloatActivity-Info.plist'), 'utf8'));
assert.equal(extensionInfo.EddyWidgetAppGroup, group);
assert.equal(extensionInfo.EddyWidgetAPIBaseURL, config.extra.apiBaseUrl);
const entitlements = { 'com.apple.security.application-groups': [group] };
const hostEntitlements = plist.parse(fs.readFileSync(path.join(root, 'ios/Eddy/Eddy.entitlements'), 'utf8'));
assert.deepEqual(hostEntitlements['com.apple.security.application-groups'], [group]);
assert.deepEqual({ ...plist.parse(fs.readFileSync(path.join(root, 'ios/EddyFloatActivity/EddyFloatActivity.entitlements'), 'utf8')) }, entitlements);
assert.ok(fs.existsSync(path.join(root, 'ios/EddyFloatActivity/Assets.xcassets/GaugeOtter.imageset/otter.png')));
for (const [name, file] of [['DamMark', 'eddy-dam.png'], ['RiverMark', 'eddy-river.png']]) {
  assert.deepEqual(fs.readFileSync(path.join(root, `ios/EddyFloatActivity/Assets.xcassets/${name}.imageset/otter.png`)),
    fs.readFileSync(path.join(root, 'assets/eddy', file)), 'widget embeds the existing brand asset');
}
const widgetPrivacy = plist.parse(fs.readFileSync(path.join(root, 'ios/EddyFloatActivity/PrivacyInfo.xcprivacy'), 'utf8'));
assert.deepEqual(widgetPrivacy.NSPrivacyAccessedAPITypes.map((type) => ({ ...type })), [{ NSPrivacyAccessedAPIType: 'NSPrivacyAccessedAPICategoryUserDefaults', NSPrivacyAccessedAPITypeReasons: ['1C8F.1'] }]);
const hostPrivacy = plist.parse(fs.readFileSync(path.join(root, 'ios/Eddy/PrivacyInfo.xcprivacy'), 'utf8'));
assert.ok(hostPrivacy.NSPrivacyAccessedAPITypes.find((type) => type.NSPrivacyAccessedAPIType === 'NSPrivacyAccessedAPICategoryUserDefaults').NSPrivacyAccessedAPITypeReasons.includes('1C8F.1'));
for (const { value } of objects.XCConfigurationList[target.buildConfigurationList].buildConfigurations) {
  const settings = objects.XCBuildConfiguration[value].buildSettings;
  assert.equal(String(settings.MARKETING_VERSION), hostInfo.CFBundleShortVersionString);
  assert.equal(String(settings.CURRENT_PROJECT_VERSION), hostInfo.CFBundleVersion);
  assert.equal(settings.PRODUCT_BUNDLE_IDENTIFIER.replaceAll('"', ''), `${config.ios.bundleIdentifier}.FloatActivity`);
  assert.equal(settings.APPLICATION_EXTENSION_API_ONLY, 'YES');
  assert.equal(settings.CODE_SIGN_ENTITLEMENTS.replaceAll('"', ''), 'EddyFloatActivity/EddyFloatActivity.entitlements');
}
assert.equal(fs.readFileSync(path.join(root, 'ios/EddyFloatActivity/FloatActivityAttributes.swift'), 'utf8'), fs.readFileSync(path.join(root, 'modules/eddy-live-activity/ios/FloatActivityAttributes.swift'), 'utf8'));
for (const [source, generated] of [
  ['ios/ConditionWidgetData.swift', 'ConditionWidgetData.swift'],
  ['widget/EddyConditionsWidgets.swift', 'EddyConditionsWidgets.swift'],
  ['widget/ConditionsPreview.json', 'ConditionsPreview.json'],
    ['ios/SupplementaryWidgetData.swift', 'SupplementaryWidgetData.swift'],
    ['widget/EddyReportWidgets.swift', 'EddyReportWidgets.swift'],
    ['widget/DamWidgetCatalog.json', 'DamWidgetCatalog.json'],
]) assert.equal(fs.readFileSync(path.join(root, 'ios/EddyFloatActivity', generated), 'utf8'), fs.readFileSync(path.join(root, 'modules/eddy-live-activity', source), 'utf8'));
const before = project.writeSync();
configureProject(project, root, config);
const once = project.writeSync();
configureProject(project, root, config);
assert.equal(project.writeSync(), once, 'plugin is idempotent');
// Parser normalizes number/string values on the first pass; no references may change.
assert.equal(entries(objects.PBXNativeTarget).length, 2);
assert.equal((before.match(/isa = PBXBuildFile;/g) ?? []).length, (once.match(/isa = PBXBuildFile;/g) ?? []).length);
const withPlugin = require('../plugins/withFloatActivity')(structuredClone(config));
const extensions = withPlugin.extra.eas.build.experimental.ios.appExtensions;
assert.deepEqual(extensions, [{ targetName: 'EddyFloatActivity', bundleIdentifier: `${config.ios.bundleIdentifier}.FloatActivity`, entitlements }]);
assert.deepEqual(require('../plugins/withFloatActivity')(withPlugin).extra.eas.build.experimental.ios.appExtensions, extensions);
console.log('Live Activity target, embedding, sources, resources, versions, EAS credentials and repeated plugin application verified.');
