Pod::Spec.new do |s|
  s.name = 'EddyStylePack'
  s.version = '1.0.0'
  s.summary = 'Reads Mapbox offline style pack completeness for Float Mode'
  s.description = s.summary
  s.license = { :type => 'Proprietary' }
  s.author = 'Eddy'
  s.homepage = 'https://eddy.guide'
  s.source = { :git => 'https://github.com/BrainsyETH/Eddy.git' }
  s.platform = :ios, '16.4'
  s.static_framework = true
  s.dependency 'ExpoModulesCore'
  # No version here on purpose: link whatever MapboxMaps @rnmapbox/maps pins
  # (its podspec declares the pod), so the two can never disagree.
  s.dependency 'MapboxMaps'
  s.source_files = '**/*.swift'
  s.pod_target_xcconfig = { 'DEFINES_MODULE' => 'YES' }
end
