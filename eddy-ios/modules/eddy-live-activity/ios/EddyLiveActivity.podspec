Pod::Spec.new do |s|
  s.name = 'EddyLiveActivity'
  s.version = '1.0.0'
  s.summary = 'Local Float Mode Live Activity'
  s.description = s.summary
  s.license = { :type => 'Proprietary' }
  s.author = 'Eddy'
  s.homepage = 'https://eddy.guide'
  s.source = { :git => 'https://github.com/BrainsyETH/Eddy.git' }
  s.platform = :ios, '16.4'
  s.static_framework = true
  s.dependency 'ExpoModulesCore'
  s.frameworks = 'ActivityKit', 'UIKit'
  s.source_files = '*.swift'
  s.swift_version = '5.0'
  s.pod_target_xcconfig = { 'DEFINES_MODULE' => 'YES' }
end
