Pod::Spec.new do |s|
  s.name           = 'BoloAudioNormalizer'
  s.version        = '1.0.0'
  s.summary        = 'On-device normalization for generated Bolo speech'
  s.description    = 'Peak-normalizes generated speech locally without changing the active audio session.'
  s.author         = ''
  s.homepage       = 'https://docs.expo.dev/modules/'
  s.platforms      = { :ios => '16.4' }
  s.source         = { git: 'https://github.com/chrisatom1998/BoloMobile.git' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'

  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
  }

  s.source_files = '**/*.{h,m,mm,swift,hpp,cpp}'
end
