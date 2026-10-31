# Spec: offline capture and sync for Asha voice sessions

Status: Draft, for review by Chris
Author: Agent Desk (Grok Bot)
Date: 2026-10-31
Scope: BoloMobile app (`src/`) and, in an optional later phase, the Bolo backend

## Summary

Asha live voice cannot work offline. Every session needs a WebRTC SDP exchange through the trusted Live server and then streams audio to and from GPT-Live. This spec does not change that. It covers what the app can keep, queue, and send later when the network is missing or drops partway through a session.

Today a session's transcript lives only in the shared `chatHistory` key, which holds the 100 newest messages. That history is wiped when the next live session connects, and the app keeps no record that a session happened. The proposal:

1. Add an on-device **Asha session log**. Each session becomes a durable record with its metadata, its final transcript rows, and what it changed through tools. The log is written as the session runs, so a dropped connection or a killed app still leaves a complete record marked "interrupted".
2. Add a small **sync outbox**. Network-dependent follow-ups that fail while offline, starting with "Report this reply", are queued and retried with backoff when the app is active and Bolo's API responds again.
3. As an **optional Phase 2**, upload finished session records to a new backend endpoint. That needs a server change, a consent update, and decisions from Chris (see [Open questions](#open-questions)). Phase 1 works on its own with no server changes.

## Current behavior

All claims below come from `main` at `cfc66be`.

### How a session starts

- `src/hooks/use-realtime-conversation.ts` `connect()` runs `onConnectionStart`, checks for a physical device on iOS, requests microphone permission (`expo-audio`), stops TTS, sets the realtime audio mode, and then calls `createRealtimePeerSession` (`src/lib/realtime-peer.ts`). Its `exchangeSdp` callback calls `createLiveCall`.
- `createLiveCall` in `src/services/bolo-api.ts` POSTs to `${BOLO_LIVE_API_URL}/api/live-call` with `{ clientId, offerSdp, responseLanguage, history?, mode?, context?, clientTools? }`. The response is validated as `{ answerSdp, sessionId }`. Only `answerSdp` is used (`exchangeSdp` returns `call.answerSdp`). **The server `sessionId` is thrown away** and is not stored anywhere in `src/`.
- `getBoloLiveApiUrl()` reads `extra.boloLiveApiUrl`, which `app.config.js` builds from `BOLO_LIVE_API_URL` (HTTPS only, no credentials, no query or fragment). If it is missing, the call throws `BoloApiError('Live voice isn’t available right now. You can still type to Asha.')`.
- `post()` in `bolo-api.ts` has a 30 s timeout. Network failures turn into `BoloApiError('Bolo is unavailable right now. Check your connection and try again.')` with no `status`, and timeouts into `'The request timed out…'`. There is no connectivity check before a request. The repo does not depend on `@react-native-community/netinfo` (`package.json`).
- After the transport is up, the hook waits up to `START_TIMEOUT_MS` (15 s) for `session.started` and then sets status to `ready`.
- `useAshaLiveSession()` (`src/hooks/use-asha-live-session.ts`) supplies the session `mode`, lesson `context` (`buildLiveSessionContext` in `src/lib/live-tools.ts`), and a client tool environment.
- When a new session starts, the old conversation is wiped. On the Asha screen, `startNewConversation` → `resetChat()` → `clearChatHistory()` (`src/app/(tabs)/live.tsx`). In the floating host, `AshaVoiceSessionHost` calls `appRef.current.clearChatHistory()` on the `connecting → ready` transition (`src/state/asha-voice-session.tsx`).

### Streaming and transcripts

- Server events arrive on the WebRTC data channel. `session.input_transcript.delta` and `session.output_transcript.delta` go into `createLiveTranscriptStore` (`src/lib/live-transcripts.ts`). It groups timestamped fragments into revisable rows (`{ id, speaker, text, startMs, endMs, fragments }`), dedupes by `event_id`, and keeps the last 100 rows. Row ids look like `live-${Date.now()}-${lifecycle}-${n}`.
- Each update produces a full snapshot. `recordLiveSnapshot` (`live.tsx`) or `persistSnapshot` (`asha-voice-session.tsx`) converts the rows to `ChatMessage`s and calls `replaceLiveChatSnapshot(previousIds, messages)` (`src/state/app-state.tsx`). That swaps out the previous snapshot's rows in `chatHistory` and coalesces writes so at most one AsyncStorage write is queued at a time.
- The transcript in storage is the same `chatHistory` array that typed coaching uses (`storageKeys.chatHistory = 'bolo-chat-history'`, `MAX_CHAT_HISTORY_MESSAGES = 100`, `MAX_CHAT_MESSAGE_CHARACTERS = 2_400` in `src/lib/storage.ts`). It has no session id, timestamps, or end reason.
- The session ends through `disconnect()`, which can be triggered by the user ending the call, the app leaving the foreground (`AppState` listener), a change to `clientId` or `responseLanguage`, withdrawn consent, a `session.closed` event, the peer's `onClose`, or a mic command timeout. `disconnect()` sends `session.close` on a best-effort basis and then tears everything down. Nothing records why the session ended.

### Progress, scores, and tool side effects

- Practice credit: the first learner row in a session calls `markLiveTurn()` (`live.tsx`, `asha-voice-session.tsx`). That sets `practice.liveDone`, updates `practiceHistory`, and records the streak day (`app-state.tsx`). This is local only.
- Live sessions produce **no scores**. Scores (`SceneAttempt.score`, `bestAccuracy`) only come from scripted lessons (`markSceneComplete` in `app-state.tsx`).
- Client tools (`src/lib/live-tools.ts`):
  - `save_confirmed_phrase` may call `preparePhrase` → `prepareSavedPhraseFromText` → `POST /api/prepare-saved-phrase` on the Bolo API, then `togglePhrase`.
  - `update_completed_progress` calls `recordLessonPractice`, which runs `checkpointScene` and `markLiveTurn` locally.
  - `create_session_recap` builds a summary from the in-memory `savedThisSession` and `progressThisSession`. That summary is not persisted.
- Every state change goes through `commit()` → `persistState()` → `AsyncStorage.multiSet`, serialized by `enqueuePersistence` (`app-state.tsx`). These are local-first writes that complete offline.

### Server side

- `backend/live.ts` and `backend/README.md` hold a reference for the Live server that is not deployed. It exposes `POST /api/live-call` and `GET /api/live-status` and pins `store: false` on the Live session. **No server endpoint stores, lists, or syncs sessions or transcripts.** The README says failures never log transcripts.
- The main Bolo API (`getBoloApiUrl()`, fallback `https://api-v2.appdeploy.ai/app/74e39779183cf78fed`) serves `/api/mobile-chat`, `/api/prepare-saved-phrase`, `/api/phrase-audio`, `/api/voice-coach`, `/api/report-message`, and `/api/delete-mobile-data` (`bolo-api.ts`). None of these take an idempotency key.

### Existing offline support and persistence

- Bundled lesson audio (`src/data/offline-hindi-audio.ts`, generated by `scripts/generate-offline-hindi-audio.mjs`) plays through `src/lib/offline-voice-player.ts` with no network or consent. `.maestro/flows/01-first-launch-offline.yaml` covers an offline lesson using `setAirplaneMode`.
- Persistence libraries already in use:
  - `@react-native-async-storage/async-storage` for all app state (`app-state.tsx`) and diagnostics (`src/lib/observability.ts`, key `bolo-observability-v1`).
  - `expo-file-system` for the progress backup file (`src/lib/progress-backup-file.ts`), the AI voice cache (`src/lib/ai-voice-player.ts`), and recordings (`src/lib/recording-file.ts`).
  - `expo-crypto` `randomUUID` for ids (`storage.ts`).
- Progress backup (`src/lib/progress-backup.ts`) intentionally leaves out chat history.
- Privacy copy (`src/app/privacy.tsx`) says up to 100 recent typed and transcribed Asha messages are stored unencrypted on the device. It says live voice creates no recording file, and that "Delete Bolo data" clears local data and asks the server to delete reports.
- Documentation convention: flat kebab-case Markdown in `docs/` (`docs/voice-acceptance.md`, `docs/ci-release-runbook.md`). This spec follows it.

## Goals

1. Never lose a session transcript that the learner saw because of a dropped connection, the app being backgrounded or killed, or a new session starting.
2. Keep a durable record of each session: start and end time, end reason, language and mode, lesson, turn count, and tool outcomes. This becomes the base for "past sessions" UX and any later sync.
3. Queue network follow-ups that fail while offline and retry them safely, starting with message reports.
4. Make network state visible in Asha's UI: offline before starting, interrupted during a session, and the sync status of queued work.
5. Keep the current privacy posture. Store no audio, add no new upload without consent, and make Clear chat and Delete Bolo data cover the new data.

## Non-goals

- Offline live voice, on-device speech recognition, or offline AI replies. Live needs the network (`createLiveCall` plus WebRTC).
- Resuming a dropped Live session. The server pins `store: false`, there is no resume API in `backend/live.ts`, and `disconnect()` always starts a new session.
- Storing or uploading microphone or Asha audio.
- Queuing typed coaching (`/api/mobile-chat`) offline. That is a separate feature with its own UX (a reply arrives later). It is listed under Open questions.
- Sync across devices or accounts. Bolo has no accounts, only a random per-install `clientId` (`sanitizeClientId`).
- Changing the Expo version pins described in `AGENTS.md`.

## Proposed design

### 1. Data model (`src/lib/asha-session-log.ts`, new)

```ts
export type AshaSessionEndReason =
  | 'user_ended'        // End control / floating bubble end
  | 'backgrounded'      // AppState left foreground
  | 'connection_lost'   // peer onClose / session.closed after live
  | 'start_failed'      // never reached 'ready' (offline, timeout, server error)
  | 'config_changed'    // clientId / responseLanguage / consent change
  | 'app_terminated';   // found still 'active' at next hydrate

export type AshaSessionTranscriptRow = {
  id: string;               // live transcript row id
  speaker: 'you' | 'asha';
  text: string;             // final text only; fragments are not stored
  startMs: number;          // relative to the Live session
  endMs: number;
};

export type AshaSessionRecord = {
  schema: 1;
  id: string;                      // local UUID (expo-crypto randomUUID)
  serverSessionId?: string;        // from LiveCallResponse.sessionId (currently discarded)
  startedAt: string;               // ISO, when connect() began
  connectedAt?: string;            // ISO, when status became 'ready'
  endedAt?: string;
  state: 'active' | 'ended' | 'interrupted';
  endReason?: AshaSessionEndReason;
  responseLanguage: 'en' | 'hi';
  mode?: LiveMode;
  lessonId?: string;
  rows: AshaSessionTranscriptRow[]; // capped (see limits)
  learnerTurns: number;
  savedPhrases: string[];          // Devanagari `hi` of phrases saved via tool
  lessonsPracticed: string[];      // lessonIds from update_completed_progress
  sync: { state: 'local_only' | 'queued' | 'synced' | 'failed'; updatedAt: string };
};
```

Limits, in the same style as `storage.ts`:
- Keep at most 20 stored sessions, oldest dropped first. Retain them for 30 days. A record is stored only once the session reaches `ready` or gains a transcript row. An attempt that ends as `start_failed` with no rows is discarded and never enters the list, so it cannot take a slot or drop an older session, including while that attempt is still `connecting`. Never drop a session that has rows to make room for one that does not.
- Store at most 200 rows per session, each capped at `MAX_CHAT_MESSAGE_CHARACTERS`.
- Records that would serialize to more than 256 KB are trimmed by dropping the oldest rows.

The exact numbers are open for Chris to choose.

Validate on read with a `sanitizeAshaSessions(raw: string | null)` that matches the existing `sanitize*` functions. Drop invalid records instead of throwing.

### 2. Local storage

- Add a new AsyncStorage key `bolo-asha-sessions-v1` holding an array of records, newest last. It stays out of `storageKeys` and `PersistedState`, so the existing hydrate in `app-state.tsx` and `restorableProgressKeys` don't change. It is owned by a small provider or module with its own serialized write queue, following the `enqueuePersistence` pattern.
- Why AsyncStorage instead of `expo-file-system`: all small structured state already lives there, and tests already mock it. Revisit if the size cap is a problem (see Risks).
- Write path:
  - On `connecting`, create an `active` record in memory only. Do not append it to `bolo-asha-sessions-v1` and do not run the 20-session drop until the session reaches `ready` or receives its first transcript row.
  - If `disconnect` happens before that and the record has no rows, drop it (`endReason: 'start_failed'`). Nothing is written and no older session is removed.
  - On each transcript snapshot, update `rows` in memory and persist with the same coalescing as `replaceLiveChatSnapshot` (one queued write at a time, reading the newest state). Once the record is stored, also persist at least every 2 s and on every status change.
  - On `disconnect` of a stored record, finalize with `endedAt` and `endReason`.
- Crash recovery: at hydrate, any record still `active` becomes `interrupted` with `endReason: 'app_terminated'`.
- The `chatHistory` behavior stays as it is: it remains the "current conversation" view. Before `clearChatHistory()` runs on a new connection, the previous session is already finalized in the log, so the wipe no longer loses data.

### 3. Capture hooks (minimal changes to existing code)

- `use-realtime-conversation.ts`:
  - Add an optional `onSessionEvent` callback that emits `{ type: 'starting' | 'ready' | 'ended', reason?, serverSessionId? }`.
  - Return `call.sessionId` from `exchangeSdp` alongside the SDP, or capture it in a closure.
  - Pass a reason into `disconnect(reason)` from each call site that already exists: user, AppState, `onClose`, `session.closed`, mic timeout, config effects.
- `asha-voice-session.tsx` and `live.tsx`: send snapshots to the session log next to the existing `replaceLiveChatSnapshot` calls. Only one owner should write per session. Use the same `listenersRef` ownership rule that already decides which side persists `chatHistory`.
- `use-asha-live-session.ts` `createAshaToolEnvironment`: after a successful `savePhrase` or `recordLessonPractice`, also append to the active record's `savedPhrases` or `lessonsPracticed`. Progress itself is already applied locally and needs no sync.

### 4. Sync outbox (`src/lib/sync-outbox.ts`, new)

Store it in a separate AsyncStorage key, `bolo-sync-outbox-v1`.

```ts
type OutboxOp =
  | { kind: 'report_message'; payload: { message: string; reason: ReportReason } }
  | { kind: 'upload_session'; payload: { sessionId: string } }; // Phase 2 only

type OutboxEntry = OutboxOp & {
  id: string;            // UUID, also the idempotency key
  createdAt: string;
  attempts: number;
  nextAttemptAt: string;
  lastError?: string;    // safe, user-facing text only
  state: 'pending' | 'in_flight' | 'failed';
};
```

- Enqueue: when `reportGeneratedMessage` fails with a **transient** error (see classification), the report is queued and the UI says "Report saved. It will be sent when you're back online." Today it only shows "Could not send report" (`live.tsx`).
- `clientId` is not stored per entry. The current `clientId` is read at send time, so after Delete Bolo data replaces the id, the outbox has already been cleared (see Privacy).
- Flush triggers, which need no new dependency:
  1. App hydrate.
  2. `AppState` → `active`.
  3. Any successful `post()` to the Bolo API, through a small hook in `bolo-api.ts` that tells the outbox "network is back".
  4. A foreground-only timer that fires at the next `nextAttemptAt`.

  Whether to add NetInfo for faster flushing is an open question.
- Concurrency: only one flush runs at a time, entries go in FIFO order, and each entry is marked `in_flight` before the request. At hydrate, any `in_flight` entry goes back to `pending`.

### 5. Retry, backoff, and error classification

- Transient errors (retry): only the two no-`status` failures `post()` uses for transport problems — `'Bolo is unavailable right now. Check your connection and try again.'` (network) and `'The request timed out. Check your connection and try again.'` (timeout) — plus status 408, 429, or 5xx. A missing `status` is not itself enough.
- Not transient, and not an offline-connection failure: every other `BoloApiError` with no `status`. That includes a caller abort in `post()` (`'The request was canceled.'`), `getBoloLiveApiUrl()` when the Live URL is missing or invalid (`'Live voice isn’t available right now. You can still type to Asha.'`), and `createLiveCall` rejecting the client payload (`'Bolo could not start this live voice session.'`). Do not enqueue these, and do not describe them as a lost internet connection.
- Permanent errors (mark `failed`, no retry): any other 4xx, response validation failure (`'Bolo returned an invalid response…'`, which does carry `status`), or a missing endpoint. Local validation and cancellation never enter the outbox, so they are not marked `failed` either.
- Backoff: `delay = min(15 min, 2 s × 2^attempts)` with full jitter. Give up after 8 attempts or 7 days, whichever comes first, and mark the entry `failed`. Failed entries stay visible, with Retry and Discard actions, until the learner acts or the retention window passes.
- A 429 with `Retry-After` is honored. `post()` does not expose headers today, so this needs a small change in `bolo-api.ts`. Otherwise 429 uses the normal backoff.

### 6. Conflict rules

- The device is the source of truth for everything in this spec. Sessions are append-only while `active` and immutable once `ended` or `interrupted`. Nothing is merged on the device.
- Progress, saved phrases, and streaks are already applied locally when they happen (`commit()` in `app-state.tsx`). They are never replayed from the outbox, so double-counting is impossible by design.
- Phase 2 upload is an idempotent upsert keyed by `(clientId, localSessionId)`. Re-sending the same record is a no-op on the server, and the server never sends data back, so the device needs no conflict resolution.
- `report_message` has no server idempotency today. A retry after a lost response can create a duplicate report. Options are listed under Open questions. The default proposal is to send the outbox `id` as an optional `reportId` that the server ignores until it supports dedupe.

### 7. Server/API changes

- **Phase 1: none.** The app writes the session log locally and retries existing endpoints from the outbox.
- **Phase 2 (proposal only; nothing like this exists today):** `POST /api/asha-sessions` on the main Bolo API, not the Live server, which `backend/README.md` scopes to SDP exchange.
  - Body: `{ clientId, sessionId, startedAt, endedAt, endReason, responseLanguage, mode?, lessonId?, rows: [{ speaker, text, startMs, endMs }], learnerTurns }`. Validate it as strictly as `/api/live-call` validates `context`. Return `{ stored: true }`.
  - `/api/delete-mobile-data` must also delete stored sessions for that `clientId`. The rate limiter gets a separate bucket.
  - The app sends Phase 2 uploads only if the learner opted in (see Privacy).

### 8. Privacy of audio and transcripts

- **No audio is captured or stored.** Live audio is WebRTC only, and the privacy copy says "Live voice does not create a recording file". This design keeps it that way.
- Transcripts are stored unencrypted in AsyncStorage, just like `chatHistory` today. Raising the on-device retention from "100 recent messages" to "up to 20 sessions or 30 days" must update the "Data stored on your device" copy in `src/app/privacy.tsx`.
- **Clear chat** (`resetChat` / `clearSavedChat` in `live.tsx`) clears `chatHistory` and every session record's `rows` (metadata may stay; open question). **Delete Bolo data** (`clearAllData` in `app-state.tsx`) removes `bolo-asha-sessions-v1` and `bolo-sync-outbox-v1`.
- **Withdrawing AI consent** stops outbox flushing, drops queued `upload_session` ops, and keeps local transcripts. That matches the current rule that "recent local chat history remain[s] available offline".
- Progress backup (`progress-backup.ts`) keeps excluding chat and session data.
- Phase 2 upload is a new kind of data collection. It needs a consent-copy change and an `AI_CONSENT_VERSION` bump (now 10 in `storage.ts`), or a separate opt-in toggle. It is off by default.
- The outbox never stores `clientId`, SDP, or server error bodies. `lastError` holds only the app's own user-facing message.

## UX states

| State | Trigger | What the learner sees |
|---|---|---|
| Offline, before start | `createLiveCall` fails while `connecting` because `post()` hit the network or timeout error in [Retry, backoff, and error classification](#5-retry-backoff-and-error-classification) | A clear message, "Live voice needs an internet connection. Lessons and saved phrases work offline.", with a link to today's lesson. A missing Live URL and a rejected client payload keep today's copy (`'Live voice isn’t available right now…'` and `'Bolo could not start this live voice session.'`). |
| Connecting | status `connecting` | No change. |
| Live | `ready` / `recording` / `responding` | No change. The transcript saves continuously in the background. |
| Interrupted | `endReason` is `connection_lost` or `backgrounded` | The transcript stays on screen with a small banner: "Connection lost. This conversation is saved on your device." Start again gives a new session. |
| Past sessions | Entry point on the Asha screen | A list of the last 20 sessions with date, length, language, lesson, and an "Interrupted" tag. Opening one shows a read-only transcript, and the existing Save-phrase sheet works on it. |
| Queued work | Outbox has entries | Each pending report shows "Waiting to send". After it is sent: "Report received". Failed: "Couldn't send. Retry / Discard". |
| Phase 2 sync | Opted in | A session row shows "Saved on device", "Syncing", "Synced", or "Couldn't sync". |

Every new string needs accessible labels in the existing style (see `__tests__/realtime-voice-accessibility.test.tsx`).

## Rollout and migration

1. Add a feature flag constant, `ashaSessionLogEnabled` in `src/lib/asha-session-log.ts`, following `floatingAshaEnabled` in `src/lib/floating-asha.ts`. Ship it on in preview builds first.
2. No migration of existing data. `bolo-chat-history` keeps its format and meaning. The first session after upgrade creates the log key. Existing `chatHistory` rows are not imported because they have no session boundaries. If Chris wants them kept, they can be imported once as one `legacy` record (open question).
3. Versioned keys (`-v1`) and a `schema` field let a later format change migrate or drop records safely through the sanitizer.
4. Update the privacy copy in the same release that turns the flag on. Phase 2 ships later behind its own flag after the server endpoint and consent change are reviewed.
5. Add a `CHANGELOG.md` entry under Unreleased → Added.
6. Run a device check following `docs/voice-acceptance.md`: airplane mode during a call, background during a call, force-quit during a call. Then confirm the session is saved as interrupted after relaunch.

## Testing plan

Use Jest (`jest-expo` preset, `npm test` = `jest --runInBand`) and follow the existing patterns:

- **Pure unit tests:**
  - `__tests__/asha-session-log.test.ts`: create, update, and finalize; row capping and trimming; the 20-session and 30-day limits, including that an empty `start_failed` attempt is not stored and does not evict an older session; sanitizer rejection of malformed or oversized records; `active` → `interrupted` at hydrate.
  - `__tests__/sync-outbox.test.ts`: FIFO order; error classification against real `BoloApiError` shapes from `bolo-api.ts` (network and timeout are transient; cancellation, a missing Live URL, and a rejected live-call payload are not); the backoff schedule with `jest.useFakeTimers()` and seeded jitter; the attempt and age caps; `in_flight` recovery; a single flush at a time.
  - Style follows `__tests__/live-transcripts.test.ts` and `__tests__/live-tools.test.ts`.
- **AsyncStorage:** mock it per file with `jest.mock('@react-native-async-storage/async-storage', …)`, as in `__tests__/app-state-persistence.test.ts` and `__tests__/app-state-clear-data.test.tsx`. Cover write failures with the user-visible alert path, like `reportPersistenceFailure`.
- **Hook and integration tests:**
  - Extend `__tests__/realtime-voice-shared-session.test.tsx`, `__tests__/floating-asha-session.test.tsx`, and `__tests__/live-runtime-regressions.test.tsx`. A session that receives transcript deltas and then gets `onClose` must leave an `interrupted` record whose rows match the last snapshot. A new connection must finalize the previous record before `clearChatHistory`. Only one owner writes per session.
  - `endReason` mapping gets one test per `disconnect` trigger.
  - Extend `__tests__/app-state-clear-data.test.tsx` so Delete Bolo data removes both new keys, and the chat-history tests so Clear chat clears session rows.
  - Extend `__tests__/live-tools.test.ts` so tool saves and progress are recorded on the active session.
- **Report queue UI:** extend `__tests__/live-runtime-regressions.test.tsx`, which already renders the Asha screen and exercises `reportGeneratedMessage`. Keep tests in `__tests__/`, because `jest.config.cjs` ignores test files under `src/app/`.
- **Coverage:** stay above the thresholds in `jest.config.cjs` (statements 86, branches 76, functions 83, lines 90).
- **E2E (optional):** a Maestro flow modeled on `01-first-launch-offline.yaml` that turns on airplane mode, opens Asha, and checks the offline-before-start message. Live calls can't run on Simulator (`06-simulator-voice-unsupported.yaml`), so interrupted-session checks stay a manual device step.
- Run `npm run verify` before the PR, with `BOLO_LIVE_API_URL=https://live.example.test` per `AGENTS.md`.

## Risks

- **AsyncStorage size.** Android's AsyncStorage has a default total size cap, and all app state shares it. Twenty sessions of 200 rows each could reach several MB. Mitigations: per-record trimming, a total-bytes check, and a fallback to `expo-file-system` JSON files if limits are hit.
- **Write amplification during calls.** Snapshots arrive on every transcript delta. The session log must coalesce writes like `replaceLiveChatSnapshot` does, or it competes with the `chatHistory` write queue and could cause jank on slow devices.
- **Two snapshot owners.** The Asha screen and the floating host both handle snapshots (`listenersRef` decides which). Getting this wrong means duplicate or missing rows.
- **Duplicate reports** from outbox retries until the server supports idempotency.
- **Privacy expectations.** Keeping more transcript history on the device, and especially uploading it in Phase 2, changes what the privacy page promises. The copy and consent must ship with the feature.
- **Live audio regressions.** Changes in `use-realtime-conversation.ts` touch the same file as the fragile iPhone microphone path (`AGENTS.md`). Keep the changes to callbacks only, and repeat the two-call device check from `AGENTS.md`.

## Open questions

1. **Does Chris want server sync at all (Phase 2)?** No session storage exists server-side today, and the Live session uses `store: false`. Should "sync" mean only "kept safely on the device and retried later", which is Phase 1, or also uploading transcripts? If uploads, should they be opt-in, and is a consent version bump OK?
2. **Who owns the main Bolo API** (`api-v2.appdeploy.ai/app/74e39779183cf78fed`)? Its source isn't in this repo. Can it get a new endpoint, a `reportId` idempotency key, and deletion of sessions in `/api/delete-mobile-data`?
3. **Retention:** are 20 sessions and 30 days right? Should Clear chat delete session metadata too, or only transcript rows?
4. **Past sessions UI:** in scope for the first build, or log-only first?
5. **NetInfo:** should the app add `@react-native-community/netinfo` for instant "back online" detection, or are app foreground and successful requests enough?
6. **Typed coaching offline:** should typed messages to Asha (`/api/mobile-chat`) also be queued offline and answered later? That is out of scope here, but it is the other main "Asha while offline" case.
7. **Legacy chat import:** should the existing `chatHistory` be imported once as a legacy session on upgrade?
8. **`create_session_recap`:** should the recap tool's output be stored on the session record as the session summary?

## Implementation tasks (for Claude Code)

Each task is one PR-sized unit on a `desk/` branch, with tests.

1. **Session log core.** Add `src/lib/asha-session-log.ts` with the types, sanitizer, limits, and a pure reducer (`start`, `updateRows`, `recordTool`, `finish`, `recoverActive`). Add `__tests__/asha-session-log.test.ts`. Don't touch any UI.
2. **Session log persistence.** Add a provider or module with a serialized AsyncStorage queue for `bolo-asha-sessions-v1`, coalesced writes, and crash recovery at hydrate. Wire Delete Bolo data and Clear chat to it. Add tests that mock AsyncStorage.
3. **Capture wiring.**
   - Add the `onSessionEvent` callback and `disconnect(reason)`, and keep the `sessionId` in `use-realtime-conversation.ts`.
   - Feed snapshots from `asha-voice-session.tsx` and `live.tsx`, respecting the single-owner rule.
   - Record tool outcomes in `use-asha-live-session.ts`.
   - Make sure the previous session is finalized before `clearChatHistory`.
   - Extend the shared-session, floating-session, and runtime-regression tests.
4. **Offline and interrupted UX.** Add the offline-before-start message, the interrupted banner, and accessibility labels. Update the privacy copy and CHANGELOG.
5. **Sync outbox.** Add `src/lib/sync-outbox.ts` with storage, classification, backoff, flush triggers, and the `bolo-api.ts` success hook. Move report failures into the queue and add queued, failed, and retry UI. Add `__tests__/sync-outbox.test.ts`.
6. **Past sessions screen** (if approved under Open question 4). Add a list and a read-only transcript that reuses the transcript phrase picker.
7. **Phase 2 (blocked on Open questions 1–2).** Add the client for `upload_session` behind a flag and opt-in. The server endpoint and deletion changes happen in the backend repo.
