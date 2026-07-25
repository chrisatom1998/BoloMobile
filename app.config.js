const DEFAULT_IDENTIFIER = 'com.bolo.hindi';
const IDENTIFIER_PATTERN = /^[a-z][a-z0-9_]*(?:\.[a-z][a-z0-9_]*){2,}$/;
const PROJECT_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const OWNER_PATTERN = /^[a-z0-9][a-z0-9_-]{1,38}$/i;
const DEFAULT_PUBLIC_SITE_URL = 'https://74e39779183cf78fed.v2.appdeploy.ai';
const DEFAULT_API_URL = 'https://api-v2.appdeploy.ai/app/74e39779183cf78fed';

function httpsUrl(name, value, fallback) {
  const configured = value?.trim().replace(/\/+$/u, '');
  if (!configured) return fallback;
  let parsed;
  try {
    parsed = new URL(configured);
  } catch {
    throw new Error(`${name} must be an absolute https URL, for example ${fallback}.`);
  }
  if (parsed.protocol !== 'https:') {
    throw new Error(`${name} must use https://, for example ${fallback}.`);
  }
  return configured;
}

module.exports = ({ config }) => {
  const configuredIdentifier = process.env.BOLO_APP_IDENTIFIER?.trim();
  const envProjectId = process.env.BOLO_EAS_PROJECT_ID?.trim();
  const envOwner = process.env.BOLO_EXPO_OWNER?.trim();
  const configuredProjectId = envProjectId || config.extra?.eas?.projectId;
  const configuredOwner = envOwner || config.owner;
  const identifier = configuredIdentifier || DEFAULT_IDENTIFIER;
  const isProduction = process.env.EAS_BUILD_PROFILE === 'production';
  const publicSiteUrl = httpsUrl('BOLO_PUBLIC_SITE_URL', process.env.BOLO_PUBLIC_SITE_URL, DEFAULT_PUBLIC_SITE_URL);
  const boloApiUrl = httpsUrl('BOLO_API_URL', process.env.BOLO_API_URL, DEFAULT_API_URL);

  if (configuredIdentifier && !IDENTIFIER_PATTERN.test(configuredIdentifier)) {
    throw new Error('BOLO_APP_IDENTIFIER must be a lowercase reverse-domain identifier, for example com.yourdomain.bolo.');
  }
  if (configuredProjectId && !PROJECT_ID_PATTERN.test(configuredProjectId)) {
    throw new Error('BOLO_EAS_PROJECT_ID must be the UUID returned when Bolo is linked to its EAS project.');
  }
  if (configuredOwner && !OWNER_PATTERN.test(configuredOwner)) {
    throw new Error('BOLO_EXPO_OWNER must be a valid Expo account name.');
  }
  if (isProduction && (!envProjectId || !envOwner)) {
    throw new Error('Production builds require BOLO_EAS_PROJECT_ID and BOLO_EXPO_OWNER from the publisher\'s Expo account.');
  }

  const plugins = (Array.isArray(config.plugins) ? config.plugins : []).map((plugin) => {
    if (!Array.isArray(plugin) || plugin[0] !== 'expo-widgets') return plugin;
    const [name, options] = plugin;
    return [name, {
      ...options,
      bundleIdentifier: `${identifier}.widgets`,
      groupIdentifier: `group.${identifier}`,
    }];
  });

  return {
    ...config,
    plugins,
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
      publicPrivacyUrl: `${publicSiteUrl}/?page=privacy`,
      publicSupportUrl: `${publicSiteUrl}/?page=support`,
      publicTermsUrl: `${publicSiteUrl}/?page=terms`,
      boloApiUrl,
      ...(configuredProjectId ? { eas: { ...config.extra?.eas, projectId: configuredProjectId } } : {}),
    },
  };
};
