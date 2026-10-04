Pod::Spec.new do |s|
  s.name = 'EddyOrientation'
  s.version = '1.0.0'
  s.summary = 'Portrait root presentation for Eddy'
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
