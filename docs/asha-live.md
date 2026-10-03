# Asha GPT-Live integration

## Architecture

The native Expo/iOS app opens a WebRTC peer only after the learner accepts the current consent notice, taps **Start Conversation**, and grants microphone access. After ICE gathering completes, the app sends the SDP offer, selected Asha mode, current lesson ID/title/objective, selected learner level, active-lesson vocabulary, and up to eight recent Asha chat messages to Bolo's trusted `POST /api/live-call` route. It does not include saved-phrase lists or counts, review schedules, daily practice totals, or full scene history. The trusted route creates an OpenAI `gpt-live-1` session through `POST /v1/live/sessions` and returns only the WebRTC SDP answer and `live_…` session ID. The permanent `OPENAI_API_KEY` stays on the server and must never be placed in Expo configuration, the app bundle, logs, or source control.

The Live session uses Responses delegation with the backend's existing `gpt-5.6-terra` model. GPT-Live owns Hindi conversation, interruption, and short spoken responses. The Responses backend decides when Bolo tools are needed; the native iOS dispatcher executes them against Bolo's existing local lesson, phrase, and progress state, then returns `response.item.create` followed by `response.create`. Tool results are minimized: lesson reads return only ID/title/objective, vocabulary reads return only active-lesson vocabulary, progress reads return only selected difficulty, confirmed saves return success/already-saved booleans, and progress updates return success/already-recorded/scope. Meaning, feedback, and recap tools return the learner-selected text needed for that current request. Phrase saves wait for explicit confirmation in Bolo's existing phrase picker, progress updates require `interactionCompleted: true`, duplicate call IDs share one result, and interruption aborts stale work. Learner mutations are not sent to a new server-side store.

```text
iPhone microphone/speaker
        ↕ WebRTC audio + Live events
OpenAI gpt-live-1 ── Responses delegation (gpt-5.6-terra)
        ↑ SDP answer           ↕ permission-scoped tool calls/results
Bolo /api/live-call        native Bolo tool dispatcher
        ↑                         ↕
native app (SDP, mode, context)  existing local learner data
```

## AppDeploy backend setup

1. Keep the existing AppDeploy app `74e39779183cf78fed` as Bolo's complete trusted backend. Its `backend/index.ts` mounts Asha's `GET /api/live-status` and `POST /api/live-call` beside the working lesson, typed-coaching, audio, report, support, deletion, and legal-page routes; do not replace those existing routes with a Live-only service.
2. Store `OPENAI_API_KEY` only in AppDeploy's encrypted backend secret store. Never copy the value into chat, source control, Expo configuration, EAS client environments, app logs, or an `EXPO_PUBLIC_*` variable. The app can inspect only derived configuration status.
3. The Live route accepts only `clientId`, `offerSdp`, `mode`, and bounded `context`, and returns only `{ answerSdp, sessionId }`. It caps the raw request at 96 KB, SDP at 64 KB, context at 24 KB, recent context at eight 500-character entries, upstream responses at 96 KB, and the complete OpenAI exchange at 20 seconds. It validates nested context fields, hashes the installation identifier before using it as OpenAI's safety identifier, and never logs SDP, transcripts, tool arguments, bearer keys, or model responses.
4. AppDeploy's existing database-backed mobile limiter records the random installation partition for at most the current one-hour window and applies both per-installation and global bounds. AppDeploy does not provide the dedicated SQLite/atomic-counter controls designed for the abandoned Railway service, so this is abuse partitioning rather than authentication or a strict distributed quota. Do not claim otherwise. The scheduled retention cleanup remains enabled.
5. Keep learner mutations in `src/lib/asha-native-tools.ts`. Do not add a server learner store or migrate local learner data. The random installation `clientId` supports rate limiting and deletion but is not proof of identity.
6. `/api/live-status` proves only that the backend secret is configured. It deliberately returns `providerAccessVerified: false` and `availability: requires-valid-session-acceptance`; model entitlement is proven only by a successful valid WebRTC session.
7. Set both `BOLO_API_URL` and `BOLO_LIVE_API_URL` to `https://api-v2.appdeploy.ai/app/74e39779183cf78fed` for the current production build. Preview builds may use a separately reviewed AppDeploy staging app. Release validation and signed-artifact inspection must verify both embedded URLs so a voice-only endpoint change cannot silently break legacy Bolo behavior.

No learner account or new server-side learner store is required because permission-scoped tool mutations remain local. AppDeploy deployment readiness, its invalid-request contract, and its error logs can be checked without opening a paid Live session; real provider access still requires the valid-session and physical-device gates below.

## iOS configuration and lifecycle

`app.json` configures the `expo-audio` microphone usage description. Bolo requests permission only from **Start Conversation**. A denial explains the Settings path and leaves text chat available. The native WebRTC module requires an Expo development or production build; Expo Go is unsupported.

The client waits for `session.started`, streams microphone input continuously for full-duplex speech, and uses Live mute/unmute commands for the Mute control. Interrupt immediately disables local playback, invalidates/aborts obsolete tool work, and appends an instruction that makes Asha yield to the learner. End Chat disables the microphone, cancels obsolete work, sends `session.close`, gives the server a bounded 400 ms grace period, then releases tracks, playback, the data channel, and the peer. Moving the app out of the foreground also tears the session down. Completed locally confirmed saves and progress are retained.

Headphones, Bluetooth routing, phone-call interruptions, backgrounding, reconnect/recovery, and actual microphone/speaker behavior must be checked on a physical iPhone. Simulator and mocked tests cover UI/state only.

## Verification

Run:

```sh
npm run typecheck
npm test -- --runInBand __tests__/asha-live-session.test.ts __tests__/asha-native-tools.test.ts __tests__/asha-live-hook.test.tsx
npm run test -- --runInBand __tests__/asha-live-session.test.ts __tests__/asha-native-tools.test.ts __tests__/asha-live-hook.test.tsx __tests__/devanagari-romanization.test.ts
```

Before saying voice works, install a development build on a physical iPhone and complete two turns: interrupt Asha during turn one, change an in-flight request during turn two, then End Chat. Confirm microphone/speaker/Bluetooth routing, the transcript, one confirmed save, one confirmed progress update, recap content, and that the iOS microphone indicator turns off after End Chat.

## Official OpenAI references

- [GPT-Live model](https://developers.openai.com/api/docs/models/gpt-live-1)
- [Getting started with GPT-Live](https://developers.openai.com/api/docs/guides/live)
- [GPT-Live WebRTC](https://developers.openai.com/api/docs/guides/voice-webrtc?api=live)
- [Delegation and tools](https://developers.openai.com/api/docs/guides/live-delegation)
- [Managing GPT-Live sessions](https://developers.openai.com/api/docs/guides/live-conversations)
- [Migrate to GPT-Live](https://developers.openai.com/api/docs/guides/live-migration)
