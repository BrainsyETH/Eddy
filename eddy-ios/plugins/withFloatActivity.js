// Generate the WidgetKit target during prebuild. No generated ios/ files belong
// in git or EAS uploads; the same attributes source compiles in both targets.
const { withInfoPlist, withEntitlementsPlist, withXcodeProject } = require('expo/config-plugins');
const plist = require('@expo/plist').default;
const fs = require('node:fs');
const path = require('node:path');
const TARGET = 'EddyFloatActivity';
const appGroup = (config) => `group.${config.ios.bundleIdentifier}.widgets`;
const SOURCES = ['FloatActivityAttributes.swift', 'EddyFloatActivity.swift', 'ConditionWidgetData.swift', 'EddyConditionsWidgets.swift', 'SupplementaryWidgetData.swift', 'EddyReportWidgets.swift'];

function configureProject(project, root, config) {
  const source = path.join(root, 'modules/eddy-live-activity');
  const destination = path.join(root, 'ios', TARGET);
  fs.mkdirSync(destination, { recursive: true });
  for (const [from, to] of [
    ['ios/FloatActivityAttributes.swift', 'FloatActivityAttributes.swift'],
    ['widget/EddyFloatActivity.swift', 'EddyFloatActivity.swift'],
    ['ios/ConditionWidgetData.swift', 'ConditionWidgetData.swift'],
    ['widget/EddyConditionsWidgets.swift', 'EddyConditionsWidgets.swift'],
    ['widget/ConditionsPreview.json', 'ConditionsPreview.json'],
    ['ios/SupplementaryWidgetData.swift', 'SupplementaryWidgetData.swift'],
    ['widget/EddyReportWidgets.swift', 'EddyReportWidgets.swift'],
    ['widget/DamWidgetCatalog.json', 'DamWidgetCatalog.json'],
  ]) fs.copyFileSync(path.join(source, from), path.join(destination, to));
  fs.writeFileSync(path.join(destination, `${TARGET}-Info.plist`), `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
<key>CFBundleDisplayName</key><string>Eddy Float</string>
<key>CFBundleExecutable</key><string>$(EXECUTABLE_NAME)</string>
<key>CFBundleIdentifier</key><string>$(PRODUCT_BUNDLE_IDENTIFIER)</string>
<key>CFBundleInfoDictionaryVersion</key><string>6.0</string>
<key>CFBundleName</key><string>$(PRODUCT_NAME)</string>
<key>CFBundlePackageType</key><string>XPC!</string>
<key>CFBundleShortVersionString</key><string>$(MARKETING_VERSION)</string>
<key>CFBundleVersion</key><string>$(CURRENT_PROJECT_VERSION)</string>
<key>NSExtension</key><dict><key>NSExtensionPointIdentifier</key><string>com.apple.widgetkit-extension</string></dict>
</dict></plist>
`);
  const infoPath = path.join(destination, `${TARGET}-Info.plist`);
  const info = plist.parse(fs.readFileSync(infoPath, 'utf8'));
  info.CFBundleDisplayName = 'Eddy';
  info.EddyWidgetAppGroup = appGroup(config);
  info.EddyWidgetAPIBaseURL = config.extra?.apiBaseUrl ?? 'https://eddy.guide';
  fs.writeFileSync(infoPath, plist.build(info));
  fs.writeFileSync(path.join(destination, `${TARGET}.entitlements`), plist.build({
    'com.apple.security.application-groups': [appGroup(config)],
  }));
  fs.writeFileSync(path.join(destination, 'PrivacyInfo.xcprivacy'), plist.build({
    NSPrivacyAccessedAPITypes: [{
      NSPrivacyAccessedAPIType: 'NSPrivacyAccessedAPICategoryUserDefaults',
      NSPrivacyAccessedAPITypeReasons: ['1C8F.1'],
    }],
  }));
  const assets = path.join(destination, 'Assets.xcassets');
  const otter = path.join(assets, 'FloatOtter.imageset');
  fs.mkdirSync(otter, { recursive: true });
  fs.copyFileSync(path.join(root, 'assets/otter/standard.png'), path.join(otter, 'otter.png'));
  fs.writeFileSync(path.join(assets, 'Contents.json'), JSON.stringify({ info: { version: 1, author: 'xcode' } }));
  fs.writeFileSync(path.join(otter, 'Contents.json'), JSON.stringify({ images: [{ filename: 'otter.png', idiom: 'universal' }], info: { version: 1, author: 'xcode' } }));
  const gaugeOtter = path.join(assets, 'GaugeOtter.imageset');
  fs.mkdirSync(gaugeOtter, { recursive: true });
  fs.copyFileSync(path.join(root, 'assets/eddy/eddy-checking-gauge.png'), path.join(gaugeOtter, 'otter.png'));
  fs.copyFileSync(path.join(otter, 'Contents.json'), path.join(gaugeOtter, 'Contents.json'));

  const nativeTargets = project.pbxNativeTargetSection();
  // xcode silently skips addTargetDependency when these empty sections are
  // absent (as in Expo's template). Ensure they exist before adding a target.
  const objects = project.hash.project.objects;
  objects.PBXTargetDependency ??= {};
  objects.PBXContainerItemProxy ??= {};
  const existing = Object.entries(nativeTargets).find(([, value]) => typeof value === 'object' && value.name?.replaceAll('"', '') === TARGET);
  const target = existing ? { uuid: existing[0], pbxNativeTarget: existing[1] } : project.addTarget(TARGET, 'app_extension', TARGET, `${config.ios.bundleIdentifier}.FloatActivity`);
  if (!existing) {
    // addTarget embeds the .appex and adds the host dependency itself.
    project.addBuildPhase([], 'PBXSourcesBuildPhase', 'Sources', target.uuid);
    project.addBuildPhase([], 'PBXResourcesBuildPhase', 'Resources', target.uuid);
    project.addBuildPhase([], 'PBXFrameworksBuildPhase', 'Frameworks', target.uuid);
    const group = project.addPbxGroup([], TARGET, TARGET);
    const main = project.getFirstProject().firstProject.mainGroup;
    project.getPBXGroupByKey(main).children.push({ value: group.uuid, comment: TARGET });
    // addResourceFile assumes a legacy global "Resources" group. Expo's
    // modern template has none; attach this catalog to our own group/phase.
    const catalog = project.addFile('Assets.xcassets', group.uuid);
    catalog.uuid = project.generateUuid();
    catalog.target = target.uuid;
    project.addToPbxBuildFileSection(catalog);
    project.addToPbxResourcesBuildPhase(catalog);
  }
  // Also add new sources to an EXISTING target on non-clean prebuilds.
  // xcode's addSourceFile checks existing references, so repeated runs are safe.
  const groupId = project.findPBXGroupKey({ name: TARGET });
  for (const file of SOURCES) project.addSourceFile(file, { target: target.uuid }, groupId);
  for (const name of ['PrivacyInfo.xcprivacy', 'ConditionsPreview.json', 'DamWidgetCatalog.json']) {
    const resource = project.addFile(name, groupId);
    if (resource) {
      resource.uuid = project.generateUuid();
      resource.target = target.uuid;
      project.addToPbxBuildFileSection(resource);
      project.addToPbxResourcesBuildPhase(resource);
    }
  }

  const lists = project.pbxXCConfigurationList();
  const configurations = project.pbxXCBuildConfigurationSection();
  const host = project.getFirstTarget().firstTarget;
  if (!host.dependencies.some(({ value }) => objects.PBXTargetDependency[value]?.target === target.uuid)) {
    project.addTargetDependency(project.getFirstTarget().uuid, [target.uuid]);
  }
  const hostConfigs = lists[host.buildConfigurationList].buildConfigurations.map(({ value }) => configurations[value]);
  for (const { value } of lists[target.pbxNativeTarget.buildConfigurationList].buildConfigurations) {
    const build = configurations[value];
    const hostSettings = hostConfigs.find((c) => c.name === build.name)?.buildSettings ?? {};
    Object.assign(build.buildSettings, {
      INFOPLIST_FILE: `"${TARGET}/${TARGET}-Info.plist"`,
      PRODUCT_BUNDLE_IDENTIFIER: `"${config.ios.bundleIdentifier}.FloatActivity"`,
      // Expo writes app versions directly into Info.plist; the host build
      // setting can still say template "1.0". These are local/prebuild values.
      // EAS remote versioning later rewrites every provisioned target's plist;
      // verify both final versions in the first .ipa.
      MARKETING_VERSION: config.version,
      CURRENT_PROJECT_VERSION: config.ios.buildNumber ?? hostSettings.CURRENT_PROJECT_VERSION ?? '1',
      SWIFT_VERSION: '5.0',
      IPHONEOS_DEPLOYMENT_TARGET: '18.0',
      TARGETED_DEVICE_FAMILY: '1',
      APPLICATION_EXTENSION_API_ONLY: 'YES',
      SKIP_INSTALL: 'YES',
      GENERATE_INFOPLIST_FILE: 'NO',
      CODE_SIGN_STYLE: 'Automatic',
      CODE_SIGN_ENTITLEMENTS: `"${TARGET}/${TARGET}.entitlements"`,
      LD_RUNPATH_SEARCH_PATHS: '"$(inherited) @executable_path/Frameworks @executable_path/../../Frameworks"',
    });
    if (hostSettings.DEVELOPMENT_TEAM) build.buildSettings.DEVELOPMENT_TEAM = hostSettings.DEVELOPMENT_TEAM;
  }
  return project;
}

function withFloatActivity(config) {
  // The host already uses its own defaults; the widget adds shared-group
  // defaults. Preserve declarations from other plugins rather than replacing.
  const privacy = config.ios.privacyManifests ??= {};
  const types = privacy.NSPrivacyAccessedAPITypes ??= [];
  const defaultsType = 'NSPrivacyAccessedAPICategoryUserDefaults';
  let defaults = types.find((type) => type.NSPrivacyAccessedAPIType === defaultsType);
  if (!defaults) types.push(defaults = { NSPrivacyAccessedAPIType: defaultsType, NSPrivacyAccessedAPITypeReasons: [] });
  defaults.NSPrivacyAccessedAPITypeReasons = [...new Set([...defaults.NSPrivacyAccessedAPITypeReasons, 'CA92.1', '1C8F.1'])];
  const groupsKey = 'com.apple.security.application-groups';
  const groups = [...new Set([...(config.ios.entitlements?.[groupsKey] ?? []), appGroup(config)])];
  config.ios.entitlements = { ...config.ios.entitlements, [groupsKey]: groups };
  config = withEntitlementsPlist(config, (mod) => {
    mod.modResults[groupsKey] = [...new Set([...(mod.modResults[groupsKey] ?? []), ...groups])];
    return mod;
  });
  config = withInfoPlist(config, (mod) => {
    mod.modResults.NSSupportsLiveActivities = true;
    mod.modResults.EddyWidgetAppGroup = appGroup(config);
    return mod;
  });
  // EAS discovers extension credentials BEFORE prebuild runs on the worker.
  const eas = (config.extra ??= {}).eas ??= {};
  const ios = ((eas.build ??= {}).experimental ??= {}).ios ??= {};
  ios.appExtensions = [
    ...(ios.appExtensions ?? []).filter((extension) => extension.targetName !== TARGET),
    { targetName: TARGET, bundleIdentifier: `${config.ios.bundleIdentifier}.FloatActivity`, entitlements: { [groupsKey]: [appGroup(config)] } },
  ];
  return withXcodeProject(config, (mod) => {
    mod.modResults = configureProject(mod.modResults, mod.modRequest.projectRoot, config);
    return mod;
  });
}
module.exports = withFloatActivity;
module.exports.configureProject = configureProject;
