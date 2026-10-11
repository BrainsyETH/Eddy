Pod::Spec.new do |s|
  s.name = 'EddyLinks'
  s.version = '1.0.0'
  s.summary = 'App-only universal link handoff for Eddy booking links'
  s.description = s.summary
  s.license = { :type => 'Proprietary' }
  s.author = 'Eddy'
  s.homepage = 'https://eddy.guide'
  s.source = { :git => 'https://github.com/BrainsyETH/Eddy.git' }
  s.platform = :ios, '16.4'
  s.static_framework = true
  s.dependency 'ExpoModulesCore'
  s.source_files = '**/*.swift'
  s.pod_target_xcconfig = { 'DEFINES_MODULE' => 'YES' }
end
