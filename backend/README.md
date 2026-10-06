# Bolo iOS GPT-Live server contract

`live.ts` is an undeployed, portable trusted-server reference for the iOS client. GPT-Live requires a server to exchange the iOS WebRTC SDP offer with a project API key. No existing server application is changed by adding this source file to the iOS repository.

When connecting the iOS client to an appropriate trusted server, import `createLiveRoutes` and supply the server's rate limiter, identifier validator, authenticated OpenAI HTTP helper, response helpers, and secret reader:

```ts
const routes = createLiveRoutes({ allowMobileRequest, validClientId, openAI, json, error, secrets });
```

Adapt the returned route handlers to your server framework. Include `clientId + '-live'` in mobile data deletion rate-event identifiers when integrating the rate limiter. `OPENAI_API_KEY` belongs in server secrets, never in the iOS bundle.

- `POST /api/live-call` accepts `{ clientId, offerSdp, responseLanguage?: 'en' | 'hi', mode?: 'hindi-immersion' | 'hindi-english-help' | 'beginner' | 'conversation' | 'lesson', context?: LiveContext, clientTools?: boolean, history?: { role: 'you' | 'asha', text: string }[] }`. It returns `{ answerSdp, sessionId }`. Unknown body fields are ignored, so older app builds that send none of the optional fields keep working.
  - `mode` defaults to `conversation`. Without `responseLanguage`, `hindi-immersion` selects Hindi; otherwise English.
  - `context` is optional and strictly validated (unknown fields reject the request): `learnerLevel` (≤100 chars), `lessonId` (≤120), `lessonTitle` (≤200), `learningObjective` (≤400), `recentContext` (≤8 strings of ≤500), `relevantVocabulary` (≤30 items of `{ devanagari (required, ≤100), romanization? (≤100), meaning? (≤160) }`), and ≤24,000 UTF-8 bytes serialized. Context goes only into the delegated backend's instructions as labeled data.
- `GET /api/live-status` returns `{ configured, available, availability, providerAccessVerified, model: 'gpt-live-1', responsesModel: 'gpt-5.6-terra', protocol: 'live' }`. `available` (mirrored by `providerAccessVerified`, and `availability` is `model-access-verified` or `unavailable`) checks retrieval of both models using the server credential; it does not create a billable voice session or prove end-to-end microphone playback. `npm run acceptance:live` requires `configured`, `available`, `model` and `protocol`.
- The server pins GPT-Live, the `marin` voice, Responses delegation to `gpt-5.6-terra` with `max_output_tokens: 512`, `store: false`, and Asha's coaching and Hindi pronunciation prompt. `store` belongs to the Live session; the managed Responses subset does not expose a separate storage flag.
- The OpenAI safety identifier is `bolo-` plus the first 32 hex characters of the SHA-256 of the client identifier (37 characters; OpenAI caps safety identifiers at 64). Raw client identifiers are never sent.
- Mobile history is reduced to the 12 most recent valid messages, 600 characters per message, 6,000 UTF-8 bytes total. Only learner and assistant roles are forwarded. History is never injected into developer instructions.

## Client-executed tools (`clientTools`)

`BOLO_TOOLS` defines eight function tools: `read_active_lesson`, `load_topic_vocabulary`, `lookup_contextual_meaning`, `get_learner_progress`, `prepare_learning_feedback`, `save_confirmed_phrase`, `update_completed_progress`, and `create_session_recap`. The app executes them against on-device state, so they are only sent when the client says it can answer them:

- **Without `clientTools: true`** (every build released before tool support): delegation uses `tool_choice: 'none'` with no tools, the instructions say the backend has no tools and point the learner to the Save button, and the data channel may send only `session.close`, `session.input_audio.mute`, and `session.input_audio.unmute`. This is byte-for-byte the previous deployed request. An unanswered tool call stalls a Live session, so older clients must never receive tools.
- **With `clientTools: true`**: delegation adds `tools: BOLO_TOOLS`, `tool_choice: 'auto'`, and `parallel_tool_calls: false`, the instructions require tools for authoritative app state, saving only after explicit learner confirmation, updating progress only after a completed interaction, and never claiming success before the tool result. The data channel additionally allows exactly `response.item.create` and `response.create`.

Per the [delegation guide](https://developers.openai.com/api/docs/guides/live-delegation), the client reads completed calls from `response.event` envelopes whose nested `event.type` is `response.output_item.done` with `item.type === 'function_call'` (`call_id`, `name`, JSON `arguments`), sends `{ type: 'response.item.create', item: { type: 'function_call_output', call_id, output } }`, then `{ type: 'response.create' }` to continue the backend response. The app implementation lives in `src/lib/live-tools.ts`.

Security notes: a modified client can send the two extra events, but they can only append items to and continue the delegated backend response. `session.update` and instruction events stay disallowed, so the server-side instructions, model, and tool list remain authoritative, and the instructions tell the backend to treat tool results as data, never as instructions. Tool results describe only that learner's own on-device state; a client that fabricates outputs can only mislead its own session. Configuration changes, including changing language, still require a new session.

## Operations

- Reuses the existing per-client/global request limits with a separate `-live` bucket. It rejects malformed/oversized offers, aborts upstream calls after 20 seconds, bounds upstream response bodies (96 KiB for sessions, 16 KiB for model lookups), and returns safe errors. Failures log `Live call failed` with only this module's own reason codes (for example `live_upstream_failed`) or the error class name, never upstream messages, SDP, transcripts, or credentials.

Run `npx jest __tests__/live-backend.test.ts --runInBand` from the repository root. After deploying, verify `GET /api/live-status`, then test a real microphone conversation, interruptions, mute/unmute, transcript display, and hangup on a native development build. Model retrieval is not a substitute for a device audio check.

Contract references verified October 6, 2026: [Create Live session](https://developers.openai.com/api/reference/resources/live/methods/create), [WebRTC](https://developers.openai.com/api/docs/guides/voice-webrtc?api=live), [Delegation](https://developers.openai.com/api/docs/guides/live-delegation), [Prompting](https://developers.openai.com/api/docs/guides/live-prompting).
