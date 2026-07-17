const DEFAULT_IDENTIFIER = 'com.bolo.hindi';
const IDENTIFIER_PATTERN = /^[a-z][a-z0-9_]*(?:\.[a-z][a-z0-9_]*){2,}$/;
const PROJECT_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const OWNER_PATTERN = /^[a-z0-9][a-z0-9_-]{1,38}$/i;

module.exports = ({ config }) => {
  const configuredIdentifier = process.env.BOLO_APP_IDENTIFIER?.trim();
  const configuredProjectId = process.env.BOLO_EAS_PROJECT_ID?.trim() || config.extra?.eas?.projectId;
  const configuredOwner = process.env.BOLO_EXPO_OWNER?.trim() || config.owner;
  const identifier = configuredIdentifier || DEFAULT_IDENTIFIER;
  const isProduction = process.env.EAS_BUILD_PROFILE === 'production';

  if (configuredIdentifier && !IDENTIFIER_PATTERN.test(configuredIdentifier)) {
    throw new Error('BOLO_APP_IDENTIFIER must be a lowercase reverse-domain identifier, for example com.yourdomain.bolo.');
  }
  if (configuredProjectId && !PROJECT_ID_PATTERN.test(configuredProjectId)) {
    throw new Error('BOLO_EAS_PROJECT_ID must be the UUID returned when Bolo is linked to its EAS project.');
  }
  if (configuredOwner && !OWNER_PATTERN.test(configuredOwner)) {
    throw new Error('BOLO_EXPO_OWNER must be a valid Expo account name.');
  }
  if (isProduction && (!configuredProjectId || !configuredOwner)) {
    throw new Error('Production builds require BOLO_EAS_PROJECT_ID and BOLO_EXPO_OWNER from the publisher\'s Expo account.');
  }

  return {
    ...config,
    ios: {
      ...config.ios,
      bundleIdentifier: identifier,
    },
    android: {
      ...config.android,
      package: identifier,
    },
    owner: configuredOwner,
    extra: {
      ...config.extra,
      publicPrivacyUrl: 'https://74e39779183cf78fed.v2.appdeploy.ai/?page=privacy',
      publicSupportUrl: 'https://74e39779183cf78fed.v2.appdeploy.ai/?page=support',
      publicTermsUrl: 'https://74e39779183cf78fed.v2.appdeploy.ai/?page=terms',
      ...(configuredProjectId ? { eas: { ...config.extra?.eas, projectId: configuredProjectId } } : {}),
    },
  };
};
