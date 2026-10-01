# Bolo iOS GPT-Live server contract

`live.ts` is an undeployed, portable trusted-server reference for the iOS client. GPT-Live requires a server to exchange the iOS WebRTC SDP offer with a project API key. No existing server application is changed by adding this source file to the iOS repository.

When connecting the iOS client to an appropriate trusted server, import `createLiveRoutes` and supply the server's rate limiter, identifier validator, authenticated OpenAI HTTP helper, response helpers, and secret reader:

```ts
const routes = createLiveRoutes({ allowMobileRequest, validClientId, openAI, json, error, secrets });
```

Adapt the returned route handlers to your server framework. Include `clientId + '-live'` in mobile data deletion rate-event identifiers when integrating the rate limiter. `OPENAI_API_KEY` belongs in server secrets, never in the iOS bundle.

- `POST /api/live-call` accepts `{ clientId, offerSdp, responseLanguage?: 'en' | 'hi', history?: { role: 'you' | 'asha', text: string }[] }`. It returns `{ answerSdp, sessionId }`.
- `GET /api/live-status` returns `{ configured, available, model: 'gpt-live-1', protocol: 'live' }`. `available` checks model retrieval using the server credential; it does not create a billable voice session or prove end-to-end microphone playback.
- The server pins GPT-Live, the `marin` voice, Responses delegation to `gpt-5.6-terra`, `store: false`, and a coaching prompt. Delegation has no external tools. `store` belongs to the Live session; the managed Responses subset does not expose a separate storage flag.
- Mobile history is reduced to the 12 most recent valid messages, 600 characters per message, 6,000 UTF-8 bytes total. Only learner and assistant roles are forwarded. History is never injected into developer instructions.
- The client data channel may send only `session.close`, `session.input_audio.mute`, and `session.input_audio.unmute`. Configuration changes, including changing language, require a new session. Allowing `session.update` would let an untrusted client override backend model configuration.
- Reuses the existing per-client/global request limits with a separate `-live` bucket. It rejects malformed/oversized offers, aborts upstream calls after 20 seconds, and returns safe errors without logging SDP or credentials.

Run `npx jest __tests__/live-backend.test.ts --runInBand` from the repository root. After deploying, verify `GET /api/live-status`, then test a real microphone conversation, interruptions, mute/unmute, transcript display, and hangup on a native development build. Model retrieval is not a substitute for a device audio check.

Contract references verified September 11, 2026: [Create Live session](https://developers.openai.com/api/reference/resources/live/methods/create), [WebRTC](https://developers.openai.com/api/docs/guides/voice-webrtc?api=live), [Delegation](https://developers.openai.com/api/docs/guides/live-delegation), [Prompting](https://developers.openai.com/api/docs/guides/live-prompting).

## End-of-conversation recap integration

`recap.ts` adds a portable, **not yet deployed** route for the optional recap. The mobile client calls its normal `boloApiUrl` at `POST /api/conversation-recap`; the existing `/api/mobile-chat` plain-text response is not a compatible substitute. Deploy and register this route on the trusted API server before expecting real recaps to work. This source change does not modify any hosted application or provision credentials.

```ts
const recapRoutes = createRecapRoutes({ allowMobileRequest, validClientId, openAI, json, error, secrets });
```

Include `shared/conversation-recap.ts` in the server build and adapt the handler to the hosting framework. Use the existing authenticated OpenAI HTTP helper and shared per-client/global rate limiter; include `clientId + '-recap'` in mobile-data deletion's rate-event identifiers. Keep `OPENAI_API_KEY` in server secrets. Set an HTTP JSON body limit (for example 64 KiB) before parsing, along with the existing origin/authentication controls. Client identifiers are rate-limit identifiers, not authentication credentials.

- Request: `{ clientId, messages: { id, role: 'you' | 'asha', text }[] }`. IDs must be unique, nonempty ASCII identifiers of at most 128 characters. The client selects at most 12 whole recent caption rows, at most 600 characters each and 6,000 UTF-8 text bytes total. Oversized rows and explicit uncertain-ASR markers are omitted, never truncated into correction targets. The route rejects malformed or oversized request envelopes before reading credentials.
- Response: `{ corrections: { sourceId, original, hi, latin, en, explanation }[] }`, with zero to three items. The original quote is copied from the matching supplied learner caption, not generated. Corrections target only learner turns, keep the intended meaning, and provide Devanagari Hindi, Romanized Hindi, English meaning and a short English explanation. The route/client reject invalid scripts, mismatched quotes, no-ops and duplicates. A valid empty list means no high-confidence correction was found; it is not a proficiency assessment.
- The server pins the existing typed-coach model `gpt-4.1-mini`, strict Responses JSON schema, `store: false`, no tools and a 1,200-output-token cap. It separates untrusted transcript data from server instructions. Only high-confidence grammar/naturalness candidates are retained; the instructions prohibit pronunciation scoring, guessing ASR content, and inventing mistakes. Validation establishes source ownership and structure, not semantic correctness; language quality still needs evaluation with representative conversations.
- Input and nonempty returned corrections are checked with `omni-moderation-latest`. Flagged content returns a safe 422; failed or malformed checks fail closed. Empty/no-learner input does not read credentials or call OpenAI. A separate `-recap` rate bucket is checked before secret access. The entire operation, including dependency lookups, generation and moderation, has a 20-second deadline even if a dependency ignores cancellation. Responses contain safe errors; this reference does not log transcripts, model output or credentials.
- The recap is an optional, text-only review using the app's existing AI-consent gate. `store: false` disables Responses application-state storage, but does not represent a blanket provider-retention guarantee. Do not add transcript logging or recap persistence when adapting the route.

Deterministic contract tests: `npm test -- --runTestsByPath __tests__/conversation-recap-contract.test.ts __tests__/conversation-recap-api.test.ts __tests__/recap-backend.test.ts`. Deployment and paid model/device acceptance tests require a separate authorized step; mocked tests do not establish that the hosted route exists or that model language judgments are always correct.

References: [Structured outputs](https://developers.openai.com/api/docs/guides/structured-outputs), [Moderation](https://developers.openai.com/api/docs/guides/moderation).

Live captions are revisable, heuristic rows, not authoritative completed utterances. Ending voice may omit trailing words. The prompt tells the model to skip ambiguous fragments, but this is not a guarantee against ASR errors; the UI makes every suggestion dismissible and never records a learner-error score. The portable handler has no hosting-specific client-disconnect signal. Canceling the app request discards its result; already-started server/provider work may continue until its deadline. An adapter may additionally propagate request cancellation if its framework supports that safely.
