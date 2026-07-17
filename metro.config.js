const path = require('node:path');
const { getDefaultConfig } = require('expo/metro-config');

/** @type {import('expo/metro-config').MetroConfig} */
const config = getDefaultConfig(__dirname);
const reactNativeWebRtcSegment = `${path.sep}react-native-webrtc${path.sep}`;

config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (
    moduleName === 'event-target-shim/index'
    && context.originModulePath.includes(reactNativeWebRtcSegment)
  ) {
    return context.resolveRequest(context, 'event-target-shim', platform);
  }

  return context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
