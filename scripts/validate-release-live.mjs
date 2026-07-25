import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const require = createRequire(import.meta.url);
const root = resolve(import.meta.dirname, '..');

const staticConfig = JSON.parse(readFileSync(resolve(root, 'app.json'), 'utf8')).expo;
const resolvedConfig = require(resolve(root, 'app.config.js'))({ config: staticConfig });
const publicPages = {
  privacy: resolvedConfig.extra?.publicPrivacyUrl,
  support: resolvedConfig.extra?.publicSupportUrl,
  terms: resolvedConfig.extra?.publicTermsUrl,
};

const publicPageHtml = new Map();

for (const [page, url] of Object.entries(publicPages)) {
  if (typeof url !== 'string') throw new Error(`The production ${page} URL is missing.`);
  let response;
  try {
    response = await fetch(url, { redirect: 'follow', signal: AbortSignal.timeout(10_000) });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'unknown network error';
    throw new Error(`${url} could not be loaded within 10 seconds: ${message}`);
  }
  if (!response.ok) throw new Error(`${url} returned HTTP ${response.status}.`);
  if (!response.headers.get('content-type')?.toLowerCase().includes('text/html')) {
    throw new Error(`${url} did not return an HTML page.`);
  }
  const html = await response.text();
  if (!html.includes('<title>Bolo Hindi</title>') || !html.includes('id="root"')) {
    throw new Error(`${url} did not return the Bolo public-site shell.`);
  }
  publicPageHtml.set(page, html);
}

const privacyHtml = publicPageHtml.get('privacy') || '';
const bundleMatch = privacyHtml.match(/<script[^>]+type=["']module["'][^>]+src=["']([^"']+)["']/i)
  || privacyHtml.match(/<script[^>]+src=["']([^"']+)["'][^>]+type=["']module["']/i);
if (!bundleMatch) throw new Error('The public privacy page did not reference its application bundle.');
const publicBundleUrl = new URL(bundleMatch[1], publicPages.privacy);
let bundleResponse;
try {
  bundleResponse = await fetch(publicBundleUrl, { redirect: 'follow', signal: AbortSignal.timeout(10_000) });
} catch (error) {
  const message = error instanceof Error ? error.message : 'unknown network error';
  throw new Error(`The public privacy bundle could not be loaded within 10 seconds: ${message}`);
}
if (!bundleResponse.ok) throw new Error(`The public privacy bundle returned HTTP ${bundleResponse.status}.`);
const publicBundle = await bundleResponse.text();
const requiredPrivacyFacts = [
  'WebRTC media stream',
  'short-lived OpenAI Realtime credential',
  'audio track disabled',
  'Send turn',
  'segments microphone audio in memory without creating a recording file',
  'Support requests contain the name, email',
  'up to 100 recent typed and transcribed Asha chat messages',
  'unencrypted storage on this device',
  'Clear chat',
  'does not delete reports',
];
for (const fact of requiredPrivacyFacts) {
  if (!publicBundle.includes(fact)) {
    throw new Error(`The deployed public policy is stale: missing “${fact}”.`);
  }
}

console.log('Live release validation passed: all three public pages serve the Bolo site shell and the deployed policy bundle states every required privacy fact.');
