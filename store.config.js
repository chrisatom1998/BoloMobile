const baseConfig = require('./store.config.json');

const DEFAULT_PUBLIC_SITE_URL = 'https://74e39779183cf78fed.v2.appdeploy.ai';

function required(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required before pushing App Store metadata.`);
  return value;
}

function publicSiteUrl() {
  const configured = process.env.BOLO_PUBLIC_SITE_URL?.trim().replace(/\/+$/u, '');
  if (!configured) return DEFAULT_PUBLIC_SITE_URL;
  let parsed;
  try {
    parsed = new URL(configured);
  } catch {
    throw new Error(`BOLO_PUBLIC_SITE_URL must be an absolute https URL, for example ${DEFAULT_PUBLIC_SITE_URL}.`);
  }
  if (parsed.protocol !== 'https:') {
    throw new Error(`BOLO_PUBLIC_SITE_URL must use https://, for example ${DEFAULT_PUBLIC_SITE_URL}.`);
  }
  return configured;
}

const publisherName = required('BOLO_PUBLISHER_NAME');
const firstName = required('BOLO_REVIEW_FIRST_NAME');
const lastName = required('BOLO_REVIEW_LAST_NAME');
const email = required('BOLO_REVIEW_EMAIL');
const phone = required('BOLO_REVIEW_PHONE');
const site = publicSiteUrl();

if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('BOLO_REVIEW_EMAIL must be a valid monitored email address.');

module.exports = {
  ...baseConfig,
  apple: {
    ...baseConfig.apple,
    copyright: `${new Date().getFullYear()} ${publisherName}`,
    info: {
      ...baseConfig.apple.info,
      'en-US': {
        ...baseConfig.apple.info['en-US'],
        privacyPolicyUrl: `${site}/privacy`,
        supportUrl: `${site}/support`,
        marketingUrl: `${site}/`,
      },
    },
    review: {
      ...baseConfig.apple.review,
      firstName,
      lastName,
      email,
      phone,
    },
  },
};
