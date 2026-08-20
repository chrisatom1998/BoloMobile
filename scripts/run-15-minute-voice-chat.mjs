#!/usr/bin/env node

import { readFile } from 'node:fs/promises';

const DEBUG_PORT = Number(process.env.BOLO_CDP_PORT ?? 9224);
const APP_URL = process.env.BOLO_WEB_URL ?? 'http://127.0.0.1:8083';
const SESSION_MS = Number(process.env.BOLO_VOICE_SESSION_MS ?? 15 * 60_000);
const TURN_RECORDING_MS = Number(process.env.BOLO_VOICE_TURN_MS ?? 12_000);
const TARGET_TURNS = Number(process.env.BOLO_VOICE_TARGET_TURNS ?? 0);
const WAIT_STEP_MS = 500;
const SYNTHETIC_MIC_PATH = process.env.BOLO_SYNTHETIC_MIC_PATH;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const timestamp = () => new Date().toISOString();

async function debuggerTarget() {
  const response = await fetch(`http://127.0.0.1:${DEBUG_PORT}/json`);
  if (!response.ok) throw new Error(`Chrome debugger returned HTTP ${response.status}`);
  const targets = await response.json();
  const target = targets.find((candidate) => candidate.type === 'page');
  if (!target?.webSocketDebuggerUrl) throw new Error('Chrome did not expose a debuggable page.');
  return target.webSocketDebuggerUrl;
}

class CdpClient {
  constructor(url) {
    this.nextId = 1;
    this.pending = new Map();
    this.events = [];
    this.socket = new WebSocket(url);
    this.socket.addEventListener('message', (message) => {
      const payload = JSON.parse(String(message.data));
      if (payload.id) {
        const waiter = this.pending.get(payload.id);
        if (!waiter) return;
        this.pending.delete(payload.id);
        if (payload.error) waiter.reject(new Error(payload.error.message));
        else waiter.resolve(payload.result);
        return;
      }
      this.events.push(payload);
    });
  }

  async open() {
    if (this.socket.readyState === WebSocket.OPEN) return;
    await new Promise((resolve, reject) => {
      this.socket.addEventListener('open', resolve, { once: true });
      this.socket.addEventListener('error', () => reject(new Error('Could not connect to Chrome debugger.')), { once: true });
    });
  }

  send(method, params = {}) {
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { reject, resolve });
      this.socket.send(JSON.stringify({ id, method, params }));
    });
  }

  async evaluate(expression) {
    const result = await this.send('Runtime.evaluate', {
      awaitPromise: true,
      expression,
      returnByValue: true,
      userGesture: true,
    });
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.text ?? 'Browser evaluation failed.');
    return result.result?.value;
  }

  close() {
    this.socket.close();
  }
}

function clickExpression(label) {
  return `(() => {
    const label = ${JSON.stringify(label)};
    const candidates = [...document.querySelectorAll('button, [role="button"]')];
    const element = candidates.find((candidate) => {
      const name = candidate.getAttribute('aria-label') || candidate.textContent || '';
      return name.trim().includes(label);
    });
    if (!element) return false;
    element.scrollIntoView({ block: 'center' });
    element.click();
    return true;
  })()`;
}

async function waitFor(client, predicate, timeoutMs, label) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const value = await predicate();
    if (value) return value;
    await sleep(WAIT_STEP_MS);
  }
  throw new Error(`Timed out waiting for ${label}.`);
}

async function bodyText(client) {
  return client.evaluate('document.body?.innerText ?? ""');
}

async function click(client, label, timeoutMs = 20_000) {
  await waitFor(client, () => client.evaluate(clickExpression(label)), timeoutMs, `button ${JSON.stringify(label)}`);
}

async function waitForText(client, text, timeoutMs) {
  return waitFor(client, async () => (await bodyText(client)).includes(text), timeoutMs, `text ${JSON.stringify(text)}`);
}

function summarizeEvents(events) {
  const failures = [];
  for (const event of events) {
    if (event.method === 'Runtime.exceptionThrown') {
      failures.push(`uncaught exception: ${event.params?.exceptionDetails?.text ?? 'unknown'}`);
    }
    if (event.method === 'Log.entryAdded' && ['error', 'warning'].includes(event.params?.entry?.level)) {
      failures.push(`browser ${event.params.entry.level}: ${event.params.entry.text}`);
    }
    if (event.method === 'Network.responseReceived' && event.params?.response?.status >= 400) {
      failures.push(`HTTP ${event.params.response.status}: ${event.params.response.url}`);
    }
  }
  return failures;
}

async function main() {
  const client = new CdpClient(await debuggerTarget());
  await client.open();
  await Promise.all([
    client.send('Runtime.enable'),
    client.send('Log.enable'),
    client.send('Network.enable'),
    client.send('Page.enable'),
  ]);

  try {
    await client.send('Page.addScriptToEvaluateOnNewDocument', {
      source: `(() => {
        window.__boloAudioPlayback = { completed: 0, failed: 0, started: 0 };
        const originalPlay = HTMLMediaElement.prototype.play;
        HTMLMediaElement.prototype.play = function(...args) {
          const state = window.__boloAudioPlayback;
          state.started += 1;
          this.addEventListener('ended', () => { state.completed += 1; }, { once: true });
          this.addEventListener('error', () => { state.failed += 1; }, { once: true });
          return originalPlay.apply(this, args);
        };
      })()`,
    });
    if (SYNTHETIC_MIC_PATH) {
      const audioBase64 = (await readFile(SYNTHETIC_MIC_PATH)).toString('base64');
      const installSyntheticMicrophone = `(() => {
        const audioDataUrl = ${JSON.stringify(`data:audio/wav;base64,${audioBase64}`)};
        let microphonePromise;
        async function microphoneStream() {
          if (!microphonePromise) {
            microphonePromise = (async () => {
              const context = new AudioContext();
              const destination = context.createMediaStreamDestination();
              const response = await fetch(audioDataUrl);
              const source = context.createBufferSource();
              source.buffer = await context.decodeAudioData(await response.arrayBuffer());
              source.loop = true;
              source.connect(destination);
              source.start();
              await context.resume();
              window.__boloSyntheticMicrophone = { context, destination, source };
              return destination.stream;
            })();
          }
          const stream = await microphonePromise;
          return stream.clone();
        }
        Object.defineProperty(navigator.mediaDevices, 'getUserMedia', {
          configurable: true,
          value: async (constraints) => {
            if (!constraints?.audio) throw new DOMException('Only synthetic audio is available.', 'NotFoundError');
            return microphoneStream();
          },
        });
      })()`;
      await client.send('Page.addScriptToEvaluateOnNewDocument', { source: installSyntheticMicrophone });
    }

    await client.send('Page.navigate', { url: APP_URL });
    await waitFor(client, () => client.evaluate('document.readyState === "complete"'), 30_000, 'the web app to load');
    await waitFor(client, async () => !(await bodyText(client)).includes('Loading Bolo'), 30_000, 'Bolo hydration');

    let text = await bodyText(client);
    if (text.includes('Your Hindi plan in one minute') || text.includes('Next') || text.includes('Build my practice plan')) {
      for (let step = 0; step < 8 && !text.includes('Build my practice plan'); step += 1) {
        if (text.includes('Skip')) await click(client, 'Skip');
        else if (text.includes('Next')) await click(client, 'Next');
        else break;
        await sleep(400);
        text = await bodyText(client);
      }
      if (text.includes('Build my practice plan')) {
        await click(client, 'Build my practice plan');
        await sleep(2_000);
      }
    }

    await client.send('Page.navigate', { url: `${APP_URL}/live` });
    await waitForText(client, 'Tap to connect', 30_000);
    text = await bodyText(client);
    if (text.includes('I agree and want to continue')) {
      await click(client, 'I agree and want to continue');
      await waitFor(client, async () => !(await bodyText(client)).includes('I agree and want to continue'), 20_000, 'AI consent to persist');
    }

    const microphonePreflight = await client.evaluate(`Promise.race([
      navigator.mediaDevices.getUserMedia({ audio: true, video: false }).then((stream) => {
        const tracks = stream.getAudioTracks();
        const result = { state: 'granted', tracks: tracks.length, settings: tracks[0]?.getSettings?.() ?? null };
        stream.getTracks().forEach((track) => track.stop());
        return result;
      }).catch((error) => ({ state: 'rejected', name: error?.name, message: error?.message })),
      new Promise((resolve) => setTimeout(() => resolve({ state: 'timeout' }), 10_000)),
    ])`);
    console.log(`${timestamp()} MICROPHONE_PREFLIGHT ${JSON.stringify(microphonePreflight)}`);
    if (microphonePreflight.state !== 'granted' || microphonePreflight.tracks < 1) {
      throw new Error(`Synthetic microphone preflight failed: ${JSON.stringify(microphonePreflight)}`);
    }

    await click(client, 'Start a voice conversation');
    try {
      await waitForText(client, 'Asha is listening', 45_000);
    } catch (error) {
      console.error(`${timestamp()} INITIAL_CONNECTION_BODY\n${(await bodyText(client)).slice(0, 4_000)}`);
      console.error(`${timestamp()} INITIAL_CONNECTION_EVENTS\n${summarizeEvents(client.events).join('\n')}`);
      const failedRealtimeResponse = client.events.find((event) => (
        event.method === 'Network.responseReceived'
        && event.params?.response?.url === 'https://api.openai.com/v1/realtime/calls'
        && event.params.response.status >= 400
      ));
      if (failedRealtimeResponse?.params?.requestId) {
        const responseBody = await client.send('Network.getResponseBody', { requestId: failedRealtimeResponse.params.requestId }).catch(() => null);
        if (responseBody?.body) console.error(`${timestamp()} INITIAL_CONNECTION_RESPONSE ${responseBody.body.slice(0, 1_000)}`);
      }
      const requests = client.events
        .filter((event) => event.method === 'Network.requestWillBeSent')
        .map((event) => {
          const url = event.params?.request?.url ?? '';
          return `${event.params?.request?.method} ${url.startsWith('data:audio/') ? 'data:audio/[embedded synthetic prompt]' : url}`;
        });
      console.error(`${timestamp()} INITIAL_CONNECTION_REQUESTS\n${requests.join('\n')}`);
      throw error;
    }
    const startedAt = Date.now();
    let completedTurns = 0;
    console.log(`${timestamp()} SESSION_STARTED duration_target_ms=${SESSION_MS} turn_target=${TARGET_TURNS || 'duration'}`);

    while (
      Date.now() - startedAt < SESSION_MS
      && (TARGET_TURNS <= 0 || completedTurns < TARGET_TURNS)
    ) {
      const audioBefore = await client.evaluate('window.__boloAudioPlayback?.completed ?? 0');
      await sleep(TURN_RECORDING_MS);
      await click(client, 'Send turn', 5_000);
      await waitForText(client, 'Ready when you are', 110_000);
      const audioCompleted = await waitFor(
        client,
        () => client.evaluate(`(window.__boloAudioPlayback?.completed ?? 0) > ${audioBefore}`),
        5_000,
        'canonical Asha audio to finish',
      );
      if (!audioCompleted) throw new Error('Asha returned to ready without completing voice audio.');
      completedTurns += 1;
      const elapsedMs = Date.now() - startedAt;
      const transcriptCards = await client.evaluate(`document.querySelectorAll('[aria-label^="Save transcript phrase:"]').length`);
      const audioState = await client.evaluate('window.__boloAudioPlayback');
      const appErrors = await client.evaluate(`[
        ...document.querySelectorAll('[role="alert"]')
      ].map((element) => element.textContent?.trim()).filter(Boolean)`);
      console.log(`${timestamp()} TURN_COMPLETED turn=${completedTurns} elapsed_ms=${elapsedMs} transcript_actions=${transcriptCards} audio_completed=${audioState.completed} audio_failed=${audioState.failed}`);
      if (appErrors.length) throw new Error(`Bolo displayed an error: ${appErrors.join(' | ')}`);
      if (audioState.failed > 0) throw new Error(`Asha audio reported ${audioState.failed} media playback error(s).`);
      if (TARGET_TURNS > 0 && completedTurns >= TARGET_TURNS) break;
      if (elapsedMs >= SESSION_MS) break;
      const remainingMs = SESSION_MS - elapsedMs;
      if (remainingMs <= TURN_RECORDING_MS + 1_000) {
        await sleep(remainingMs);
        break;
      }
      await click(client, 'Speak', 5_000);
      await waitForText(client, 'Asha is listening', 10_000);
    }

    const elapsedMs = Date.now() - startedAt;
    const finalText = await bodyText(client);
    const eventFailures = summarizeEvents(client.events);
    if (completedTurns < 1) throw new Error('The session completed no voice turns.');
    if (TARGET_TURNS > 0 && completedTurns < TARGET_TURNS) {
      throw new Error(`The session completed ${completedTurns}/${TARGET_TURNS} required voice turns.`);
    }
    if (TARGET_TURNS <= 0 && elapsedMs < SESSION_MS) throw new Error(`Session lasted only ${elapsedMs} ms.`);
    if (!finalText.includes('Ready when you are')) throw new Error('Asha was not ready after the final voice turn.');
    if (eventFailures.length) throw new Error(eventFailures.join('\n'));

    console.log(`${timestamp()} SESSION_PASSED elapsed_ms=${elapsedMs} completed_turns=${completedTurns}`);
    await click(client, 'End live voice session', 5_000);
    await waitForText(client, 'Tap to connect', 10_000);
  } finally {
    client.close();
  }
}

main().catch((error) => {
  console.error(`${timestamp()} SESSION_FAILED ${error instanceof Error ? error.stack : error}`);
  process.exitCode = 1;
});
