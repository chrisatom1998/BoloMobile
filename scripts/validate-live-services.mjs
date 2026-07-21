#!/usr/bin/env node

import { randomBytes } from 'node:crypto';
import { performance } from 'node:perf_hooks';

const API_URL = 'https://api-v2.appdeploy.ai/app/74e39779183cf78fed';
const PUBLIC_URL = 'https://74e39779183cf78fed.v2.appdeploy.ai/';
const PASSES = 3;
const REQUEST_TIMEOUT_MS = 45_000;
const OVERALL_TIMEOUT_MS = 10 * 60_000;
const MAX_JSON_BYTES = 8_500_000;
const MAX_HTML_BYTES = 2_000_000;
const deadline = Date.now() + OVERALL_TIMEOUT_MS;

const failures = [];
let checksPassed = 0;

function fail(label, message) {
  throw new Error(`${label}: ${message}`);
}

function assert(condition, label, message) {
  if (!condition) fail(label, message);
}

function objectValue(value, label) {
  assert(value !== null && typeof value === 'object' && !Array.isArray(value), label, 'expected a JSON object');
  return value;
}

function textValue(value, label, maximum) {
  assert(typeof value === 'string', label, 'expected text');
  const text = value.trim();
  assert(text.length > 0, label, 'received empty text');
  assert(text.length <= maximum, label, `text exceeded ${maximum} characters`);
  return text;
}

function containsDevanagari(value) {
  return /[\u0900-\u097F]/u.test(value);
}

function safeError(error) {
  if (!(error instanceof Error)) return 'unknown failure';
  return error.message.replace(/ek_[A-Za-z0-9_-]+/g, '[realtime secret redacted]');
}

function requestSignal(label, timeoutMs = REQUEST_TIMEOUT_MS) {
  const remaining = deadline - Date.now();
  if (remaining <= 0) fail(label, `overall ${OVERALL_TIMEOUT_MS / 60_000}-minute deadline exceeded`);
  return AbortSignal.timeout(Math.max(1, Math.min(timeoutMs, remaining)));
}

async function readBoundedText(response, label, maximum) {
  const declaredLength = Number(response.headers.get('content-length'));
  if (Number.isFinite(declaredLength)) {
    assert(declaredLength <= maximum, label, `declared response size exceeded ${maximum} bytes`);
  }
  const text = await response.text();
  assert(Buffer.byteLength(text, 'utf8') <= maximum, label, `response size exceeded ${maximum} bytes`);
  return text;
}

async function postJson(label, path, body) {
  const startedAt = performance.now();
  let response;
  try {
    response = await fetch(`${API_URL}${path}`, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        'User-Agent': 'BoloLiveAcceptance/1.0',
      },
      body: JSON.stringify(body),
      signal: requestSignal(label),
    });
  } catch (error) {
    if (error instanceof Error && (error.name === 'TimeoutError' || error.name === 'AbortError')) {
      fail(label, `request exceeded the ${REQUEST_TIMEOUT_MS / 1000}-second limit`);
    }
    fail(label, `network request failed (${safeError(error)})`);
  }

  const raw = await readBoundedText(response, label, MAX_JSON_BYTES);
  let payload;
  try {
    payload = JSON.parse(raw);
  } catch {
    fail(label, `HTTP ${response.status} did not return JSON`);
  }

  if (!response.ok) {
    const publicMessage = payload && typeof payload === 'object' && typeof payload.error === 'string'
      ? payload.error.slice(0, 300)
      : 'no safe error detail';
    fail(label, `HTTP ${response.status}: ${publicMessage}`);
  }

  return { elapsedMs: Math.round(performance.now() - startedAt), payload: objectValue(payload, label) };
}

function decodeMp3(payload, label) {
  assert(payload.mimeType === 'audio/mpeg', label, 'expected mimeType audio/mpeg');
  assert(typeof payload.audioBase64 === 'string', label, 'expected base64 audio');
  const base64 = payload.audioBase64;
  assert(base64.length > 0 && base64.length <= 8_000_000, label, 'base64 audio was empty or over 8,000,000 characters');
  assert(/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(base64), label, 'audio was not strict base64');
  const bytes = Buffer.from(base64, 'base64');
  const roundTrip = bytes.toString('base64').replace(/=+$/u, '');
  assert(roundTrip === base64.replace(/=+$/u, ''), label, 'base64 audio did not round-trip');
  assert(bytes.length >= 1_000 && bytes.length <= 6_000_000, label, 'decoded MP3 had an implausible size');
  const hasId3 = bytes.subarray(0, 3).toString('ascii') === 'ID3';
  let hasMpegFrame = false;
  for (let index = 0; index < Math.min(bytes.length - 1, 4_096); index += 1) {
    if (bytes[index] === 0xff && (bytes[index + 1] & 0xe0) === 0xe0) {
      hasMpegFrame = true;
      break;
    }
  }
  assert(hasId3 || hasMpegFrame, label, 'decoded audio did not have an MP3 signature');
  return bytes;
}

async function check(label, operation, successDetail) {
  try {
    const result = await operation();
    checksPassed += 1;
    const detail = typeof successDetail === 'function' ? successDetail(result) : successDetail;
    console.log(`  PASS ${label}${detail ? ` — ${detail}` : ''}`);
    return result;
  } catch (error) {
    const message = safeError(error);
    failures.push(`${label}: ${message}`);
    console.error(`  FAIL ${label} — ${message}`);
    return undefined;
  }
}

function clientIdFor(pass) {
  return `boloacc-${Date.now().toString(36)}-${pass}-${randomBytes(4).toString('hex')}`;
}

async function runServicePass(pass) {
  const clientId = clientIdFor(pass);
  let deleteSucceeded = false;
  let reportSucceeded = false;

  console.log(`\nService pass ${pass}/${PASSES}`);
  try {
    await check(`mobile-chat English #${pass}`, async () => {
      const result = await postJson(`mobile-chat English #${pass}`, '/api/mobile-chat', {
        text: 'Please correct this sentence in English: I needs water.',
        messages: [],
        clientId,
        languageMode: 'english-unless-hindi-requested',
      });
      const transcript = textValue(result.payload.transcript, `mobile-chat English #${pass} transcript`, 1_200);
      const reply = textValue(result.payload.reply, `mobile-chat English #${pass} reply`, 2_400);
      assert(result.payload.language === 'en', `mobile-chat English #${pass}`, 'language was not en');
      assert(!containsDevanagari(reply), `mobile-chat English #${pass}`, 'default English reply contained Devanagari');
      assert(transcript.includes('I needs water'), `mobile-chat English #${pass}`, 'transcript did not preserve the learner turn');
      return { elapsedMs: result.elapsedMs, replyLength: reply.length };
    }, (result) => `${result.elapsedMs} ms; ${result.replyLength}-character English reply`);

    await check(`mobile-chat Hindi #${pass}`, async () => {
      const result = await postJson(`mobile-chat Hindi #${pass}`, '/api/mobile-chat', {
        text: 'Respond in natural Hindi written only in Romanized Latin script. Never use Devanagari. Ask me how I am today.',
        messages: [],
        clientId,
        languageMode: 'english-unless-hindi-requested',
      });
      textValue(result.payload.transcript, `mobile-chat Hindi #${pass} transcript`, 1_200);
      const reply = textValue(result.payload.reply, `mobile-chat Hindi #${pass} reply`, 2_400);
      assert(result.payload.language === 'hi', `mobile-chat Hindi #${pass}`, 'explicit Hindi request was not tagged hi');
      assert(!containsDevanagari(reply), `mobile-chat Hindi #${pass}`, 'Romanized Hindi reply unexpectedly contained Devanagari');
      assert(/[A-Za-z]/u.test(reply), `mobile-chat Hindi #${pass}`, 'Romanized Hindi reply did not contain Latin text');
      return { elapsedMs: result.elapsedMs, replyLength: reply.length };
    }, (result) => `${result.elapsedMs} ms; ${result.replyLength}-character Romanized Hindi reply`);

    const phrase = await check(`phrase-audio #${pass}`, async () => {
      const result = await postJson(`phrase-audio #${pass}`, '/api/phrase-audio', { text: 'मुझे पानी चाहिए।' });
      const bytes = decodeMp3(result.payload, `phrase-audio #${pass}`);
      return {
        audioBase64: result.payload.audioBase64,
        bytes: bytes.length,
        elapsedMs: result.elapsedMs,
        mimeType: result.payload.mimeType,
      };
    }, (result) => `${result.elapsedMs} ms; ${result.bytes} decoded MP3 bytes`);

    if (phrase) {
      await check(`voice-coach #${pass}`, async () => {
        const result = await postJson(`voice-coach #${pass}`, '/api/voice-coach', {
          audioBase64: phrase.audioBase64,
          mimeType: phrase.mimeType,
          target: {
            hi: 'मुझे पानी चाहिए।',
            latin: 'Mujhe paani chahiye.',
            en: 'I need water.',
          },
          lessonTitle: 'Live-service acceptance test',
          includeAudio: false,
          clientId,
        });
        const transcript = textValue(result.payload.transcript, `voice-coach #${pass} transcript`, 1_200);
        const feedback = textValue(result.payload.feedback, `voice-coach #${pass} feedback`, 2_400);
        assert(!containsDevanagari(transcript), `voice-coach #${pass}`, 'display transcript was not normalized to Latin text');
        assert(/[A-Za-z]/u.test(feedback), `voice-coach #${pass}`, 'feedback did not include English coaching guidance');
        assert(result.payload.audioBase64 === undefined, `voice-coach #${pass}`, 'includeAudio:false unexpectedly returned audio');
        return { elapsedMs: result.elapsedMs, feedbackLength: feedback.length, transcriptLength: transcript.length };
      }, (result) => `${result.elapsedMs} ms; transcript ${result.transcriptLength}, feedback ${result.feedbackLength} characters`);
    } else {
      failures.push(`voice-coach #${pass}: blocked because phrase-audio did not provide generated target-phrase MP3`);
      console.error('  BLOCKED voice-coach — generated Hindi MP3 unavailable');
    }

    await check(`realtime-token #${pass}`, async () => {
      const result = await postJson(`realtime-token #${pass}`, '/api/realtime-token', {
        clientId,
        model: 'gpt-realtime-2.1',
        languageMode: 'english-unless-hindi-requested',
      });
      assert(typeof result.payload.value === 'string' && result.payload.value.startsWith('ek_'), `realtime-token #${pass}`, 'missing short-lived ek_ client secret');
      assert(Number.isFinite(result.payload.expires_at), `realtime-token #${pass}`, 'expires_at was not finite');
      const nowSeconds = Math.floor(Date.now() / 1_000);
      assert(result.payload.expires_at > nowSeconds - 60, `realtime-token #${pass}`, 'client secret was already expired');
      assert(result.payload.expires_at < nowSeconds + 86_400, `realtime-token #${pass}`, 'client secret lifetime exceeded one day');
      return { elapsedMs: result.elapsedMs };
    }, (result) => `${result.elapsedMs} ms; schema valid; secret redacted`);

    const report = await check(`report-message #${pass}`, async () => {
      const result = await postJson(`report-message #${pass}`, '/api/report-message', {
        clientId,
        message: `Ephemeral automated acceptance report ${pass}; safe to delete immediately.`,
        reason: pass % 2 === 0 ? 'incorrect_or_misleading' : 'unsafe_or_inappropriate',
      });
      assert(result.payload.reported === true, `report-message #${pass}`, 'reported was not true');
      return { elapsedMs: result.elapsedMs };
    }, (result) => `${result.elapsedMs} ms; ephemeral record created`);
    reportSucceeded = Boolean(report);

    const deletion = await check(`delete-mobile-data #${pass}`, async () => {
      const result = await postJson(`delete-mobile-data #${pass}`, '/api/delete-mobile-data', { clientId });
      assert(result.payload.deleted === true, `delete-mobile-data #${pass}`, 'deleted was not true');
      assert(Number.isInteger(result.payload.reportsDeleted) && result.payload.reportsDeleted >= 0, `delete-mobile-data #${pass}`, 'reportsDeleted was not a non-negative integer');
      if (reportSucceeded) {
        assert(result.payload.reportsDeleted >= 1, `delete-mobile-data #${pass}`, 'the newly created report was not deleted');
      }
      return { elapsedMs: result.elapsedMs, reportsDeleted: result.payload.reportsDeleted };
    }, (result) => `${result.elapsedMs} ms; ${result.reportsDeleted} report(s) deleted`);
    deleteSucceeded = Boolean(deletion);
  } finally {
    if (!deleteSucceeded) {
      try {
        await postJson(`cleanup delete-mobile-data #${pass}`, '/api/delete-mobile-data', { clientId });
        console.log('  CLEANUP ephemeral client data deleted after a failed check');
      } catch (error) {
        const message = safeError(error);
        failures.push(`cleanup delete-mobile-data #${pass}: ${message}`);
        console.error(`  CLEANUP FAILED #${pass} — ${message}`);
      }
    }
  }
}

async function checkPublicPage(page, pass) {
  const label = `public ${page} page #${pass}`;
  const startedAt = performance.now();
  let response;
  try {
    response = await fetch(`${PUBLIC_URL}?page=${page}`, {
      headers: { Accept: 'text/html', 'User-Agent': 'BoloLiveAcceptance/1.0' },
      redirect: 'follow',
      signal: requestSignal(label, 20_000),
    });
  } catch (error) {
    if (error instanceof Error && (error.name === 'TimeoutError' || error.name === 'AbortError')) {
      fail(label, 'request exceeded the 20-second limit');
    }
    fail(label, `network request failed (${safeError(error)})`);
  }
  assert(response.ok, label, `HTTP ${response.status}`);
  const contentType = response.headers.get('content-type') || '';
  assert(contentType.toLowerCase().includes('text/html'), label, `unexpected content type ${contentType || '(missing)'}`);
  const html = await readBoundedText(response, label, MAX_HTML_BYTES);
  assert(/<html[\s>]/iu.test(html), label, 'response did not contain an HTML document');
  assert(html.length >= 200, label, 'HTML response was unexpectedly small');
  return { bytes: Buffer.byteLength(html, 'utf8'), elapsedMs: Math.round(performance.now() - startedAt) };
}

async function main() {
  console.log('Bolo live-service acceptance: 3 bounded passes with ephemeral client data.');
  console.log('Cost note: this intentionally invokes GPT chat, transcription, TTS, coaching, and Realtime token APIs; no session is opened and no token or audio payload is printed.');

  for (let pass = 1; pass <= PASSES; pass += 1) {
    await runServicePass(pass);
  }

  console.log('\nPublic-page probes');
  for (let pass = 1; pass <= PASSES; pass += 1) {
    for (const page of ['privacy', 'support', 'terms']) {
      await check(`public ${page} page #${pass}`, () => checkPublicPage(page, pass), (result) => `${result.elapsedMs} ms; ${result.bytes} HTML bytes`);
    }
  }

  console.log(`\n${checksPassed} checks passed; ${failures.length} failed or blocked.`);
  if (failures.length > 0) {
    console.error('Failures (secrets and audio remain redacted):');
    for (const failure of failures) console.error(`- ${failure}`);
    process.exitCode = 1;
  }
}

await main().catch((error) => {
  console.error(`Fatal acceptance-runner failure: ${safeError(error)}`);
  process.exitCode = 1;
});
