const baseConfig = require('./store.config.json');

function required(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required before pushing App Store metadata.`);
  return value;
}

const publisherName = required('BOLO_PUBLISHER_NAME');
const firstName = required('BOLO_REVIEW_FIRST_NAME');
const lastName = required('BOLO_REVIEW_LAST_NAME');
const email = required('BOLO_REVIEW_EMAIL');
const phone = required('BOLO_REVIEW_PHONE');

if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('BOLO_REVIEW_EMAIL must be a valid monitored email address.');

module.exports = {
  ...baseConfig,
  apple: {
    ...baseConfig.apple,
    copyright: `${new Date().getFullYear()} ${publisherName}`,
    review: {
      ...baseConfig.apple.review,
      firstName,
      lastName,
      email,
      phone,
    },
  },
};
