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
