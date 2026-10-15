Pod::Spec.new do |s|
  s.name = 'EddyFloatRecorder'
  s.version = '1.0.0'
  s.summary = 'Native GPS recording for Float Mode'
  s.description = s.summary
  s.license = { :type => 'Proprietary' }
  s.author = 'Eddy'
  s.homepage = 'https://eddy.guide'
  s.source = { :git => 'https://github.com/BrainsyETH/Eddy.git' }
  s.platform = :ios, '18.0'
  s.static_framework = true
  s.swift_version = '5.9'
  s.dependency 'ExpoModulesCore'
  s.source_files = '**/*.swift'
  s.frameworks = 'CoreLocation'
  s.pod_target_xcconfig = { 'DEFINES_MODULE' => 'YES' }
end
