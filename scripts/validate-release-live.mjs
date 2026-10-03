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

const storageSource = readFileSync(resolve(root, 'src/lib/storage.ts'), 'utf8');
const consentVersionMatch = storageSource.match(/\bAI_CONSENT_VERSION\s*=\s*(\d+)\s+as const/u);
if (!consentVersionMatch) throw new Error('Could not read AI_CONSENT_VERSION from src/lib/storage.ts.');
const consentVersion = Number(consentVersionMatch[1]);

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
const renderedPolicy = privacyHtml.match(/<main\b[^>]*\bdata-bolo-policy-page=["']privacy["'][^>]*>([\s\S]*?)<\/main>/iu)?.[1];
if (!renderedPolicy) {
  throw new Error('The deployed privacy route is not server-rendered with <main data-bolo-policy-page="privacy">. Bundle strings cannot satisfy the release gate.');
}
const visiblePolicy = renderedPolicy
  .replace(/<(?:script|style|template|noscript)\b[\s\S]*?<\/(?:script|style|template|noscript)>/giu, ' ')
  .replace(/<[^>]+>/gu, ' ')
  .replace(/&nbsp;|&#160;/giu, ' ')
  .replace(/&amp;/giu, '&')
  .replace(/&(?:#39|apos);/giu, "'")
  .replace(/&quot;/giu, '"')
  .replace(/\s+/gu, ' ')
  .trim();
const requiredPrivacyFacts = [
  ['Asha GPT-Live', /Asha[\s\S]{0,80}(?:GPT-Live|gpt-live-1)/iu],
  ['Responses delegation', /Responses delegation/iu],
  ['full-duplex WebRTC media stream', /full-duplex WebRTC media stream/iu],
  ['current lesson ID, title and objective', /current lesson ID[\s\S]{0,80}title[\s\S]{0,80}objective/iu],
  ['selected learner level and active-lesson vocabulary', /selected learner level[\s\S]{0,120}active-lesson vocabulary/iu],
  ['up to eight recent Asha chat messages', /up to eight recent Asha chat messages/iu],
  ['saved-phrase list and count exclusion', /does not send[\s\S]{0,120}saved-phrase list[\s\S]{0,40}counts/iu],
  ['minimal live-tool results', /minimal tool results/iu],
  ['confirmed save and completed progress result scope', /confirmed phrase save[\s\S]{0,120}completed progress update/iu],
  ['active microphone and Mute behavior', /microphone track stays enabled[\s\S]{0,160}Mute disables/iu],
  ['End Chat and foreground cleanup', /released[\s\S]{0,100}End Chat[\s\S]{0,160}(?:foreground|background)/iu],
  ['no live recording file or background capture', /does not create a recording file[\s\S]{0,160}(?:capture|record)[\s\S]{0,100}background/iu],
  ['support contact fields', /Support requests contain the name, email/iu],
  ['bounded local chat retention', /up to 100 recent typed and transcribed Asha chat messages/iu],
  ['unencrypted local storage', /unencrypted storage on this device/iu],
  ['local clear versus report deletion', /Clear chat[\s\S]{0,160}does not delete reports/iu],
  ['current consent version', new RegExp(`AI data-use consent notice version ${consentVersion}`, 'iu')],
];
for (const [label, pattern] of requiredPrivacyFacts) {
  if (!pattern.test(visiblePolicy)) {
    throw new Error(`The deployed public policy is stale: missing ${label}.`);
  }
}

console.log('Live release validation passed: all three public pages serve the Bolo site shell and the rendered privacy route visibly states every required privacy fact.');
